import { preserveActionPosition } from "../../src/utils/preserveActionPosition";
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import training from '../../src/i18n/resources/ko/training.json';
import common from '../../src/i18n/resources/ko/common.json';
import board from '../../src/i18n/resources/ko/board.json';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { OriderThemeProvider, Button, Input, Textarea } from '../../src/theme';
import { FirebaseServicesProvider, type FirebaseServices } from '../../src/contexts/FirebaseServicesContext';
import { services } from './club-meeting-entry-hooks';
import RunGoalSetupWizard from '../../src/components/training/RunGoalSetupWizard';
import SwimGoalSetupWizard from '../../src/components/training/SwimGoalSetupWizard';
import MobileTabBar from '../../src/components/mobile/MobileTabBar';
import Modal from '../../src/components/Modal';
import { DialogProvider, useDialog } from '../../src/contexts/DialogContext';
import { DateField, TimeField } from '../../src/components/redesign';
import { DropdownSelect } from '../../src/theme/components';
import '../../src/index.css';
import '../../src/theme/generated.css';
import '../../src/theme/components/components.css';
await i18next.init({ lng: 'ko', resources: { ko: { training, common, board } }, interpolation: { escapeValue: false } });
function Fixture() {
  const [saved, setSaved] = useState(0);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('2030-11-20');
  const [time, setTime] = useState('08:00');
  const [choice, setChoice] = useState('one');
  const dialog = useDialog();
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind');
  const Stepper = () => <h1>목표 설정</h1>;
  return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}><main className="site-shell site-shell--padded" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
    {kind === 'run' ? <RunGoalSetupWizard Stepper={Stepper} /> : kind === 'swim' ? <SwimGoalSetupWizard Stepper={Stepper} /> : <>
      <h1>입력 화면 검증</h1><Input aria-label="일반 입력" /><Input type="number" aria-label="숫자 입력" /><input type="checkbox" aria-label="체크박스" />
      <Button onClick={() => setOpen(true)}>입력 팝업</Button>
      <Button onClick={() => void dialog.prompt('내용을 입력해주세요.', { multiline: true, defaultValue: '검증 내용\n'.repeat(30) })}>긴 입력 확인창</Button>
      <div data-testid="picker-controls" style={{ marginTop: 'var(--space-8)' }}><DateField portal={!params.has('inline')} value={date} onChange={setDate} /><TimeField portal={!params.has('inline')} value={time} onChange={setTime} /><DropdownSelect label="종목" value={choice} onChange={setChoice} options={Array.from({length:20},(_,i)=>({value:String(i),label:`선택 ${i}`}))} /></div>
      <div style={{ height: '60vh' }} />
      <output aria-label="저장 횟수">{saved}</output><div onPointerDown={preserveActionPosition} className="mobile-form-actions mobile-form-actions--fixed"><Button onClick={() => setSaved(n => n + 1)}>변경 저장</Button></div>
      <Modal open={open} onClose={() => setOpen(false)} title="입력 팝업">
        <p>{'긴 설명 '.repeat(100)}</p><Textarea aria-label="팝업 입력" /><Button onClick={() => setOpen(false)}>저장하고 닫기</Button>
      </Modal>
    </>}
  </main><MobileTabBar active="coach" /></div>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><OriderThemeProvider><FirebaseServicesProvider services={services as unknown as FirebaseServices}><I18nextProvider i18n={i18next}><MemoryRouter><DialogProvider><Fixture /></DialogProvider></MemoryRouter></I18nextProvider></FirebaseServicesProvider></OriderThemeProvider></ThemeProvider>);
