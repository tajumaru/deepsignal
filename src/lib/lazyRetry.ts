import { recoverFromChunkLoadFailure } from "./chunkLoadRecovery";

const lazyImportAttempts = 5;
const lazyImportBaseDelayMs = 900;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function retryLazyImport<T>(loader: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= lazyImportAttempts; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;
      if (attempt === lazyImportAttempts) {
        break;
      }
      await wait(lazyImportBaseDelayMs * attempt);
    }
  }

  recoverFromChunkLoadFailure(lastError);
  throw lastError;
}
