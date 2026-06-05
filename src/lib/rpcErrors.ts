export function isSuiRateLimitError(error: unknown) {
  if (!error) {
    return false;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 429) {
    return true;
  }

  const cause = typeof error === "object" && error !== null && "cause" in error
    ? (error as { cause?: unknown }).cause
    : undefined;
  if (cause && cause !== error && isSuiRateLimitError(cause)) {
    return true;
  }

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("status code: 429")
  );
}
