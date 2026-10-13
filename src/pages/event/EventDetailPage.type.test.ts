import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import ko from "../../i18n/resources/ko/event.json";
import en from "../../i18n/resources/en/event.json";
import { eventTypeLabelKey } from "./EventDetailPage";

describe("event detail type labels", () => {
  it.each([
    ["GRANFONDO", "그란폰도", "Granfondo"],
    ["TOUR", "투어", "Tour"],
    ["TT", "타임트라이얼", "Time Trial"],
    ["TRAINING", "훈련", "Training"],
    ["GROUP_RIDE", "그룹 라이드", "Group Ride"],
  ])("preserves %s with existing Korean and English translations", async (type, korean, english) => {
    const i18n = createInstance();
    await i18n.init({
      resources: { ko: { event: ko }, en: { event: en } },
      lng: "ko",
      fallbackLng: "en",
      defaultNS: "event",
      keySeparator: false,
    });
    const key = eventTypeLabelKey(type);
    expect(key).not.toBeNull();
    expect(i18n.t(key!)).toBe(korean);
    await i18n.changeLanguage("en");
    expect(i18n.t(key!)).toBe(english);
  });

  it("does not mislabel an unknown event type as a tour", () => {
    expect(eventTypeLabelKey("FUTURE_TYPE")).toBeNull();
  });
});
