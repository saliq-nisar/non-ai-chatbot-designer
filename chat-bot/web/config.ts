/** Runtime configuration injected by the server into index.html (see server/index.ts). */
export type AppConfig = {
  /** Workspace resolved/seeded at server startup. */
  workspaceId: string;
  /** Public URL of this app — hosts /web-chat.js and /chat/:publicId. */
  appUrl: string;
  /**
   * Set when the builder is embedded in an allowed parent site (/chat-bots/:id/edit?embed=true):
   * a server-issued key for that chat bot, sent with API calls instead of the sign-in cookie.
   */
  embedToken?: string;
};

declare global {
  interface Window {
    __CHAT_BOT_CONFIG__?: AppConfig;
  }
}

const injected = window.__CHAT_BOT_CONFIG__;
if (!injected) throw new Error("Chat Bot configuration missing — open the app through its server (npm run dev / npm start).");

export const appConfig: AppConfig = injected;
