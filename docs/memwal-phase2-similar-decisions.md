# MemWal Phase 2: Similar Past Decisions

Status: design only. Do not install the MemWal SDK, ship runtime MemWal calls, or add public route dependencies in this phase.

## Goal

Design the first real MemWal-backed product usage in DeepSignal: an admin-only `Similar Past Decisions` panel in the Encrypted Signal Inbox. When a reviewer opens a selected Signal, DeepSignal recalls prior saved review decisions that look operationally similar. When the reviewer saves the current review, DeepSignal writes a compact redacted memory record for future recall.

This is not a generic memory surface. It supports reviewer decision-making inside the Signal Intelligence Workspace by answering:

- Have we seen a similar Signal before?
- What decision did reviewers make then?
- What evidence made that decision useful?
- What follow-up action worked or failed?

## Scope

In scope:

- Admin Inbox only.
- Selected Signal detail and review session context only.
- Recall when a reviewer opens or changes the selected Signal.
- Write memory only after an existing review save succeeds.
- Use the existing no-op memory adapter and config placeholder until the SDK path is approved.
- Preserve local storage, Walrus, and Seal fallback behavior.

Out of scope:

- Public form routes, roadmap viewers, recovery flows, or respondent surfaces.
- Public route imports of `src/memory`, MemWal, Mysten, Walrus, or Seal runtime code.
- Installing `@mysten-incubation/memwal`.
- Writing raw answers, attachments, decrypted payloads, blob IDs, wallet identifiers, or direct respondent identifiers into memory.
- Treating memory as canonical review, manifest, deletion, or audit state.

## 1. UI Placement

Add `Similar Past Decisions` as an admin-only support panel in the selected Signal detail area.

Preferred placement:

- Put it in `SecondaryInspector`, adjacent to the existing `Related Signals` panel.
- Keep `Related Signals` focused on local inbox similarity and duplicate detection.
- Use `Similar Past Decisions` for MemWal recall from saved historical decisions across the same project namespace.

Panel behavior:

- Closed or compact by default unless the current Signal has high priority, duplicate-likely local matches, or recall returns a high-confidence match.
- Empty state should be actionable: "No prior decision memory for this Signal yet. Save a review to make future Signals easier to triage."
- Loading state should be quiet and non-blocking.
- Match rows should show decision-first information:
  - prior triage status;
  - priority and signal value;
  - reviewer-approved summary;
  - safe evidence fragments;
  - follow-up outcome if present;
  - source Signal reference, using DeepSignal IDs already visible to reviewers;
  - relevance/confidence label, not raw vector details.
- Do not expose MemWal, Walrus, Sui, delegate keys, or relayer details as the main UI language. Those belong in diagnostics or health checks.

Review modal placement:

- Do not put the first version inside the public route or respondent flow.
- The review session may show a compact "Past decisions available" affordance after recall succeeds, but the full panel should live in the selected Signal detail/secondary inspector so review classification remains focused.

## 2. Data Read Path

Recall starts only after normal admin inbox access and selected Signal resolution.

Read path:

1. `useSignalInboxData` loads forms and submissions through the existing storage adapter, remote submission index, project registry, and local fallback paths.
2. `AdminDashboardPage` derives `selectedRecord` from the visible Signal index.
3. A future `useSignalMemoryRecall` hook observes `selectedRecord`, reviewer access state, decrypt state, and the MemWal feature flag.
4. The hook builds a recall query from safe selected Signal context:
   - `projectId` or legacy `formId` namespace;
   - submission id and on-chain signal id only as source references;
   - form title, signal type, analyst type, category, tags;
   - subject preview, safe preview text, `aiSummary`, keywords, cluster id, priority, severity, triage status;
   - visible reviewer notes only when already saved;
   - optional decrypted-derived facts only after unlock and only if they are redacted into compact safe evidence.
5. `memoryAdapter.recallReviewMemory(query)` returns matches or a skipped status.
6. The UI filters out revoked, superseded, wrong-namespace, wrong-project, and self-matching records before display.

Namespace:

```text
deepsignal:project:{projectId}:review-memory:v1
```

Fallback for legacy forms without `projectId`:

```text
deepsignal:form:{formId}:review-memory:v1
```

Read constraints:

- Never recall from a global workspace namespace in the first real usage.
- Do not call memory recall from `/f/:formId`, public roadmap, restore, recovery, or public submission code.
- Encrypted Signals may use metadata-only recall before unlock. Decrypted-answer-derived recall should wait until the reviewer has legitimate access and the derived query has passed redaction.
- Recall results are evidence for reviewers, not instructions for AI or automatic triage.

## 3. Memory Write Payload

Memory writes happen only after the existing review save succeeds.

Write trigger:

