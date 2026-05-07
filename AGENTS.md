# AGENTS.md

This repository is a Vite + React + TypeScript app for DeepSignal, a Walrus-native feedback/forms MVP.

## Product intent

- Keep the core framing intact: DeepSignal is a Walrus-native feedback and forms MVP.
- Treat the admin dashboard as an `Encrypted Signal Inbox`, not a generic CRUD back office.
- Preserve the split between public responder flows and creator/admin review flows.

## Architecture guardrails

- Public form routes must stay wallet-optional. Do not introduce a wallet requirement for responders on `/f/:formId`, roadmap viewers, or restore/recovery flows unless the product explicitly changes.
- Sui wallet integration uses Mysten dApp Kit. Reuse the existing provider and helper structure instead of introducing a second wallet stack.
- Walrus storage code lives in `src/storage`. Keep Walrus upload, manifest, blob-index, and storage selection concerns there.
- Seal encryption code lives in `src/crypto`. Keep encryption adapters, payload helpers, and mode selection there.
- Always preserve the `localStorage` fallback path. Walrus and Seal are progressive capabilities; the app must still function in local/demo mode when env vars are missing or remote writes fail.
- Maintain the storage/crypto adapter pattern. Prefer extending adapters and factories over scattering Walrus or Seal conditionals across unrelated UI code.

## Implementation guidance

- Favor changes that preserve backward compatibility for older locally cached forms and submissions.
- Keep manifest/recovery behavior aligned with the README architecture: manifests are recovery indexes, not a source of sensitive payload data.
- When changing wallet-gated admin behavior, make sure public routes remain accessible without a wallet.
- Keep TypeScript, React, and routing patterns consistent with the existing Vite app structure.
- Do not move Walrus logic out of `src/storage` or Seal logic out of `src/crypto` without a strong architectural reason and corresponding documentation updates.

## Validation

- Always run `npm run typecheck` after TypeScript changes.
- Run `npm run build` before finishing larger changes.
- If behavior changes affect storage, crypto, wallet gating, or public routes, sanity-check both the admin flow and the wallet-optional public flow.

## Change scope reminders

- Prefer focused changes over broad refactors.
- Update `README.md` when architecture, env expectations, or operator workflows materially change.
- Do not remove or weaken the local fallback behavior unless the product requirements explicitly change.
