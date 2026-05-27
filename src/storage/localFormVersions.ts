import type { FormSchema } from "../types";
import { normalizeForm } from "../lib/formSchema";
import { resolveFormVersion } from "../lib/formVersioning";

const LOCAL_FORM_VERSION_SCHEMAS_KEY = "deepsignal.formVersionSchemas";

type StoredFormVersionSchemas = Record<string, Record<string, FormSchema>>;

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStore(): StoredFormVersionSchemas {
  if (!canUseLocalStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_FORM_VERSION_SCHEMAS_KEY);
    return raw ? (JSON.parse(raw) as StoredFormVersionSchemas) : {};
  } catch (error) {
    console.warn("Failed to read local form version schemas.", error);
    return {};
  }
}

function writeStore(store: StoredFormVersionSchemas) {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_FORM_VERSION_SCHEMAS_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("Failed to write local form version schemas.", error);
  }
}

export function readLocalFormVersionSchemas(formId: string): Record<number, FormSchema> {
  const versions = readStore()[formId] ?? {};
  return Object.fromEntries(
    Object.entries(versions).map(([version, form]) => [Number(version), normalizeForm(form)]),
  );
}

export function upsertLocalFormVersionSchema(form: FormSchema | null | undefined) {
  if (!form?.id) {
    return;
  }
  const version = resolveFormVersion(form);
  const store = readStore();
  const formVersions = store[form.id] ?? {};
  store[form.id] = {
    ...formVersions,
    [String(version)]: normalizeForm(form),
  };
  writeStore(store);
}

export function removeLocalFormVersionSchemas(formIds: Iterable<string>) {
  const store = readStore();
  let changed = false;
  for (const formId of formIds) {
    if (store[formId]) {
      delete store[formId];
      changed = true;
    }
  }
  if (changed) {
    writeStore(store);
  }
}
