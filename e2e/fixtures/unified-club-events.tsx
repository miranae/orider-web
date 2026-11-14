// Synthetic data only. Render the production list component without production reads.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { UnifiedClubEventList } from '../../src/features/group/UnifiedClubEventList';
import type { ClubMeetingListItem } from '../../src/services/clubMeetings';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { OriderThemeProvider } from '../../src/theme';
import { Button, Stack } from '../../src/theme/components';
import '../../src/index.css';
import '../../src/theme/generated.css';
import '../../src/theme/components/components.css';
import group from '../../src/i18n/resources/ko/group.json';
import event from '../../src/i18n/resources/ko/event.json';
await i18next.init({lng:'ko',resources:{ko:{group,event}},interpolation:{escapeValue:false}});
const meetings = [
  {eventId:'cancelled',rideStatus:'CANCELLED',meeting:{title:'그룹 가상라이딩',date:'2026-11-05',time:'08:00',place:'실내 트레이너',status:'cancelled',capacity:10},participantCount:0,waitingCount:0},
  {eventId:'open',rideStatus:'OPEN',meeting:{title:'주말 아침 라이딩',date:'2026-11-07',time:'09:00',place:'한강 집결지',status:'open',capacity:10},participantCount:3,waitingCount:0},
] as ClubMeetingListItem[];
/** 고정 시각 — 11-05 취소 모임·11-03 종료 대회는 지난 이벤트, 11-07 모집 모임은 예정이다(#1620). */
const NOW=Date.parse('2026-11-06T00:00:00+09:00');
function Fixture(){
  const [timeWindow,setTimeWindow]=useState<'upcoming'|'past'>('upcoming');
  return <main className="site-shell site-shell--padded"><Stack gap="var(--dim-section-gap)"><h1>클럽 이벤트</h1><div className="flex flex-wrap gap-2">{(['upcoming','past'] as const).map(value=><Button key={value} size="sm" variant={value===timeWindow?'primary':'secondary'} aria-pressed={value===timeWindow} onClick={()=>setTimeWindow(value)}>{group[`events.window.${value}`]}</Button>)}</div><UnifiedClubEventList groupId="fixture" meetings={meetings} events={[{id:'race',name:'가을 클럽 대회',status:'FINISHED',startTime:Date.parse('2026-11-03T09:00:00+09:00'),registered:12,myRsvp:false,isHost:false}]} timeWindow={timeWindow} nowMs={NOW} loading={false} error={false} hasMore={false} onRetry={()=>{}} /></Stack></main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><OriderThemeProvider><BrowserRouter><I18nextProvider i18n={i18next}><Fixture /></I18nextProvider></BrowserRouter></OriderThemeProvider></ThemeProvider>);
