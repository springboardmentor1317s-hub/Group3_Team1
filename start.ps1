$ErrorActionPreference = "Stop"

Write-Host "Starting Campus Event Hub..." -ForegroundColor Green

# Start Backend
Write-Host "[1/2] Starting Backend on port 5000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Rohit sahu\Desktop\demoPages\Group3_Team1\backend'; node server.js"

Start-Sleep -Seconds 3

# Start Frontend
Write-Host "[2/2] Starting Frontend on port 4200..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Rohit sahu\Desktop\demoPages\Group3_Team1'; npm start"

Write-Host "`nDone! Servers are starting..." -ForegroundColor Green
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:4200" -ForegroundColor Yellow
