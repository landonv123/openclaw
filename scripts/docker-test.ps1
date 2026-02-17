<#
.SYNOPSIS
Runs OpenClaw tests inside a Docker container.

.DESCRIPTION
Automates the process of building the test image and running specific test suites.
Mounts the local source code for live updates and access to .dev-data credentials.

.PARAMETER Suite
The test suite to run. Default: "fast" (unit tests).
Options: fast, e2e, coverage, build

.PARAMETER Rebuild
Forces a rebuild of the Docker image.

.PARAMETER Interactive
Drops into an interactive shell instead of running tests.
#>

param (
    [string]$Suite = "fast",
    [switch]$Rebuild,
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"

# Ensure .dev-data exists
if (-not (Test-Path ".dev-data")) {
    Write-Warning "No .dev-data directory found. Tests requiring auth may fail."
    Write-Warning "Run 'scripts/docker-onboard.ps1' to set up credentials."
    # Create empty dir to prevent mount errors
    New-Item -ItemType Directory -Path ".dev-data" | Out-Null
}

$ComposeFile = "docker-compose.test.yml"

if ($Rebuild) {
    Write-Host "Rebuilding Docker test image..." -ForegroundColor Cyan
    docker-compose -f $ComposeFile build --no-cache
}
Else {
    # Ensure image exists
    $ImageExists = docker images -q openclaw:test
    if (-not $ImageExists) {
        Write-Host "Building Docker test image..." -ForegroundColor Cyan
        docker-compose -f $ComposeFile build
    }
}

if ($Interactive) {
    Write-Host "Starting interactive shell..." -ForegroundColor Cyan
    docker-compose -f $ComposeFile run --rm --entrypoint /bin/bash openclaw-test
    exit $LASTEXITCODE
}

Write-Host "Running test suite: $Suite" -ForegroundColor Cyan

$Command = "pnpm test:$Suite"
if ($Suite -eq "build") {
    $Command = "pnpm build && pnpm test:fast"
}

# Run the test container
# We use 'run' instead of 'up' to get the exit code from the test command
try {
    docker-compose -f $ComposeFile run --rm openclaw-test /bin/bash -c "$Command"
    exit $LASTEXITCODE
}
catch {
    Write-Error "Docker execution failed: $_"
    exit 1
}
