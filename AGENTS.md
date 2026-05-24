# AGENTS.md

This repository is a Vite + React + TypeScript app for DeepSignal.

DeepSignal is a realtime signal intelligence workspace. It collects, analyzes, visualizes, and triages live signals so operators can understand what is happening and decide what to do next.

## Product philosophy

- DeepSignal is not a generic form app.
- DeepSignal is not just a disaster check-in app.
- DeepSignal is not a generic admin dashboard.
- DeepSignal is a live signal intelligence workspace.
- Everything revolves around signals.
- Projects, insights, maps, alerts, AI analysis, and workflows originate from signals.
- Treat creator/admin surfaces as an operational `Signal Intelligence Workspace` and `Encrypted Signal Inbox`, not a CRUD back office.
- Preserve the split between public responder flows and creator/admin review flows.

## UX philosophy

- Prioritize situation awareness first.
- Prioritize signal understanding second.
- Prioritize fast response and triage third.
- Treat secondary settings and configuration as lower priority.
- Avoid interfaces where operators do not know what to do next.
- Empty states must always point to the next useful action.
- If no project exists, guide the user to `Create Project`.
- If a project exists but has no signal, guide the user to `Compose Signal`.
- Keep public form routes simple and accessible. They support signal collection, but they are not the whole product.

## Visual language

- Favor an operational, realtime, analytical feel.
- Aim for urgent but calm.
- Make the UI feel like an intelligence dashboard with signal flow and activity.
- Reduce dead space when it weakens situational awareness or actionability.
- Avoid generic SaaS dashboard patterns.
- Avoid static CRUD admin layouts.
- Avoid spreadsheet-like UI.
- Avoid plain survey-form framing.
- Avoid boring enterprise panels.

## AI behavior

- AI features must do more than summarize.
- Detect anomalies.
- Identify emerging patterns.
- Classify urgency.
- Compare signal clusters.
- Surface operational insights.
- Explain why something matters.
- Suggest next actions when useful.
- Keep AI outputs grounded in observable signal evidence when possible.

## Blockchain and storage positioning

- Sui, Walrus, and Tatum are embedded infrastructure, not the main character of the UI.
- Use them to support verifiable storage, durable signal history, trustworthy audit trails, and decentralized persistence.
- Do not turn the product into a wallet dashboard.
- Do not drift toward token, DeFi, or crypto-jargon-heavy UX.
- Do not overexpose blockchain concepts unless they are necessary for trust, recovery, or operator understanding.

## Architecture guardrails

- Public form routes must stay wallet-optional. Do not introduce a wallet requirement for responders on `/f/:formId`, roadmap viewers, or restore/recovery flows unless the product explicitly changes.
- Sui wallet integration uses Mysten dApp Kit. Reuse the existing provider and helper structure instead of introducing a second wallet stack.
- Walrus storage code lives in `src/storage`. Keep Walrus upload, manifest, blob-index, and storage selection concerns there.
- Seal encryption code lives in `src/crypto`. Keep encryption adapters, payload helpers, and mode selection there.
- Always preserve the `localStorage` fallback path. Walrus and Seal are progressive capabilities; the app must still function in local/demo mode when env vars are missing or remote writes fail.
- Maintain the storage/crypto adapter pattern. Prefer extending adapters and factories over scattering Walrus or Seal conditionals across unrelated UI code.

## Implementation guidance

- Keep diffs focused and minimal.
- Do not rewrite unrelated code.
- Prefer existing components, hooks, and patterns.
- Avoid unnecessary new dependencies.
- Preserve existing behavior unless the task explicitly requires changing it.
- Consider mobile behavior for any UI change.
- Favor changes that preserve backward compatibility for older locally cached forms and submissions.
- Keep manifest/recovery behavior aligned with the README architecture: manifests are recovery indexes, not a source of sensitive payload data.
- When changing wallet-gated admin behavior, make sure public routes remain accessible without a wallet.
- Keep TypeScript, React, and routing patterns consistent with the existing Vite app structure.
- Do not move Walrus logic out of `src/storage` or Seal logic out of `src/crypto` without a strong architectural reason and corresponding documentation updates.

## Validation

- Run available checks before finalizing when possible.
- Always run `npm run typecheck` after TypeScript changes.
- Run `npm run build` before finishing larger changes.
- If behavior changes affect storage, crypto, wallet gating, or public routes, sanity-check both the admin flow and the wallet-optional public flow.

## Anti-patterns

- Do not steer DeepSignal toward a Notion clone.
- Do not steer DeepSignal toward an Airtable clone.
- Do not steer DeepSignal toward a Google Forms clone.
- Do not steer DeepSignal toward a generic admin dashboard.
- Do not steer DeepSignal toward a spreadsheet UI.
- Do not steer DeepSignal toward ticket management SaaS.
- Do not frame it as a disaster-only app.

## Change scope reminders

- Prefer focused changes over broad refactors.
- Update `README.md` when architecture, env expectations, or operator workflows materially change.
- Do not remove or weaken the local fallback behavior unless the product requirements explicitly change.
