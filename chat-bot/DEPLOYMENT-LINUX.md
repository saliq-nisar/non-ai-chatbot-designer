# Chat Bot — Linux Deployment Guide

Step-by-step production deployment of the Chat Bot app and its webhook worker on a Linux server (Ubuntu 22.04/24.04 or Debian 12; other distributions work with equivalent packages).

What you will run:

| Process | What it does | Instances |
|---|---|---|
| `chat-bot` | Web app (builder, chat pages, Web Chat script), REST API, flow engine | 1 (more possible, see §13) |
| `chat-bot-webhook-worker` | Sends queued chat messages to `CHAT_WEBHOOK_URL` | **Exactly 1** |

Plus: PostgreSQL (existing database can be reused), Redis, Nginx (HTTPS reverse proxy), PM2 (process manager).

```
Internet ──HTTPS──► Nginx :443 ──► chat-bot :3002 ──► PostgreSQL
                                        │
                                        └──► Redis ◄── chat-bot-webhook-worker ──► CHAT_WEBHOOK_URL
```

---

## 1. Prerequisites

- A Linux server with sudo access, 1 vCPU / 1 GB RAM minimum (2 GB recommended for building).
- A domain name pointing to the server (e.g. `chat.example.com`) — required for HTTPS.
- Outbound internet access (npm packages, webhook URL, Google/Stripe/SMTP if used).

### 1.1 Base packages

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential nginx
```

### 1.2 Node.js 22 (required — `>= 22`)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v22.x
npm -v
```

Use **npm only** (no Bun, pnpm or yarn).

### 1.3 PM2

```bash
sudo npm install -g pm2
```

### 1.4 Redis

```bash
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping    # PONG
```

Keep Redis private: in `/etc/redis/redis.conf` make sure `bind 127.0.0.1 -::1` and `protected-mode yes` are set (defaults on Ubuntu). If Redis runs on another host, set a password (`requirepass`) and use `redis://:password@host:6379` (or `rediss://` for TLS).

### 1.5 PostgreSQL

**Reusing the existing database** (the one the previous system used): nothing to install — just have its connection string ready. The app only adds missing tables; existing chat bots, results and credentials keep working.

**New database on this server:**

```bash
sudo apt-get install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE USER chatbot WITH PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE chatbot OWNER chatbot;
SQL
```

Tables are created automatically on first start.

---

## 2. Create a system user and folders

```bash
sudo useradd --system --create-home --home-dir /opt/chat-bot --shell /bin/bash chatbot
sudo mkdir -p /var/lib/chat-bot/uploads
sudo chown -R chatbot:chatbot /opt/chat-bot /var/lib/chat-bot
```

- `/opt/chat-bot/app` — the code
- `/var/lib/chat-bot/uploads` — uploaded files (Web Chat icons, visitor files). **Must survive redeploys and be backed up.**

All following commands run as that user unless shown with `sudo`:

```bash
sudo -iu chatbot
```

---

## 3. Get the code

Option A — git:

```bash
git clone <your-repo-url> /opt/chat-bot/repo
ln -s /opt/chat-bot/repo/chat-bot /opt/chat-bot/app
cd /opt/chat-bot/app
```

Option B — copy from a Windows machine (run on Windows, Git Bash):

```bash
rsync -avz --exclude node_modules --exclude dist --exclude .env --exclude uploads \
  /c/Users/<you>/new-chatbot/chat-bot/ chatbot@yourserver:/opt/chat-bot/app/
```

(or `scp -r`, excluding the same folders).

Never copy your local `.env` — create the production one in the next step.

---

## 4. Configure `.env`

```bash
cd /opt/chat-bot/app
cp .env.example .env
chmod 600 .env
nano .env
```

Generate secrets:

```bash
openssl rand -hex 32          # NEXTAUTH_SECRET, WIDGET_JWT_SECRET, API_TOKEN (64 chars)
openssl rand -hex 16          # ENCRYPTION_SECRET (exactly 32 chars)
```

Production values:

