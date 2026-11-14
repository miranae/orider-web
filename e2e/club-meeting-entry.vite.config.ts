import { defineConfig, mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import base from "./unified-club-events.vite.config";
const hooks = fileURLToPath(new URL("./fixtures/club-meeting-entry-hooks.ts", import.meta.url));
export default mergeConfig(base, defineConfig({
  optimizeDeps: { entries: ["e2e/fixtures/club-meeting-entry.html"] },
  plugins: [tailwindcss(), { name: "synthetic-club-entry-io", enforce: "pre", resolveId(source, importer) {
    if (!importer?.includes("/src/")) return;
    if (["../../contexts/AuthContext", "../../hooks/useGroup", "../../features/club-preparation/useClubMeetingsApi", "./useClubMeetingsApi", "../../services/eventDiscovery", "../../features/club-preparation/useClubMeeting"].includes(source)) return hooks;
  } }],
}));
