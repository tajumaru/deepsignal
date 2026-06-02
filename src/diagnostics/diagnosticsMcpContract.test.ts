import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("diagnostics MCP contract docs", () => {
  it("prohibits local MCP imports of browser app service modules", () => {
    const doc = readFileSync(resolve("docs/diagnostics-mcp-calling.md"), "utf8");

    expect(doc).toContain("`src/diagnostics/*` is browser app-side code only");
    expect(doc).toContain("local MCP servers must never import these modules directly");
    expect(doc).toContain("Local MCP v1 consumes only exported `DiagnosticsExportEnvelope` JSON files");
    expect(doc).toContain("- import `src/diagnostics/*`");
    expect(doc).toContain("- read browser localStorage");
    expect(doc).toContain("- read Walrus blobs directly");
    expect(doc).toContain("- read raw `Submission` records");
  });
});
