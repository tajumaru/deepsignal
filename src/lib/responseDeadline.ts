import { formatDate } from "./utils";

export type ResponseDeadlinePreset = "none" | "1h" | "24h" | "7d" | "30d" | "custom";

export interface ResponseDeadlineLabels {
  noLimit: string;
  notOpen?: string;
  closed: string;
  hoursLeft: (hours: number) => string;
  daysLeft: (days: number) => string;
}

const PRESET_TO_MS: Record<Exclude<ResponseDeadlinePreset, "none" | "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function isResponseDeadlinePassed(responseDeadline?: number | null): boolean {
  return typeof responseDeadline === "number" && Number.isFinite(responseDeadline)
    ? Date.now() > responseDeadline
    : false;
}

export function isResponseWindowPending(responseOpenAt?: number | null): boolean {
  return typeof responseOpenAt === "number" && Number.isFinite(responseOpenAt) ? Date.now() < responseOpenAt : false;
}

export function isResponseWindowClosed(responseOpenAt?: number | null, responseDeadline?: number | null): boolean {
  return isResponseWindowPending(responseOpenAt) || isResponseDeadlinePassed(responseDeadline);
}

export function formatResponseDeadline(
  responseDeadline?: number | null,
  labels?: ResponseDeadlineLabels,
  responseOpenAt?: number | null,
): string {
  if (isResponseWindowPending(responseOpenAt)) {
    return labels?.notOpen ?? "Scheduled";
  }
  if (responseDeadline == null || !Number.isFinite(responseDeadline)) {
    return labels?.noLimit ?? "No limit";
  }
  if (isResponseDeadlinePassed(responseDeadline)) {
    return labels?.closed ?? "Closed";
  }

  const diffMs = responseDeadline - Date.now();
  const diffHours = diffMs / (60 * 60 * 1000);
  if (diffHours <= 48) {
    const hours = Math.max(1, Math.ceil(diffHours));
    return labels?.hoursLeft(hours) ?? `${hours} hour(s) left`;
  }

  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  if (diffDays <= 60) {
    const days = Math.max(1, Math.ceil(diffDays));
    return labels?.daysLeft(days) ?? `${days} day(s) left`;
  }

  return formatDate(new Date(responseDeadline).toISOString());
}

export function getResponseDeadlineFromPreset(preset: ResponseDeadlinePreset): number | null {
  if (preset === "none" || preset === "custom") {
    return null;
  }
  return Date.now() + PRESET_TO_MS[preset];
}

export function parseCustomResponseDeadline(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDateTimeLocalValue(timestamp?: number | null): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}
