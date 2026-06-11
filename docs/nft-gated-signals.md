# NFT Gated Signals Design

Status: design only. No implementation is included in this document.

## Overview

DeepSignal should support NFT-gated signals in a way that is compatible with the current public form flow, Walrus storage, and Seal encryption architecture.

The final target architecture is not a permanent frontend-only gate. The long-term direction is Seal-centered access control. However, the safe implementation path is phased.

This document defines those phases clearly so we can implement Phase 1 and Phase 2 now without blocking a future Phase 3.

## Phase Boundaries

### Phase 1: NFT Ownership Gate

Purpose:

- only wallets holding the target NFT can open the form
- only wallets holding the target NFT can submit

Implementation approach:

- wallet connection required
- the public route lazily loads the NFT ownership runtime and verifies ownership through Sui RPC
- the ownership check aggregates direct owned objects plus Kiosk items
- `requiredCount` is enforced against the deduplicated union of direct and Kiosk object ids
- object-id selectors and struct-type selectors are both supported
- `PublicFormPage` enforces the viewing gate
- `usePublicSubmission` re-verifies ownership immediately before submit with a fresh RPC check
- guest mode is disabled for NFT-gated forms
- `submission.metadata.accessCheck` stores the verification result

Security model:

- frontend gate plus submit-time guard
- acceptable for this phase

### Phase 2: Seal Encrypted Responses

Purpose:

- responses from NFT-eligible responders are stored through the existing Seal-encrypted submission path

Implementation approach:

- reuse existing `encryptSubmissions`
- NFT gate must pass before submit is allowed
- response body is stored through the existing Seal flow
- owner/admin reads through the current Inbox and decrypt path
- NFT holders do not need to decrypt response bodies in this phase

Security model:

- viewing/submission eligibility is NFT-based
- response confidentiality is still enforced by the current owner/admin Seal flow

### Phase 3: Seal-based Viewing Gate

Purpose:

- the form body itself becomes Seal-protected so only NFT holders can decrypt and view it

Important:

- not implemented in this work
- must be explicitly preserved in the design

Future direction:

- `FormSchema.nftGate` must be expressible as a future Seal policy input
- `gateViewing=true` should remain compatible with future encrypted form-body delivery
- NFT ownership based decryption policy can later be explored
- resale, cached plaintext, and revocation are separate future problems and not solved here

## Architecture Summary

### Best architecture

The intended end state is:

- Phase 1: frontend viewing gate plus submit-time ownership guard
- Phase 2: existing Seal-encrypted response storage after NFT eligibility passes
- Phase 3: Seal-based viewing gate for form content itself

This staged path is recommended because it:

- preserves DeepSignal's current public routing and storage model
- avoids premature Move or Seal policy changes
- keeps today’s implementation realistic and safe
- keeps the data model compatible with future Seal-native gating

## Current State Analysis

### Current form model

`FormSchema` currently includes:

- `visibility`
- `identityPolicy`
- `locationRequirement`
- `encryptSubmissions`
- `projectId`
- `ownerAddress`
- `blobId`
- `manifestBlobId`

Today, the responder-facing access concept is mostly represented by `identityPolicy`.

That is sufficient for:

- anonymous vs wallet-required response collection

It is not sufficient for:

- NFT ownership-based access
- future Seal policy generation for gated form viewing

### Current submission model

`Submission` already includes:

- `respondentMeta`
- `metadata`
- `isEncrypted`
- `encryptedBlobId`
- `encryptedWalrusProof`
- remote inbox delivery and sync fields

This is already enough for Phase 1 and Phase 2 because:

- access verification can be recorded in `metadata`
- encrypted responses already fit the existing Seal path

### Current manifest model

`SignalManifest` is a recovery index, not the canonical policy store.

Implications:

- NFT gate configuration should live on the form definition
- no required top-level `SignalManifest` schema change is needed for Phase 1 or Phase 2
- Walrus form bundles already carry the full form definition, so new form gate fields will naturally travel through the existing publish/restore path

