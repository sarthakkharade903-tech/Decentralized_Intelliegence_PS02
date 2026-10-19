@echo off
echo =======================================================
echo Stopping NeuroVault Local Backend & Tunnel Services
echo =======================================================
echo.
echo Terminating any running python, uvicorn, ngrok, or cloudflared processes...
taskkill /F /IM ngrok.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul
taskkill /F /IM uvicorn.exe 2>nul
wmic process where "commandline like '%%backend.app.main:app%%'" delete 2>nul

echo.
echo [OK] All local inference and tunnel processes have been stopped.
echo GPU VRAM is now released and cooling to idle.
echo.
echo Current NVIDIA GPU Status:
nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader
echo.
echo Your laptop can now operate silently with zero background GPU load.
pause
