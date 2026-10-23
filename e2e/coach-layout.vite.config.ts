import { defineConfig,mergeConfig,type ViteDevServer } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import appConfig from "../vite.config";

// Dedicated local fixture server: preserve real BrowserRouter URLs/reload/hash semantics.
// This configuration is never used for app builds or deployed hosting.
export default defineConfig(env => mergeConfig(typeof appConfig==="function"? appConfig(env):appConfig,{
  plugins: [{
    name: "coach-local-fixture-routes",configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request,response,next) => {
        if(!request.headers.accept?.includes("text/html")||!/^\/(ko|en)\/(coach\/(plan|analysis|evidence|run30)|athlete\/me\/activities|activity\/[^/?#]+)(?:[/?#]|$)/.test(request.url??"")) return next();
        try {
          const html=readFileSync(fileURLToPath(new URL("./fixtures/coach-layout.html",import.meta.url)),"utf8");
          response.setHeader("Content-Type","text/html");
          response.end(await server.transformIndexHtml(request.url!,html));
        } catch(error) { next(error); }
      });
    }
  }],
}));
