Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "🚀 AI Subtitles - Mobile Testing Tunnel (Ngrok)" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "This script uses Ngrok to create a secure HTTPS tunnel to your local server (port 8000)."
Write-Host "Make sure you have Ngrok installed and authenticated!"
Write-Host ""
Write-Host "NOTE: Make sure your Uvicorn server is running first!" -ForegroundColor Red
Write-Host "Command: python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
Write-Host ""
Write-Host "Connecting to Ngrok... (Press Ctrl+C to stop)" -ForegroundColor Green

# Run Ngrok for port 8000 using npx
npx ngrok http 8000
