import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FooterNavigation from "./FooterNavigation";
import ko from "../i18n/resources/ko/common.json";
import en from "../i18n/resources/en/common.json";
import ja from "../i18n/resources/ja/common.json";
import zhTW from "../i18n/resources/zh-TW/common.json";
import ptBR from "../i18n/resources/pt-BR/common.json";
import es from "../i18n/resources/es/common.json";

describe("FooterNavigation manuals", () => {
  it.each([
    { language: "ko", copy: ko },
    { language: "en", copy: en },
    { language: "ja", copy: ja },
    { language: "zh-TW", copy: zhTW },
    { language: "pt-BR", copy: ptBR },
    { language: "es", copy: es },
  ])("opens the $language manuals as static Hosting pages instead of localized SPA routes", async ({ language, copy }) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { [language]: { common: copy } },
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/" + language]}>
          <Routes>
            <Route path="/:lang" element={<FooterNavigation />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.footer.help }));
    const popup = screen.getByRole("region", { name: copy.footer.help });
    const suffix = language === "ko" ? "" : `${language}/`;
    expect(within(popup).getByRole("link", { name: copy.footer.webManual })).toHaveAttribute("href", `/web-manual/${suffix}`);
    expect(within(popup).getByRole("link", { name: copy.footer.appManual })).toHaveAttribute("href", `/manual/${suffix}`);
    expect(within(popup).getByRole("link", { name: copy.footer.feedback })).toHaveAttribute("href", `/${language}/feedback`);
  });
});
