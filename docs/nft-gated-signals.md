# NFT Gated Signals Design

Status: design only. No implementation is included in this document.

## Overview

This document proposes a DeepSignal-native design for NFT-gated public signals.

Goal:

- Only wallets that hold a target Sui NFT can view a gated signal.
- Only wallets that hold a target Sui NFT can submit to a gated signal.
- Phase 2 must compose cleanly with the existing `encryptSubmissions` and Seal flow.

Out of scope:

- Seal policy changes based on NFT ownership
- Move contract enforcement for responder access
- NFT-based decryption or revocation after decryption
- Dynamic onchain access revocation logic

This design preserves DeepSignal's current architecture:

- public forms still use the existing public route and storage flow
- Walrus stays in `src/storage`
- Seal stays in `src/crypto`
- local fallback remains intact for non-protected flows
- public route chunk boundaries stay protected by lazy loading

## Current State Analysis

### Current form model

`FormSchema` already carries responder-facing access-adjacent fields:

- `visibility`
- `identityPolicy`
- `locationRequirement`
- `encryptSubmissions`
- `projectId`
- `ownerAddress`
- `blobId`
- `manifestBlobId`

Today, wallet gating is represented by `identityPolicy: "anonymous_allowed" | "wallet_required"`.

This works for "wallet connected or not", but it is not expressive enough for NFT ownership checks. NFT gating is closer to resource access policy than respondent identity attachment.

### Current submission model

`Submission` already stores:

- `respondentMeta`
- `metadata`
- `isEncrypted`
- `encryptedBlobId`
- `encryptedWalrusProof`
- remote sync and inbox delivery state

This is enough to store an audit snapshot of access verification at submit time without changing the encrypted payload model.

### Current manifest model

`SignalManifest` is intentionally a recovery index. It stores form/submission blob references, version data, and safe presentation metadata.

Important implication:

- NFT gate configuration should primarily live on the form itself.
- `SignalManifest` does not need a new top-level NFT section for Phase 1 or Phase 2.
- Because Walrus form bundles already serialize the full `FormSchema`, the gate config can ride along with the existing form bundle path.

### Current public form flow

Relevant files:

- `src/pages/PublicFormPage.tsx`
- `src/features/public-form/hooks/usePublicFormLoader.ts`
- `src/features/public-form/hooks/usePublicSubmission.ts`
- `src/features/public-form/utils/validatePublicSubmission.ts`

Observed behavior:

- `usePublicFormLoader` restores the form from Walrus manifest or local fallback, then normalizes it.
- `PublicFormPage` derives `walletRequired` from `form.identityPolicy === "wallet_required"`.
- Wallet UI is lazy-loaded through `WalletSurface` and `PublicWalletAccountPanel`.
- `usePublicSubmission.handleSubmit()` rechecks deadline, wallet presence, Seal readiness, location, validation, and then persists through `saveSubmissionWithEncryption(...)`.

This is a strong fit for NFT gating because:

- view control belongs in `PublicFormPage`
- wallet/address resolution already exists
- submit-time revalidation already has a central hook

### Current wallet and RPC flow

Relevant files:

- `src/features/public-form/components/PublicWalletAccountPanel.tsx`
- `src/components/WalletSurface.tsx`
- `src/hooks/useSuiWallet.ts`
- `src/hooks/useOwnedSuiObjects.ts`
- `src/lib/sui.ts`
- `src/providers.tsx`

Observed behavior:

- `WalletSurface` lazy-loads wallet providers and already contains Mobile Safari-specific import timing behavior.
- `useOwnedSuiObjects` already calls `suiClient.getOwnedObjects`.
- It supports `StructType` filtering, React Query caching, sessionStorage caching, and RPC rate-limit fallback.

This existing hook is the right architectural anchor for Phase 1 NFT checks, but it should be extended or wrapped for gate-specific behavior.

### Current create/publish flow

Relevant files:

