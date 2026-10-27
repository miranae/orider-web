import type { Group } from "@shared/types";
import { getRuntimeConfig } from "./runtimeConfig";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
export type PublicClub = Pick<Group, "id" | "name" | "description" | "approval"> & Partial<Pick<Group, "badge" | "kind" | "sports" | "discipline" | "city">>;
export interface PublicClubFilters { searchText?: string; city?: string; discipline?: string }
export class PublicClubUnavailable extends Error {}
function parseClub(value: unknown): PublicClub {
  if (!value || typeof value !== "object") throw new Error("Invalid public club response");
  const row = value as Record<string, unknown>;
  const fields = ["id", "name", "badge", "description", "kind", "sports", "discipline", "city", "approval"];
  if (Object.keys(row).some(key => !fields.includes(key)) || typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    || typeof row.name !== "string" || !row.name || row.name.length > 100 || typeof row.description !== "string" || row.description.length > 1200
    || !["auto", "manual"].includes(String(row.approval))) throw new Error("Invalid public club response");
  return {
    id: row.id, name: row.name, description: row.description, approval: row.approval as Group["approval"],
    ...(typeof row.badge === "string" ? { badge: row.badge.slice(0, 20) } : {}),
    ...(typeof row.city === "string" ? { city: row.city.slice(0, 60) } : {}),
    ...(["club", "running_crew", "tri_team", "corporate"].includes(String(row.kind)) ? { kind: row.kind as Group["kind"] } : {}),
    ...(["bike", "run", "swim", "tri"].includes(String(row.discipline)) ? { discipline: row.discipline as Group["discipline"] } : {}),
    ...(Array.isArray(row.sports) ? { sports: row.sports.filter((sport): sport is NonNullable<Group["discipline"]> => ["bike", "run", "swim", "tri"].includes(String(sport))).slice(0, 4) } : {}),
  };
}
async function request(params: URLSearchParams, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const configured = getRuntimeConfig().publicClubApiUrl;
  if (!configured) throw new Error("Public club API is not configured");
  const url = new URL(configured, window.location.origin);
  const local = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !local)) throw new Error("Invalid public club API URL");
  url.search = params.toString();
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  if (response.status === 404) throw new PublicClubUnavailable();
  if (!response.ok) throw new Error("Public club request failed");
  return response.json();
}
export async function listPublicClubs(filters: PublicClubFilters, cursor: string | null) {
  const params = new URLSearchParams({ size: "12" });
  if (filters.searchText?.trim()) params.set("search", filters.searchText.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.discipline && filters.discipline !== "ALL") params.set("discipline", filters.discipline);
  if (cursor) params.set("cursor", cursor);
  const result = await request(params);
  if (!Array.isArray(result.clubs) || result.clubs.length > 12 || (result.nextCursor !== null && typeof result.nextCursor !== "string")) throw new Error("Invalid public club page");
  return { items: result.clubs.map(parseClub), cursor: result.nextCursor as string | null, hasMore: result.nextCursor !== null };
}
export async function getPublicClub(id: string, signal?: AbortSignal) {
  const result = await request(new URLSearchParams({ id }), signal);
  const club = parseClub(result.club);
  if (club.id !== id) throw new Error("Invalid public club identity");
  return club;
}
export async function getPublicCafeSchedule(id: string, signal?: AbortSignal): Promise<ClubCafeSchedule | null> {
  if (id !== "club-lara") return null;
  const result = await request(new URLSearchParams({ id, schedule: "1" }), signal);
  const club = parseClub(result.club);
  if (club.id !== id) throw new Error("Invalid public club identity");
  const s = result.schedule as ClubCafeSchedule | null;
  if (s === null) return null;
  if (!s || s.source !== "naver-cafe" || s.cafeUrl !== "https://cafe.naver.com/clublara" || !Number.isFinite(s.syncedAt) || !Array.isArray(s.entries) || s.entries.length > 250 || s.entries.some(e => !/^https:\/\/cafe\.naver\.com\/clublara\/\d+$/.test(e.url) || !Array.isArray(e.dates) || e.dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error("Invalid cafe schedule");
  return s;
}
