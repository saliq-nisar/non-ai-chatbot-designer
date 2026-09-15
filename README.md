# Non-AI Chat Bot Designer

A self-hosted, visual chat bot builder with a fast chat runtime and an embeddable Web Chat, with **no AI or LLM**. Bots follow the flows you draw: messages, questions, conditions, integrations and a hand-off to human agents.

- **Visual builder:** drag-and-drop flow canvas with bubbles, inputs, logic, integrations and events.
- **Chat runtime:** a flow engine on the server, plus one chat UI used by the test panel, the share page and the Web Chat.
- **No-code Web Chat designer:** a live preview, a custom launcher icon (image upload), colors, header, greeting and auto-open.
- **Live agent hand-off:** visitor messages go to your backend through a webhook queue, and agent replies are pushed into the open chat over Socket.IO.
- **Built-in templates:** lead generation, lead scoring, product recommendation, insurance offer, customer support, FAQ, NPS survey and onboarding.
- **Lightweight stack:** Node.js + PostgreSQL + Redis, React + Vite, no framework server, and a Web Chat script of about 3 KB gzipped.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Embedding the Web Chat](#embedding-the-web-chat)
- [API](#api)
- [Live agent hand-off](#live-agent-hand-off)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## Features

### Builder

| Category | Blocks |
|---|---|
| **Bubbles** | Text (rich text), image, video, audio, embed |
| **Inputs** | Text, number, email, website, phone, date, time, buttons (single/multiple), picture choice, rating, **file upload**, **payment (Stripe)**, **cards** |
| **Logic** | Set variable, condition, redirect, wait, jump, return, A/B test, code (runs in the browser), chat bot link |
| **Integrations** | HTTP request, send email (SMTP), Gmail, Google Sheets, Zapier, Make.com, Pabbly, Google Analytics, Meta Pixel, Chatwoot |
| **Events** | Start, reply, invalid reply, command |

- Every block has a visual editor, and connections update automatically when blocks are moved or deleted.
- Theme, settings and variables editors are included, along with manual save with conflict detection, and publish/unpublish.
- Chat bots can be imported from JSON exports (version 6 / 6.1), or created from the built-in templates.
- Integration accounts (SMTP, Stripe, Google) are stored encrypted with AES-GCM, and Google accounts connect through OAuth sign-in.

### Chat runtime

- The server runs the whole flow: reply validation, retries, events, jumps and returns, linked bots, and integrations.
- Conversations are saved to PostgreSQL with protection against two replies being saved at the same time.
- Every chat message is queued in Redis and delivered in order by a separate worker.
- The test panel runs chats that aren't recorded, send no webhooks or emails, and show execution logs.

### Web Chat

- Styled from the builder with a real-time preview: position, size, shape, colors, icon image, window size, header, greeting bubble and auto-open.
- Design changes take effect on live websites without changing the embed code.
- The launcher is isolated in Shadow DOM, the chat iframe loads only on first open, the chat goes full screen on phones, and allowed origins are enforced.

---

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js 22 (`http`), TypeScript, `pg`, BullMQ |
| Web app | React 19, Vite 7 |
| Web Chat script | Vanilla TypeScript (IIFE bundle) |
| Database | PostgreSQL |
| Queue | Redis |
| Process manager | PM2 (production) |

Package manager: **npm**.

---

## Quick start

### Requirements

- Node.js **22+**
- PostgreSQL
- Redis, only needed for the chat webhook

### Install and run

```bash
git clone https://github.com/saliq-nisar/non-ai-chatbot-designer.git
cd non-ai-chatbot-designer/chat-bot

npm install
cp .env.example .env
```

Edit `.env` and set at least these:

```dotenv
DATABASE_URL=postgresql://postgres:password@localhost:5432/chatbot
ADMIN_EMAIL=admin@example.com
LOGIN_USERNAME=admin@example.com
LOGIN_PASSWORD=change-me
NEXTAUTH_SECRET=<at least 32 random characters>
API_TOKEN=<random token>
ENCRYPTION_SECRET=<exactly 32 characters>
```

Start the app:

```bash
npm run dev
```

Open **http://localhost:3002** and sign in. On first start the app creates any missing tables and a workspace automatically.

To deliver chat messages to your webhook, start Redis and run the worker in a second terminal:

```bash
npm run dev:worker
```

---

## Scripts

Run these inside `chat-bot/`.

| Command | Description |
|---|---|
| `npm run dev` | App with hot reload (Vite + server auto-restart) on `PORT` (default 3002) |
| `npm run dev:worker` | Webhook worker with auto-restart |
| `npm run build` | Production build: web app, Web Chat script, server and worker |
| `npm start` | Run the built app |
| `npm run start:worker` | Run the built worker |
| `npm run typecheck` | TypeScript check |
| `npm run mock:live-agent` | Local mock of the live-agent system, for testing the hand-off |

---

## Configuration

All settings are environment variables in `chat-bot/.env`. See [`.env.example`](chat-bot/.env.example) for the full, commented list.

| Group | Variables |
|---|---|
| Server | `PORT`, `CHAT_BOT_PUBLIC_URL` |
| Database / workspace | `DATABASE_URL`, `ADMIN_EMAIL`, `CHAT_BOT_WORKSPACE_ID` |
| Access | `LOGIN_USERNAME`, `LOGIN_PASSWORD`, `NEXTAUTH_SECRET`, `API_TOKEN` |
| Webhook queue | `CHAT_WEBHOOK_URL`, `REDIS_URL` |
| Web Chat integrations | `SAVE_WEBCHAT_CONTACT_URL`, `WIDGET_JWT_SECRET`, `WIDGET_JWT_EXPIRES_IN`, `NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST` |
| Integration blocks | `ENCRYPTION_SECRET`, `SMTP_*`, `NEXT_PUBLIC_SMTP_FROM`, `GOOGLE_SHEETS_CLIENT_ID/SECRET`, `GMAIL_CLIENT_ID/SECRET` |
| Uploads | `UPLOADS_DIR`, `NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE` |

> Never commit `.env`. Once accounts have been saved, don't change `ENCRYPTION_SECRET`, or they can no longer be decrypted.

---

## Embedding the Web Chat

1. Publish the chat bot.
2. In the builder, open **Web Chat** and design the launcher and window with the live preview.
3. Copy the install code and paste it before `</body>` on your website:

```html
<script src="https://chat.example.com/web-chat.js" data-chat-bot-id="YOUR_PUBLIC_ID" async></script>
```

You can also control it from JavaScript:

```js
window.ChatBotWebChat.open();
window.ChatBotWebChat.close();
window.ChatBotWebChat.toggle();
```

---

## API

REST, JSON, base path `/api/v1`. Management endpoints require the sign-in cookie or `Authorization: Bearer <API_TOKEN>`. Chat endpoints are public.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/typebots?workspaceId=` | List chat bots |
| POST | `/typebots` | Create |
| GET / PATCH / DELETE | `/typebots/{id}` | Get / update / delete |
| POST | `/typebots/{id}/publish` · `/unpublish` | Publish / unpublish |
| GET | `/typebots/{id}/publishedTypebot` | Published version |
| POST | `/typebots/import` | Import JSON export |
| POST | `/typebots/{publicId}/startChat` | Start a conversation |
| POST | `/sessions/{sessionId}/continueChat` | Send a reply |
| POST | `/sessions/{sessionId}/liveAgentMessage` | Visitor message to a live agent |
| GET | `/typebots/{publicId}/webChat` | Web Chat design |

Paths and JSON keys keep the `typebot` naming so existing clients stay compatible. Full list: [CHAT_BOT.md § API endpoints](chat-bot/CHAT_BOT.md#5-api-endpoints).

```bash
curl -X POST http://localhost:3002/api/v1/typebots/my-bot-abc1234/startChat \
  -H "Content-Type: application/json" -d '{}'
```

---

## Live agent hand-off

```
Visitor ─► Web Chat ─► startChat / continueChat / liveAgentMessage
                              │
                              ▼
                        Redis queue ─► worker ─► CHAT_WEBHOOK_URL (your backend / agent dashboard)
                                                        │
Visitor ◄─ Web Chat ◄─ Socket.IO "receiveMessage" ◄─────┘  (room:{resultId}_web, token signed with WIDGET_JWT_SECRET)
```

- **Webhook payload:** `{ ip, message, isUser, date, time, timestamp, sessionId?, resultId?, publicId?, isBotActivated }`.
- **Free-text mode:** when the flow ends, or an agent message arrives, the chat shows a free-text box.

To test locally without your agent system, see the steps in [CHAT_BOT.md](chat-bot/CHAT_BOT.md) (`npm run mock:live-agent`).

---

## Project structure

```
chat-bot/
├─ server/        HTTP server, REST API, flow engine, database access, integrations
├─ worker/        Chat webhook worker (Redis → CHAT_WEBHOOK_URL)
├─ shared/        Types and contracts shared by server, worker, web and widget
├─ web/           React app: list, builder, Web Chat designer, chat viewer, templates
├─ widget/        Embeddable Web Chat script
├─ scripts/       Dev tools (live-agent mock)
├─ CHAT_BOT.md            Full technical documentation
├─ DEPLOYMENT-LINUX.md    Production deployment guide
└─ ecosystem.config.cjs   PM2 configuration
```

---

## Deployment

In short:

```bash
cd chat-bot
npm ci
npm run build
pm2 start ecosystem.config.cjs     # chat-bot + chat-bot-webhook-worker
pm2 save
```

Put Nginx with HTTPS in front of port 3002, run **exactly one** worker, and keep `UPLOADS_DIR` on persistent storage.

Step-by-step guide covering Node, Redis, PostgreSQL, PM2, Nginx, TLS, firewall, backups and troubleshooting: **[DEPLOYMENT-LINUX.md](chat-bot/DEPLOYMENT-LINUX.md)**.

---

## Documentation

- [CHAT_BOT.md](chat-bot/CHAT_BOT.md): architecture, API, flow engine rules, Web Chat, worker, Redis, customization, troubleshooting
- [DEPLOYMENT-LINUX.md](chat-bot/DEPLOYMENT-LINUX.md): production deployment on Linux
- [.env.example](chat-bot/.env.example): all configuration options
