import { createHmac, timingSafeEqual } from "node:crypto";

/** Minimal HS256 JSON Web Tokens (login session cookie and live-agent widget token). */

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signature = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** "24h", "30m", "7d", "3600s" or plain seconds. */
export const parseDurationSeconds = (duration: string) => {
  const match = duration.trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!match) throw new Error(`Invalid duration "${duration}" (use e.g. 3600, 30m, 24h or 7d)`);
  const multiplier = { "": 1, s: 1, m: 60, h: 3600, d: 86_400 }[match[2]!.toLowerCase() as "" | "s" | "m" | "h" | "d"];
  return Number(match[1]) * multiplier;
};

export const signJwt = (payload: Record<string, unknown>, secret: string, expiresInSeconds: number) => {
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...payload, iat: now, exp: now + expiresInSeconds })}`;
  return `${data}.${signature(data, secret)}`;
};

/** Returns the payload when the signature is valid and the token has not expired. */
export const verifyJwt = (token: string, secret: string): Record<string, unknown> | undefined => {
  const [header, payload, sig] = token.split(".");
  if (!header || !payload || !sig) return undefined;
  const expected = Buffer.from(signature(`${header}.${payload}`, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    return typeof claims.exp === "number" && claims.exp > Date.now() / 1000 ? claims : undefined;
  } catch {
    return undefined;
  }
};
