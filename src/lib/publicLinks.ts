export function getPublicFormPath(formId: string, manifestBlobId?: string) {
  const path = `/f/${formId}`;
  if (!manifestBlobId) {
    return path;
  }
  return `${path}?manifest=${encodeURIComponent(manifestBlobId)}`;
}
