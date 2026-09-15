import { useMemo } from "react";
import { resolveWebChatConfig, type WebChatConfig } from "../../../../../shared/webChat";
import { appConfig } from "../../../../config";
import { routes } from "../../../../router";
import { CopyButton } from "../../shared/CopyButton";
import { Dialog } from "../../shared/Dialog";
import { CheckboxField, ColorField, NumberField, SelectField, TextField } from "../inspector/fields";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import type { ChatBotLifecycle } from "../useChatBotLifecycle";
import { ImageField } from "./ImageField";
import { WebChatPreview } from "./WebChatPreview";

/** The code to paste into a website. The design is loaded by the script, so it never changes. */
export const webChatSnippet = (publicId: string) => `<script src="${appConfig.appUrl}/web-chat.js" data-chat-bot-id="${publicId}" async></script>`;

/**
 * Web Chat designer: every option of the launcher, window, header, greeting and auto-open,
 * with a live preview. The design is saved in the chat bot's settings (Save), and websites
 * pick it up automatically once the chat bot is published.
 */
export const WebChatDesigner = ({ lifecycle, onClose }: { lifecycle: ChatBotLifecycle; onClose: () => void }) => {
  const dispatch = useBuilderDispatch();
  const settings = useBuilder((state) => state.chatBot.settings);
  const name = useBuilder((state) => state.chatBot.name);
  const chatBotId = useBuilder((state) => state.chatBot.id);
  const publicId = useBuilder((state) => state.chatBot.publicId);
  const isDirty = useBuilder((state) => state.revision !== state.savedRevision);
  const config = useMemo(() => resolveWebChatConfig(settings.webChat, name), [settings.webChat, name]);
  const { published, busy } = lifecycle;

  const update = <K extends keyof WebChatConfig>(key: K, value: WebChatConfig[K]) =>
    dispatch({ type: "updateSettings", settings: { ...settings, webChat: { ...config, [key]: value } } });
  const button = (patch: Partial<WebChatConfig["button"]>) => update("button", { ...config.button, ...patch });
  const windowSize = (patch: Partial<WebChatConfig["window"]>) => update("window", { ...config.window, ...patch });
  const header = (patch: Partial<WebChatConfig["header"]>) => update("header", { ...config.header, ...patch });
  const greeting = (patch: Partial<WebChatConfig["greeting"]>) => update("greeting", { ...config.greeting, ...patch });
  const autoOpen = (patch: Partial<WebChatConfig["autoOpen"]>) => update("autoOpen", { ...config.autoOpen, ...patch });
  const num = (value: number | undefined, fallback: number) => (value === undefined || Number.isNaN(value) ? fallback : value);

  const snippet = publicId ? webChatSnippet(publicId) : "";

  return (
    <Dialog
      title="Web Chat"
      onClose={onClose}
      width="1180px"
      footer={
        <>
          <span className="field__hint webchat-designer__status">
            {!published ? "Publish the chat bot to use the Web Chat on a website." : isDirty ? "Save to apply this design to your website." : "Your website shows this design."}
          </span>
          <button type="button" className="btn" onClick={lifecycle.save} disabled={!isDirty || !!busy}>
            {busy === "saving" ? "Saving…" : "Save design"}
          </button>
          {!published && (
            <button type="button" className="btn btn--primary" onClick={lifecycle.publish} disabled={!!busy}>
              {busy === "publishing" ? "Publishing…" : "Publish"}
            </button>
          )}
        </>
      }
    >
      <div className="webchat-designer">
        <div className="webchat-designer__form">
          <details open className="designer-section">
            <summary>Launcher button</summary>
            <SelectField
              label="Position"
              value={config.position}
              options={[
                { value: "right", label: "Bottom right" },
                { value: "left", label: "Bottom left" },
              ]}
              onChange={(position) => update("position", position)}
            />
            <div className="field-row">
              <NumberField label="Distance from side (px)" min={0} value={config.offsetX} onChange={(v) => update("offsetX", num(v, 20))} />
              <NumberField label="Distance from bottom (px)" min={0} value={config.offsetY} onChange={(v) => update("offsetY", num(v, 20))} />
            </div>
            <div className="field-row">
              <NumberField label="Size (px)" min={32} max={120} value={config.button.size} onChange={(v) => button({ size: Math.min(120, Math.max(32, num(v, 56))) })} />
              <SelectField
                label="Shape"
                value={config.button.shape}
                options={[
                  { value: "circle", label: "Circle" },
                  { value: "rounded", label: "Rounded" },
                  { value: "square", label: "Square" },
                ]}
                onChange={(shape) => button({ shape })}
              />
            </div>
            <ColorField label="Button color" value={config.button.backgroundColor} fallback="#2563eb" onChange={(v) => button({ backgroundColor: v ?? "#2563eb" })} />
            <ColorField label="Icon color" value={config.button.iconColor} fallback="#ffffff" onChange={(v) => button({ iconColor: v ?? "#ffffff" })} />
            <ImageField label="Icon image" chatBotId={chatBotId} value={config.button.iconUrl} hint="Leave empty for the default chat icon." onChange={(iconUrl) => button({ iconUrl })} />
            {config.button.iconUrl && <CheckboxField label="Image fills the whole button" value={config.button.isIconFullSize} onChange={(isIconFullSize) => button({ isIconFullSize })} />}
          </details>

          <details open className="designer-section">
            <summary>Chat window</summary>
            <div className="field-row">
              <NumberField label="Width (px)" min={280} max={800} value={config.window.width} onChange={(v) => windowSize({ width: num(v, 400) })} />
              <NumberField label="Height (px)" min={360} max={1000} value={config.window.height} onChange={(v) => windowSize({ height: num(v, 640) })} />
            </div>
            <NumberField label="Corner radius (px)" min={0} max={40} value={config.window.borderRadius} onChange={(v) => windowSize({ borderRadius: num(v, 16) })} />
            <p className="field__hint">Message colors and fonts come from the Theme tab.</p>
          </details>

          <details open className="designer-section">
            <summary>Header</summary>
            <CheckboxField label="Show header" value={config.header.isEnabled} onChange={(isEnabled) => header({ isEnabled })} />
            {config.header.isEnabled && (
              <>
                <TextField label="Title" value={config.header.title} onChange={(title) => header({ title })} />
                <TextField label="Subtitle" placeholder="We usually reply in a few minutes" value={config.header.subtitle} onChange={(subtitle) => header({ subtitle })} />
                <ImageField label="Header avatar" chatBotId={chatBotId} value={config.header.avatarUrl} onChange={(avatarUrl) => header({ avatarUrl })} />
                <ColorField label="Header color" value={config.header.backgroundColor} fallback="#2563eb" onChange={(v) => header({ backgroundColor: v ?? "#2563eb" })} />
                <ColorField label="Header text" value={config.header.textColor} fallback="#ffffff" onChange={(v) => header({ textColor: v ?? "#ffffff" })} />
              </>
            )}
          </details>

          <details open className="designer-section">
            <summary>Greeting bubble</summary>
            <CheckboxField label="Show a greeting next to the button" value={config.greeting.isEnabled} onChange={(isEnabled) => greeting({ isEnabled })} />
            {config.greeting.isEnabled && (
              <>
                <TextField label="Message" multiline value={config.greeting.message} onChange={(message) => greeting({ message })} />
                <ImageField label="Greeting avatar" chatBotId={chatBotId} value={config.greeting.avatarUrl} onChange={(avatarUrl) => greeting({ avatarUrl })} />
                <NumberField label="Show after (seconds)" min={0} value={config.greeting.delaySeconds} onChange={(v) => greeting({ delaySeconds: num(v, 3) })} />
              </>
            )}
          </details>

          <details open className="designer-section">
            <summary>Behavior</summary>
            <CheckboxField label="Open the chat automatically" value={config.autoOpen.isEnabled} onChange={(isEnabled) => autoOpen({ isEnabled })} />
            {config.autoOpen.isEnabled && <NumberField label="Open after (seconds)" min={0} value={config.autoOpen.delaySeconds} onChange={(v) => autoOpen({ delaySeconds: num(v, 5) })} />}
            <p className="field__hint">Greeting and auto-open delays are skipped in the preview.</p>
          </details>
        </div>

        <div className="webchat-designer__side">
          <div className="webchat-designer__preview">
            <WebChatPreview publicId={publicId ?? "preview"} config={config} />
          </div>
          {!published && <p className="alert alert--info">The preview shows the design. Publish the chat bot to try the conversation here.</p>}

          <section className="webchat-install">
            <h3>Add it to your website</h3>
            {publicId && published ? (
              <>
                <ol className="steps">
                  <li>Copy the code below.</li>
                  <li>
                    Paste it into your website's HTML just before <code>&lt;/body&gt;</code> (or ask whoever manages the website to do it).
                  </li>
                  <li>Done — later design changes appear automatically after you save.</li>
                </ol>
                <pre className="code-block">{snippet}</pre>
                <div className="field--inline webchat-install__actions">
                  <CopyButton text={snippet} label="Copy code" />
                  <a className="btn" href={`${appConfig.appUrl}${routes.chat(publicId)}`} target="_blank" rel="noopener noreferrer">
                    Open chat page
                  </a>
                </div>
              </>
            ) : (
              <p className="field__hint">The code appears once the chat bot is published.</p>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  );
};
