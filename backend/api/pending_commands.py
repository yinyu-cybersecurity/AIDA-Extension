"""
Pending Commands and Command Settings API endpoints
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from database import get_async_db, get_db
from models import Assessment, PendingCommand, PlatformSettings
from schemas.command import HttpRequestRequest
from schemas.pending_command import (
    CommandSettingsResponse,
    CommandSettingsUpdate,
    KeywordAdd,
    PendingCommandApprove,
    PendingCommandReject,
    PendingCommandResponse,
    PendingCommandsListResponse,
)
from services.container_service import ContainerService
from websocket.events import (
    event_command_approved,
    event_command_pending_approval,
    event_command_rejected,
    event_command_settings_updated,
    event_command_timeout,
)
from websocket.manager import manager

router = APIRouter(prefix="/pending-commands", tags=["pending-commands"])
settings_router = APIRouter(prefix="/command-settings", tags=["command-settings"])

# Default settings
DEFAULT_EXECUTION_MODE = "open"
DEFAULT_FILTER_KEYWORDS = ["rm", "delete", "drop", "truncate", "sudo", "chmod", "chown", "mkfs", "dd", "format"]
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_HTTP_METHOD_RULES = {}

COMMAND_EXECUTION_MODE_KEY = "command_execution_mode"
COMMAND_FILTER_KEYWORDS_KEY = "command_filter_keywords"
COMMAND_APPROVAL_TIMEOUT_KEY = "command_approval_timeout_seconds"
LEGACY_COMMAND_TIMEOUT_KEY = "command_timeout_seconds"
COMMAND_HTTP_METHOD_RULES_KEY = "command_http_method_rules"
COMMAND_SETTINGS_KEYS = (
    COMMAND_EXECUTION_MODE_KEY,
    COMMAND_FILTER_KEYWORDS_KEY,
    COMMAND_APPROVAL_TIMEOUT_KEY,
    LEGACY_COMMAND_TIMEOUT_KEY,
    COMMAND_HTTP_METHOD_RULES_KEY,
)


# ========== Helper Functions ==========


def _load_json_setting(value: Optional[str], default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default



def _parse_timeout_setting(settings_map: dict[str, str]) -> int:
    for key in (COMMAND_APPROVAL_TIMEOUT_KEY, LEGACY_COMMAND_TIMEOUT_KEY):
        value = settings_map.get(key)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return DEFAULT_TIMEOUT_SECONDS



def _build_command_settings(rows) -> dict:
    settings_map = {row.key: row.value for row in rows}
    return {
        "execution_mode": settings_map.get(COMMAND_EXECUTION_MODE_KEY, DEFAULT_EXECUTION_MODE),
        "filter_keywords": _load_json_setting(
            settings_map.get(COMMAND_FILTER_KEYWORDS_KEY),
            DEFAULT_FILTER_KEYWORDS,
        ),
        "timeout_seconds": _parse_timeout_setting(settings_map),
        "http_method_rules": _load_json_setting(
            settings_map.get(COMMAND_HTTP_METHOD_RULES_KEY),
            DEFAULT_HTTP_METHOD_RULES,
        ),
    }



def get_command_settings(db: Session) -> dict:
    """Get current command settings from platform_settings."""
    rows = db.query(PlatformSettings).filter(
        PlatformSettings.key.in_(COMMAND_SETTINGS_KEYS)
    ).all()
    return _build_command_settings(rows)


async def get_command_settings_async(db: AsyncSession) -> dict:
    """Async variant for command settings retrieval."""
    result = await db.execute(
        select(PlatformSettings).filter(PlatformSettings.key.in_(COMMAND_SETTINGS_KEYS))
    )
    return _build_command_settings(result.scalars().all())



def set_command_setting(db: Session, key: str, value: str, description: str = None):
    """Set a command setting in platform_settings."""
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    if setting:
        setting.value = value
        if description is not None:
            setting.description = description
    else:
        setting = PlatformSettings(key=key, value=value, description=description)
        db.add(setting)
    db.commit()
    return setting



def _normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value



def _resolve_command_timeout(cmd: PendingCommand, default_timeout_seconds: int) -> int:
    return cmd.timeout_seconds if cmd.timeout_seconds is not None else default_timeout_seconds



def _is_command_expired(
    cmd: PendingCommand,
    default_timeout_seconds: int,
    now: Optional[datetime] = None,
) -> bool:
    created_at = _normalize_datetime(cmd.created_at)
    if created_at is None:
        return False

    current_time = now or datetime.utcnow()
    timeout_seconds = _resolve_command_timeout(cmd, default_timeout_seconds)
    return (current_time - created_at).total_seconds() > timeout_seconds



def _mark_command_timed_out(
    cmd: PendingCommand,
    default_timeout_seconds: int,
    now: Optional[datetime] = None,
):
    current_time = now or datetime.utcnow()
    timeout_seconds = _resolve_command_timeout(cmd, default_timeout_seconds)
    cmd.status = "timeout"
    cmd.resolved_at = current_time
    cmd.rejection_reason = f"Auto-cancelled: exceeded {timeout_seconds}s timeout"



def sweep_expired_commands(db: Session) -> list[dict]:
    """Explicitly mark expired pending commands as timeout."""
    current_time = datetime.utcnow()
    default_timeout_seconds = get_command_settings(db).get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)

    pending_commands = db.query(PendingCommand).filter(
        PendingCommand.status == "pending"
    ).all()

    timed_out_commands = []
    for cmd in pending_commands:
        if not _is_command_expired(cmd, default_timeout_seconds, current_time):
            continue

        _mark_command_timed_out(cmd, default_timeout_seconds, current_time)
        timed_out_commands.append({
            "command_id": cmd.id,
            "assessment_id": cmd.assessment_id,
        })

    if timed_out_commands:
        db.commit()

    return timed_out_commands


async def broadcast_timeout_events(timed_out_commands: list[dict]):
    for timed_out_command in timed_out_commands:
        await manager.broadcast(
            event_command_timeout(
                timed_out_command.get("assessment_id"),
                timed_out_command,
            ),
            assessment_id=timed_out_command.get("assessment_id"),
        )



def build_pending_command_response(
    cmd: PendingCommand,
    assessment_name: Optional[str] = None,
) -> PendingCommandResponse:
    resolved_assessment_name = assessment_name
    if resolved_assessment_name is None and getattr(cmd, "assessment", None):
        resolved_assessment_name = cmd.assessment.name

    return PendingCommandResponse(
        id=cmd.id,
        assessment_id=cmd.assessment_id,
        command=cmd.command,
        phase=cmd.phase,
        matched_keywords=cmd.matched_keywords or [],
        status=cmd.status,
        resolved_by=cmd.resolved_by,
        rejection_reason=cmd.rejection_reason,
        resolved_at=cmd.resolved_at,
        execution_result=cmd.execution_result,
        created_at=cmd.created_at,
        timeout_seconds=cmd.timeout_seconds,
        assessment_name=resolved_assessment_name,
    )


async def get_assessment_name_async(db: AsyncSession, assessment_id: int) -> Optional[str]:
    result = await db.execute(
        select(Assessment.name).filter(Assessment.id == assessment_id)
    )
    return result.scalar_one_or_none()


async def ensure_pending_command_is_actionable(db: AsyncSession, pending_cmd: PendingCommand):
    if pending_cmd.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Command is already {pending_cmd.status}",
        )

    settings_data = None
    if pending_cmd.timeout_seconds is None:
        settings_data = await get_command_settings_async(db)

    default_timeout_seconds = (
        pending_cmd.timeout_seconds
        if pending_cmd.timeout_seconds is not None
        else (settings_data or {}).get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)
    )

    if not _is_command_expired(pending_cmd, default_timeout_seconds):
        return

    _mark_command_timed_out(pending_cmd, default_timeout_seconds)
    await db.commit()
    await db.refresh(pending_cmd)

    await manager.broadcast(
        event_command_timeout(
            pending_cmd.assessment_id,
            {
                "command_id": pending_cmd.id,
                "assessment_id": pending_cmd.assessment_id,
            },
        ),
        assessment_id=pending_cmd.assessment_id,
    )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Command is already timeout",
    )


# ========== Command Settings Routes ==========

@settings_router.get("", response_model=CommandSettingsResponse)
async def get_settings(db: Session = Depends(get_db)):
    """Get current command execution settings."""
    try:
        return CommandSettingsResponse(**get_command_settings(db))
    except Exception:
        return CommandSettingsResponse(
            execution_mode=DEFAULT_EXECUTION_MODE,
            filter_keywords=DEFAULT_FILTER_KEYWORDS,
            timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
            http_method_rules=DEFAULT_HTTP_METHOD_RULES,
        )


@settings_router.put("", response_model=CommandSettingsResponse)
async def update_settings(
    update: CommandSettingsUpdate,
    db: Session = Depends(get_db),
):
    """Update command execution settings."""
    if update.execution_mode:
        if update.execution_mode not in ["open", "filter", "closed"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="execution_mode must be 'open', 'filter', or 'closed'",
            )
        set_command_setting(
            db,
            COMMAND_EXECUTION_MODE_KEY,
            update.execution_mode,
            "Command execution mode: open, filter, or closed",
        )

    if update.filter_keywords is not None:
        set_command_setting(
            db,
            COMMAND_FILTER_KEYWORDS_KEY,
            json.dumps(update.filter_keywords),
            "Keywords that trigger approval in filter mode",
        )

    if update.timeout_seconds is not None:
        set_command_setting(
            db,
            COMMAND_APPROVAL_TIMEOUT_KEY,
            str(update.timeout_seconds),
            "Timeout in seconds for pending command approval",
        )

    if update.http_method_rules is not None:
        valid_actions = {"auto_approve", "require_approval", "inherit"}
        for method, action in update.http_method_rules.items():
            if action not in valid_actions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid action '{action}' for method {method}. Must be one of: {', '.join(valid_actions)}",
                )
        set_command_setting(
            db,
            COMMAND_HTTP_METHOD_RULES_KEY,
            json.dumps(update.http_method_rules),
            "Per-HTTP-method approval rules: auto_approve, require_approval, or inherit",
        )

    current_settings = get_command_settings(db)
    await manager.broadcast(event_command_settings_updated(current_settings))

    return CommandSettingsResponse(**current_settings)


@settings_router.post("/keywords", response_model=CommandSettingsResponse)
async def add_keyword(
    keyword_data: KeywordAdd,
    db: Session = Depends(get_db),
):
    """Add a keyword to the filter list."""
    current_settings = get_command_settings(db)
    keywords = current_settings["filter_keywords"]

    keyword = keyword_data.keyword.strip().lower()
    if keyword and keyword not in keywords:
        keywords.append(keyword)
        set_command_setting(
            db,
            COMMAND_FILTER_KEYWORDS_KEY,
            json.dumps(keywords),
            "Keywords that trigger approval in filter mode",
        )

    return CommandSettingsResponse(**get_command_settings(db))


@settings_router.delete("/keywords/{keyword}", response_model=CommandSettingsResponse)
async def remove_keyword(
    keyword: str,
    db: Session = Depends(get_db),
):
    """Remove a keyword from the filter list."""
    current_settings = get_command_settings(db)
    keywords = current_settings["filter_keywords"]

    keyword = keyword.strip().lower()
    if keyword in keywords:
        keywords.remove(keyword)
        set_command_setting(
            db,
            COMMAND_FILTER_KEYWORDS_KEY,
            json.dumps(keywords),
            "Keywords that trigger approval in filter mode",
        )

    return CommandSettingsResponse(**get_command_settings(db))


# ========== Pending Commands Routes ==========

@router.post("/sweep-timeouts")
async def sweep_pending_command_timeouts(db: Session = Depends(get_db)):
    """Explicitly sweep expired pending commands and emit timeout events."""
    timed_out_commands = sweep_expired_commands(db)
    await broadcast_timeout_events(timed_out_commands)
    return {"timed_out": len(timed_out_commands)}


@router.get("", response_model=PendingCommandsListResponse)
async def list_pending_commands(
    status_filter: Optional[str] = None,
    assessment_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """List pending commands with optional filters."""
    query = db.query(PendingCommand).join(Assessment)

    if status_filter:
        query = query.filter(PendingCommand.status == status_filter)

    if assessment_id:
        query = query.filter(PendingCommand.assessment_id == assessment_id)

    commands = query.order_by(PendingCommand.created_at.desc()).all()
    pending_count = db.query(PendingCommand).filter(
        PendingCommand.status == "pending"
    ).count()

    result = [
        build_pending_command_response(
            cmd,
            assessment_name=cmd.assessment.name if cmd.assessment else None,
        )
        for cmd in commands
    ]

    return PendingCommandsListResponse(
        commands=result,
        total=len(result),
        pending_count=pending_count,
    )


@router.get("/count")
async def get_pending_count(db: Session = Depends(get_db)):
    """Get count of pending commands for notification badge."""
    count = db.query(PendingCommand).filter(
        PendingCommand.status == "pending"
    ).count()
    return {"pending_count": count}


@router.get("/{command_id}", response_model=PendingCommandResponse)
async def get_pending_command(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Get a single pending command by ID for polling status."""
    cmd = db.query(PendingCommand).filter(PendingCommand.id == command_id).first()

    if not cmd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pending command {command_id} not found",
        )

    assessment = db.query(Assessment).filter(Assessment.id == cmd.assessment_id).first()
    return build_pending_command_response(
        cmd,
        assessment_name=assessment.name if assessment else None,
    )


