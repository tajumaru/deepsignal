# DeepSignal - Walrus Feedback Lab

DeepSignal is a Walrus-native feedback and forms MVP built with Vite, React, and TypeScript. It supports custom public forms, admin review flows, sensitive-field encryption, file uploads, JSON/CSV export, and a dual storage strategy that prefers Walrus while falling back to `localStorage` when needed.

## How to run

```bash
npm install
npm run dev
```

For a production bundle:

```bash
npm run build
```

## .env example

Copy `.env.example` and fill in the Walrus endpoints if you want live blob storage:

```bash
VITE_STORAGE_MODE=walrus
VITE_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_SUI_NETWORK=testnet
VITE_WALFORM_PACKAGE_ID=
```

If `VITE_STORAGE_MODE` is not `walrus`, or the Walrus URLs are missing, the app runs entirely on `localStorage`.

## Current MVP features

- Landing page at `/`
- Form builder at `/admin/forms/new`
- Public form route at `/f/:formId`
- Admin dashboard at `/admin`
- Submission list at `/admin/forms/:formId`
- Submission detail at `/admin/forms/:formId/submissions/:submissionId`
- Alias detail route at `/admin/submissions/:submissionId`
- Rich inputs for rating, screenshot, and video
- URL sharing and QR code generation
- Sui Wallet connect for form creators via Mysten dApp Kit
- JSON and CSV export
- Sensitive-field encryption through a swappable crypto adapter
- Walrus blob ids surfaced in the UI

## Sui Wallet integration

This Vite app exposes wallet connect through Mysten's React dApp Kit.

- Provider setup lives in [src/providers.tsx](D:/game/deepsignal/src/providers.tsx)
- Header wallet UI lives in [src/components/WalletConnect.tsx](D:/game/deepsignal/src/components/WalletConnect.tsx)
- Shared Sui helpers live in [src/lib/sui.ts](D:/game/deepsignal/src/lib/sui.ts)

Current behavior:

- creators can connect a Wallet Standard compatible Sui wallet
- the connected address is shown in the header and dashboard
- the form builder includes a `Create on Sui` toggle
- when that toggle is enabled, the form stores `ownerAddress` and `isOnchain`
- public respondents do not need a wallet to submit

Because this project uses Vite rather than Next.js, the wallet env vars use the `VITE_` prefix.

## Walrus integration

Walrus storage lives in:

- [src/storage/walrusAdapter.ts](D:/game/deepsignal/src/storage/walrusAdapter.ts)
- [src/storage/storageFactory.ts](D:/game/deepsignal/src/storage/storageFactory.ts)
- [src/storage/blobIndex.ts](D:/game/deepsignal/src/storage/blobIndex.ts)

### How it works

- Form definitions are serialized with `JSON.stringify(...)` and uploaded to `PUT {publisher}/v1/blobs`.
- Submissions are serialized and uploaded the same way.
- Attachments are uploaded as raw files.
- Walrus response parsing supports these blob id shapes:
  - `result.newlyCreated.blobObject.blobId`
  - `result.alreadyCertified.blobId`
  - `blobId`
  - `id`

### Local index

Walrus is blob storage, so the app keeps a local index in `localStorage` for lookup and listing.

The index stores only:

- `formId`
- `form blobId`
- `submissionId`
- `submission blobId`
- `formId` linkage
- `createdAt`

The actual form and submission payloads stay in Walrus blobs.

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

Blob ids are shown in the admin and submission flows.

When the blob is a real Walrus blob and an aggregator URL is configured, the UI also shows an `Open blob` link that points to:

```text
{VITE_WALRUS_AGGREGATOR_URL}/v1/blobs/{blobId}
```

## Seal / crypto adapter structure

The encryption layer is intentionally adapter-based:

- [src/crypto/sealAdapter.ts](D:/game/deepsignal/src/crypto/sealAdapter.ts)
- [src/crypto/localSealMock.ts](D:/game/deepsignal/src/crypto/localSealMock.ts)
- [src/crypto/cryptoFactory.ts](D:/game/deepsignal/src/crypto/cryptoFactory.ts)

Current MVP behavior:

- fields marked `sensitive: true` are encrypted before submission save
- encrypted answers are stored as:

```json
{
  "value": "encrypted_text",
  "encrypted": true
}
```

- decryption happens only in the admin detail view

This makes it straightforward to replace the mock crypto adapter with a real Seal implementation later.

## Known limitations

- Walrus listing depends on the local blob index, so clearing browser storage removes the lookup metadata even if the blobs still exist remotely.
- Local fallback data is browser-local and not shared across devices.
- Walrus delete is currently index cleanup only; uploaded blobs are not garbage-collected by this MVP.
- There is still no authentication layer for admin routes.
