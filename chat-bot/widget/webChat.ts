/**
 * Chat Bot Web Chat — embeddable script.
 *
 *   <script src="https://YOUR-APP/web-chat.js" data-chat-bot-id="PUBLIC_ID" async></script>
 *
 * Adds a launcher button (and optional greeting bubble) to the page. The look and behavior
 * are designed in the builder (Web Chat designer) and loaded from
 * /api/v1/chat-bots/PUBLIC_ID/webChat, so changes apply without editing the website.
 * The chat window is an iframe of /chat/PUBLIC_ID from the same server, created on first open.
 *
 * Optional attributes override the saved design: data-position="left|right",
 * data-button-color, data-icon-color, data-title, data-open="true".
 *
 * JavaScript API: window.ChatBotWebChat.open() / .close() / .toggle() / .update(config)
 * (pass a public ID first when the page has several chat bots).
 *
 * This file must not import anything: it is served as a single classic script.
 */

/** Mirrors shared/webChat.ts (WebChatConfig). Used when the design can't be loaded. */
const WEB_CHAT_DEFAULTS: WebChatConfig = {
  position: "right",
  offsetX: 20,
  offsetY: 20,
  button: { size: 56, shape: "circle", backgroundColor: "#2563eb", iconColor: "#ffffff", iconUrl: "", isIconFullSize: false },
  window: { width: 400, height: 640, borderRadius: 16 },
  header: { isEnabled: true, title: "", subtitle: "", avatarUrl: "", backgroundColor: "#2563eb", textColor: "#ffffff" },
  greeting: { isEnabled: false, message: "", avatarUrl: "", delaySeconds: 3 },
  autoOpen: { isEnabled: false, delaySeconds: 5 },
};

interface WebChatConfig {
  position: "right" | "left";
  offsetX: number;
  offsetY: number;
  button: { size: number; shape: "circle" | "rounded" | "square"; backgroundColor: string; iconColor: string; iconUrl: string; isIconFullSize: boolean };
  window: { width: number; height: number; borderRadius: number };
  header: { isEnabled: boolean; title: string; subtitle: string; avatarUrl: string; backgroundColor: string; textColor: string };
  greeting: { isEnabled: boolean; message: string; avatarUrl: string; delaySeconds: number };
  autoOpen: { isEnabled: boolean; delaySeconds: number };
}

interface WebChatInstance {
  open: () => void;
  close: () => void;
  toggle: () => void;
  update: (config: WebChatConfig) => void;
}

