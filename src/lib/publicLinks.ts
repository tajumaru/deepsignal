function withOptionalManifest(path: string, manifestBlobId?: string) {
  if (!manifestBlobId) {
    return path;
  }
  return `${path}?manifest=${encodeURIComponent(manifestBlobId)}`;
}

export function getPublicFormPath(formId: string, manifestBlobId?: string) {
  return withOptionalManifest(`/f/${formId}`, manifestBlobId);
}

export function getPublicRoadmapPath(formId: string, manifestBlobId?: string) {
  return withOptionalManifest(`/roadmap/${formId}`, manifestBlobId);
}

export function getPublicFormHashPath(formId: string, manifestBlobId: string) {
  return `/#${getPublicFormPath(formId, manifestBlobId)}`;
}

export function getPublicRoadmapHashPath(formId: string, manifestBlobId: string) {
  return `/#${getPublicRoadmapPath(formId, manifestBlobId)}`;
}

export function getAbsolutePublicFormUrl(formId: string, manifestBlobId: string, origin?: string) {
  const baseOrigin = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${baseOrigin}${getPublicFormHashPath(formId, manifestBlobId)}`;
}

export function getAbsolutePublicRoadmapUrl(formId: string, manifestBlobId: string, origin?: string) {
  const baseOrigin = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${baseOrigin}${getPublicRoadmapHashPath(formId, manifestBlobId)}`;
}

export function getRepublishFormPath(formId?: string, manifestBlobId?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("fresh", String(Date.now()));
  if (formId) {
    searchParams.set("republishFormId", formId);
  }
  if (manifestBlobId) {
    searchParams.set("republishManifest", manifestBlobId);
  }
  return `/create?${searchParams.toString()}`;
}
