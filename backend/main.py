"""NeuroScope-3D FastAPI Backend Entry Point
-----------------------------------------
Re-exports the verified FastAPI application from backend.app.main.
Provides compatibility for both `uvicorn backend.main:app` and `uvicorn backend.app.main:app`.
"""

from backend.app.main import app

__all__ = ["app"]
