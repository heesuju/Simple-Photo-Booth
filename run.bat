@echo off
setlocal

:: Ensure we are in the script's directory
cd /d "%~dp0"

echo Checking for virtual environment...
set FIRST_RUN=0
if not exist ".venv" (
    echo .venv not found. Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo Failed to create virtual environment. Please check your Python installation.
        pause
        exit /b 1
    )
    echo Virtual environment created.
    set FIRST_RUN=1
) else (
    echo .venv found.
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo Failed to activate virtual environment.
    pause
    exit /b 1
)

if %FIRST_RUN%==1 (
    echo First run detected. Installing requirements...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo Failed to install requirements.
        pause
        exit /b 1
    )
)

echo.
echo Reading configuration...
set APP_PORT=8000
if exist config.json (
    for /f "delims=" %%i in ('python -c "import json; print(json.load(open('config.json')).get('port', 8000))"') do set APP_PORT=%%i
)

echo App Port is %APP_PORT%

echo.
echo Checking for ngrok...
where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    echo Ngrok is available. Starting ngrok http %APP_PORT% in a new window...
    start "Ngrok Tunnel" ngrok http %APP_PORT%
) else (
    echo Ngrok is not available in PATH. Skipping ngrok start.
)

echo.
echo Starting FastAPI Server...
python app.py

pause
