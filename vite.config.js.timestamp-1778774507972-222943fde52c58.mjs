// vite.config.js
import { defineConfig } from "file:///D:/game/deepsignal/node_modules/vitest/dist/config.js";
import react from "file:///D:/game/deepsignal/node_modules/@vitejs/plugin-react/dist/index.js";
import { visualizer } from "file:///D:/game/deepsignal/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
var __vite_injected_original_import_meta_url = "file:///D:/game/deepsignal/vite.config.js";
function formatBuildTime(date) {
  if (date === void 0) {
    date = /* @__PURE__ */ new Date();
  }
  var pad = function(value) {
    return String(value).padStart(2, "0");
  };
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join(".") + "-".concat(pad(date.getHours())).concat(pad(date.getMinutes()));
}
function getGitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch (_a) {
    return "local";
  }
}
var packageMetadata = JSON.parse(readFileSync(new URL("./package.json", __vite_injected_original_import_meta_url), "utf8"));
var appVersion = process.env.VITE_APP_VERSION || packageMetadata.version || "0.0.0";
var buildTime = process.env.VITE_BUILD_TIME || formatBuildTime();
var gitHash = process.env.VITE_GIT_HASH || getGitHash();
var vite_config_default = defineConfig({
  base: "./",
  assetsInclude: ["**/*.wasm"],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    "import.meta.env.VITE_GIT_HASH": JSON.stringify(gitHash),
    "import.meta.env.VITE_APP_ENV": JSON.stringify(process.env.VITE_APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "dev")
  },
  plugins: [
    react(),
    process.env.ANALYZE === "true" ? visualizer({
      emitFile: true,
      filename: "bundle-analysis.html",
      gzipSize: true,
      brotliSize: true,
      template: "treemap"
    }) : null
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: function(id) {
          var normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("node_modules")) {
            return void 0;
          }
          if (normalizedId.includes("/qrcode/")) {
            return "qrcode";
          }
          if (normalizedId.includes("/@tiptap/") || normalizedId.includes("/prosemirror-")) {
            return "editor";
          }
          if (normalizedId.includes("/@mysten/dapp-kit/") || normalizedId.includes("/@mysten/wallet-standard/") || normalizedId.includes("/@wallet-standard/") || normalizedId.includes("/window-wallet-core/") || normalizedId.includes("/slush-wallet/") || normalizedId.includes("/@radix-ui/") || normalizedId.includes("/react-remove-scroll") || normalizedId.includes("/react-style-singleton/") || normalizedId.includes("/use-sidecar/") || normalizedId.includes("/use-callback-ref/") || normalizedId.includes("/detect-node-es/") || normalizedId.includes("/aria-hidden/") || normalizedId.includes("/get-nonce/") || normalizedId.includes("/jose/")) {
            return "mysten-wallet";
          }
          if (normalizedId.includes("/@mysten/walrus")) {
            return "mysten-walrus";
          }
          if (normalizedId.includes("/@mysten/seal/")) {
            return "mysten-seal";
          }
          if (normalizedId.includes("/@mysten/sui/") || normalizedId.includes("/@scure/") || normalizedId.includes("/@noble/")) {
            return "mysten-sui";
          }
          if (normalizedId.includes("/@tanstack/")) {
            return "tanstack";
          }
          if (normalizedId.includes("/react-router/") || normalizedId.includes("/react-router-dom/") || normalizedId.includes("/@remix-run/router/")) {
            return "router";
          }
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) {
            return "react-vendor";
          }
          return void 0;
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxnYW1lXFxcXGRlZXBzaWduYWxcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGdhbWVcXFxcZGVlcHNpZ25hbFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovZ2FtZS9kZWVwc2lnbmFsL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVzdC9jb25maWdcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCB7IHZpc3VhbGl6ZXIgfSBmcm9tIFwicm9sbHVwLXBsdWdpbi12aXN1YWxpemVyXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJub2RlOmNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5mdW5jdGlvbiBmb3JtYXRCdWlsZFRpbWUoZGF0ZSkge1xuICAgIGlmIChkYXRlID09PSB2b2lkIDApIHsgZGF0ZSA9IG5ldyBEYXRlKCk7IH1cbiAgICB2YXIgcGFkID0gZnVuY3Rpb24gKHZhbHVlKSB7IHJldHVybiBTdHJpbmcodmFsdWUpLnBhZFN0YXJ0KDIsIFwiMFwiKTsgfTtcbiAgICByZXR1cm4gW1xuICAgICAgICBkYXRlLmdldEZ1bGxZZWFyKCksXG4gICAgICAgIHBhZChkYXRlLmdldE1vbnRoKCkgKyAxKSxcbiAgICAgICAgcGFkKGRhdGUuZ2V0RGF0ZSgpKSxcbiAgICBdLmpvaW4oXCIuXCIpICsgXCItXCIuY29uY2F0KHBhZChkYXRlLmdldEhvdXJzKCkpKS5jb25jYXQocGFkKGRhdGUuZ2V0TWludXRlcygpKSk7XG59XG5mdW5jdGlvbiBnZXRHaXRIYXNoKCkge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBleGVjU3luYyhcImdpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEXCIsIHsgZW5jb2Rpbmc6IFwidXRmOFwiIH0pLnRyaW0oKTtcbiAgICB9XG4gICAgY2F0Y2ggKF9hKSB7XG4gICAgICAgIHJldHVybiBcImxvY2FsXCI7XG4gICAgfVxufVxudmFyIHBhY2thZ2VNZXRhZGF0YSA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKG5ldyBVUkwoXCIuL3BhY2thZ2UuanNvblwiLCBpbXBvcnQubWV0YS51cmwpLCBcInV0ZjhcIikpO1xudmFyIGFwcFZlcnNpb24gPSBwcm9jZXNzLmVudi5WSVRFX0FQUF9WRVJTSU9OIHx8IHBhY2thZ2VNZXRhZGF0YS52ZXJzaW9uIHx8IFwiMC4wLjBcIjtcbnZhciBidWlsZFRpbWUgPSBwcm9jZXNzLmVudi5WSVRFX0JVSUxEX1RJTUUgfHwgZm9ybWF0QnVpbGRUaW1lKCk7XG52YXIgZ2l0SGFzaCA9IHByb2Nlc3MuZW52LlZJVEVfR0lUX0hBU0ggfHwgZ2V0R2l0SGFzaCgpO1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgICBiYXNlOiBcIi4vXCIsXG4gICAgYXNzZXRzSW5jbHVkZTogW1wiKiovKi53YXNtXCJdLFxuICAgIGRlZmluZToge1xuICAgICAgICBcImltcG9ydC5tZXRhLmVudi5WSVRFX0FQUF9WRVJTSU9OXCI6IEpTT04uc3RyaW5naWZ5KGFwcFZlcnNpb24pLFxuICAgICAgICBcImltcG9ydC5tZXRhLmVudi5WSVRFX0JVSUxEX1RJTUVcIjogSlNPTi5zdHJpbmdpZnkoYnVpbGRUaW1lKSxcbiAgICAgICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9HSVRfSEFTSFwiOiBKU09OLnN0cmluZ2lmeShnaXRIYXNoKSxcbiAgICAgICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9BUFBfRU5WXCI6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52LlZJVEVfQVBQX0VOViB8fCBwcm9jZXNzLmVudi5WRVJDRUxfRU5WIHx8IHByb2Nlc3MuZW52Lk5PREVfRU5WIHx8IFwiZGV2XCIpLFxuICAgIH0sXG4gICAgcGx1Z2luczogW1xuICAgICAgICByZWFjdCgpLFxuICAgICAgICBwcm9jZXNzLmVudi5BTkFMWVpFID09PSBcInRydWVcIlxuICAgICAgICAgICAgPyB2aXN1YWxpemVyKHtcbiAgICAgICAgICAgICAgICBlbWl0RmlsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBmaWxlbmFtZTogXCJidW5kbGUtYW5hbHlzaXMuaHRtbFwiLFxuICAgICAgICAgICAgICAgIGd6aXBTaXplOiB0cnVlLFxuICAgICAgICAgICAgICAgIGJyb3RsaVNpemU6IHRydWUsXG4gICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwidHJlZW1hcFwiLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIDogbnVsbCxcbiAgICBdLmZpbHRlcihCb29sZWFuKSxcbiAgICBidWlsZDoge1xuICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICBvdXRwdXQ6IHtcbiAgICAgICAgICAgICAgICBtYW51YWxDaHVua3M6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbm9ybWFsaXplZElkID0gaWQucmVwbGFjZSgvXFxcXC9nLCBcIi9cIik7XG4gICAgICAgICAgICAgICAgICAgIGlmICghbm9ybWFsaXplZElkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvcXJjb2RlL1wiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicXJjb2RlXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9AdGlwdGFwL1wiKSB8fCBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvcHJvc2VtaXJyb3ItXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJlZGl0b3JcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL0BteXN0ZW4vZGFwcC1raXQvXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvQG15c3Rlbi93YWxsZXQtc3RhbmRhcmQvXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvQHdhbGxldC1zdGFuZGFyZC9cIikgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi93aW5kb3ctd2FsbGV0LWNvcmUvXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvc2x1c2gtd2FsbGV0L1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL0ByYWRpeC11aS9cIikgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9yZWFjdC1yZW1vdmUtc2Nyb2xsXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvcmVhY3Qtc3R5bGUtc2luZ2xldG9uL1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL3VzZS1zaWRlY2FyL1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL3VzZS1jYWxsYmFjay1yZWYvXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvZGV0ZWN0LW5vZGUtZXMvXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvYXJpYS1oaWRkZW4vXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvZ2V0LW5vbmNlL1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL2pvc2UvXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJteXN0ZW4td2FsbGV0XCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9AbXlzdGVuL3dhbHJ1c1wiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwibXlzdGVuLXdhbHJ1c1wiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvQG15c3Rlbi9zZWFsL1wiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwibXlzdGVuLXNlYWxcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL0BteXN0ZW4vc3VpL1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL0BzY3VyZS9cIikgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9Abm9ibGUvXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJteXN0ZW4tc3VpXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZWRJZC5pbmNsdWRlcyhcIi9AdGFuc3RhY2svXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJ0YW5zdGFja1wiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvcmVhY3Qtcm91dGVyL1wiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZElkLmluY2x1ZGVzKFwiL3JlYWN0LXJvdXRlci1kb20vXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkSWQuaW5jbHVkZXMoXCIvQHJlbWl4LXJ1bi9yb3V0ZXIvXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJyb3V0ZXJcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoL1xcL25vZGVfbW9kdWxlc1xcLyhyZWFjdHxyZWFjdC1kb218c2NoZWR1bGVyKVxcLy8udGVzdChub3JtYWxpemVkSWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJyZWFjdC12ZW5kb3JcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgIH0sXG4gICAgdGVzdDoge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJqc2RvbVwiLFxuICAgICAgICBzZXR1cEZpbGVzOiBcIi4vc3JjL3Rlc3Qvc2V0dXAudHNcIixcbiAgICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQThPLFNBQVMsb0JBQW9CO0FBQzNRLE9BQU8sV0FBVztBQUNsQixTQUFTLGtCQUFrQjtBQUMzQixT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
