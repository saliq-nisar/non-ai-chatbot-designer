import { type FormEvent, useEffect, useId, useState } from "react";
import { type CredentialsSummary, type CredentialsType, credentialsApi } from "../../../../api/credentialsApi";
import { errorMessage } from "../../../../api/http";
import { appConfig } from "../../../../config";
import { routes } from "../../../../router";
import { Dialog } from "../../shared/Dialog";
import { useBuilder } from "../state/builderStore";

const LABELS: Record<CredentialsType, string> = { smtp: "SMTP account", stripe: "Stripe account", "google sheets": "Google account", gmail: "Gmail account" };

type Props = {
  type: CredentialsType;
  value: string | undefined;
  onChange: (credentialsId: string | undefined) => void;
  /** Block being edited: Google sign-in reopens it after connecting. */
  blockId: string;
  /** Extra first option, e.g. the default SMTP server from the environment. */
  defaultOption?: { value: string; label: string };
};

/** Picks a saved integration account, or adds one (form for SMTP/Stripe, Google sign-in otherwise). */
export const CredentialsSelect = ({ type, value, onChange, blockId, defaultOption }: Props) => {
  const id = useId();
  const [accounts, setAccounts] = useState<CredentialsSummary[]>();
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);
  const chatBotId = useBuilder((state) => state.chatBot.id);
  const isDirty = useBuilder((state) => state.revision !== state.savedRevision);

  const load = () =>
    credentialsApi
      .list(appConfig.workspaceId, type)
      .then(setAccounts)
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    load();
    // Reloads only when the account type changes.
  }, [type]);

  // Embedded builder: Google sign-in can't run inside an iframe, and removing accounts needs the real sign-in.
  const isEmbedded = !!appConfig.embedToken;

  const connectGoogle = () => {
    const returnTo = `${routes.builder(chatBotId)}?blockId=${encodeURIComponent(blockId)}`;
    window.location.assign(credentialsApi.oauthUrl(appConfig.workspaceId, type, returnTo));
  };

  const remove = async () => {
    if (!value || value === defaultOption?.value || !window.confirm("Remove this account from the workspace?")) return;
    try {
      await credentialsApi.remove(appConfig.workspaceId, value);
      onChange(undefined);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {LABELS[type]}
      </label>
      <div className="field--inline">
        <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">— select —</option>
          {defaultOption && <option value={defaultOption.value}>{defaultOption.label}</option>}
          {accounts?.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {credentialsApi.isOAuth(type) ? (
          !isEmbedded && (
            <button type="button" className="btn btn--sm" onClick={connectGoogle} disabled={isDirty} title={isDirty ? "Save your changes first" : undefined}>
              Connect
            </button>
          )
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => setIsAdding(true)}>
            Add
          </button>
        )}
        {value && value !== defaultOption?.value && !isEmbedded && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={remove} aria-label="Remove account">
            ✕
          </button>
        )}
      </div>
      {credentialsApi.isOAuth(type) && isEmbedded && (
        <span className="field__hint">Google accounts are connected in the Chat Bots app; accounts connected there can be selected here.</span>
      )}
      {credentialsApi.isOAuth(type) && isDirty && !isEmbedded && <span className="field__hint">Save your changes before connecting a Google account.</span>}
      {error && <span className="field__hint alert">{error}</span>}
      {isAdding && (
        <AddCredentialsDialog
          type={type}
          onClose={() => setIsAdding(false)}
          onCreated={async (account) => {
            setIsAdding(false);
            await load();
            onChange(account.id);
          }}
        />
      )}
    </div>
  );
};

const AddCredentialsDialog = ({ type, onClose, onCreated }: { type: CredentialsType; onClose: () => void; onCreated: (account: CredentialsSummary) => void }) => {
  const [fields, setFields] = useState<Record<string, string>>({ port: "587" });
  const [isTls, setIsTls] = useState(false);
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const set = (key: string) => (e: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(undefined);
    const data =
      type === "smtp"
        ? { host: fields.host, port: Number(fields.port), username: fields.username, password: fields.password, isTlsEnabled: isTls, from: { email: fields.fromEmail, name: fields.fromName } }
        : { live: { secretKey: fields.liveSecret, publicKey: fields.livePublic }, test: { secretKey: fields.testSecret, publicKey: fields.testPublic } };
    try {
      onCreated(await credentialsApi.create(appConfig.workspaceId, type, fields.name ?? "", data));
    } catch (err) {
      setError(errorMessage(err));
      setIsBusy(false);
    }
  };

  const input = (key: string, label: string, props: { type?: string; placeholder?: string; required?: boolean } = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={fields[key] ?? ""} onChange={set(key)} {...props} />
    </label>
  );

  return (
    <Dialog title={type === "smtp" ? "Add SMTP account" : "Add Stripe account"} onClose={onClose}>
      <form onSubmit={submit}>
        {input("name", "Name", { required: true, placeholder: type === "smtp" ? "My SMTP" : "My Stripe account" })}
        {type === "smtp" ? (
          <>
            {input("fromEmail", "From email", { required: true, type: "email" })}
            {input("fromName", "From name")}
            {input("host", "Host", { required: true, placeholder: "smtp.example.com" })}
            {input("port", "Port", { required: true, type: "number" })}
            {input("username", "Username")}
            {input("password", "Password", { type: "password" })}
            <label className="field field--inline">
              <input type="checkbox" checked={isTls} onChange={(e) => setIsTls(e.target.checked)} />
              <span>Use TLS (usually port 465)</span>
            </label>
          </>
        ) : (
          <>
            {input("liveSecret", "Live secret key", { required: true, type: "password", placeholder: "sk_live_…" })}
            {input("livePublic", "Live publishable key", { required: true, placeholder: "pk_live_…" })}
            {input("testSecret", "Test secret key (optional)", { type: "password", placeholder: "sk_test_…" })}
            {input("testPublic", "Test publishable key (optional)", { placeholder: "pk_test_…" })}
            <p className="field__hint">Test keys are used in the builder's Test panel.</p>
          </>
        )}
        {error && <p className="alert">{error}</p>}
        <div className="dialog__footer" style={{ padding: 0 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={isBusy}>
            {isBusy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
