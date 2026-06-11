# Sui gRPC Migration Investigation

Date: 2026-06-11

Scope:
- Investigate only whether DeepSignal can migrate from `SuiJsonRpcClient` / JSON-RPC toward `SuiGrpcClient` / Core API.
- Do not implement runtime changes in this pass.
- Keep this separate from Walrus upload UX, Safari lazy import issues, and wallet boot improvements.

## Executive Summary

DeepSignal can move **part of its read path** from JSON-RPC to `SuiGrpcClient`, but it **cannot fully remove JSON-RPC today** without replacing or isolating current `@mysten/kiosk` usage and a few DeepSignal-specific JSON-RPC assumptions.

Post-investigation update:
- I also verified the wallet signing path against the installed official SDK sources.
- `@mysten/dapp-kit` can be constructed with a `SuiGrpcClient`, because its `createClient` contract is `ClientWithCoreApi`.
- However, browser wallet signing and submission are delegated to wallet-standard features such as `sui:signAndExecuteTransaction` or legacy `sui:signAndExecuteTransactionBlock`.
- That means app code can supply a gRPC-capable client for transaction serialization and read helpers, but it cannot guarantee that the browser wallet extension itself will execute the submission path over gRPC.
- In DeepSignal's real runtime, Walrus publish still failed during wallet approval / `signAndExecuteTransactionBlock` even after the surrounding app code was adjusted. That makes full gRPC-only write-path migration unsafe today.

The biggest blockers are:
- DeepSignal currently stores and passes `currentRpcUrl` values that are often **JSON-RPC endpoints or JSON-RPC proxy paths**, not guaranteed gRPC-web endpoints.
- The current NFT gate code is written against `getOwnedObjects(...)` and a JSON-RPC-shaped response.
- The current `@mysten/kiosk` package explicitly documents that it **does not support `SuiGrpcClient`**.
- DeepSignal’s local Seal adapter fallback still constructs a `SuiJsonRpcClient`, even though the Seal SDK type itself is Core-API-compatible.

The good news:
- `SuiGrpcClient` itself is intended to work in browsers via `GrpcWebFetchTransport`.
- `@mysten/dapp-kit` accepts any `ClientWithCoreApi`, so the provider layer is not fundamentally locked to JSON-RPC.
- Walrus and Seal SDK core types are largely **Core API oriented**, so they are not the main blocker.
- Transaction execution and digest lookup both exist in the Core API.

Bottom line:
- **Stage migration is feasible.**
- **Full JSON-RPC removal is not yet feasible in this repo without a kiosk strategy and endpoint strategy.**

## Decision Table

| Topic | Verdict | Notes |
| --- | --- | --- |
| 1. `SuiGrpcClient` usable in browser / Vite | Possible | SDK docs state the default transport is `GrpcWebFetchTransport`, which works in browsers through Fetch. This is a browser transport question, not a provider-compatibility guarantee. |
| 2. Existing `currentRpcUrl` reusable as-is | Not as-is | Mysten docs say the same fullnode URLs can be reused, but DeepSignal often uses `/api/sui-rpc`, `/api/tatum/sui-rpc`, or Tatum JSON-RPC gateways. Those are JSON-RPC endpoints/proxies, not proven gRPC-web endpoints. |
| 3. `SuiClientProvider` / `WalletProvider` / dApp Kit can accept gRPC client | Possible | `@mysten/dapp-kit` types are based on `ClientWithCoreApi`, not `SuiJsonRpcClient`. DeepSignal has local typings still narrowed to `SuiJsonRpcClient`. |
| 4. `getOwnedObjects` migration target | Possible | Official replacement is `listOwnedObjects`. Response shape changes from JSON-RPC `data` to Core API `objects`. |
| 5. Direct NFT ownership check can be recreated in Core API | Possible | Direct owner scan can be rebuilt with `listOwnedObjects`, `getObject`, and optionally `listDynamicFields`. |
| 6. `@mysten/kiosk` on `SuiGrpcClient` | Not supported | Official kiosk migration doc says kiosk requires `SuiJsonRpcClient` or `SuiGraphQLClient`, not `SuiGrpcClient`. |
| 7. Keep kiosk on JSON-RPC while other reads move | Likely required | This is the safest near-term split unless DeepSignal replaces kiosk lookup logic or moves it to another supported transport. |
| 8. Seal / Walrus SDK dependence on `SuiJsonRpcClient` type | Mixed | Walrus SDK uses `ClientWithCoreApi`. Seal SDK type is also Core-API-shaped. But DeepSignal’s own Seal fallback still instantiates `SuiJsonRpcClient`. |
| 9. Write transactions / `signAndExecuteTransaction` impact | Medium / wallet-dependent | dApp Kit can accept a gRPC-compatible client, and Core API supports `executeTransaction`, `signAndExecuteTransaction`, and `waitForTransaction`. But browser-wallet execution is delegated to wallet-standard features, so app code cannot guarantee true end-to-end gRPC submission. |
| 10. Can JSON-RPC be fully removed now | No | Kiosk support and endpoint compatibility prevent immediate full removal. Near-term architecture should be hybrid. |

