const forbiddenSignalMemoryKeys = new Set([
  "answers",
  "publicPayload",
  "encryptedPayload",
  "attachments",
  "metadata",
  "respondentMeta",
  "responderSignature",
  "responderSignedBytes",
  "errorStack",
]);

export class UnsafeSignalMemoryError extends Error {
  constructor(key: string) {
    super(`Signal Pattern Memory contains forbidden raw signal field: ${key}`);
    this.name = "UnsafeSignalMemoryError";
  }
}

export function assertSafeSignalPatternMemory(value: unknown) {
  const pending: unknown[] = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (forbiddenSignalMemoryKeys.has(key)) {
        throw new UnsafeSignalMemoryError(key);
      }
      if (child && typeof child === "object") {
        pending.push(child);
      }
    }
  }
}

export function assertSignalMemoryNamespace(namespace: string) {
  if (!namespace.trim()) {
    throw new Error("Signal Pattern Memory namespace is required.");
  }
}