interface Window {
  __chatBotWebChats?: Record<string, WebChatInstance>;
  ChatBotWebChat?: {
    open: (publicId?: string) => void;
    close: (publicId?: string) => void;
    toggle: (publicId?: string) => void;
    update: (publicIdOrConfig: string | WebChatConfig, config?: WebChatConfig) => void;
  };
}

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script?.src) return console.error("[Chat Bot] web-chat.js must be loaded with a <script src> tag.");

  const publicId = script.dataset.chatBotId;
  if (!publicId) return console.error("[Chat Bot] Missing data-chat-bot-id on the Web Chat script tag.");

  const instances = (window.__chatBotWebChats ??= {});
  if (instances[publicId]) return; // already on the page: never initialize twice

  const appOrigin = new URL(script.src).origin;
  const isPreview = script.dataset.preview === "true";
  /** Builder designer only: runs the saved (not necessarily published) chat bot. */
  const previewChatBotId = isPreview ? script.dataset.previewChatBotId : undefined;
  /** Embedded builder's designer: its signed token authorizes the preview conversation. */
  const previewToken = isPreview ? script.dataset.previewToken : undefined;

  /** Attributes set on the script tag win over the saved design. */
  const withAttributeOverrides = (config: WebChatConfig): WebChatConfig => ({
    ...config,
    position: script.dataset.position === "left" ? "left" : script.dataset.position === "right" ? "right" : config.position,
    button: { ...config.button, backgroundColor: script.dataset.buttonColor || config.button.backgroundColor, iconColor: script.dataset.iconColor || config.button.iconColor },
    header: { ...config.header, title: script.dataset.title ?? config.header.title },
    autoOpen: script.dataset.open === "true" ? { isEnabled: true, delaySeconds: 0 } : config.autoOpen,
  });

  let config = withAttributeOverrides(WEB_CHAT_DEFAULTS);

  const host = document.createElement("div");
  host.setAttribute("data-chat-bot-web-chat", publicId);
  // Shadow DOM: host page styles can't break the widget and vice versa.
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";

  const greeting = document.createElement("div");
  greeting.className = "greeting";
  greeting.setAttribute("role", "status");

  const chatWindow = document.createElement("div");
  chatWindow.className = "window";
  chatWindow.setAttribute("role", "dialog");

  let iframe: HTMLIFrameElement | undefined;
  let isOpen = false;
  let greetingDismissed = false;
  const timers: number[] = [];

  const chatIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const isSafeImage = (url: string) => /^(https?:\/\/|data:image\/|\/)/i.test(url);

  const render = () => {
    const { button, window: win, position, offsetX, offsetY } = config;
    const radius = button.shape === "circle" ? "50%" : button.shape === "rounded" ? `${Math.round(button.size / 4)}px` : "4px";
    const side = position === "left" ? "left" : "right";
    style.textContent = `
      :host { all: initial; }
      .launcher {
        position: fixed; bottom: ${offsetY}px; ${side}: ${offsetX}px; z-index: 2147483000;
        width: ${button.size}px; height: ${button.size}px; padding: 0; border: 0; border-radius: ${radius}; overflow: hidden;
        background: ${button.isIconFullSize && button.iconUrl ? "transparent" : button.backgroundColor}; color: ${button.iconColor};
        cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.2); display: grid; place-items: center; transition: transform .15s ease;
      }
      .launcher:hover { transform: scale(1.06); }
      .launcher svg { width: ${Math.round(button.size * 0.46)}px; height: ${Math.round(button.size * 0.46)}px; }
      .launcher img { width: ${button.isIconFullSize ? "100%" : "60%"}; height: ${button.isIconFullSize ? "100%" : "60%"}; object-fit: ${button.isIconFullSize ? "cover" : "contain"}; }
      .window {
        position: fixed; bottom: ${offsetY + button.size + 12}px; ${side}: ${offsetX}px; z-index: 2147483000;
        width: ${win.width}px; height: ${win.height}px;
        max-width: calc(100vw - ${offsetX * 2}px); max-height: calc(100vh - ${offsetY * 2 + button.size + 12}px);
        border-radius: ${win.borderRadius}px; overflow: hidden; background: #fff; box-shadow: 0 12px 40px rgba(0,0,0,.25);
        opacity: 0; transform: translateY(12px); pointer-events: none; transition: opacity .2s ease, transform .2s ease;
      }
      .window.is-open { opacity: 1; transform: none; pointer-events: auto; }
      .window iframe { width: 100%; height: 100%; border: 0; display: block; }
      .greeting {
        position: fixed; bottom: ${offsetY + button.size + 12}px; ${side}: ${offsetX}px; z-index: 2147483000;
        display: none; align-items: flex-start; gap: 8px; max-width: 280px; padding: 12px 32px 12px 12px;
        background: #fff; color: #1f2328; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
        font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: pointer;
      }
      .greeting.is-visible { display: flex; }
      .greeting img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
      .greeting .dismiss { position: absolute; top: 4px; ${side}: 4px; border: 0; background: transparent; color: #6b7280; font-size: 14px; cursor: pointer; }
      @media (max-width: 480px) {
        .window { inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; border-radius: 0; }
        /* Full-screen chat has its own close button; the launcher would cover the Send button. */
        .launcher.is-open { display: none; }
      }
    `;
    const iconImage = button.iconUrl && isSafeImage(button.iconUrl) ? `<img src="${escapeAttribute(button.iconUrl)}" alt="" />` : chatIcon;
    launcher.innerHTML = isOpen ? closeIcon : iconImage;
    launcher.classList.toggle("is-open", isOpen);
    launcher.style.background = isOpen ? button.backgroundColor : "";
    launcher.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
    launcher.setAttribute("aria-expanded", String(isOpen));
    chatWindow.setAttribute("aria-label", config.header.title || "Chat");

    greeting.innerHTML = "";
    if (config.greeting.avatarUrl && isSafeImage(config.greeting.avatarUrl)) {
      const avatar = document.createElement("img");
      avatar.src = config.greeting.avatarUrl;
      avatar.alt = "";
      greeting.appendChild(avatar);
    }
    const text = document.createElement("span");
    text.textContent = config.greeting.message;
    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", (event) => {
      event.stopPropagation();
      greetingDismissed = true;
      greeting.classList.remove("is-visible");
    });
    greeting.append(text, dismiss);
  };

  /** Sends header settings to the chat window (title, subtitle, avatar, colors). */
  const sendHeaderToChat = () => {
    iframe?.contentWindow?.postMessage({ type: "chat-bot:header", header: config.header }, appOrigin);
  };

  const setOpen = (open: boolean) => {
    if (open && !iframe) {
      iframe = document.createElement("iframe");
      const previewQuery = previewChatBotId
        ? `&preview=1&chatBotId=${encodeURIComponent(previewChatBotId)}${previewToken ? `&token=${encodeURIComponent(previewToken)}` : ""}`
        : isPreview
          ? "&preview=1"
          : "";
      iframe.src = `${appOrigin}/chat/${encodeURIComponent(publicId)}?embed=1${previewQuery}`;
      iframe.title = config.header.title || "Chat";
      iframe.allow = "autoplay; clipboard-write; payment";
      iframe.addEventListener("load", sendHeaderToChat);
      chatWindow.appendChild(iframe);
    }
    isOpen = open;
    if (open) greeting.classList.remove("is-visible");
    chatWindow.classList.toggle("is-open", open);
    render();
  };

  const scheduleBehavior = () => {
    while (timers.length) window.clearTimeout(timers.pop());
    greeting.classList.remove("is-visible");
    if (config.greeting.isEnabled && config.greeting.message && !greetingDismissed)
      timers.push(window.setTimeout(() => !isOpen && greeting.classList.add("is-visible"), (isPreview ? 0 : config.greeting.delaySeconds) * 1000));
    if (config.autoOpen.isEnabled && !isPreview) timers.push(window.setTimeout(() => setOpen(true), config.autoOpen.delaySeconds * 1000));
  };

  const instance: WebChatInstance = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    update: (next) => {
      config = withAttributeOverrides(next);
      render();
      sendHeaderToChat();
      scheduleBehavior();
    },
  };
  instances[publicId] = instance;

  const find = (id?: string) => (id ? instances[id] : Object.values(instances)[0]);
  window.ChatBotWebChat ??= {
    open: (id) => find(id)?.open(),
    close: (id) => find(id)?.close(),
    toggle: (id) => find(id)?.toggle(),
    update: (idOrConfig, next) => (typeof idOrConfig === "string" ? next && find(idOrConfig)?.update(next) : find()?.update(idOrConfig)),
  };

  launcher.addEventListener("click", instance.toggle);
  greeting.addEventListener("click", instance.open);

  // Messages from our own chat iframe only: close the window, or run a script on this page
  // (Google Analytics, Meta Pixel, Chatwoot, or Code blocks set to run on the parent page).
  window.addEventListener("message", (event) => {
    if (event.origin !== appOrigin || !iframe || event.source !== iframe.contentWindow) return;
    const data = event.data as { type?: string; script?: { content: string; args: { id: string; value: unknown }[] } } | null;
    if (data?.type === "chat-bot:close") instance.close();
    if (data?.type === "chat-bot:ready") sendHeaderToChat();
    if (data?.type === "chat-bot:execute" && data.script && !isPreview) {
      const { content, args } = data.script;
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...params: string[]) => (...values: unknown[]) => Promise<unknown>;
      new AsyncFunction(...args.map((arg) => arg.id), content)(...args.map((arg) => arg.value)).catch((error) => console.error("[Chat Bot] script failed:", error));
    }
  });

  const mount = () => {
    render();
    root.append(style, chatWindow, greeting, launcher);
    document.body.appendChild(host);
    if (isPreview) return; // the builder preview sends the design with update()
    fetch(`${appOrigin}/api/v1/chat-bots/${encodeURIComponent(publicId)}/webChat`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`status ${response.status}`))))
      .then((data: { config: WebChatConfig }) => instance.update(data.config))
      .catch((error) => {
        console.warn("[Chat Bot] could not load the Web Chat design, using defaults:", error);
        scheduleBehavior();
      });
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
