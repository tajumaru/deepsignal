import type React from "react";
import { OperationsStatusRail, type OperationsStatusItem } from "../../../components/OperationsStatusRail";

interface AdminOperationsStatusProps {
  items: OperationsStatusItem[];
  nextActionLabel: string;
  nextActionDetail: string;
  nextActionCta: React.ReactNode;
}

export function AdminOperationsStatus({
  items,
  nextActionLabel,
  nextActionDetail,
  nextActionCta,
}: AdminOperationsStatusProps) {
  return (
    <div className="admin-operations-status">
      <OperationsStatusRail
        items={items}
        nextActionLabel={nextActionLabel}
        nextActionDetail={nextActionDetail}
        nextActionCta={nextActionCta}
      />
    </div>
  );
}
