import {act,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {routeInventoryPage,inventoryNow} from '../__tests__/fixtures/routeInventory';
import {useActivityMatchedRouteInventory} from './useActivityMatchedRouteInventory';
const mocks=vi.hoisted(()=>({user:{uid:'owner',isAnonymous:false},services:{auth:{currentUser:{uid:'owner',isAnonymous:false},app:{name:'demo',options:{projectId:'demo-test'}}}},load:vi.fn(),observer:null as null|((u:{uid:string;isAnonymous:boolean})=>void)}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('../contexts/FirebaseServicesContext',()=>({useFirebaseServices:()=>mocks.services}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_:unknown,cb:typeof mocks.observer)=>{mocks.observer=cb;return vi.fn();}}));
vi.mock('../services/activityRouteEvidence',async original=>({...await original<typeof import('../services/activityRouteEvidence')>(),observedRouteAvailable:()=>true}));
vi.mock('../services/activityMatchedRouteInventory',async original=>({...await original<typeof import('../services/activityMatchedRouteInventory')>(),loadActivityMatchedRouteInventory:mocks.load}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(inventoryNow);mocks.user={uid:'owner',isAnonymous:false};mocks.services.auth.currentUser={...mocks.user};mocks.load.mockReset().mockResolvedValue(routeInventoryPage());});
afterEach(()=>vi.useRealTimers());
it('loads only explicit pages including empty continuation and retries network errors without replaying old pages',async()=>{
 mocks.load.mockResolvedValueOnce(routeInventoryPage({more:true,ids:[]})).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(routeInventoryPage({ids:['later']}));
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head','observed_native',2026));expect(mocks.load).not.toHaveBeenCalled();
 await act(async()=>h.result.current.start());expect(h.result.current.status).toBe('partial');
 await act(async()=>h.result.current.loadMore());expect(h.result.current.status).toBe('error');expect(h.result.current.pages).toHaveLength(1);
 await act(async()=>h.result.current.loadMore());expect(h.result.current.status).toBe('complete');expect(h.result.current.pages).toHaveLength(2);
 expect(mocks.load.mock.calls[1][2]).toMatchObject({inventoryCursor:routeInventoryPage({more:true}).inventory.nextCursor,year:2026,geometryPolicy:'observed_native'});
});
it('clears previous rows on own app content mutation and rejects its pending result',async()=>{
 let resolve!:(v:ReturnType<typeof routeInventoryPage>)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head'));
 let pending!:Promise<void>;act(()=>{pending=h.result.current.start();});
 act(()=>window.dispatchEvent(new CustomEvent('orider:activity-content-changed',{detail:{activityId:'any-own-edit'}})));
 await act(async()=>{resolve(routeInventoryPage());await pending;});expect(h.result.current.pages).toEqual([]);expect(h.result.current.status).toBe('invalidated');
});
it('clears on year or anchor revision changes without automatically reading',async()=>{
 const h=renderHook(({year,head})=>useActivityMatchedRouteInventory('owner','anchor','bike',head,'observed_native',year),{initialProps:{year:2026,head:'one'}});
 await act(async()=>h.result.current.start());h.rerender({year:2025,head:'one'});expect(h.result.current.pages).toEqual([]);expect(mocks.load).toHaveBeenCalledTimes(1);
 await act(async()=>h.result.current.start());h.rerender({year:2025,head:'two'});expect(h.result.current.pages).toEqual([]);
});
it('expires and removes account A results across A→B→A',async()=>{
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head'));
 await act(async()=>h.result.current.start());act(()=>vi.advanceTimersByTime(1800000));expect(h.result.current.status).toBe('expired');expect(h.result.current.pages).toEqual([]);
 vi.setSystemTime(inventoryNow);await act(async()=>h.result.current.start());act(()=>{mocks.services.auth.currentUser={uid:'other',isAnonymous:false};mocks.observer!(mocks.services.auth.currentUser);mocks.services.auth.currentUser={uid:'owner',isAnonymous:false};mocks.observer!(mocks.services.auth.currentUser);});expect(h.result.current.pages).toEqual([]);
});
it('failed-precondition invalidates all accumulated observations',async()=>{
 mocks.load.mockResolvedValueOnce(routeInventoryPage({more:true})).mockRejectedValueOnce({code:'functions/failed-precondition'});
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head'));
 await act(async()=>h.result.current.start());await act(async()=>h.result.current.loadMore());expect(h.result.current.pages).toEqual([]);expect(h.result.current.status).toBe('invalidated');
});

it('removes existing pages immediately when the same UID SDK session is replaced',async()=>{
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head'));
 await act(async()=>h.result.current.start());expect(h.result.current.pages).toHaveLength(1);
 act(()=>{mocks.services.auth.currentUser={...mocks.services.auth.currentUser};mocks.observer!(mocks.services.auth.currentUser);});
 expect(h.result.current.pages).toEqual([]);expect(h.result.current.status).toBe('idle');
 expect(mocks.load).toHaveBeenCalledOnce();
});
it('drops a delayed prior-session response without resetting a fresh request',async()=>{
 let resolve!:(v:ReturnType<typeof routeInventoryPage>)=>void;
 mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const h=renderHook(()=>useActivityMatchedRouteInventory('owner','anchor','bike','head'));
 let old!:Promise<void>;act(()=>{old=h.result.current.start();});
 mocks.services.auth.currentUser={...mocks.services.auth.currentUser};h.rerender();
 expect(h.result.current.pages).toEqual([]);
 await act(async()=>h.result.current.start());
 expect(h.result.current.status).toBe('complete');
 await act(async()=>{resolve(routeInventoryPage({ids:['stale']}));await old;});
 expect(h.result.current.pages[0].members[0].activityId).not.toBe('stale');
 expect(h.result.current.status).toBe('complete');
});
