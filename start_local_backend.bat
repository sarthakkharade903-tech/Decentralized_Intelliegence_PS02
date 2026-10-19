@echo off
echo =======================================================
echo Starting NeuroVault Local Backend (FastAPI on Port 8000)
echo =======================================================
echo.
echo Target device: NVIDIA RTX 3050 (AMP FP16)
echo To stop the server at any time, close this window or run stop_local_services.bat.
echo.
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
pause
