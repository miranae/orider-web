import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BoardPage from './BoardPage';

const board = vi.hoisted(() => ({ list: vi.fn(), refresh: vi.fn(), goToPage: vi.fn(), mobile: false }));
vi.mock('../hooks/useMobile', () => ({ useMobile: () => board.mobile }));
vi.mock('../features/board/useBoard', () => ({
  useBoardPosts: (...args: unknown[]) => {
    board.list(...args);
    return {
      posts: [{ id: 'post-1', boardType: 'free', title: '라이딩 이야기', content: '본문 미리보기\n![private-photo](gs://test-orider/board_images/owner/post/photo.png)\n![public-photo](https://example.com/photo.png)', createdAt: 1720000000000, tags: ['road'], nickname: 'Rider', viewCount: 1200, likeCount: 4, commentCount: 2, userId: 'other', imageUrls: ['https://example.com/board-image.jpg'] }],
      total: 80, totalPages: 4, page: args[5], loading: false, error: null,
      refresh: board.refresh, goToPage: board.goToPage,
    };
  },
  useBoardMeta: () => ({ tags: [{ name: 'road', count: 3 }, { name: 'AI', count: 2 }] }),
  useMyInquiryPosts: () => ({ posts: [], loading: false, error: null, refresh: vi.fn() }),
  useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'test-user' } }) }));

function Surface() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="url">{location.pathname}{location.search}</output>
    <output data-testid="board-return-to">{location.state?.boardReturnTo}</output>
    {location.pathname.endsWith('/post-1') ? <button onClick={() => navigate(-1)}>목록으로 복귀</button> : <BoardPage />}
  </>;
}

function renderBoard(route = '/ko/community/board') {
  return render(<MemoryRouter initialEntries={[route]}><Surface /></MemoryRouter>);
}

beforeEach(() => { board.mobile = false; board.list.mockClear(); board.refresh.mockClear(); board.goToPage.mockClear(); });

describe('board navigation and independent controls', () => {
  it('keeps image alt text and storage paths out of post excerpts', () => {
    renderBoard();
    expect(screen.getByText('본문 미리보기')).toBeInTheDocument();
    expect(screen.queryByText(/gs:\/\/|private-photo|public-photo|example\.com\/photo/)).not.toBeInTheDocument();
  });

  it('reads archive deep links and follows browser history for category changes', async () => {
    renderBoard('/ko/community/board?type=archive&page=3');
    expect(screen.getByRole('heading', { level: 1, name: '게시판' })).toBeVisible();
    expect(screen.getByRole('button', { name: '이맘쯤 우리는' })).toHaveAttribute('aria-pressed', 'true');
    expect(board.list).toHaveBeenLastCalledWith('archive', 20, undefined, '', [], 3, false);
    fireEvent.click(screen.getByRole('button', { name: '작업일지' }));
    expect(screen.getByTestId('url')).toHaveTextContent('?type=devlog');
    expect(screen.queryByRole('button', { name: '글쓰기' })).not.toBeInTheDocument();
  });

  it('keeps query, tag and exclusions while paginating and returning from a title link', async () => {
    renderBoard('/ko/community/board?type=archive&q=bike&tag=road&exclude=AI');
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByTestId('url')).toHaveTextContent('type=archive&q=bike&tag=road&exclude=AI&page=2');
    fireEvent.click(screen.getByRole('link', { name: '라이딩 이야기' }));
    expect(screen.getByTestId('url')).toHaveTextContent('/ko/community/board/post-1');
    expect(screen.getByTestId('board-return-to')).toHaveTextContent('/ko/community/board?type=archive&q=bike&tag=road&exclude=AI&page=2');
    fireEvent.click(screen.getByRole('button', { name: '목록으로 복귀' }));
    await waitFor(() => expect(board.list).toHaveBeenLastCalledWith('archive', 20, 'road', 'bike', ['AI'], 2, false));
    expect(screen.getByRole('searchbox')).toHaveValue('bike');
  });

  it('submits a new search from page one and updates the URL', () => {
    renderBoard('/ko/community/board?page=3');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' gravel ' } });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(screen.getByTestId('url')).toHaveTextContent('?q=gravel');
    expect(board.list).toHaveBeenLastCalledWith('all', 20, undefined, 'gravel', [], 1, false);
    fireEvent.click(screen.getByTitle('검색 초기화'));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('lets tag controls filter without opening the post and identifies exclusion state', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: '태그 제외 (2)' }));
    const exclude = screen.getByRole('button', { name: 'AI 태그 제외' });
    expect(exclude).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(exclude);
    expect(exclude).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('url')).toHaveTextContent('/ko/community/board?exclude=AI');
    expect(screen.getByRole('link', { name: '라이딩 이야기' })).toHaveAttribute('href', '/ko/community/board/post-1');
  });

  it('keeps mobile metadata and title full width and groups only the preview with the thumbnail', () => {
    board.mobile = true;
    renderBoard();
    const thumbnail = screen.getByRole('img', { name: '썸네일' });
    const summary = thumbnail.closest('.board-list-summary');
    expect(summary).not.toBeNull();
    expect(summary).toHaveTextContent('본문 미리보기');
    expect(summary).not.toContainElement(screen.getByRole('heading', { name: '라이딩 이야기' }));
    expect(summary).not.toContainElement(screen.getByText('Rider'));
    expect(screen.getAllByRole('img', { name: '썸네일' })).toHaveLength(1);
  });

  it('clears stale search and category state when entering my posts', () => {
    renderBoard('/ko/community/board?type=devlog&q=bike&page=2');
    fireEvent.click(screen.getByRole('button', { name: '내 글' }));
    expect(screen.getByTestId('url')).toHaveTextContent('/ko/community/board?view=mine');
    expect(screen.getByRole('searchbox')).toBeDisabled();
    expect(board.list).toHaveBeenLastCalledWith('all', 20, undefined, '', [], 1, true);
  });
});
