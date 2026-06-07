import { WALRUS_AGGREGATOR_URL } from "../sui";
import { LEGACY_SCHEMA_HASH, resolveFormVersion } from "../formVersioning";
import type { FormSchema, SignalManifest } from "../../types";

export type WalrusBlobReadErrorCode =
  | "aggregator_unconfigured"
  | "blob_unavailable"
  | "json_parse_failed";

type FormBundle = {
  version: 1;
  kind: "formBundle";
  form: FormSchema;
  manifest: SignalManifest;
};

const aggregatorUrl = WALRUS_AGGREGATOR_URL.replace(/\/$/, "");
const fallbackAggregatorUrls = String(import.meta.env.VITE_WALRUS_FALLBACK_AGGREGATOR_URLS || "")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);
const bundledFormPointer = "__bundled_form__";
const WALRUS_READ_TIMEOUT_MS = 4000;
const WALRUS_READ_MAX_ATTEMPTS = 3;

export class WalrusBlobReadError extends Error {
  code: WalrusBlobReadErrorCode;
  blobId: string;

  constructor(code: WalrusBlobReadErrorCode, blobId: string, message: string) {
    super(message);
    this.name = "WalrusBlobReadError";
    this.code = code;
    this.blobId = blobId;
  }
}

function assertReadEnv() {
  if (!aggregatorUrl) {
    throw new Error("Walrus aggregator URL is not configured.");
  }
}

function getReadAggregatorUrls() {
  return [...new Set([aggregatorUrl, ...fallbackAggregatorUrls].filter(Boolean))];
}

function withWalrusReadTimeout(blobId: string, task: Promise<Response>) {
  return Promise.race([
    task,
    new Promise<Response>((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error(
            `Walrus blob ${blobId} could not be fetched from the aggregator before the read timed out.`,
          ),
        );
      }, WALRUS_READ_TIMEOUT_MS);
    }),
  ]);
}

async function fetchBlobTextFromWalrusOrThrow(blobId: string): Promise<string> {
  if (!blobId.trim()) {
    throw new WalrusBlobReadError("blob_unavailable", blobId, "Walrus blob id is missing.");
  }
  try {
    assertReadEnv();
    let lastError: unknown;
    for (const gateway of getReadAggregatorUrls()) {
      for (let attempt = 1; attempt <= WALRUS_READ_MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await withWalrusReadTimeout(blobId, fetch(`${gateway}/v1/blobs/${blobId}`));
          if (response.status === 404) {
            throw new WalrusBlobReadError(
              "blob_unavailable",
              blobId,
              `Walrus blob ${blobId} does not exist or is not yet readable from the aggregator.`,
            );
          }
          if (!response.ok) {
            throw new Error(`Walrus fetch failed: ${response.status}`);
          }
          return await response.text();
        } catch (error) {
          lastError = error;
          if (error instanceof WalrusBlobReadError) {
            throw error;
          }
          if (attempt === WALRUS_READ_MAX_ATTEMPTS) {
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw lastError;
  } catch (error) {
    if (error instanceof WalrusBlobReadError) {
      throw error;
    }
    if (error instanceof Error && error.message === "Walrus aggregator URL is not configured.") {
      throw new WalrusBlobReadError("aggregator_unconfigured", blobId, error.message);
    }
    const message =
      error instanceof Error
        ? `Walrus blob ${blobId} could not be fetched from the aggregator. ${error.message}`
        : `Walrus blob ${blobId} could not be fetched from the aggregator.`;
    throw new WalrusBlobReadError("blob_unavailable", blobId, message);
  }
}

export async function readPublicJsonBlobOrThrow<T>(blobId: string): Promise<T> {
  const text = await fetchBlobTextFromWalrusOrThrow(blobId);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Walrus blob parse failed", blobId, error);
    throw new WalrusBlobReadError(
      "json_parse_failed",
      blobId,
      `Walrus blob ${blobId} did not contain valid JSON.`,
    );
  }
}

function normalizeManifest(
  manifest: SignalManifest,
  options: { carrierBlobId: string; form?: FormSchema | null } | null,
): SignalManifest {
  const form = options?.form ?? null;
  const currentVersion = manifest.currentVersion ?? resolveFormVersion(form ?? {});
  const formBlobId =
    manifest.formBlobId === bundledFormPointer && options?.carrierBlobId
      ? options.carrierBlobId
      : manifest.formBlobId;
  const schemaHash =
    form?.schemaHash ||
    manifest.versions?.find((version) => version.version === currentVersion)?.schemaHash ||
    LEGACY_SCHEMA_HASH;
  const versions = (manifest.versions?.length
    ? manifest.versions
    : [
        {
          version: currentVersion,
          formBlobId,
          schemaHash,
          createdAt: manifest.createdAt,
          publishedAt: manifest.updatedAt,
          titleSnapshot: form?.title,
        },
      ]).map((version) => ({
        ...version,
        version: resolveFormVersion({ formVersion: version.version }),
        formBlobId: !version.formBlobId || version.formBlobId === bundledFormPointer ? formBlobId : version.formBlobId,
        schemaHash: version.schemaHash || schemaHash,
        createdAt: version.createdAt || manifest.createdAt,
        publishedAt: version.publishedAt || manifest.updatedAt,
      }));

  return {
    ...manifest,
    version: 2,
    formBlobId,
    currentVersion,
    versions,
    processingMode: manifest.processingMode ?? form?.processingMode ?? "review_required",
    submissions: manifest.submissions.map((submission) => ({
      ...submission,
      formVersion: submission.formVersion ?? currentVersion,
      formBlobId: submission.formBlobId ?? formBlobId,
      schemaHash: submission.schemaHash ?? schemaHash,
    })),
  };
}

function isFormBundle(payload: unknown): payload is FormBundle {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<FormBundle>;
  return (
    candidate.kind === "formBundle" &&
    candidate.version === 1 &&
    Boolean(candidate.form) &&
    Boolean(candidate.manifest)
  );
}

export async function readPublicManifestWithForm(blobId: string): Promise<{
  manifest: SignalManifest;
  form: FormSchema | null;
}> {
  const payload = await readPublicJsonBlobOrThrow<unknown>(blobId);
  if (isFormBundle(payload)) {
    return {
      manifest: normalizeManifest(payload.manifest, { carrierBlobId: blobId, form: payload.form }),
      form: payload.form,
    };
  }

  return {
    manifest: normalizeManifest(payload as SignalManifest, { carrierBlobId: blobId, form: null }),
    form: null,
  };
}
