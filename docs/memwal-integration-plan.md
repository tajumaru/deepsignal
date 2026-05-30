# MemWal Integration Plan

Status: investigation only. Do not install packages, ship UI, or make production MemWal calls yet.

## Target Use Case

AI Review Assistant remembers previous triage notes and similar submissions, stored as encrypted memories on Walrus through MemWal. The recall surface should help admins understand why a signal matters, what similar signals were decided before, and what follow-up actions were useful.

## MemWal Runtime Pieces

MemWal is currently beta software, with APIs and operational guidance still evolving. Treat the first DeepSignal integration as optional and feature-flagged until the SDK, relayer, and trust model are stable enough for production review workflows.

Required client package for the default SDK path:

```bash
npm install @mysten-incubation/memwal
```

Default SDK configuration needs:

- `key`: Ed25519 delegate private key in hex.
- `accountId`: MemWalAccount object ID on Sui.
- `serverUrl`: relayer URL. Hosted endpoints currently include `https://relayer.memwal.ai` for mainnet and `https://relayer.staging.memwal.ai` for testnet.
- `namespace`: memory boundary. Defaults to `default`, but DeepSignal should always set an explicit project namespace.

Optional runtime paths:

- `@mysten-incubation/memwal`: default client. Relayer handles embedding, Seal encryption/decryption, Walrus upload/download, vector indexing, recall, and restore.
- `@mysten-incubation/memwal/manual`: manual client. Requires `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus`; moves embeddings and Seal operations closer to the client, while the relayer still handles registration, search, upload relay, and restore.
- `@mysten-incubation/memwal/ai`: Vercel AI SDK middleware. Not a near-term fit unless DeepSignal adopts that AI SDK path.

Relayer requirements:

- A hosted or self-hosted relayer is mandatory for both default and manual flows.
- The default relayer path sees plaintext memory content and decrypted recall results because it performs embedding and encryption/decryption.
- Self-hosting needs PostgreSQL with `pgvector`, Redis for rate limiting/replay protection, a Rust relayer, a TypeScript sidecar for Seal/Walrus work, MemWal package and registry IDs, and one or more funded Sui server keys for Walrus storage costs.
- The relayer uses an OpenAI-compatible embedding API; without a real embedding key, local self-hosting falls back to deterministic mock embeddings that are not production quality.
- Current hosted relayers are beta services with no SLA. Usage limits and storage quotas apply.

Beta limitations to track:

- APIs, relayer compatibility, and operational guidance may change.
- Managed relayer trust is too broad for sensitive DeepSignal production memory unless the memory payload is already safe for that operator or the relayer is self-hosted/TEE-backed.
- The relayer is tied to a single MemWal package ID at a time; separate contracts require separate relayer/database deployments.
- Memory restore rebuilds vector indexes from Walrus-backed records, but it is not a replacement for DeepSignal's canonical submission manifests or local fallback caches.

## DeepSignal Design

### Namespaces

Use project-level namespaces as the default isolation boundary:

```text
deepsignal:project:{projectId}:review-memory:v1
```

Fallbacks:

- For legacy forms without `projectId`, use `deepsignal:form:{formId}:review-memory:v1`.
- Avoid a global workspace namespace for private triage memory. Cross-project recall should be a later explicit admin action, not the default.
- Include a version suffix so future schemas can migrate without mixing old and new memory records.

This maps to MemWal's `owner + namespace + app_id` memory-space model. The owner should be the project owner or a dedicated workspace service account, not an anonymous responder.

### Memory Records

Start with admin-generated review facts, not raw public submissions:

- Triage note memory: reviewer notes, final status, priority, signal value, tags, reviewer identity label, and timestamp.
- Decision memory: selected public roadmap decision, follow-up requirement, duplicate/related-signal assessment, and why the decision was made.
- Similar-submission memory: compact evidence derived from decrypted answers, `aiSummary`, `keywords`, `clusterId`, and related-signal links.

Recommended record shape before calling `remember`:

