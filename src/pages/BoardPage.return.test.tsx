import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BoardPage from './BoardPage';
import PostDetailPage from './PostDetailPage';

const fixture = vi.hoisted(() => ({ commentsLoading: false, commentsError: null as Error | null, post: {
  id: 'post-1', boardType: 'free', title: '목록 복귀 확인', content: '게시글 본문', createdAt: 1720000000000,
  tags: [], nickname: 'Rider', viewCount: 12, likeCount: 0, commentCount: 0, userId: 'author',
} }));
vi.mock('../features/board/useBoard', () => ({
  useBoardPosts: (...args: unknown[]) => ({ posts: [fixture.post], total: 80, totalPages: 4, page: args[5], loading: false, error: null, refresh: vi.fn(), goToPage: vi.fn() }),
  useBoardMeta: () => ({ tags: [] }),
  useMyInquiryPosts: () => ({ posts: [], loading: false, error: null, refresh: vi.fn() }),
  useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }),
  useReportBoardContent: () => ({ report: vi.fn(), submitting: false }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../hooks/useFirestore', () => ({
  useDocument: (collection: string) => ({ data: collection === 'board_posts' ? fixture.post : null, loading: false, error: null }),
  useCollection: () => ({ data: [], loading: fixture.commentsLoading, error: fixture.commentsError }),
  where: vi.fn(), orderBy: vi.fn(),
}));
vi.mock('../features/board/useBoardLike', () => ({ useBoardLike: () => ({ isLiked: false, likeCount: 0, likers: [], toggleLike: vi.fn() }) }));
vi.mock('../features/board/useComment', () => ({ useCreateComment: () => ({ createComment: vi.fn(), submitting: false }), softDeleteBoardComment: vi.fn() }));
vi.mock('./useBoardPostView', () => ({ useBoardPostView: vi.fn() }));

function App() {
  const location = useLocation();
  return <><output data-testid="return-url">{location.pathname}{location.search}</output><Routes>
    <Route path="/:lang/community/board" element={<BoardPage />} />
    <Route path="/:lang/community/board/:postId" element={<PostDetailPage />} />
  </Routes></>;
}

describe('board list to detail and back', () => {
  beforeEach(() => { fixture.commentsLoading = false; fixture.commentsError = null; });

  it.each(['loading', 'error'] as const)('does not announce a visible zero count while comments are %s', (state) => {
    fixture.commentsLoading = state === 'loading';
    fixture.commentsError = state === 'error' ? new Error('unavailable') : null;
    render(<MemoryRouter initialEntries={['/ko/community/board/post-1']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '표시된 댓글' })).toHaveTextContent(/^표시된 댓글$/);
    expect(screen.getByText('전체 댓글 0개')).toBeInTheDocument();
  });

  it.each(['ko', 'en'])('returns to the same %s filtered page using the actual detail page board button', (lang) => {
    const route = `/${lang}/community/board?type=archive&q=bike&tag=road&exclude=AI&page=2`;
    render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: '목록 복귀 확인' }));
    expect(screen.getByRole('heading', { level: 1, name: '목록 복귀 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '게시판으로' }));
    expect(screen.getByTestId('return-url')).toHaveTextContent(route);
    expect(screen.getByRole('searchbox')).toHaveValue('bike');
    expect(screen.getByRole('button', { name: '2', current: 'page' })).toBeInTheDocument();
  });
});
