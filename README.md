# DeepSignal - Walrus Feedback Lab

DeepSignal is a Walrus-native feedback and forms MVP built with Vite, React, and TypeScript. It supports custom public forms, an encrypted Signal Inbox review console, public roadmap publishing, feedback triage workflows, contributor tracking, sensitive-field encryption, file uploads, JSON/CSV export, and a dual storage strategy that prefers Walrus while falling back to `localStorage` when needed.

## How to run

```bash
npm install
npm run typecheck
npm run dev
```

For a production bundle:

```bash
npm run build
```

`npm run build` always runs `npm run typecheck` first, so the production build fails fast if the TypeScript project does not pass a full type check.

## Quality checks

Use the standalone type check when you want a quick submission-safe verification without starting Vite:

```bash
npm run typecheck
```

This is intentionally separated from Vite dev mode because Vite does not guarantee a full TypeScript type check during normal development.

## Future CI notes

- `npm run typecheck` is isolated so it can be dropped directly into GitHub Actions or other CI jobs as an explicit quality gate.
- `npm run build` depends on `npm run typecheck`, which keeps local builds and CI builds aligned.
- TODO: add ESLint with a dedicated `lint` script, then wire both `npm run typecheck` and `npm run lint` into CI.

## .env example

Copy `.env.example` and fill in the Walrus endpoints if you want live blob storage:

```bash
VITE_STORAGE_MODE=walrus
VITE_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_SEAL_MODE=mock
VITE_SEAL_PACKAGE_ID=
VITE_SEAL_KEY_SERVER_OBJECT_ID=
VITE_SEAL_AGGREGATOR_URL=
VITE_SUI_NETWORK=testnet
VITE_WALFORM_PACKAGE_ID=
```

If `VITE_STORAGE_MODE` is not `walrus`, or the Walrus URLs are missing, the app runs entirely on `localStorage`.

If `VITE_SEAL_MODE` is not `seal`, or the Seal env vars are incomplete, the app keeps using the local mock adapter.

## Current MVP features

- Landing page at `/`
- Form builder at `/admin/forms/new`
- Public form route at `/f/:formId`
- Public roadmap route at `/roadmap/:formId`
- Manifest restore route at `/m/:manifestBlobId`
- Admin Signal Inbox at `/admin`
- Dashboard alias at `/dashboard`
- Submission list at `/admin/forms/:formId`
- Submission detail at `/admin/forms/:formId/submissions/:submissionId`
- Alias detail route at `/admin/submissions/:submissionId`
- Rich inputs for rating, screenshot, and video
- URL sharing and QR code generation
- Sui Wallet connect for form creators via Mysten dApp Kit
- JSON and CSV export
- Signal triage workflow: `new`, `investigating`, `planned`, `in_progress`, `fixed`, `closed`
- Admin-side priority, tags, internal notes, signal value, and GitHub URL editing
- Summary cards for total signals, new signals, planned, fixed, high-value, and average signal value
- Contributor identity capture using wallet address or anonymous fallback id
- Public roadmap publishing for `planned`, `in_progress`, and `fixed` signals
- Sensitive-field encryption through a swappable crypto adapter
- Walrus blob ids surfaced in the UI
- Desktop-first creator review console with mobile-friendly public forms

## Sui Wallet integration

This Vite app exposes wallet connect through Mysten's React dApp Kit.

- Provider setup lives in [src/providers.tsx](D:/game/deepsignal/src/providers.tsx)
- Header wallet UI lives in [src/components/WalletConnect.tsx](D:/game/deepsignal/src/components/WalletConnect.tsx)
- Shared Sui helpers live in [src/lib/sui.ts](D:/game/deepsignal/src/lib/sui.ts)

Current behavior:

- creators can connect a Wallet Standard compatible Sui wallet
- the connected address is shown in the header and dashboard
- the form builder includes a `Create on Sui` toggle
- new form creation now requires a connected wallet
- every newly created form stores `ownerAddress` from the connected wallet
- the `Create on Sui` toggle remains as a `Sui registry integration placeholder`
- public respondents do not need a wallet to submit
- when a public respondent has a connected wallet, its address is stored as `contributorId`
- when no wallet is available, submissions get an `anonymous-xxxxxx` contributor id

Because this project uses Vite rather than Next.js, the wallet env vars use the `VITE_` prefix.

## Demo flow

1. Connect wallet
2. Create form
3. Open public link
4. Submit feedback with screenshot
5. Open Admin Dashboard
6. Triage signals in the Signal Inbox
7. Add priority, tags, internal notes, signal value, and optional GitHub links
8. Open the public roadmap for planned / in-progress / fixed signals
9. Inspect Walrus / Seal / Wallet metadata in the right-side detail panel

