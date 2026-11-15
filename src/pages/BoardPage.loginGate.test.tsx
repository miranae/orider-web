import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BoardPage from './BoardPage';

const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../hooks/useMobile', () => ({ useMobile: () => false }));
vi.mock('../features/board/useBoard', () => ({
  useBoardPosts: () => ({ posts: [], total: 0, totalPages: 0, page: 1, loading: false, error: null, refresh: vi.fn(), goToPage: vi.fn() }),
  useBoardMeta: () => ({ tags: [] }),
  useMyInquiryPosts: () => ({ posts: [], loading: false, error: null, refresh: vi.fn() }),
  useDeletePost: () => ({ deletePost: vi.fn(), deleting: false }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, signIn: auth.signIn }) }));

describe('board login gate', () => {
  it.each(['/ko/community/board?view=mine', '/ko/community/board?type=inquiry&view=my'])('로그인이 필요한 내 글 목록(%s)은 로그인 버튼으로 로그인 창을 연다', route => {
    render(<MemoryRouter initialEntries={[route]}><BoardPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    auth.signIn.mockClear();
  });
});
