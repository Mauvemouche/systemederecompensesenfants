@echo off
REM Replica deploy helper for Windows.
REM Default CLI discovery timeout is 10s and often fails on Windows.
set FUNCTIONS_DISCOVERY_TIMEOUT=60
cd /d "%~dp0.."
firebase deploy %*
