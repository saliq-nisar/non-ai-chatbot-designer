import { SelectField, TextField } from "../../inspector/fields";
import { KeyValueList } from "../../inspector/listFields";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";

/** Google Analytics, Meta Pixel and Chatwoot run on the website hosting the Web Chat. */

export const GoogleAnalyticsEditor = ({ block, onChange }: BlockEditorProps) => {
  const text = (key: string, label: string, placeholder?: string) => (
    <TextField label={label} placeholder={placeholder} value={option<string>(block, key)} onChange={(value) => onChange(withOptions(block, { [key]: value }))} />
  );
  return (
    <>
      {text("trackingId", "Measurement ID", "G-XXXXXXXXXX")}
      {text("action", "Event action", "Contact form submitted")}
      {text("category", "Event category")}
      {text("label", "Event label")}
      {text("value", "Event value", "Number or {{Variable}}")}
      {text("sendTo", "Send to (optional)")}
    </>
  );
};

const PIXEL_EVENTS = [
  "Lead",
  "Contact",
  "CompleteRegistration",
  "Subscribe",
  "SubmitApplication",
  "Schedule",
  "StartTrial",
  "Purchase",
  "AddToCart",
  "AddPaymentInfo",
  "InitiateCheckout",
  "Search",
  "ViewContent",
  "Donate",
  "FindLocation",
  "CustomizeProduct",
  "Custom",
] as const;

export const PixelEditor = ({ block, onChange }: BlockEditorProps) => {
  const eventType = option<string>(block, "eventType");
  return (
    <>
      <TextField label="Pixel ID" value={option<string>(block, "pixelId")} onChange={(pixelId) => onChange(withOptions(block, { pixelId }))} />
      <SelectField
        label="Event"
        value={eventType ?? ""}
        options={[{ value: "", label: "Page view only (init)" }, ...PIXEL_EVENTS.map((value) => ({ value, label: value }))]}
        onChange={(value) => onChange(withOptions(block, { eventType: value || undefined }))}
      />
      {eventType === "Custom" && <TextField label="Custom event name" value={option<string>(block, "name")} onChange={(name) => onChange(withOptions(block, { name }))} />}
      {eventType && <KeyValueList label="Parameters" rows={option(block, "params")} onChange={(params) => onChange(withOptions(block, { params }))} />}
    </>
  );
};

export const ChatwootEditor = ({ block, onChange }: BlockEditorProps) => {
  const task = option<string>(block, "task") ?? "Show widget";
  const user = option<Record<string, string | undefined>>(block, "user") ?? {};
  const userField = (key: string, label: string) => (
    <TextField label={label} value={user[key]} onChange={(value) => onChange(withOptions(block, { user: { ...user, [key]: value || undefined } }))} />
  );
  return (
    <>
      <SelectField
        label="Task"
        value={task as "Show widget" | "Close widget"}
        options={[
          { value: "Show widget", label: "Show widget" },
          { value: "Close widget", label: "Close widget" },
        ]}
        onChange={(value) => onChange(withOptions(block, { task: value }))}
      />
      {task === "Show widget" && (
        <>
          <TextField label="Base URL" placeholder="https://app.chatwoot.com" value={option<string>(block, "baseUrl")} onChange={(baseUrl) => onChange(withOptions(block, { baseUrl }))} />
          <TextField label="Website token" value={option<string>(block, "websiteToken")} onChange={(websiteToken) => onChange(withOptions(block, { websiteToken }))} />
          {userField("id", "User ID")}
          {userField("email", "User email")}
          {userField("name", "User name")}
          {userField("avatarUrl", "Avatar URL")}
          {userField("phoneNumber", "Phone number")}
        </>
      )}
    </>
  );
};
