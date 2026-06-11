import { normalizeSuiAddress } from "./suiAddress";

export type OwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
    owner?: unknown;
    content?: {
      dataType?: string;
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

export type StructTypeBreakdown = {
  rawType: string;
  normalizedType: string;
  packageId: string;
  module: string;
  struct: string;
  generics: string[];
};

function splitGenericArguments(value: string) {
  const generics: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "<") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ">") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        generics.push(trimmed);
      }
      current = "";
      continue;
    }
    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    generics.push(trimmed);
  }

  return generics;
}

function normalizeStructTagLightweight(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const [packageId = "", module = "", ...rest] = trimmed.split("::");
  if (!packageId || !module || rest.length === 0) {
    return trimmed.toLowerCase();
  }

  const structAndGenerics = rest.join("::").trim();
  const genericStartIndex = structAndGenerics.indexOf("<");
  const hasGenerics = genericStartIndex >= 0 && structAndGenerics.endsWith(">");
  const structName = (hasGenerics ? structAndGenerics.slice(0, genericStartIndex) : structAndGenerics).trim();
  const genericContent = hasGenerics ? structAndGenerics.slice(genericStartIndex + 1, -1) : "";
  const normalizedGenerics = genericContent
    ? splitGenericArguments(genericContent).map((entry) => normalizeStructType(entry))
    : [];

  const normalizedAddress = normalizeSuiAddress(packageId).toLowerCase();
  const normalizedModule = module.trim().toLowerCase();
  const normalizedStruct = structName.trim();
  const genericSuffix = normalizedGenerics.length > 0 ? `<${normalizedGenerics.join(",")}>` : "";

  return `${normalizedAddress}::${normalizedModule}::${normalizedStruct}${genericSuffix}`;
}

export function normalizeSuiTypeName(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  return normalizeStructTagLightweight(trimmed);
}

export function normalizeSuiType(value?: string | null) {
  return normalizeSuiTypeName(value);
}

export function normalizeStructType(value?: string | null) {
  return normalizeSuiTypeName(value);
}

export function breakdownStructType(value?: string | null): StructTypeBreakdown {
  const rawType = value?.trim() ?? "";
  const normalizedType = normalizeStructType(rawType);
  if (!normalizedType) {
    return {
      rawType,
      normalizedType,
      packageId: "",
      module: "",
      struct: "",
      generics: [],
    };
  }

  const [packageId = "", module = "", structAndGenerics = ""] = normalizedType.split("::");
  const genericStartIndex = structAndGenerics.indexOf("<");
  const hasGenerics = genericStartIndex >= 0 && structAndGenerics.endsWith(">");
  const struct = hasGenerics ? structAndGenerics.slice(0, genericStartIndex) : structAndGenerics;
  const genericContent = hasGenerics ? structAndGenerics.slice(genericStartIndex + 1, -1) : "";

  return {
    rawType,
    normalizedType,
    packageId,
    module,
    struct,
    generics: genericContent ? splitGenericArguments(genericContent) : [],
  };
}

export function matchesOwnedObjectType(actualType: string | undefined, requiredType: string) {
  const normalizedActualType = normalizeStructType(actualType);
  const normalizedRequiredType = normalizeStructType(requiredType);
  if (!normalizedActualType || !normalizedRequiredType) {
    return false;
  }
  return normalizedActualType === normalizedRequiredType;
}

export function filterOwnedObjectsByType(entries: OwnedObjectEntry[], requiredTypes: string[]) {
  const normalizedRequiredTypes = new Set(requiredTypes.map((value) => normalizeStructType(value)).filter(Boolean));
  if (normalizedRequiredTypes.size === 0) {
    return entries;
  }
  return entries.filter((entry) => normalizedRequiredTypes.has(normalizeStructType(entry.data?.type)));
}
