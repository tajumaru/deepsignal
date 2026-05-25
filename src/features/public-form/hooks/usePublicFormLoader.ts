import { useEffect, useState } from "react";
import { isChunkLoadFailure } from "../../../lib/chunkLoadRecovery";
import { createEmptyAnswer, normalizeForm } from "../../../lib/formSchema";
import { measurePerf } from "../../../lib/perf";
import { getRepublishFormPath } from "../../../lib/publicLinks";
import { verifyPublicRouteAssets } from "../../../lib/publicRouteAssets";
import { verifyWalrusBlob, type WalrusVerificationStatus } from "../../../lib/walrusProof";
import { storage } from "../../../storage/storageFactory";
import { upsertFormBlobIndex } from "../../../storage/blobIndex";
import { localStorageAdapter } from "../../../storage/localStorageAdapter";
import type { FormSchema } from "../../../types";
import type { PublicAnswers } from "../types";

type SharedFormRestoreErrorCode =
  | "aggregator_unconfigured"
  | "manifest_blob_unavailable"
  | "form_blob_unavailable"
  | "json_parse_failed"
  | "form_id_mismatch"
  | "module_script_failed";

class SharedFormRestoreError extends Error {
  code: SharedFormRestoreErrorCode;
  blobId?: string;
  expectedFormId?: string;
  actualFormId?: string;
  stage?: "manifest" | "form";

  constructor(
    code: SharedFormRestoreErrorCode,
    message: string,
    details: {
      blobId?: string;
      expectedFormId?: string;
      actualFormId?: string;
      stage?: "manifest" | "form";
    } = {},
  ) {
    super(message);
    this.name = "SharedFormRestoreError";
    this.code = code;
    this.blobId = details.blobId;
    this.expectedFormId = details.expectedFormId;
    this.actualFormId = details.actualFormId;
    this.stage = details.stage;
  }
}

export interface PublicFormLoadErrorDetail {
  code: SharedFormRestoreErrorCode | "form_not_found";
  reason: string;
  guidance: string;
  manifestBlobId?: string;
  formBlobId?: string;
  expectedFormId?: string;
  actualFormId?: string;
  failedAssetPath?: string;
  failedAssetStatus?: number;
  failedAssetContentType?: string;
  failedAssetAttempts?: number;
  failedAssetUrl?: string;
  failedAssetErrorMessage?: string;
  failedAssetBuild?: string;
  manifestStatus?: WalrusVerificationStatus;
  formBlobStatus?: WalrusVerificationStatus;
  republishPath?: string;
}

function toSharedFormRestoreError(
  stage: "manifest" | "form",
  error: unknown,
  blobId: string,
): SharedFormRestoreError {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "WalrusBlobReadError" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const walrusError = error as { code: string };
    if (walrusError.code === "aggregator_unconfigured") {
      return new SharedFormRestoreError(
        "aggregator_unconfigured",
        "Walrus aggregator URL is not configured in this build.",
        { blobId, stage },
      );
    }
    if (walrusError.code === "json_parse_failed") {
      return new SharedFormRestoreError(
        "json_parse_failed",
        stage === "manifest"
          ? `Manifest blob ${blobId} was downloaded but could not be parsed as JSON.`
          : `Linked form blob ${blobId} was downloaded but could not be parsed as JSON.`,
        { blobId, stage },
      );
    }
    return new SharedFormRestoreError(
      stage === "manifest" ? "manifest_blob_unavailable" : "form_blob_unavailable",
      stage === "manifest"
        ? `Manifest blob ${blobId} could not be fetched from Walrus.`
        : `Linked form blob ${blobId} could not be fetched from Walrus.`,
      { blobId, stage },
    );
  }

  return new SharedFormRestoreError(
    stage === "manifest" ? "manifest_blob_unavailable" : "form_blob_unavailable",
    error instanceof Error ? error.message : "Walrus restore failed.",
    { blobId, stage },
  );
}

