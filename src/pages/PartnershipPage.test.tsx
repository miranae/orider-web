import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import FooterNavigation from "../components/FooterNavigation";
import ko from "../i18n/resources/ko/common.json";
import en from "../i18n/resources/en/common.json";
import PartnershipPage, { PartnershipDetailPage } from "./PartnershipPage";

describe("Get involved pages", () => {
  it("resets the persistent main on page changes while preserving contact hash navigation", async () => {
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      const main = this.closest("main");
      if (main) main.scrollTop = 900;
    });
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { common: en } }, defaultNS: "common" });
    const renderPages = (entry: string) => render(<I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[entry]}>
        <main ref={node => { if (node) node.scrollTop = 640; }} style={{ overflowY: "auto", height: 400 }}>
          <Link to="/en/partnership/investment">Switch inquiry</Link>
          <Link to="/en/partnership/investment#partnership-contact">Contact fragment</Link>
          <Routes>
            <Route path="/:lang/partnership" element={<PartnershipPage />} />
            <Route path="/:lang/partnership/build" element={<PartnershipDetailPage purpose="build" />} />
            <Route path="/:lang/partnership/investment" element={<PartnershipDetailPage purpose="investment" />} />
          </Routes>
        </main>
      </MemoryRouter>
    </I18nextProvider>);
    try {
      const user = userEvent.setup();
      const view = renderPages("/en/partnership/build");
      const main = screen.getByRole("main");
      main.scrollTop = 700;
      await user.click(screen.getByRole("link", { name: "Switch inquiry" }));
      expect(main.scrollTop).toBe(0);
      main.scrollTop = 700;
      await user.click(screen.getByRole("link", { name: en.partnership.back }));
      expect(main.scrollTop).toBe(0);
      main.scrollTop = 500;
      await user.click(screen.getByRole("link", { name: "Switch inquiry" }));
      expect(main.scrollTop).toBe(0);
      main.scrollTop = 800;
      await user.click(screen.getByRole("link", { name: "Contact fragment" }));
      expect(main.scrollTop).toBe(900);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
      expect(screen.getByRole("region", { name: en.partnership.contactTitle })).toHaveFocus();
      await user.click(screen.getByRole("link", { name: en.partnership.back }));
      main.scrollTop = 300;
      await user.click(screen.getByRole("link", { name: "Switch inquiry" }));
      expect(main.scrollTop).toBe(0);
      view.unmount();
      scrollIntoView.mockClear();
      renderPages("/en/partnership/investment#partnership-contact");
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(screen.getByRole("region", { name: en.partnership.contactTitle })).toHaveFocus();
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it.each([
    { language: "ko", copy: ko },
    { language: "en", copy: en },
  ])("navigates from the $language footer through each distinct inquiry and back", async ({ language, copy }) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { ko: { common: ko }, en: { common: en } },
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/' + language]}>
          <Routes>
            <Route path="/:lang" element={<FooterNavigation />} />
            <Route path="/:lang/partnership" element={<PartnershipPage />} />
            <Route path="/:lang/partnership/build" element={<PartnershipDetailPage purpose="build" />} />
            <Route path="/:lang/partnership/collaborate" element={<PartnershipDetailPage purpose="collaborate" />} />
            <Route path="/:lang/partnership/investment" element={<PartnershipDetailPage purpose="investment" />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    const user = userEvent.setup();
    const inquiry = screen.getByRole("button", { name: copy.footer.partnershipInquiry });
    expect(screen.queryByRole("link", { name: copy.nav.aboutOrider })).not.toBeInTheDocument();
    await user.click(inquiry);
    const popup = screen.getByRole("region", { name: copy.footer.partnershipInquiry });
    const popupLinks = within(popup).getAllByRole("link");
    expect(popupLinks.map(link => link.getAttribute("href"))).toEqual([
      '/' + language + '/about', '/' + language + '/partnership/build',
      '/' + language + '/partnership/collaborate', '/' + language + '/partnership/investment',
    ]);
    expect(popupLinks[0]).toHaveFocus();
    await user.click(within(popup).getByRole("link", { name: copy.partnership.build.title }));
    expect(screen.getByRole("heading", { level: 1, name: copy.partnership.build.title })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: copy.footer.partnershipInquiry })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: copy.partnership.back }));
    expect(screen.getByRole("heading", { level: 1, name: copy.partnership.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.partnership.aboutLink })).toHaveAttribute("href", '/' + language + '/about');
    expect(screen.queryByText("orider.app@gmail.com")).not.toBeInTheDocument();

    for (const purpose of ["build", "collaborate", "investment"] as const) {
      const page = copy.partnership[purpose];
      const choices = screen.getByRole("navigation", { name: copy.partnership.choicesLabel });
      expect(within(choices).getAllByRole("link")).toHaveLength(3);
      const choice = within(choices).getByRole("link", { name: name => name.startsWith(page.title) });
      expect(choice).toHaveAttribute("href", '/' + language + '/partnership/' + purpose);
      await user.click(choice);
      expect(screen.getByRole("heading", { level: 1, name: page.title })).toBeInTheDocument();
      expect(screen.getByText(page.intro)).toBeInTheDocument();
      for (const section of page.sections) {
        expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
        expect(screen.getByText(section.description)).toBeInTheDocument();
      }
      const repository = screen.queryByRole("link", { name: copy.partnership.build.repository });
      if (purpose === "build") {
        expect(repository).toHaveAttribute("href", "https://github.com/miranae/orider-web");
        expect(repository).toHaveAttribute("rel", "noopener noreferrer");
      } else {
        expect(repository).not.toBeInTheDocument();
      }
      const contact = screen.getByRole("region", { name: copy.partnership.contactTitle });
      expect(screen.getByRole("link", { name: copy.partnership.jumpToContact })).toHaveAttribute("href", "#partnership-contact");
      expect(contact).toHaveAttribute("id", "partnership-contact");
      expect(contact).toHaveAttribute("tabindex", "-1");
      expect(within(contact).getAllByRole("listitem")).toHaveLength(3);
      for (const detail of page.contactDetails) expect(within(contact).getByText(detail)).toBeInTheDocument();
      const email = within(contact).getByRole("link", { name: "orider.app@gmail.com" });
      expect(email).toHaveAttribute("href", "mailto:orider.app@gmail.com");
      expect(email).toHaveAttribute("draggable", "false");
      expect(email).toHaveStyle({ userSelect: "text" });
      expect(within(contact).getByRole("link", { name: page.emailAction })).toHaveAttribute("href", "mailto:orider.app@gmail.com");
      expect(screen.getByRole("link", { name: copy.partnership.supportLink })).toHaveAttribute("href", '/' + language + '/community/board?type=inquiry');
      const back = screen.getByRole("link", { name: copy.partnership.back });
      expect(back).toHaveAttribute("href", '/' + language + '/partnership');
      await user.click(back);
      expect(screen.getByRole("heading", { level: 1, name: copy.partnership.title })).toBeInTheDocument();
    }
  });
});
