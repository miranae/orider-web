import { expect, it, vi } from 'vitest';
import type { FirebaseServices } from '../../contexts/FirebaseServicesContext';
import { clearBoardCountCache, readBoardCount } from './countCache';
const services = () => ({ auth: { currentUser: { uid: 'viewer' } } }) as unknown as FirebaseServices;

it('shares simultaneous counts and reuses them only within the TTL and filter', async () => {
  const source = services(), read = vi.fn(async () => 25);
  const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    expect(await Promise.all([readBoardCount(source, 'public', read), readBoardCount(source, 'public', read)])).toEqual([25, 25]);
    await readBoardCount(source, 'public', read); expect(read).toHaveBeenCalledTimes(1);
    await readBoardCount(source, 'another-filter', read); expect(read).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(now + 60_001);
    await readBoardCount(source, 'public', read); expect(read).toHaveBeenCalledTimes(3);
  } finally { clock.mockRestore(); }
});
it('does not let pre-mutation in-flight counts replace a fresh count', async () => {
  const source = services(); let resolve!: (value: number) => void;
  const old = readBoardCount(source, 'all', () => new Promise<number>(done => { resolve = done; }));
  await Promise.resolve(); clearBoardCountCache(source);
  expect(await readBoardCount(source, 'all', async () => 3)).toBe(3);
  resolve(2); await old;
  expect(await readBoardCount(source, 'all', async () => 999)).toBe(3);
});
it('isolates Firebase instances, rejects account replacement and does not cache failures', async () => {
  const source = services(), other = services();
  await readBoardCount(source, 'all', async () => 3);
  expect(await readBoardCount(other, 'all', async () => 5)).toBe(5);
  let resolve!: (value: number) => void;
  const old = readBoardCount(source, 'private', () => new Promise<number>(done => { resolve = done; }));
  await Promise.resolve(); Object.assign(source.auth, { currentUser: { uid: 'next' } }); resolve(7);
  await expect(old).rejects.toThrow('account_changed');
  const retry = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(4);
  await expect(readBoardCount(source, 'all', retry)).rejects.toThrow('offline');
  expect(await readBoardCount(source, 'all', retry)).toBe(4);
});
it('bounds the number of retained filters and rejects invalid totals', async () => {
  const source = services(), read = vi.fn(async () => 2);
  await readBoardCount(source, 'old', read);
  for (let i = 0; i < 130; i++) await readBoardCount(source, `${i}`, read);
  const previous = read.mock.calls.length;
  await readBoardCount(source, 'old', read); expect(read.mock.calls.length).toBe(previous + 1);
  await expect(readBoardCount(source, 'invalid', async () => NaN)).rejects.toThrow('invalid_board_count');
});