```json
{
  "kind": "deepsignal.review_memory.v1",
  "projectId": "0x...",
  "formId": "form_...",
  "submissionId": "sub_...",
  "onchainSignalId": 12,
  "receiptBlobId": "...",
  "triageStatus": "investigating",
  "priority": "high",
  "tags": ["follow-up", "mobile-safari"],
  "summary": "Reviewer found repeated mobile Safari failures after attachment upload.",
  "evidence": [
    "Similar signals mention retries after upload.",
    "Operator marked follow-up required."
  ],
  "reviewedAt": "2026-05-30T00:00:00.000Z"
}
```

Keep private answer bodies out of memory by default. If the AI Review Assistant needs evidence from decrypted answers, write a compact, reviewer-approved fact after unlock rather than the full submission payload.

### Redaction Before Writes

Every memory write needs an explicit redaction step before calling MemWal:

- Do not store raw answer bodies by default.
- Do not store attachment URLs, Walrus blob IDs, encrypted blob IDs, or attachment names unless an admin explicitly approves that evidence for memory.
- Remove emails, wallet addresses, OAuth/zkLogin identifiers, and similar direct identifiers unless they are required for the operational memory being saved.
- Store compact, reviewer-approved facts only: decision, urgency, pattern, reviewer note summary, and safe evidence fragments.

The redacted memory payload should be treated as a new derived artifact, not as a copy of the submission. If a reviewer needs a memory to reference sensitive evidence, the memory should say that sensitive evidence existed and point back to the authorized DeepSignal review flow instead of embedding the sensitive value.

### Recall Flow

Recall should be admin-only in the Encrypted Signal Inbox:

1. Admin/reviewer opens or starts a review session for a selected signal.
2. DeepSignal verifies normal review access first: owner, admin, reviewer, or existing form access state.
3. For encrypted signals, recall waits until the signal is unlockable or a safe metadata-only query can be built.
4. A future `memoryAdapter.recallForSignal(record)` builds a query from subject preview, `aiSummary`, keywords, tags, category, visible reviewer notes, and selected decrypted evidence.
5. The AI Review Assistant receives memory snippets as evidence, not instructions. It should cite the matching memory summary, signal IDs, and distance/relevance metadata.

Public routes must never import or initialize MemWal. `/f/:formId`, public roadmap pages, and manifest recovery remain wallet-optional and memory-free.

### Write Flow

Memory writes should happen only after an admin saves review work:

1. `useReviewWorkspace` builds the next `Submission` from the review draft.
2. The existing storage adapter persists the submission and preserves local/Walrus fallback semantics.
3. A future optional admin-only memory adapter receives the saved submission plus form/project context.
4. If MemWal is disabled, unconfigured, rate-limited, or unavailable, review save still succeeds and the UI reports memory sync as skipped or pending.

Do not block triage on memory writes. MemWal should be an intelligence enhancement, not a new dependency for operational review.

## Proposed Code Boundaries For Later

No code should be added in this investigation, but a later implementation should keep this shape:

- `src/memory/`: new optional memory adapter layer, similar in spirit to `src/storage` and `src/crypto`.
- `src/memory/memwalAdapter.ts`: lazy import of `@mysten-incubation/memwal`, config validation, health check, `rememberReviewMemory`, and `recallReviewMemory`.
- `src/memory/localMemoryAdapter.ts`: no-op/local development adapter if needed for tests.
- `src/features/admin/hooks/useSignalMemoryRecall.ts`: admin-only hook called from Inbox/review surfaces.
- No imports from public route entry points or public form components.

Bundle safety requirements:

- Public routes must not import MemWal directly or through shared modules.
- Future CI/build checks should verify public form chunks do not contain `@mysten-incubation/memwal`.
- The existing public chunk guard should stay aligned with this rule, the same way it protects public routes from admin, wallet, TipTap, Sui, Walrus, and Seal runtime chunks.

Suggested environment names for a future feature flag:

```bash
VITE_MEMWAL_ENABLED=false
VITE_MEMWAL_SERVER_URL=https://relayer.staging.memwal.ai
VITE_MEMWAL_ACCOUNT_ID=
VITE_MEMWAL_DELEGATE_KEY=
VITE_MEMWAL_NAMESPACE_PREFIX=deepsignal
```