### Current public form flow

Relevant files:

- `src/pages/PublicFormPage.tsx`
- `src/features/public-form/hooks/usePublicFormLoader.ts`
- `src/features/public-form/hooks/usePublicSubmission.ts`
- `src/features/public-form/utils/validatePublicSubmission.ts`

Observed behavior:

- `usePublicFormLoader` restores and normalizes the form
- `PublicFormPage` currently derives wallet-required behavior from `identityPolicy`
- wallet UI is already lazy-loaded through `WalletSurface`
- `usePublicSubmission.handleSubmit()` already performs final pre-submit checks before persistence

This is a strong fit for Phase 1 because:

- view gating belongs in `PublicFormPage`
- submit-time revalidation belongs in `usePublicSubmission`

### Current wallet and RPC flow

Relevant files:

- `src/features/public-form/components/PublicWalletAccountPanel.tsx`
- `src/components/WalletSurface.tsx`
- `src/hooks/useSuiWallet.ts`
- `src/hooks/useOwnedSuiObjects.ts`
- `src/lib/sui.ts`
- `src/providers.tsx`

Observed behavior:

- wallet provider setup is already lazy and Mobile Safari-aware
- `useOwnedSuiObjects` already uses Sui RPC `getOwnedObjects`
- struct-type filtering, query caching, and rate-limit fallback already exist

This makes `useOwnedSuiObjects` the right Phase 1 ownership-check foundation.
The public responder gate should still keep Mysten and Kiosk runtime code behind lazy public-route boundaries.

### Current create/publish flow

Relevant files:

- `src/pages/FormBuilderPage.tsx`
- `src/features/createForm/hooks/useCreateFormBuilder.ts`
- `src/features/createForm/hooks/useCreateFormPublish.ts`
- `src/features/createForm/utils.ts`
- `src/features/createForm/components/PublishStep.tsx`

Observed behavior:

- builder state already manages publish-time policy values
- form schema construction is centralized in `buildFormSchema(...)`
- draft save/restore is centralized

This is the right insertion point for NFT access configuration.

## Data Model Update

### Recommended form access model

Add the following to `FormSchema`:

```ts
type FormAccessMode = "public" | "wallet_required" | "nft_required";

interface FormNftGate {
  network: "sui-mainnet" | "sui-testnet";
  structType: string;
  requiredCount: number;
  gateViewing: boolean;
  gateSubmission: boolean;
  collectionLabel?: string;
  presetId?: "prime_machin" | "tally" | "custom";
  futureSealPolicy?: {
    eligible: boolean;
    policyMode: "none" | "nft_ownership_decrypt";
  };
}

accessMode?: FormAccessMode;
nftGate?: FormNftGate;
```

### Why this model fits the long-term architecture

This model is recommended because it separates:

- responder identity requirements
- NFT collection eligibility
- future Seal policy evolution

It is also future-compatible because it preserves:

- `network`
- `structType`
- `requiredCount`
- `collectionLabel`

Those are the minimum useful inputs for future Seal-policy generation.

### Backward compatibility

Backward compatibility rules:

- if `accessMode` is undefined, infer from `identityPolicy`
- if `identityPolicy === "wallet_required"`, infer effective access mode as `wallet_required`
- otherwise infer effective access mode as `public`
- if `accessMode === "nft_required"`, treat `identityPolicy` as `wallet_required`

Compatibility goal:

- do not break older forms
- do not break older manifests
- do not break older local drafts

### Validation guidance

Recommended normalization and validation rules:

- `accessMode` remains optional
- `nftGate` remains optional
- require `nftGate` when `accessMode === "nft_required"`
- `requiredCount` must be `>= 1`
- `network` must be explicitly stored
- `futureSealPolicy` is informational for now and must not affect runtime behavior in Phase 1 or Phase 2

### Submission audit metadata

