# System Diagnostics Summary

## Where to see it

Open the Admin Inbox, then select the `System Alerts` stream.

The panel appears in the signal list column near the top of the stream, after the inbox activity/timeline overview and before the visible system alert cards.

It is headed:

```text
System Diagnostics Summary
```

## When it appears

The panel appears only when the current stream is:

```text
System Alerts
```

It does not appear in normal responder/user signal streams such as `All Signal Nodes`, unread, high priority, encrypted, anonymous, or project response streams.

## What it shows

The panel summarizes currently visible System Alert diagnostics using the existing Diagnostics Service:

- total diagnostics count
- top grouped errors
- max severity per group
- first seen and last seen timestamps
- example diagnostic IDs
- top routes

The grouping selector supports:

- `fingerprint`
- `errorName`
- `routeId`
- `buildVersion`

The default grouping is:

```text
fingerprint
```

## Data source

The panel uses:

```ts
source: {
  kind: "adminInboxLoadedRecords",
  records: visibleSystemRecords,
}
```

That means it summarizes the currently loaded and visible system records in Admin Inbox. It does not read directly from `localStorage`.

## Safety

The panel uses `summarizeDiagnostics()`, which calls the diagnostics service with stack traces disabled.

The panel displays only redacted diagnostic summary fields. It does not render:

- raw submission answers
- attachments
- encrypted payloads
- respondent metadata
- signatures
- session IDs
- raw stack traces

## Implementation files

- `src/pages/AdminDashboardPage.tsx`
- `src/styles/pages/admin-inbox.css`
- `src/pages/AdminDashboardPage.test.tsx`

## Validation

The implementation was validated with:

```bash
npm.cmd run typecheck
npm.cmd test -- src/pages/AdminDashboardPage.test.tsx src/diagnostics/diagnosticsService.test.ts
```
