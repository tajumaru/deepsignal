import type { FormSchema, StorageAdapter, Submission } from "../types";

export const walrusAdapter: StorageAdapter = {
  async saveForm(form: FormSchema) {
    // TODO: Serialize the form schema and store it through the Walrus SDK or CLI.
    // TODO: Return the Walrus blob id so the admin UI can surface verifiable storage ids.
    return { id: form.id, blobId: `todo-walrus-form-${form.id}` };
  },
  async getForm() {
    // TODO: Load a form schema blob from Walrus by id or mapping index.
    return null;
  },
  async listForms() {
    // TODO: Query Walrus-backed form metadata index.
    return [];
  },
  async deleteForm() {
    // TODO: Delete or tombstone the form metadata and any associated submission index in Walrus.
  },
  async saveSubmission(submission: Submission) {
    // TODO: Serialize the submission and persist as a Walrus blob.
    return { id: submission.id, blobId: `todo-walrus-submission-${submission.id}` };
  },
  async listSubmissions() {
    // TODO: Query submission metadata for a given form id.
    return [];
  },
  async updateSubmission() {
    // TODO: Persist admin-managed status, priority, and notes updates to Walrus-backed state.
  },
  async saveEncryptedPayload() {
    // TODO: Store a sealed payload blob in Walrus and return its blob id.
    return { blobId: "todo-sealed-payload" };
  },
  async readEncryptedPayload() {
    // TODO: Read a sealed payload blob back from Walrus.
    return null;
  },
  async uploadFile(file: File) {
    // TODO: Stream the file into Walrus and return the blob id plus optional public gateway URL.
    return { blobId: `todo-walrus-file-${file.name}` };
  },
};
