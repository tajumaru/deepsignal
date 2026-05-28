# DeepSignal i18n Split Plan

`src/i18n.tsx` currently owns provider state, translation helpers, and the full message dictionary. The safe split is to keep the runtime API stable while moving dictionary data behind typed modules.

## Goals

- Preserve `useI18n().t(key, params)` and all existing keys.
- Keep `Language = "en" | "ja"` in the public i18n API.
- Split messages by domain before splitting by implementation surface.
- Avoid dynamic language loading until route-level behavior is verified on mobile Safari.

## Proposed Shape

```ts
// src/i18n/messages/types.ts
export type MessageDomain = Record<string, string | ((params?: Record<string, string | number>) => string)>;

// src/i18n/messages/admin.ts
export const adminMessages = {
  en: { ... },
  ja: { ... },
} satisfies Record<Language, MessageDomain>;

// src/i18n/messages/index.ts
export const messages = mergeMessageDomains(commonMessages, adminMessages, publicFormMessages);
```

## Domain Order

1. `common`: nav, shared buttons, status labels, generic errors.
2. `publicForm`: responder form, submission success, recovery.
3. `admin`: inbox, review workspace, export, onchain registration.
4. `createForm`: composer, templates, publish readiness.
5. `landing`: public marketing/explore copy.

## Compatibility Rules

- `messages.en` remains the source of `TranslationKey`.
- Each domain must define the same keys for `en` and `ja`.
- Merge should throw in development if a domain overwrites an existing key.
- Do not rename keys during the split.
- Do not lazy-load messages until route chunks and cold-load recovery are separately verified.

## Pilot Candidate

Start with a tiny `common` domain containing only stable global labels such as `closeLabel`, `backToHome`, `languageLabel`, and status labels. This proves the merge and typing path without touching admin review copy.
