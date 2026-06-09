import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const uiDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@stackpatch/shared": path.resolve(uiDir, "../shared/src/index.ts"),
    },
  },
  optimizeDeps: {
    // Workspace package: resolve via alias to source — avoids stale pre-bundled exports.
    exclude: ["@stackpatch/shared"],
  },
  server: {
    middlewareMode: true,
  },
});
