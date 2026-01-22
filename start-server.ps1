# Start Employee Camera Hours Dashboard Server on Port 3010
# This script handles UNC paths properly

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Employee Camera Hours Dashboard" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Working directory: $ScriptDir" -ForegroundColor Yellow

# Change to the script directory (PowerShell handles UNC paths)
Set-Location $ScriptDir

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Set the PORT environment variable
$env:PORT = "3010"

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Starting server on port 3010..." -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Once started, open your browser to:" -ForegroundColor Yellow
Write-Host "http://localhost:3010" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start the server
node playwright-server.js

# If we get here, the server stopped
Write-Host ""
Write-Host "Server stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"



