import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  type RouteKey = keyof typeof routeChunkMatchers;

  return {
    name: "deepsignal-build-manifest",
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle).filter((entry): entry is import("rollup").OutputChunk => entry.type === "chunk");
      const chunkByFileName = new Map(chunks.map((entry) => [`./${entry.fileName}`, entry]));
      const entryChunk = chunks.find((entry) => entry.isEntry);

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
        ];

        const nestedAssets = [...chunk.imports, ...dynamicImports].flatMap((fileName) =>
          collectChunkAssets(`./${fileName}`, options, seen),
        );

        return Array.from(new Set([...directAssets, ...nestedAssets]));
      };

      const routeAssets = Object.entries(routeChunkMatchers).reduce<Record<RouteKey, string[]>>((accumulator, [key, matcher]) => {
        const routeChunk = chunks.find((entry) => matcher.test(entry.facadeModuleId ?? ""));
        const routeChunkAssets = routeChunk ? collectChunkAssets(`./${routeChunk.fileName}`) : [];
        accumulator[key as RouteKey] = Array.from(
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
        source: `${JSON.stringify({ ...args, assets, routeAssets }, null, 2)}\n`,
      });
    },
  };
}

const stableRouteChunkNames = new Set([
  "AccessManagementPage",
  "AdminDashboardPage",
  "ExploreSignalsPage",
  "FormBuilderPage",
  "InsightsFixturePage",
  "LandingPage",
  "ManifestRestorePage",
  "PublicFormPage",
  "PublicRoadmapPage",
  "SubmissionDetailPage",
  "TroubleshootingPage",
  "ZkLoginCallbackPage",
]);

const legacyRouteChunkAliases: Record<string, string[]> = {
  AccessManagementPage: [
    "assets/AccessManagementPage.js",
    "assets/AccessManagementPage-CSeuxvX2.js",
    "assets/AccessManagementPage-CAPTb-az.js",
    "assets/AccessManagementPage-jVe5Mcsa.js",
  ],
  AdminDashboardPage: [
    "assets/AdminDashboardPage.js",
    "assets/AdminDashboardPage-Bbo7vv5M.js",
    "assets/AdminDashboardPage-DfHbkZAu.js",
    "assets/AdminDashboardPage-BtVfnsTy.js",
    "assets/AdminDashboardPage-B0lmleJK.js",
  ],
  ExploreSignalsPage: [
    "assets/ExploreSignalsPage.js",
    "assets/ExploreSignalsPage-BPg7Mrle.js",
    "assets/ExploreSignalsPage-BN9oWPM0.js",
  ],
  FormBuilderPage: [
    "assets/FormBuilderPage.js",
    "assets/FormBuilderPage-bcqJbN29.js",
    "assets/FormBuilderPage-D5n4eR7-.js",
    "assets/FormBuilderPage-Dlmy74MG.js",
  ],
  InsightsFixturePage: [
    "assets/InsightsFixturePage.js",
    "assets/InsightsFixturePage-DuhWu7pb.js",
    "assets/InsightsFixturePage-BIkiBFcv.js",
    "assets/InsightsFixturePage-BT4tfiPt.js",
  ],
  LandingPage: [
    "assets/LandingPage.js",
    "assets/LandingPage-Cdsd6Oo8.js",
    "assets/LandingPage-rXbw_nLO.js",
    "assets/LandingPage-BCD0HegF.js",
  ],
  ManifestRestorePage: [
    "assets/ManifestRestorePage.js",
    "assets/ManifestRestorePage-CzUbBjXs.js",
    "assets/ManifestRestorePage-Du989zCe.js",
    "assets/ManifestRestorePage-BUveDc6H.js",
  ],
  PublicFormPage: [
    "assets/PublicFormPage.js",
    "assets/PublicFormPage-BclHuSj0.js",
    "assets/PublicFormPage-D2OorI5I.js",
    "assets/PublicFormPage-DX-F7Xcc.js",
  ],
  PublicRoadmapPage: [
    "assets/PublicRoadmapPage.js",
    "assets/PublicRoadmapPage-B0hW9juC.js",
    "assets/PublicRoadmapPage-1t86ItGQ.js",
    "assets/PublicRoadmapPage-COCCj_b1.js",
  ],
  SubmissionDetailPage: [
    "assets/SubmissionDetailPage.js",
    "assets/SubmissionDetailPage-DNed8nR4.js",
    "assets/SubmissionDetailPage-kg2K8htr.js",
    "assets/SubmissionDetailPage-FLd6ARUR.js",
  ],
  TroubleshootingPage: [
    "assets/TroubleshootingPage.js",
    "assets/TroubleshootingPage-y87iuIVb.js",
    "assets/TroubleshootingPage-jgex8ydS.js",
    "assets/TroubleshootingPage-BKCuiI4R.js",
  ],
  ZkLoginCallbackPage: [
    "assets/ZkLoginCallbackPage.js",
    "assets/ZkLoginCallbackPage-Cgdj0iMR.js",
    "assets/ZkLoginCallbackPage-DlL65jfs.js",
    "assets/ZkLoginCallbackPage-DQEJpkvt.js",
  ],
};