1. Reviewer edits classification, priority, signal value, notes, reviewer, follow-up, or roadmap decision.
2. Existing review save persists the updated `Submission` through the current storage path.
3. After that save returns success, a future admin-only memory write receives the saved submission plus form/project context.
4. Memory write failure does not roll back the review save.

Recommended payload shape:

```json
{
  "kind": "deepsignal.review_decision_memory.v1",
  "namespace": "deepsignal:project:{projectId}:review-memory:v1",
  "source": {
    "projectId": "0x...",
    "formId": "form_...",
    "submissionId": "sub_...",
    "onchainSignalId": 12
  },
  "decision": {
    "status": "read",
    "triageStatus": "investigating",
    "priority": "high",
    "signalValue": 4,
    "publicRoadmapDecision": "internal_only",
    "needsFollowUp": true
  },
  "summary": "Reviewer treated this as a high-priority repeated mobile failure and kept it internal pending reproduction.",
  "safeEvidence": [
    "Repeated reports mention the same mobile browser flow.",
    "Related Signals were marked possible duplicates.",
    "Reviewer requested reproduction before roadmap publication."
  ],
  "pattern": {
    "category": "bug",
    "tags": ["mobile", "follow-up"],
    "keywords": ["mobile", "upload", "retry"],
    "clusterId": "cluster_mobile_upload_retry"
  },
  "review": {
    "reviewerLabel": "project-reviewer",
    "reviewedAt": "2026-05-31T00:00:00.000Z",
    "reviewId": "review_sub_..._2026-05-31T00:00:00.000Z"
  },
  "lifecycle": {
    "createdAt": "2026-05-31T00:00:00.000Z",
    "supersedesReviewId": null,
    "supersededAt": null,
    "revokedAt": null
  }
}
```

Payload rules:

- Store the final saved decision, not unsaved draft state.
- Store compact reviewer-approved facts, not raw submission data.
- Include enough source identity for the admin UI to link back through authorized DeepSignal review flows.
- Include lifecycle fields so later recall can filter superseded or revoked memories at the application layer.
- If a later review changes the same Signal, write a new memory that supersedes the previous review memory instead of mutating canonical submission state.

## 4. Redaction Rules

All writes must pass through a dedicated redaction function before reaching any MemWal adapter.

Do not write:

- raw answer bodies;
- raw decrypted payloads;
- attachment names, URLs, inline data, file contents, hashes, or blob IDs;
- Walrus blob IDs, encrypted blob IDs, manifest blob IDs, receipt blob IDs, object IDs, or transaction digests unless a later threat model explicitly approves a specific reference type;
- wallet addresses, OAuth identifiers, zkLogin subjects, emails, phone numbers, names, or direct respondent identifiers;
- private reviewer notes verbatim when they contain sensitive content;
- hidden form fields or fields excluded from insight eligibility.

Allowed by default:

- project/form/submission references already used by the admin app for routing;
- on-chain signal numeric id when already visible to the reviewer;
- triage status, priority, status, signal value, public decision class, and follow-up flag;
- redacted tags, categories, keyword stems, safe cluster ids, and derived pattern labels;
- short reviewer-approved summary;
- safe evidence fragments that describe the operational pattern without reproducing sensitive payload values.

If redaction cannot produce useful evidence, write a minimal decision memory or skip the memory write with reason `redaction_empty`. Review save must still succeed.

## 5. Failure Behavior

MemWal is advisory. It must never become a hard dependency for admin triage.

Recall failures:

- Show the panel as unavailable, skipped, or empty depending on the adapter result.
- Do not block selected Signal rendering, decryption, review editing, exports, or related-signal local matching.
- Avoid repeated retry loops. Retry only on selected Signal change, manual refresh, or a bounded hook refresh.
- Log diagnostics in admin-only channels without exposing sensitive query content.

Write failures:

- Review save remains successful if canonical storage succeeds.
- Surface memory write state as `memory skipped`, `memory pending`, or `memory unavailable` only where useful.
- Do not overwrite `reviewSaveStatus` with an error if only memory sync failed.
- Do not queue unredacted payloads in localStorage or sessionStorage.
- If a safe retry queue is added later, it must contain only the already redacted memory payload and must be bounded.

Misconfiguration:

- If `VITE_MEMWAL_ENABLED=false`, all reads and writes use the no-op adapter and report `disabled`.
- If enabled but required runtime config is missing, report `misconfigured` in admin diagnostics and skip runtime calls.
- If enabled and configured before SDK install, report `ready-placeholder` through the existing health check and still use the no-op adapter.

## 6. Feature Flag Behavior

Current placeholder flag:

```bash
VITE_MEMWAL_ENABLED=false
```

Expected behavior:

