@echo off
cd /d "%~dp0"
echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --disable-pip-version-check
echo.
echo Iniciando VisionGate...
echo   Login:     http://localhost:8000
echo   Camera:    http://localhost:8000/camera
echo   Dashboard: http://localhost:8000/dashboard
echo.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul
".venv\Scripts\python.exe" -m uvicorn api:app --port 8000
pause
