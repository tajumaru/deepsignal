export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string, now = Date.now()) {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) {
    return "";
  }

  const diffMs = target - now;
  const absDiffMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (absDiffMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absDiffMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (absDiffMs < week) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  return rtf.format(Math.round(diffMs / week), "week");
}

export function flattenAnswer(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

export function downloadTextFile(filename: string, contents: string, type = "text/plain") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
