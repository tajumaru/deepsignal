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

Run lint only:

```bash
npm run lint
```

Run both quality gates together:

```bash
npm run check
```

This is intentionally separated from Vite dev mode because Vite does not guarantee a full TypeScript type check during normal development, and `npm run check` is the safest pre-submission pass.

## Future CI notes

- `npm run typecheck` is isolated so it can be dropped directly into GitHub Actions or other CI jobs as an explicit quality gate.
- `npm run lint` uses the flat ESLint config for TypeScript, React hooks, and React refresh safety.
- `npm run check` combines the submission-safe static checks in one command.
- `npm run build` depends on `npm run typecheck`, which keeps local builds and CI builds aligned.

## .env example

Copy `.env.example` and fill in the Walrus endpoints if you want live blob storage:

```bash
VITE_STORAGE_MODE=walrus
VITE_WALRUS_STORAGE_MODE=uploadRelay
VITE_WALRUS_NETWORK=testnet
VITE_WALRUS_UPLOAD_RELAY_URL=https://upload-relay.testnet.walrus.space
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_WALRUS_UPLOAD_RELAY_TIP_MAX=1000000
VITE_WALRUS_STORAGE_EPOCHS=5
VITE_SEAL_MODE=mock
VITE_SEAL_PACKAGE_ID=
VITE_SEAL_KEY_SERVER_OBJECT_ID=
VITE_SEAL_AGGREGATOR_URL=
VITE_SUI_FULLNODE_URL=https://fullnode.testnet.sui.io:443
VITE_WALFORM_PACKAGE_ID=
VITE_PACKAGE_ID=
VITE_REGISTRY_ID=
VITE_ADMIN_CAP_ID=
VITE_OWNER_CAP_ID=
```

If `VITE_STORAGE_MODE` is not `walrus`, or the required Walrus URLs are missing, the app runs entirely on `localStorage`.

`VITE_WALRUS_NETWORK` accepts `testnet` or `mainnet`. Switch `VITE_WALRUS_UPLOAD_RELAY_URL`, `VITE_WALRUS_AGGREGATOR_URL`, and `VITE_SUI_FULLNODE_URL` to the matching network when you promote from testnet to mainnet.

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

- Provider setup lives in [src/providers.tsx](./src/providers.tsx)
- Header wallet UI lives in [src/components/WalletConnect.tsx](./src/components/WalletConnect.tsx)
- Shared Sui helpers live in [src/lib/sui.ts](./src/lib/sui.ts)

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

## Sui Move access control

DeepSignal now includes a Move package for capability-based wallet access control on Sui.

- Move package lives in [move/deepsignal_access](./move/deepsignal_access)
- module name is `deepsignal::access_control`
- package publish creates and shares one `Registry` object
- package publish also mints the initial `OwnerCap` to the publishing wallet during `init`
- `Registry` stores the active owner, admin list, and reviewer list, including wallet address plus cap object id
- `OwnerCap` holders can add and remove `AdminCap`
- `OwnerCap` holders can add and remove `ReviewerCap`
- `AdminCap` holders can add and remove `ReviewerCap`
- revocation is enforced against the `Registry`, so an old cap object left in a wallet is no longer active after removal
- `OwnerCap` and `AdminCap` holders can use admin surfaces
- `ReviewerCap` holders can use review surfaces, but cannot use admin-only creation or destructive controls

## Sui Project Registry extension

The Move package now also includes `deepsignal::project_registry` so DeepSignal can manage Signals per project without placing sensitive payloads onchain.

- `Project` is a shared object with `project_id`, `name`, `owner`, `admins`, `forms_count`, `signals_count`, and `created_at`
- `ProjectOwnerCap` is minted per project creator and gates project-level admin management
- `Form` lives under a project and stores only lightweight metadata such as `title`, `metadata_digest`, `created_at`, and `active`
- `SignalReceipt` stores `project_id`, `form_id`, `walrus_blob_id`, `metadata_digest`, `encrypted`, optional `seal_identity`, `created_at`, optional submitter identity, and compact status
- form config, submission body, screenshots, and attachments remain off-chain in Walrus / local fallback storage
- the onchain receipt exists for authorization, existence proofs, and future Seal policy expansion

### Project registry permissions

- project creation is not public: it requires an active global `OwnerCap` or `AdminCap` from `deepsignal::access_control`
- project owners can add and remove project admins through `ProjectOwnerCap`
- project owners and project admins can create forms and update signal status
- signal registration is public, but only succeeds while the target form is active
- this keeps `/f/:formId`, roadmap views, and restore flows wallet-optional at the product layer while preserving an onchain policy anchor when a submitter does use Sui

### Project registry events

- `ProjectCreated`
- `AdminAdded`
- `AdminRemoved`
- `FormCreated`
- `FormStatusChanged`
- `SignalRegistered`
- `SignalStatusUpdated`

### Frontend env

Set these client env vars after publish:

```bash
VITE_SUI_NETWORK=testnet
VITE_RPC_URL=https://fullnode.testnet.sui.io:443
VITE_PACKAGE_ID=0x...
VITE_REGISTRY_ID=0x...
VITE_ADMIN_CAP_ID=
VITE_OWNER_CAP_ID=
```

