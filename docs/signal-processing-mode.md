# Signal Processing Mode Design Research

## Summary

DeepSignal currently behaves as an encrypted signal inbox: every public response is modeled as a `Submission`, persisted through the storage adapter, indexed for owner/admin retrieval, and surfaced in the admin review workspace. That is the right default for sensitive signals, but it makes review feel mandatory even for survey, voting, NPS, and lightweight aggregation use cases.

The recommended direction is to describe each form as a Signal Processing Pipeline:

`Collect -> Encrypt -> Process -> Review(Optional) -> Publish(Optional) -> Insights`

Inbox and Review should remain first-class capabilities, but form authors should be able to choose whether every response enters the review queue, only risky fields enter review, or responses are processed directly into aggregate Insights.

## Modes

### 1. Review Required

Current behavior, made explicit. Responses are saved as submissions, delivered to the owner inbox, and initialized as reviewable records.

Use cases:

- Bug reports
- Inquiries
- Internal consultations
- Responses containing personal information
- Disaster, emergency, safety, or incident signals

Recommended semantics:

- `processingMode: "review_required"`
- Full submission remains review-eligible by default.
- `reviewState` starts as `queued`.
- `visibilityState` starts as `private`.
- `insightEligibility` can still allow metadata-level or unlocked-safe insights, but review remains the primary workflow.

### 2. Auto Process

Responses do not require human review before they become useful. They should be stored and recoverable, but the primary operator surface is aggregate Insights, not an unread inbox queue.

Use cases:

- Satisfaction surveys
- NPS
- Polls
- Event attendance interest
- Popularity rankings

Recommended semantics:

- `processingMode: "auto_process"`
- Submission is stored as evidence and included in aggregate Insights immediately.
- `reviewState` starts as `not_required`.
- `visibilityState` starts as `aggregate_only`.
- Free-text/private fields should either be avoided by template design or explicitly marked ineligible for raw display.

Important distinction: Auto Process should not mean "do not store." It means "do not force operator review before aggregation."

### 3. Hybrid

Structured, aggregate-safe fields are processed immediately. Riskier fields such as free text, attachments, location, contact details, or sensitive fields enter review.

Use cases:

- Event satisfaction
- Product feedback
- Feature requests
- Community vote plus optional comments

Recommended semantics:

- `processingMode: "hybrid"`
- Submission can have both an immediate aggregate projection and a review queue projection.
- `reviewState` starts as `queued` only when review-eligible fields are present or policy rules flag the response.
- `visibilityState` starts as `aggregate_only` for structured fields and `private` for reviewable content.
- `insightEligibility` should be field-aware, not only submission-wide.

## Current Response Flow

### Public form submission

The public submission hook builds the response, attachments, respondent metadata, and pipeline UI state in `src/features/public-form/hooks/usePublicSubmission.ts`.

Key references:

- `SIGNAL_PIPELINE_STAGES` includes `inbox_syncing`, so the public responder pipeline already assumes owner inbox delivery as a terminal phase (`src/features/public-form/hooks/usePublicSubmission.ts:89`).
- A new `Submission` is created with `status: "unread"`, `priority: "medium"`, `triageStatus: "new"`, `tags: []`, and `notes: ""` (`src/features/public-form/hooks/usePublicSubmission.ts:1330`).
- The hook immediately enqueues a local pending inbox sync before remote persistence (`src/features/public-form/hooks/usePublicSubmission.ts:1389`).
- `saveSubmissionWithEncryption(...)` persists the signal and returns blob/index metadata (`src/features/public-form/hooks/usePublicSubmission.ts:1399`).
- The UI then transitions through `inbox_syncing` and computes `deliveryStatus` as `stored_local`, `inbox_pending`, or `inbox_synced` (`src/features/public-form/hooks/usePublicSubmission.ts:1416`, `src/features/public-form/hooks/usePublicSubmission.ts:1440`).

### Walrus/local storage

Storage is adapter-driven. Local fallback is not optional and must remain intact.

Key references:

