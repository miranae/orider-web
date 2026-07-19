import type { TFunction } from "i18next";

const CLARIFICATION_KEY_MAP: Readonly<Record<string, string>> = {
  "coach.clarification.time_range": "clarification.prompt.time_range",
  "coach.clarify.discipline": "clarification.prompt.discipline",
  "coach.clarification.this_week": "clarification.option.this_week",
  "coach.clarification.last_week": "clarification.option.last_week",
  "coach.clarification.bike": "clarification.option.bike",
  "coach.clarification.run": "clarification.option.run",
  "coach.clarification.swim": "clarification.option.swim",
};

export function safeClarificationText(key: string, kind: "prompt" | "option", t: TFunction<"coach">,
  fallbackId?: string): string {
  const mapped = CLARIFICATION_KEY_MAP[key];
  if (mapped) return t(mapped);
  return t(kind === "prompt" ? "clarification.prompt.generic" : "clarification.option.generic",
    { value: fallbackId?.replace(/_/g, " ") ?? "" });
}