## Inbox UI

- The admin console is designed as an `Encrypted Signal Inbox`, not a form CRUD panel.
- Admin and dashboard routes use a desktop-first 3-column layout: `Signal Streams`, `Signal Inbox`, and `Signal Detail / Metadata`.
- The detail pane acts as a lightweight `Feedback Operations Platform` control surface.
- Admins can update `triageStatus`, `priority`, `tags`, `notes`, `signalValue`, and draft GitHub links from the detail pane.
- A save-state indicator shows whether signal operations are ready, saving, saved, or failed.
- Header actions include `Open Public Roadmap` for the currently selected form.
- Public forms remain mobile-friendly for responders.
- Admin review console is desktop-first, and below `768px` it falls back to a single-column review stack with a notice.
- Walrus / Seal metadata is integrated directly into the normal review UI through badges, metadata rows, and the Seal Status card.

## Feedback operations model

Each submission now supports an operations layer in addition to form answers:

- `triageStatus`: `new`, `investigating`, `planned`, `in_progress`, `fixed`, `closed`
- `priority`: `low`, `medium`, `high`
- `tags`: string array for grouping and filtering
- `notes`: internal notes for operators
- `contributorId`: wallet address when available, otherwise anonymous fallback id
- `signalValue`: optional score from `1` to `5`
- `githubIssueUrl`: optional prep field for future GitHub integration
- `githubPrUrl`: optional prep field for future GitHub integration

Backward compatibility is handled in `normalizeSubmission`, so older submissions without these fields still load safely.

## Public roadmap

DeepSignal can expose a public roadmap per form at `/roadmap/:formId`.

- Only submissions with `triageStatus` of `planned`, `in_progress`, or `fixed` are shown
- Signals are grouped into `Planned Signals`, `In Progress`, and `Fixed Signals`
- Cards can show subject/title preview, category, priority, createdAt, tags, contributor label, signal value, and GitHub links
- If a submission is encrypted, the roadmap never shows the answer body and only exposes metadata such as `subjectPreview`

## Admin protection

- `/admin` and `/dashboard` views require a connected wallet
- creator inbox pages are wallet-gated on `form.ownerAddress`
- when `form.ownerAddress` matches the connected wallet, the inbox is visible
- when it does not match, the UI shows `Access denied. This signal belongs to another creator.`
- older forms without `ownerAddress` are treated as legacy demo forms and remain visible with a warning
- `/f/:formId` stays public and does not require a wallet
- new form creation requires a connected wallet and always stores `ownerAddress`

## Walrus integration

Walrus storage lives in:

- [src/storage/walrusAdapter.ts](D:/game/deepsignal/src/storage/walrusAdapter.ts)
- [src/storage/storageFactory.ts](D:/game/deepsignal/src/storage/storageFactory.ts)
- [src/storage/blobIndex.ts](D:/game/deepsignal/src/storage/blobIndex.ts)

### How it works

- Form definitions are serialized with `JSON.stringify(...)` and uploaded to `PUT {publisher}/v1/blobs`.
- Submissions are serialized and uploaded the same way.
- Attachments are uploaded as raw files.
- Each form also gets a separate manifest blob that acts as a recoverable index.
- Walrus response parsing supports these blob id shapes:
  - `result.newlyCreated.blobObject.blobId`
  - `result.alreadyCertified.blobId`
  - `blobId`
  - `id`

### Manifest Blob architecture

The manifest blob is a public recovery index, not an access-control layer.

Each manifest stores only:

- `formId`
- `submissionId`
- `formBlobId`
- `submission blobId`
- `createdAt`
- `updatedAt`

It intentionally does not store:

- answers
- attachments or attachment metadata
- notes
- tags
- triage status indexes
- contributor ids
- signal value
- GitHub links
- ownerAddress
- encryptedBlobId
- file names

The actual form and submission payloads stay in Walrus blobs, and sensitive payloads should use Seal encryption.

### Recovery flow

- On form creation, the app stores the form blob, writes an initial manifest blob, and caches the latest `manifestBlobId` locally.
- On each submission save or submission update, the app writes a new immutable manifest blob and updates the local latest-manifest pointer.
- Opening `/m/:manifestBlobId` reads the manifest from Walrus, reloads the form blob plus referenced submission blobs, rebuilds the browser cache, and redirects to `/dashboard/forms/:formId`.

### localStorage is cache only

Walrus is blob storage, so the browser keeps a small local cache for UX and a latest-manifest pointer for each known form.

Local cache is used for:

- cached form payloads
- cached submission payloads
- latest `manifestBlobId` lookup
- legacy local blob index compatibility