- `FormSchema`, `SignalManifest`, and `Submission` live in `src/types.ts` (`src/types.ts:139`, `src/types.ts:219`, `src/types.ts:327`).
- `SubmissionDeliveryStatus` is currently coupled to inbox delivery: `stored_local | stored_walrus | inbox_pending | inbox_synced` (`src/types.ts:60`).
- `localStorageAdapter.saveSubmission` sanitizes and stores every submission under `deepsignal.submissions`, assigning local blob and delivery metadata when needed (`src/storage/localStorageAdapter.ts:92`).
- `walrusAdapter.saveSubmission` writes submission bundles and updates the manifest/submission index (`src/storage/walrusAdapter.ts:1813`, `src/storage/walrusAdapter.ts:2156`).
- `walrusAdapter.listSubmissions` reads from the manifest when available, otherwise from the local blob index (`src/storage/walrusAdapter.ts:2164`).

### Manifest

The manifest is a recovery index, not a sensitive payload container.

Key references:

- `SignalManifest.submissions[]` stores `submissionId`, `blobId`, timestamps, version, form blob, and schema hash, but not answer bodies (`src/types.ts:219`).
- `createManifest(...)` accepts form metadata and submission entries, then preserves minimal recovery data (`src/storage/walrusAdapter.ts:1329`).
- Form bundle and submission bundle types carry both payload and manifest carrier records (`src/storage/walrusAdapter.ts:67`, `src/storage/walrusAdapter.ts:73`).

Design implication: if `processingMode` is needed for cross-device recovery before the full form is loaded, it can be duplicated into manifest safe metadata. Submission-level insight/review state should not be expanded inside manifest beyond safe routing metadata.

### Owner inbox

Owner/admin retrieval combines local submissions, remote index entries, manifest reads, and on-chain shadow records.

Key references:

- Remote owner index entries are modeled in `SubmissionIndexEntry` with `answerBlobId`, submitter mode, status, form/project IDs, and signal ID (`src/storage/submissionDelivery.ts:6`).
- `buildSubmissionIndexEntry(...)` creates owner-readable index entries from a submission (`src/storage/submissionDelivery.ts:74`).
- `fetchRemoteSubmissionIndex(...)` retrieves remote index records for admin inbox hydration (`src/storage/submissionDelivery.ts:146`).
- Admin data loading calls `storageAdapter.listSubmissions(form.id)` and merges remote indexed submissions (`src/features/admin/hooks/useSignalInboxData.ts:1106`).
- `matchesStream(...)` defines review stream membership; `needs_review` currently means every non-archived signal (`src/features/admin/hooks/useSignalInboxData.ts:592`).
- `fullSignalIndex` counts `needsReview` for every non-archived submission (`src/features/admin/hooks/useSignalInboxData.ts:1283`, `src/features/admin/hooks/useSignalInboxData.ts:1327`).

### Admin dashboard

The admin dashboard is built around a review workspace with tabs for review, activity, insights, and members.

Key references:

- `WorkspaceTab` includes `review`, `activity`, `insights`, and `members` (`src/pages/AdminDashboardPage.tsx:139`).
- Review actions and roadmap/publish readiness are tied to submission `status` and `triageStatus`.
- CSV export is launched from the admin workspace and exports the selected review slice.

### Insights

Insights already operate over `SignalRecord[]`, not over a separate analytics projection.

Key references:

- `WorkspaceInsights` derives readable summaries from `record.submission.answers` unless the submission is encrypted or archived (`src/features/admin/components/WorkspaceInsights.tsx:115`).
- `buildSignalSummary(...)` counts encrypted waiting signals and answer frequency (`src/features/admin/components/WorkspaceInsights.tsx:151`).
- `buildSignalClusters(...)` turns answer summaries into clusters (`src/features/admin/components/WorkspaceInsights.tsx:265`).
- Several analytics signals treat `status !== "archived"` and `triageStatus !== "fixed"/"closed"` as "needs attention" (`src/features/admin/components/WorkspaceInsights.tsx:479`, `src/features/admin/components/WorkspaceInsights.tsx:929`, `src/features/admin/components/WorkspaceInsights.tsx:1134`).
- Insights JSON export exists as `exportInsightsSnapshotJson(...)` (`src/features/admin/components/WorkspaceInsights.tsx:759`).

Design implication: Auto Process cannot simply hide records from `SignalRecord[]`; otherwise Insights loses its source data. The code needs a separate review queue filter while keeping aggregate records in the signal index.

## Where Review Is Assumed Today

### Types

- `Submission` requires review-oriented fields: `status`, `priority`, `triageStatus`, `tags`, and `notes` (`src/types.ts:327`).
- `SubmissionDeliveryStatus` uses inbox-specific states (`src/types.ts:60`).
- There is no explicit distinction between a stored signal, a review queue item, and an insight aggregate source.

### Public submission services

