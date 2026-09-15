import type { IncomingMessage } from "node:http";
import { config } from "../config.js";

/**
 * Visitor's public IP (sent with webhook jobs and contact saves).
 * Behind a reverse proxy the socket address is the proxy, so forwarded headers are
 * read first — they are only trustworthy when the proxy overwrites them.
 * When the visitor is on the same private network, the network's public (egress)
 * address is looked up once and cached.
 */

const normalize = (ip: string | undefined) => {
  const trimmed = ip?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
};

const isPrivate = (ip: string) => {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const [a, b] = ip.split(".").map(Number);
  if (a === undefined || Number.isNaN(a)) return false;
  return a === 10 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
};

const header = (req: IncomingMessage, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const CACHE_MS = 10 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
let egressCache: { ip: string | undefined; expiresAt: number } | undefined;
let egressLookup: Promise<string | undefined> | undefined;

const lookupEgressIp = async () => {
  if (egressCache && egressCache.expiresAt > Date.now()) return egressCache.ip;
  egressLookup ??= (async () => {
    try {
      const response = await fetch(config.publicIpLookupUrl, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const text = (await response.text()).trim();
      const ip = normalize(text.startsWith("{") ? (JSON.parse(text) as { ip?: string }).ip : text);
      egressCache = { ip, expiresAt: Date.now() + (ip ? CACHE_MS : FAILURE_CACHE_MS) };
      return ip;
    } catch {
      egressCache = { ip: undefined, expiresAt: Date.now() + FAILURE_CACHE_MS };
      return undefined;
    } finally {
      egressLookup = undefined;
    }
  })();
  return egressLookup;
};

export const resolveClientIp = async (req: IncomingMessage) => {
  const candidates = [
    header(req, "cf-connecting-ip"),
    header(req, "true-client-ip"),
    ...(header(req, "x-forwarded-for")?.split(",") ?? []),
    header(req, "x-real-ip"),
  ]
    .map(normalize)
    .filter((ip): ip is string => !!ip);
  const ip = candidates.find((candidate) => !isPrivate(candidate)) ?? candidates[0] ?? normalize(req.socket.remoteAddress);
  if (ip && !isPrivate(ip)) return ip;
  return (await lookupEgressIp()) ?? ip;
};
