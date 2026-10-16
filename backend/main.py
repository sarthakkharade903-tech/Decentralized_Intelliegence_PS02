"""
NeuroScope-3D FastAPI Backend Entry Point
-----------------------------------------
Architecture: docs/ARCHITECTURE.md
API Contract: POST /api/v1/segment/predict

IMPORTANT: This is a research prototype only.
Never present model outputs as clinical diagnoses.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NeuroScope-3D API",
    description=(
        "Research & Teaching Prototype Only. "
        "Must never present model output as a diagnosis. "
        "Uses public, de-identified research data only."
    ),
    version="0.1.0",
)

# Allow the Vite dev server (port 5173) to talk to the backend (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
async def health_check():
    """Simple liveness probe for the backend service."""
    return {
        "status": "online",
        "disclaimer": (
            "Research & Teaching Prototype Only. "
            "Not a certified medical diagnostic device."
        ),
    }


# Routers will be registered here as they are built (Phase 1, 2, 3)
# from backend.routers import segment
# app.include_router(segment.router, prefix="/api/v1")
