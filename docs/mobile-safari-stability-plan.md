# Mobile Safari Stability-First Refactor Plan

## Goal

Stop recurring mobile Safari regressions by freezing the core runtime path, isolating wallet-heavy UI from route rendering, and adding tests that enforce local-fallback behavior.

This plan is intentionally stability-first:

- Freeze the core runtime surfaces.
- Add guardrails around wallet imports and optional chrome.
- Expand regression coverage before feature work resumes in these areas.
- Add a deterministic smoke mode for Safari-like failures.
- Require future fixes to target the correct layer instead of patching symptoms.

## Frozen Core Runtime Files

These files form the app boot and route recovery spine. Treat them as frozen for feature fixes unless a bug cannot be solved anywhere else.

- [src/components/AppShell.tsx](/D:/game/deepsignal/src/components/AppShell.tsx)
- [src/PrivateAppProviders.tsx](/D:/game/deepsignal/src/PrivateAppProviders.tsx)
- [src/components/WalletSurface.tsx](/D:/game/deepsignal/src/components/WalletSurface.tsx)
- [src/appSurfaces/WorkspaceSurface.tsx](/D:/game/deepsignal/src/appSurfaces/WorkspaceSurface.tsx)
- [src/routes/AppRoutes.tsx](/D:/game/deepsignal/src/routes/AppRoutes.tsx)
- [src/routes/PublicAppRoutes.tsx](/D:/game/deepsignal/src/routes/PublicAppRoutes.tsx)
- [src/routes/ProviderReadinessBarrier.tsx](/D:/game/deepsignal/src/routes/ProviderReadinessBarrier.tsx)
- [src/walletProviderMountPolicy.ts](/D:/game/deepsignal/src/walletProviderMountPolicy.ts)
- [src/lib/dashboardProjectRestore.ts](/D:/game/deepsignal/src/lib/dashboardProjectRestore.ts)

### Freeze Rules

- No feature work lands in these files.
- No copy-only fallback changes land in these files without identifying the real thrown error.
- If a bug is outside boot/runtime ownership, fix it in the page, widget, storage adapter, or lazy-loaded module instead.
- Any change to a frozen file must document:
  - Why the bug could not be solved in a lower-risk layer.
  - Which guardrail or test was added to prevent recurrence.

## Current Runtime Boundaries

These are the boundaries the code already implies and that the refactor should make explicit.

### 1. Shell and chrome boundary

- `AppShell` owns layout, nav, header chrome, and optional wallet/header widgets.
- `AppShell` must not become responsible for route data recovery, project selection, or wallet correctness.

### 2. Provider boundary

- `PrivateAppProviders` and `WalletSurface` own wallet-provider import, mount, retry, and readiness state.
- Provider failure must degrade to a local-capable shell, not a route crash.

### 3. Route boundary

- `WorkspaceSurface`, `AppRoutes`, and `PublicAppRoutes` own route composition and route-level lazy loading.
- Public routes must stay wallet-optional and must not mount wallet UI by accident.

### 4. Restore boundary

- `dashboardProjectRestore` owns dashboard restore state from storage and wallet-runtime settlement.
- Project restoration must resolve from local storage even when wallet runtime is slow, missing, or disconnected.

### 5. Feature/widget boundary

- Header wallet widgets, network menus, wallet panels, and similar chrome must be optional leaf surfaces.
- Their failure must be contained inside the widget boundary, not escalate to `RouteErrorBoundary`.

## Guardrails To Add

### A. Wallet UI import failure must never crash a route

Target outcome:

- Header wallet widgets and wallet connect surfaces can fail independently.
- Route body, dashboard content, and public routes continue rendering.

Implementation direction:

- Keep wallet UI behind contained lazy boundaries with local fallback UI only.
- Treat wallet header/widgets as optional adornments, never route prerequisites.
- Distinguish provider import failure from widget import failure in diagnostics.

Preferred location:

- New helper utilities or wrapper components near wallet UI widgets.
- Avoid broad new logic in frozen route files unless the bug is truly a boot/runtime defect.

### B. Header widgets must be optional

Target outcome:

- Network menu, wallet runtime panel, and similar header widgets can disappear or fail without affecting page render.

Implementation direction:

- Normalize a shared `optional header widget` contract:
  - lazy import
  - contained error boundary
  - fallback placeholder
  - retry scoped to widget only

Preferred additions:

- A small wrapper component or helper for optional chrome widgets.
- Reuse for wallet and network header widgets.

### C. Dashboard must render local data without wallet

