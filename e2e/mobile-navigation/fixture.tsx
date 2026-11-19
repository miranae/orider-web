import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { OriderThemeProvider, Input } from '../../src/theme';
import MobileTabBar from '../../src/components/mobile/MobileTabBar';
import common from '../../src/i18n/resources/ko/common.json';
import '../../src/index.css';
import '../../src/theme/generated.css';
import '../../src/theme/components/components.css';
await i18next.init({ lng: 'ko', resources: { ko: { common } } });
function Fixture() {
  const location = useLocation();
  return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <main className="site-main site-shell site-shell--padded flex-1 overflow-x-hidden overflow-y-auto relative z-0">
      <h1>모바일 입력 확인</h1><Input aria-label="입력 내용" /><div style={{ height: '150vh' }}>본문 스크롤 영역</div><output data-testid="location">{location.pathname}</output>
    </main><MobileTabBar active="home" />
  </div>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><OriderThemeProvider><I18nextProvider i18n={i18next}><MemoryRouter><Fixture /></MemoryRouter></I18nextProvider></OriderThemeProvider></ThemeProvider>);
