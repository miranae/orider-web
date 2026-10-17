import { act, renderHook, waitFor } from '@testing-library/react';
import { getDocs, startAfter, where, orderBy, setDoc } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCallableInvocations, setCallableImplementation, setCollectionDocs } from '../../__tests__/mocks/firebase';
import { useBoardPosts, useMyInquiryPosts, useCreatePost } from './useBoard';

const auth = vi.hoisted(() => ({ user: { uid: 'first-user' } as { uid: string } | null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

const searchPosts = Array.from({ length: 7 }, (_, index) => ({
  id: `post-${index}`, title: `Post ${index}`, createdAt: 100, pinned: index < 2,
}));

beforeEach(() => {
  auth.user = { uid: 'first-user' };
  vi.mocked(getDocs).mockClear();
  vi.mocked(startAfter).mockClear();
  setCallableImplementation('searchBoardPosts', (value) => {
    const params = value as { boardType: string; page?: number; limitCount: number };
    const start = params.boardType === 'archive' ? ((params.page ?? 1) - 1) * params.limitCount : 0;
    return { data: { posts: searchPosts.slice(start, start + params.limitCount), total: searchPosts.length } };
  });
});

describe('board URL pagination', () => {
  it('preserves pinned and same-timestamp search results across pages with the existing server contract', async () => {
    const { result, rerender } = renderHook(({ page }) => useBoardPosts('all', 2, undefined, 'bike', [], page), { initialProps: { page: 1 } });
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(['post-0', 'post-1']));
    rerender({ page: 2 });
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(['post-2', 'post-3']));
    expect(mockCallableInvocations.at(-1)?.data).toMatchObject({ keyword: 'bike', limitCount: 4, publicOnly: true });
    expect(mockCallableInvocations.at(-1)?.data).not.toHaveProperty('cursor');
    rerender({ page: 1 });
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(['post-0', 'post-1']));
  });

  it('uses archive page numbers rather than slicing the already paginated response', async () => {
    const { result } = renderHook(() => useBoardPosts('archive', 2, undefined, undefined, [], 3));
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(['post-4', 'post-5']));
    expect(mockCallableInvocations.at(-1)?.data).toEqual({ boardType: 'archive', tag: undefined, publicOnly: true, page: 3, limitCount: 2 });
  });

  it('does not reuse a previous category cursor after changing filters', async () => {
    setCollectionDocs('board_posts', searchPosts);
    const { result, rerender } = renderHook(({ tag, page }) => useBoardPosts('all', 2, tag, undefined, [], page), { initialProps: { tag: 'road', page: 1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const previousSnapshot = await vi.mocked(getDocs).mock.results.at(-1)!.value;
    const previousCursor = previousSnapshot.docs.at(-1);
    vi.mocked(getDocs).mockClear();
    vi.mocked(startAfter).mockClear();
    rerender({ tag: 'gravel', page: 2 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBe(2);
    // 캐시가 없는 새 필터는 앞 문서를 새로 읽어 offset을 계산한다.
    expect(vi.mocked(getDocs).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(startAfter).mock.calls.every(call => call[0] !== previousCursor)).toBe(true);
  });

  it('limits only latest undeleted inquiries rather than arbitrary owner posts', async () => {
    const { result } = renderHook(() => useMyInquiryPosts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(where).toHaveBeenCalledWith('boardType', '==', 'inquiry');
    expect(where).toHaveBeenCalledWith('deletedAt', '==', null);
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('hides private inquiry results while another account is loading', async () => {
    setCollectionDocs('board_posts', [{ ...searchPosts[0]!, boardType: 'inquiry', deletedAt: null }]);
    const { result, rerender } = renderHook(() => useMyInquiryPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    vi.mocked(getDocs).mockImplementationOnce(() => new Promise(() => {}));
    act(() => { auth.user = { uid: 'second-user' }; rerender(); });
    expect(result.current.posts).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('never returns another account’s private inquiries when the new account request fails', async () => {
    setCollectionDocs('board_posts', [{ ...searchPosts[0]!, boardType: 'inquiry', deletedAt: null }]);
    const { result, rerender } = renderHook(() => useMyInquiryPosts());
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission-denied'));
    act(() => { auth.user = { uid: 'second-user' }; rerender(); });
    await waitFor(() => expect(result.current.error?.message).toBe('permission-denied'));
    expect(result.current.loading).toBe(false);
    expect(result.current.posts).toEqual([]);
  });

  it('never returns another owner’s posts when the new owner request fails', async () => {
    setCollectionDocs('board_posts', searchPosts);
    const { result, rerender } = renderHook(() => useBoardPosts('all', 2, undefined, undefined, [], 1, true));
    await waitFor(() => expect(result.current.posts).toHaveLength(7));
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission-denied'));
    act(() => { auth.user = { uid: 'second-user' }; rerender(); });
    await waitFor(() => expect(result.current.error?.message).toBe('permission-denied'));
    expect(result.current.loading).toBe(false);
    expect(result.current.posts).toEqual([]);
  });

  it('clears owner data immediately when the signed-in account signs out' , async () => {
    setCollectionDocs('board_posts', searchPosts);
    const { result, rerender } = renderHook(() => useBoardPosts('all', 2, undefined, undefined, [], 1, true));
    await waitFor(() => expect(result.current.posts).toHaveLength(7));
    act(() => { auth.user = null; rerender(); });
    expect(result.current.posts).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(0);
  });
});

 it('creates the post at the ID allocated before protected attachment upload', async () => {
  const { result } = renderHook(() => useCreatePost());
  let id: string | undefined;
  await act(async () => { id = await result.current.createPost({ boardType: 'inquiry', title: 'Private', content: 'Body', isPrivate: true, imageUrls: ['gs://bucket/board_images/first-user/preallocated/image.png'] }, 'preallocated'); });
  expect(id).toBe('preallocated');
  expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'board_posts/preallocated' }), expect.objectContaining({ userId: 'first-user', isPrivate: true }));
 });
