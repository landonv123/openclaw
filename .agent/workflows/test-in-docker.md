---
description: Run OpenClaw tests inside a safe Docker container
---

1. Ensure Docker Desktop is running.
2. Run the test script in PowerShell:
// turbo
   ./scripts/docker-test.ps1 -Suite fast

If you need to onboard first (for OAuth credentials):
   ./scripts/docker-onboard.ps1

For interactive shell:
   ./scripts/docker-test.ps1 -Interactive
