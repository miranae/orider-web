import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {auth} from '../services/firebase';
import {getGroupInviteCode,regenerateGroupInviteCode} from '../features/group/groupInviteAdmin';
import {useGroupInviteCode} from './useGroupInviteCode';
vi.mock('../features/group/groupInviteAdmin',()=>({getGroupInviteCode:vi.fn(),regenerateGroupInviteCode:vi.fn()}));
const issued=(inviteCode='ABCD-EFGH')=>({inviteCode,expiresAt:Date.now()+86400000,useLimit:10,useCount:1});
beforeEach(()=>{vi.mocked(getGroupInviteCode).mockReset().mockResolvedValue(issued());vi.mocked(regenerateGroupInviteCode).mockReset();Object.assign(auth,{currentUser:{uid:'owner'}});});
describe('canonical club invite state',()=>{
  it('updates the link and metadata together after regeneration without another read',async()=>{
    const next={...issued('JKLM-NPQR'),useCount:0,useLimit:20};vi.mocked(regenerateGroupInviteCode).mockResolvedValue(next);
    const {result}=renderHook(()=>useGroupInviteCode('club','owner'));
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    await act(async()=>{expect(await result.current.regenerate()).toBe(true);});
    expect(result.current.code).toBe('JKLM-NPQR');expect(result.current.details).toEqual(next);
    expect(getGroupInviteCode).toHaveBeenCalledTimes(1);
  });
  it('keeps the usable code and metadata when regeneration fails and allows a retry',async()=>{
    vi.mocked(regenerateGroupInviteCode).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(issued('JKLM-NPQR'));
    const {result}=renderHook(()=>useGroupInviteCode('club','owner'));
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    await act(async()=>{await expect(result.current.regenerate()).rejects.toThrow('offline');});
    expect(result.current.code).toBe('ABCD-EFGH');expect(result.current.details?.useCount).toBe(1);
    await act(async()=>{await result.current.regenerate();});expect(result.current.code).toBe('JKLM-NPQR');
  });
  it('discards an old account or group regeneration response',async()=>{
    let finish!:(value:ReturnType<typeof issued>)=>void;
    vi.mocked(regenerateGroupInviteCode).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const {result,rerender}=renderHook(({group,user})=>useGroupInviteCode(group,user),{initialProps:{group:'old',user:'owner'}});
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    let pending!:Promise<boolean>;act(()=>{pending=result.current.regenerate();});
    Object.assign(auth,{currentUser:{uid:'other'}});rerender({group:'new',user:'other'});
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    await act(async()=>{finish(issued('JKLM-NPQR'));expect(await pending).toBe(false);});
    expect(result.current.code).toBe('ABCD-EFGH');
  });
});
