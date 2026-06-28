import { describe, expect, it } from "vitest";

import { composeBloodType, parseBloodType } from "./eventRegistrationUtils";

describe("eventRegistrationUtils", () => {
  it("parses standard blood types", () => {
    expect(parseBloodType("AB-")).toEqual({ abo: "AB", rh: "-", custom: "" });
    expect(parseBloodType("O")).toEqual({ abo: "O", rh: "", custom: "" });
  });

  it("keeps custom blood type labels", () => {
    expect(parseBloodType("Bombay")).toEqual({ abo: "", rh: "", custom: "Bombay" });
  });

  it("composes and truncates values", () => {
    expect(composeBloodType({ abo: "A", rh: "+", custom: "" })).toBe("A+");
    expect(composeBloodType({ abo: "", rh: "", custom: "  Rh-Null very long custom label that should truncate  " })).toHaveLength(32);
  });
});