## Findings By Required Question

### 1. Can `SuiGrpcClient` run in browser / Vite?

Yes, at SDK level.

Evidence:
- Mysten `SuiGrpcClient` docs say the default transport is `GrpcWebFetchTransport` and that it works in browsers and Node via Fetch.
- Installed SDK source constructs `SuiGrpcClient` with `GrpcWebFetchTransport` by default when `transport` is not provided.

Important caveat:
- Browser support does **not** mean every existing DeepSignal RPC endpoint can serve it.
- The endpoint must support gRPC-web semantics. A JSON-RPC POST endpoint is not enough.

Assessment:
- `SuiGrpcClient` is browser-viable.
- DeepSignal still needs a separate concept like `currentGrpcUrl` or transport-aware endpoint resolution.

### 2. Can `SuiGrpcClient` use existing `currentRpcUrl` unchanged?

Not safely.

Why:
- Official migration docs say the same **full node URLs** can be reused.
- DeepSignal’s `currentRpcUrl` is not always a raw fullnode URL:
  - `src/lib/sui.ts` can resolve to `/api/sui-rpc`
  - `src/lib/sui.ts` can resolve to `/api/tatum/sui-rpc`
  - `src/lib/sui.ts` can resolve to a Tatum gateway URL
- Those are wired around JSON-RPC behavior today.

Implication:
- `https://fullnode.mainnet.sui.io:443` style endpoints may be reusable.
- DeepSignal’s **current abstraction** is not transport-neutral, so `currentRpcUrl` should not be reused blindly for gRPC.

Recommended interpretation:
- Reuse same provider only when that exact endpoint is known to support gRPC-web.
- Otherwise introduce a dedicated gRPC endpoint field rather than overloading JSON-RPC URLs.

### 3. Can `SuiClientProvider` / `WalletProvider` / dApp Kit accept `SuiGrpcClient`?

At SDK level, yes.

Evidence:
- `@mysten/dapp-kit-core` defines `DAppKitCompatibleClient = ClientWithCoreApi`.
- `createDAppKit({ createClient })` is typed around `ClientWithCoreApi`, not JSON-RPC specifically.

DeepSignal-specific blockers:
- `src/providers.tsx` currently constructs `new SuiJsonRpcClient(...)`.
- `src/lib/mystenDappKitCompat.ts` narrows `DeepSignalDAppKit` to `SuiJsonRpcClient`.
- Some local hooks and types assume JSON-RPC client types.

Assessment:
- The provider architecture is compatible.
- DeepSignal’s local typings and constructors need refactoring before the provider can become transport-agnostic.

### 4. What replaces `getOwnedObjects`?

`listOwnedObjects`.

