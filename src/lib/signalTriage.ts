import { flattenAnswer, makeId } from "./utils";
import type { FormSchema, SignalSeverity, Submission, SubmissionCategory } from "../types";

const EMBEDDING_DIMENSIONS = 48;
const SIMILAR_SIGNAL_LIMIT = 4;
const SIMILAR_CLUSTER_LIMIT = 4;
const MIN_SIMILARITY = 0.45;
const TRIAGE_VERSION = 2;
const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "already",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "general",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "issue",
  "is",
  "it",
  "of",
  "on",
  "or",
  "please",
  "product",
  "question",
  "really",
  "share",
  "signal",
  "so",
  "that",
  "the",
  "this",
  "those",
  "to",
  "very",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export interface SimilarSignalMatch {
  submission: Submission;
  similarity: number;
}

export interface SignalClusterInsight {
  id: string;
  label: string;
  summary: string;
  keywords: string[];
  severity: SignalSeverity;
  signalCount: number;
  representativeSubmissionId: string;
  similarity: number;
}

function hashToken(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 2 &&
        !STOPWORDS.has(token) &&
        !/^\d+$/.test(token) &&
        !/^([a-z0-9])\1+$/.test(token),
    );
}

function extractKeywordCandidates(text: string) {
  const counts = new Map<string, number>();
  tokenize(text).forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token);
}

function getClusterLabel(keywords: string[], fallback: string) {
  if (keywords.length >= 2) {
    return `${keywords[0]} / ${keywords[1]}`;
  }
  if (keywords.length === 1) {
    return keywords[0];
  }
  return fallback;
}

function getCategoryLabel(category?: SubmissionCategory) {
  switch (category) {
    case "bug":
      return "Bug";
    case "feature":
      return "Feature";
    case "survey":
      return "Survey";
    default:
      return "General";
  }
}

function inferCategory(submission: Submission, corpus: string): SubmissionCategory {
  if (submission.category && submission.category !== "general") {
    return submission.category;
  }
  if (/\b(bug|broken|crash|error|failing|issue|problem)\b/i.test(corpus)) {
    return "bug";
  }
  if (/\b(feature|request|wish|idea|improve|enhancement)\b/i.test(corpus)) {
    return "feature";
  }
  if (/\b(survey|poll|feedback score|rating)\b/i.test(corpus)) {
    return "survey";
  }
  return "general";
}

function inferSeverity(submission: Submission, corpus: string): SignalSeverity {
  if (submission.priority === "high") {
    return "high";
  }
  if (/\b(crash|blocked|blocking|data loss|urgent|cannot|can't|outage|broken)\b/i.test(corpus)) {
    return "high";
  }
  if (/\b(slow|confusing|difficult|annoying|retry|retrying|failed|failure)\b/i.test(corpus)) {
    return "medium";
  }
  return submission.priority === "low" ? "low" : "medium";
}

function inferEmotion(corpus: string) {
  if (/\b(love|great|awesome|thanks|helpful|smooth)\b/i.test(corpus)) {
    return "positive";
  }
  if (/\b(angry|hate|frustrated|annoyed|broken|terrible|awful)\b/i.test(corpus)) {
    return "frustrated";
  }
  if (/\b(confused|unclear|understand|where|why)\b/i.test(corpus)) {
    return "confused";
  }
  if (/\b(urgent|asap|critical|immediately|blocked)\b/i.test(corpus)) {
    return "urgent";
  }
  return "neutral";
}

function createEmbedding(text: string) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  tokenize(text).forEach((token, index) => {
    const bucket = hashToken(token) % EMBEDDING_DIMENSIONS;
    const weight = 1 + Math.min(token.length, 8) / 10 + (index % 3) * 0.05;
    vector[bucket] += weight;
  });
  return normalizeVector(vector);
}