- `src/pages/FormBuilderPage.tsx`
- `src/features/createForm/hooks/useCreateFormBuilder.ts`
- `src/features/createForm/hooks/useCreateFormPublish.ts`
- `src/features/createForm/utils.ts`
- `src/features/createForm/components/PublishStep.tsx`

Observed behavior:

- builder state already manages publish-time policy fields
- form schema construction is centralized in `buildFormSchema(...)`
- draft serialization and restoration are centralized in `features/createForm/utils.ts`

This is the natural insertion point for new access-control settings.

## Recommended Data Model

### Recommendation

Add a new access-policy field to `FormSchema` instead of overloading `identityPolicy`.

Recommended shape:

```ts
type FormAccessMode = "public" | "wallet_required" | "nft_required";

interface FormNftGate {
  structType: string;
  requiredCount: number;
  gateViewing: boolean;
  gateSubmission: boolean;
}
```

Recommended `FormSchema` additions:

```ts
accessMode?: FormAccessMode;
nftGate?: FormNftGate;
```

### Why not use `identityPolicy` alone

Using only `identityPolicy` would be a poor fit because it mixes two different concerns:

- how the responder identifies themself
- whether the resource can be accessed at all

NFT gating is an access rule, not just an identity mode.

### Evaluation of the proposed structure

The proposed structure is broadly good and fits the existing codebase with small, focused changes.

Recommended adjustments:

- keep `accessMode` optional for backward compatibility
- keep `nftGate` optional
- treat `requiredCount < 1` as invalid and normalize to `1`
- require `nftGate` when `accessMode === "nft_required"`
- treat `wallet_required` as a non-NFT access mode even if `identityPolicy` still exists

### Backward compatibility policy

For older forms that do not have `accessMode`:

- if `identityPolicy === "wallet_required"`, derive effective access as `wallet_required`
- otherwise derive effective access as `public`

This avoids breaking:

- older local drafts
- older Walrus form bundles
- older manifests and recovered forms

### Submission audit extension

No top-level `Submission` fields are required for Phase 1, but Phase 1 should record an audit snapshot in `submission.metadata`.

Recommended metadata shape:

```ts
metadata: {
  ...existingMetadata,
  accessCheck?: {
    mode: "public" | "wallet_required" | "nft_required";
    checkedAt: string;
    walletAddress?: string;
    structType?: string;
    requiredCount?: number;
    ownedCount?: number;
    passed: boolean;
    source: "sui_rpc_getOwnedObjects";
  };
}
```

This is useful for:

- operator debugging
- explaining why a signal was accepted
- future incident review

## Public Form Flow Design

### Best insertion points

#### View control

Primary control point:

- `src/pages/PublicFormPage.tsx`

Reason:

- it already owns route-level presentation, wallet step behavior, and lazy wallet surfaces
- it can block the form UI before the responder starts answering

Recommended behavior:

1. Load form through `usePublicFormLoader`.
2. Resolve effective access mode from `accessMode` plus backward-compatible fallback from `identityPolicy`.
3. If mode is `public`, render as today.
4. If mode is `wallet_required`, keep current wallet-required behavior.
5. If mode is `nft_required`, render an access gate panel before the form body.
6. Only reveal the form once NFT ownership check passes when `gateViewing === true`.

#### Submit control

Primary control point:

- `src/features/public-form/hooks/usePublicSubmission.ts`

Reason:

- it is the final centralized submit path
- it already rechecks response deadline and wallet state
- it is the right place to do a fresh submit-time NFT verification

Recommended behavior:

1. Before payload preparation, run submit-time access verification.
2. If `accessMode !== "nft_required"`, continue normally.
3. If `accessMode === "nft_required"` and `gateSubmission === true`, perform a fresh ownership check.
4. Abort before encryption/upload if the check fails.

#### Error display

Recommended split:

- route-level access errors in `PublicFormPage`
- submit-time failures in `usePublicSubmission`
- field-level validation stays in `validatePublicSubmission`

Do not force NFT gate failures into field validation because they are not field errors.

