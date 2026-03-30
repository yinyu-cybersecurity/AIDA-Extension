"""
WebSocket API endpoints for real-time communication
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websocket.manager import manager
from websocket.events import EventType, create_event
from services.ai_agent_service import agent_service
from utils.logger import get_logger
import json
import asyncio

logger = get_logger(__name__)
assessment_agent_locks: dict[int, asyncio.Lock] = {}


def get_assessment_agent_lock(assessment_id: int) -> asyncio.Lock:
    lock = assessment_agent_locks.get(assessment_id)
    if lock is None:
        lock = asyncio.Lock()
        assessment_agent_locks[assessment_id] = lock
    return lock


router = APIRouter()


@router.websocket("/ws")
async def websocket_global(websocket: WebSocket):
    """
    Global WebSocket endpoint - receives all events
    Use this when you want to listen to all system events
    """
    try:
        await manager.connect(websocket)

        # Send connection confirmation (with error handling)
        try:
            await manager.send_personal(
                websocket,
                create_event(EventType.CONNECTED, {"message": "Connected to global events"})
            )
            logger.info("Client connected to global WebSocket")
        except Exception as e:
            # Connection closed before we could send - this is fine
            logger.debug("Could not send connection message (client disconnected early)")
            manager.disconnect(websocket)
            return

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                message_type = message.get("type")

                # Handle ping/pong for connection health
                if message_type == "ping":
                    await manager.send_personal(
                        websocket,
                        create_event(EventType.PONG, {"message": "pong"})
                    )
                    logger.debug("Responded to ping")

                else:
                    logger.warning(
                        "Unknown WebSocket message type",
                        message_type=message_type
                    )

            except json.JSONDecodeError:
                logger.error("Invalid JSON received from WebSocket client")
                await manager.send_personal(
                    websocket,
                    create_event(
                        EventType.ERROR,
                        {"message": "Invalid JSON format"}
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Client disconnected from global WebSocket")

    except Exception as e:
        logger.error("WebSocket error", error=str(e), exc_info=True)
        manager.disconnect(websocket)


@router.websocket("/ws/assessment/{assessment_id}")
async def websocket_assessment(websocket: WebSocket, assessment_id: int):
    """
    Assessment-specific WebSocket endpoint
    Only receives events related to a specific assessment

    Args:
        assessment_id: The assessment ID to subscribe to
    """
    try:
        await manager.connect(websocket, assessment_id=assessment_id)

        # Send connection confirmation (with error handling)
        try:
            await manager.send_personal(
                websocket,
                create_event(
                    EventType.CONNECTED,
                    {
                        "message": f"Connected to assessment {assessment_id} events",
                        "assessment_id": assessment_id
                    },
                    assessment_id=assessment_id
                )
            )
            logger.info(
                "Client connected to assessment WebSocket",
                assessment_id=assessment_id
            )
        except Exception as e:
            # Connection closed before we could send - this is fine
            logger.debug(
                "Could not send connection message (client disconnected early)",
                assessment_id=assessment_id
            )
            manager.disconnect(websocket)
            return

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                message_type = message.get("type")

                # Handle ping/pong for connection health
                if message_type == "ping":
                    await manager.send_personal(
                        websocket,
                        create_event(EventType.PONG, {"message": "pong"})
                    )
                    logger.debug("Responded to ping", assessment_id=assessment_id)

                elif message_type == "agent_input":
                    user_input = message.get("input")
                    if user_input:
                        logger.info("Received agent input", assessment_id=assessment_id)
                        assessment_lock = get_assessment_agent_lock(assessment_id)
                        if assessment_lock.locked():
                            await manager.send_personal(
                                websocket,
                                create_event(
                                    EventType.AGENT_ERROR,
                                    {"message": "AI Agent is still processing the previous request.", "error": "AI Agent is busy"},
                                    assessment_id=assessment_id,
                                )
                            )
                            continue
                        # Start agent loop in a separate task to not block the WebSocket
                        asyncio.create_task(handle_agent_interaction(assessment_id, user_input))

                else:
                    logger.warning(
                        "Unknown WebSocket message type",
                        message_type=message_type,
                        assessment_id=assessment_id
                    )

            except json.JSONDecodeError:
                logger.error(
                    "Invalid JSON received from WebSocket client",
                    assessment_id=assessment_id
                )
                await manager.send_personal(
                    websocket,
                    create_event(
                        EventType.ERROR,
                        {"message": "Invalid JSON format"}
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(
            "Client disconnected from assessment WebSocket",
            assessment_id=assessment_id
        )

    except Exception as e:
        logger.error(
            "WebSocket error",
            error=str(e),
            assessment_id=assessment_id,
            exc_info=True
        )
        manager.disconnect(websocket)

async def handle_agent_interaction(assessment_id: int, user_input: str):
    """Handle AI Agent interaction and broadcast events"""
    lock = get_assessment_agent_lock(assessment_id)
    async with lock:
        try:
            async for event in agent_service.run_agent_loop(assessment_id, user_input):
                await manager.broadcast(event, assessment_id=assessment_id)
        except Exception as e:
            logger.error(f"Agent loop error: {e}", assessment_id=assessment_id, exc_info=True)
            await manager.broadcast(
                create_event(
                    EventType.AGENT_ERROR,
                    {"message": f"AI Agent error: {str(e)}", "error": str(e)},
                    assessment_id=assessment_id,
                ),
                assessment_id=assessment_id
            )
