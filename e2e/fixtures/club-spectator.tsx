// 합성 코스·계정만 사용한다. Firebase 읽기나 주행 참가/위치 게시를 수행하지 않는다.
import { useSpectatorPreferences } from "../../src/features/club-spectator/preferences";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import MeetingSpectatorView from "../../src/features/club-spectator/MeetingSpectatorView";
import { spectatorFixture } from "../../src/features/club-spectator/fixtures";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import { OriderThemeProvider } from "../../src/theme";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";
const params = new URLSearchParams(location.search);
const en = params.get("lang") === "en";
const resources = import.meta.glob("../../src/i18n/resources/*/*.json", {eager: true, import: "default"});
const language = en ? "en" : "ko";
const namespaces = Object.fromEntries(Object.entries(resources).filter(([path]) => path.includes(`/${language}/`)).map(([path, value]) => [path.split("/").at(-1)!.replace(".json", ""), value]));
await i18next.init({lng: language, resources: {[language]: namespaces}, interpolation: {escapeValue: false}});
const now = Date.now();
const snapshot = spectatorFixture(now);
if (params.get("state") === "finished") { snapshot.status = "FINISHED"; snapshot.course = null; snapshot.locations = []; }
function Journey() {
  const preferences = useSpectatorPreferences("synthetic-viewer", snapshot.groupId, snapshot.eventId);
  return <MeetingSpectatorView snapshot={snapshot} now={now} receivedAt={now} en={en} preferences={preferences.value} onPreferencesChange={preferences.update} />;
}
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><BrowserRouter><ThemeProvider><OriderThemeProvider><main className="site-shell club-live-page"><Journey /></main></OriderThemeProvider></ThemeProvider></BrowserRouter></I18nextProvider>);