function formatSharedFormRestoreMessage(error: unknown) {
  if (error instanceof SharedFormRestoreError) {
    switch (error.code) {
      case "aggregator_unconfigured":
        return "This shared form cannot be restored here because the Walrus aggregator URL is not configured.";
      case "manifest_blob_unavailable":
        return "This shared form could not be restored because the manifest blob could not be fetched from Walrus.";
      case "form_blob_unavailable":
        return "This shared form could not be restored because the linked form blob could not be fetched from Walrus.";
      case "json_parse_failed":
        return "This shared form could not be restored because the Walrus JSON payload is invalid.";
      case "form_id_mismatch":
        return error.message;
      case "module_script_failed":
        return "This shared form could not be restored because a required public route module failed to load.";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "This shared form could not be restored from Walrus.";
}

function getSharedFormRestoreGuidance(error: SharedFormRestoreError) {
  switch (error.code) {
    case "form_id_mismatch":
      return "This link points to a different form. Ask the creator for the matching public link.";
    case "form_blob_unavailable":
    case "manifest_blob_unavailable":
    case "aggregator_unconfigured":
      return "Ask the creator to republish until Walrus storage succeeds, then open the new shared link.";
    case "json_parse_failed":
      return "Ask the creator to republish the form so the Walrus JSON payload is regenerated.";
    case "module_script_failed":
      return "Ask the creator to republish only after the public route assets are certified and the new shared link is ready.";
    default:
      return "Ask the creator to republish the form and share a fresh link.";
  }
}

function createLoadErrorDetail(
  error: unknown,
  context: { formId: string; manifestBlobId: string },
): PublicFormLoadErrorDetail {
  if (error instanceof SharedFormRestoreError) {
    const blobKey = error.stage === "form" ? "formBlobId" : "manifestBlobId";
    return {
      code: error.code,
      reason: error.message || formatSharedFormRestoreMessage(error),
      guidance: getSharedFormRestoreGuidance(error),
      manifestBlobId: context.manifestBlobId,
      expectedFormId: error.expectedFormId ?? context.formId,
      actualFormId: error.actualFormId,
      ...(error.blobId ? { [blobKey]: error.blobId } : {}),
      republishPath: getRepublishFormPath(context.formId, context.manifestBlobId || undefined),
    };
  }
  return {
    code: context.manifestBlobId ? "manifest_blob_unavailable" : "form_not_found",
    reason: error instanceof Error ? error.message : "This shared form could not be restored.",
    guidance: context.manifestBlobId
      ? "Ask the creator to republish until Walrus storage succeeds, then open the new shared link."
      : "Open a public link that includes a Walrus manifest, or ask the creator to publish this form again.",
    manifestBlobId: context.manifestBlobId || undefined,
    expectedFormId: context.formId,
    republishPath: getRepublishFormPath(context.formId, context.manifestBlobId || undefined),
  };
}

async function enrichLoadErrorDetail(
  detail: PublicFormLoadErrorDetail,
  error: unknown,
): Promise<PublicFormLoadErrorDetail> {
  const enrichedDetail = { ...detail };
  if (enrichedDetail.manifestBlobId) {
    try {
      enrichedDetail.manifestStatus = await verifyWalrusBlob(enrichedDetail.manifestBlobId);
    } catch {
      // Best effort only for the public failure screen.
    }
  }
  if (enrichedDetail.formBlobId) {
    try {
      enrichedDetail.formBlobStatus = await verifyWalrusBlob(enrichedDetail.formBlobId);
    } catch {
      // Best effort only for the public failure screen.
    }
  }
  if (isChunkLoadFailure(error)) {
    try {
      const assetVerification = await measurePerf(
        "public-form:asset-verification",
        () => verifyPublicRouteAssets("publicForm"),
      );
      if (assetVerification.failedAsset) {
        const buildLabel = [assetVerification.appVersion, assetVerification.buildTime]
          .filter(Boolean)
          .join(" / ");
        enrichedDetail.code = "module_script_failed";
        enrichedDetail.reason =
          "A required public route module could not be confirmed from the Walrus site before the form was restored.";
        enrichedDetail.guidance =
          "Reload once to retry the current build. If the same asset keeps failing, ask the creator to republish after the Walrus site assets finish propagating.";
        enrichedDetail.failedAssetPath = assetVerification.failedAsset.path;
        enrichedDetail.failedAssetStatus = assetVerification.failedAsset.status;
        enrichedDetail.failedAssetContentType = assetVerification.failedAsset.contentType;
        enrichedDetail.failedAssetAttempts = assetVerification.failedAsset.attempts?.length ?? 1;
        enrichedDetail.failedAssetUrl = assetVerification.failedAsset.url;
        enrichedDetail.failedAssetErrorMessage = assetVerification.failedAsset.errorMessage;
        enrichedDetail.failedAssetBuild = buildLabel || undefined;
      }
    } catch (assetError) {
      if (assetError instanceof Error && assetError.message.trim()) {
        enrichedDetail.reason = assetError.message;
      }
    }
  }
  return enrichedDetail;
}

interface UsePublicFormLoaderArgs {
  formId: string;
  manifestBlobId: string;
  missingFormMessage: string;
}

interface UsePublicFormLoaderResult {
  form: FormSchema | null;
  initialAnswers: PublicAnswers;
  loading: boolean;
  loadError: string;
  loadErrorDetail: PublicFormLoadErrorDetail | null;
}

export function usePublicFormLoader({
  formId,
  manifestBlobId,
  missingFormMessage,
}: UsePublicFormLoaderArgs): UsePublicFormLoaderResult {
  const [form, setForm] = useState<FormSchema | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<PublicAnswers>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadErrorDetail, setLoadErrorDetail] = useState<PublicFormLoadErrorDetail | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      setLoadErrorDetail(null);
      try {
        let nextForm: FormSchema | null = null;
        let manifestRestoreError: unknown = null;
        if (manifestBlobId) {
          try {
            nextForm = await measurePerf("public-form:manifest-restore", async () => {
              const {
                getWalrusMutationRuntimeStatus,
                readJsonBlobOrThrow,
                readManifestWithForm,
              } = await import("../../../lib/walrus");
              const walrusRuntime = getWalrusMutationRuntimeStatus();
              if (!walrusRuntime.aggregatorConfigured) {
                throw new SharedFormRestoreError(
                  "aggregator_unconfigured",
                  "Walrus aggregator URL is not configured in this build.",
                  { blobId: manifestBlobId, stage: "manifest" },
                );
              }
              const carrier = await readManifestWithForm(manifestBlobId).catch((error) => {
                throw toSharedFormRestoreError("manifest", error, manifestBlobId);
              });
              const manifest = carrier.manifest;
              let restoredForm: FormSchema | null = null;
              let restoredFormBlobId = "";

              if (manifest.formId !== formId) {
                throw new SharedFormRestoreError(
                  "form_id_mismatch",
                  `This shared link points to form ${manifest.formId}, but the page expected ${formId}.`,
                  {
                    blobId: manifestBlobId,
                    expectedFormId: formId,
                    actualFormId: manifest.formId,
                    stage: "manifest",
                  },
                );
              }
              if (carrier.form) {
                if (carrier.form.id !== formId) {
                  throw new SharedFormRestoreError(
                    "form_id_mismatch",
                    `The bundled form inside manifest ${manifestBlobId} has id ${carrier.form.id}, which does not match ${formId}.`,
                    {
                      blobId: manifestBlobId,
                      expectedFormId: formId,
                      actualFormId: carrier.form.id,
                      stage: "form",
                    },
                  );
                }
                restoredForm = carrier.form;
                restoredFormBlobId = manifestBlobId;
              } else if (manifest.formBlobId && manifest.formBlobId !== "__bundled_form__") {
                restoredForm = await readJsonBlobOrThrow<FormSchema>(manifest.formBlobId).catch((error) => {
                  throw toSharedFormRestoreError("form", error, manifest.formBlobId);
                });
                restoredFormBlobId = manifest.formBlobId;
                if (restoredForm.id !== formId) {
                  throw new SharedFormRestoreError(
                    "form_id_mismatch",
                    `The linked form blob ${manifest.formBlobId} has id ${restoredForm.id}, which does not match ${formId}.`,
                    {
                      blobId: manifest.formBlobId,
                      expectedFormId: formId,
                      actualFormId: restoredForm.id,
                      stage: "form",
                    },
                  );
                }
              } else {
                throw new SharedFormRestoreError(
                  "form_blob_unavailable",
                  `Manifest ${manifestBlobId} does not contain a bundled form or a matching form blob for ${formId}.`,
                  {
                    blobId: manifestBlobId,
                    expectedFormId: formId,
                    actualFormId: manifest.formId,
                    stage: "form",
                  },
                );
              }

              if (!restoredForm) {
                return null;
              }

              const restored = {
                ...restoredForm,
                blobId: restoredFormBlobId,
                manifestBlobId,
              };
              await localStorageAdapter.saveForm(restored);
              upsertFormBlobIndex({
                formId: restored.id,
                formBlobId: restoredFormBlobId,
                manifestBlobId,
                createdAt: manifest.createdAt,
              });
              return restored;
            });
          } catch (error) {
            manifestRestoreError = error;
          }
        }

        if (manifestBlobId && manifestRestoreError) {
          throw manifestRestoreError;
        }

        if (!nextForm) {
          nextForm = await measurePerf("public-form:local-restore", () => storage.getForm(formId));
        }

        if (!nextForm && manifestRestoreError) {
          throw manifestRestoreError;
        }

        const normalizedForm = nextForm ? normalizeForm(nextForm) : null;
        setForm(normalizedForm);
        setInitialAnswers(
          normalizedForm ? Object.fromEntries(normalizedForm.fields.map((field) => [field.id, createEmptyAnswer(field)])) : {},
        );
      } catch (error) {
        setForm(null);
        setInitialAnswers({});
        const detail = await enrichLoadErrorDetail(
          createLoadErrorDetail(error, { formId, manifestBlobId }),
          error,
        );
        setLoadErrorDetail(detail);
        setLoadError(
          manifestBlobId
            ? `${detail.reason} ${detail.guidance}`
            : `This form is not available in this browser yet. ${
                error instanceof Error ? error.message : missingFormMessage
              }`,
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [formId, manifestBlobId, missingFormMessage]);

  return { form, initialAnswers, loading, loadError, loadErrorDetail };
}