@router.post("/{command_id}/approve", response_model=PendingCommandResponse)
async def approve_command(
    command_id: int,
    approval: PendingCommandApprove,
    db: AsyncSession = Depends(get_async_db),
):
    """Approve and execute a pending command."""
    result = await db.execute(
        select(PendingCommand).filter(PendingCommand.id == command_id)
    )
    pending_cmd = result.scalar_one_or_none()

    if not pending_cmd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pending command {command_id} not found",
        )

    await ensure_pending_command_is_actionable(db, pending_cmd)

    container_service = ContainerService()
    if pending_cmd.command_type == "python":
        exec_result = await container_service.execute_and_log_python(
            assessment_id=pending_cmd.assessment_id,
            code=pending_cmd.command,
            phase=pending_cmd.phase,
            db=db,
        )
    elif pending_cmd.command_type == "http":
        http_params_dict = json.loads(pending_cmd.command)
        http_params = HttpRequestRequest(**http_params_dict)
        exec_result = await container_service.execute_and_log_http_request(
            assessment_id=pending_cmd.assessment_id,
            params=http_params,
            db=db,
        )
    else:
        exec_result = await container_service.execute_and_log_command(
            assessment_id=pending_cmd.assessment_id,
            command=pending_cmd.command,
            phase=pending_cmd.phase,
            db=db,
        )

    pending_cmd.status = "executed"
    pending_cmd.resolved_by = approval.approved_by
    pending_cmd.resolved_at = datetime.utcnow()
    pending_cmd.execution_result = {
        "stdout": exec_result.stdout,
        "stderr": exec_result.stderr,
        "returncode": exec_result.returncode,
        "success": exec_result.success,
    }

    await db.commit()
    await db.refresh(pending_cmd)

    await manager.broadcast(
        event_command_approved(
            pending_cmd.assessment_id,
            {
                "command_id": command_id,
                "assessment_id": pending_cmd.assessment_id,
                "result": pending_cmd.execution_result,
            },
        ),
        assessment_id=pending_cmd.assessment_id,
    )

    assessment_name = await get_assessment_name_async(db, pending_cmd.assessment_id)
    return build_pending_command_response(
        pending_cmd,
        assessment_name=assessment_name,
    )


