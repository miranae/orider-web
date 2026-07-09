import type { CourseData } from "./courseSnapshot";

const TAG_LABELS: Record<string, string> = {
  "auto-curated": "자동 추천",
  "distance:short": "짧은 코스",
  "distance:medium": "중거리",
  "distance:long": "장거리",
  "distance:ultra": "초장거리",
  "elevation:flat": "평지",
  "elevation:rolling": "롤링",
  "elevation:climbing": "업힐",
  "elevation:mountain": "산악",
  "difficulty:easy": "쉬움",
  "difficulty:moderate": "중간",
  "difficulty:challenging": "도전",
  "difficulty:hard": "어려움",
  "difficulty:expert": "상급",
  "shape:loop": "순환",
  "shape:point_to_point": "편도",
  "long-ride": "롱라이드",
  climb: "클라임",
  flat: "평지",
};

export function uniqueCourseTags(course: Pick<CourseData, "tags" | "autoTags">): string[] {
  return [...new Set([...course.tags, ...course.autoTags].filter(Boolean))];
}

export function primaryCourseTags(course: Pick<CourseData, "tags" | "autoTags">, limit = 8): string[] {
  const tags = uniqueCourseTags(course);
  const priority = [
    /^distance:/,
    /^elevation:/,
    /^difficulty:(easy|moderate|challenging|hard|expert|[1-5])$/,
    /^shape:/,
    /^segment:/,
  ];
  return tags
    .filter((tag) => !tag.startsWith("start:") && !tag.startsWith("region:"))
    .sort((a, b) => {
      const ai = priority.findIndex((pattern) => pattern.test(a));
      const bi = priority.findIndex((pattern) => pattern.test(b));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, limit);
}

export function courseTagLabel(tag: string): string {
  if (/^difficulty:[1-5]$/.test(tag)) return `난이도 ${tag.slice("difficulty:".length)}`;
  if (tag.startsWith("region:")) return tag.slice("region:".length);
  if (tag.startsWith("segment:")) return tag.slice("segment:".length);
  if (tag.startsWith("start:")) return `시작 ${tag.slice("start:".length)}`;
  if (TAG_LABELS[tag]) return TAG_LABELS[tag];
  const [, value] = tag.split(":", 2);
  return value?.trim() || tag;
}
