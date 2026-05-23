import { clearZkLoginOAuthState, loadZkLoginOAuthState, saveZkLoginOAuthState, type ZkLoginOAuthState } from "./zkloginSession";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

function toBase64Url(bytes: Uint8Array) {
  const text = btoa(String.fromCharCode(...bytes));
  return text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createRandomString(byteLength = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function createCodeChallenge(codeVerifier: string) {
  const encoded = new TextEncoder().encode(codeVerifier);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return toBase64Url(digest);
}

function getGoogleClientId() {
  const clientId = String(import.meta.env.VITE_ZKLOGIN_GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new Error("Google zkLogin client ID is not configured.");
  }
  return clientId;
}

function getGoogleRedirectUri() {
  const redirectUri = String(import.meta.env.VITE_ZKLOGIN_REDIRECT_URI || "").trim();
  if (!redirectUri) {
    throw new Error("Google zkLogin redirect URI is not configured.");
  }
  return redirectUri;
}

export function isZkLoginEnabled() {
  return String(import.meta.env.VITE_ZKLOGIN_ENABLE || "").toLowerCase() === "true";
}

export async function beginGoogleZkLogin(returnTo: string) {
  const state: ZkLoginOAuthState = {
    state: createRandomString(24),
    nonce: createRandomString(24),
    codeVerifier: createRandomString(48),
    returnTo,
    createdAt: new Date().toISOString(),
  };
  const codeChallenge = await createCodeChallenge(state.codeVerifier);
  const clientId = getGoogleClientId();
  const redirectUri = getGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DEFAULT_SCOPES.join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: state.state,
    nonce: state.nonce,
    access_type: "offline",
    prompt: "select_account",
  });
  saveZkLoginOAuthState(state);
  window.location.assign(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

export function consumeGoogleZkLoginOAuthState(expectedState: string) {
  const oauthState = loadZkLoginOAuthState();
  clearZkLoginOAuthState();
  if (!oauthState) {
    throw new Error("zkLogin sign-in state could not be restored.");
  }
  if (oauthState.state !== expectedState) {
    throw new Error("zkLogin sign-in state did not match this session.");
  }
  return oauthState;
}

export async function exchangeGoogleCodeForIdToken(code: string, oauthState: ZkLoginOAuthState) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    code_verifier: oauthState.codeVerifier,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || "Google token exchange failed.");
  }
  return payload.id_token;
}
