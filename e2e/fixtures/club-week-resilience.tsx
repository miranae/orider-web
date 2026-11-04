// Synthetic data only. Render the production list component without production reads.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import GroupWeekPage from '../../src/pages/group/GroupWeekPage';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { OriderThemeProvider } from '../../src/theme';
import '../../src/index.css';
import '../../src/theme/generated.css';
import '../../src/theme/components/components.css';
import common from '../../src/i18n/resources/ko/common.json';
import group from '../../src/i18n/resources/ko/group.json';
import event from '../../src/i18n/resources/ko/event.json';
await i18next.init({lng:'ko',resources:{ko:{group,event,common}},interpolation:{escapeValue:false}});
function Fixture(){
  return <main className="site-shell site-shell--padded"><Routes><Route path="/:lang/club/:groupId/*" element={<GroupWeekPage />} /></Routes></main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><OriderThemeProvider><MemoryRouter initialEntries={["/ko/club/fixture/week"]}><I18nextProvider i18n={i18next}><Fixture /></I18nextProvider></MemoryRouter></OriderThemeProvider></ThemeProvider>);
