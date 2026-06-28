export type WpLane = "KOM" | "AID" | "CUT" | "SEG";

export const LANE_DEFS: Record<WpLane, { labelKey: string; color: string; icon: string }> = {
  KOM: { labelKey: "detail.lane.kom", color: "var(--lime)", icon: "⛰️" },
  AID: { labelKey: "detail.lane.aid", color: "var(--aqua)", icon: "🍌" },
  CUT: { labelKey: "detail.lane.cut", color: "var(--rose)", icon: "⏱️" },
  SEG: { labelKey: "detail.lane.seg", color: "var(--amber)", icon: "🏁" },
};

export const LANE_ORDER: WpLane[] = ["KOM", "AID", "CUT", "SEG"];

export function classifyLane(wp: { type: string; name: string }): WpLane {
  const t = (wp.type || "").toUpperCase();
  if (t === "FOOD" || wp.name.includes("보급")) return "AID";
  if (wp.name.includes("정상") || wp.name.includes("KOM") || t === "KOM") return "KOM";
  if (wp.name.includes("컷") || wp.name.includes("CUT") || t === "CUT") return "CUT";
  return "SEG";
}