Older forms that do not have a manifest pointer are treated as legacy local-index forms so existing `/f/:formId`, `/dashboard`, and `/admin/forms/:formId` flows keep working.

## CSV export behavior

CSV export remains compatible and now includes operational metadata columns before form-answer columns:

- `submissionId`
- `createdAt`
- `status`
- `triageStatus`
- `priority`
- `signalValue`
- `contributorId`
- `tags`
- `notes`
- `githubIssueUrl`
- `githubPrUrl`

## Local fallback behavior

The app chooses storage like this:

- `Walrus` when `VITE_STORAGE_MODE=walrus` and both Walrus URLs are configured
- `Local fallback` otherwise

If a Walrus write fails at runtime:

- the error is logged with `console.error(...)`
- the write falls back to `localStorage`
- the UI shows `Walrus upload failed. Saved locally instead.`

This means the MVP still works even without Walrus configuration or during transient Walrus failures.

## Blob ids and blob viewer URLs

Blob ids are shown in the Signal Inbox list and detail flows.

When the blob is a real Walrus blob and an aggregator URL is configured, the UI also shows a `Verify on Walrus` link that points to:

```text
{VITE_WALRUS_AGGREGATOR_URL}/v1/blobs/{blobId}
```

## Seal / crypto adapter structure

The encryption layer is intentionally adapter-based:

- [src/crypto/sealAdapter.ts](D:/game/deepsignal/src/crypto/sealAdapter.ts)
- [src/crypto/localSealMock.ts](D:/game/deepsignal/src/crypto/localSealMock.ts)
- [src/crypto/sealClientAdapter.ts](D:/game/deepsignal/src/crypto/sealClientAdapter.ts)
- [src/crypto/cryptoFactory.ts](D:/game/deepsignal/src/crypto/cryptoFactory.ts)

Current behavior:

- fields marked `sensitive: true` are encrypted before submission save
- `VITE_SEAL_MODE=mock` uses the legacy local adapter that base64-wraps values for development and fallback flows
- `VITE_SEAL_MODE=seal` uses `@mysten/seal` for new encryptions when `VITE_SEAL_PACKAGE_ID`, `VITE_SEAL_KEY_SERVER_OBJECT_ID`, and `VITE_SEAL_AGGREGATOR_URL` are all configured
- encrypted answers are stored as:

```json
{
  "value": "encrypted_text",
  "encrypted": true
}
```

- decryption happens only in the admin detail view

In real Seal mode, payloads are saved as JSON envelopes that include the base64-encoded Seal ciphertext plus the metadata needed for a later wallet-backed decrypt flow.

### Mock vs real Seal

- Mock Seal is reversible locally and exists to keep dev, demos, and fallback mode working without any wallet or onchain policy.
- Real Seal encrypts with `@mysten/seal` and depends on a real Sui package namespace plus one or more key server objects.
- Real Seal decryption is policy-gated: you need a Sui wallet, a session key, and an approval transaction that calls a `seal_approve*` Move function for the target access policy.

## Seal mode in the UI

- the admin dashboard and submission detail surfaces a Seal Status Card
- the card shows `requestedMode`, `activeMode`, `isFallback`, and `warning`
- the card also shows encryption state, `encryptedBlobId`, and wallet access context
- encrypted forms highlight `Encrypted payload stored` plus the `encryptedBlobId`
- mock mode shows `Demo decrypt available`
- real seal mode shows `Policy-gated Decryption` and `Wallet/session approval required`
- decrypt failures should explain the missing wallet or approval condition instead of ending with a generic error

### Current limitations of real Seal mode

- Encryption is wired up now, but the in-app decrypt path is intentionally staged. The admin UI currently stops with a clear `Seal decryption requires wallet approval.` error until wallet/session approval plumbing is added.
- Because decrypt approval is not finished yet, real Seal mode is currently best for testing write-path compatibility and persisted payload format, not full end-to-end review.
- If you switch back to mock mode, older mock-encrypted payloads remain readable, but real Seal payloads will correctly report that seal mode plus wallet approval is required.

## Known limitations

- `manifestBlobId` holders can inspect the manifest index structure.
- Attachment blob ids are intentionally not stored in manifests, so restore is limited to the submission blobs themselves.
- Latest `manifestBlobId` tracking still depends on localStorage for the current browser.
- Local fallback data is browser-local and not shared across devices.
- Walrus delete is currently index cleanup only; uploaded blobs are not garbage-collected by this MVP.
- frontend wallet-gating is MVP protection
- production should verify ownership with a Sui Move Form Registry
- real Seal decrypt requires wallet/session approval
