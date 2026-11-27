import { describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { localeTag } from "./localeDate";

vi.mock("../i18n", () => ({ default: { language: "ko" } }));

describe("localeTag", () => {
  it.each([
    ["ko", "ko-KR"],
    ["en-GB", "en-US"],
    ["ja", "ja-JP"],
    ["zh-TW", "zh-TW"],
    ["pt-BR", "pt-BR"],
    ["es", "es-ES"],
  ])("formats dates in the selected %s language", (language, expected) => {
    i18n.language = language;
    expect(localeTag()).toBe(expected);
  });
});