function getAnswerFragments(submission: Submission, form?: FormSchema) {
  if (form) {
    return form.fields
      .map((field) => flattenAnswer(submission.answers[field.id]).trim())
      .filter(Boolean);
  }
  return Object.values(submission.answers ?? {})
    .map((value) => flattenAnswer(value).trim())
    .filter(Boolean);
}

function buildCorpus(submission: Submission, form?: FormSchema) {
  const answerFragments = getAnswerFragments(submission, form);
  const attachmentText = submission.attachments
    .map((attachment) => `${attachment.type} ${attachment.name}`)
    .join(" ");

  return [
    submission.subjectPreview,
    ...answerFragments,
    attachmentText,
    submission.notes,
    submission.tags.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

function getTriageVersion(submission: Submission) {
  const version = submission.metadata?.triageVersion;
  return typeof version === "number" ? version : undefined;
}

function buildSummary(
  category: SubmissionCategory,
  severity: SignalSeverity,
  emotion: string,
  keywords: string[],
  metadata: Record<string, unknown>,
) {
  const attachmentCount = Number(metadata.attachmentCount ?? 0);
  const screenshotCount = Number(metadata.screenshotCount ?? 0);
  const focus = keywords.slice(0, 3).join(", ") || "general feedback";
  const evidence =
    screenshotCount > 0
      ? ` Includes ${screenshotCount} screenshot${screenshotCount > 1 ? "s" : ""}.`
      : attachmentCount > 0
        ? ` Includes ${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}.`
        : "";
  return `${getCategoryLabel(category)} signal with ${severity} severity and ${emotion} tone around ${focus}.${evidence}`.trim();
}

function averageEmbeddings(vectors: number[][]) {
  if (vectors.length === 0) {
    return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  }
  const sum = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vectors.forEach((vector) => {
    vector.forEach((value, index) => {
      sum[index] += value;
    });
  });
  return normalizeVector(sum.map((value) => value / vectors.length));
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function keywordOverlapRatio(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let shared = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      shared += 1;
    }
  });
  return shared / Math.max(leftSet.size, rightSet.size);
}

export function getSubmissionEmbedding(submission: Submission, form?: FormSchema) {
  if (
    getTriageVersion(submission) === TRIAGE_VERSION &&
    Array.isArray(submission.embedding) &&
    submission.embedding.length > 0
  ) {
    return normalizeVector(submission.embedding);
  }
  const text = buildCorpus(submission, form);
  return createEmbedding(text);
}

export function getSubmissionKeywords(submission: Submission, form?: FormSchema) {
  if (
    getTriageVersion(submission) === TRIAGE_VERSION &&
    Array.isArray(submission.keywords) &&
    submission.keywords.length > 0
  ) {
    return submission.keywords;
  }
  return extractKeywordCandidates(buildCorpus(submission, form)).slice(0, 5);
}

export function getSubmissionSummary(submission: Submission, form?: FormSchema) {
  if (getTriageVersion(submission) === TRIAGE_VERSION && submission.aiSummary?.trim()) {
    return submission.aiSummary.trim();
  }
  const corpus = buildCorpus(submission, form);
  const metadata = buildSubmissionMetadata(form, submission);
  return buildSummary(
    inferCategory(submission, corpus),
    inferSeverity(submission, corpus),
    inferEmotion(corpus),
    extractKeywordCandidates(corpus).slice(0, 5),
    metadata,
  );
}

export function buildSubmissionMetadata(form: FormSchema | undefined, submission: Submission) {
  const screenshotCount = submission.attachments.filter((attachment) => attachment.type === "image")
    .length;
  const videoCount = submission.attachments.filter((attachment) => attachment.type === "video").length;
  return {
    ...(submission.metadata ?? {}),
    triageVersion: TRIAGE_VERSION,
    formTitle: form?.title ?? submission.formId,
    formPurpose: form?.purpose ?? "custom",
    fieldCount: form?.fields.length ?? Object.keys(submission.answers ?? {}).length,
    attachmentCount: submission.attachments.length,
    screenshotCount,
    videoCount,
    hasWalletSignature: Boolean(submission.responderSignature),
  } satisfies Record<string, unknown>;
}

