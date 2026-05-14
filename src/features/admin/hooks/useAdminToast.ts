import { useEffect, useState } from "react";

export interface AdminToastState {
  tone: "success" | "error";
  message: string;
}

export function useAdminToast() {
  const [toast, setToast] = useState<AdminToastState | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, setToast };
}
