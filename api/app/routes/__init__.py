from fastapi import APIRouter

from app.routes.admin import router as admin_router
from app.routes.chat import router as chat_router
from app.routes.final_submission import router as final_submission_router
from app.routes.shared_image import router as shared_image_router
from app.routes.signup import router as signup_router
from app.routes.usage import router as usage_router

api_router = APIRouter()
api_router.include_router(signup_router)
api_router.include_router(chat_router)
api_router.include_router(usage_router)
api_router.include_router(admin_router)
api_router.include_router(final_submission_router)
api_router.include_router(shared_image_router)
