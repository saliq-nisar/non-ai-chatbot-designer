# Chat Bot

A flow-based chat bot system in one standalone Node.js project (npm): a visual **builder** with templates, a **chat runtime** (API + flow engine), a no-code **Web Chat designer** with an embeddable script, integration blocks, a live-agent hand-off, and a **webhook worker**. There is no AI or LLM feature: bots reply only from the flow you draw.

---

## 1. Architecture

```
Browser app (React)                          Websites
 ├─ Chat Bots list + templates                └─ <script src=".../web-chat.js" data-chat-bot-id=…>
 ├─ Builder (canvas, editors, Test panel)            ├─ GET /api/v1/typebots/:publicId/webChat  (design)
 └─ Web Chat designer (live preview)                 └─ iframe /chat/:publicId  → start/continue chat
                     │                                              │
                     ▼                                              ▼
        Chat Bot server (Node, one process) ─────────────────────────────────────
         ├─ /api/v1/typebots…            management API (sign-in or API token)
         ├─ /api/v1/credentials…         integration accounts + Google sign-in
         ├─ /api/v1/…/startChat, /continueChat, /liveAgentMessage, /files   (public)
         ├─ flow engine (server/engine)  ── services ──► HTTP requests, SMTP, Gmail,
         │                                              Google Sheets, Stripe
         ├─ /web-chat.js, /files/…, SPA pages, /auth/login
         └─ startup: create missing tables → seed workspace → listen
                │                         │                        │
                ▼                         ▼                        ▼
            PostgreSQL          Redis queue "chat-webhook"     UPLOADS_DIR (disk)
                                          │
                                          ▼
                              Webhook worker ──► CHAT_WEBHOOK_URL
```

- **One chat UI** (`ChatViewer`) serves the Test panel, the chat page and the Web Chat iframe; **one engine** (server) runs every conversation.
- **The engine has no I/O** (`server/engine`). Integration blocks and payment intents go through injected services (`server/integrations/engineServices.ts`).
- **Same database** as the previous system: existing chat bots, published versions, results and credentials keep working.

## 2. Project structure

```
chat-bot/
├─ server/
│  ├─ index.ts                 HTTP entry: routing, CORS, auth, static files, uploads, startup
│  ├─ config.ts                every environment variable
│  ├─ workspace.ts             workspace seeding
│  ├─ session.ts, jwt.ts       sign-in cookie, API token, signed tokens
│  ├─ http.ts                  JSON/body/route helpers, public URL
│  ├─ api/
│  │  ├─ routes.ts             every /api/v1 route + auth flag
│  │  ├─ chatBotApi.ts         chat bots: list/get/create/update/delete/publish/unpublish/published/import/assets
│  │  ├─ chatApi.ts            startChat, continueChat, liveAgentMessage, webChat design
│  │  ├─ credentialsApi.ts     accounts, Google OAuth, spreadsheet sheets
│  │  └─ filesApi.ts           visitor uploads (file input) and /files serving
│  ├─ engine/                  flow engine (no I/O)
│  │  ├─ flow.ts               groups/blocks, replies, events, links, jump/return, continuations
│  │  ├─ inputs.ts             input formatting + reply validation (all input types)
│  │  ├─ logic.ts              logic blocks + browser scripts (Code, Google Analytics, Pixel, Chatwoot)
│  │  ├─ bubbles.ts            bubble messages, text for webhooks/transcripts
│  │  ├─ conditions.ts         comparison operators
│  │  ├─ variables.ts, state.ts, types.ts
│  ├─ db/                      PostgreSQL (pg): database, ensureSchema, chatBots, conversations, credentials
│  └─ integrations/
│     ├─ engineServices.ts     dispatch of integration blocks / input preparation
│     ├─ httpRequest.ts        HTTP request, Zapier, Make.com, Pabbly (SSRF-guarded)
│     ├─ email.ts              SMTP email, Gmail
│     ├─ googleSheets.ts, googleAuth.ts
│     ├─ stripe.ts             payment intents
│     ├─ chatWebhook.ts        queue producer (BullMQ)
│     ├─ webChatContact.ts, liveAgent.ts, clientIp.ts
├─ worker/chatWebhookWorker.ts
├─ shared/                     types.ts, webChat.ts (design + defaults), redis.ts, createId.ts, publicId.ts
├─ web/
│  ├─ api/                     http.ts, chatBotApi.ts, chatApi.ts, credentialsApi.ts, types.ts
│  ├─ theme/                   app.css (app/builder tokens), chatAppearance.ts (chat look)
│  ├─ templates/               built-in templates (JSON) + index.ts
│  ├─ pages/                   list, builder, chat, login
│  └─ components/chat-bot/
│     ├─ list/                 cards, create (templates) and import dialogs
│     ├─ builder/              toolbar, palette, canvas/, inspector/, blocks/ (registry + editors), state/, webChat/ (designer)
│     ├─ runtime/              chatSession.ts, client actions, live agent socket, timing
│     ├─ viewer/               ChatViewer, messages, bubbles, inputs/ (incl. file, payment, cards, live-agent box)
│     └─ shared/
├─ widget/webChat.ts           embeddable script
└─ .env.example, ecosystem.config.cjs, package.json, vite*.config.ts, tsconfig*.json
```

