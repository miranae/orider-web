import { describe, expect, it } from "vitest";

import { resolveFitnessDiscipline } from "./useFitnessModel";

describe("resolveFitnessDiscipline", () => {
  it.each(["bike", "run", "swim", "tri"] as const)("keeps supported sport %s", (sport) => {
    expect(resolveFitnessDiscipline(sport)).toBe(sport);
  });

  it.each([null, undefined, "", "cycling", "RUN", " bike "])(
    "falls back safely for %s",
    (sport) => {
      expect(resolveFitnessDiscipline(sport)).toBe("bike");
    },
  );
});
