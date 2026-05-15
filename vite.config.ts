import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadEnv } from "vite";

type PackageMetadata = {
  version?: string;
};

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

const packageMetadata = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as PackageMetadata;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appVersion = process.env.VITE_APP_VERSION || env.VITE_APP_VERSION || packageMetadata.version || "0.0.0";
  const buildTime = process.env.VITE_BUILD_TIME || env.VITE_BUILD_TIME || formatBuildTime();
  const gitHash = process.env.VITE_GIT_HASH || env.VITE_GIT_HASH || getGitHash();
  const appEnvironment =
    process.env.VITE_APP_ENV || env.VITE_APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || mode || "dev";

  return {
    base: "./",
    assetsInclude: ["**/*.wasm"],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
      "import.meta.env.VITE_GIT_HASH": JSON.stringify(gitHash),
      "import.meta.env.VITE_APP_ENV": JSON.stringify(appEnvironment),
    },
    plugins: [
      react(),
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
      rollupOptions: {
        output: {
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
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
