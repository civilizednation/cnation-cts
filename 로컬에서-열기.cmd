@echo off
cd /d "%~dp0"
title Cnation Book - Local Server

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js or open the deployed Vercel address instead.
  pause
  exit /b 1
)

node scripts\local-server.js