@router.post("/{command_id}/reject", response_model=PendingCommandResponse)
async def reject_command(
    command_id: int,
    rejection: PendingCommandReject,
    db: AsyncSession = Depends(get_async_db),
):
    """Reject a pending command."""
    result = await db.execute(
        select(PendingCommand).filter(PendingCommand.id == command_id)
    )
    pending_cmd = result.scalar_one_or_none()

    if not pending_cmd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pending command {command_id} not found",
        )

    await ensure_pending_command_is_actionable(db, pending_cmd)

    pending_cmd.status = "rejected"
    pending_cmd.resolved_by = rejection.rejected_by
    pending_cmd.rejection_reason = rejection.rejection_reason
    pending_cmd.resolved_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pending_cmd)

    await manager.broadcast(
        event_command_rejected(
            pending_cmd.assessment_id,
            {
                "command_id": command_id,
                "assessment_id": pending_cmd.assessment_id,
                "reason": rejection.rejection_reason,
            },
        ),
        assessment_id=pending_cmd.assessment_id,
    )

    assessment_name = await get_assessment_name_async(db, pending_cmd.assessment_id)
    return build_pending_command_response(
        pending_cmd,
        assessment_name=assessment_name,
    )


@router.delete("/{command_id}")
async def delete_pending_command(
    command_id: int,
    db: Session = Depends(get_db),
):
    """Delete a pending command."""
    cmd = db.query(PendingCommand).filter(PendingCommand.id == command_id).first()

    if not cmd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pending command {command_id} not found",
        )

    db.delete(cmd)
    db.commit()

    return {"message": f"Pending command {command_id} deleted"}


