const ZKLOGIN_SESSION_KEY = "deepsignal.zklogin.session";
const ZKLOGIN_OAUTH_STATE_KEY = "deepsignal.zklogin.oauthState";

export interface ZkLoginSession {
  provider: "google";
  address: string;
  iss: string;
  aud?: string;
  subHash?: string;
  expiresAt: string;
}

export interface ZkLoginOAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: string;
}

function readStorageJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorageJson<T>(storage: Storage, key: string, value: T) {
  storage.setItem(key, JSON.stringify(value));
}

export function saveZkLoginOAuthState(value: ZkLoginOAuthState) {
  window.sessionStorage.setItem(ZKLOGIN_OAUTH_STATE_KEY, JSON.stringify(value));
}

export function loadZkLoginOAuthState() {
  return readStorageJson<ZkLoginOAuthState>(window.sessionStorage, ZKLOGIN_OAUTH_STATE_KEY);
}

export function clearZkLoginOAuthState() {
  window.sessionStorage.removeItem(ZKLOGIN_OAUTH_STATE_KEY);
}

export function saveZkLoginSession(value: ZkLoginSession) {
  writeStorageJson(window.sessionStorage, ZKLOGIN_SESSION_KEY, value);
}

export function clearZkLoginSession() {
  window.sessionStorage.removeItem(ZKLOGIN_SESSION_KEY);
}

export function loadZkLoginSession() {
  const session = readStorageJson<ZkLoginSession>(window.sessionStorage, ZKLOGIN_SESSION_KEY);
  if (!session) {
    return null;
  }
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearZkLoginSession();
    return null;
  }
  return session;
}
