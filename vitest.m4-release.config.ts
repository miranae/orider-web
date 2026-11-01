// 로컬 캐시 격리 전용. 배포 제외.
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { configDefaults } from "vitest/config";
import nodeTests from "./vitest.node-tests.json";

export default defineConfig({
  cacheDir: "/Users/kyoungnam/Documents/Codex/2026-10-24/task/test-cache/vitest-latest-release",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(process.cwd(), "shared"),
    },
  },
  server: {
    fs: {
      // shared/ pure module tests live in this split frontend repo.
      allow: [path.resolve(process.cwd())],
    },
  },
  test: {
    globals: true,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          // 순수 계산/파일 계약은 DOM과 Firebase·React 전역 mock을 로드하지 않는다.
          include: nodeTests,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./src/__tests__/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...nodeTests],
        },
      },
    ],
  },
});
