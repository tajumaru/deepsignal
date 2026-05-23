# zkLogin Respondent QA

This runbook covers the lightweight A-plan zkLogin respondent flow on the public answer page.

Current scope:

- Google OAuth
- derived zkLogin address
- submission metadata only
- no zk proof
- no zkLogin signature
- no responder-side on-chain transaction

## What This QA Should Confirm

- Public responder routes remain wallet-optional.
- Guest submission still works.
- Existing Sui Wallet submission still works.
- Google zkLogin can be used on `anonymous_allowed` forms.
- zkLogin respondent metadata is saved correctly.
- `wallet_required` forms still reject zkLogin-only submission.
- No JWT or OAuth token is stored in submission payloads.

## Required Environment

Set these values in `.env`:

```bash
VITE_ZKLOGIN_ENABLE=true
VITE_ZKLOGIN_GOOGLE_CLIENT_ID=...
VITE_ZKLOGIN_REDIRECT_URI=http://localhost:5173/auth/zklogin/callback
VITE_ZKLOGIN_SALT_SERVICE_URL=https://your-salt-service.example.com/zklogin
VITE_ZKLOGIN_MAX_EPOCH_OFFSET=2
```

Recommended for responder testing:

```bash
VITE_WALRUS_STORAGE_MODE=publisher
```

Notes:

- `uploadRelay` can still work, but responder-side runtime wallet readiness may push zkLogin submissions toward local fallback more often.
- If `VITE_ZKLOGIN_SALT_SERVICE_URL` is omitted, DeepSignal uses a deterministic fallback salt intended for development only.

## Google OAuth Setup

Configure the Google OAuth client with:

- Authorized JavaScript origin:
  - `http://localhost:5173`
- Authorized redirect URI:
  - `http://localhost:5173/auth/zklogin/callback`

If you use a deployed preview or production app, update both values to match the real public origin and callback URL exactly.

## Salt Service Expectations

The salt endpoint is expected to accept:

```json
{
  "provider": "google",
  "iss": "https://accounts.google.com",
  "aud": "<google client id>",
  "sub": "<google subject>"
}
```

And return one of:

```json
{ "userSalt": "123456789" }
```

or

```json
{ "salt": "123456789" }
```

## Test Data Setup

Create two forms:

1. Wallet-optional form
   - `identityPolicy = anonymous_allowed`
   - at least one required text field

2. Wallet-required form
   - `identityPolicy = wallet_required`
   - at least one required text field

## Manual Test Cases

### 1. Guest submission still works

1. Open the wallet-optional public form.
2. Do not connect wallet.
3. Do not use Google zkLogin.
4. Submit a valid response.

Expected:

- Submission succeeds.
- Admin view shows `Anonymous respondent`.
- CSV export shows:
  - `respondentAddress` empty
  - `respondentIdentity = anonymous`

### 2. Sui Wallet submission still works

1. Open the wallet-optional public form.
2. Connect a Sui wallet.
3. Enable verified identity attachment.
4. Submit a valid response.

Expected:

- Submission succeeds.
- Admin view shows wallet-derived address.
- Identity label is `Wallet verified`.
- CSV export shows:
  - `respondentAddress = <wallet address>`
  - `respondentIdentity = sui_wallet`
  - `identityProvider` empty

### 3. zkLogin submission works on wallet-optional forms

1. Open the wallet-optional public form.
2. Click `Continue with Google`.
3. Complete Google OAuth.
4. Return to `/f/:formId`.
5. Submit a valid response.

Expected:

- Callback returns to the originating public form.
- Submission succeeds without requiring Sui wallet connection.
- Admin view shows derived address and `Google zkLogin`.
- CSV export shows:
  - `respondentAddress = <derived zkLogin address>`
  - `respondentIdentity = zklogin`
  - `identityProvider = google`

## 4. wallet_required still rejects zkLogin-only submission

1. Open the wallet-required public form.
2. Complete Google zkLogin.
3. Do not connect a Sui wallet.
4. Try to submit.

Expected:

- Submission is blocked.
- Error says wallet connection is required.
- No submission is saved.

## 5. Expired zkLogin session does not silently downgrade

1. Complete Google zkLogin on a wallet-optional form.
2. Clear or expire the stored `deepsignal.zklogin.session` value in `sessionStorage`.
3. Submit without reconnecting.

Expected:

- Submission is blocked.
- Error indicates the Google zkLogin session expired.
- The flow does not silently save as anonymous.

## 6. Callback error path is public-safe

1. Open:

```text
/auth/zklogin/callback?error=access_denied&error_description=Google%20sign-in%20was%20canceled.
```

Expected:

- Page shows a recoverable error.
- No session is saved.
- No crash or blank page.

## What To Inspect In Admin

- `FormSubmissionsPage`
  - respondent address visible for wallet and zkLogin responses
  - identity label shows `Wallet verified` or `Google zkLogin`
- `SecondaryInspector`
  - `Respondent identity`
  - `Identity type`
  - `Anonymous`

## What To Inspect In Export

- `respondentAddress`
- `respondentIdentity`
- `identityProvider`
- `isAnonymous`

## Browser Storage Checks

Should exist temporarily:

- `sessionStorage["deepsignal.zklogin.session"]`
- `sessionStorage["deepsignal.zklogin.oauthState"]`

Should not appear in saved submissions:

- raw Google `id_token`
- access token
- refresh token
- code verifier
- nonce secret material

## Troubleshooting

### Redirect mismatch

Symptoms:

- Google returns `redirect_uri_mismatch`

Check:

- `VITE_ZKLOGIN_REDIRECT_URI`
- Google OAuth redirect URI configuration

### Salt service failure

Symptoms:

- callback fails after Google auth
- error mentions salt service

Check:

- `VITE_ZKLOGIN_SALT_SERVICE_URL`
- response shape includes `userSalt` or `salt`

### Nonce validation failure

Symptoms:

- callback fails with nonce validation message

Check:

- same browser tab/session was used through the OAuth round-trip
- `deepsignal.zklogin.oauthState` was not cleared early

### Local fallback instead of remote save

Symptoms:

- submission succeeds but uses local blob IDs

Check:

- `VITE_WALRUS_STORAGE_MODE`
- upload relay wallet readiness
- Walrus write configuration

## Recommended Sign-off

Before enabling zkLogin in a shared environment, confirm:

- Guest flow passed
- Sui Wallet flow passed
- zkLogin wallet-optional flow passed
- `wallet_required` rejection passed
- CSV export fields look correct
- Admin identity labels look correct
- No token material appears in submission storage
