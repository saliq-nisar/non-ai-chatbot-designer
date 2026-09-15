import { createTransport } from "nodemailer";
import type { Block } from "../../shared/types.js";
import { config } from "../config.js";
import { getCredentialsData, type SmtpCredentials } from "../db/credentials.js";
import { collectedValues } from "../engine/state.js";
import type { Flow, IntegrationResult, SessionState } from "../engine/types.js";
import { parseVariables } from "../engine/variables.js";
import { getGoogleAccessToken } from "./googleAuth.js";

/**
 * Email blocks.
 *  - "Email" (SMTP): credentials "default" = SMTP_* environment variables, or saved SMTP credentials.
 *  - "gmail": sends through the connected Gmail account (Gmail API).
 * Emails are not sent from Test conversations.
 */

type EmailOptions = {
  credentialsId?: string;
  recipients?: string[];
  subject?: string;
  body?: string;
  isCustomBody?: boolean;
  isBodyCode?: boolean;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachmentsVariableId?: string;
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Default body: every collected answer and variable as a table. */
const defaultBody = (state: SessionState) => {
  const rows = Object.entries(collectedValues(state))
    .map(([key, value]) => `<tr><td style="padding:4px 12px 4px 0"><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
};

const parseFrom = (from: string | undefined) => ({ name: from?.split(" <")[0]?.replace(/"/g, ""), email: from?.match(/<(.*)>/)?.pop() ?? from });

const attachmentUrls = (flow: Flow, variableId: string | undefined) => {
  const value = flow.variables.find((variable) => variable.id === variableId)?.value;
  return (Array.isArray(value) ? value : value ? [value] : []).filter((url): url is string => !!url && /^https?:\/\//.test(url));
};

export const runSmtpEmail = async (block: Block, { state, flow }: { state: SessionState; flow: Flow }): Promise<IntegrationResult> => {
  const options = (block.options ?? {}) as EmailOptions;
  if (state.isTest) return { logs: [{ status: "info", description: "Emails are not sent from test conversations" }] };
  const recipients = (options.recipients ?? []).map((recipient) => parseVariables(recipient, flow.variables)).filter(Boolean);
  if (recipients.length === 0) return {};

  let transport: { host?: string; port: number; secure?: boolean; ignoreTLS?: boolean; auth?: { user?: string; pass?: string } };
  let from: { name?: string; email?: string };
  if (!options.credentialsId || options.credentialsId === "default") {
    if (!config.smtp.host || !config.smtp.from) return { logs: [{ status: "error", description: "Default SMTP is not configured (SMTP_HOST, NEXT_PUBLIC_SMTP_FROM)" }] };
    transport = {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      ignoreTLS: config.smtp.ignoreTls,
      auth: config.smtp.isAuthDisabled ? undefined : { user: config.smtp.username, pass: config.smtp.password },
    };
    from = parseFrom(config.smtp.from);
  } else {
    const saved = await getCredentialsData<SmtpCredentials>(options.credentialsId, state.workspaceId, "smtp");
    if (!saved) return { logs: [{ status: "error", description: "SMTP credentials not found" }] };
    transport = { host: saved.host, port: saved.port, secure: saved.isTlsEnabled, auth: { user: saved.username, pass: saved.password } };
    from = saved.from;
  }

  const body =
    options.isCustomBody && options.body
      ? options.isBodyCode
        ? parseVariables(options.body, flow.variables)
        : escapeHtml(parseVariables(options.body, flow.variables)).replace(/\n/g, "<br>")
      : defaultBody(state);
  const replyTo = options.replyTo ? parseVariables(options.replyTo, flow.variables) : undefined;

  try {
    await createTransport(transport).sendMail({
      from: from.name ? `"${from.name}" <${from.email}>` : from.email,
      to: recipients,
      cc: options.cc?.map((address) => parseVariables(address, flow.variables)).filter(Boolean),
      bcc: options.bcc?.map((address) => parseVariables(address, flow.variables)).filter(Boolean),
      replyTo,
      subject: parseVariables(options.subject ?? "", flow.variables) || undefined,
      html: body,
      attachments: attachmentUrls(flow, options.attachmentsVariableId).map((path) => ({ path })),
    });
    return { logs: [{ status: "success", description: "Email sent", details: JSON.stringify({ to: recipients }) }] };
  } catch (error) {
    return { logs: [{ status: "error", description: `Email not sent: ${error instanceof Error ? error.message : String(error)}` }] };
  }
};

type GmailOptions = {
  credentialsId?: string;
  to?: string;
  subject?: string;
  body?: string;
  from?: string;
  replyTo?: string;
  threadId?: string;
  responseMapping?: { item?: string; variableId?: string }[];
};

/** RFC 2047 encoding so non-ASCII subjects display correctly. */
const encodeHeader = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`);

export const runGmail = async (block: Block, { state, flow }: { state: SessionState; flow: Flow }): Promise<IntegrationResult> => {
  const options = (block.options ?? {}) as GmailOptions;
  if (state.isTest) return { logs: [{ status: "info", description: "Emails are not sent from test conversations" }] };
  const to = parseVariables(options.to, flow.variables);
  if (!options.credentialsId || !to) return {};
  try {
    const accessToken = await getGoogleAccessToken("gmail", options.credentialsId, state.workspaceId);
    const headers = [
      `To: ${to}`,
      ...(options.from ? [`From: ${parseVariables(options.from, flow.variables)}`] : []),
      ...(options.replyTo ? [`Reply-To: ${parseVariables(options.replyTo, flow.variables)}`] : []),
      `Subject: ${encodeHeader(parseVariables(options.subject, flow.variables))}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ];
    const raw = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(parseVariables(options.body, flow.variables)).toString("base64")}`;
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url"), threadId: options.threadId ? parseVariables(options.threadId, flow.variables) : undefined }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json()) as { id?: string; threadId?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? `Gmail responded ${response.status}`);
    const variables = (options.responseMapping ?? [])
      .filter((mapping) => mapping.variableId)
      .map((mapping) => ({ id: mapping.variableId!, value: (mapping.item === "Thread ID" ? data.threadId : data.id) ?? null }));
    return { variables, logs: [{ status: "success", description: "Email sent with Gmail" }] };
  } catch (error) {
    return { logs: [{ status: "error", description: `Gmail: ${error instanceof Error ? error.message : String(error)}` }] };
  }
};