- `usePublicSubmission` initializes every submission as unread/new review work (`src/features/public-form/hooks/usePublicSubmission.ts:1330`).
- The submit pipeline shows inbox sync as part of success (`src/features/public-form/hooks/usePublicSubmission.ts:1416`).
- Pending sync queue naming and delivery statuses assume owner inbox delivery (`src/storage/submissionDelivery.ts:105`).

### Inbox hooks

- `needs_review` means non-archived, not "actually requires review" (`src/features/admin/hooks/useSignalInboxData.ts:592`).
- Counts use `needsReview` for all non-archived records (`src/features/admin/hooks/useSignalInboxData.ts:1327`).
- Stream IDs are inbox/review-oriented and do not model aggregate-only signals (`src/features/admin/hooks/useSignalInboxData.ts:56`).

### Admin UI

- The primary admin experience is the Encrypted Signal Inbox. Review detail, review session, triage status, notes, roadmap status, and export are all centered around `Submission`.
- Existing tabs can support mode-specific routing later, but the default dashboard language currently treats responses as signals awaiting review.

### Insights UI

- Insights reads directly from inbox signal records. This is good for reuse but makes filtering delicate.
- Encrypted/private responses are blocked from raw answer summarization unless unlocked, while aggregate-safe fields do not have their own projection model yet.

### Export logic

- CSV and JSON exports include review state columns (`status`, `triageStatus`, `priority`, `tags`, `notes`) (`src/lib/exportResponses.ts:214`, `src/lib/export.ts:153`).
- CSV export audit is tied to admin/export workflow, not a mode-specific analytics export (`src/lib/exportResponses.ts:20`).
- Encrypted answers export as `[encrypted]` unless review UI has passed unlocked overrides.

## Recommended Data Model

### Form-level mode

Add a form-level mode as the source of truth:

```ts
export type SignalProcessingMode =
  | "review_required"
  | "auto_process"
  | "hybrid";

interface FormSchema {
  processingMode?: SignalProcessingMode;
}
```

Default for missing `processingMode` should be `review_required` to preserve all existing forms and cached submissions.

Why `FormSchema`:

- Mode is authored per form.
- Existing template automation already writes form-level behavior such as `visibility`, `identityPolicy`, `locationRequirement`, and `encryptSubmissions`.
- Admin, public submission, and export can all resolve behavior from the form.

### Manifest duplication

Optionally add safe manifest metadata:

```ts
interface SignalManifest {
  processingMode?: SignalProcessingMode;
}
```

This is useful for recovery routing and diagnostics before the full bundled form is loaded. It should mirror the form value and default to `review_required` when absent. Do not put field answers, sensitive split decisions, or reviewer notes into the manifest.

### Submission-level states

Keep existing fields for backward compatibility, but add mode-aware fields that separate review, visibility, and insight handling:

```ts
export type SignalReviewState =
  | "queued"
  | "in_review"
  | "reviewed"
  | "not_required"
  | "suppressed";

export type SignalVisibilityState =
  | "private"
  | "aggregate_only"
  | "reviewed_public"
  | "public";

export type SignalInsightEligibility =
  | "eligible"
  | "metadata_only"
  | "requires_review"
  | "excluded";

interface Submission {
  processingMode?: SignalProcessingMode;
  reviewState?: SignalReviewState;
  visibilityState?: SignalVisibilityState;
  insightEligibility?: SignalInsightEligibility;
  insightPayload?: {
    answers?: Record<string, unknown>;
    fieldIds?: string[];
    redactedFieldIds?: string[];
    generatedAt: string;
  };
}
```

Recommended defaults:

- Missing `processingMode`: inherit from form, then default to `review_required`.
- Missing `reviewState`: derive from legacy `status`/`triageStatus`; existing submissions should behave as `queued` unless archived/reviewed.
- Missing `visibilityState`: `private` for review-required/encrypted records, `aggregate_only` for auto-process records.
- Missing `insightEligibility`: `requires_review` for encrypted or sensitive records, `eligible` for non-sensitive structured responses, `metadata_only` where only timestamps/category/status are safe.

### Field-level Hybrid support

Hybrid needs field-level policy. Prefer extending `FormField` instead of scattering field-type conditionals:

```ts
export type FieldProcessingPolicy =
  | "aggregate"
  | "review"
  | "aggregate_and_review"
  | "exclude";

interface FormField {
  processingPolicy?: FieldProcessingPolicy;
}
```

