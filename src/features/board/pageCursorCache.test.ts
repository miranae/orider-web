import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp, type Firestore, type DocumentSnapshot } from 'firebase/firestore';
import { clearBoardPageCursors, nearestBoardPageCursor, saveBoardPageCursor } from './pageCursorCache';

const db = { app: { name: 'app', options: { projectId: 'project' } } } as Firestore;
const snapshot = (id: string, createdAt: unknown) => ({ id, data: () => ({ createdAt }) }) as DocumentSnapshot;
beforeEach(() => { vi.useRealTimers(); clearBoardPageCursors(); });
describe('board page cursor reuse', () => {
  it('uses the nearest previous page only within the same account filter and app', () => {
    saveBoardPageCursor(db, 'user-a:free:20', 1, snapshot('one', 100));
    saveBoardPageCursor(db, 'user-a:free:20', 4, snapshot('four', 40));
    expect(nearestBoardPageCursor(db, 'user-a:free:20', 5)).toEqual({ page: 4, id: 'four', value: 40 });
    expect(nearestBoardPageCursor(db, 'user-b:free:20', 5)).toBeNull();
    expect(nearestBoardPageCursor(db, 'user-a:free:10', 5)).toBeNull();
    expect(nearestBoardPageCursor({ app: { name: 'other' } } as Firestore, 'user-a:free:20', 5)).toBeNull();
    expect(nearestBoardPageCursor(db, 'user-a:free:20', 1)).toBeNull();
  });
  it('preserves timestamp precision and expires stale anchors', () => {
    vi.useFakeTimers();
    const value = new Timestamp(100, 123);
    saveBoardPageCursor(db, 'scope', 2, snapshot('id', value));
    expect(nearestBoardPageCursor(db, 'scope', 3)?.value).toEqual(value);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(nearestBoardPageCursor(db, 'scope', 3)).toBeNull();
    vi.useRealTimers();
  });
  it('clears persisted anchors on mutation and rejects invalid values', () => {
    saveBoardPageCursor(db, 'scope', 1, snapshot('id', 10));
    saveBoardPageCursor(db, 'scope', 2, snapshot('bad', NaN));
    expect(nearestBoardPageCursor(db, 'scope', 3)?.page).toBe(1);
    clearBoardPageCursors();
    expect(nearestBoardPageCursor(db, 'scope', 3)).toBeNull();
  });
});
