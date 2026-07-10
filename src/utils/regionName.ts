const KO_REGION_NAMES: Record<string, string> = {
  Seoul: "서울",
  "Seoul Special City": "서울",
  "North Chungcheong": "충청북도",
  Chungcheongbuk: "충청북도",
  "Chungcheongbuk-do": "충청북도",
  "Danyang-gun": "단양군",
};

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function localizeRegionName(value: string | undefined | null, language: string): string {
  if (!value) return "";
  const trimmed = normalizeKey(value);
  if (!language.toLowerCase().startsWith("ko")) return trimmed;
  return KO_REGION_NAMES[trimmed] ?? trimmed;
}

export function formatSegmentRegion(
  city: string | undefined,
  state: string | undefined,
  language: string,
): string {
  const parts = [city, state]
    .map((part) => localizeRegionName(part, language))
    .filter(Boolean);
  return Array.from(new Set(parts)).join(language.toLowerCase().startsWith("ko") ? " · " : ", ");
}