Target outcome:

- `/dashboard` can show local fallback content and empty-project state even if wallet is disconnected or wallet chunk fails.

Implementation direction:

- Decouple dashboard route body readiness from connected-wallet success.
- Keep wallet-aware controls progressive.
- Allow project restore to settle on local storage alone when no wallet is connected.

Specific constraint:

- `selectedProjectId === null` or empty selection must still allow local submissions/history surfaces to render.

### D. Public and Explore routes must not mount wallet UI

Target outcome:

- `/explore`, `/f/:formId`, `/roadmap/:formId`, and manifest restore flows do not pull in wallet-heavy admin chrome.

Implementation direction:

- Centralize a route capability map that answers:
  - should request wallet providers on mount?
  - should render wallet header widgets?
  - should mount admin-only wallet runtime?

Preferred additions:

- Add a small route policy module instead of duplicating pathname checks across multiple runtime files.
- Keep policy pure and heavily unit tested.

### E. Project restore must not wait for disconnected wallet

Target outcome:

- If the wallet is disconnected, restore transitions to local-ready instead of remaining blocked on provider state.

Implementation direction:

- Treat disconnected-with-no-account as a settled wallet state for dashboard restore.
- Keep timeout fallback as safety net, but do not require timeout for the common disconnected path.

Preferred changes:

- Tighten logic in restore helpers and their tests rather than widening boot barriers.

## Refactor Structure

### Phase 1. Codify runtime policy without changing behavior

Add small, pure policy modules and wrappers outside the frozen files first.

Suggested additions:

- `src/routes/routeRuntimePolicy.ts`
  - `shouldMountWalletProviders(routePath)`
  - `shouldShowWalletUi(routePath)`
  - `usesPublicChrome(routePath)`
  - `requiresWorkspaceBoot(routePath)`
- `src/components/optionalChrome/OptionalHeaderWidget.tsx`
  - shared optional lazy/widget containment
- `src/lib/mobileSafariSmoke.ts`
  - shared smoke-mode flags and helpers

Goal:

- Move path decisions and optional-widget rules out of large runtime files.
- Reduce future edits to the frozen spine.

### Phase 2. Normalize dashboard restore semantics

Focus area:

- [src/lib/dashboardProjectRestore.ts](/D:/game/deepsignal/src/lib/dashboardProjectRestore.ts)

Desired semantics:

- `disconnected` is settled.
- local storage settling is independent from wallet success.
- timeout fallback is backup behavior, not the normal disconnected path.
- empty project is a valid ready state, not an error-like state.

### Phase 3. Make header wallet and network widgets fully optional

Focus area:

- wallet runtime panel
- network menu
- header-only chrome widgets

Desired semantics:

- widget failure stays widget-local
- widget retry does not remount route body
- widget slow load does not block route ready

### Phase 4. Lock route isolation with tests

Before any new feature touches dashboard/explore/public form boot paths, the regression suite below should exist and pass.

## Regression Tests To Add

Add tests close to the layer they protect. Prefer unit/integration tests for policy and routing, and keep Playwright for a small smoke pass.

### 1. `/dashboard` renders when wallet connect chunk fails

Coverage:

- wallet UI chunk rejects
- route body still renders
- local fallback or dashboard shell still appears
- route error boundary does not take over

Likely test file:

- `src/components/AppShell.test.tsx` for header-widget containment
- `src/routes/AppRoutes.test.tsx` or a new `src/appSurfaces/WorkspaceSurface.test.tsx` for route survival

### 2. `/explore` renders without wallet provider

Coverage:

- no wallet provider mounted
- explore route renders content
- no wallet header runtime requested

Likely test file:

- new `src/routes/routeRuntimePolicy.test.ts`
- `src/routes/AppRoutes.test.tsx` or `src/AppRoot.test.tsx`

### 3. `/f/:formId` renders without wallet provider

Coverage:

- public form route under public providers only
- no wallet provider requirement
- responder flow remains functional in local/wallet-optional mode

Likely test file:

- [src/pages/PublicFormPage.test.tsx](/D:/game/deepsignal/src/pages/PublicFormPage.test.tsx)
- possibly a new public-route mount test around `PublicAppRoutes`

### 4. Local submissions render when `selectedProjectId` is null

Coverage:

- dashboard/local history state remains usable
- empty selection is treated as ready-without-project, not blocked boot

Likely test file:

- [src/lib/dashboardProjectRestore.test.ts](/D:/game/deepsignal/src/lib/dashboardProjectRestore.test.ts)
- [src/pages/AdminDashboardPage.test.tsx](/D:/game/deepsignal/src/pages/AdminDashboardPage.test.tsx) for local-data rendering

