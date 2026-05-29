const CREATE_FORM_DRAFT_STORAGE_KEY = "deepsignal:create-form-draft:v1";
const CREATE_FORM_GUEST_DRAFT_STORAGE_KEY = "deepsignal:create-form-guest-draft:v1";

export type CreateDraftParseStatus = "missing" | "valid" | "invalid" | "unavailable";

function isValidStoredCreateFormDraft(rawDraft: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDraft);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  const draft = parsed as { fields?: unknown };
  return Array.isArray(draft.fields) && draft.fields.length > 0;
}

export function readCreateDraftParseStatus(): CreateDraftParseStatus {
  if (typeof window === "undefined") {
    return "unavailable";
  }

  try {
    const adminDraft = window.localStorage.getItem(CREATE_FORM_DRAFT_STORAGE_KEY);
    const guestDraft = window.localStorage.getItem(CREATE_FORM_GUEST_DRAFT_STORAGE_KEY);
    const rawDraft = adminDraft ?? guestDraft;
    if (!rawDraft) {
      return "missing";
    }
    return isValidStoredCreateFormDraft(rawDraft) ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}
