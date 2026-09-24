@echo off
echo ========================================================
echo   Starting AQUORA (Flask Backend + Vite Frontend)
echo ========================================================

start "AQUORA Backend (Port 5000)" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe app.py"
start "AQUORA Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Services launched!
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:5000
