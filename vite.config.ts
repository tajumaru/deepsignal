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
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
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
    publicForm: /\/src\/pages\/PublicFormPage\.tsx$/,
    publicRoadmap: /\/src\/pages\/PublicRoadmapPage\.tsx$/,
    manifestRestore: /\/src\/pages\/ManifestRestorePage\.tsx$/,
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
        publicForm: [],
        publicRoadmap: [],
        manifestRestore: [],
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

function moduleEntryRetryPlugin(): Plugin {
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
        const statusNode = document.querySelector("[data-boot-status]");
        const bootShell = document.querySelector(".boot-shell");

        function setBootStatus(message) {
          if (statusNode) {
            statusNode.textContent = message;
          }
        }

        function ensureRecoveryActions() {
          if (!bootShell || bootShell.querySelector("[data-boot-recovery]")) {
            return;
          }
          const actions = document.createElement("div");
          actions.dataset.bootRecovery = "true";
          actions.style.display = "flex";
          actions.style.gap = "0.75rem";
          actions.style.flexWrap = "wrap";
          actions.style.justifyContent = "center";

          const reloadButton = document.createElement("button");
          reloadButton.type = "button";
          reloadButton.textContent = "Reload";
          reloadButton.style.padding = "0.8rem 1rem";
          reloadButton.style.borderRadius = "999px";
          reloadButton.style.border = "1px solid rgba(138, 223, 255, 0.28)";
          reloadButton.style.background = "rgba(138, 223, 255, 0.14)";
          reloadButton.style.color = "#ecfdff";
          reloadButton.onclick = () => window.location.reload();

          actions.appendChild(reloadButton);
          bootShell.appendChild(actions);
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
            if (attempt >= maxAttempts) {
              console.error("DeepSignal module entry failed to load", error);
              setBootStatus("Signal surface load failed. Retry or reopen the page.");
              ensureRecoveryActions();
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
      moduleEntryRetryPlugin(),
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
            if (
              normalizedId.includes("/@mysten/sui/") ||
              normalizedId.includes("/@scure/") ||
              normalizedId.includes("/@noble/")
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
