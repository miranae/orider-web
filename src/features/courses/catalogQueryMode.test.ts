import { getDoc, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexedCourseQueries } from './catalogQueryMode';
vi.mock('../../services/errorLogger', () => ({ logClientError: vi.fn() }));
const state = (data: object) => ({ data: () => data }) as DocumentSnapshot;
afterEach(() => vi.useRealTimers());
describe('course query activation', () => {
  it('shares one readiness read within the app and refreshes after a minute', async () => {
    vi.useFakeTimers();
    const db = {} as Firestore;
    vi.mocked(getDoc).mockResolvedValueOnce(state({ version: 1, ready: true }));
    expect(await indexedCourseQueries(db)).toBe(true);
    vi.mocked(getDoc).mockResolvedValueOnce(state({ version: 1, ready: false }));
    expect(await indexedCourseQueries(db)).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(await indexedCourseQueries(db)).toBe(false);
  });
  it('uses the legacy query when old rules deny the config or its version is unsupported', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('permission-denied'));
    expect(await indexedCourseQueries({} as Firestore)).toBe(false);
    vi.mocked(getDoc).mockResolvedValueOnce(state({ version: 2, ready: true }));
    expect(await indexedCourseQueries({} as Firestore)).toBe(false);
  });
});
