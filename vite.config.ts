import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { copyLocales } from "./scripts/copy-locales";

export default defineConfig({
  test: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  build: {
    sourcemap: process.env.NODE_ENV === "production" ? "hidden" : true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "vendor-firebase";
            if (id.includes("mapbox-gl") || id.includes("react-map-gl")) return "vendor-mapbox";
            if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "vendor-charts";
            if (id.includes("@sentry")) return "vendor-sentry";
            if (id.includes("react-markdown") || id.includes("remark")) return "vendor-markdown";
            return "vendor";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    copyLocales(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    ...(process.env.ANALYZE ? [visualizer({ open: true, filename: "dist/stats.html" })] : []),
  ],
  resolve: {
    alias: [
      { find: /^@shared\/(.*)$/, replacement: path.resolve(__dirname, "shared/$1") },
      { find: "@shared", replacement: path.resolve(__dirname, "shared") },
    ],
  },
});