## 3. Environment variables

Copy `.env.example` to `.env`. Server and worker read `.env` from the directory they start in; existing environment variables win.

| Variable | Used by | Required | Description |
|---|---|---|---|
| `PORT` | server | no (3002) | HTTP port |
| `CHAT_BOT_PUBLIC_URL` | server | recommended | Public URL of the app (Web Chat code, upload URLs, Google redirect, secure cookies) |
| `DATABASE_URL` | server | **yes** | PostgreSQL |
| `ADMIN_EMAIL` | server | **yes** | Owner of the seeded workspace |
| `CHAT_BOT_WORKSPACE_ID` | server | no | Pin the workspace |
| `LOGIN_USERNAME` / `LOGIN_PASSWORD` | server | **yes** (or `ADMIN_EMAIL`/`ADMIN_PASSWORD`) | App sign-in |
| `NEXTAUTH_SECRET` | server | **yes** (≥ 32) | Signs sign-in cookies and OAuth state |
| `API_TOKEN` | server | **yes** | Bearer token for other systems |
| `ENCRYPTION_SECRET` | server | for integrations (32 chars) | Encrypts saved accounts. Never change it afterwards |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_IGNORE_TLS`, `SMTP_AUTH_DISABLED`, `NEXT_PUBLIC_SMTP_FROM` | server | for the "Default" email account | Default SMTP server |
| `GOOGLE_SHEETS_CLIENT_ID` / `_SECRET` | server | for Google Sheets | Google OAuth client |
| `GMAIL_CLIENT_ID` / `_SECRET` | server | for Gmail | Google OAuth client |
| `UPLOADS_DIR` | server | no (`uploads`) | Uploaded files folder (keep it on persistent storage) |
| `NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE` | server | no (10) | Max visitor file size, MB |
| `CHAT_WEBHOOK_URL` | server, worker | worker: **yes** | Where chat messages are POSTed; empty on the server = not queued |
| `REDIS_URL` | server, worker | no | Queue connection |
| `SAVE_WEBCHAT_CONTACT_URL` | server | no | Contact save on Web Chat start |
| `WIDGET_JWT_SECRET`, `WIDGET_JWT_EXPIRES_IN`, `NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST` | server | no | Live-agent socket |
| `PUBLIC_IP_LOOKUP_URL` | server | no | Public IP for LAN visitors |

## 4. Workspace seeding

Runs on every start before listening (`server/workspace.ts`):

```
CREATE TABLE IF NOT EXISTS …            (fresh database only)
BEGIN + pg_advisory_xact_lock           (other starting instances wait)
  admin user (ADMIN_EMAIL) missing? → create
  CHAT_BOT_WORKSPACE_ID set? → must exist → use it
  admin has a workspace? → use the oldest
  otherwise → create "My workspace"
