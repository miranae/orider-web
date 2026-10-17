import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import { setCollectionDocs } from '../../__tests__/mocks/firebase';
import { setBoardAuthorBlocked, useBoardBlocks } from './useBoardBlocks';
const mocks = vi.hoisted(() => ({ uid: 'owner', call: vi.fn(), getFunctions: vi.fn(() => ({})) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock('../../services/firebase', () => ({ firestore: {}, functions: { app: { name: 'test' } } }));
vi.mock('firebase/functions', () => ({ getFunctions: mocks.getFunctions, httpsCallable: vi.fn(() => mocks.call), connectFunctionsEmulator: vi.fn() }));
beforeEach(() => { mocks.uid = 'owner'; mocks.call.mockReset().mockResolvedValue({ data: {} }); });
it('uses canonical regional server block mutation for both block and undo', async () => {
  await setBoardAuthorBlocked('target', true);
  await setBoardAuthorBlocked('target', false);
  expect(mocks.getFunctions).toHaveBeenCalledWith(expect.anything(), 'asia-northeast3');
  expect(mocks.call.mock.calls).toEqual([[{ targetUid: 'target', blocked: true }], [{ targetUid: 'target', blocked: false }]]);
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
