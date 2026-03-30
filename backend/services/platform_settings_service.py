"""
Platform settings access helpers.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from config import settings
from models.platform_settings import PlatformSettings

DEFAULT_OUTPUT_MAX_LENGTH = 5000
DEFAULT_COMMAND_HISTORY_LIMIT = 10
DEFAULT_TOTAL_UPLOAD_MB = 500
_COMMAND_TIMEOUT_KEYS = ("command_timeout", "command_timeout_seconds")

_PLATFORM_SETTING_DEFAULTS = {
    "command_timeout": {
        "value": lambda: str(settings.COMMAND_TIMEOUT),
        "description": "Maximum execution time for commands in seconds",
    },
    "output_max_length": {
        "value": lambda: str(DEFAULT_OUTPUT_MAX_LENGTH),
        "description": "Maximum length of command output before truncation (-1 for unlimited)",
    },
    "python_exec_output_max_length": {
        "value": lambda: str(DEFAULT_OUTPUT_MAX_LENGTH),
        "description": "Maximum length of python_exec output before truncation (-1 for unlimited)",
    },
    "http_request_output_max_length": {
        "value": lambda: str(DEFAULT_OUTPUT_MAX_LENGTH),
        "description": "Maximum length of http_request output before truncation (-1 for unlimited)",
    },
    "command_history_limit": {
        "value": lambda: str(DEFAULT_COMMAND_HISTORY_LIMIT),
        "description": "Number of recent commands to include in load_assessment (range: 5-100)",
    },
    "max_context_file_size": {
        "value": lambda: str(settings.MAX_CONTEXT_FILE_SIZE // (1024 * 1024)),
        "description": "Maximum size (MB) for a single file uploaded to /context",
    },
    "max_source_zip_size": {
        "value": lambda: str(settings.MAX_SOURCE_ZIP_SIZE // (1024 * 1024)),
        "description": "Maximum size (MB) for a source-code ZIP uploaded to /source",
    },
    "container_name": {
        "value": lambda: settings.DEFAULT_CONTAINER_NAME,
        "description": "Selected pentesting container name",
    },
}


def _resolve_default_value(key: str) -> Optional[str]:
    definition = _PLATFORM_SETTING_DEFAULTS.get(key)
    if not definition:
        return None

    value = definition["value"]
    resolved = value() if callable(value) else value
    return str(resolved) if resolved is not None else None



def get_default_setting_description(key: str) -> Optional[str]:
    definition = _PLATFORM_SETTING_DEFAULTS.get(key)
    if not definition:
        return None
    return definition.get("description")



def get_platform_setting_value(db: Session, key: str) -> Optional[str]:
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    return setting.value if setting else None


async def get_platform_setting_value_async(db: AsyncSession, key: str) -> Optional[str]:
    result = await db.execute(
        select(PlatformSettings).filter(PlatformSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None



def get_platform_setting_payload(db: Session, key: str) -> Optional[dict]:
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    if setting:
        return {
            "key": setting.key,
            "value": setting.value,
            "description": setting.description,
        }

    default_value = _resolve_default_value(key)
    if default_value is None:
        return None

    return {
        "key": key,
        "value": default_value,
        "description": get_default_setting_description(key),
    }



def upsert_platform_setting(
    db: Session,
    key: str,
    value: str,
    description: Optional[str] = None,
) -> PlatformSettings:
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    resolved_description = description

    if setting and resolved_description is None:
        resolved_description = setting.description
    if resolved_description is None:
        resolved_description = get_default_setting_description(key)
    if resolved_description is None:
        resolved_description = f"Setting for {key}"

    if setting:
        setting.value = value
        setting.description = resolved_description
    else:
        setting = PlatformSettings(
            key=key,
            value=value,
            description=resolved_description,
        )
        db.add(setting)

    db.commit()
    db.refresh(setting)
    return setting



def get_container_name(db: Session) -> str:
    container_name = get_platform_setting_value(db, "container_name")
    return container_name or settings.DEFAULT_CONTAINER_NAME



def resolve_container_name(container_name: Optional[str], db: Session) -> str:
    return container_name or get_container_name(db)


async def get_container_name_async(db: AsyncSession) -> str:
    container_name = await get_platform_setting_value_async(db, "container_name")
    return container_name or settings.DEFAULT_CONTAINER_NAME


async def get_command_timeout_async(db: AsyncSession) -> int:
    result = await db.execute(
        select(PlatformSettings).filter(PlatformSettings.key.in_(_COMMAND_TIMEOUT_KEYS))
    )
    timeout_settings = {
        setting.key: setting.value
        for setting in result.scalars().all()
    }

    for key in _COMMAND_TIMEOUT_KEYS:
        value = timeout_settings.get(key)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue

    return settings.COMMAND_TIMEOUT



def get_upload_limits_bytes(db: Session) -> tuple[int, int, int]:
    default_context_mb = settings.MAX_CONTEXT_FILE_SIZE // (1024 * 1024)
    default_source_mb = settings.MAX_SOURCE_ZIP_SIZE // (1024 * 1024)

    def _read_mb(key: str, default_mb: int) -> int:
        value = get_platform_setting_value(db, key)
        try:
            return int(value) if value is not None else default_mb
        except (TypeError, ValueError):
            return default_mb

    max_context_mb = _read_mb("max_context_file_size", default_context_mb)
    max_source_mb = _read_mb("max_source_zip_size", default_source_mb)

    return (
        max_context_mb * 1024 * 1024,
        max_source_mb * 1024 * 1024,
        DEFAULT_TOTAL_UPLOAD_MB * 1024 * 1024,
    )
