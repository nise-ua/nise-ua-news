# VPS Setup — News Digest Pipeline

## Server Info
- **IP:** YOUR_VPS_IP
- **IPv6:** YOUR_VPS_IPV6
- **OS:** Ubuntu 24.04 (template: Ubuntu 24.04 with n8n)
- **Docker:** Installed (Docker Manager for Docker Compose)
- **Existing services:** n8n

## Access Model

### Deploy User (for CI/CD agent)
- **Username:** deploy-user
- **Auth:** SSH key (no password)
- **Home:** `/home/<deploy-user>/`
- **Project path:** `/srv/your-project/`
- **Permissions:**
  - Read/write to `/srv/your-project/` (code, .env, data/)
  - Limited sudo for Docker Compose only:
    ```
    <user> ALL=(ALL) NOPASSWD: /usr/bin/docker compose -f /srv/your-project/docker-compose.yml *
    ```
  - NO access to apt, systemctl, or other directories.
  - NO root/full sudo.

### Agent Access Requirements
| Path/Command | Access | Purpose |
|-------------|--------|---------|
| `/srv/your-project/` | Read/Write | Project files, code |
| `/srv/your-project/.env` | Read/Write | Secrets (API keys, tokens) |
| `/srv/your-project/data/` | Read/Write | SQLite database |
| `docker compose build` | Execute | Build container |
| `docker compose up -d` | Execute | Start/restart service |
| `docker compose down` | Execute | Stop service |
| `docker compose logs` | Execute | View logs |
| `docker compose ps` | Execute | Check status |

### Agent Restrictions
- No access to apt/dpkg (OS packages).
- No access to systemctl (system services).
- No access to other directories (/home, /etc, other projects).
- No root/full sudo.
- No firewall management (ufw).
- No SSL certificate management (handled by nginx/certbot separately).

## Deployment Flow

```
Developer pushes to GitHub (main branch)
    ↓
GitHub Actions triggered (paths: news-digest-pipeline/**)
    ↓
SSH into VPS as deploy user
    ↓
cd /opt/news-digest-pipeline
git pull origin main
cd news-digest-pipeline
docker compose build
docker compose up -d
docker compose ps
```

## Docker Architecture

```
Host (Ubuntu 24.04)
├── n8n (existing Docker container)
├── news-digest-pipeline (new Docker container)
│   ├── Node.js 20 Alpine
│   ├── Express API on port 3000
│   ├── SQLite at /app/data/news-digest.db
│   └── Prompt files mounted from host (read-only)
└── nginx (reverse proxy)
    ├── n8n.domain.com → n8n container
    └── news.domain.com → news-digest container
```

## Network / Domain
- **Domain:** YOUR_DOMAIN
- **DNS:** Cloudflare (A-record → YOUR_VPS_IP, DNS only)
- **HTTPS:** Let's Encrypt via certbot
- **Reverse proxy:** nginx on host
- **Port mapping:** host:3000 → container:3000 (internal, nginx forwards)

## Monitoring

Script: `scripts/monitor.sh` (runs as cron every 5 min)
- Checks: container running, /health responds, disk <90%, memory <90%
- Alerts: via ntfy.sh push notification

Cron setup (on VPS):
```
*/5 * * * * /srv/your-project/news-digest-pipeline/scripts/monitor.sh
```

## OS Updates
- Handled by system (unattended-upgrades), NOT by the deploy agent.
- Agent has no access to apt/system packages.

## Setup Checklist
- [ ] Create deploy user on VPS.
- [ ] Generate SSH key pair.
- [ ] Add public key to VPS deploy user.
- [ ] Add private key to GitHub Secrets (VPS_SSH_KEY).
- [ ] Add VPS_HOST and VPS_USER to GitHub Secrets.
- [ ] Create `/srv/your-project/` directory.
- [ ] Set ownership to deploy user.
- [ ] Clone repo to `/srv/your-project/`.
- [ ] Create `.env` with production secrets.
- [ ] Configure sudo for Docker Compose.
- [ ] Setup nginx reverse proxy.
- [ ] Setup SSL with certbot.
- [ ] Setup monitoring cron.
- [ ] Configure domain/subdomain.
- [ ] Test full deploy cycle.

## Decisions Log
| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-02 | Docker Compose deploy | VPS has Docker, project needs persistent SQLite. |
| 2026-04-02 | Dedicated deploy user | Security: agent should not have server-wide access. |
| 2026-04-02 | sudo only for docker compose | Minimal privilege: agent manages only its container. |
| 2026-04-02 | OS updates by system | Prevent accidental server breakage. |
| 2026-04-02 | SQLite (not PostgreSQL) | Small project, single-user, no need for separate DB. |
| 2026-04-02 | Ntfy.sh for notifications | Zero infrastructure, free, native iOS appearance. |