const routeChunkExportNames: Record<string, string> = {
  AccessManagementPage: "AccessManagementPage",
  AdminDashboardPage: "AdminDashboardPage",
  ExploreSignalsPage: "ExploreSignalsPage",
  FormBuilderPage: "FormBuilderPage",
  InsightsFixturePage: "InsightsFixturePage",
  LandingPage: "LandingPage",
  ManifestRestorePage: "ManifestRestorePage",
  PublicFormPage: "PublicFormPage",
  PublicRoadmapPage: "PublicRoadmapPage",
  SubmissionDetailPage: "SubmissionDetailPage",
  TroubleshootingPage: "TroubleshootingPage",
  ZkLoginCallbackPage: "ZkLoginCallbackPage",
};

function stableRouteChunkFileName(chunkInfo: { name: string; facadeModuleId: string | null; isDynamicEntry: boolean }) {
  if (chunkInfo.isDynamicEntry && stableRouteChunkNames.has(chunkInfo.name)) {
    return `assets/${chunkInfo.name}.js`;
  }
  return "assets/[name]-[hash].js";
}

function legacyRouteChunkAliasPlugin(): Plugin {
  return {
    name: "deepsignal-legacy-route-chunk-aliases",
    generateBundle(_, bundle) {
      const emittedAliases = new Set<string>();
      for (const entry of Object.values(bundle)) {
        if (entry.type !== "chunk") {
          continue;
        }
        const aliases = legacyRouteChunkAliases[entry.name] ?? [];
        for (const alias of aliases) {
          if (bundle[alias]) {
            continue;
          }
          emittedAliases.add(alias);
          this.emitFile({
            type: "asset",
            fileName: alias,
            source: entry.code,
          });
        }
      }

      const createFallbackSource = (chunkName: string) => {
        const exportName = routeChunkExportNames[chunkName] ?? "RouteChunk";
        return `const reload = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("route-chunk-retry", String(Date.now()));
    url.searchParams.set("missing-route-chunk", ${JSON.stringify(chunkName)});
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};
window.setTimeout(reload, 0);
export function ${exportName}() {
  return null;
}
export default ${exportName};
`;
      };

      for (const [chunkName, aliases] of Object.entries(legacyRouteChunkAliases)) {
        for (const alias of aliases) {
          if (bundle[alias] || emittedAliases.has(alias)) {
            continue;
          }
          this.emitFile({
            type: "asset",
            fileName: alias,
            source: createFallbackSource(chunkName),
          });
        }
      }
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
            failures: failures.map((failure) => ({
              errorName: failure.errorName,
              errorMessage: failure.errorMessage,
              chunkUrl: failure.chunkUrl,
              recordedAt: failure.recordedAt,
            })),
            recordedAt: new Date().toISOString(),
          };
        }

        async function clearLocalAppCache() {
          try {
            window.sessionStorage.removeItem(retryStorageKey);
            window.sessionStorage.removeItem("deepsignal.chunkLoadRecovery");
            window.sessionStorage.removeItem("deepsignal.mixedBuildRecovery");
            window.sessionStorage.removeItem("deepsignal.observedBuildAssets");
          } catch {
            // Best effort only.
          }
          try {
            if ("caches" in window) {
              const keys = await window.caches.keys();
              await Promise.all(keys.map((key) => window.caches.delete(key)));
            }
          } catch {
            // Cache cleanup is best effort; the cache-busted navigation is the recovery path.
          }
          try {
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((registration) => registration.unregister()));
            }
          } catch {
            // Service worker cleanup is best effort.
          }
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

          const reloadButton = document.createElement("button");
          reloadButton.type = "button";
          reloadButton.textContent = "Retry signal surface";
          reloadButton.style.padding = "0.8rem 1rem";
          reloadButton.style.borderRadius = "999px";
          reloadButton.style.border = "1px solid rgba(138, 223, 255, 0.28)";
          reloadButton.style.background = "rgba(138, 223, 255, 0.14)";
          reloadButton.style.color = "#ecfdff";
          reloadButton.onclick = () => {
            const state = getRetryState();
            const nextState = { startedAt: state.startedAt, count: state.count + 1 };
            rememberRetryState(nextState);
            const url = new URL(window.location.href);
            url.searchParams.set(nextState.count > 1 ? "module-cache-clear" : "module-retry", String(Date.now()));
            if (nextState.count > 1) {
              void clearLocalAppCache().finally(() => window.location.replace(url.toString()));
            } else {
              window.location.replace(url.toString());
            }
          };

          const hardRefreshButton = document.createElement("button");
          hardRefreshButton.type = "button";
          hardRefreshButton.textContent = "Hard refresh / clear local app cache";
          hardRefreshButton.style.padding = "0.8rem 1rem";
          hardRefreshButton.style.borderRadius = "999px";
          hardRefreshButton.style.border = "1px solid rgba(255, 255, 255, 0.22)";
          hardRefreshButton.style.background = "rgba(255, 255, 255, 0.08)";
          hardRefreshButton.style.color = "#ecfdff";
          hardRefreshButton.onclick = () => {
            const url = new URL(window.location.href);
            url.searchParams.set("hard-refresh", String(Date.now()));
            void clearLocalAppCache().finally(() => window.location.replace(url.toString()));
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

          actions.appendChild(reloadButton);
          actions.appendChild(hardRefreshButton);
          bootShell.appendChild(actions);
          bootShell.appendChild(details);
        }

        function delay(ms) {
          return new Promise((resolve) => window.setTimeout(resolve, ms));
        }

        async function loadEntry(attempt = 1) {
          const url = new URL(entryPath, window.location.href);
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

        return html.replace(match[0], retryLoader);
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
      legacyRouteChunkAliasPlugin(),
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
          return deps.filter((dependency) => !/assets\/mysten-sui-[^/]+\.js$/.test(dependency.replace(/\\/g, "/")));
        },
      },
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: stableRouteChunkFileName,
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
            if (normalizedId.includes("/@mysten/sui/dist/keypairs/")) {
              return "mysten-sui-keypairs";
            }
            if (normalizedId.includes("/@mysten/sui/dist/zklogin/")) {
              return "mysten-sui-zklogin";
            }
            if (normalizedId.includes("/@mysten/sui/dist/multisig/")) {
              return "mysten-sui-multisig";
            }
            if (normalizedId.includes("/@mysten/sui/dist/verify/")) {
              return "mysten-sui-verify";
            }
            if (normalizedId.includes("/@mysten/sui/dist/cryptography/")) {
              return "mysten-sui-crypto";
            }
            if (
              normalizedId.includes("/@mysten/sui/dist/bcs/") ||
              normalizedId.includes("/@mysten/sui/dist/transactions/")
            ) {
              return "mysten-sui-tx";
            }
            if (normalizedId.includes("/@mysten/sui/dist/client/") || normalizedId.includes("/@mysten/sui/dist/jsonRpc/")) {
              return "mysten-sui-client";
            }
            if (
              normalizedId.includes("/@mysten/sui/")
            ) {
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
      exclude: ["**/node_modules/**", "**/dist/**", "**/.tmp-test/**", "**/move/**"],
      setupFiles: [testSetupFile],
    },
  };
});
