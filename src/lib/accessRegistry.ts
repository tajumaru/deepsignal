import { addressesMatch } from "./adminAccess";

export type AccessRole = "owner" | "admin" | "reviewer";

export interface RegistryRoleEntry {
  address: string;
  capId: string;
  role: AccessRole;
  status: "active";
}

export interface RegistrySnapshot {
  owner: RegistryRoleEntry | null;
  admins: RegistryRoleEntry[];
  reviewers: RegistryRoleEntry[];
}

type ObjectFields = Record<string, unknown>;

function normalizeObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function readNestedValue(source: unknown): unknown {
  if (!source || typeof source !== "object") {
    return source;
  }

  if (Array.isArray(source)) {
    return source;
  }

  const record = source as Record<string, unknown>;
  if ("id" in record && typeof record.id === "string") {
    return record.id;
  }
  if ("bytes" in record && typeof record.bytes === "string") {
    return record.bytes;
  }
  if ("fields" in record) {
    return readNestedValue(record.fields);
  }
  if ("value" in record) {
    return readNestedValue(record.value);
  }

  return source;
}

function readObjectId(source: unknown) {
  const value = readNestedValue(source);
  if (typeof value === "string") {
    return normalizeObjectId(value);
  }
  return "";
}

function readVectorItems(source: unknown): unknown[] {
  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  const record = source as Record<string, unknown>;
  if (Array.isArray(record.contents)) {
    return record.contents;
  }
  if (Array.isArray(record.items)) {
    return record.items;
  }
  if (record.fields && typeof record.fields === "object") {
    return readVectorItems(record.fields);
  }

  return [];
}

function parseEntry(role: AccessRole, fields: ObjectFields | null | undefined): RegistryRoleEntry | null {
  if (!fields) {
    return null;
  }

  const address = typeof fields.address === "string" ? normalizeObjectId(fields.address) : "";
  const capId = readObjectId(fields.cap_id);
  if (!address || !capId) {
    return null;
  }

  return {
    address,
    capId,
    role,
    status: "active",
  };
}

function parseEntries(role: Exclude<AccessRole, "owner">, source: unknown) {
  return readVectorItems(source)
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const fields = "fields" in (item as Record<string, unknown>)
        ? ((item as { fields?: ObjectFields }).fields ?? null)
        : (item as ObjectFields);
      return parseEntry(role, fields);
    })
    .filter((entry): entry is RegistryRoleEntry => Boolean(entry));
}

export function parseRegistrySnapshot(fields: ObjectFields | null | undefined): RegistrySnapshot {
  if (!fields) {
    return {
      owner: null,
      admins: [],
      reviewers: [],
    };
  }

  const owner = parseEntry("owner", {
    address: fields.owner_address,
    cap_id: fields.owner_cap_id,
  });

  return {
    owner,
    admins: parseEntries("admin", fields.admins),
    reviewers: parseEntries("reviewer", fields.reviewers),
  };
}

export function findRoleEntriesForAddress(
  snapshot: RegistrySnapshot | null | undefined,
  role: AccessRole,
  address?: string | null,
) {
  if (!snapshot || !address) {
    return [];
  }

  const source =
    role === "owner"
      ? snapshot.owner
        ? [snapshot.owner]
        : []
      : role === "admin"
        ? snapshot.admins
        : snapshot.reviewers;

  return source.filter((entry) => addressesMatch(entry.address, address));
}

