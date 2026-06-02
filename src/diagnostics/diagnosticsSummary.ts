import { searchDiagnostics } from "./diagnosticsService";
import type {
  DiagnosticsSummary,
  DiagnosticsSummaryGroup,
  DiagnosticsSummaryOptions,
  SystemDiagnostic,
  SystemDiagnosticSeverity,
} from "./types";

const severityRank: Record<SystemDiagnosticSeverity, number> = {
  warning: 1,
  error: 2,
  critical: 3,
};

function maxSeverity(left: SystemDiagnosticSeverity, right: SystemDiagnosticSeverity) {
  return severityRank[right] > severityRank[left] ? right : left;
}

function getGroupKey(diagnostic: SystemDiagnostic, groupBy: NonNullable<DiagnosticsSummaryOptions["groupBy"]>) {
  return String(diagnostic[groupBy] || "unknown");
}

export async function summarizeDiagnostics(options: DiagnosticsSummaryOptions = {}): Promise<DiagnosticsSummary> {
  const groupBy = options.groupBy ?? "fingerprint";
  const result = await searchDiagnostics({
    ...options,
    includeStackTraces: false,
  });
  const groupsByKey = new Map<string, DiagnosticsSummaryGroup>();
  const routeCounts = new Map<string, number>();

  result.diagnostics.forEach((diagnostic) => {
    const key = getGroupKey(diagnostic, groupBy);
    const current = groupsByKey.get(key);
    if (!current) {
      groupsByKey.set(key, {
        key,
        count: 1,
        severityMax: diagnostic.severity,
        firstSeen: diagnostic.createdAt,
        lastSeen: diagnostic.createdAt,
        examples: [diagnostic.id],
      });
    } else {
      current.count += 1;
      current.severityMax = maxSeverity(current.severityMax, diagnostic.severity);
      current.firstSeen = diagnostic.createdAt < current.firstSeen ? diagnostic.createdAt : current.firstSeen;
      current.lastSeen = diagnostic.createdAt > current.lastSeen ? diagnostic.createdAt : current.lastSeen;
      if (current.examples.length < 3) {
        current.examples.push(diagnostic.id);
      }
    }
    routeCounts.set(diagnostic.routeId, (routeCounts.get(diagnostic.routeId) ?? 0) + 1);
  });

  return {
    total: result.diagnostics.length,
    totalMatching: result.totalMatching,
    limit: result.limit,
    maxLimit: result.maxLimit,
    truncated: result.truncated,
    groupBy,
    groups: [...groupsByKey.values()].sort((left, right) => right.count - left.count),
    topRoutes: [...routeCounts.entries()]
      .map(([routeId, count]) => ({ routeId, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}
