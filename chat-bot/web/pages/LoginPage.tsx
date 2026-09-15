import { type FormEvent, useState } from "react";
import { errorMessage, request } from "../api/http";
import "./pages.css";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(undefined);
    try {
      await request("/auth/login", { method: "POST", body: { username, password } });
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      // Only same-site paths are accepted as a redirect target.
      window.location.assign(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/");
    } catch (err) {
      setError(errorMessage(err));
      setIsBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="login card" onSubmit={submit}>
        <h1 className="page__title">Sign in to Chat Bots</h1>
        <label className="field">
          <span className="field__label">Username</span>
          <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={isBusy} style={{ width: "100%" }}>
          {isBusy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