Default policy can be inferred:

- `sensitive: true` -> `review`
- attachments (`screenshot`, `video`, `voice`) -> `review`
- long text / markdown -> `review` in Hybrid unless explicitly aggregate-safe
- rating, dropdown, checkbox, matrix, date, confirmation -> `aggregate`
- wallet address, location, contact-like fields -> `review` or `metadata_only`

This lets Hybrid create an `insightPayload` from structured fields while queueing only the risky portion.

## UI Change Proposal

No UI changes are part of this task, but the design should leave a clear path.

### Create Signal

Recommended path:

- Add a processing mode choice early in Create Signal, either in the first intent step or directly above template selection.
- Use plain product language:
  - `Review Required`: every signal is inspected before action/publication.
  - `Auto Process`: responses feed aggregate insights immediately.
  - `Hybrid`: structured answers feed insights, risky content goes to review.
- Keep advanced details out of the responder-facing public form.

### Templates

Templates should set sensible defaults:

- `encrypted-report`, `bug`, `beta`, `anonymous-drop`, `disaster-checkin`: `review_required`
- `survey`, simple ratings, NPS-like templates, event attendance, ranking/poll templates: `auto_process`
- `feature`, `feedback`, `playtest`, event survey, community feedback: `hybrid`

Implementation-wise this fits the existing `TemplateAutomationPreset` pattern in `src/lib/formTemplates.ts`.

### Admin Dashboard

Recommended mode-aware display:

- Review Required: default to Review queue.
- Auto Process: default to Insights or show a compact "Aggregate stream" with a link to Insights.
- Hybrid: show both "Insight-ready responses" and "Review queue" counts.

The admin data hook should expose both:

- `allSignals`: stored/recovered signal records for search, counts, exports, and insights.
- `reviewQueueSignals`: records where `reviewState` is `queued` or `in_review`.
- `insightSignals`: records where `insightEligibility` is `eligible` or `metadata_only`.

### Insights

Insights should accept an explicit aggregate projection:

- Use `insightPayload` first when available.
- Fall back to existing `submission.answers` behavior for legacy non-encrypted records.
- Continue to avoid raw encrypted/private answers unless the operator unlocks them.

## Implementation Roadmap

### Phase 1: Types and design only

Goal: establish defaults without behavior change.

- Add `SignalProcessingMode` type.
- Add optional `processingMode` to `FormSchema`.
- Add optional `processingMode` to `SignalManifest` if recovery routing needs it.
- Add optional `reviewState`, `visibilityState`, and `insightEligibility` to `Submission`.
- Add normalizers that default missing values to current behavior.
- Keep all existing forms behaving as Review Required.

### Phase 2: Create Signal stores mode

Goal: author and persist mode while preserving current runtime behavior.

- Add mode to builder draft state and published form schema.
- Extend template automation defaults.
- Show mode in the Create Signal flow. The current implementation exposes it in the Basic info step so operators can override the template default before fields and publish.
- Do not yet remove responses from inbox; first release should be metadata-only.

### Phase 3: Auto Process aggregate path

Goal: make auto-process forms useful without requiring review.

- Add mode-aware selectors in `useSignalInboxData`.
- Keep `allSignals` intact, but exclude `reviewState: "not_required"` from `needs_review`.
- Route Auto Process form cards toward Insights.
- Add aggregate-safe export/snapshot path that does not imply review notes or triage. The current CSV export supports an `aggregate` processing scope and defaults Auto Process forms to aggregate-safe columns.

### Phase 4: Hybrid review/insights split

Goal: process structured fields immediately while sending risky content to review.

- Add `processingPolicy` to fields or a separate form-level field policy map. The current implementation adds optional field-level `processingPolicy: "auto" | "aggregate" | "review"` metadata. `auto` preserves existing type-based inference, `aggregate` can opt a non-sensitive field into immediate Insights, and `review` keeps a field in the review path. `sensitive: true` still wins and remains review-only.
- Expose field policy in the field editor when operators need to override the default split. The current implementation adds this to Advanced field settings without changing the public responder flow.
- Seed template fields with policy defaults. The current implementation gives Hybrid and Auto Process templates explicit aggregate/review field policies while leaving Review Required templates mostly `auto`; sensitive template fields are still forced to `review`.
- Build `insightPayload` at submission time from aggregate-safe fields. The current implementation creates this projection for Auto Process and Hybrid non-encrypted submissions.
- Queue review only when review-policy fields contain data or risk rules fire. Current behavior still queues Hybrid submissions, preserving the existing review surface.
- Update Insights to consume `insightPayload`. The current implementation makes survey summaries and workspace insight summaries prefer `insightPayload.answers` when available.
- Update Review UI to explain which part of a Hybrid submission requires review. The current implementation shows a Hybrid review split panel in the review session when `insightPayload.fieldIds` and `insightPayload.redactedFieldIds` are available.
- Show processing state in admin metadata/proof surfaces. The current implementation adds processing mode, review state, visibility state, insight eligibility, and insight payload counts to the secondary inspector.