COMMIT → listen
```

Idempotent, deployment-safe with several instances, stable ID (stored in the database). `/health` returns the workspace ID.

## 5. API endpoints

Base `/api/v1`, JSON, errors `{ "message" }`. ✔ = sign-in cookie **or** `Authorization: Bearer <API_TOKEN>`. Paths and keys containing `typebot` are the existing contract.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/typebots?workspaceId=` | ✔ | List chat bots |
| GET | `/typebots/{id}` | ✔ | Get chat bot |
| POST | `/typebots` | ✔ | Create `{ workspaceId, typebot }` |
| PATCH | `/typebots/{id}` | ✔ | Update `{ typebot, overwrite? }` (409 on newer version) |
| DELETE | `/typebots/{id}` | ✔ | Delete (archive) |
| GET | `/typebots/{id}/publishedTypebot` | ✔ | Published version or `null` |
| POST | `/typebots/{id}/publish` | ✔ | Publish |
| POST | `/typebots/{id}/unpublish` | ✔ | Unpublish |
| POST | `/typebots/import` | ✔ | Import a version 6/6.1 export |
| POST | `/typebots/{id}/assets?fileName=` | ✔ | Upload an image (raw body, ≤ 2 MB) → `{ url }` |
| POST | `/typebots/{publicId}/startChat` | – | Start `{ message?, prefilledVariables?, textBubbleContentFormat? }` |
| POST | `/sessions/{sessionId}/continueChat` | – | Reply `{ message?: "text" \| {type:"text",text} \| {type:"command",command} }` |
| POST | `/sessions/{sessionId}/liveAgentMessage` | – | Free-text visitor message for the live agent `{ message }` |
| POST | `/sessions/{sessionId}/files?fileName=` | – | Upload for the current file input (raw body) → `{ url }` |
| GET | `/typebots/{publicId}/webChat` | – | Web Chat design `{ config }` |
| GET | `/credentials?workspaceId=&type=` | ✔ | Accounts (`smtp`, `stripe`, `google sheets`, `gmail`), no secrets |
| POST | `/credentials` | ✔ | Save SMTP/Stripe `{ workspaceId, type, name, data }` |
| DELETE | `/credentials/{id}?workspaceId=` | ✔ | Remove |
| GET | `/credentials/oauth/{google-sheets\|gmail}/authorize?workspaceId=&returnTo=` | ✔ | Google sign-in (redirect) |
| GET | `/credentials/oauth/callback` | ✔ | Google redirects here |
| GET | `/credentials/{id}/google-sheets/{spreadsheetId}/sheets?workspaceId=` | ✔ | Sheets and columns |

## 6. Chat Bot CRUD & templates

| Action | In the app | API |
|---|---|---|
| List | Home | `GET /typebots` |
| Create blank | **Create chat bot → Start from scratch** | `POST /typebots` |
| Create from template | **Create chat bot → pick a template** | `POST /typebots/import` with the template JSON |
| Edit / save | Builder, **Save** or Ctrl/⌘+S (manual save, conflict detection) | `PATCH` |
| Delete | **Delete** + confirmation | `DELETE` |
| Import | **Import** (JSON export v6) | `POST /typebots/import` |

Built-in templates (`web/templates`): Lead Generation, Lead Scoring, Product Recommendation, Insurance Offer, Customer Support, FAQ, NPS Survey, User Onboarding. Add one: drop an export JSON in the folder and add an entry to `web/templates/index.ts`.

## 7. Publishing / 8. Unpublishing

**Publish** sets a public ID if missing (`<name>-<last 7 of id>`), saves, publishes, then reads the published state from the API. Saving a published bot updates its published version. **Unpublish** removes the published version; `startChat` for it returns 404.

## 9. Testing

**Test** opens the Test panel (same chat UI). It runs the published version; it asks to publish/save first when needed. Test conversations (`X-Chat-Bot-Mode: test`, signed-in only) are not recorded, send no webhook/emails, use Stripe **test** keys, and return execution logs.

## 10. Web Chat

### Designer (no code)

Toolbar → **Web Chat** opens the designer: settings on the left, a **live preview** on the right (the real Web Chat script on a mock website; every change shows instantly, conversations there are test conversations).

| Section | Options |
|---|---|
| Launcher button | position (bottom right/left), distance from side/bottom, size, shape (circle/rounded/square), button color, icon color, **icon image** (upload or URL), image fills the button |
| Chat window | width, height, corner radius (message colors/fonts come from the Theme tab) |
| Header | show/hide, title, subtitle, avatar image, header color, text color |
| Greeting bubble | show/hide, message, avatar, delay |
| Behavior | open automatically after N seconds |

**Save design** stores it in the chat bot (`settings.webChat`). Websites load the design every time, so **design changes apply without touching the website** (after saving a published bot).

### Install

```html
<script src="https://chat.example.com/web-chat.js" data-chat-bot-id="my-bot-abc1234" async></script>
```

Paste before `</body>`. The designer shows the code with a **Copy code** button once the bot is published. Optional attributes still override the design (`data-position`, `data-button-color`, `data-icon-color`, `data-title`, `data-open="true"`), and `window.ChatBotWebChat.open() / close() / toggle() / update(config)` control it from code.

