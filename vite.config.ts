import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.wasm"],
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("qrcode")) {
            return "qrcode";
          }
          if (id.includes("@tiptap")) {
            return "tiptap";
          }
          if (id.includes("@mysten")) {
            return "mysten";
          }
          if (id.includes("@tanstack")) {
            return "tanstack";
          }
          if (id.includes("react-router")) {
            return "router";
          }
          if (id.includes("react")) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
