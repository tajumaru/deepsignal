import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
function formatBuildTime(date) {
    if (date === void 0) { date = new Date(); }
    var pad = function (value) { return String(value).padStart(2, "0"); };
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join(".") + "-".concat(pad(date.getHours())).concat(pad(date.getMinutes()));
}
function getGitHash() {
    try {
        return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    }
    catch (_a) {
        return "local";
    }
}
var packageMetadata = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
var appVersion = process.env.VITE_APP_VERSION || packageMetadata.version || "0.0.0";
var buildTime = process.env.VITE_BUILD_TIME || formatBuildTime();
var gitHash = process.env.VITE_GIT_HASH || getGitHash();
var unusedPublicBuildAssets = ["deepsignal-icon.png", "favicon.png"];
function pruneUnusedPublicBuildAssets() {
    var outDir = "dist";
    return {
        name: "deepsignal-prune-unused-public-build-assets",
        apply: "build",
        configResolved: function (config) {
            outDir = resolve(config.root, config.build.outDir);
        },
        closeBundle: function () {
            for (var _i = 0, unusedPublicBuildAssets_1 = unusedPublicBuildAssets; _i < unusedPublicBuildAssets_1.length; _i++) {
                var filename = unusedPublicBuildAssets_1[_i];
                rmSync(resolve(outDir, filename), { force: true });
            }
        },
    };
}
export default defineConfig({
    base: "./",
    assetsInclude: ["**/*.wasm"],
    define: {
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
        "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
        "import.meta.env.VITE_GIT_HASH": JSON.stringify(gitHash),
        "import.meta.env.VITE_APP_ENV": JSON.stringify(process.env.VITE_APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "dev"),
    },
    plugins: [
        react(),
        pruneUnusedPublicBuildAssets(),
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
                manualChunks: function (id) {
                    var normalizedId = id.replace(/\\/g, "/");
                    if (!normalizedId.includes("node_modules")) {
                        return undefined;
                    }
                    if (normalizedId.includes("/qrcode/")) {
                        return "qrcode";
                    }
                    if (normalizedId.includes("/@tiptap/") || normalizedId.includes("/prosemirror-")) {
                        return "editor";
                    }
                    if (normalizedId.includes("/@mysten/dapp-kit/") ||
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
                        normalizedId.includes("/jose/")) {
                        return "mysten-wallet";
                    }
                    if (normalizedId.includes("/@mysten/walrus")) {
                        return "mysten-walrus";
                    }
                    if (normalizedId.includes("/@mysten/seal/")) {
                        return "mysten-seal";
                    }
                    if (normalizedId.includes("/@mysten/sui/") ||
                        normalizedId.includes("/@scure/") ||
                        normalizedId.includes("/@noble/")) {
                        return "mysten-sui";
                    }
                    if (normalizedId.includes("/@tanstack/")) {
                        return "tanstack";
                    }
                    if (normalizedId.includes("/react-router/") ||
                        normalizedId.includes("/react-router-dom/") ||
                        normalizedId.includes("/@remix-run/router/")) {
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
});