Official mapping:
- JSON-RPC `getOwnedObjects`
- Core API `listOwnedObjects`

Key differences:
- Input filter changes:
  - Current JSON-RPC code uses `filter: { StructType: ... }`
  - Core API uses `type: string`
- Output changes:
  - JSON-RPC shape: `{ data, hasNextPage, nextCursor }`
  - Core API shape: `{ objects, hasNextPage, cursor }`
- Include options change:
  - JSON-RPC: `showType`, `showContent`, `showOwner`
  - Core API: `include: { content, json, objectBcs, previousTransaction, display }`

DeepSignal impact:
- `src/lib/nftOwnership.ts`
- `src/features/public-form/hooks/usePublicNftGate.ts`
- `src/lib/nftOwnershipApi.ts`
- any helper that expects `OwnedObjectEntry.data`

### 5. Can direct NFT ownership be reproduced in gRPC / Core API?

Yes, for direct ownership.

Current DeepSignal direct check behavior:
- scan owned objects by struct type
- scan all owned objects when object ID matching is needed
- fetch object metadata where required

Core API equivalent:
- `client.core.listOwnedObjects({ owner, type, include: { content: true } })`
- `client.core.listOwnedObjects({ owner, include: { content: true } })`
- `client.core.getObject({ objectId, include: { content: true } })`
- `client.listDynamicFields(...)` or `client.core.getDynamicField(...)` where kiosk/object-state reconstruction needs it

Constraint:
- Direct ownership is feasible.
- Existing DeepSignal implementation mixes direct ownership and kiosk ownership in one path, so only the direct half is cleanly movable.

### 6. Does `@mysten/kiosk` work with `SuiGrpcClient`?

Officially, no.

Evidence:
- Installed `@mysten/kiosk` migration doc says the kiosk SDK requires `SuiJsonRpcClient` or `SuiGraphQLClient`.
- Installed `@mysten/kiosk` type `KioskCompatibleClient` is `SuiJsonRpcClient | SuiGraphQLClient`.

This is the strongest blocker in this investigation.

### 7. If not, should kiosk stay on JSON-RPC?

Yes, likely in the near term.

Near-term options:
- Keep kiosk reads on JSON-RPC and move non-kiosk reads to gRPC.
- Or replace current kiosk path with a custom non-kiosk object-ownership strategy if product requirements allow it.
- Or test a GraphQL-based kiosk path later, but that is outside the minimal safe migration.

Recommendation:
- Treat kiosk as an isolated compatibility island.
- Do not force kiosk into the first gRPC migration PR.

### 8. Do Seal / Walrus SDKs depend on `SuiJsonRpcClient`?

The SDKs themselves are mostly better than the app code here.

Walrus:
- Installed `@mysten/walrus` extension registers against `ClientWithCoreApi`.
- DeepSignal already types runtime Walrus client as `ClientWithCoreApi & { walrus: WalrusClient }`.
- `src/storage/walrusAdapter.ts` uses `activeClient.core.executeTransaction(...)`, `core.waitForTransaction(...)`, and `core.getObjects(...)`.
- Conclusion: Walrus SDK is **not a major JSON-RPC blocker**.

Seal:
- Installed `@mysten/seal` type `SealCompatibleClient` is Core-API-shaped.
- But DeepSignal’s `src/crypto/sealClientAdapter.ts` still dynamically imports `@mysten/sui/jsonRpc` and creates a `SuiJsonRpcClient` as its fallback client.
- Conclusion: Seal SDK is transport-flexible, but DeepSignal’s adapter is not fully migrated.

### 9. Will write transactions / `signAndExecuteTransaction` be affected?

Yes, and more than the first pass suggested.

What appears safe:
- `src/lib/projectRegistryWrite.ts` only builds `Transaction` objects.
- dApp Kit accepts a compatible `ClientWithCoreApi`, so a `SuiGrpcClient` is valid at the type level.
- Core API supports `executeTransaction`, `signAndExecuteTransaction`, `simulateTransaction`, and `waitForTransaction`.
- `src/storage/walrusAdapter.ts` already uses Core API execution paths.

