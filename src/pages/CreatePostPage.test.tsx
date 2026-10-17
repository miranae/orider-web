import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePostPage from './CreatePostPage';

const mocks = vi.hoisted(() => ({ mobile: false, loading: false, user: { uid: 'writer' } as { uid: string } | null, showToast: vi.fn(), alert: vi.fn(), navigate: vi.fn() }));
vi.mock('../hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => mocks.navigate }));
vi.mock('../hooks/useMobile', () => ({ useMobile: () => mocks.mobile }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.loading }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../contexts/DialogContext', () => ({ useDialog: () => ({ alert: mocks.alert, prompt: vi.fn() }) }));
vi.mock('../features/board/useBoard', () => ({ useCreatePost: () => ({ createPost: vi.fn(), submitting: false }) }));
vi.mock('../services/firebase', () => ({ storage: {} }));
vi.mock('../hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => ({ requestLeave: (leave: () => void) => leave(), guardDialog: null }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { rows?: number; cols?: number }) => options?.rows ? `${options.rows} × ${options.cols}` : key, i18n: { language: 'en' } }) }));

function RouteProbe() { return <output data-testid="route">{useLocation().pathname}</output>; }

function renderPage(route = '/community/board/new') {
  return render(<MemoryRouter initialEntries={[route]}><CreatePostPage /><RouteProbe /></MemoryRouter>);
}

describe('board writing interactions', () => {
  beforeEach(() => {
    mocks.mobile = false;
    mocks.loading = false;
    mocks.user = { uid: 'writer' };
    mocks.navigate.mockClear();
    mocks.alert.mockClear();
    mocks.showToast.mockClear();
    localStorage.clear();
    // jsdom does not implement the browser rich-text command API.
    document.queryCommandState = vi.fn(() => false);
  });

  it('waits for persisted authentication before redirecting a cold write route', () => {
    mocks.loading = true;
    mocks.user = null;
    const { rerender } = renderPage('/community/board/write');
    expect(screen.queryByTestId('M2-W')).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('route')).toHaveTextContent('/community/board/write');
    mocks.loading = false;
    mocks.user = { uid: 'writer' };
    rerender(<MemoryRouter initialEntries={['/community/board/write']}><CreatePostPage /><RouteProbe /></MemoryRouter>);
    expect(screen.getByTestId('M2-W')).toBeInTheDocument();
  });

  it('restores draft body only after the editor mounts following auth restoration', () => {
    mocks.loading = true;
    localStorage.setItem('orider.boardDraft:writer:free', JSON.stringify({ title: 'Saved title', contentHtml: '<p>Saved body</p>' }));
    const { rerender } = renderPage('/community/board/write');
    mocks.loading = false;
    rerender(<MemoryRouter initialEntries={['/community/board/write']}><CreatePostPage /><RouteProbe /></MemoryRouter>);
    expect(screen.getByRole('textbox', { name: 'placeholder.title' })).toHaveValue('Saved title');
    expect(screen.getByRole('textbox', { name: 'label.editor' })).toHaveTextContent('Saved body');
  });

  it.each([
    new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  ])('rejects unsupported or oversized attachments before upload: $name', file => {
    renderPage();
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.showToast).toHaveBeenCalledWith('message.imageUnsupported', 'info');
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(document.querySelector('img[data-blob]')).toBeNull();
  });

  it('labels title and body, requires a title, and returns to the board from a direct link', () => {
    renderPage();
    expect(screen.getByRole('textbox', { name: 'placeholder.title' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'placeholder.title' })).toHaveAttribute('maxlength', '200');
    expect(screen.getByRole('textbox', { name: 'label.editor' })).toHaveAttribute('aria-multiline', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'label.backToBoard' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/community/board');
  });

  it('exposes only the mobile body editor and explains image attachments', () => {
    mocks.mobile = true;
    renderPage();
    expect(screen.getAllByRole('textbox', { name: 'label.editor' })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'label.editor' }).tagName).toBe('TEXTAREA');
    expect(screen.getByText('writing.mobileHint')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'label.editor' })).toHaveAttribute('placeholder', 'placeholder.editorMobile');
    const syncedEditor = document.querySelector('[contenteditable="false"]');
    expect(syncedEditor).toHaveAttribute('hidden');
    expect(syncedEditor).not.toHaveAttribute('role');
  });

  it('announces table expansion and dismisses all dimensions with Escape while restoring focus', async () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: 'toolbar.table' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toContainElement(screen.getByRole('button', { name: '6 × 6' }));
    screen.getByRole('button', { name: '2 × 3' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '6 × 6' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('inserts the selected table dimensions with the keyboard', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'toolbar.table' }));
    const dimension = screen.getByRole('button', { name: '2 × 3' });
    dimension.focus();
    await userEvent.keyboard('{Enter}');
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('tr')).toHaveLength(2);
    expect(table.querySelectorAll('th')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '2 × 3' })).not.toBeInTheDocument();
  });

  it('announces selected inquiry type and keeps inquiry context when leaving', () => {
    renderPage('/community/board/new?type=inquiry');
    const question = screen.getByRole('button', { name: /label.feedbackTypes.question/ });
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('writing.inquiryHint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'label.backToBoard' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/community/board?type=inquiry');
  });
});
