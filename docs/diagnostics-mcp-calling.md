# DeepSignal Diagnostics MCP Calling Guide

This document describes how future MCP tools should call DeepSignal diagnostics.

MCP is not implemented yet. The current safety boundary is the Diagnostics Service in `src/diagnostics`.

`src/diagnostics/*` is browser app-side code only. It may read app storage through DeepSignal adapters when running inside the application, but local MCP servers must never import these modules directly.

## Data Flow

```txt
System Signals
  -> Diagnostics Service
  -> DiagnosticsExportEnvelope / SystemDiagnostic
  -> Future MCP tools
  -> Codex or another AI agent
```

Future MCP code must never read raw `Submission` records, browser `localStorage`, decrypted payloads, or Walrus blobs directly.

Local MCP v1 consumes only exported `DiagnosticsExportEnvelope` JSON files created by the app. Hosted MCP may later call an authenticated admin API endpoint, but it must not read localStorage, Walrus blobs, or raw `Submission` records directly.

## App-Side Service Calls

Use these service functions from `src/diagnostics` from browser app-side code only.

```ts
import { listDiagnostics, getDiagnostic, searchDiagnostics } from "../src/diagnostics/diagnosticsService";
import { exportDiagnosticsJson } from "../src/diagnostics/diagnosticsExport";
import { summarizeDiagnostics } from "../src/diagnostics/diagnosticsSummary";
```

### List Diagnostics

```ts
const result = await listDiagnostics({
  limit: 25,
  severity: "error",
  routeId: "admin",
  buildVersion: "0.12.20",
});
```

Returns:

```ts
{
  diagnostics: SystemDiagnostic[];
  total: number;
  totalMatching: number;
  limit: number;
  maxLimit: number;
  truncated: boolean;
}
```

### Get One Diagnostic

```ts
const diagnostic = await getDiagnostic("system-fingerprint-id");
```

Returns:

```ts
SystemDiagnostic | null
```

`getDiagnostic` omits stack traces by default. Explicit browser app-side callers may request a sanitized, capped stack trace for investigation:

```ts
const diagnostic = await getDiagnostic("system-fingerprint-id", {
  includeStackTraces: true,
});
```

Stack traces are the largest diagnostics export attack surface and should stay disabled for exports unless an admin explicitly opts in.

### Search Diagnostics

```ts
const result = await searchDiagnostics({
  query: "ChunkLoadError",
  route: "/explore",
  errorName: "ChunkLoadError",
  severity: "critical",
  fingerprint: "abc123",
  since: "2026-06-01T00:00:00.000Z",
  until: "2026-06-02T23:59:59.999Z",
  limit: 50,
});
```

Supported filters:

- `since`
- `until`
- `severity`
- `routeId`
- `route`
- `buildVersion`
- `errorName`
- `fingerprint`
- `query`
- `limit`
- `includeStackTraces`

### Export Diagnostics JSON

```ts
const envelope = await exportDiagnosticsJson({
  since: "2026-06-01T00:00:00.000Z",
  severity: "error",
  routeId: "admin",
  includeStackTraces: false,
});
```

Returns:

```ts
{
  version: 1,
  exportedAt: string,
  source: "deepsignal-diagnostics-service",
  filters: DiagnosticsSearchFilters,
  count: number,
  totalMatching: number,
  truncated: boolean,
  maxLimit: number,
  diagnostics: SystemDiagnostic[],
}
```

Stack traces are omitted by default.

### Generate Export Filename

```ts
import { createDiagnosticsExportFilename } from "../src/diagnostics/diagnosticsExport";

const filename = createDiagnosticsExportFilename();
```

Example:

```txt
deepsignal-system-diagnostics-2026-06-02T13-25-04-000Z.json
```

### Summarize Diagnostics

```ts
const summary = await summarizeDiagnostics({
  groupBy: "fingerprint",
  since: "2026-06-01T00:00:00.000Z",
});
```

Supported `groupBy` values:

- `fingerprint`
- `routeId`
- `errorName`
- `buildVersion`

Returns grouped counts, maximum severity, first/last seen timestamps, example diagnostic ids, and top affected routes.

## Future MCP Tool Calls

Future MCP tools should accept and return only `DiagnosticsExportEnvelope` or `SystemDiagnostic` data loaded from an exported JSON file or an authenticated hosted API response.

Recommended MCP tool mapping:

```txt
list_system_signals      -> listDiagnostics
get_system_signal        -> getDiagnostic
search_system_signals    -> searchDiagnostics
summarize_recent_errors  -> summarizeDiagnostics
export_diagnostics_json  -> exportDiagnosticsJson
```

Example future MCP call shapes:

```json
{
  "tool": "list_system_signals",
  "arguments": {
    "limit": 25,
    "severity": "critical",
    "routeId": "explore"
  }
}
```

```json
{
  "tool": "search_system_signals",
  "arguments": {
    "query": "ChunkLoadError",
    "buildVersion": "0.12.20",
    "includeStackTraces": false
  }
}
```

```json
{
  "tool": "summarize_recent_errors",
  "arguments": {
    "groupBy": "fingerprint",
    "since": "2026-06-01T00:00:00.000Z"
  }
}
```

## Safety Requirements

Future Admin copy/export actions must call the Diagnostics Service redaction/export path. Do not use raw System Signal clipboard helpers, raw `metadata.systemDiagnostics`, or raw `Submission` serialization for public/admin exports.

MCP must not expose:

- raw `Submission` objects
- form answers
- `publicPayload.answers`
- decrypted payloads
- `encryptedPayload`
- wallet signatures
- signed bytes
- session artifacts
- respondent metadata
- attachments
- raw metadata
- browser storage dumps
- full query strings
- URL hash fragments

Routes and URLs must be normalized:

```txt
/admin?token=abc#frag -> /admin
/f/form-id?email=x -> /f/form-id
https://example.test/app.js?token=abc#frag -> https://example.test/app.js
```

## Recommended V1 MCP Path

For the first MCP implementation:

```txt
Admin UI exports DiagnosticsExportEnvelope JSON
  -> local diagnostics JSON file
  -> dev-only local MCP server reads the exported JSON
  -> Codex calls MCP tools
```

This keeps MCP away from app storage internals and preserves the Diagnostics Service as the single normalization and redaction boundary.

Local MCP v1 must not:

- import `src/diagnostics/*`
- import `src/storage/*`
- read browser localStorage
- read Walrus blobs directly
- read raw `Submission` records

## Future Hosted Path

For hosted MCP:

```txt
Authenticated admin request
  -> hosted diagnostics endpoint
  -> Diagnostics Service
  -> redacted DiagnosticsExportEnvelope
  -> hosted MCP bridge
```

Hosted MCP must require admin authentication and should log diagnostics export access.

Hosted MCP may call only an authenticated diagnostics API endpoint that returns redacted diagnostics data. It must not bypass the Diagnostics Service boundary.