What still needs care:
- DeepSignal’s local dApp Kit typing currently assumes `SuiJsonRpcClient`.
- Wallet restore / provider boot code in `src/providers.tsx` should not be mixed with this migration casually.
- Existing Walrus wait override in `src/walrusRuntimeBridge.tsx` relies on `core.getTransaction`, which gRPC has, but any client-type narrowing would need retesting.
- Official `dapp-kit-core` source calls wallet-standard features for signing and execution, not DeepSignal-owned transport code.
- Official `wallet-standard` source falls back to `sui:signAndExecuteTransactionBlock` when the modern feature is unavailable.
- Therefore the browser wallet extension controls the last-mile send behavior. DeepSignal cannot force that final step to use gRPC purely by passing `SuiGrpcClient` into dApp Kit.
- In real DeepSignal runtime testing, Walrus publish still failed at the wallet approval / `signAndExecuteTransactionBlock` stage, which is consistent with this architecture boundary.

Conclusion:
- Transaction building code is not the blocker.
- The blocker is the browser-wallet boundary.
- A gRPC-first read path is realistic.
- A guaranteed gRPC-only browser wallet write path is not something the current official integration surface promises.

### 10. Can JSON-RPC be fully removed, or is dual-stack required?

Dual-stack is required for now.

Reasons:
- Kiosk is not supported on `SuiGrpcClient`.
- DeepSignal currently routes through JSON-RPC-specific endpoint abstractions.
- Seal fallback still instantiates `SuiJsonRpcClient`.
- A few internal helpers are typed to JSON-RPC and depend on JSON-RPC response shapes.

Recommended target state for the next phase:
- gRPC for generic reads and transaction lookup by digest
- JSON-RPC retained only where kiosk or remaining transport-specific gaps require it

## Core API Coverage Relevant To DeepSignal

### Covered well by gRPC / Core API

- Owned object listing: `listOwnedObjects`
- Object fetch: `getObject`, `getObjects`
- Dynamic field lookup: `listDynamicFields`, `getDynamicField`
- Transaction by digest: `getTransaction`
- Execute signed transaction: `executeTransaction`
- Wait for transaction visibility: `waitForTransaction`
- Simulate transaction: `simulateTransaction`

### Not equivalent to old JSON-RPC broad query APIs

- `queryTransactionBlocks` has no gRPC equivalent and should move to GraphQL if needed.
- Historical/pruned transaction or object fetch depends on retention or archival endpoint strategy.

For this repo today:
- I did not find a local `queryTransactionBlocks` dependency in the listed migration scope.
- Digest lookup is available through Core API, so ordinary post-submit confirmation is not blocked.

## Impacted Files

### Files explicitly in requested scope

- `src/hooks/useReadOnlySuiClient.ts`
- `src/providers.tsx`
- `src/lib/suiRpcTransport.ts`
- `src/lib/nftOwnership.ts`
- `src/features/public-form/hooks/usePublicNftGate.ts`
- `src/lib/projectRegistryWrite.ts`
- `src/storage/walrusRuntime.ts`
- `src/storage/walrusAdapter.ts`

### Additional files that are very likely in impact scope

- `src/lib/mystenDappKitCompat.ts`
- `src/crypto/sealClientAdapter.ts`
- `src/walrusRuntimeBridge.tsx`
- `src/lib/nftOwnershipApi.ts`
- `src/hooks/useOwnedSuiObjects.ts`
- `src/hooks/useProjectRegistry.ts`
- `src/hooks/useAccessRegistry.ts`
- `src/features/admin/hooks/useProjectWorkspace.ts`
- `src/features/admin/hooks/usePendingSuiRegistration.ts`
- `src/pages/AdminDashboardWorkspace.tsx`
- `src/pages/FormBuilderPage.tsx`

