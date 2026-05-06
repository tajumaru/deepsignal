import type { FormSchema } from "../types";

export type FormAccessState = "allowed" | "legacy" | "denied";

export function addressesMatch(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

export function getFormAccessState(form: FormSchema | null, currentAddress?: string | null): FormAccessState {
  if (!form) {
    return "denied";
  }
  if (!form.ownerAddress) {
    return "legacy";
  }
  return addressesMatch(form.ownerAddress, currentAddress) ? "allowed" : "denied";
}

export function canAccessForm(form: FormSchema | null, currentAddress?: string | null) {
  return getFormAccessState(form, currentAddress) !== "denied";
}
