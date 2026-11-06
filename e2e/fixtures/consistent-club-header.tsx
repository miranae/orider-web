// Synthetic data only. Render the production list component without production reads.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import GroupSubNav from '../../src/components/group/GroupSubNav';
import type { Group } from '@shared/types';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { OriderThemeProvider } from '../../src/theme';
import '../../src/index.css';
import '../../src/theme/generated.css';
import '../../src/theme/components/components.css';
import group from '../../src/i18n/resources/ko/group.json';
import event from '../../src/i18n/resources/ko/event.json';
await i18next.init({lng:'ko',resources:{ko:{group,event}},interpolation:{escapeValue:false}});
const groupFixture = {id:'fixture',name:'테스트 클럽',description:'함께 달리는 사람들',memberCount:5,creatorId:'fixture-host'} as Group;
function Fixture(){
  return <main className="site-shell site-shell--padded"><Routes><Route path="/:lang/club/:groupId/*" element={<GroupSubNav group={groupFixture} isCreator />} /></Routes></main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><OriderThemeProvider><MemoryRouter initialEntries={["/ko/club/fixture"]}><I18nextProvider i18n={i18next}><Fixture /></I18nextProvider></MemoryRouter></OriderThemeProvider></ThemeProvider>);
