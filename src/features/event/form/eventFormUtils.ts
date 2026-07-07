export interface EditableCategoryRow {
  id: string;
  label: string;
  slots: number;
  filled: number;
  req: string;
}

export interface CategoryRow {
  id: string;
  label: string;
  slots: number;
  req: string;
}

export function newCategory(label = "", slots = 50, req = ""): CategoryRow {
  return { id: `c${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, slots, req };
}

export function newEditableCategory(): EditableCategoryRow {
  return { id: `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "", slots: 50, filled: 0, req: "" };
}

export function splitDtLocal(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const i = value.indexOf("T");
  if (i < 0) return { date: value, time: "" };
  return { date: value.slice(0, i), time: value.slice(i + 1, i + 6) };
}

export function joinDtLocal(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST_OFFSET = "+09:00";

export function splitStartTime(ms: number): { date: string; time: string } {
  if (!ms) return { date: "", time: "06:00" };
  const d = new Date(ms + KST_OFFSET_MS);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export function joinStartTimeKst(date: string, time: string): number | undefined {
  if (!date || !time) return undefined;
  const ms = new Date(`${date}T${time}:00${KST_OFFSET}`).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}