```dotenv
# --- Server ---
PORT=3002
CHAT_BOT_PUBLIC_URL=https://chat.example.com

# --- Database ---
DATABASE_URL=postgresql://chatbot:password@localhost:5432/chatbot

# --- Workspace ---
ADMIN_EMAIL=admin@example.com
CHAT_BOT_WORKSPACE_ID=

# --- Access ---
LOGIN_USERNAME=admin@example.com
LOGIN_PASSWORD=<strong password>
NEXTAUTH_SECRET=<openssl rand -hex 32>
API_TOKEN=<openssl rand -hex 32>

# --- Chat webhook (Redis + worker) ---
CHAT_WEBHOOK_URL=https://your-backend.example.com/api/v1/WebChat
REDIS_URL=redis://localhost:6379

# --- Web Chat integrations ---
SAVE_WEBCHAT_CONTACT_URL=https://your-backend.example.com/api/v1/WebChat/SaveWebChatContact
WIDGET_JWT_SECRET=<same value as on your Socket.IO server>
WIDGET_JWT_EXPIRES_IN=24h
NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST=https://your-socket-server.example.com

# --- Integration blocks ---
ENCRYPTION_SECRET=<exactly 32 characters>
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_SECURE=false
NEXT_PUBLIC_SMTP_FROM="Chat Bot <notifications@example.com>"
GOOGLE_SHEETS_CLIENT_ID=
GOOGLE_SHEETS_CLIENT_SECRET=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=

# --- Uploads ---
UPLOADS_DIR=/var/lib/chat-bot/uploads
NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE=10
```

Important:

- **Moving from the previous system?** Copy these values from its `.env` unchanged: `DATABASE_URL`, `ADMIN_EMAIL`, `ENCRYPTION_SECRET`, `WIDGET_JWT_SECRET`, `CHAT_WEBHOOK_URL`, `SAVE_WEBCHAT_CONTACT_URL`, `NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST`. A different `ENCRYPTION_SECRET` makes saved accounts (SMTP, Stripe, Google) unreadable; a different `WIDGET_JWT_SECRET` breaks live-agent messages.
- `ENCRYPTION_SECRET` must never change after accounts are saved. Store it in your password manager.
- `CHAT_BOT_PUBLIC_URL` must be the exact public `https://` address — it is used in the Web Chat install code, upload URLs, Google sign-in redirect and secure cookies.
- Leave `CHAT_WEBHOOK_URL` empty to disable the webhook (then the worker isn't needed).
- Both processes read `.env` from `/opt/chat-bot/app` (their working directory). Changing `.env` requires `pm2 restart all` — no rebuild.

---

## 5. Install and build

```bash
cd /opt/chat-bot/app
npm ci
npm run build
```

Build output:

- `dist/web` — app pages
- `dist/widget/web-chat.js` — Web Chat script
- `dist/node` — server and worker

`npm ci` installs dev dependencies too; they are needed for the build. Keep them (the build is re-run on each update).

Quick test (Ctrl+C to stop):

```bash
NODE_ENV=production npm start
# [server] Chat Bot app listening on http://localhost:3002
curl http://localhost:3002/health     # from a second terminal: {"status":"ok","workspaceId":"..."}
```

The first start creates missing tables and the workspace.

---

## 6. Run with PM2

The project includes `ecosystem.config.cjs` (both processes, `NODE_ENV=production`, one worker instance).

```bash
cd /opt/chat-bot/app
pm2 start ecosystem.config.cjs
pm2 save
pm2 list
```

Start on boot (run the `sudo ...` command it prints):

```bash
pm2 startup systemd -u chatbot --hp /opt/chat-bot
```

### Log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## 7. Nginx + HTTPS

Create `/etc/nginx/sites-available/chat-bot` (as root):

```nginx
server {
    listen 80;
    server_name chat.example.com;

    # Visitor file uploads (NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE) and imports.
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Overwrite (not append) so visitors can't fake their IP.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/chat-bot /etc/nginx/sites-enabled/chat-bot
sudo nginx -t && sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d chat.example.com --redirect
```

Notes:

- **Behind Cloudflare:** the app reads `CF-Connecting-IP` first, so visitor IPs are correct. Set SSL mode to *Full (strict)*.
- `client_max_body_size` must be at least the upload limit (+ a little).
- WebSockets are not needed by this app (live-agent sockets connect to your Socket.IO server directly).

---

## 8. Firewall

Only SSH and HTTP(S) are public. The app port (3002), Redis (6379) and PostgreSQL (5432) stay closed.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

If PostgreSQL is on another server, allow this server's IP there only.

---

## 9. External services

| Service | Setting |
|---|---|
| Your chat webhook backend | Must accept POSTs from this server's IP at `CHAT_WEBHOOK_URL`, and the chat bots' public IDs must be registered there (otherwise it answers `400` / `Bot does not exist`) |
| Live-agent Socket.IO server | Same `WIDGET_JWT_SECRET`; reachable from visitors' browsers at `NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST` (use `https://` when the site is HTTPS) |
| Google Cloud (Sheets / Gmail) | Authorized redirect URI: `https://chat.example.com/api/v1/credentials/oauth/callback` |
| Stripe | Live keys are added per account in the builder; test keys are used by the Test panel |
| SMTP | Allow outbound port 587/465 from the server |

---

## 10. Verify the deployment

```bash
curl https://chat.example.com/health
pm2 list                                   # both online, restarts not climbing
pm2 logs chat-bot --lines 50
pm2 logs chat-bot-webhook-worker --lines 50
```

Expected worker startup line:

```
[chatWebhookWorker] connected to Redis, consuming "chat-webhook" (concurrency=1)
```

Checklist:

1. Open `https://chat.example.com` → sign in with `LOGIN_USERNAME` / `LOGIN_PASSWORD`.
2. Existing chat bots are listed (when reusing the database).
3. Open a bot → **Test** works.
4. **Publish** → **Web Chat** → copy the install code into a test page → launcher appears and the chat runs.
5. Send a message in that Web Chat → worker log prints `job N sent`.
6. If live agent is configured: after the flow ends, type a message → it reaches the agent system; an agent reply appears in the chat.

---

## 11. Moving from the previous system (bot-node)

The new app uses the same database tables, the same `chat-webhook` Redis queue, the same webhook/contact payloads and the same live-agent token, and keeps the API paths (`/api/v1/typebots/{publicId}/startChat`, `/api/v1/sessions/{id}/continueChat`).

1. Back up the database (§14).
2. Deploy the new app (§2–§7) using the **same** `DATABASE_URL`, `ENCRYPTION_SECRET`, `WIDGET_JWT_SECRET` and integration URLs.
3. Stop the old processes — **never run two webhook workers on the same Redis queue** (messages would be split between them and delivered out of order):
   ```bash
   pm2 list                        # find the old app names
   pm2 stop <old-viewer> <old-builder> <old-webhook-worker>
   pm2 delete <old-viewer> <old-builder> <old-webhook-worker>
   pm2 save
   ```
4. Point the domain/Nginx to the new app.
5. **Websites already using the old embed code must switch to the new Web Chat code** (Builder → Web Chat → copy code):
   ```html
   <script src="https://chat.example.com/web-chat.js" data-chat-bot-id="PUBLIC_ID" async></script>
   ```
6. Conversations that were in progress in the old system can't be continued (visitors simply start a new chat). Results and published bots are kept.
7. Copy uploaded files the old system stored elsewhere if you still need them.

---

## 12. Updating

```bash
sudo -iu chatbot
cd /opt/chat-bot/repo && git pull          # or rsync new code (excluding .env, uploads, node_modules, dist)
cd /opt/chat-bot/app
npm ci
npm run build
pm2 restart chat-bot chat-bot-webhook-worker
pm2 logs --lines 30
```

- Database changes are applied automatically at startup (missing tables only).
- Queued webhook messages are kept in Redis during the restart; the worker continues where it stopped.
- For near-zero downtime with 2+ app instances use `pm2 reload chat-bot`.

Rollback: `git checkout <previous-tag>` → `npm ci && npm run build` → `pm2 restart all`.

---

## 13. Scaling (optional)

- **App:** several `chat-bot` instances can run (PM2 `instances: 2`, `exec_mode: "cluster"` for the `chat-bot` entry, or several servers behind a load balancer). Workspace seeding is lock-protected. With several **servers**, `UPLOADS_DIR` must be shared storage (NFS or similar) and all must use the same `.env` secrets.
- **Worker:** always **one** instance in total (strict message order).
- **Redis/PostgreSQL:** can be managed services; only the URLs change.

---

## 14. Backups

| What | How |
|---|---|
| Database | `pg_dump -Fc "$DATABASE_URL" > /var/backups/chat-bot/db-$(date +%F).dump` (daily cron) |
| Uploads | `tar czf /var/backups/chat-bot/uploads-$(date +%F).tgz -C /var/lib/chat-bot uploads` |
| `.env` | Store a copy in your password manager (especially `ENCRYPTION_SECRET`) |

Example cron (`crontab -e` as `chatbot`, with `/var/backups/chat-bot` owned by `chatbot`):

```cron
30 2 * * * set -a; . /opt/chat-bot/app/.env; set +a; pg_dump -Fc "$DATABASE_URL" > /var/backups/chat-bot/db-$(date +\%F).dump
45 2 * * * tar czf /var/backups/chat-bot/uploads-$(date +\%F).tgz -C /var/lib/chat-bot uploads
0  3 * * * find /var/backups/chat-bot -mtime +14 -delete
```

Restore: `pg_restore --clean -d "$DATABASE_URL" db-YYYY-MM-DD.dump`, extract uploads back, `pm2 restart all`.

Redis holds only the webhook queue — no backup needed.

---

## 15. Operations cheat sheet

```bash
pm2 list                                   # status
pm2 logs chat-bot                          # app log (live)
pm2 logs chat-bot-webhook-worker           # worker log (live)
pm2 logs chat-bot --err --lines 200        # errors only
pm2 restart chat-bot                       # restart app (e.g. after .env change)
pm2 restart chat-bot-webhook-worker        # restart worker
pm2 stop chat-bot-webhook-worker           # pause webhook delivery (messages wait in Redis)
pm2 monit                                  # CPU / memory
```

Log files: `/opt/chat-bot/.pm2/logs/`.

Queue size (waiting / failed jobs):

```bash
redis-cli LLEN bull:chat-webhook:wait
redis-cli ZCARD bull:chat-webhook:failed
```

---

## 16. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Missing required environment variable ...` in log | Set it in `/opt/chat-bot/app/.env`, `pm2 restart chat-bot` |
| App crashes at start with a database error | Wrong `DATABASE_URL`, PostgreSQL down, or firewall; test with `psql "$DATABASE_URL" -c 'select 1'` |
| `502 Bad Gateway` | App not running (`pm2 list`) or wrong port in Nginx |
| Sign-in works then logs out immediately | Opened over `http://` while `CHAT_BOT_PUBLIC_URL` is `https://` (secure cookie) — use HTTPS |
| Worker exits: `CHAT_WEBHOOK_URL is not set` | Set it, or don't start the worker when the webhook is disabled |
| Worker: `ECONNREFUSED 127.0.0.1:6379` | Redis not running: `sudo systemctl status redis-server` |
| Worker: `job N failed (attempt k): Webhook responded 400` | Your backend rejected the message (e.g. bot public ID not registered there). Check the backend with the `traceId`. Failed jobs retry 5× then stay in the failed list |
| Worker: `job N failed ... fetch failed` / timeout | Server can't reach `CHAT_WEBHOOK_URL` (DNS, firewall, TLS) — test with `curl -X POST <url>` |
| No webhook jobs at all | `CHAT_WEBHOOK_URL` empty on the **app**, Redis unreachable from the app (look for `[chatWebhook] failed to queue`), or the chat was the builder Test panel (never sent) |
| Contact not saved | `SAVE_WEBCHAT_CONTACT_URL` wrong/rejecting — app log shows `[webChatContact] responded with status ...` |
| Visitor IP is always the server/proxy IP | Nginx isn't setting `X-Forwarded-For` (see §7) |
| Agent replies don't appear in the Web Chat | `WIDGET_JWT_SECRET` differs from the Socket.IO server, or `NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST` wrong / `http://` on an HTTPS site (browser blocks it). Check the browser console |
| Web Chat launcher doesn't appear on a website | Wrong script `src`/public ID, bot unpublished, or site not in the bot's allowed origins |
| Uploads fail with `413` | Increase `client_max_body_size` in Nginx |
| Uploaded images/files missing after update | `UPLOADS_DIR` pointed inside the code folder — use `/var/lib/chat-bot/uploads` and restore from backup |
| Saved SMTP/Stripe/Google accounts fail after migration | `ENCRYPTION_SECRET` differs from the old system — restore the old value |
| Google **Connect** error | Client ID/secret missing, or redirect URI not added in Google Cloud (§9) |
| Build fails: out of memory | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| `pm2` processes gone after reboot | Re-run `pm2 startup systemd -u chatbot --hp /opt/chat-bot`, execute the printed command, then `pm2 save` |