### Proposed public gate states

Recommended state model for the UI:

- `disconnected`
- `connecting`
- `checking`
- `granted`
- `denied`
- `error`

Recommended UX:

- `disconnected`: explain that this signal is restricted to NFT holders and prompt wallet connect
- `connecting`: keep the route stable and avoid flashing denied state
- `checking`: show verification in progress
- `granted`: reveal form
- `denied`: explain required collection and current wallet mismatch
- `error`: explain RPC verification failed and allow retry

### New hook recommendation

Add a dedicated public-form access hook instead of embedding all NFT logic directly in `PublicFormPage`.

Recommended new file:

- `src/features/public-form/hooks/usePublicNftGate.ts`

Responsibilities:

- compute effective access mode
- call `useOwnedSuiObjects` with the target struct type
- return ownership count, pass/fail state, loading state, error state
- expose a `recheck()` function for submit-time or manual retry

This keeps:

- `PublicFormPage` focused on route UI
- `usePublicSubmission` focused on submit flow

## Wallet Integration And RPC Strategy

### Recommended ownership check method

Use Sui RPC `getOwnedObjects` with `StructType` filter, matching the current Phase 1 requirement.

Fit with current codebase:

- `useOwnedSuiObjects` already supports `StructType`
- current wallet provider stack already resolves the active Sui address

### Recommended implementation detail

Do not call `useOwnedSuiObjects` without a struct filter.

Always call it with:

- `enabled: accessMode === "nft_required" && wallet connected`
- `structTypes: [form.nftGate.structType]`

### Recommended optimization

The current helper collects all pages for each struct type. For NFT gates this is more work than necessary when only a minimum count is needed.

Recommended improvement:

- extend the internal fetch helper to short-circuit once `requiredCount` matches are found

Suggested API evolution:

```ts
useOwnedSuiObjects(address, {
  enabled: true,
  structTypes: [structType],
  minimumCount: requiredCount,
})
```

This reduces RPC load for common `requiredCount: 1` gates.

### Caching strategy

Use the existing layered cache:

- React Query cache
- sessionStorage cache
- rate-limit fallback to last successful data

Recommended policy:

- view gate may use cached data
- submit gate must force a fresh recheck

That split balances UX and correctness:

- the route opens faster for real users
- submit-time verification reduces stale ownership acceptance

### Mobile Safari impact

Key existing constraint:

- `WalletSurface` already has Mobile Safari-aware provider loading and timeouts

Recommended guardrails:

- do not add static wallet or Mysten imports to the public route module graph
- keep wallet UI lazy-loaded as it is today
- show a stable gate panel while wallet restore is in progress
- avoid automatic repeated rechecks on focus or route mount loops

This is especially important because Mobile Safari wallet restore can be slow or flaky during auto-connect.

## Create Signal Flow Design

### Publish-step UX recommendation

Replace the current identity-only publish toggle with an access-control surface that maps cleanly to the new model.

Recommended options:

- `Public`
- `Wallet Required`
- `NFT Holders Only`

When `NFT Holders Only` is selected, show:

- `Struct Type`
- `Required Count`
- `Gate Viewing` toggle
- `Gate Submission` toggle

Recommended defaults:

- `gateViewing: true`
- `gateSubmission: true`
- `requiredCount: 1`

### Draft and publish plumbing

Add the new fields to:

- builder state
- draft serialization
- draft parsing
- `buildFormSchema(...)`
- publish summary UI

### Relationship to existing `identityPolicy`

Recommended transitional behavior:

- keep `identityPolicy` in the model for compatibility
- derive it from `accessMode` when building new forms

Suggested mapping for new publishes:

- `public` -> `identityPolicy: "anonymous_allowed"`
- `wallet_required` -> `identityPolicy: "wallet_required"`
- `nft_required` -> `identityPolicy: "wallet_required"`

Reason:

- NFT gating inherently requires a wallet connection
- this minimizes disruption in older code paths that still key off `identityPolicy`

