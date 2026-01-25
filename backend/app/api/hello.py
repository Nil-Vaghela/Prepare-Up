from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["demo"])

@router.get("/hello")
def hello():
    return{
        "message":"Hello from FastAPI",
        "utc_time":datetime.now(timezone.utc).isoformat()
    }