How it works: Shadow-DOM launcher (host styles can't break it), design from `GET /typebots/{publicId}/webChat`, chat iframe created on first open, header design sent to the iframe with `postMessage`, never initialized twice, full screen under 480 px. Allowed origins (`settings.security.allowedOrigins`) are enforced. Analytics/Chatwoot/"run on website" code blocks run on the host page.

Web Chat conversations also queue **webhook jobs**, **save the contact** (`SAVE_WEBCHAT_CONTACT_URL`) and return a **live-agent token** (see §11).

## 11. Viewer (chat runtime)

- `runtime/chatSession.ts` holds the conversation (no React); components subscribe to slices; messages render once.
- Typing emulation, retry on network errors, cancellation on unmount.
- Inputs: text, number, email, URL, phone, date/range, time, buttons (single/multiple), pictures, rating, **file upload** (drag & drop, type filter, optional skip), **Stripe payment** (Stripe Payment Element, loaded on demand), **cards** (image/title/description/buttons).
- Client actions: wait, redirect, and scripts (Code, Google Analytics, Meta Pixel, Chatwoot).
- **Live agent hand-off**: when the flow ends, or when an agent message arrives on the live-agent socket, a free-text box replaces the bot inputs. Messages appear in the chat and go to `POST /sessions/{id}/liveAgentMessage`, which queues them for `CHAT_WEBHOOK_URL` with `isBotActivated: false`. Agent replies pushed by your Socket.IO server (`receiveMessage` with `{ message }`) appear as bot messages.

## 12. Builder

Palette sections: **Bubbles** (text, image, video, audio, embed) · **Inputs** (text, number, email, website, phone, date, time, buttons, pictures, rating, file, payment, cards) · **Logic** (set variable, condition, redirect, wait, jump, return, A/B test, code, chat bot link) · **Integrations** (HTTP request, send email, Google Sheets, Gmail, Zapier, Make.com, Pabbly, Google Analytics, Meta Pixel, Chatwoot) · **Events** (reply, invalid reply, command).

- Drag blocks onto a group or the canvas, or click to add to the selected group; drag events onto the canvas.
- Every block type has a visual editor; unknown types from imports are kept and editable as JSON.
- Accounts: SMTP and Stripe via an **Add** form; Google Sheets and Gmail via **Connect** (Google sign-in; save changes first). Secrets are encrypted and never shown again.
- Cards have one port per button; buttons/conditions/A-B paths each connect to their own group.
- State: one store per bot (`builder/state`), reducer keeps edges consistent (one edge per port, removed with their blocks/items/buttons/events), slice subscriptions, pan/zoom without re-render.
- Keyboard: Ctrl/⌘+S save, Delete/Backspace removes selected block/group/connection/event.

## 13. Flow engine rules

- Blocks run in order; bubbles collect; inputs wait; the last block's connection leads on.
- Reply validation per input type with retry messages (block setting, bot setting, defaults).
- **Events**: *Reply* runs after every valid answer then resumes; *Invalid reply* replaces the retry message then re-asks; *Command* runs on `{type:"command",command}` (optionally resumes the question). Events can save answer / question name / input type into variables.
- **Jump** remembers where it came from; **Return** goes back there.
- **Chat bot link** runs another published bot (or a group of this one); same-name variables are shared, and copied back when "bring variables back" is on. Linked bots are loaded when the chat starts.
- **A/B test** splits by percentage. **Set variable**: custom value/arithmetic, empty, append, pop/shift, dates, IDs, moment of day, environment, transcript. No server-side code execution; Code blocks run in the browser.
- **HTTP request / Zapier / Make.com / Pabbly**: method, query, headers, custom JSON body (variables escaped) or all answers; response mapping paths like `data.items[0].id`; timeout ≤ 120 s; private-network/metadata addresses blocked in production.
- **Email**: default SMTP or saved account; custom text/HTML body or answers table; cc/bcc/reply-to; attachments from a file-URL variable. **Gmail**: send from a connected account, save message/thread ID. Not sent from tests.
- **Google Sheets**: get rows (filter, first/last/random/all, save columns to variables), insert a row, update matching rows.
- **Payment**: Stripe PaymentIntent created before the input shows; test keys in tests.
- Integration errors are logged and the flow continues. More than 500 groups in one step stops a loop.

## 14. Worker

`worker/chatWebhookWorker.ts` consumes `chat-webhook` on `REDIS_URL`, POSTs each job to `CHAT_WEBHOOK_URL` (30 s timeout), retries 5× with exponential backoff from 2 s, keeps 1000 completed / 5000 failed jobs, concurrency 1 (strict order). Run **one** instance. `npm run start:worker` / `npm run dev:worker`.

## 15. Redis

Only for the webhook queue. One producer connection in the server (created on first message), one consumer in the worker. If Redis is down, queueing errors are logged and chats continue. `redis://…` or `rediss://…` (TLS).

## 16. Local development

```bash
cd chat-bot
npm install
cp .env.example .env      # fill DATABASE_URL, ADMIN_EMAIL, LOGIN_*, NEXTAUTH_SECRET, API_TOKEN, ENCRYPTION_SECRET
npm run dev               # http://localhost:3002 (Vite hot reload + server restart)
npm run dev:worker        # when testing the webhook (needs Redis)
```

Google sign-in locally: add `http://localhost:3002/api/v1/credentials/oauth/callback` as an authorized redirect URI. Stripe: use test keys.

## 17. Production deployment

Order: **PostgreSQL → Redis → app → worker**.

```bash
npm ci
npm run build                               # dist/web, dist/widget/web-chat.js, dist/node
NODE_ENV=production npm start
NODE_ENV=production npm run start:worker    # one instance
# or: pm2 start ecosystem.config.cjs && pm2 save
```

Checklist: `NODE_ENV=production`; `CHAT_BOT_PUBLIC_URL=https://…`; `ENCRYPTION_SECRET` set once and backed up; `UPLOADS_DIR` on persistent, backed-up storage (shared between instances if you run several); Google OAuth redirect URI `<public URL>/api/v1/credentials/oauth/callback`; reverse proxy forwards `Host`, `X-Forwarded-Proto`, overwrites `X-Forwarded-For`, allows request bodies ≥ 10 MB for uploads; `/health` for health checks. Redeploy: `git pull && npm ci && npm run build && pm2 restart all`.

## 18. Customization

| To change | Edit |
|---|---|
| Chat look defaults | `web/theme/chatAppearance.ts` |
| Per-bot chat look | Builder → Theme tab |
| Web Chat launcher/window/header/greeting | Builder → Web Chat designer; defaults in `shared/webChat.ts` (mirrored in `widget/webChat.ts`) |
| Chat CSS | `viewer/chat.css` (`--chat-*` variables) |
| Chat texts | `viewer/chatText.ts` |
| Bubble / input rendering | `viewer/BotBubble.tsx`, `viewer/inputs/ChatInputArea.tsx` (`inputRenderers`) |
| App/builder look | `web/theme/app.css` |
| Blocks (palette, defaults, summaries, editors) | `builder/blocks/blockRegistry.tsx` + `blocks/editors/` |
| Events | `eventDefinitions` in `blockRegistry.tsx`, handling in `server/engine/flow.ts` |
| Templates | `web/templates/` |
| Engine rules | `server/engine/*`; integrations `server/integrations/*` |

New block end-to-end: registry entry + editor → engine (`INPUT_TYPES`/`LOGIC_TYPES` + `executeLogic`, or `INTEGRATION_TYPES` + `engineServices`) → input renderer if it's an input.

## 19. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable …` | Set it (§3) |
| Start fails with database error | Check `DATABASE_URL` |
| "ENCRYPTION_SECRET is not configured" | Set a 32-character value; don't change it later |
| Saved accounts stopped working | `ENCRYPTION_SECRET` changed — restore the old value or re-add accounts |
| Google **Connect** fails / "not configured" | Set `GOOGLE_SHEETS_*`/`GMAIL_*`; add the redirect URI in Google Cloud; save the bot before connecting |
| Google Sheets "Could not read the spreadsheet" | Account has no access to that spreadsheet, or wrong ID/URL |
| Email not sent | Default SMTP not configured, wrong account, or Test panel (emails skipped). Test logs show the reason |
| Payment error on start | Missing/invalid Stripe keys or amount |
| Upload fails "larger than" / "Allowed file types" | Increase `NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE` / proxy body limit, or adjust the block |
| Uploaded files missing after redeploy | `UPLOADS_DIR` not on persistent storage |
| Web Chat design not updating on the website | Save the design (bot must be published); the design is cached up to 60 s |
| Web Chat button missing | Wrong script `src`, bot unpublished/deleted, or check the console for `[Chat Bot]` |
| "Origin not allowed" | Website not in the bot's allowed origins |
| Free-text messages not reaching agents | Worker/Redis/`CHAT_WEBHOOK_URL` (§14) |
| "This conversation was updated by another request" | Two replies were sent at once; retry |
| Chat bot link does nothing | Linked bot not published (Test logs show it) |
| A block is skipped | Type not executed by the runtime (log: "not supported by the chat runtime") |
| Import fails "Unsupported chat bot version" | Only version 6/6.1 exports |
