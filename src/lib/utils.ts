export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function flattenAnswer(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(" | ");
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
