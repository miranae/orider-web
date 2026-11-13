import { vi } from "vitest";
import { getDocs, query } from "firebase/firestore";
import { mockCollectionData } from "../mocks/firebase";

type Constraint = { type: string; args: unknown[] };
type RecordRow = Record<string, unknown> & { id: string };
type FakeQuery = { path?: string; _collectionPath?: string; constraints?: Constraint[] };
const field = (row: RecordRow, name: string): unknown => name === "__name__" ? row.id
  : name.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, row);

const originalGetDocs = vi.mocked(getDocs).getMockImplementation()!;

/** 실제 where/order/cursor/limit를 적용해 전체 fixture가 작은 페이지로 위장되지 않게 한다. */
export function installActivityQueryFake() {
  const fallback = originalGetDocs;
  const requests: Constraint[][] = [];
  let documents = 0;
  vi.mocked(query).mockImplementation(((ref: { path: string }, ...constraints: Constraint[]) => ({ ...ref, _collectionPath: ref.path, constraints })) as never);
  vi.mocked(getDocs).mockImplementation((async (q: FakeQuery) => {
    if ((q._collectionPath ?? q.path) !== "activities") return fallback(q as never);
    const constraints = q.constraints ?? [];
    requests.push(constraints);
    let rows = [...(mockCollectionData.get("activities") ?? [])];
    for (const { type, args } of constraints) {
      if (type !== "where") continue;
      const [name, op, value] = args as [string, string, never];
      rows = rows.filter(row => {
        const actual = field(row, name) as never;
        if (op === "==") return actual === value;
        if (op === "in") return (value as unknown[]).includes(actual);
        if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
        if (actual == null) return false;
        if (op === ">=") return actual >= value;
        if (op === ">") return actual > value;
        if (op === "<") return actual < value;
        if (op === "<=") return actual <= value;
        throw new Error(`Unsupported activity query ${op}`);
      });
    }
    const ordering = constraints.filter(c => c.type === "orderBy");
    rows = rows.filter(row => ordering.every(c => field(row, c.args[0] as string) !== undefined));
    const compare = (a: RecordRow, b: RecordRow) => {
      for (const c of ordering) {
        const left = field(a, c.args[0] as string) as number, right = field(b, c.args[0] as string) as number;
        if (left !== right) return (left < right ? -1 : 1) * (c.args[1] === "desc" ? -1 : 1);
      }
      return 0;
    };
    rows.sort(compare);
    const cursor = constraints.find(c => c.type === "startAfter")?.args[0] as { id: string; data: () => RecordRow } | undefined;
    if (cursor) rows = rows.filter(row => compare(row, { ...cursor.data(), id: cursor.id }) > 0);
    const count = constraints.find(c => c.type === "limit")?.args[0] as number | undefined;
    rows = rows.slice(0, count);
    documents += rows.length;
    const docs = rows.map(row => ({ id: row.id, data: () => row, exists: () => true, ref: { path: `activities/${row.id}` } }));
    return { docs, size: docs.length, empty: docs.length === 0, metadata: { fromCache: false, hasPendingWrites: false } };
  }) as never);
  return { requests, get documents() { return documents; } };
}
