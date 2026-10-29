import { act, renderHook, waitFor } from '@testing-library/react';
import { useLinkedPublicActivity } from './useLinkedPublicActivity';
const fixture=vi.hoisted(()=>({services:{auth:{currentUser:{uid:'a'} as {uid:string}|null}},load:vi.fn(),changed:()=>{}}));
vi.mock('../contexts/FirebaseServicesContext',()=>({useFirebaseServices:()=>fixture.services}));
vi.mock('../services/publicActivityDetail',()=>({createPublicActivityClient:()=>({load:fixture.load})}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_auth:unknown,listener:()=>void)=>{fixture.changed=listener;return ()=>{};}}));
const detail=(id:string)=>({activity:{id,nickname:'safe',description:'ride'},content:{activityId:id}});
beforeEach(()=>{fixture.load.mockReset();fixture.services={auth:{currentUser:{uid:'a'}}};});
it('uses public detail and clears on failed reauthorization',async()=>{
 fixture.load.mockResolvedValue(detail('ride'));
 const {result}=renderHook(()=>useLinkedPublicActivity('ride'));
 await waitFor(()=>expect(result.current?.activity.id).toBe('ride'));
 fixture.load.mockRejectedValue({code:'functions/permission-denied'});
 act(()=>window.dispatchEvent(new Event('orider:activity-safety-changed')));
 expect(result.current).toBeNull();
 await waitFor(()=>expect(fixture.load).toHaveBeenCalledTimes(2));
});
it('rejects stale ID response and same uid replacement',async()=>{
 let finish!:(v:unknown)=>void;fixture.load.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const {result,rerender}=renderHook(({id})=>useLinkedPublicActivity(id),{initialProps:{id:'old'}});
 const old=finish;fixture.load.mockResolvedValue(detail('new'));rerender({id:'new'});
 await waitFor(()=>expect(result.current?.activity.id).toBe('new'));
 await act(async()=>old(detail('old')));expect(result.current?.activity.id).toBe('new');
 act(()=>{fixture.services.auth.currentUser={uid:'a'};fixture.changed();});expect(result.current).toBeNull();
});
it('removes prior project data and rejects mismatched DTO IDs',async()=>{
 fixture.load.mockResolvedValue(detail('ride'));const {result,rerender}=renderHook(()=>useLinkedPublicActivity('ride'));
 await waitFor(()=>expect(result.current).not.toBeNull());
 fixture.services={auth:{currentUser:{uid:'a'}}};fixture.load.mockResolvedValue(detail('foreign'));rerender();
 expect(result.current).toBeNull();await act(async()=>{});expect(result.current).toBeNull();
});
