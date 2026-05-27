import type { Submission } from "../types";
import { resolveFormVersion } from "./formVersioning";

export type SubmissionVersionFilter = "all" | number;

export function getSubmissionVersion(submission: Pick<Submission, "formVersion">) {
  return resolveFormVersion(submission);
}

export function matchesSubmissionVersion(submission: Pick<Submission, "formVersion">, version: SubmissionVersionFilter) {
  return version === "all" || getSubmissionVersion(submission) === version;
}

export function getSubmissionVersions(submissions: Array<Pick<Submission, "formVersion">>) {
  return Array.from(new Set(submissions.map((submission) => getSubmissionVersion(submission)))).sort((left, right) => left - right);
}

export function getSubmissionVersionCounts(submissions: Array<Pick<Submission, "formVersion">>) {
  const counts = new Map<number, number>();
  submissions.forEach((submission) => {
    const version = getSubmissionVersion(submission);
    counts.set(version, (counts.get(version) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort(([left], [right]) => left - right);
}
