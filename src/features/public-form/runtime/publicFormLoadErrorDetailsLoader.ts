let publicFormLoadErrorDetailsRuntimePromise: Promise<
  typeof import("./publicFormLoadErrorDetailsRuntime")
> | null = null;

export async function loadPublicFormLoadErrorDetailsRuntime() {
  if (!publicFormLoadErrorDetailsRuntimePromise) {
    publicFormLoadErrorDetailsRuntimePromise = import("./publicFormLoadErrorDetailsRuntime");
  }
  return publicFormLoadErrorDetailsRuntimePromise;
}
