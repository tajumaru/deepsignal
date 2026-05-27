import { recoverFromChunkLoadFailure } from "./chunkLoadRecovery";
import { endPerf, startPerf } from "./perf";
import { recordFailedImport } from "./routeDiagnostics";

const lazyImportAttempts = 3;
const lazyImportBaseDelayMs = 450;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function retryLazyImport<T>(loader: () => Promise<T>, label = "anonymous"): Promise<T> {
  let lastError: unknown;
  const perfName = `lazy:${label}`;
  startPerf(perfName);

  for (let attempt = 1; attempt <= lazyImportAttempts; attempt += 1) {
    try {
      const result = await loader();
      endPerf(perfName, "ok", `attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      recordFailedImport(label, error);
      if (attempt === lazyImportAttempts) {
        break;
      }
      await wait(lazyImportBaseDelayMs * attempt);
    }
  }

  recoverFromChunkLoadFailure(lastError);
  endPerf(perfName, "failed", lastError instanceof Error ? lastError.message : String(lastError));
  throw lastError;
}
