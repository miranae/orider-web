import { defineConfig } from "vitest/config";
import { loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { realpathSync } from "node:fs";
import { copyLocales } from "./scripts/copy-locales";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const bucket = env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID || "miranae-orider-g1"}.firebasestorage.app`;
  const segmentBase = env.VITE_SEGMENT_TILES_BASE || `https://storage.googleapis.com/${bucket}/segments/tiles`;
  // 로컬 검토는 공개 목록 한 파일만 같은 출처에서 읽는다. 인증·쿠키는 전달하지 않는다.
  const segmentOverview = new URL(`${segmentBase.replace(/\/+$/, "")}/overview.json`);
  return {
    cacheDir: process.env.ORIDER_VITE_CACHE_DIR || "node_modules/.vite",
    server: {
      fs: {
        allow: [path.resolve(__dirname), realpathSync(path.resolve(__dirname, "node_modules"))],
      },
    },
    test: {
      alias: {
        "@shared": path.resolve(__dirname, "shared"),
      },
    },
    build: {
      sourcemap: process.env.NODE_ENV === "production" ? "hidden" : true,
      // Mapbox/Firebase are intentionally isolated as vendor chunks; warn only if
      // future dependency growth exceeds the current public-app bundle profile.
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        input: { index: path.resolve(__dirname, "index.html"), controls: path.resolve(__dirname, "design-system-controls.html") },
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
      {
        name: "club-public-segment-catalog",
        apply: "serve" as const,
        configureServer(server: ViteDevServer) {
          server.middlewares.use("/__club-segments/overview.json", async (req, res) => {
            if (req.url !== "/" && req.url !== "") { res.statusCode = 404; res.end(); return; }
            if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }
            if (segmentOverview.protocol !== "https:" || segmentOverview.hostname !== "storage.googleapis.com" || segmentOverview.username || segmentOverview.password) {
              res.statusCode = 502; res.end("공개 세그먼트 주소를 확인해주세요."); return;
            }
            try {
              const upstream = await fetch(segmentOverview, { redirect: "error", signal: AbortSignal.timeout(20_000) });
              if (!upstream.ok || !upstream.headers.get("content-type")?.includes("application/json")) throw new Error("목록 응답 오류");
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.setHeader("X-Content-Type-Options", "nosniff");
              res.setHeader("Cache-Control", "private, max-age=60");
              res.end(await upstream.text());
            } catch {
              res.statusCode = 502; res.end("공개 세그먼트 목록을 불러오지 못했어요.");
            }
          });
        },
      },
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
  };
});
