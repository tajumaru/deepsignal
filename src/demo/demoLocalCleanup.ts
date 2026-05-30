import { forcePurgeFormArtifacts } from "../storage/forcePurgeFormArtifacts";

const DEMO_FORM_ID = "demo-signal-operations-workspace";
const DEMO_FORM_BLOB_ID = "demo-walrus-form-7a91";
const DEMO_MANIFEST_BLOB_ID = "demo-manifest-4fd2";
const MOCK_ADMIN_STORAGE_KEY = "deepsignal.mockAdmin";

export function clearDemoLocalArtifacts() {
  forcePurgeFormArtifacts({
    formIds: [DEMO_FORM_ID],
    blobIds: [DEMO_FORM_BLOB_ID],
    manifestBlobIds: [DEMO_MANIFEST_BLOB_ID],
  });

  try {
    window.localStorage.removeItem(MOCK_ADMIN_STORAGE_KEY);
  } catch {
    // Local cleanup is best-effort so the home screen never fails to render.
  }
}
