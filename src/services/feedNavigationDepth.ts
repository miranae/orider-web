// Store only pagination depth, never activity payloads or Firestore cursors.
const sessions = new WeakMap<object, number>();
let nextSession = 0;
const depths = new Map<string, number>();
export function feedSessionKey(user: object | null | undefined): string {
  if (!user) return "guest";
  let id = sessions.get(user);
  if (!id) { id = ++nextSession; sessions.set(user, id); }
  return `session-${id}`;
}
export function readFeedDepth(key: string | undefined, initial: number): number {
  return key ? depths.get(key) ?? initial : initial;
}
export function saveFeedDepth(key: string | undefined, depth: number) {
  if (!key) return;
  depths.set(key, Math.min(200, depth));
  if (depths.size > 50) depths.delete(depths.keys().next().value!);
}