`VITE_ADMIN_CAP_ID` and `VITE_OWNER_CAP_ID` are optional helper envs for operator tooling and manual transaction flows. The normal app path still discovers active cap objects from the connected wallet.

When `VITE_PACKAGE_ID` is configured, the frontend checks the connected wallet's owned objects and matches them against the shared `Registry` for:

- `OwnerCap`
- `AdminCap`
- `ReviewerCap`

Behavior is:

- `OwnerCap`: admin UI and review UI enabled, can add/remove `AdminCap`, and can add/remove `ReviewerCap`
- `AdminCap`: admin UI and review UI enabled, and can add/remove `ReviewerCap`
- `ReviewerCap` only: review UI enabled, admin-only actions disabled
- no cap: `Access Denied`

If `VITE_PACKAGE_ID` is not configured, the app falls back to the older wallet/owner-address behavior so local and demo flows keep working.

### Publish and setup on Sui testnet

1. Install a Sui CLI version aligned with testnet and fund the deployer wallet.
2. From [move/deepsignal_access](./move/deepsignal_access), publish the package:

```bash
cd move/deepsignal_access
sui client publish --gas-budget 50000000
```

3. Save the published package ID as `VITE_PACKAGE_ID`.
4. In the publish output, find the newly shared `Registry` object ID and save it as `VITE_REGISTRY_ID`.
5. Set `VITE_SUI_NETWORK` and, if needed, `VITE_RPC_URL` for the target fullnode.
6. Restart the Vite app so the new env values are loaded.
7. Connect the publisher wallet. It should immediately have the initial `OwnerCap`.
8. Open `/admin` and use the `Access Management` panel to review active Owner/Admin/Reviewer entries.
9. From the same panel, an owner wallet can add/remove admins and add/remove reviewers.
10. Connect an admin wallet to verify that it can add/remove reviewers, but cannot remove admins.

Notes:

- `Move.toml` currently pins the `Sui` framework to `testnet`; if you publish against a different network or CLI snapshot, align the dependency revision first.
- `deepsignal::project_registry` builds on the same package and global access registry, so the older access-control-only deployment flow stays compatible.
- public responder routes such as `/f/:formId`, roadmap pages, and manifest restore remain wallet-optional.
- storage and Seal behavior are unchanged; access control only gates creator/reviewer surfaces.

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
- when `VITE_PACKAGE_ID` is configured, creator/reviewer access is gated by owned `OwnerCap` / `AdminCap` / `ReviewerCap` objects that are still active in the configured Move `Registry`
- `OwnerCap` holders can access admin creation flows and review flows
- `OwnerCap` holders can add/remove `AdminCap`
- `OwnerCap` holders can add/remove `ReviewerCap`
- `AdminCap` holders can add/remove `ReviewerCap`
- `AdminCap` holders can access admin creation flows and review flows
- `ReviewerCap` holders can access review flows only
- when no matching cap is found, the UI shows `Access denied`
- if Move access control env is not configured, creator inbox pages fall back to the older `form.ownerAddress` match behavior
- older forms without `ownerAddress` are still treated as legacy demo forms in fallback mode and remain visible with a warning
- `/f/:formId` stays public and does not require a wallet
- new form creation requires a connected wallet and always stores `ownerAddress`

## Walrus integration

Walrus storage lives in:

- [src/storage/walrusAdapter.ts](./src/storage/walrusAdapter.ts)
- [src/storage/storageFactory.ts](./src/storage/storageFactory.ts)
- [src/storage/blobIndex.ts](./src/storage/blobIndex.ts)

### How it works

- Form definitions are serialized with `JSON.stringify(...)` and stored through the Walrus TypeScript SDK.
- In the default `uploadRelay` mode, the browser uses the connected wallet to register and certify storage transactions while the upload relay forwards blob data to storage nodes.
- Submissions are serialized and stored the same way.
- Attachments are uploaded as raw files through the same SDK flow.
- Each form also gets a separate manifest blob that acts as a recoverable index.
- `blobId` values from successful SDK writes are stored back into the existing form, submission, encrypted-payload, and attachment models.
- If you need the old publisher HTTP flow for compatibility, set `VITE_WALRUS_STORAGE_MODE=publisher` and keep `VITE_WALRUS_PUBLISHER_URL` configured.

### Upload relay notes

- `VITE_WALRUS_UPLOAD_RELAY_URL` is not a publisher endpoint replacement. The app no longer writes to `PUT /v1/blobs` when `uploadRelay` mode is active.
- The relay only forwards encoded data to Walrus storage nodes. Onchain blob registration and certification still happen through the SDK and the end-user wallet.
- Mainnet uploads require the connected wallet to hold enough balance for Walrus storage cost, relay tip, and Sui gas.
- Public responder routes remain wallet-optional because failed Walrus writes still fall back to the local adapter when Walrus is not strictly required.

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

- [src/crypto/sealAdapter.ts](./src/crypto/sealAdapter.ts)
- [src/crypto/localSealMock.ts](./src/crypto/localSealMock.ts)
- [src/crypto/sealClientAdapter.ts](./src/crypto/sealClientAdapter.ts)
- [src/crypto/cryptoFactory.ts](./src/crypto/cryptoFactory.ts)

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
- production should keep evolving around the Move Project / Form / SignalReceipt registry model
- real Seal decrypt requires wallet/session approval
