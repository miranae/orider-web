import { defineConfig, mergeConfig, type ViteDevServer } from "vite";
import { readFileSync } from "node:fs";
import appConfig from "../vite.config";
export default defineConfig(env => mergeConfig(typeof appConfig === "function" ? appConfig(env) : appConfig, {
  plugins: [{ name: "embedded-coach-fixture", configureServer(server: ViteDevServer) {
    server.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes("text/html") || !request.url?.startsWith("/ko/embed/fitness")) return next();
      const html = readFileSync("e2e/fixtures/embedded-coach.html", "utf8");
      response.setHeader("Content-Type", "text/html");
      response.end(await server.transformIndexHtml(request.url, html));
    });
  } }],
}));
