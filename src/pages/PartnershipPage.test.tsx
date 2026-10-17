import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FooterNavigation from "../components/FooterNavigation";
import ko from "../i18n/resources/ko/common.json";
import en from "../i18n/resources/en/common.json";
import PartnershipPage from "./PartnershipPage";

describe("PartnershipPage", () => {
  it.each([
    { language: "ko", copy: ko },
    { language: "en", copy: en },
  ])("opens the public $language page from the footer and provides a selectable email", async ({ language, copy }) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { ko: { common: ko }, en: { common: en } },
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/${language}`]}>
          <Routes>
            <Route path="/:lang" element={<FooterNavigation />} />
            <Route path="/:lang/partnership" element={<PartnershipPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const inquiry = screen.getByRole("link", { name: copy.footer.partnershipInquiry });
    expect(inquiry).toHaveAttribute("href", `/${language}/partnership`);
    await userEvent.setup().click(inquiry);
    expect(screen.getByRole("heading", { level: 1, name: copy.partnership.title })).toBeInTheDocument();
    expect(screen.getByText(copy.partnership.origin)).toBeInTheDocument();
    const direction = screen.getByRole("region", { name: copy.partnership.directionTitle });
    for (const moment of Object.values(copy.partnership.moments)) {
      expect(within(direction).getByText(moment.title)).toBeInTheDocument();
      expect(within(direction).getByText(moment.description)).toBeInTheDocument();
    }
    expect(within(direction).getByText(copy.partnership.openDirection)).toBeInTheDocument();
    const people = screen.getByRole("region", { name: copy.partnership.people.title });
    const business = screen.getByRole("region", { name: copy.partnership.business.title });
    expect(within(people).getByRole("heading", { level: 2 })).toHaveTextContent(copy.partnership.people.title);
    expect(within(people).getByText(copy.partnership.people.description)).toBeInTheDocument();
    expect(within(people).getByText(copy.partnership.people.invitation)).toBeInTheDocument();
    expect(within(business).getByRole("heading", { level: 2 })).toHaveTextContent(copy.partnership.business.title);
    expect(within(business).getByText(copy.partnership.business.description)).toBeInTheDocument();
    expect(within(business).getByText(copy.partnership.business.invitation)).toBeInTheDocument();
    const topics = screen.getByRole("region", { name: copy.partnership.topicsTitle });
    expect(within(topics).getAllByRole("heading", { level: 3 })).toHaveLength(6);
    for (const topic of Object.values(copy.partnership.topics)) {
      expect(within(topics).getByRole("heading", { level: 3, name: topic.title })).toBeInTheDocument();
      expect(within(topics).getByText(topic.description)).toBeInTheDocument();
    }
    expect(within(topics).getByText(copy.partnership.otherIdeas)).toBeInTheDocument();
    const contact = screen.getByRole("region", { name: copy.partnership.contactTitle });
    const jump = screen.getByRole("link", { name: copy.partnership.jumpToContact });
    expect(jump).toHaveAttribute("href", "#partnership-contact");
    expect(contact).toHaveAttribute("id", "partnership-contact");
    expect(contact).toHaveAttribute("tabindex", "-1");
    expect(within(contact).getAllByRole("listitem")).toHaveLength(3);
    const email = within(contact).getByRole("link", { name: "orider.app@gmail.com" });
    expect(email).toHaveAttribute("href", "mailto:orider.app@gmail.com");
    expect(email).toHaveAttribute("draggable", "false");
    expect(email).toHaveStyle({ userSelect: "text" });
    expect(within(contact).getByRole("link", { name: copy.partnership.emailAction })).toHaveAttribute("href", "mailto:orider.app@gmail.com");
    expect(screen.getByRole("link", { name: copy.partnership.supportLink })).toHaveAttribute("href", `/${language}/community/board?type=inquiry`);
  });
});
