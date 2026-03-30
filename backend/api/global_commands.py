"""
Legacy global commands router.

The canonical implementation now lives in api.commands.global_router.
This module re-exports that router to avoid breaking imports during the cleanup.
"""
from api.commands import global_router as router
