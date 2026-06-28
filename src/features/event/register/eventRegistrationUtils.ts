export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number] | "";

export type Gender = "M" | "F" | "X" | "";
export type BloodType = string;

export const ABO_TYPES = ["A", "B", "O", "AB"] as const;
export type Abo = (typeof ABO_TYPES)[number];

export interface BloodComponents {
  abo: Abo | "";
  rh: "+" | "-" | "";
  custom: string;
}

export function parseBloodType(value: string): BloodComponents {
  const text = value.trim();
  if (!text) return { abo: "", rh: "", custom: "" };
  const match = text.match(/^(AB|A|B|O)([+-])?$/);
  if (match) return { abo: match[1] as Abo, rh: (match[2] as "+" | "-" | undefined) ?? "", custom: "" };
  return { abo: "", rh: "", custom: text };
}

export function composeBloodType(components: BloodComponents): string {
  if (components.custom.trim()) return components.custom.trim().slice(0, 32);
  if (!components.abo) return "";
  return `${components.abo}${components.rh}`;
}