## Recommended Migration Order

### Phase 0: Transport inventory only

- Introduce a design decision that separates:
  - JSON-RPC endpoint
  - gRPC-web endpoint
- Do not switch runtime behavior yet.
- Confirm which providers and environments have working gRPC-web endpoints:
  - production fullnode/provider
  - dev proxy
  - Tatum path, if still needed

### Phase 1: Provider typing cleanup

- Make local dApp Kit types transport-agnostic:
  - stop narrowing app-level client type to `SuiJsonRpcClient`
  - align app wrappers to `ClientWithCoreApi`
- Keep runtime behavior unchanged in the same PR if possible.

### Phase 2: Read-only non-kiosk client path

- Add a parallel `useReadOnlyCoreSuiClient` or equivalent.
- Migrate simple read paths first:
  - object fetch
  - transaction digest lookup
  - non-kiosk owned-object reads
- Keep JSON-RPC path available behind unchanged call sites where needed.

### Phase 3: NFT direct ownership split

- Split `src/lib/nftOwnership.ts` into:
  - direct ownership path
  - kiosk ownership path
- Move direct ownership to Core API.
- Leave kiosk path on JSON-RPC for now.

### Phase 4: Seal fallback cleanup

- Remove DeepSignal-local fallback that hardcodes `SuiJsonRpcClient`.
- Reuse active Core-compatible client where available.

### Phase 5: Re-evaluate kiosk strategy

- Either:
  - keep kiosk permanently isolated on JSON-RPC, or
  - move kiosk to another supported transport, or
  - replace the dependency entirely

### Phase 6: Decide whether full JSON-RPC removal is still worth it

- Only after kiosk and endpoint strategy are solved.

## Dangerous Changes

These are the risky places to change too early:

- `src/providers.tsx`
  - This file is entangled with wallet auto-restore and provider boot timing.
  - Mixing transport migration with wallet boot behavior would make failures hard to diagnose.

- `src/features/public-form/hooks/usePublicNftGate.ts`
  - Public form access control is user-facing and wallet-optional route safety matters here.
  - A partial migration that breaks kiosk ownership would create false access denials.

- `src/lib/nftOwnership.ts`
  - This file currently mixes direct ownership, kiosk ownership, JSON-RPC response shapes, and diagnostics.
  - A broad rewrite here is easy to get wrong.

- `src/walrusRuntimeBridge.tsx`
  - This already overrides transaction visibility behavior and should not be casually rewritten during the first gRPC step.

- `src/crypto/sealClientAdapter.ts`
  - Session-key caching and approval flow are subtle. Any transport cleanup here should be isolated from NFT gate and provider work.

## Parts That Should Not Be Touched In The First PR

- Walrus upload behavior
- Safari lazy import behavior
- wallet auto-restore heuristics
- public route chunking / route prefetch behavior
- kiosk business logic beyond extracting an interface boundary

## Proposed Minimal PR Scope You Can Implement Right Now

This is the smallest safe PR I would recommend after this investigation:

1. Add a new markdown design note or code comments documenting that DeepSignal now has two transport concepts:
   - JSON-RPC endpoint
   - gRPC endpoint

2. Refactor app-level typings only:
   - make `src/lib/mystenDappKitCompat.ts` and related wrappers depend on `ClientWithCoreApi` instead of `SuiJsonRpcClient` where possible
   - do not change wallet runtime behavior yet

3. Add a new gRPC read-only client factory alongside the existing JSON-RPC one:
   - no caller migration yet, or only a tiny non-kiosk caller

4. Do not touch kiosk lookup behavior in that PR.

5. Do not remove `src/lib/suiRpcTransport.ts` in that PR.

That PR would reduce future migration cost without risking public NFT gating, kiosk compatibility, or wallet boot behavior.

## Final Recommendation

Proceed with a **hybrid migration**, not a hard cutover.

