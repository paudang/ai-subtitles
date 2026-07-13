$ScriptPath = $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path (Split-Path $ScriptPath)

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "🚀 AI Subtitles - One-Click Start (Server + Tunnel)" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Starting Uvicorn Server in a new window..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit -Command `"cd '$ProjectRoot'; python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`""

Write-Host "Waiting 10 seconds for AI models to load..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "2. Starting Ngrok Tunnel in a new window..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit -Command `"cd '$ProjectRoot'; .\deploy\start_ngrok.ps1`""

Write-Host ""
Write-Host "✅ Done! You should now see two new PowerShell windows:" -ForegroundColor Cyan
Write-Host "  - Window 1: Uvicorn Server Logs (Keep this open to monitor the AI)"
Write-Host "  - Window 2: Ngrok URL (Copy the HTTPS link to your phone)"
Write-Host ""
Write-Host "Press any key to exit this launcher..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
