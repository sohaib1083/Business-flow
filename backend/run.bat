@echo off
REM Start the BusinessFlow backend on Windows.
REM Uses --http h11 to avoid the Python 3.12 / httptools binary issue.
cd /d "%~dp0"
python -m uvicorn app.main:app --reload --port 8000 --host 127.0.0.1 --http h11 --loop asyncio