## Risks and Notes

- Do not break local fallback. Local storage must continue to save full submissions and allow later sync/recovery.
- Do not weaken encryption. Auto Process should not expose sensitive encrypted answers just because review is not required.
- Do not remove Auto Process records from `SignalRecord[]`; Insights currently depends on those records.
- Avoid overloading `status` and `triageStatus` further. They are legacy/review workflow state, not enough to describe processing mode.
- Manifest must remain a recovery index. If mode is copied there, keep it as safe routing metadata only.
- Export needs separate semantics for review exports versus aggregate exports. Existing CSV columns can remain for backward compatibility, but Auto Process exports should not pretend every response had triage.
- On-chain/project registry state currently maps project signals into review-like `Submission` states. Mode-aware on-chain metadata may need a later protocol update; until then, default recovered on-chain signals to Review Required.
- Public routes must remain wallet-optional. Processing mode must not introduce responder wallet requirements.
- Old cached forms and submissions should normalize to Review Required and existing inbox behavior.

## Validation

Initial research validation:

- `npm run check` failed under PowerShell because `npm.ps1` is blocked by the local execution policy.
- `npm.cmd run check` succeeded.

Implementation follow-up validation:

- `npm.cmd run typecheck` succeeded.
- `npm.cmd run test -- src/features/createForm/utils.test.ts src/features/createForm/hooks/useCreateFormPublish.test.tsx src/features/createForm/signalIntelligence.test.ts` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded.

Auto Process review-queue follow-up validation:

- `npm.cmd run test -- src/features/admin/hooks/useSignalInboxData.test.ts src/features/createForm/utils.test.ts src/features/createForm/hooks/useCreateFormPublish.test.tsx src/features/createForm/signalIntelligence.test.ts` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded.

Hybrid insight-payload follow-up validation:

- `npm.cmd run test -- src/lib/signalProcessing.test.ts src/lib/storage.encryption.test.ts src/features/admin/hooks/useSignalInboxData.test.ts` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded.

Create Signal mode-selector follow-up validation:

- `npm.cmd run test -- src/features/createForm/hooks/useCreateFormBuilder.test.tsx src/features/createForm/utils.test.ts src/features/createForm/hooks/useCreateFormPublish.test.tsx src/lib/signalProcessing.test.ts` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded.

Aggregate CSV export follow-up validation:

- `npm.cmd run test -- src/lib/exportResponses.test.ts` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run test -- src/lib/exportResponses.test.ts src/lib/signalProcessing.test.ts src/features/createForm/hooks/useCreateFormBuilder.test.tsx` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded.

Hybrid review split UI follow-up validation:

- `npm.cmd run test -- src/lib/signalProcessing.test.ts src/lib/exportResponses.test.ts src/features/admin/hooks/useSignalInboxData.test.ts` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded with the existing large chunk warning for `mysten-sui`.

Field processing policy follow-up validation:

- `npm.cmd run test -- src/lib/signalProcessing.test.ts src/features/createForm/utils.test.ts` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded with the existing large chunk warning for `mysten-sui`.

Field processing policy UI follow-up validation:

- `npm.cmd run test -- src/lib/signalProcessing.test.ts src/features/createForm/utils.test.ts src/features/createForm/hooks/useCreateFormBuilder.test.tsx` succeeded.
- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded with the existing large chunk warning for `mysten-sui`.

Template field policy follow-up validation:

- `npm.cmd run test -- src/lib/formTemplates.test.ts src/lib/signalProcessing.test.ts src/features/createForm/utils.test.ts` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded with the existing large chunk warning for `mysten-sui`.

Admin processing metadata follow-up validation:

- `npm.cmd run typecheck` succeeded.
- `npm.cmd run check` succeeded.
- `npm.cmd run build` succeeded with the existing large chunk warning for `mysten-sui`.
