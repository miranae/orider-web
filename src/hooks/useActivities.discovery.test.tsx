import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useActivities,useActivitySearch} from './useActivities';
import {createMockActivity} from '../__tests__/fixtures/mockData';
const state=vi.hoisted(()=>({user:{uid:'viewer',isAnonymous:false},read:vi.fn(),services:{auth:{currentUser:null}}}));
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('../contexts/FirebaseServicesContext',()=>({useFirebaseServices:()=>state.services}));
vi.mock('../services/activityDiscovery',()=>({loadActivityDiscovery:state.read}));
vi.mock('./useActivitySafety',()=>({useActivitySafety:()=>({allows:()=>true,loading:false,error:false,retry:vi.fn()})}));
vi.mock('../config/activitySubscriptions',()=>({ACTIVITY_SUBSCRIPTIONS_ENABLED:true}));
const row=(id:string)=>createMockActivity({id,userId:'viewer'});
const page=(ids:string[]=[],cursor:string|null=null)=>({items:ids.map(row),nextCursor:cursor,exhausted:cursor===null});
beforeEach(()=>{state.user={uid:'viewer',isAnonymous:false};state.read.mockReset().mockResolvedValue(page());});
it.each(['all','friends','self','following'] as const)('asks the server for %s admission without transmitting client relationship IDs',async scope=>{
 const {result}=renderHook(()=>useActivities(scope,['friend'],{subscriptionIds:['following']}));
 await waitFor(()=>expect(result.current.loading).toBe(false));expect(state.read).toHaveBeenCalledWith(state.services,{scope,limit:3});expect(result.current.totalCount).toBe(0);
});
it('reads first 3 then 7, preserves empty continuation and does not over-fetch a fresh visit',async()=>{
 state.read.mockResolvedValueOnce(page([],'ad1.first')).mockResolvedValueOnce(page([],'ad1.second'));
 const {result}=renderHook(()=>useActivities());await waitFor(()=>expect(result.current.loadingMore).toBe(false));await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));
 expect(state.read.mock.calls[1]![1]).toEqual({scope:'all',limit:7,cursor:'ad1.first'});expect(result.current.hasMore).toBe(true);expect(result.current.activities).toEqual([]);
});
it('merges pages without duplicating changed seek-page rows',async()=>{
 state.read.mockResolvedValueOnce(page(['a'],'ad1.first')).mockResolvedValueOnce(page(['b'],'ad1.second')).mockResolvedValueOnce(page(['b','c']));
 const {result}=renderHook(()=>useActivities());await waitFor(()=>expect(result.current.activities).toHaveLength(2));await act(async()=>result.current.loadMore());expect(result.current.activities.map(a=>a.id)).toEqual(['a','b','c']);
});
it('does not append an old request after an all-self-all cycle',async()=>{
 let resolve!:(v:ReturnType<typeof page>)=>void;
 state.read.mockResolvedValueOnce(page(['a'],'ad1.one')).mockResolvedValueOnce(page(['b'],'ad1.two')).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const {result,rerender}=renderHook(({scope})=>useActivities(scope),{initialProps:{scope:'all' as 'all'|'self'}});await waitFor(()=>expect(result.current.activities).toHaveLength(2));act(()=>{void result.current.loadMore();});await waitFor(()=>expect(resolve).toBeDefined());
 rerender({scope:'self'});await waitFor(()=>expect(result.current.loading).toBe(false));rerender({scope:'all'});await waitFor(()=>expect(result.current.loading).toBe(false));await act(async()=>resolve(page(['stale'])));expect(result.current.activities.some(a=>a.id==='stale')).toBe(false);
});
it('clears accumulated data when the current continuation loses access',async()=>{
 state.read.mockResolvedValueOnce(page(['a'],'ad1.one')).mockResolvedValueOnce(page(['b'],'ad1.two')).mockRejectedValueOnce({code:'functions/permission-denied'});
 const {result}=renderHook(()=>useActivities());await waitFor(()=>expect(result.current.activities).toHaveLength(2));await act(async()=>result.current.loadMore());expect(result.current.activities).toEqual([]);expect(result.current.error).toBe(true);
});
it('retains observations on a temporary continuation failure and permits retry',async()=>{
 state.read.mockResolvedValueOnce(page(['a'],'ad1.one')).mockResolvedValueOnce(page(['b'],'ad1.two')).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(page(['c']));
 const {result}=renderHook(()=>useActivities());await waitFor(()=>expect(result.current.activities).toHaveLength(2));await act(async()=>result.current.loadMore());expect(result.current.activities).toHaveLength(2);await act(async()=>result.current.loadMore());expect(result.current.activities).toHaveLength(3);
});
it('replays visited depth through new authorized pages after return',async()=>{
 const ids=Array.from({length:20},(_,i)=>String(i));state.read.mockImplementation(async(_s,req)=>{const offset=req.cursor?Number(req.cursor.split('.').pop()):0;const end=offset+req.limit;return page(ids.slice(offset,end),end<ids.length?'ad1.'+end:null);});
 const first=renderHook(()=>useActivities('all',[],{navigationKey:'restore'}));await waitFor(()=>expect(first.result.current.activities).toHaveLength(10));await act(async()=>first.result.current.loadMore());expect(first.result.current.activities).toHaveLength(20);first.unmount();
 const second=renderHook(()=>useActivities('all',[],{navigationKey:'restore'}));await waitFor(()=>expect(second.result.current.activities).toHaveLength(20));expect(state.read).toHaveBeenCalledTimes(6);
});
it('does not read inactive search, forwards token/date and supports empty next pages',async()=>{
 state.read.mockResolvedValueOnce(page([],'ad1.search')).mockResolvedValueOnce(page(['match']));const {result}=renderHook(()=>useActivitySearch(new Set()));expect(state.read).not.toHaveBeenCalled();
 act(()=>result.current.search('Ride 한강','30d'));await waitFor(()=>expect(result.current.loading).toBe(false));expect(state.read.mock.calls[0]![1]).toMatchObject({scope:'all',keyword:'ride',limit:20,fromInclusive:expect.any(Number)});expect(result.current.hasMore).toBe(true);act(()=>result.current.loadMore());await waitFor(()=>expect(result.current.results).toHaveLength(1));
});
it('hides old-account search results while the new request is pending',async()=>{
 state.read.mockResolvedValueOnce(page(['old'])).mockImplementationOnce(()=>new Promise(()=>{}));const {result,rerender}=renderHook(()=>useActivitySearch(new Set()));act(()=>result.current.search('ride'));await waitFor(()=>expect(result.current.results).toHaveLength(1));state.user={uid:'other',isAnonymous:false};rerender();expect(result.current.results).toEqual([]);
});
it('uses the server following scope and reset clears search rows',async()=>{
 state.read.mockResolvedValue(page(['match']));const {result}=renderHook(()=>useActivitySearch(new Set(),{ids:['not-authority'],key:'k',ready:true}));act(()=>result.current.search('ride'));await waitFor(()=>expect(result.current.results).toHaveLength(1));expect(state.read.mock.calls[0]![1]).toMatchObject({scope:'following'});act(()=>result.current.reset());expect(result.current.results).toEqual([]);expect(result.current.active).toBe(false);
});
it('shares a current initial request across concurrent mounts',async()=>{
 let resolve!:(v:ReturnType<typeof page>)=>void;state.read.mockImplementation(()=>new Promise(r=>{resolve=r;}));const a=renderHook(()=>useActivities()),b=renderHook(()=>useActivities());await waitFor(()=>expect(state.read).toHaveBeenCalledOnce());await act(async()=>resolve(page(['shared'])));expect(a.result.current.activities).toHaveLength(1);expect(b.result.current.activities).toHaveLength(1);
});
it('keeps a successful empty feed distinct from a failed initial request and manual retry',async()=>{
 state.read.mockRejectedValue(Error('offline'));const {result}=renderHook(()=>useActivities());await waitFor(()=>expect(result.current.error).toBe(true),{timeout:3500});expect(result.current.activities).toEqual([]);state.read.mockResolvedValue(page());act(()=>result.current.retry());await waitFor(()=>expect(result.current.error).toBe(false));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.activities).toEqual([]);
});
it('settles a hanging initial request after a single bounded timeout retry',async()=>{
 vi.useFakeTimers();try{state.read.mockImplementation(()=>new Promise(()=>{}));const {result,unmount}=renderHook(()=>useActivities());await act(async()=>{await vi.advanceTimersByTimeAsync(25000);});expect(result.current.loading).toBe(false);expect(result.current.error).toBe(true);expect(state.read).toHaveBeenCalledTimes(2);unmount();}finally{vi.useRealTimers();}
});
it('restores search depth with fresh pages and no stored payloads',async()=>{
 const ids=Array.from({length:25},(_,i)=>String(i));state.read.mockImplementation(async(_s,req)=>{const offset=req.cursor?20:0;return page(ids.slice(offset,offset+20),offset===0?'ad1.more':null);});const first=renderHook(()=>useActivitySearch(new Set(),undefined,'restore-search'));act(()=>first.result.current.search('ride'));await waitFor(()=>expect(first.result.current.results).toHaveLength(20));act(()=>first.result.current.loadMore());await waitFor(()=>expect(first.result.current.results).toHaveLength(25));first.unmount();const second=renderHook(()=>useActivitySearch(new Set(),undefined,'restore-search'));act(()=>second.result.current.search('ride'));await waitFor(()=>expect(second.result.current.results).toHaveLength(25));expect(state.read).toHaveBeenCalledTimes(4);
});
