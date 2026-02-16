---
description: Deploy openclaw to Mac Mini from this dev machine
---

# Deploy to Mac Mini

## Prerequisites
- SSH access to the Mac Mini (e.g., `ssh macmini` or `ssh user@<MAC_MINI_IP>`)
- Node.js ≥22 and pnpm installed on Mac Mini
- The repo cloned on Mac Mini (e.g., `~/openclaw`)
- `~/.openclaw/openclaw.json` configured from `openclaw.config.example.json`

## Steps

1. Push latest changes from this machine:
```bash
git add -A && git commit -m "update" && git push
```

2. SSH into the Mac Mini and pull:
```bash
ssh macmini "cd ~/openclaw && git pull"
```

3. Install dependencies and build:
```bash
ssh macmini "cd ~/openclaw && pnpm install && pnpm build"
```

4. Restart the gateway:
```bash
ssh macmini "cd ~/openclaw && pnpm openclaw gateway restart"
```

## Verify

- Check gateway is running: `curl http://<MAC_MINI_IP>:18789/health`
- Check vLLM is reachable from Mac Mini: `curl http://<GAMING_PC_IP>:8010/v1/models`
