# Signal Pattern Memory MemWal Boundary

Status: adapter boundary only. Real MemWal reads/writes are not enabled.

## Purpose

Signal Pattern Memory is a reviewed, redacted, operator-approved memory artifact. It is not a raw Signal, raw Submission, diagnostics export, decrypted payload, or canonical review record.

Future MemWal integration may store only `SignalPatternMemory` records after an admin reviews the generated draft. MemWal must not receive raw responder answers, attachments, encrypted payloads, wallet/session/signature data, raw metadata, or stack traces.

## Provider Flag

Signal Pattern Memory uses a separate provider flag:

```bash
VITE_SIGNAL_MEMORY_PROVIDER=none
```

Supported values:

- `none`: default no-op provider. It validates memory safety but does not persist.
- `memory`: runtime-only in-memory provider. It validates memory safety and keeps records only for the current app session.
- `memwal`: placeholder provider. It validates memory safety but still skips remote writes until the real adapter is implemented.

Existing MemWal runtime settings remain placeholders for a later phase. Setting `VITE_MEMWAL_ENABLED=true` alone must not enable Signal Pattern Memory persistence.

The `memory` provider exists only for testing the admin review UX. It stores reviewed `SignalPatternMemory` records in module memory for the current browser runtime and does not write to localStorage, IndexedDB, Walrus, MemWal, or any remote service. It must not be treated as canonical data.

## Adapter Contract

The Signal Pattern Memory adapter boundary is:

```ts
listMemories(namespace)
getMemory(namespace, memoryId)
saveMemory(namespace, memory)
searchMemories(namespace, query, options)
```

`saveMemory` accepts only `SignalPatternMemory`. It rejects objects containing raw-signal keys:

- `answers`
- `publicPayload`
- `encryptedPayload`
- `attachments`
- `metadata`
- `respondentMeta`
- `responderSignature`
- `responderSignedBytes`
- `errorStack`

## Source Of Truth

MemWal is advisory recall state only. DeepSignal storage, diagnostics services, manifests, review state, local fallback data, and Walrus/Seal storage behavior remain canonical.

Memory can help operators remember recurring patterns, failed fixes, confirmed fixes, and safe recommended actions. It must not become the source of truth for submissions, diagnostics, recovery, deletion, review audit history, or storage manifests.
