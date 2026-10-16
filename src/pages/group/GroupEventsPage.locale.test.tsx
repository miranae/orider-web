import { Suspense } from "react";
import { createInstance, type BackendModule } from "i18next";
import { I18nextProvider } from "react-i18next";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import koGroup from "../../i18n/resources/ko/group.json";
import enGroup from "../../i18n/resources/en/group.json";
import koEvent from "../../i18n/resources/ko/event.json";
import enEvent from "../../i18n/resources/en/event.json";
import GroupEventsPage from "./GroupEventsPage";

vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 2 }, loading: false }),
  useGroupMemberRole: () => ({ role: "member", loading: false }),
}));

describe("club event lazy translations", () => {
  it.each(["ko", "en"])("loads the event namespace on direct %s entry", async language => {
    const loads = vi.fn();
    const backend: BackendModule = {
      type: "backend",
      init() {},
      read(lang, namespace, callback) {
        loads(namespace);
        callback(null, namespace === "event" ? (lang === "ko" ? koEvent : enEvent) : {});
      },
    };
    const isolated = createInstance();
    await isolated.use(backend).init({
      lng: language,
      fallbackLng: false,
      ns: ["group", "common"],
      defaultNS: "group",
      resources: { [language]: { group: language === "ko" ? koGroup : enGroup, common: {} } },
      partialBundledLanguages: true,
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
    });
    expect(isolated.hasResourceBundle(language, "event")).toBe(false);
    renderWithProviders(<I18nextProvider i18n={isolated}><Suspense fallback="Loading translations"><Routes><Route path="/:lang/club/:groupId/events" element={<GroupEventsPage />} /></Routes></Suspense></I18nextProvider>, { route: `/${language}/club/club/events`, authenticated: true });
    const resource = language === "ko" ? koEvent : enEvent;
    expect(await screen.findByRole("button", { name: resource["status.open"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: resource["status.live"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: resource["status.finished"] })).toBeInTheDocument();
    expect(loads).toHaveBeenCalledWith("event");
    expect(screen.queryByText("status.open")).not.toBeInTheDocument();
  });
});
