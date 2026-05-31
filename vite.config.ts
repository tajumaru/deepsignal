import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";

type PackageMetadata = {
  version?: string;
};

const testSetupFile = fileURLToPath(new URL("./src/test/setup.ts", import.meta.url));

function formatBuildTime(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join(".") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function getGitHash() {
  try {
    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    try {
      execSync("git diff --quiet -- .", { stdio: "ignore" });
      execSync("git diff --cached --quiet -- .", { stdio: "ignore" });
      return hash;
    } catch {
      return `${hash}-dirty`;
    }
  } catch {
    return "local";
  }
}

function buildManifestPlugin(args: {
  appVersion: string;
  buildTime: string;
  gitHash: string;
  appEnvironment: string;
}): Plugin {
  const routeChunkMatchers = {
    admin: /\/src\/pages\/AdminDashboardPage\.tsx$/,
    create: /\/src\/pages\/FormBuilderPage\.tsx$/,
    access: /\/src\/pages\/AccessManagementPage\.tsx$/,
    explore: /\/src\/pages\/ExploreSignalsPage\.tsx$/,
    publicForm: /\/src\/pages\/PublicFormPage\.tsx$/,
    publicRoadmap: /\/src\/pages\/PublicRoadmapPage\.tsx$/,
    manifestRestore: /\/src\/pages\/ManifestRestorePage\.tsx$/,
    submissionDetail: /\/src\/pages\/SubmissionDetailPage\.tsx$/,
    troubleshooting: /\/src\/pages\/TroubleshootingPage\.tsx$/,
    insightsFixture: /\/src\/pages\/InsightsFixturePage\.tsx$/,
    landing: /\/src\/pages\/LandingPage\.tsx$/,
    zkloginCallback: /\/src\/pages\/ZkLoginCallbackPage\.tsx$/,
  } as const;

  const routeChunkFilePrefixes: Record<keyof typeof routeChunkMatchers, string> = {
    access: "AccessManagementPage",
    admin: "AdminDashboardPage",
    create: "FormBuilderPage",
    explore: "ExploreSignalsPage",
    insightsFixture: "InsightsFixturePage",
    landing: "LandingPage",
    manifestRestore: "ManifestRestorePage",
    publicForm: "PublicFormPage",
    publicRoadmap: "PublicRoadmapPage",
    submissionDetail: "SubmissionDetailPage",
    troubleshooting: "TroubleshootingPage",
    zkloginCallback: "ZkLoginCallbackPage",
  };

  type RouteKey = keyof typeof routeChunkMatchers;

  return {
    name: "deepsignal-build-manifest",
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle).filter((entry): entry is import("rollup").OutputChunk => entry.type === "chunk");
      const chunkByFileName = new Map(chunks.map((entry) => [`./${entry.fileName}`, entry]));
      const bundleAssetNames = new Set(Object.values(bundle).map((entry) => `./${entry.fileName}`));
      const entryChunk = chunks.find((entry) => entry.isEntry);
      const entryAsset = entryChunk ? `./${entryChunk.fileName}` : null;

      const collectChunkAssets = (
        chunkFileName: string,
        options: { includeDynamicImports?: boolean } = {},
        seen = new Set<string>(),
      ) => {
        if (seen.has(chunkFileName)) {
          return [];
        }
        seen.add(chunkFileName);

        const chunk = chunkByFileName.get(chunkFileName);
        if (!chunk) {
          return [];
        }

        const viteMetadata = (chunk as import("rollup").OutputChunk & {
          viteMetadata?: { importedCss?: Set<string> };
        }).viteMetadata;
        const dynamicImports = options.includeDynamicImports === false ? [] : chunk.dynamicImports;
        const directAssets = [
          chunkFileName,
          ...chunk.imports.map((fileName) => `./${fileName}`),
          ...dynamicImports.map((fileName) => `./${fileName}`),
          ...(viteMetadata?.importedCss ? Array.from(viteMetadata.importedCss).map((fileName) => `./${fileName}`) : []),
        ].filter((assetPath) => bundleAssetNames.has(assetPath));

        const nestedAssets = [...chunk.imports, ...dynamicImports].flatMap((fileName) =>
          collectChunkAssets(`./${fileName}`, options, seen),
        );

        return Array.from(new Set([...directAssets, ...nestedAssets]));
      };

      const routeAssets = Object.entries(routeChunkMatchers).reduce<Record<RouteKey, string[]>>((accumulator, [key, matcher]) => {
        const routeKey = key as RouteKey;
        const routeChunk =
          chunks.find((entry) => matcher.test((entry.facadeModuleId ?? "").replace(/\\/g, "/"))) ??
          chunks.find((entry) => entry.fileName.split("/").pop()?.startsWith(`${routeChunkFilePrefixes[routeKey]}-`));
        const routeChunkAssets = routeChunk ? collectChunkAssets(`./${routeChunk.fileName}`) : [];
        accumulator[routeKey] = Array.from(
          new Set([
            ...(entryChunk ? collectChunkAssets(`./${entryChunk.fileName}`, { includeDynamicImports: false }) : []),
            ...routeChunkAssets,
          ]),
        );
        return accumulator;
      }, {
        admin: [],
        create: [],
        access: [],
        explore: [],
        publicForm: [],
        publicRoadmap: [],
        manifestRestore: [],
        submissionDetail: [],
        troubleshooting: [],
        insightsFixture: [],
        landing: [],
        zkloginCallback: [],
      });

      const assets = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => fileName.endsWith(".js") || fileName.endsWith(".css"))
        .map((fileName) => `./${fileName}`)
        .sort();

      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: `${JSON.stringify({ ...args, assets, entryAsset, routeAssets }, null, 2)}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ ...args }, null, 2)}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: [
          "/",
          "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
          "/index.html",
          "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
          "/build.json",
          "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
          "/version.json",
          "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
          "/service-worker.js",
          "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
          "/assets/*",
          "  Cache-Control: public, max-age=31536000, immutable",
          "",
        ].join("\n"),
      });
    },
    closeBundle() {
      const distDir = join(process.cwd(), "dist");
      const assetsDir = join(distDir, "assets");
      const manifestPath = join(process.cwd(), "dist", "build.json");
      if (!existsSync(manifestPath)) {
        return;
      }

      const replaceChunkReferences = (oldName: string, newName: string) => {
        const replaceReferences = (filePath: string) => {
          if (!existsSync(filePath)) {
            return;
          }
          const source = readFileSync(filePath, "utf8");
          if (source.includes(oldName)) {
            writeFileSync(filePath, source.split(oldName).join(newName));
          }
        };

        if (existsSync(assetsDir)) {
          for (const fileName of readdirSync(assetsDir)) {
            if (fileName.endsWith(".js")) {
              replaceReferences(join(assetsDir, fileName));
            }
          }
        }
        replaceReferences(join(distDir, "index.html"));
        replaceReferences(manifestPath);
      };

      const saltAndRenameChunk = (fileName: string | undefined, label: string) => {
        if (!fileName || !existsSync(assetsDir) || !fileName.endsWith(".js")) {
          return;
        }
        const oldName = fileName.split("/").pop();
        if (!oldName) {
          return;
        }
        const oldPath = join(assetsDir, oldName);
        if (!existsSync(oldPath)) {
          return;
        }
        const stem = oldName.replace(/\.js$/, "");
        const prefix = stem.slice(0, stem.lastIndexOf("-"));
        if (!prefix) {
          return;
        }
        const saltedCode = `${readFileSync(oldPath, "utf8")}\n/* deepsignal-${label}-build:${args.buildTime}:${args.gitHash} */\n`;
        const saltedHash = createHash("sha256").update(saltedCode).digest("base64url").slice(0, 8);
        const newName = `${prefix}-${saltedHash}.js`;
        if (newName === oldName) {
          return;
        }
        writeFileSync(join(assetsDir, newName), saltedCode);
        unlinkSync(oldPath);
        replaceChunkReferences(oldName, newName);
      };

      const addReleaseSuffixToAllJsChunks = () => {
        if (!existsSync(assetsDir)) {
          return;
        }
        const releaseSuffix = createHash("sha256")
          .update(`${args.appVersion}:${args.buildTime}:${args.gitHash}`)
          .digest("base64url")
          .slice(0, 6);
        const jsFiles = readdirSync(assetsDir)
          .filter((fileName) => fileName.endsWith(".js") && !fileName.includes(`-${releaseSuffix}.js`))
          .sort();
        const renamePairs = jsFiles
          .map((oldName) => {
            const newName = oldName.replace(/\.js$/, `-${releaseSuffix}.js`);
            return { oldName, newName };
          })
          .filter(({ oldName, newName }) => oldName !== newName && !existsSync(join(assetsDir, newName)));

        for (const { oldName, newName } of renamePairs) {
          writeFileSync(join(assetsDir, newName), readFileSync(join(assetsDir, oldName), "utf8"));
          unlinkSync(join(assetsDir, oldName));
        }
        for (const { oldName, newName } of renamePairs) {
          replaceChunkReferences(oldName, newName);
        }
      };

      if (existsSync(assetsDir)) {
        const manifestBeforeSalt = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          entryAsset?: string | null;
          routeAssets?: Record<string, string[]>;
        };
        saltAndRenameChunk(manifestBeforeSalt.entryAsset ?? undefined, "entry");
        saltAndRenameChunk(
          readdirSync(assetsDir).find((fileName) => /^mysten-sui-[\w-]+\.js$/.test(fileName)),
          "mysten-sui",
        );
        for (const [routeKey, filePrefix] of [
          ["admin", "AdminDashboardPage"],
          ["create", "FormBuilderPage"],
        ] as const) {
          const routeChunk = manifestBeforeSalt.routeAssets?.[routeKey]?.find((assetPath) =>
            assetPath.split("/").pop()?.startsWith(`${filePrefix}-`),
          );
          saltAndRenameChunk(routeChunk, `route-${routeKey}`);
        }
        addReleaseSuffixToAllJsChunks();
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        assets?: string[];
        routeAssets?: Record<string, string[]>;
      };
      const assetExists = (assetPath: string) => existsSync(join(process.cwd(), "dist", assetPath.replace(/^\.\//, "")));
      const filterExistingAssets = (assetPaths: string[] | undefined) =>
        Array.from(new Set((assetPaths ?? []).filter((assetPath) => assetExists(assetPath))));

      manifest.assets = filterExistingAssets(manifest.assets);
      if (manifest.routeAssets) {
        manifest.routeAssets = Object.fromEntries(
          Object.entries(manifest.routeAssets).map(([key, assetPaths]) => [key, filterExistingAssets(assetPaths)]),
        );
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

function moduleEntryRetryPlugin(args: { appVersion: string; buildTime: string; gitHash: string }): Plugin {
  return {
    name: "deepsignal-module-entry-retry",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const entryScriptPattern = /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+)")[^>]*>\s*<\/script>/;
        const match = html.match(entryScriptPattern);
        const entrySrc = match?.[1];
        if (!match || !entrySrc) {
          return html;
        }

        const retryLoader = `<script type="module">
      (() => {
        const entryPath = ${JSON.stringify(entrySrc)};
        const maxAttempts = 3;
        const baseDelayMs = 500;
        const retryStorageKey = "deepsignal.moduleEntryRetry";
        const statusNode = document.querySelector("[data-boot-status]");
        const bootShell = document.querySelector(".boot-shell");
        const failures = [];
        let latestEntryPathPromise = null;

        function redirectLegacyPublicPathToHashRoute() {
          if (window.location.hash) {
            return;
          }
          const { pathname, search } = window.location;
          const legacyRoutePrefixes = ["/admin", "/f/", "/roadmap/", "/m/", "/auth/zklogin/"];
          if (!legacyRoutePrefixes.some((prefix) => pathname.startsWith(prefix))) {
            return;
          }
          window.history.replaceState(null, "", "/#" + pathname + search);
        }

        redirectLegacyPublicPathToHashRoute();

        function setBootStatus(message) {
          if (statusNode) {
            statusNode.textContent = message;
          }
        }

        function getRetryState() {
          try {
            const parsed = JSON.parse(window.sessionStorage.getItem(retryStorageKey) || "{}");
            return {
              count: Number.isFinite(parsed.count) ? parsed.count : 0,
              startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
            };
          } catch {
            return { count: 0, startedAt: Date.now() };
          }
        }

        function rememberRetryState(state) {
          try {
            window.sessionStorage.setItem(retryStorageKey, JSON.stringify(state));
          } catch {
            // Diagnostics are best effort when Safari private mode blocks storage.
          }
        }

        function getDiagnostics(error) {
          const entryUrl = new URL(entryPath, window.location.href).toString();
          const chunkUrl = String(error?.message || error || "").match(/https?:\\/\\/[^\\s)'"]+/)?.[0] || entryUrl;
          return {
            errorName: error?.name || "Error",
            errorMessage: error?.message || String(error || "Unknown module entry failure"),
            stack: error?.stack || "",
            routePath: window.location.hash?.replace(/^#/, "") || window.location.pathname + window.location.search,
            routeId: window.location.hash?.startsWith("#/f/") ? "public-form" : window.location.hash?.startsWith("#/admin") ? "admin" : window.location.hash?.startsWith("#/explore") ? "explore" : "boot",
            buildVersion: ${JSON.stringify(args.appVersion)},
            buildTime: ${JSON.stringify(args.buildTime)},
            gitHash: ${JSON.stringify(args.gitHash)},
            userAgent: navigator.userAgent,
            chunkUrl,
            providerReadiness: window.__DEEPSIGNAL_DEBUG__?.providerReadiness || {},
            storageMode: "unknown-before-react",
            selectedProjectId: "unknown-before-react",
            latestEntryPathResolved: latestEntryPathPromise ? "requested" : "not-requested",
            failures: failures.map((failure) => ({
              errorName: failure.errorName,
              errorMessage: failure.errorMessage,
              chunkUrl: failure.chunkUrl,
              recordedAt: failure.recordedAt,
            })),
            recordedAt: new Date().toISOString(),
          };
        }

        async function updateDeepSignal() {
          let latestBuild = {
            appVersion: ${JSON.stringify(args.appVersion)},
            buildTime: ${JSON.stringify(args.buildTime)},
            gitHash: ${JSON.stringify(args.gitHash)},
          };
          try {
            const response = await fetch(new URL("./build.json", window.location.href).toString(), {
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            });
            if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
              latestBuild = await response.json();
            }
          } catch {
            // Keep the embedded build metadata as a fallback.
          }

          const latestBuildVersion = [
            latestBuild.appVersion || "unknown",
            latestBuild.buildTime || "unknown",
            latestBuild.gitHash || "unknown",
          ].join("|");
          try {
            window.sessionStorage.setItem("deepsignal.buildUpdate.attempt", JSON.stringify({
              currentBuildVersion: [
                ${JSON.stringify(args.appVersion)},
                ${JSON.stringify(args.buildTime)},
                ${JSON.stringify(args.gitHash)},
              ].join("|"),
              latestBuildVersion,
              attemptedAt: Date.now(),
            }));
            [
              retryStorageKey,
              "deepsignal.chunkLoadRecovery",
              "deepsignal.mixedBuildRecovery",
              "deepsignal.observedBuildAssets",
              "deepsignal:lastExploreError",
            ].forEach((key) => window.sessionStorage.removeItem(key));
          } catch {
            // Best effort only.
          }
          let cacheNamesBefore = [];
          let cacheNamesAfter = [];
          try {
            if ("caches" in window) {
              cacheNamesBefore = await window.caches.keys();
              await Promise.all(
                cacheNamesBefore
                  .filter((key) => key.toLowerCase().includes("deepsignal"))
                  .map((key) => window.caches.delete(key)),
              );
              cacheNamesAfter = await window.caches.keys();
            }
          } catch {
            // Cache cleanup is best effort; the cache-busted navigation is the recovery path.
          }
          try {
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map(async (registration) => {
                await registration.update().catch(() => undefined);
                if (registration.waiting) {
                  registration.waiting.postMessage({ type: "SKIP_WAITING" });
                }
              }));
            }
          } catch {
            // Service worker cleanup is best effort.
          }
          console.info("[DeepSignal update]", {
            currentBuildVersion: [
              ${JSON.stringify(args.appVersion)},
              ${JSON.stringify(args.buildTime)},
              ${JSON.stringify(args.gitHash)},
            ].join("|"),
            latestBuildVersion,
            buildTime: latestBuild.buildTime || "unknown",
            gitHash: latestBuild.gitHash || "unknown",
            serviceWorkerControllerState: navigator.serviceWorker?.controller?.state || "none",
            cacheNamesBefore,
            cacheNamesAfter,
            updateAttempted: true,
            updateSucceeded: false,
            mixedBuildAssetsDetected: false,
          });
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("v", latestBuild.appVersion || ${JSON.stringify(args.appVersion)});
          nextUrl.searchParams.set("t", String(Date.now()));
          window.location.replace(nextUrl.toString());
        }

        function ensureRecoveryActions(error) {
          if (!bootShell || bootShell.querySelector("[data-boot-recovery]")) {
            return;
          }
          const diagnostics = getDiagnostics(error);
          console.error("DeepSignal module entry failed to load.", diagnostics);
          const actions = document.createElement("div");
          actions.dataset.bootRecovery = "true";
          actions.style.display = "flex";
          actions.style.gap = "0.75rem";
          actions.style.flexWrap = "wrap";
          actions.style.justifyContent = "center";

          const title = document.createElement("div");
          title.style.width = "100%";
          title.style.textAlign = "center";
          title.innerHTML = "<strong>New version available</strong><br><span>DeepSignal has been updated. Load the latest version.</span>";

          const updateButton = document.createElement("button");
          updateButton.type = "button";
          updateButton.textContent = "Update DeepSignal";
          updateButton.style.padding = "0.8rem 1rem";
          updateButton.style.borderRadius = "999px";
          updateButton.style.border = "1px solid rgba(138, 223, 255, 0.28)";
          updateButton.style.background = "rgba(138, 223, 255, 0.14)";
          updateButton.style.color = "#ecfdff";
          updateButton.onclick = () => {
            updateButton.disabled = true;
            updateButton.textContent = "Updating...";
            void updateDeepSignal();
          };

          const details = document.createElement("details");
          details.open = true;
          details.style.width = "100%";
          details.style.maxWidth = "44rem";
          details.style.textAlign = "left";
          const summary = document.createElement("summary");
          summary.textContent = "Load diagnostics";
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(diagnostics, null, 2);
          pre.style.whiteSpace = "pre-wrap";
          pre.style.overflowWrap = "anywhere";
          pre.style.maxHeight = "18rem";
          pre.style.overflow = "auto";
          pre.style.padding = "0.85rem";
          pre.style.border = "1px solid rgba(138, 223, 255, 0.24)";
          pre.style.borderRadius = "0.75rem";
          pre.style.background = "rgba(0, 0, 0, 0.28)";
          details.appendChild(summary);
          details.appendChild(pre);

          actions.appendChild(title);
          actions.appendChild(updateButton);
          bootShell.appendChild(actions);
          bootShell.appendChild(details);
        }

        function delay(ms) {
          return new Promise((resolve) => window.setTimeout(resolve, ms));
        }

        async function getLatestEntryPath() {
          if (!latestEntryPathPromise) {
            latestEntryPathPromise = fetch(new URL("./build.json", window.location.href).toString(), {
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            })
              .then(async (response) => {
                if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
                  return null;
                }
                const manifest = await response.json();
                return typeof manifest.entryAsset === "string" && manifest.entryAsset.endsWith(".js")
                  ? manifest.entryAsset
                  : null;
              })
              .catch(() => null);
          }
          return latestEntryPathPromise;
        }

        async function loadEntry(attempt = 1) {
          const latestEntryPath = attempt > 1 ? await getLatestEntryPath() : null;
          const url = new URL(latestEntryPath || entryPath, window.location.href);
          if (attempt > 1) {
            url.searchParams.set("module-retry", String(Date.now()));
            setBootStatus("Retrying signal surface load...");
          }

          try {
            await import(url.toString());
          } catch (error) {
            failures.push(getDiagnostics(error));
            if (attempt >= maxAttempts) {
              setBootStatus("Signal surface load failed. App update or asset propagation issue detected.");
              ensureRecoveryActions(error);
              return;
            }

            await delay(baseDelayMs * attempt);
            await loadEntry(attempt + 1);
          }
        }

        void loadEntry();
      })();
    </script>`;

        const withoutEntryScript = html.replace(match[0], "");
        if (withoutEntryScript.includes("</body>")) {
          return withoutEntryScript.replace("</body>", `${retryLoader}\n  </body>`);
        }

        return `${withoutEntryScript}\n${retryLoader}`;
      },
    },
  };
}

const packageMetadata = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as PackageMetadata;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appVersion = process.env.VITE_APP_VERSION || env.VITE_APP_VERSION || packageMetadata.version || "0.0.0";
  const buildTime = process.env.VITE_BUILD_TIME || env.VITE_BUILD_TIME || formatBuildTime();
  const gitHash = process.env.VITE_GIT_HASH || env.VITE_GIT_HASH || getGitHash();
  const appEnvironment =
    process.env.VITE_APP_ENV || env.VITE_APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || mode || "dev";
  const tatumApiKey = process.env.TATUM_API_KEY || env.TATUM_API_KEY || "";
  const configuredRpcUrl =
    env.NEXT_PUBLIC_SUI_RPC_URL || env.VITE_SUI_FULLNODE_URL || env.VITE_RPC_URL || "";
  const tatumEnabled = String(env.NEXT_PUBLIC_TATUM_ENABLED || "").toLowerCase() === "true";
  const tatumStorageEnabled = String(env.NEXT_PUBLIC_TATUM_STORAGE_ENABLED || "").toLowerCase() === "true";
  const tatumProxyEnabled = Boolean(
    tatumEnabled &&
      configuredRpcUrl &&
      configuredRpcUrl.includes("gateway.tatum.io") &&
      tatumApiKey,
  );
  const tatumProxyPath = "/api/tatum/sui-rpc";
  const tatumStorageProxyEnabled = Boolean(tatumStorageEnabled && tatumApiKey);
  const tatumStorageProxyPath = "/api/tatum/storage";

  return {
    base: "./",
    assetsInclude: ["**/*.wasm"],
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
      "import.meta.env.VITE_GIT_HASH": JSON.stringify(gitHash),
      "import.meta.env.VITE_APP_ENV": JSON.stringify(appEnvironment),
      "import.meta.env.VITE_TATUM_PROXY_ENABLED": JSON.stringify(tatumProxyEnabled ? "true" : "false"),
      "import.meta.env.VITE_TATUM_PROXY_PATH": JSON.stringify(tatumProxyPath),
      "import.meta.env.VITE_TATUM_STORAGE_PROXY_ENABLED": JSON.stringify(tatumStorageProxyEnabled ? "true" : "false"),
      "import.meta.env.VITE_TATUM_STORAGE_PROXY_PATH": JSON.stringify(tatumStorageProxyPath),
    },
    plugins: [
      react(),
      buildManifestPlugin({
        appVersion,
        buildTime,
        gitHash,
        appEnvironment,
      }),
      moduleEntryRetryPlugin({ appVersion, buildTime, gitHash }),
      process.env.ANALYZE === "true"
        ? visualizer({
            emitFile: true,
            filename: "bundle-analysis.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          })
        : null,
    ].filter(Boolean),
    build: {
      modulePreload: {
        resolveDependencies(_, deps) {
          return deps.filter((dependency) => {
            const normalizedDependency = dependency.replace(/\\/g, "/");
            return !/assets\/mysten-(sui|wallet|walrus)-[^/]+\.(js|css)$/.test(normalizedDependency);
          });
        },
      },
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames(assetInfo) {
            const name = assetInfo.name ?? "";
            if (name.endsWith(".css")) {
              return "assets/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (!normalizedId.includes("node_modules")) {
              return undefined;
            }
            if (normalizedId.includes("/qrcode/")) {
              return "qrcode";
            }
            if (normalizedId.includes("/@tiptap/") || normalizedId.includes("/prosemirror-")) {
              return "editor";
            }
            if (
              normalizedId.includes("/@mysten/dapp-kit/") ||
              normalizedId.includes("/@mysten/wallet-standard/") ||
              normalizedId.includes("/@wallet-standard/") ||
              normalizedId.includes("/window-wallet-core/") ||
              normalizedId.includes("/slush-wallet/") ||
              normalizedId.includes("/@radix-ui/") ||
              normalizedId.includes("/react-remove-scroll") ||
              normalizedId.includes("/react-style-singleton/") ||
              normalizedId.includes("/use-sidecar/") ||
              normalizedId.includes("/use-callback-ref/") ||
              normalizedId.includes("/detect-node-es/") ||
              normalizedId.includes("/aria-hidden/") ||
              normalizedId.includes("/get-nonce/") ||
              normalizedId.includes("/jose/")
            ) {
              return "mysten-wallet";
            }
            if (normalizedId.includes("/@mysten/walrus")) {
              return "mysten-walrus";
            }
            if (normalizedId.includes("/@mysten/seal/")) {
              return "mysten-seal";
            }
            if (normalizedId.includes("/@noble/curves/")) {
              return "noble-curves";
            }
            if (normalizedId.includes("/@noble/hashes/")) {
              return "noble-hashes";
            }
            if (normalizedId.includes("/@scure/")) {
              return "scure";
            }
            if (normalizedId.includes("/@mysten/sui/")) {
              return "mysten-sui";
            }
            if (normalizedId.includes("/@tanstack/")) {
              return "tanstack";
            }
            if (
              normalizedId.includes("/react-router/") ||
              normalizedId.includes("/react-router-dom/") ||
              normalizedId.includes("/@remix-run/router/")
            ) {
              return "router";
            }
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) {
              return "react-vendor";
            }
            return undefined;
          },
        },
      },
    },
    server: tatumProxyEnabled || tatumStorageProxyEnabled
      ? {
          proxy: {
            ...(tatumProxyEnabled
              ? {
                  [tatumProxyPath]: {
                    target: configuredRpcUrl,
                    changeOrigin: true,
                    rewrite: () => "",
                    headers: {
                      "x-api-key": tatumApiKey,
                    },
                  },
                }
              : {}),
            ...(tatumStorageProxyEnabled
              ? {
                  [tatumStorageProxyPath]: {
                    target: env.VITE_TATUM_STORAGE_API_URL || "https://api.tatum.io",
                    changeOrigin: true,
                    rewrite: (path) => path.replace(new RegExp(`^${tatumStorageProxyPath}`), ""),
                    headers: {
                      "x-api-key": tatumApiKey,
                    },
                  },
                }
              : {}),
          },
        }
      : undefined,
    preview: tatumProxyEnabled || tatumStorageProxyEnabled
      ? {
          proxy: {
            ...(tatumProxyEnabled
              ? {
                  [tatumProxyPath]: {
                    target: configuredRpcUrl,
                    changeOrigin: true,
                    rewrite: () => "",
                    headers: {
                      "x-api-key": tatumApiKey,
                    },
                  },
                }
              : {}),
            ...(tatumStorageProxyEnabled
              ? {
                  [tatumStorageProxyPath]: {
                    target: env.VITE_TATUM_STORAGE_API_URL || "https://api.tatum.io",
                    changeOrigin: true,
                    rewrite: (path) => path.replace(new RegExp(`^${tatumStorageProxyPath}`), ""),
                    headers: {
                      "x-api-key": tatumApiKey,
                    },
                  },
                }
              : {}),
          },
        }
      : undefined,
    optimizeDeps: {
      include: [
        "@mysten/dapp-kit",
        "@vanilla-extract/css",
        "@vanilla-extract/recipes",
        "dataloader",
        "deepmerge",
        "picocolors",
        "poseidon-lite",
      ],
      exclude: [
        "@mysten/walrus",
        "@mysten/seal",
        "@mysten/suins",
      ],
    },
    test: {
      environment: "jsdom",
      fileParallelism: false,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.tmp-test/**",
        "**/move/**",
        "**/ci-run-verify/**",
        "**/.ci-run-verify/**",
        "**/.ci-verify/**",
        "**/.ci-cache/**",
        "**/tests/e2e/**",
      ],
      setupFiles: [testSetupFile],
    },
  };
});
