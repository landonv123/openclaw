<#
.SYNOPSIS
Safely runs the OpenClaw onboarding process inside a Docker container.

.DESCRIPTION
This script starts a Docker container with resource limits and interactive shell
to perform the OpenClaw onboarding process. It generates credentials in the
host's .dev-data directory.
#>

param (
  [switch]$Automated
)

$ErrorActionPreference = "Stop"

# Ensure .dev-data exists
if (-not (Test-Path ".dev-data")) {
  New-Item -ItemType Directory -Path ".dev-data" | Out-Null
  Write-Host "Created .dev-data directory." -ForegroundColor Green
}

# Add .gitignore to .dev-data if missing
if (-not (Test-Path ".dev-data/.gitignore")) {
  "*" | Out-File ".dev-data/.gitignore" -Encoding utf8
  Write-Host "Created .dev-data/.gitignore" -ForegroundColor Green
}

Write-Host "`n=== OpenClaw Docker Onboarding ===" -ForegroundColor Cyan
Write-Host "Starting safe environment with 4GB RAM / 2 CPU limit..." -ForegroundColor Gray

# Build image if needed (check if openclaw:test exists, or just build)
docker build -f Dockerfile.test -t openclaw:test .

Write-Host "`n[INSTRUCTIONS]" -ForegroundColor Yellow
Write-Host "1. You will be dropped into a container shell."
Write-Host "2. Run this command inside:"
Write-Host "   pnpm openclaw onboard --auth-choice openai-codex" -ForegroundColor White -BackgroundColor Black
Write-Host "3. Follow the URL in your browser."
Write-Host "4. Once success is reported, type 'exit' to close the container."
Write-Host "5. Credentials will be saved to .dev-data/ in your project."
Write-Host "`nStarting container..." -ForegroundColor Cyan

# Run container
if ($Automated) {
  # Non-interactive mode for automation/Antigravity
  # We remove -t so it doesn't fail on "input device is not a TTY"
  # We run the command directly
  docker run --rm -i --init --name openclaw-onboard-auto `
    --memory="4g" `
    --cpus="2" `
    -v "${PWD}/.dev-data:/home/node/.openclaw" `
    -v "${PWD}:/app" `
    -v /app/node_modules `
    -w /app `
    openclaw:test `
    pnpm openclaw onboard --auth-choice openai-codex --flow advanced --mode local --workspace /app
}
else {
  # Interactive mode for user
  docker run --rm -it `
    --name openclaw-onboard `
    --memory="4g" `
    --cpus="2" `
    -v "${PWD}/.dev-data:/home/node/.openclaw" `
    -v "${PWD}:/app" `
    -v /app/node_modules `
    -w /app `
    openclaw:test `
    /bin/bash
}

Write-Host "`nSession complete." -ForegroundColor Green
