from fastapi import APIRouter

from app.routes.chat import router as chat_router
from app.routes.signup import router as signup_router
from app.routes.usage import router as usage_router

api_router = APIRouter()
api_router.include_router(signup_router)
api_router.include_router(chat_router)
api_router.include_router(usage_router)
