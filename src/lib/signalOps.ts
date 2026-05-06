import type { Submission, SubmissionTriageStatus } from "../types";

export const TRIAGE_STATUS_OPTIONS: Array<{
  value: SubmissionTriageStatus;
  label: string;
}> = [
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "fixed", label: "Fixed" },
  { value: "closed", label: "Closed" },
];

export const PUBLIC_ROADMAP_TRIAGE_STATUSES: SubmissionTriageStatus[] = [
  "planned",
  "in_progress",
  "fixed",
];

export function getTriageStatusLabel(triageStatus: Submission["triageStatus"]) {
  return TRIAGE_STATUS_OPTIONS.find((option) => option.value === triageStatus)?.label ?? "New";
}