- Default is disabled.
- Disabled means no panel fetch, no memory write, no SDK import, and no network call.
- Enabled without complete config means admin-only diagnostics show misconfigured state; review flows continue normally.
- Enabled with complete config but no SDK implementation means the adapter remains no-op and the UI may show a placeholder-disabled or diagnostics-only state.
- A later real adapter must lazy-load MemWal only from admin-only code paths.

Recommended future flags:

```bash
VITE_MEMWAL_ENABLED=false
VITE_MEMWAL_SERVER_URL=
VITE_MEMWAL_ACCOUNT_ID=
VITE_MEMWAL_DELEGATE_KEY=
VITE_MEMWAL_NAMESPACE_PREFIX=deepsignal
```

Security note:

- Do not ship long-lived delegate keys in a public browser bundle for production. Before real production writes, choose a safer credential model such as a backend-for-frontend, self-hosted relayer policy, short-lived delegated credentials, or wallet-derived account management.

## 7. Test Plan

Unit tests:

- Redaction removes raw answers, attachments, blob IDs, wallet addresses, emails, OAuth/zkLogin identifiers, and transaction/proof fields.
- Redaction keeps safe decision fields, tags, categories, cluster ids, summaries, and follow-up flags.
- Recall query builder uses metadata-only inputs for locked encrypted Signals.
- Recall query builder adds decrypted-derived evidence only after unlock and redaction.
- Memory write builder runs only from saved submission state.
- Superseded and revoked memories are filtered from display.
- Self-matches are filtered from recall results.
- Feature flag disabled returns no-op/skipped recall and write results.
- Misconfigured enabled state never attempts runtime calls.

Admin integration tests:

- Selecting a Signal triggers recall once for the active selected record.
- Changing selected Signal cancels or ignores stale recall results.
- Saving a review persists the submission first, then attempts memory write.
- Memory write failure does not change successful review save behavior.
- The `Similar Past Decisions` panel renders loading, empty, skipped, unavailable, and matched states.
- Encrypted locked Signals do not leak answer content into recall queries.

Bundle and route isolation tests:

- Public routes do not import `src/memory`.
- Public form initial static imports do not include MemWal, admin dashboard, wallet surfaces, TipTap, Mysten/Sui, Walrus, or Seal runtime chunks.
- Any dynamic import references to admin memory code remain on admin-only paths.

Manual QA:

- Admin Inbox with flag disabled behaves exactly as today.
- Admin Inbox with placeholder enabled shows diagnostics/placeholder behavior without network calls.
- Review save works with local fallback storage.
- Review save works with Walrus-backed submissions.
- Locked encrypted Signal recall uses metadata only.
- Unlocked encrypted Signal recall still writes only redacted facts.
- Public `/f/:formId` remains wallet-optional and memory-free.

Validation commands for a code phase:

```bash
npm run typecheck
npm run build
```

After routing or bundling changes, inspect `dist/index.html` and generated public route chunks for forbidden static imports.

## 8. Files Likely To Change

Likely new files:

- `src/features/admin/hooks/useSignalMemoryRecall.ts`
- `src/features/admin/components/SimilarPastDecisionsPanel.tsx`
- `src/features/admin/memory/buildReviewMemoryRecord.ts`
- `src/features/admin/memory/buildReviewMemoryRecallQuery.ts`
- `src/features/admin/memory/redactReviewMemory.ts`
- `src/features/admin/memory/*.test.ts`

Likely existing files:

- `src/pages/AdminDashboardPage.tsx`
- `src/features/admin/components/SecondaryInspector.tsx`
- `src/features/admin/hooks/useReviewWorkspace.ts` or the surrounding save handler in `AdminDashboardPage.tsx`
- `src/memory/types.ts`
- `src/memory/factory.ts`
- `src/memory/noopMemoryAdapter.ts`
- `src/memory/memwalConfig.ts`
- `src/features/admin/memory/memwalHealthCheck.ts`
- `src/lib/publicRouteMemWalImports.test.ts`
- `src/i18n.tsx`
- `src/styles/pages/admin-inbox.css`
- `src/styles/mobile/review.css`
- `README.md` only if the implementation materially changes env expectations or operator workflow.

Files that should not gain dependencies:

- `src/features/public-form/**`
- public route loaders and entry points
- restore/recovery flows
- respondent history flows
- roadmap viewer flows

## Implementation Order For A Later Code Phase

1. Add redaction and payload/query builders with tests.
2. Add no-op-backed `useSignalMemoryRecall` and panel states with no SDK import.
3. Wire recall into selected Signal detail only.
4. Wire post-save memory write after canonical review save success.
5. Extend public-route isolation tests.
6. Revisit SDK install and real adapter only after the trust model and credential handling are approved.
