import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
export default defineConfig({
    base: "./",
    assetsInclude: ["**/*.wasm"],
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
