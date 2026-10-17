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
