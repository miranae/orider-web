import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import { setCollectionDocs } from '../../__tests__/mocks/firebase';
import { setBoardAuthorBlocked, useBoardBlocks } from './useBoardBlocks';
import { functions } from '../../services/firebase';
import { resetRuntimeConfigForTests, STAGE_PARITY_GATEWAY } from '../../services/runtimeConfig';
const mocks = vi.hoisted(() => ({ uid: 'owner', call: vi.fn(), getFunctions: vi.fn(() => ({})), connect: vi.fn(), log: vi.fn(), emulator: false }));
vi.mock('../../services/errorLogger', () => ({logClientError:mocks.log}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock('../../services/firebase', () => ({ ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn(), auth: {}, storage: {}, firestore: {}, functions: { app: { name: 'test' } } }));
vi.mock('firebase/functions', () => ({ getFunctions: mocks.getFunctions, httpsCallable: vi.fn(() => mocks.call), connectFunctionsEmulator: mocks.connect }));
vi.mock('../../services/runtimeConfig', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../services/runtimeConfig')>()), isEmulatorRuntime: () => mocks.emulator }));
beforeEach(() => { mocks.uid = 'owner'; mocks.emulator = false; mocks.log.mockReset(); mocks.getFunctions.mockClear(); mocks.connect.mockReset(); mocks.call.mockReset().mockResolvedValue({ data: {} }); resetRuntimeConfigForTests({}); });
it('logs redacted block failures without replacing the original request error', async () => {
  const failure=Object.assign(new Error('private target and request token'),{code:'functions/unavailable'});
  mocks.call.mockRejectedValueOnce(failure);
  await expect(setBoardAuthorBlocked('private-target',true,functions)).rejects.toBe(failure);
  expect(mocks.log).toHaveBeenCalledWith('Board.authorBlock',expect.any(Error),{operation:'setActivitySocialBlock',blocked:true,errorCode:'functions/unavailable'});
  expect(mocks.log.mock.calls[0][1].message).not.toContain('private');
  expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('private-target');
  mocks.log.mockImplementationOnce(()=>{throw Error('logger unavailable');});mocks.call.mockRejectedValueOnce(failure);
  await expect(setBoardAuthorBlocked('private-target',false,functions)).rejects.toBe(failure);
});
it('retains the supplied parity compute client instead of rebuilding a production regional client', async () => {
  resetRuntimeConfigForTests({appEnvironment:'production',deploymentProfile:'production-parity-stage',firebaseFunctionsBase:STAGE_PARITY_GATEWAY});
  try {
    await setBoardAuthorBlocked('target', true, functions);
    expect(mocks.getFunctions).not.toHaveBeenCalled();
    expect(mocks.call).toHaveBeenCalledWith({targetUid:'target',blocked:true});
  } finally {resetRuntimeConfigForTests({});}
});
it('uses canonical regional server block mutation for both block and undo', async () => {
  await setBoardAuthorBlocked('target', true, functions);
  await setBoardAuthorBlocked('target', false, functions);
  expect(mocks.getFunctions).toHaveBeenCalledWith(expect.anything(), 'asia-northeast3');
  expect(mocks.call.mock.calls).toEqual([[{ targetUid: 'target', blocked: true }], [{ targetUid: 'target', blocked: false }]]);
});
it('connects the regional block callable to the configured Functions emulator port', async () => {
  mocks.emulator = true;
  vi.stubEnv('VITE_FUNCTIONS_EMULATOR_PORT', '5599');
  try {
    await setBoardAuthorBlocked('target', true, functions);
    expect(mocks.connect).toHaveBeenCalledWith(expect.anything(), 'localhost', 5599);
    vi.stubEnv('VITE_FUNCTIONS_EMULATOR_PORT', '');
    await setBoardAuthorBlocked('target', false, functions);
    expect(mocks.connect).toHaveBeenLastCalledWith(expect.anything(), 'localhost', 5001);
  } finally {
    vi.unstubAllEnvs();
  }
});
it('does not connect to an emulator outside the emulator runtime', async () => {
  await setBoardAuthorBlocked('target', true, functions);
  expect(mocks.connect).not.toHaveBeenCalled();
});
it('subscribes to canonical blocks and discards previous account state immediately', async () => {
  setCollectionDocs('users/owner/blocks', [{ id: 'target', targetUid: 'target' }]);
  const { result, rerender } = renderHook(() => useBoardBlocks());
  await waitFor(() => expect(result.current.blockedUsers).toEqual([{ id: 'target', targetUid: 'target' }]));
  act(() => { mocks.uid = 'other'; rerender(); });
  expect(result.current.blockedUsers).toEqual([]);
  act(() => { mocks.uid = ''; rerender(); });
  expect(result.current.blockedUsers).toEqual([]);
});

it('keeps the last known block set and exposes a retryable error on snapshot failure', async () => {
  setCollectionDocs('users/owner/blocks', [{ id: 'target' }]);
  const { result } = renderHook(() => useBoardBlocks());
  await waitFor(() => expect(result.current.blockedUsers).toHaveLength(1));
  const call = vi.mocked(onSnapshot).mock.calls.at(-1)!;
  const fail = call[2] as unknown as (error: Error) => void;
  act(() => fail(new Error('permission-denied')));
  expect(result.current.error?.message).toBe('permission-denied');
  expect(result.current.blockedUsers).toEqual([{ id: 'target', targetUid: 'target' }]);
  expect(result.current.loading).toBe(false);
});