## Storage, Manifest, And Encryption Compatibility

### Walrus impact

Low-risk.

Form publish already serializes the full `FormSchema` into the Walrus form bundle. New optional form fields will naturally travel with:

- local storage
- Walrus form bundle
- manifest restore flow

No Walrus storage architecture change is required.

### Manifest impact

Low-risk, and no top-level manifest schema expansion is recommended for Phase 1.

Reason:

- manifest is a recovery index, not the canonical policy record
- gate config belongs to the form definition
- `usePublicFormLoader` already restores the form from the manifest-linked carrier

### Existing encryption flow impact

Phase 2 composes cleanly with current behavior.

Current encrypted submission path already:

- verifies response deadline
- verifies wallet prerequisites for real Seal usage
- encrypts private payload through existing Seal adapters
- stores metadata submission plus encrypted payload reference

For Phase 2:

- NFT gate is checked before submission save
- `encryptSubmissions` continues to decide storage privacy
- admin decrypt flow remains unchanged

Important limitation:

- Phase 2 does not make decrypted payload access depend on NFT ownership
- it only restricts who can submit and optionally who can view the form

### Remote owner inbox compatibility

No structural change is required for:

- remote submission index
- owner inbox sync
- Walrus submission bundle generation

Optional improvement:

- include access audit metadata in the submission so operators can inspect how the responder passed the gate

### Backward compatibility assessment

Expected compatibility outcome:

- older forms without `accessMode` continue to work
- older manifests continue to restore
- older submissions continue to render
- older local drafts continue to parse as long as new fields remain optional

This is the preferred approach for DeepSignal because it preserves local/demo and recovery behavior.

## Security Review

### Frontend-only gate limitations

This Phase 1 gate is a client-side access gate.

It improves normal-user enforcement but does not create hard trustless enforcement because:

- a modified client can skip the UI gate
- a malicious actor can call storage or relay paths outside the intended UI
- there is no server-side authoritative gate today

### Why submit-time revalidation is still necessary

Submit-time revalidation is required even if view gating exists because:

- ownership can change after initial page load
- cached owned-object data can be stale
- wallet session can switch accounts after the gate is first satisfied

Recommended rule:

- always perform a fresh ownership check immediately before submission persistence when `gateSubmission === true`

### Wallet disconnect behavior

Recommended behavior:

- if the wallet disconnects before submit, the responder loses access to gated submit
- if `gateViewing === true`, optionally collapse back to the gate panel
- do not keep privileged access latched after disconnect

### NFT sold after opening the form

Recommended behavior:

- page may still be open due to cached earlier pass
- submit-time revalidation should block the final submission if ownership is gone

This is the main reason submit-time revalidation is mandatory.

### Tampering risk

Main tampering surfaces:

- edited browser code
- spoofed local state
- direct relay calls

Phase 1 mitigation:

- route gate
- submit-time fresh RPC check
- metadata audit snapshot

Not mitigated in Phase 1:

- fully adversarial client bypass

That requires a later trusted enforcement layer such as:

- relay-side verification
- signed challenge + server validation
- Move-based policy enforcement

### Privacy considerations

NFT gate configuration itself is safe form metadata.

Do not store:

- full owned-object payloads
- unnecessary NFT metadata blobs
- expanded object field dumps in submissions

Only store compact access audit values needed for debugging and operator traceability.

## Suggested File Targets

Likely implementation targets for Phase 1 and Phase 2:

- `src/types.ts`
- `src/lib/formSchema.ts`
- `src/pages/PublicFormPage.tsx`
- `src/features/public-form/hooks/usePublicFormLoader.ts`
- `src/features/public-form/hooks/usePublicSubmission.ts`
- `src/features/public-form/utils/validatePublicSubmission.ts`
- `src/features/public-form/components/PublicWalletAccountPanel.tsx`
- `src/hooks/useOwnedSuiObjects.ts`
- `src/features/createForm/types.ts`
- `src/features/createForm/utils.ts`
- `src/features/createForm/hooks/useCreateFormBuilder.ts`
- `src/features/createForm/hooks/useCreateFormPublish.ts`
- `src/features/createForm/components/PublishStep.tsx`
- `src/storage/localStorageAdapter.ts`
- `src/storage/walrusAdapter.ts`
- `src/storage/walrusCostEstimate.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/ja.ts`
- `src/pages/PublicFormPage.test.tsx`
- new tests for the new hook and builder state

