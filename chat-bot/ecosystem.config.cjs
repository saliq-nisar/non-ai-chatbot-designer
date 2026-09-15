// PM2 process file. Build first (npm ci && npm run build), then: pm2 start ecosystem.config.cjs
// Both processes read .env from this directory (cwd).
module.exports = {
  apps: [
    {
      name: "chat-bot",
      script: "dist/node/server/index.js",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
    {
      // Exactly one instance: it delivers webhook messages in strict order.
      name: "chat-bot-webhook-worker",
      script: "dist/node/worker/chatWebhookWorker.js",
      cwd: __dirname,
      instances: 1,
      env: { NODE_ENV: "production" },
    },
  ],
};
