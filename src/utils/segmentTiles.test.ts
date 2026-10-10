import { afterEach, describe, expect, it } from "vitest";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { segmentTileUrl } from "./segmentTiles";
afterEach(() => resetRuntimeConfigForTests());
describe("segment tile project isolation", () => {
  it("uses stage bucket even when the module loaded before runtime config", () => {
    resetRuntimeConfigForTests({ firebaseProjectId: "orider-dev", firebaseStorageBucket: "orider-dev.firebasestorage.app" });
    expect(segmentTileUrl("/4/5/6.json")).toBe("https://storage.googleapis.com/orider-dev.firebasestorage.app/segments/tiles/4/5/6.json");
  });
  it("preserves an explicit tiles origin", () => {
    resetRuntimeConfigForTests({ segmentTilesBase: "https://tiles.example/segments/" });
    expect(segmentTileUrl("/tile.json")).toBe("https://tiles.example/segments/tile.json");
  });
});