Phase 1 should store the access check in submission metadata:

```ts
metadata: {
  ...existingMetadata,
  accessCheck?: {
    mode: "public" | "wallet_required" | "nft_required";
    checkedAt: string;
    walletAddress?: string;
    network?: "sui-mainnet" | "sui-testnet";
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
- submission traceability
- future migration planning

## Public Form Flow Design

### Phase 1 view gate

Primary control point:

- `src/pages/PublicFormPage.tsx`

Recommended behavior:

1. Load the form through `usePublicFormLoader`.
2. Resolve effective `accessMode`.
3. If `public`, behave as today.
4. If `wallet_required`, behave as today.
5. If `nft_required`, require wallet connection immediately.
6. Run ownership verification against `nftGate`.
7. If `gateViewing === true`, do not reveal the form body until verification passes.

Guest mode behavior:

- guest mode must be disabled for NFT-gated forms
- anonymous and zkLogin flows should not satisfy `nft_required` in Phase 1

### Phase 1 submit guard

Primary control point:

- `src/features/public-form/hooks/usePublicSubmission.ts`

Recommended behavior:

1. Before payload preparation, re-run NFT ownership verification.
2. Use the active wallet address only.
3. Abort submit if verification fails.
4. Persist `submission.metadata.accessCheck`.

This recheck is mandatory because:

- ownership may have changed since page load
- wallet may have changed
- cached data may be stale

### Error handling split

Recommended split:

- route-level access denial and wallet requirement in `PublicFormPage`
- final submit denial in `usePublicSubmission`
- field-level validation remains in `validatePublicSubmission`

NFT eligibility errors should not be modeled as field errors.

### Recommended new hook

Recommended new hook:

- `src/features/public-form/hooks/usePublicNftGate.ts`

Responsibilities:

- resolve effective access mode
- evaluate NFT ownership via `useOwnedSuiObjects`
- expose pass/fail/loading/error state
- expose a forced recheck path for submit-time validation

This keeps:

- route UI logic separate from RPC ownership logic
- submit flow logic separate from route rendering

## Wallet Integration And RPC Strategy

### Phase 1 ownership check

Use Sui RPC `getOwnedObjects` with a `StructType` filter.

This matches:

- the stated Phase 1 implementation plan
- the current `useOwnedSuiObjects` capability

Kiosk items must be checked separately with `getOwnedKiosks` plus `getKiosk({ withObjects: true })`.

### Recommended RPC usage

Always query with:

- connected wallet address
- `nftGate.structType`
- `nftGate.network` aligned with the active DeepSignal network configuration

If the form network and connected runtime network do not match:

- show a clear mismatch error
- do not silently proceed
- do not execute the ownership RPC check

### Caching strategy

Use the current layered cache for route-level checks:

- React Query cache
- sessionStorage cache
- rate-limit fallback to last successful result

Recommended rule:

- route-level access check may use cached data only for recent successful matches
- failed, no-match, and RPC-error results must not be retained as success cache
- submit-time check should force a fresh revalidation

### Optimization

For future implementation, `useOwnedSuiObjects` should ideally support early exit once `requiredCount` is reached.

Suggested direction:

```ts
useOwnedSuiObjects(address, {
  enabled: true,
  structTypes: [structType],
  minimumCount: requiredCount,
})
```

This is especially useful for the common case of `requiredCount: 1`.

### Mobile Safari considerations

Keep the current lazy wallet boundary intact.

Required guardrails:

- no new static public-route imports of wallet/Mysten runtime code
- stable loading state while wallet restore is in progress
- no repeated auto-retry loops that cause flapping on Mobile Safari

This is important because public route initial chunk boundaries are already treated as sensitive in DeepSignal.

## Initial Product Scope

### First-release builder options

Initial implementation UI should support:

- `Public`
- `Wallet Required`
- `NFT Holders Only`

When `NFT Holders Only` is selected:

- `Prime Machin` preset
- `Custom Struct Type`
- `requiredCount` default `1`
- `gateViewing` default `true`
- `gateSubmission` default `true`

### Prime Machin preset

Recommended builder UX:

- `Prime Machin Holders`
- `Custom Struct Type`

Recommended stored values:

- `presetId: "prime_machin"` for Prime Machin
- `presetId: "custom"` for manual struct type entry

Recommended form metadata behavior:

- always persist the resolved `structType`
- persist `collectionLabel` for display purposes
- do not rely on a future preset remap to interpret already-published forms

That means published forms must always be governed by their saved `structType`, not by whatever the preset registry says later.

### Prime Machin canonical struct type

Prime Machin now has a canonical `structType`:

- `0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin`

The preset registry should resolve `prime_machin` to that exact value. Published forms must still persist the resolved `structType` in `nftGate`, so future preset metadata changes do not alter access rules for already-published signals.

### Debugging owned object types

The design should explicitly support operator debugging when a collection type is uncertain.

Recommended approach:

- add a non-public-facing builder debug path or diagnostics note for connected-wallet owned object inspection
- allow the operator to inspect owned object `type` values from the connected wallet
- use this only for builder diagnostics, not for public responder UX

Possible implementation direction later:

- a builder-side diagnostic panel using the existing Sui client and owned-object query path
- a copyable list of discovered owned object type strings

This is especially useful while the Prime Machin canonical type is still being confirmed.

## Create Signal Flow Design

### Builder state

Add the new fields to:

- create-form builder state
- draft serialization
- draft parsing
- `buildFormSchema(...)`
- publish summary UI

Recommended builder-side helper:

- a local preset registry mapping `prime_machin` to the canonical `structType`, `network`, and default `collectionLabel`

This helper should remain a create-form concern. It should not introduce storage-layer or Seal-layer collection-specific branching.

### Relationship to existing identity policy

Recommended transitional behavior:

- keep `identityPolicy` for compatibility
- derive it from `accessMode` when publishing new forms

Suggested mapping:

- `public` -> `identityPolicy: "anonymous_allowed"`
- `wallet_required` -> `identityPolicy: "wallet_required"`
- `nft_required` -> `identityPolicy: "wallet_required"`

This preserves existing older code paths while moving the architecture toward `accessMode`.

## Storage, Manifest, And Encryption Compatibility

### Walrus impact

Low-risk.

Because the full form definition is already serialized into the published Walrus form bundle:

- `accessMode`
- `nftGate`

can be carried without changing the core storage architecture.

### Manifest impact

No required top-level manifest schema change is recommended for Phase 1 or Phase 2.

Reason:

- manifest is a recovery index
- form policy belongs on the form
- current restore flow already restores the form from the bundle or linked form blob

### Phase 2 encryption compatibility

Phase 2 should use the existing `encryptSubmissions` path unchanged.

Meaning:

- NFT gate passes first
- submit is allowed
- response payload follows the existing Seal encryption flow
- owner/admin decrypts in Inbox as today

Important:

- NFT holders do not get response-body decrypt rights in Phase 2
- this remains owner/admin controlled

### Future Phase 3 compatibility

The data model must remain compatible with future Seal-based viewing gates.

That means:

- `nftGate.structType` must be preserved
- `nftGate.requiredCount` must be preserved
- `nftGate.network` must be preserved
- `nftGate.collectionLabel` should be preserved for operator clarity
- `nftGate.futureSealPolicy` can document future intent without affecting current runtime logic

## Security And Safety Review

### What is acceptable now

For this implementation, the following is acceptable:

- frontend viewing gate
- wallet-required submit guard
- submit-time fresh revalidation
- access audit metadata

This is enough for Phase 1.

### What is not solved now

This implementation does not solve:

- NFT ownership based Seal decryption
- Move contract enforcement
- Seal policy changes
- Seal-encrypted form body viewing
- automatic revocation after NFT sale

These are explicitly deferred.

### Frontend-only limitations

Phase 1 remains vulnerable to adversarial-client bypass because:

- UI checks can be modified
- direct external calls may bypass route gating
- there is no trusted policy enforcement layer yet

This is acceptable only because:

- the current scope is explicitly Phase 1
- Phase 3 is intended to move toward Seal-based viewing control

### Wallet disconnect and wallet switch behavior

Recommended behavior:

- disconnect should immediately invalidate NFT-gated submit eligibility
- if `gateViewing === true`, disconnect should also invalidate form viewing access
- wallet switch should trigger re-evaluation

### NFT resale after opening the form

Recommended behavior:

- cached access may temporarily allow the route to remain open
- final submit must fail if ownership is gone at submit time

This is the core safety boundary for Phase 1.

## Testing Plan

### Phase 1 tests

- public form still works unchanged for `accessMode: public`
- `wallet_required` still works unchanged
- NFT-gated form blocks when wallet is not connected
- guest mode is unavailable for NFT-gated forms
- NFT-gated form grants access when the wallet owns enough NFTs
- NFT-gated form denies access when holdings are below `requiredCount`
- submit-time recheck fails after the NFT is sold
- wallet switch re-evaluates access
- wallet disconnect invalidates access
- network mismatch is handled clearly
- `submission.metadata.accessCheck` is persisted

### Phase 2 tests

- NFT-gated form with `encryptSubmissions: false`
- NFT-gated form with `encryptSubmissions: true`
- gated responder can submit only after NFT check passes
- encrypted payload follows the existing Seal storage path
- owner/admin can still decrypt in Inbox
- NFT holder does not gain decrypt access automatically

### Compatibility tests

- older forms without `accessMode` still restore
- older manifests still restore
- older local drafts still parse
- Walrus-published gated forms restore correctly
- local fallback forms restore correctly

### Builder tests

- builder supports `Public`, `Wallet Required`, `NFT Holders Only`
- Prime Machin preset auto-fills defaults
- custom mode requires struct type entry
- Prime Machin preset resolves to the canonical struct type

### Platform and bundle tests

- Mobile Safari wallet restore path does not show false denial during loading
- public route initial static imports remain safe
- wallet/Sui code remains lazy behind public route boundaries

## Suggested File Targets

Likely implementation targets:

- `src/types.ts`
- `src/lib/formSchema.ts`
- `src/pages/PublicFormPage.tsx`
- `src/features/public-form/hooks/usePublicFormLoader.ts`
- `src/features/public-form/hooks/usePublicSubmission.ts`
- `src/features/public-form/utils/validatePublicSubmission.ts`
- `src/hooks/useOwnedSuiObjects.ts`
- `src/features/public-form/components/PublicWalletAccountPanel.tsx`
- `src/features/createForm/types.ts`
- `src/features/createForm/utils.ts`
- `src/features/createForm/hooks/useCreateFormBuilder.ts`
- `src/features/createForm/hooks/useCreateFormPublish.ts`
- `src/features/createForm/components/PublishStep.tsx`
- `src/storage/localStorageAdapter.ts`
- `src/storage/walrusAdapter.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/ja.ts`
- `src/pages/PublicFormPage.test.tsx`

Recommended new files:

- `src/features/public-form/hooks/usePublicNftGate.ts`
- optionally `src/features/public-form/components/PublicNftGateCard.tsx`

## Final Recommendation

The correct long-term architecture is Seal-centered access control, not a permanent frontend-only gate.

The correct short-term implementation is:

- Phase 1: frontend NFT viewing gate plus submit-time ownership guard
- Phase 2: existing Seal-encrypted response storage after NFT eligibility passes
- Phase 3: future Seal-based viewing gate for the form body itself

This preserves DeepSignal’s current architecture, keeps implementation risk reasonable, and avoids painting the data model into a corner before Seal-based viewing access is designed.