Recommended stance:
- Use gRPC/Core API for new generic reads and transaction digest lookup.
- Keep kiosk on JSON-RPC until DeepSignal intentionally replaces that dependency.
- Keep browser wallet `signAndExecuteTransaction` on the most stable supported path for now, even if read paths move to gRPC.
- Treat endpoint resolution as a first-class migration problem.
- Keep the first implementation PR small and type-focused.

## Official SDK Findings On Wallet Submission

These findings come from the installed official package sources reviewed locally.

### dApp Kit accepts gRPC-compatible clients

`@mysten/dapp-kit-core` defines the client contract as `ClientWithCoreApi`.

Implication:
- `SuiGrpcClient` is valid as the `createClient(...)` return type.
- This confirms provider compatibility at the type and construction level.

### dApp Kit delegates signing and execution to wallet-standard

Official `sign-and-execute-transaction` implementation in dApp Kit:
- serializes the transaction with `transaction.toJSON({ client: suiClient, supportedIntents })`
- then calls wallet-standard account features

Those features are:
- `sui:signAndExecuteTransaction`
- or legacy `sui:signAndExecuteTransactionBlock`

Implication:
- the app-provided client helps transaction serialization and transaction-building resolution
- but the browser wallet owns the final approval and submission flow

### wallet-standard itself still uses the wallet feature boundary

Official `@mysten/wallet-standard` helpers:
- prefer `sui:signAndExecuteTransaction`
- otherwise fall back to `sui:signAndExecuteTransactionBlock`

Implication:
- if a wallet extension only exposes legacy block execution, the app still goes through that legacy feature
- the app cannot force the wallet extension to use the gRPC transport internally

### What this means for DeepSignal

Possible:
- `SuiGrpcClient` for read-only paths
- `SuiGrpcClient` for app-controlled signers
- `SuiGrpcClient` as a dApp Kit client input

Not guaranteed by official integration surface:
- browser extension wallet approval and submission over true end-to-end gRPC
- removing JSON-RPC purely by switching the dApp Kit client constructor

Observed in DeepSignal runtime:
- Walrus publish failed at wallet approval / `signAndExecuteTransactionBlock`
- this persisted as a runtime concern even after app-side client changes
- therefore the practical recommendation remains hybrid, not full cutover

## Sources

Official:
- [Mysten TypeScript SDK](https://sdk.mystenlabs.com/sui)
- [Sui Docs: Wallet Standard](https://docs.sui.io/onchain-finance/asset-custody/wallets/wallet-standard)

Installed package sources reviewed locally:
- `node_modules/@mysten/sui/src/grpc/client.ts`
- `node_modules/@mysten/sui/src/grpc/core.ts`
- `node_modules/@mysten/dapp-kit-core/src/core/types.ts`
- `node_modules/@mysten/dapp-kit-core/src/core/actions/sign-and-execute-transaction.ts`
- `node_modules/@mysten/wallet-standard/src/wallet.ts`
- `node_modules/@mysten/kiosk/src/types/index.ts`
- `node_modules/@mysten/sui/docs/migrations/sui-2.0/kiosk.md`
- `node_modules/@mysten/walrus/dist/client.d.mts`
- `node_modules/@mysten/seal/dist/types.d.mts`

DeepSignal files reviewed locally:
- `src/hooks/useReadOnlySuiClient.ts`
- `src/providers.tsx`
- `src/lib/suiRpcTransport.ts`
- `src/lib/nftOwnership.ts`
- `src/features/public-form/hooks/usePublicNftGate.ts`
- `src/lib/projectRegistryWrite.ts`
- `src/storage/walrusRuntime.ts`
- `src/storage/walrusAdapter.ts`
- `src/lib/mystenDappKitCompat.ts`
- `src/crypto/sealClientAdapter.ts`
- `src/walrusRuntimeBridge.tsx`
- `src/lib/sui.ts`
- `src/rpcInfrastructure.tsx`
