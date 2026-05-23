import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { deriveZkLoginIdentityFromIdToken } from "../lib/zkloginAddress";
import { consumeGoogleZkLoginOAuthState, exchangeGoogleCodeForIdToken } from "../lib/zkloginOAuth";
import { saveZkLoginSession } from "../lib/zkloginSession";

export function ZkLoginCallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(t("zkLoginCallbackFinalizing"));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      const oauthError = searchParams.get("error");
      const oauthErrorDescription = searchParams.get("error_description");
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (oauthError) {
        throw new Error(oauthErrorDescription || oauthError);
      }
      if (!code || !state) {
        throw new Error(t("zkLoginCallbackMissingCode"));
      }

      const oauthState = consumeGoogleZkLoginOAuthState(state);
      setStatus(t("zkLoginCallbackExchanging"));
      const idToken = await exchangeGoogleCodeForIdToken(code, oauthState);
      setStatus(t("zkLoginCallbackDeriving"));
      const identity = await deriveZkLoginIdentityFromIdToken(idToken, oauthState.nonce);
      if (cancelled) {
        return;
      }
      saveZkLoginSession({
        provider: "google",
        address: identity.address,
        iss: identity.iss,
        aud: identity.aud,
        subHash: identity.subHash,
        expiresAt: identity.expiresAt,
      });
      navigate(oauthState.returnTo, { replace: true });
    }

    void finalize().catch((callbackError) => {
      if (cancelled) {
        return;
      }
      setError(callbackError instanceof Error ? callbackError.message : t("zkLoginCallbackFailedGeneric"));
      setStatus(t("zkLoginCallbackFailed"));
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, t]);

  return (
    <div className="panel glow-panel route-status-panel" role={error ? "alert" : "status"}>
      <p className="eyebrow">{t("zkLoginCallbackEyebrow")}</p>
      <h1>{status}</h1>
      <p className="muted">
        {error || t("zkLoginCallbackVerifyingBody")}
      </p>
    </div>
  );
}
