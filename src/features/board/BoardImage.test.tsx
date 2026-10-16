import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BoardImage } from './BoardImage';
const mocks = vi.hoisted(() => ({ uid: 'owner', getBlob: vi.fn(), ref: vi.fn((_storage, path) => path) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock('../../services/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({ getBlob: mocks.getBlob, ref: mocks.ref }));
beforeEach(() => {
  mocks.uid = 'owner';
  mocks.getBlob.mockReset().mockResolvedValue(new Blob(['image']));
  URL.createObjectURL = vi.fn(() => 'blob:private-owner');
  URL.revokeObjectURL = vi.fn();
});
it('reads protected image through authenticated Storage and revokes it on account change', async () => {
  const src = 'gs://bucket/board_images/owner/post/image.png';
  const { rerender, unmount } = render(<BoardImage src={src} alt="attachment" />);
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:private-owner'));
  expect(mocks.getBlob).toHaveBeenCalledWith(src, 5 * 1024 * 1024);
  mocks.getBlob.mockReturnValue(new Promise(() => {}));
  mocks.uid = 'other';
  rerender(<BoardImage src={src} alt="attachment" />);
  expect(screen.getByRole('img')).not.toHaveAttribute('src');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-owner');
  unmount();
});
it('does not reveal an image whose authorized fetch fails', async () => {
  mocks.getBlob.mockRejectedValue(new Error('storage/unauthorized'));
  render(<BoardImage src="gs://bucket/board_images/owner/post/image.png" alt="attachment" />);
  await waitFor(() => expect(mocks.getBlob).toHaveBeenCalled());
  expect(screen.getByRole('img')).not.toHaveAttribute('src');
});
it('retains ordinary public images without using Storage', () => {
  render(<BoardImage src="https://example.com/image.png" alt="public" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.png');
  expect(mocks.getBlob).not.toHaveBeenCalled();
});
