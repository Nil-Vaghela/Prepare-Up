from fastapi import APIRouter

router = APIRouter(tags=["dashboard"])

@router.get("/dashboard")
def dashboard():
    return {"message": "Dashboard API is live"}