# NFT Gate Ownership Investigation

Updated: 2026-06-11

## Summary

DeepSignal の NFT Gate 失敗原因は、主に `direct owned object` と `kiosk item` を同じ経路で扱っていたことと、所有判定が遅い割に失敗理由を返し切れていなかったことです。

今回の対象 NFT は type 自体が間違っていたのではなく、対象ウォレットで `direct owned` ではなく `kiosk` 内に保持されていました。

## Chain Findings

Network:
- `mainnet`

Target wallet:
- `0xfb1bb74cfa20a99fb8a9d0822c68b28623c407b6cb497734d7ef4f3da52b624e`

Target object:
- `0x3dd324c329421180a51c1dab7ed2a4181012dab8c178e6cfab2b3debe608c481`

Actual object type:
- `0x034c162f6b594cb5a1805264dd01ca5d80ce3eca6522e6ee37fd9ebfb9d3ddca::factory::PrimeMachin`

Conclusion on expected type:
- 期待 type は正しい
- package id / module / struct name は on-chain object と一致していた
- generic type の不一致はなかった

Ownership state of the target NFT:
- `direct owned`: なし
- `kiosk owned`: あり
- `locked`: あり
- `listed`: なし

Resolved kiosk path:
1. target object owner = dynamic field object
2. dynamic field owner = kiosk object id
3. kiosk object fields.owner = target wallet
4. kiosk item state = `["placed", "locked"]`

Resolved kiosk id:
- `0x122ee6286c5546e41ce7c5507932f824dd7cf2708d5f595beee4ae29809f82ed`

The wallet’s overall holdings at investigation time:
- owned objects: `1375`
- unique direct object types: `463`
- owned kiosks detected: `98`
- kiosk items detected during full kiosk scan: `192`

## Root Cause

1. direct ownership だけを見ても今回の NFT は見つからない
2. kiosk 走査はできていたが、public NFT Gate では transport 前提が混ざっていて追跡しづらかった
3. objectId 指定がある場合でも、先に広い direct scan をしやすく、無駄に重かった
4. diagnostic に `rpcTransportUsed` / `kioskTransportUsed` / expected vs actual breakdown がなく、原因が見えづらかった

## Implementation Direction

今回の最適化では以下に整理した:

1. `objectId lookup` を最優先
2. `direct ownership` と `kiosk ownership` を分離
3. `struct type` 一致は normalized comparison を必ず使用
4. `locked` / `listed` を kiosk state に反映
5. public form では `Core API / gRPC` を direct read に使い、`kiosk` だけ JSON-RPC extension fallback を許容

## Current Behavior After Refactor

- `src/lib/nftOwnership.ts`
  - transport-neutral な ownership client を受け取る
  - `objectId` 指定時は object lookup を先に実施
  - direct match, kiosk match, diagnostic を明確に分離
- `src/features/public-form/hooks/usePublicNftGate.ts`
  - direct read は `SuiGrpcClient` を優先
  - kiosk extension が必要な箇所だけ `SuiJsonRpcClient` fallback を併用
- `src/hooks/useOwnedSuiObjects.ts`
  - read path を `Core API` 寄りに更新

## Diagnostic Fields

強化した diagnostic には少なくとも以下が含まれる:

- `connectedAddress`
- `expectedTypes`
- `expectedObjectIds`
- `directOwnedTypes`
- `kioskItemTypes`
- `matchedDirectObjects`
- `matchedKioskItems`
- `actualTypeBreakdown`
- `expectedTypeBreakdown`
- `zeroCountReason`
- `rpcTransportUsed`
- `kioskTransportUsed`

## Notes On gRPC And Kiosk

- direct ownership 判定は `Core API / gRPC` で高速化可能
- `@mysten/kiosk` extension は現行パッケージでは `SuiGrpcClient` をそのまま受け取れない
- そのため kiosk 判定だけ JSON-RPC fallback を残すのが現実的
- 今回の対象 NFT のように `kiosk + locked` でも検出は必要で、対応済み

## Validation

Confirmed locally:

- targeted chain investigation completed
- targeted NFT Gate tests passed
- `npm run typecheck` passed

Pending full repo validation:

- `npm run check`
