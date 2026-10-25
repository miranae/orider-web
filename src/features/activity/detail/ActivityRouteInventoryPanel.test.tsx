import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Activity } from '@shared/types';
import { routeInventoryPage } from '../../../__tests__/fixtures/routeInventory';
import ActivityRouteInventoryPanel, { validRouteInventoryControls } from './ActivityRouteInventoryPanel';
import RouteInventoryReturn from './RouteInventoryReturn';
const mocks=vi.hoisted(()=>({uid:'owner',pages:[] as unknown[],start:vi.fn(),more:vi.fn(),hook:vi.fn()}));
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{uid:mocks.uid,isAnonymous:false}})}));
vi.mock('../../../hooks/usePeriodControls',()=>({usePeriodControls:(_owner:string,_kind:string,initial:()=>unknown)=>useState(initial)}));
vi.mock('../../../hooks/useActivityMatchedRouteInventory',()=>({useActivityMatchedRouteInventory:(...args:unknown[])=>{mocks.hook(...args);return{available:true,status:'idle',pages:mocks.pages,start:mocks.start,loadMore:mocks.more};}}));
vi.mock('../../../hooks/useLocalizedNavigate',()=>({useLocalizedPath:(path:string)=>path}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'},t:(key:string)=>key})}));
const activity={id:'anchor',userId:'owner',type:'Ride',source:'orider'} as Activity;
function Position(){const location=useLocation();return <output>{JSON.stringify(location)}</output>;}
beforeEach(()=>{mocks.uid='owner';mocks.pages=[];mocks.start.mockClear();mocks.more.mockClear();mocks.hook.mockClear();});
it('validates year controls and never fetches merely opening or changing a filter',()=>{
 render(<MemoryRouter><ActivityRouteInventoryPanel activity={activity} observedMetricsIdentity="head"/></MemoryRouter>);
 fireEvent.click(screen.getByText('routeInventory.title'));
 fireEvent.change(screen.getByLabelText('routeInventory.year'),{target:{value:'2025'}});
 expect(mocks.hook).toHaveBeenLastCalledWith('owner','anchor','bike',expect.any(String),'observed_native',2025);
 expect(mocks.start).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('routeInventory.year'),{target:{value:'9999'}});
 expect(screen.getByRole('alert')).toHaveTextContent('routeInventory.invalidYear');
 expect(screen.getByRole('button',{name:'routeInventory.find'})).toBeDisabled();
 expect(validRouteInventoryControls({open:true,observed:true,year:'2025',cursor:'secret'})).toBeNull();
});
it('allows continuation through an empty page and preserves the source return destination',()=>{
 mocks.pages=[routeInventoryPage({more:true,ids:[]})];
 const view=render(<MemoryRouter initialEntries={['/ko/activity/anchor?tab=compare#routes']}><ActivityRouteInventoryPanel activity={activity} observedMetricsIdentity="head"/><Position/></MemoryRouter>);
 fireEvent.click(screen.getByText('routeInventory.title'));
 expect(screen.getByText('routeInventory.emptyMore')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'routeInventory.more'}));expect(mocks.more).toHaveBeenCalledOnce();
 mocks.pages=[routeInventoryPage({ids:['ride']})];view.rerender(<MemoryRouter initialEntries={['/ko/activity/anchor?tab=compare#routes']}><ActivityRouteInventoryPanel activity={activity} observedMetricsIdentity="head"/><Position/></MemoryRouter>);
 fireEvent.click(screen.getByRole('link'));
 expect(screen.getByRole('status')).toHaveTextContent('routeInventoryReturn');
 expect(screen.getByRole('status')).toHaveTextContent('tab=compare');
});
it('restores only an authenticated owner internal activity destination',()=>{
 const target={uid:'owner',pathname:'/ko/activity/anchor',search:'?tab=compare',hash:'#routes'};
 const view=render(<MemoryRouter initialEntries={[{pathname:'/ko/activity/ride',state:{routeInventoryReturn:target}}]}><RouteInventoryReturn ownerUid="owner"/></MemoryRouter>);
 expect(screen.getByRole('link')).toHaveAttribute('href','/ko/activity/anchor?tab=compare#routes');
 mocks.uid='other';view.rerender(<MemoryRouter><RouteInventoryReturn ownerUid="owner"/></MemoryRouter>);expect(screen.queryByRole('link')).toBeNull();
});
