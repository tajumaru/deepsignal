import type { AdminToastState } from "../hooks/useAdminToast";

interface AdminToastProps {
  toast: AdminToastState | null;
}

export function AdminToast({ toast }: AdminToastProps) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
