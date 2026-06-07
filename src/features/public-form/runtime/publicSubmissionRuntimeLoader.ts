let publicSubmissionStatusRuntimePromise: Promise<
  typeof import("./publicSubmissionStatusRuntime")
> | null = null;
let publicSubmissionUploadRuntimePromise: Promise<
  typeof import("./publicSubmissionUploadRuntime")
> | null = null;
let publicSubmissionPersistenceRuntimePromise: Promise<
  typeof import("./publicSubmissionPersistenceRuntime")
> | null = null;

export function loadPublicSubmissionStatusRuntime() {
  publicSubmissionStatusRuntimePromise ??= import("./publicSubmissionStatusRuntime");
  return publicSubmissionStatusRuntimePromise;
}

export function loadPublicSubmissionUploadRuntime() {
  publicSubmissionUploadRuntimePromise ??= import("./publicSubmissionUploadRuntime");
  return publicSubmissionUploadRuntimePromise;
}

export function loadPublicSubmissionPersistenceRuntime() {
  publicSubmissionPersistenceRuntimePromise ??= import("./publicSubmissionPersistenceRuntime");
  return publicSubmissionPersistenceRuntimePromise;
}