Before using these in production, avoid exposing long-lived delegate keys in a public browser bundle. Prefer a backend-for-frontend, self-hosted relayer policy, short-lived delegated credentials, or wallet-derived account management once the threat model is settled.

## Walrus/Seal Overlap And Conflict

MemWal complements but does not replace DeepSignal's current storage and crypto model.

Existing DeepSignal responsibilities:

- `src/storage` owns forms, submissions, attachments, manifests, blob indexes, storage mode selection, Walrus upload/read behavior, Tatum storage integration, and local fallback.
- `src/crypto` owns Seal encryption/decryption, payload envelopes, diagnostics, and fail-closed behavior for protected submissions.
- Manifests remain recovery indexes and must not gain sensitive memory payloads.

MemWal responsibilities:

- Stores compact AI memory records as encrypted Walrus blobs.
- Maintains semantic vectors and recall through the relayer.
- Provides namespace-scoped restore for memory indexes.

Potential conflicts:

- Duplicate encryption stack: default MemWal uses Seal through its relayer, while DeepSignal already encrypts submissions locally. Do not double-store raw sensitive payloads in memory.
- Trust boundary mismatch: DeepSignal's protected submissions should fail closed and be decrypted only by authorized wallets. Managed MemWal relayer plaintext handling may be unacceptable for the same content.
- Dependency creep: `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus` already exist in DeepSignal, but MemWal must not make public routes load wallet, Sui, Walrus, Seal, TipTap, or admin chunks.
- Recovery confusion: MemWal `restore(namespace)` repairs memory vector state; DeepSignal manifests repair form/submission graph state. Keep these operator concepts separate.
- Cost and quota: MemWal relayers cover or manage Walrus writes differently from DeepSignal's wallet/publisher/Tatum paths. Memory sync must be observable and optional.

## Deletion And Revoke Model

MemWal memories should be advisory recall state, not canonical DeepSignal data. Canonical deletion, archive, revoke, and recovery behavior remains on the DeepSignal storage/manifest side.

Each memory record should include lifecycle metadata:

- `sourceSubmissionId`: the DeepSignal submission that produced the memory.
- `reviewId`: the review or review-save event that produced the memory.
- `createdAt`: when the memory was written.
- `supersededAt`: set when a later review memory replaces this one.
- `revokedAt`: set when an operator revokes or invalidates this memory.

Recall must filter out revoked and superseded memories before returning evidence to the AI Review Assistant. If MemWal search returns old matches, DeepSignal should treat lifecycle metadata as an application-level allowlist filter before showing or using the memory.

A future delete/revoke operation should not imply that MemWal is the source of truth. It should mark memory state as revoked or superseded for recall, then rely on existing DeepSignal storage, manifest, Walrus, and local fallback deletion semantics for canonical data handling.

## Recommended First Phase

1. Keep this docs-only plan as the current output.
2. Prototype in a branch with a no-op memory adapter and tests proving public route bundles do not import MemWal.
3. Add configuration validation and a disabled-by-default admin-only health check.
4. Decide trust model before saving any real review memory:
   - self-hosted relayer for DeepSignal workspace memory;
   - manual client flow for stronger privacy;
   - or managed relayer only for non-sensitive demo data.
5. Add memory writes only after successful review save, with failure treated as non-blocking.
6. Add recall only inside the admin Inbox AI Review Assistant, never in public form flows.

## Sources

- MemWal quick start: https://docs.memwal.ai/getting-started/quick-start
- MemWal memory spaces: https://docs.memwal.ai/fundamentals/concepts/memory-space
- MemWal trust and security model: https://docs.memwal.ai/fundamentals/architecture/data-flow-security-model
- MemWal relayer overview: https://docs.memwal.ai/relayer/overview
- MemWal self-hosting: https://docs.memwal.ai/relayer/self-hosting
- MemWal SDK API reference: https://docs.memwal.ai/sdk/api-reference
- MystenLabs/MemWal repository: https://github.com/MystenLabs/MemWal
