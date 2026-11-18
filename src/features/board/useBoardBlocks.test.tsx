import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import { setCollectionDocs } from '../../__tests__/mocks/firebase';
import { setBoardAuthorBlocked, useBoardBlocks } from './useBoardBlocks';
import { functions } from '../../services/firebase';
import { resetRuntimeConfigForTests, BUNDLED_FUNCTIONS_BASES, BUNDLED_AI_BASES } from '../../services/runtimeConfig';
const mocks = vi.hoisted(() => ({ uid: 'owner', call: vi.fn(), getFunctions: vi.fn(() => ({})), connect: vi.fn(), emulator: false }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock('../../services/firebase', () => ({ ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn(), auth: {}, storage: {}, firestore: {}, functions: { app: { name: 'test' } } }));
vi.mock('firebase/functions', () => ({ getFunctions: mocks.getFunctions, httpsCallable: vi.fn(() => mocks.call), connectFunctionsEmulator: mocks.connect }));
vi.mock('../../services/runtimeConfig', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../services/runtimeConfig')>()), isEmulatorRuntime: () => mocks.emulator }));
beforeEach(() => { resetRuntimeConfigForTests({ appEnvironment: 'production' }); mocks.getFunctions.mockClear(); mocks.uid = 'owner'; mocks.emulator = false; mocks.connect.mockReset(); mocks.call.mockReset().mockResolvedValue({ data: {} }); });
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

it('preserves legacy isolated QA board mutations on the original regional client', async () => {
  resetRuntimeConfigForTests({ appEnvironment: 'stage' });
  await setBoardAuthorBlocked('target', true, functions);
  expect(mocks.getFunctions).toHaveBeenCalledWith(functions.app, 'asia-northeast3');
});
it.each(['development', 'production'] as const)('uses the injected board client only for explicit bundled %s', async environment => {
  const base = BUNDLED_FUNCTIONS_BASES[environment];
  resetRuntimeConfigForTests({ appEnvironment: 'production', deploymentProfile: `bundled-${environment}`,
    firebaseProjectId: 'miranae-orider-g1', firebaseFunctionsRegion: 'asia-northeast3', firebaseFunctionsBase: base,
    socialAuthFunctionsBase: base, personalApiBase: base, publicClubApiUrl: `${base}/publicClubs`, aiApiBase: BUNDLED_AI_BASES[environment] });
  await setBoardAuthorBlocked('target', true, functions);
  expect(mocks.getFunctions).not.toHaveBeenCalled();
  const { httpsCallable } = await import('firebase/functions');
  expect(httpsCallable).toHaveBeenLastCalledWith(functions, 'setActivitySocialBlock');
});
