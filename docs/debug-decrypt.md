# Debugging Private Signal Decrypt Failures

DeepSignal logs private signal decrypt diagnostics with the `"[decrypt-diagnostic]"` prefix.
The admin UI intentionally shows only a short reason code, for example:

```text
Decrypt failed: ACCESS_POLICY_MISMATCH
```

Use the browser console for structured details such as `formId`, `responseId`, `manifestBlobId`,
`encryptedBlobId`, `network`, wallet address, Seal package/object metadata, payload shape,
ciphertext size, timestamp, gateway, source, and serialized raw errors.

## Reason Codes

`WALRUS_BLOB_FETCH_FAILED`

The encrypted payload blob could not be read from Walrus or local fallback storage. Check the
`encryptedBlobId`, configured aggregator gateway, fallback gateways, and browser console entries
with the `"[walrus read]"` prefix. Walrus blob reads retry three total attempts per gateway.

`MANIFEST_NOT_FOUND`

The submission says it is encrypted, but DeepSignal could not find an inline payload or encrypted
payload blob reference. Check the form manifest, submission metadata, and older local cache records.

`INVALID_ENCRYPTED_PAYLOAD`

The payload is not valid JSON, is not a supported `deepsignal.real-seal` envelope, is missing required
Seal fields, has an unsupported version, or decrypts into an invalid private submission JSON body.
Inspect `encryptedPayloadShape` in the console. Do not paste ciphertext into shared tickets.

`WALLET_NOT_CONNECTED`

The admin attempted to decrypt without a wallet address in the decrypt context. Connect the reviewer,
admin, or owner wallet and retry once.

`WRONG_NETWORK`

The wallet, package, or configured endpoint appears to be on the wrong Sui/Walrus network. Compare
`VITE_SUI_NETWORK`, `VITE_WALRUS_NETWORK`, Walrus aggregator URLs, and the deployed package IDs.

`ACCESS_POLICY_MISMATCH`

Seal approval failed because the wallet does not satisfy the project owner/admin/reviewer policy, the
payload is bound to a different project/access object, or the envelope policy metadata does not match
the expected Move approval path. Check `packageId`, `policyId`, `accessObjectId`, `projectId`, and reviewer caps.

`SEAL_CLIENT_ERROR`

The Seal client or required runtime dependency is missing or misconfigured. Check
`VITE_SEAL_PACKAGE_ID`, `VITE_SEAL_KEY_SERVER_OBJECT_ID`, `VITE_SEAL_SERVER_TYPE`, and
`VITE_SEAL_AGGREGATOR_URL` when using committee servers.

`DECRYPTION_KEY_UNAVAILABLE`

The wallet/session-key/key-server flow did not provide usable decrypt keys. Look for session key,
signature, key server, or approval errors in the `"[seal-client]"` console entries.

`DECRYPTION_FAILED_UNKNOWN`

The failure did not match a known class. Use the structured raw error fields in the console:
`error.name`, `error.message`, `error.stack`, `cause`, and nested raw SDK errors.

## Checklist

1. Open the admin inbox and reproduce the unlock failure once. Avoid repeated decrypt clicks; the UI already blocks concurrent decrypts.
2. Filter the browser console for `decrypt-diagnostic`, `seal-client`, and `walrus read`.
3. Confirm `formId`, `responseId`, `manifestBlobId`, `encryptedBlobId`, `network`, `walletAddress`, `packageId`, and `accessObjectId`.
4. If the reason is Walrus-related, open the configured aggregator URL for the blob and compare with any fallback aggregator.
5. If the reason is access-related, verify the connected wallet owns the project owner/admin cap or the reviewer cap for the project.
6. If the reason is payload-related, inspect only the logged payload shape and sizes. Do not expose full ciphertext or decrypted content in tickets.
7. In production builds, mock/fake Seal adapters are rejected. Test mocks must stay under `tests/mocks`.

## Related Env Vars

```text
VITE_STORAGE_MODE=walrus
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_WALRUS_FALLBACK_AGGREGATOR_URLS=https://another-aggregator.example
VITE_WALRUS_UPLOAD_RELAY_URL=https://upload-relay.testnet.walrus.space
VITE_SUI_NETWORK=testnet
VITE_SEAL_PACKAGE_ID=0x...
VITE_SEAL_KEY_SERVER_OBJECT_ID=0x...
VITE_SEAL_SERVER_TYPE=independent
```