### 5. `RouteErrorBoundary` is not triggered by header wallet failure

Coverage:

- header wallet widget throws or lazy import rejects
- widget fallback appears
- route body still renders
- route boundary is not invoked

Likely test file:

- new `src/components/AppShell.header-failure.test.tsx`
- or extend [src/components/AppShell.test.tsx](/D:/game/deepsignal/src/components/AppShell.test.tsx)

## Mobile Safari Smoke Mode

Add a deterministic smoke mode for dev/test so regressions can be reproduced without waiting for real Safari failures.

### Purpose

Exercise the exact failure classes that keep recurring:

- dynamic import rejection
- very slow dynamic import
- disconnected provider state
- localStorage-only fallback path

### Suggested shape

Add a test/dev-only runtime flag reader:

- `window.__DEEPSIGNAL_SMOKE__`
- or Vite env flags for tests

Suggested flags:

- `rejectWalletUiImport: boolean`
- `rejectWalletProviderImport: boolean`
- `slowWalletProviderImportMs: number`
- `slowWalletUiImportMs: number`
- `forceProviderDisconnected: boolean`
- `forceLocalStorageOnly: boolean`

### Injection points

Keep smoke hooks close to the layer they simulate.

- Wallet UI import rejection:
  - hook into lazy wallet widget import helper
- Wallet provider import rejection/slow load:
  - hook into `WalletSurface` provider import path
- Provider disconnected:
  - hook into wallet session test adapter or mocked session state
- localStorage-only:
  - hook into storage adapter factory or runtime status helper

### Rules

- Smoke mode must be opt-in only.
- Smoke mode must not ship as default behavior.
- Smoke mode must not add new boot coupling.
- Smoke failures should produce the same diagnostics labels used in production paths.

## Future Fix Workflow

For any future Safari regression, do not patch the visible symptom first.

Classify the failure into exactly one primary layer:

### A. Route

Examples:

- route lazy import failure
- route export mismatch
- route-only error boundary takeover

Fix in:

- route lazy import helper
- route component export
- route policy or route-specific boundary

### B. Provider

Examples:

- wallet provider chunk never settles
- provider context missing
- provider mount timing blocks ready state

Fix in:

- wallet provider loader
- provider readiness state
- provider-specific fallback logic

### C. Wallet UI

Examples:

- header wallet panel import fails
- wallet connect widget throws
- wallet-only chrome breaks while route data is otherwise healthy

Fix in:

- wallet widget
- optional widget wrapper
- widget-local lazy boundary

### D. Storage

Examples:

- Walrus/local adapter read failure
- restore fails because storage lookup breaks
- storage mode detection blocks UI incorrectly

Fix in:

- storage adapter
- restore helper
- storage factory

### E. Local fallback

Examples:

- local submissions not shown
- empty project state blocks usable data
- offline/demo mode regresses

Fix in:

- local storage helpers
- dashboard restore semantics
- local-mode rendering paths

### Required bug-fix checklist

Every future fix in this area should answer:

1. Which layer failed first?
2. Which frozen runtime file observed the failure?
3. Can the fix live outside the frozen spine?
4. Which regression test was added?
5. Which smoke-mode scenario reproduces it now?

## Recommended Execution Order

1. Add route/runtime policy tests and a small pure route policy module.
2. Add dashboard restore tests for disconnected and null-project local states.
3. Add header wallet failure containment tests.
4. Add smoke-mode hooks for import rejection and slow import.
5. Only then make the smallest production code changes needed to satisfy the tests.

## Validation

Minimum validation for any change in this plan area:

- `npm run typecheck`
- targeted Vitest files for route/provider/wallet/public form behavior
- `npm run build` for any route/runtime change

When route/runtime behavior changes:

- verify `/dashboard`
- verify `/explore`
- verify `/f/:formId`
- verify local fallback behavior with wallet disconnected
- verify wallet/header failure does not trip route `ErrorBoundary`

## Success Criteria

This plan is complete when all of the following are true:

- Wallet header/widget failures are contained to widget fallbacks.
- `/dashboard` remains usable with local fallback data and no wallet.
- `/explore` and public form routes do not mount wallet-heavy UI.
- Disconnected wallet no longer blocks project restore.
- Smoke mode can reproduce import rejection, slow import, disconnected provider, and local-only data paths.
- Regression tests fail immediately if Safari-style boot coupling returns.
