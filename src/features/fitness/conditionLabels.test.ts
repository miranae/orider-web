import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import ko from "../../i18n/resources/ko/fitness.json";
import dashboardKo from "../../i18n/resources/ko/dashboard.json";
import dashboardEn from "../../i18n/resources/en/dashboard.json";
import en from "../../i18n/resources/en/fitness.json";

const keys = ["vo2maxCard.formulaLabel", "vo2maxCard.formulaBasis", "triView.previousCtl", "triView.chart.dateAxis", "condition.combinedSource"] as const;

describe("condition evidence labels", () => {
  it.each([{ locale: "ko", messages: ko }, { locale: "en", messages: en }])("renders translated evidence labels without exposing resource keys in $locale", async ({ locale, messages }) => {
    const i18n = createInstance();
    await i18n.init({ lng: locale, resources: { [locale]: { fitness: messages } }, keySeparator: false, defaultNS: "fitness" });
    for (const key of keys) {
      const text = i18n.t(key);
      expect(text).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(i18n.t("vo2maxCard.formulaBasis")).toContain("15.7");
    expect(i18n.t("triView.previousCtl")).toContain("CTL");
  });
});


it.each([{ locale: "ko", messages: dashboardKo }, { locale: "en", messages: dashboardEn }])("uses a neutral combined condition model source in $locale", async ({ locale, messages }) => {
  const i18n = createInstance();
  await i18n.init({ lng: locale, resources: { [locale]: { dashboard: messages } }, defaultNS: "dashboard" });
  const text = i18n.t("mobileFitness.integrated.conditionSource");
  expect(text).not.toContain("conditionSource");
  expect(text).not.toMatch(/서버|server/);
});
