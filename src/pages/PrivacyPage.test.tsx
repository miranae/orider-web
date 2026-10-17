import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "./PrivacyPage";
import koLegal from "../i18n/resources/ko/legal.json";
import enLegal from "../i18n/resources/en/legal.json";

afterEach(async () => { await i18n.changeLanguage("ko"); });

describe("public map provider privacy disclosure", () => {
  it.each(["ko", "en"])("renders Mapbox processing and the official policy in %s", async language => {
    i18n.addResourceBundle("en", "legal", enLegal);
    await i18n.changeLanguage(language);
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    const copy = language === "ko" ? koLegal.privacy.mapbox : enLegal.privacy.mapbox;
    expect(screen.getByRole("heading", { name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.link })).toHaveAttribute("href", "https://www.mapbox.com/legal/privacy");
  });
});

describe("Google provider and Strava credential disclosure", () => {
  it.each(["ko", "en"])("renders provider processing and official links in %s", async language => {
    i18n.addResourceBundle("en", "legal", enLegal);
    await i18n.changeLanguage(language);
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    const legal = language === "ko" ? koLegal : enLegal;
    const provider = legal.privacy.sections.find(section => "policyLinks" in section)!;
    expect(screen.getByRole("heading", { name: provider.title })).toBeInTheDocument();
    for (const link of provider.policyLinks!) {
      expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.url);
    }
    for (const service of ["Firebase Authentication", "Firebase Cloud Messaging", "Google Analytics", "Firebase Crashlytics"]) {
      expect(screen.getAllByText(text => text.startsWith(`${service}:`) || text.startsWith(`${service} and`) || text.startsWith(`${service} 및`)).length).toBeGreaterThan(0);
    }
    const copy = JSON.stringify(legal.privacy);
    expect(copy).not.toMatch(/외부 업체에 위탁하지 않습니다|does not outsource personal information|서버 측에서만 저장|only on the server side|never shared with third parties/);
    expect(copy).toContain(language === "ko" ? "앱에서도 내려받아" : "app may also download");
    expect(copy).toContain(language === "ko" ? "대략적인 지역" : "Approximate location");
    expect(copy).toContain(language === "ko" ? "중단되는 것은 아닙니다" : "does not stop app SDK");
  });
});
