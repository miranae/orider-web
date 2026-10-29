/** Matches activities queries: startTime DESC, implicit document name DESC.
 * All rows belong to the same collection. UTF-8 order avoids locale collation
 * and UTF-16 surrogate ordering differing from Firestore document names.
 */
export function compareActivityFeedOrder(a: { startTime: number; id: string }, b: { startTime: number; id: string }): number {
  const time = b.startTime - a.startTime;
  if (time || a.id === b.id) return time;
  const encoder = new TextEncoder();
  const left = encoder.encode(a.id);
  const right = encoder.encode(b.id);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return right[i]! - left[i]!;
  }
  return right.length - left.length;
}
