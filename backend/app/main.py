from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.health import router as health_router
from app.api.hello import router as hello_router
from app.api.dahsboard import router as dashboard_router
from app.api.upload import router as upload_router

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(hello_router)
app.include_router(dashboard_router)

app.include_router(upload_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}