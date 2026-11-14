import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { OriderThemeProvider } from "../../src/theme";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { FirebaseServicesProvider, type FirebaseServices } from "../../src/contexts/FirebaseServicesContext";
import ClubHomePage from "../../src/pages/group/ClubHomePage";
import ClubMeetingPage from "../../src/pages/group/ClubMeetingPage";
import GroupCard from "../../src/components/group/GroupCard";
import { english, group, services } from "./club-meeting-entry-hooks";
import ko from "../../src/i18n/resources/ko/group.json";
import en from "../../src/i18n/resources/en/group.json";
import koEvent from "../../src/i18n/resources/ko/event.json";
import enEvent from "../../src/i18n/resources/en/event.json";
import koMeeting from "../../src/i18n/resources/ko/clubMeeting.json";
import enMeeting from "../../src/i18n/resources/en/clubMeeting.json";
import koCommon from "../../src/i18n/resources/ko/common.json";
import enCommon from "../../src/i18n/resources/en/common.json";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";
import "../../src/pages/group/ClubSurface.css";
const lang = english ? "en" : "ko";
await i18next.init({ lng: lang, resources: { ko: { group: ko, event: koEvent, common: koCommon, clubMeeting: koMeeting }, en: { group: en, event: enEvent, common: enCommon, clubMeeting: enMeeting } }, interpolation: { escapeValue: false } });
function Position() { const l = useLocation(); return <output data-testid="flow-location" hidden>{l.pathname}</output>; }
function Clubs() { return <><h1>{english ? "My clubs" : "내 클럽"}</h1><GroupCard group={group} showMyRole /></>; }
createRoot(document.getElementById("root")!).render(
  <ThemeProvider><OriderThemeProvider><FirebaseServicesProvider services={services as unknown as FirebaseServices}>
    <I18nextProvider i18n={i18next}><MemoryRouter initialEntries={[`/${lang}/clubs`]}><main className="site-shell site-shell--padded"><Position /><Routes>
      <Route path="/:lang/clubs" element={<Clubs />} />
      <Route path="/:lang/club/:groupId" element={<ClubHomePage />} />
      <Route path="/:lang/club/:groupId/meetings/new" element={<ClubMeetingPage mode="new" />} />
    </Routes></main></MemoryRouter></I18nextProvider>
  </FirebaseServicesProvider></OriderThemeProvider></ThemeProvider>,
);
