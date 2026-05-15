import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const shouldBuild = args.includes("--build");
const versionArg = args.find((arg) => !arg.startsWith("--"));
const version = versionArg?.replace(/^v/i, "");

function fail(message: string): never {
  console.error(message);
  console.error("Usage: npm run version:set -- 0.2.6");
  console.error("       npm run version:build -- 0.2.6");
  process.exit(1);
}

if (!version) {
  fail("Missing version.");
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Invalid version: ${version}`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function upsertEnvValue(path: string, key: string, value: string) {
  const current = readFileSync(path, "utf8");
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, "m").test(current)) {
    writeFileSync(path, current.replace(new RegExp(`^${key}=.*$`, "m"), line));
    return;
  }

  const storageLine = /^VITE_STORAGE_MODE=.*$/m;
  if (storageLine.test(current)) {
    writeFileSync(path, current.replace(storageLine, (match) => `${match}\n${line}`));
    return;
  }

  writeFileSync(path, `${line}\n${current}`);
}

function upsertPowerShellEnvValue(path: string, key: string, value: string) {
  const current = readFileSync(path, "utf8");
  const line = `$env:${key}="${value}"`;
  if (new RegExp(`^\\$env:${key}=.*$`, "m").test(current)) {
    writeFileSync(path, current.replace(new RegExp(`^\\$env:${key}=.*$`, "m"), line));
    return;
  }

  const appEnvLine = /^\$env:VITE_APP_ENV=.*$/m;
  if (appEnvLine.test(current)) {
    writeFileSync(path, current.replace(appEnvLine, (match) => `${match}\n${line}`));
    return;
  }

  writeFileSync(path, `${line}\n${current}`);
}

type PackageJson = {
  version?: string;
  scripts?: Record<string, string>;
};

type PackageLockJson = {
  version?: string;
  packages?: Record<string, { version?: string }>;
};

const packageJsonPath = resolve(root, "package.json");
const packageLockPath = resolve(root, "package-lock.json");

const packageJson = readJson<PackageJson>(packageJsonPath);
packageJson.version = version;
writeJson(packageJsonPath, packageJson);

const packageLock = readJson<PackageLockJson>(packageLockPath);
packageLock.version = version;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = version;
}
writeJson(packageLockPath, packageLock);

upsertEnvValue(resolve(root, ".env"), "VITE_APP_VERSION", version);
upsertEnvValue(resolve(root, ".env.example"), "VITE_APP_VERSION", version);
upsertPowerShellEnvValue(resolve(root, "version.txt"), "VITE_APP_VERSION", version);

console.log(`DeepSignal version set to v${version}.`);

if (shouldBuild) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "build"], {
    cwd: root,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status ?? 1);
}
