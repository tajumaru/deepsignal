import type { FormSchema } from "../types";
import { normalizeForm } from "./formSchema";
import { resolveFormVersion } from "./formVersioning";
import { readLocalFormVersionSchemas } from "../storage/localFormVersions";

export type VersionedFormSchemas = Record<number, FormSchema>;

export async function loadVersionedFormSchemas(form: FormSchema): Promise<VersionedFormSchemas> {
  const schemas: VersionedFormSchemas = {
    ...readLocalFormVersionSchemas(form.id),
    [resolveFormVersion(form)]: normalizeForm(form),
  };

  if (!form.manifestBlobId) {
    return schemas;
  }

  try {
    const { fetchJsonBlob, readManifestWithForm } = await import("./walrus/read");
    const carrier = await readManifestWithForm(form.manifestBlobId);
    await Promise.all(
      (carrier.manifest.versions ?? []).map(async (entry) => {
        if (!entry.formBlobId) {
          return;
        }
        if (schemas[entry.version]?.blobId === entry.formBlobId) {
          return;
        }
        const versionForm = await fetchJsonBlob<FormSchema>(entry.formBlobId).catch(() => null);
        if (versionForm) {
          schemas[entry.version] = normalizeForm({
            ...versionForm,
            formVersion: entry.version,
            schemaHash: entry.schemaHash || versionForm.schemaHash,
            blobId: entry.formBlobId,
            manifestBlobId: form.manifestBlobId,
          });
        }
      }),
    );
  } catch (error) {
    console.warn("Failed to load versioned form schemas.", error);
  }

  return schemas;
}
