import type {
  ConditionalLogicCondition,
  ConditionalLogicGroup,
  ConditionalLogicMode,
  ConditionalLogicOperator,
  FormField,
} from "../types";

const CONDITIONAL_OPERATORS: ConditionalLogicOperator[] = [
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan",
  "isEmpty",
  "isNotEmpty",
];

function isConditionalOperator(value: unknown): value is ConditionalLogicOperator {
  return typeof value === "string" && CONDITIONAL_OPERATORS.includes(value as ConditionalLogicOperator);
}

function isConditionalMode(value: unknown): value is ConditionalLogicMode {
  return value === "all" || value === "any";
}

function normalizeCondition(raw: unknown): ConditionalLogicCondition | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<ConditionalLogicCondition>;
  if (typeof candidate.fieldId !== "string" || !isConditionalOperator(candidate.operator)) {
    return null;
  }
  return {
    fieldId: candidate.fieldId,
    operator: candidate.operator,
    value:
      typeof candidate.value === "string"
        ? candidate.value
        : candidate.value == null
          ? undefined
          : String(candidate.value),
  };
}

export function normalizeLogicGroup(raw: unknown): ConditionalLogicGroup | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const candidate = raw as Partial<ConditionalLogicGroup>;
  if (!isConditionalMode(candidate.logic) || !Array.isArray(candidate.conditions)) {
    return undefined;
  }
  const conditions = candidate.conditions
    .map(normalizeCondition)
    .filter((condition): condition is ConditionalLogicCondition => Boolean(condition));
  if (!conditions.length) {
    return undefined;
  }
  return {
    logic: candidate.logic,
    conditions,
  };
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function toComparableText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function toComparableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function evaluateCondition(condition: ConditionalLogicCondition, answers: Record<string, unknown>) {
  const sourceValue = answers[condition.fieldId];
  switch (condition.operator) {
    case "equals": {
      const left = toComparableText(sourceValue);
      if (Array.isArray(left)) {
        return left.includes(condition.value ?? "");
      }
      return left === (condition.value ?? "");
    }
    case "notEquals": {
      const left = toComparableText(sourceValue);
      if (Array.isArray(left)) {
        return !left.includes(condition.value ?? "");
      }
      return left !== (condition.value ?? "");
    }
    case "contains": {
      if (Array.isArray(sourceValue)) {
        return sourceValue.map((item) => String(item)).includes(condition.value ?? "");
      }
      return toComparableText(sourceValue).includes(condition.value ?? "");
    }
    case "greaterThan": {
      const left = toComparableNumber(sourceValue);
      const right = toComparableNumber(condition.value);
      return left !== null && right !== null ? left > right : false;
    }
    case "lessThan": {
      const left = toComparableNumber(sourceValue);
      const right = toComparableNumber(condition.value);
      return left !== null && right !== null ? left < right : false;
    }
    case "isEmpty":
      return isEmptyValue(sourceValue);
    case "isNotEmpty":
      return !isEmptyValue(sourceValue);
    default:
      return false;
  }
}

export function evaluateRuleGroup(
  ruleGroup: ConditionalLogicGroup | undefined,
  answers: Record<string, unknown>,
  fallback = true,
) {
  if (!ruleGroup?.conditions.length) {
    return fallback;
  }
  const results = ruleGroup.conditions.map((condition) => evaluateCondition(condition, answers));
  return ruleGroup.logic === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function isFieldVisible(field: FormField, answers: Record<string, unknown>) {
  return evaluateRuleGroup(field.visibilityRules, answers, true);
}

export function isFieldRequired(field: FormField, answers: Record<string, unknown>, visible?: boolean) {
  const resolvedVisible = visible ?? isFieldVisible(field, answers);
  if (!resolvedVisible) {
    return false;
  }
  return field.required || evaluateRuleGroup(field.requiredRules, answers, false);
}

export function getVisibleFields(fields: FormField[], answers: Record<string, unknown>) {
  return fields.filter((field) => isFieldVisible(field, answers));
}

export function getVisibleFieldIds(fields: FormField[], answers: Record<string, unknown>) {
  return new Set(getVisibleFields(fields, answers).map((field) => field.id));
}

export function getRequiredFields(fields: FormField[], answers: Record<string, unknown>) {
  const visibleFieldIds = getVisibleFieldIds(fields, answers);
  return fields.filter((field) => isFieldRequired(field, answers, visibleFieldIds.has(field.id)));
}

function sanitizeLogicGroup(
  group: ConditionalLogicGroup | undefined,
  fieldId: string,
  allowedFieldIds: Set<string>,
) {
  if (!group?.conditions.length) {
    return undefined;
  }
  const conditions = group.conditions.filter(
    (condition) => condition.fieldId !== fieldId && allowedFieldIds.has(condition.fieldId),
  );
  if (!conditions.length) {
    return undefined;
  }
  return {
    logic: group.logic,
    conditions,
  } satisfies ConditionalLogicGroup;
}

function getDependencyGraph(fields: FormField[]) {
  const graph = new Map<string, Set<string>>();
  fields.forEach((field) => {
    const dependencies = new Set<string>();
    for (const group of [field.visibilityRules, field.requiredRules]) {
      group?.conditions.forEach((condition) => {
        if (condition.fieldId) {
          dependencies.add(condition.fieldId);
        }
      });
    }
    graph.set(field.id, dependencies);
  });
  return graph;
}

function hasPath(graph: Map<string, Set<string>>, startId: string, targetId: string, visited = new Set<string>()) {
  if (startId === targetId) {
    return true;
  }
  if (visited.has(startId)) {
    return false;
  }
  visited.add(startId);
  for (const nextId of graph.get(startId) ?? []) {
    if (hasPath(graph, nextId, targetId, visited)) {
      return true;
    }
  }
  return false;
}

export function wouldCreateConditionalCycle(fields: FormField[], fieldId: string, candidateFieldId: string) {
  if (!fieldId || !candidateFieldId || fieldId === candidateFieldId) {
    return true;
  }
  const graph = getDependencyGraph(fields);
  return hasPath(graph, candidateFieldId, fieldId);
}

export function hasConditionalLogicCycle(fields: FormField[]) {
  const graph = getDependencyGraph(fields);
  return fields.some((field) => hasPath(graph, field.id, field.id));
}

export function sanitizeConditionalLogicFields(fields: FormField[]) {
  const allowedFieldIds = new Set(fields.map((field) => field.id));
  return fields.map((field) => ({
    ...field,
    visibilityRules: sanitizeLogicGroup(normalizeLogicGroup(field.visibilityRules), field.id, allowedFieldIds),
    requiredRules: sanitizeLogicGroup(normalizeLogicGroup(field.requiredRules), field.id, allowedFieldIds),
  }));
}