Recommended new files:

- `src/features/public-form/hooks/usePublicNftGate.ts`
- optionally `src/features/public-form/components/PublicNftGateCard.tsx`

## Testing Plan

### Core access cases

- public form with `accessMode: public` still works anonymously
- `wallet_required` form still behaves exactly as today
- `nft_required` form blocks when wallet is not connected
- `nft_required` form grants access when wallet owns enough matching NFTs
- `nft_required` form denies access when wallet owns fewer than `requiredCount`

### Viewing and submission permutations

- `gateViewing: true`, `gateSubmission: true`
- `gateViewing: false`, `gateSubmission: true`
- `gateViewing: true`, `gateSubmission: false`
- `gateViewing: false`, `gateSubmission: false`

### Ownership change cases

- user passes view gate, then sells NFT before submit, and submit is blocked
- user changes connected wallet after gate pass, and UI re-evaluates correctly
- wallet disconnects before submit and gated submit is blocked

### Encryption cases

- NFT-gated form with `encryptSubmissions: false`
- NFT-gated form with `encryptSubmissions: true`
- encrypted NFT-gated submission stores through existing Seal path
- admin can still review/decrypt encrypted gated submissions through existing admin flow

### Storage and recovery cases

- gated form publish writes and restores from Walrus form bundle
- gated form restores correctly from local fallback
- older non-gated forms restore without schema issues
- older drafts parse without requiring new fields

### RPC and resilience cases

- rate-limited RPC falls back to last successful ownership snapshot for view state
- submit-time recheck handles RPC failure with a clear retryable error
- Mobile Safari wallet auto-connect delay does not incorrectly show denied state

### Bundle and route safety cases

- public route initial static imports still do not pull wallet/admin/Mysten runtime chunks unnecessarily
- wallet and Sui checks remain behind lazy public route boundaries

### Suggested specific test list

- NFT holder
- NFT non-holder
- wallet not connected
- wallet required legacy form
- NFT holder after sell
- wallet switch after initial verification
- Mobile Safari wallet restore path
- guest mode draft with NFT settings saved then publish wallet-connected
- encrypted NFT signal
- local fallback restore of gated form

## Recommended Implementation Order

### Step 1

Add data model and normalization support.

- extend `FormSchema`
- add normalization defaults
- keep backward-compatible fallback from `identityPolicy`

### Step 2

Add create/publish state and draft serialization.

- builder state
- publish UI
- form schema construction

### Step 3

Add public NFT gate hook and route-level UI gating.

- route gate card
- wallet connect requirement
- ownership check states

### Step 4

Add submit-time revalidation.

- fresh ownership recheck
- user-facing error handling
- access audit metadata

### Step 5

Run compatibility pass for storage, manifest restore, and encryption.

- Walrus publish/restore
- local fallback
- encrypted submit path

### Step 6

Add tests and chunk-safety verification.

- unit tests
- public form tests
- typecheck
- build
- public chunk inspection for forbidden initial imports

## Final Recommendation

The most natural DeepSignal integration is:

- introduce `accessMode` plus optional `nftGate`
- keep `identityPolicy` as a backward-compatible derived field for now
- enforce NFT view gating in `PublicFormPage`
- enforce fresh NFT submit gating in `usePublicSubmission`
- reuse `useOwnedSuiObjects` with a minimum-count optimization
- keep manifest and encryption architecture unchanged

This gives DeepSignal a focused Phase 1 and Phase 2 path without pulling NFT logic into Walrus storage, Seal policy, or unrelated admin code too early.
