import { makeAnonymousContributorId } from "./contributors";

const STORAGE_KEY = "deepsignal.respondentSessions";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type StoredRespondentSession = {
  address?: string;
  chain: "sui";
  sessionId: string;
  signature?: string;
  signedAt: string;
  expiresAt: string;
  isAnonymous: boolean;
};

type SessionMap = Record<string, StoredRespondentSession>;

function readSessions() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionMap) : {};
  } catch {
    return {};
  }
}

function writeSessions(value: SessionMap) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function getSessionKey(address?: string | null, anonymous = false) {
  return anonymous ? "anonymous" : `wallet:${String(address ?? "").toLowerCase()}`;
}

function isValidSession(session?: StoredRespondentSession | null) {
  if (!session?.sessionId) {
    return false;
  }
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function getStoredRespondentSession(address?: string | null, anonymous = false) {
  const sessions = readSessions();
  const key = getSessionKey(address, anonymous);
  const session = sessions[key];
  return isValidSession(session) ? session : null;
}

export async function ensureRespondentSession({
  walletAddress,
  isAnonymous,
}: {
  walletAddress?: string | null;
  isAnonymous: boolean;
}) {
  const existing = getStoredRespondentSession(walletAddress, isAnonymous);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const sessionId = isAnonymous ? makeAnonymousContributorId() : crypto.randomUUID();
  const nextSession: StoredRespondentSession = {
    address: isAnonymous ? undefined : walletAddress ?? undefined,
    chain: "sui",
    sessionId,
    signedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isAnonymous,
  };

  const sessions = readSessions();
  sessions[getSessionKey(walletAddress, isAnonymous)] = nextSession;
  writeSessions(sessions);
  return nextSession;
}

export function getRespondentSessionTtlHours() {
  return Math.round(SESSION_TTL_MS / (60 * 60 * 1000));
}