@router.post("/create", response_model=PendingCommandResponse)
async def create_pending_command(
    command_data: dict,
    db: Session = Depends(get_db),
):
    """Create a pending command (used by MCP handler)."""
    assessment_id = command_data.get("assessment_id")

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} not found",
        )

    current_settings = get_command_settings(db)
    timeout_seconds = current_settings.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)

    pending_cmd = PendingCommand(
        assessment_id=assessment_id,
        command=command_data.get("command"),
        phase=command_data.get("phase"),
        matched_keywords=command_data.get("matched_keywords", []),
        status="pending",
        timeout_seconds=timeout_seconds,
        command_type=command_data.get("command_type", "shell"),
    )

    db.add(pending_cmd)
    db.commit()
    db.refresh(pending_cmd)

    await manager.broadcast(
        event_command_pending_approval(
            {
                "id": pending_cmd.id,
                "assessment_id": assessment_id,
                "command": pending_cmd.command,
                "matched_keywords": pending_cmd.matched_keywords,
                "assessment_name": assessment.name,
                "created_at": pending_cmd.created_at.isoformat() if pending_cmd.created_at else None,
                "timeout_seconds": pending_cmd.timeout_seconds,
            }
        )
    )

    return build_pending_command_response(
        pending_cmd,
        assessment_name=assessment.name,
    )
