import { request } from "./http";

/** Saved integration accounts (SMTP, Stripe, Google Sheets, Gmail). Secrets are never returned. */

export type CredentialsType = "smtp" | "stripe" | "google sheets" | "gmail";
export type CredentialsSummary = { id: string; name: string; type: CredentialsType };

const OAUTH_SLUG: Partial<Record<CredentialsType, string>> = { "google sheets": "google-sheets", gmail: "gmail" };

export const credentialsApi = {
  async list(workspaceId: string, type: CredentialsType): Promise<CredentialsSummary[]> {
    const params = new URLSearchParams({ workspaceId, type });
    return (await request<{ credentials: CredentialsSummary[] }>(`/api/v1/credentials?${params}`)).credentials;
  },

  async create(workspaceId: string, type: CredentialsType, name: string, data: object): Promise<CredentialsSummary> {
    return (await request<{ credentials: CredentialsSummary }>("/api/v1/credentials", { method: "POST", body: { workspaceId, type, name, data } })).credentials;
  },

  async remove(workspaceId: string, credentialsId: string): Promise<void> {
    await request(`/api/v1/credentials/${encodeURIComponent(credentialsId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
  },

  /** Google accounts connect by navigating to Google's consent page; it comes back to `returnTo`. */
  oauthUrl(workspaceId: string, type: CredentialsType, returnTo: string) {
    return `/api/v1/credentials/oauth/${OAUTH_SLUG[type]}/authorize?${new URLSearchParams({ workspaceId, returnTo })}`;
  },

  isOAuth: (type: CredentialsType) => !!OAUTH_SLUG[type],

  async listSheets(workspaceId: string, credentialsId: string, spreadsheetId: string) {
    return (
      await request<{ sheets: { id: string; name: string; columns: string[] }[] }>(
        `/api/v1/credentials/${encodeURIComponent(credentialsId)}/google-sheets/${encodeURIComponent(spreadsheetId)}/sheets?workspaceId=${encodeURIComponent(workspaceId)}`,
      )
    ).sheets;
  },
};
