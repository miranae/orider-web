import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import PeriodLoadEvidence from './PeriodLoadEvidence';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('./PmcHistoryPanel',()=>({default:()=> <div>PMC</div>}));
function Log(){const location=useLocation();return <div data-testid="destination">{location.search} {JSON.stringify(location.state)}</div>;}
it('keeps unavailable load honest and sends chosen KST day plus owner-bound return to log',()=>{
 render(<MemoryRouter initialEntries={['/ko/coach/analysis?sport=bike&detail=analysis-periods']}><Routes><Route path="/ko/coach/analysis" element={<PeriodLoadEvidence ownerUid="owner" discipline="bike" timeseries={null} periods={[{fromInclusive:Date.parse('2026-10-01T00:00:00+09:00'),toExclusive:Date.parse('2026-10-03T00:00:00+09:00')}]} />} /><Route path="/ko/athlete/me/activities" element={<Log/>}/></Routes></MemoryRouter>);
 expect(screen.getByRole('status')).toHaveTextContent('periodLoad.unavailable');
 fireEvent.change(screen.getByLabelText('periodLoad.logDate'),{target:{value:'2026-10-02'}});
 fireEvent.click(screen.getByRole('link',{name:'periodLoad.log'}));
 expect(screen.getByTestId('destination')).toHaveTextContent('date=2026-10-02');
 expect(screen.getByTestId('destination')).toHaveTextContent('"uid":"owner"');
 expect(screen.getByTestId('destination')).toHaveTextContent('detail=analysis-periods');
});
it('does not navigate to dates outside selected range',()=>{
 render(<MemoryRouter><PeriodLoadEvidence ownerUid="owner" discipline="bike" timeseries={null} periods={[{fromInclusive:Date.parse('2026-10-01T00:00:00+09:00'),toExclusive:Date.parse('2026-10-03T00:00:00+09:00')}]} /></MemoryRouter>);
 fireEvent.change(screen.getByLabelText('periodLoad.logDate'),{target:{value:'2026-11-01'}});
 expect(screen.queryByRole('link',{name:'periodLoad.log'})).toBeNull();
});