export function enrichSubmissionWithTriage(form: FormSchema, submission: Submission): Submission {
  const corpus = buildCorpus(submission, form);
  const category = inferCategory(submission, corpus);
  const severity = inferSeverity(submission, corpus);
  const emotion = inferEmotion(corpus);
  const keywords = extractKeywordCandidates(corpus).slice(0, 5);
  const metadata = buildSubmissionMetadata(form, submission);

  return {
    ...submission,
    metadata,
    category,
    aiSummary: buildSummary(category, severity, emotion, keywords, metadata),
    severity,
    emotion,
    keywords,
    embedding: createEmbedding(corpus),
  };
}

export function findSimilarSignals(
  selected: Submission,
  submissions: Submission[],
  formById?: Record<string, FormSchema | undefined>,
) {
  const baseEmbedding = getSubmissionEmbedding(selected, formById?.[selected.formId]);
  const baseKeywords = getSubmissionKeywords(selected, formById?.[selected.formId]);
  return submissions
    .filter((candidate) => candidate.id !== selected.id)
    .map((candidate) => {
      const candidateKeywords = getSubmissionKeywords(candidate, formById?.[candidate.formId]);
      const cosine = cosineSimilarity(
        baseEmbedding,
        getSubmissionEmbedding(candidate, formById?.[candidate.formId]),
      );
      const overlap = keywordOverlapRatio(baseKeywords, candidateKeywords);
      return {
        submission: candidate,
        similarity: cosine * 0.7 + overlap * 0.3,
      };
    })
    .filter((candidate) => candidate.similarity >= MIN_SIMILARITY)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, SIMILAR_SIGNAL_LIMIT);
}

export function getClusterInsights(
  selected: Submission,
  submissions: Submission[],
  formById?: Record<string, FormSchema | undefined>,
) {
  const grouped = new Map<string, Submission[]>();
  submissions.forEach((submission) => {
    if (!submission.clusterId) {
      return;
    }
    grouped.set(submission.clusterId, [...(grouped.get(submission.clusterId) ?? []), submission]);
  });

  const baseEmbedding = getSubmissionEmbedding(selected, formById?.[selected.formId]);
  const baseKeywords = getSubmissionKeywords(selected, formById?.[selected.formId]);
  return [...grouped.entries()]
    .map(([clusterId, members]) => {
      const embeddings = members.map((member) =>
        getSubmissionEmbedding(member, formById?.[member.formId]),
      );
      const centroid = averageEmbeddings(embeddings);
      const representative = members[0];
      const allKeywords = members.flatMap((member) => getSubmissionKeywords(member, formById?.[member.formId]));
      const clusterKeywords = extractKeywordCandidates(allKeywords.join(" ")).slice(0, 4);
      const severity =
        members.some((member) => member.severity === "high")
          ? "high"
          : members.some((member) => member.severity === "medium")
            ? "medium"
            : "low";
      return {
        id: clusterId,
        label: getClusterLabel(clusterKeywords, getSubmissionSummary(representative, formById?.[representative.formId]).slice(0, 48)),
        summary: getSubmissionSummary(representative, formById?.[representative.formId]),
        keywords: clusterKeywords,
        severity,
        signalCount: members.length,
        representativeSubmissionId: representative.id,
        similarity:
          cosineSimilarity(baseEmbedding, centroid) * 0.7 +
          keywordOverlapRatio(baseKeywords, clusterKeywords) * 0.3,
      } satisfies SignalClusterInsight;
    })
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, SIMILAR_CLUSTER_LIMIT);
}

export function createSubmissionClusterId(submission: Submission) {
  return `${submission.formId}-${makeId("cluster")}`;
}
