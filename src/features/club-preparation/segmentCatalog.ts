import { z } from "zod";
import { decodePolyline } from "../../utils/polyline";
import { fetchStaticJson } from "../../utils/staticJson";
import { segmentTileUrl } from "../../utils/segmentTiles";
const geometrySchema = z
  .array(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      ele: z.number().finite().optional(),
    }),
  )
  .min(2)
  .max(2000);
const elevationPointSchema = z.object({
  distance: z.number().finite().nonnegative(),
  elevation: z.number().finite(),
});
export const elevationProfileSchema = z
  .array(elevationPointSchema)
  .min(2)
  .max(2000)
  .refine(
    (points) =>
      points.every(
        (point, index) =>
          index === 0 || point.distance >= points[index - 1]!.distance,
      ),
    "고도 프로필의 거리 순서를 확인해주세요.",
  );
/** 지도 경로와 인덱스가 다를 수 있어 저장된 고도 샘플은 독립적으로 보존한다. */
export function readStoredElevationProfile(
  value: unknown,
): z.infer<typeof elevationProfileSchema> | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20_000)
    return undefined;
  const points = value.map((point) => elevationPointSchema.safeParse(point));
  if (points.some((point) => !point.success)) return undefined;
  const valid = points.map((point) => point.data!);
  if (
    valid.some(
      (point, index) =>
        index > 0 && point.distance < valid[index - 1]!.distance,
    )
  )
    return undefined;
  const stride = Math.max(1, Math.ceil(valid.length / 1800));
  return valid.filter(
    (_, index) => index % stride === 0 || index === valid.length - 1,
  );
}
export const segmentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const segmentSnapshotSchema = z.object({
  id: segmentIdSchema,
  name: z.string().trim().min(1).max(300),
  city: z.string().optional(),
  state: z.string().optional(),
  distance: z.number().finite().nonnegative().optional(),
  elevationGain: z.number().finite().nonnegative().optional(),
  averageGrade: z.number().finite().optional(),
  elevationProfile: elevationProfileSchema.optional(),
  geometry: geometrySchema.optional(),
});
export const meetingSegmentSchema = segmentSnapshotSchema.extend({
  instruction: z.string().max(1000),
  mode: z.enum(["함께", "오픈", "재집결", "현장 협의"]),
  source: z.enum(["public-catalog", "gpx"]),
  segmentKind: z.enum(["route", "climb"]).optional(),
  climbCategory: z.number().int().min(1).max(5).optional(),
  geometry: geometrySchema.optional(),
});
export const meetingSegmentsSchema = z
  .array(meetingSegmentSchema)
  .max(112)
  .superRefine((segments, context) => {
    if (
      segments.filter((segment) => segment.source === "public-catalog").length >
        12 ||
      segments.filter((segment) => segment.source === "gpx").length > 100
    )
      context.addIssue({
        code: "custom",
        message:
          "공개 구간은 12개, GPX 생성 구간은 100개까지 연결할 수 있습니다.",
      });
    if (
      segments.some((segment) => segment.source === "gpx" && !segment.geometry)
    )
      context.addIssue({
        code: "custom",
        message: "GPX 생성 구간의 경로가 필요합니다.",
      });
  });
export type SegmentChoice = z.infer<typeof segmentSnapshotSchema>;
export type MeetingSegment = z.infer<typeof meetingSegmentSchema>;
export function segmentDetailHref(id: string, language = "ko"): string {
  if (!segmentIdSchema.safeParse(id).success)
    throw new Error("올바른 세그먼트가 아닙니다.");
  return `/${language.startsWith("en") ? "en" : "ko"}/segment/${encodeURIComponent(id)}`;
}
export function parseSegmentCatalog(input: unknown): SegmentChoice[] {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray((input as { segments?: unknown }).segments)
  )
    throw new Error("세그먼트 목록을 읽지 못했어요.");
  const seen = new Set<string>();
  return (input as { segments: unknown[] }).segments.flatMap((value) => {
    const raw =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const result = segmentSnapshotSchema.safeParse({
      ...raw,
      geometry: raw.geometry ?? parseSegmentGeometry(raw.sl),
    });
    if (!result.success || seen.has(result.data.id)) return [];
    seen.add(result.data.id);
    return [result.data];
  });
}
function parseSegmentGeometry(value: unknown): SegmentChoice["geometry"] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20_000)
    return undefined;
  const stride = Math.max(1, Math.ceil(value.length / 1800));
  const sampled = value.filter(
    (_, index) => index % stride === 0 || index === value.length - 1,
  );
  if (sampled.some((point) => !Array.isArray(point) || point.length < 2))
    return undefined;
  const parsed = geometrySchema.safeParse(
    sampled.map((point) => ({ lat: point[0], lon: point[1] })),
  );
  return parsed.success ? parsed.data : undefined;
}

export function enrichSegmentChoice(
  choice: SegmentChoice,
  data: Record<string, unknown>,
): SegmentChoice | null {
  if (
    data.deletedAt != null ||
    data.hidden === true ||
    (data.visibility != null && data.visibility !== "public")
  )
    return null;
  let geometry: SegmentChoice["geometry"];
  if (typeof data.polyline === "string" && data.polyline.length <= 200_000) {
    try {
      geometry = parseSegmentGeometry(decodePolyline(data.polyline, 20_000));
    } catch {
      /* Other stored geometry remains available. */
    }
  }
  if (
    !geometry &&
    typeof data.segmentLatlng === "string" &&
    data.segmentLatlng.length <= 1_000_000
  ) {
    try {
      geometry = parseSegmentGeometry(JSON.parse(data.segmentLatlng));
    } catch {
      /* Keep the public overview geometry. */
    }
  }
  const result = segmentSnapshotSchema.safeParse({
    ...choice,
    ...(typeof data.distance === "number" &&
    Number.isFinite(data.distance) &&
    data.distance >= 0
      ? { distance: data.distance }
      : {}),
    ...(typeof data.elevationGain === "number" &&
    Number.isFinite(data.elevationGain) &&
    data.elevationGain >= 0
      ? { elevationGain: data.elevationGain }
      : {}),
    elevationProfile: readStoredElevationProfile(data.elevationProfile),
    ...(geometry ? { geometry } : {}),
  });
  return result.success ? result.data : null;
}
let segmentReadiness: Promise<void> | undefined;
/** Read the selected public segment through the existing SDK and security rules; never write. */
export async function loadSegmentDetail(
  choice: SegmentChoice,
): Promise<SegmentChoice | null> {
  segmentIdSchema.parse(choice.id);
  const services = await import("../../services/firebase");
  segmentReadiness ??= (async () => {
    if (!services.getFirebaseApp()) await services.initFirebase();
  })().catch((error) => {
    segmentReadiness = undefined;
    throw error;
  });
  await segmentReadiness;
  const { loadSegmentMetadata } = await import("../../services/segmentMetadata");
  const [data] = await loadSegmentMetadata([choice.id]);
  return data ? enrichSegmentChoice(choice, data) : null;
}
export async function loadSegmentCatalog(): Promise<SegmentChoice[]> {
  const url = new URL(segmentTileUrl("overview.json"), window.location.origin);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("공개 세그먼트 주소를 확인해주세요.");
  const requestUrl = import.meta.env.DEV
    ? "/__club-segments/overview.json"
    : url.toString();
  return parseSegmentCatalog(await fetchStaticJson<unknown>(requestUrl));
}
export function searchSegments(
  catalog: SegmentChoice[],
  query: string,
): SegmentChoice[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return catalog
    .filter((s) =>
      words.every((word) =>
        `${s.name} ${s.city ?? ""} ${s.state ?? ""}`
          .toLocaleLowerCase()
          .includes(word),
      ),
    )
    .slice(0, 12);
}
export function selectSegment(
  selected: MeetingSegment[],
  choice: SegmentChoice,
): MeetingSegment[] {
  const valid = segmentSnapshotSchema.parse(choice);
  if (selected.some((s) => s.id === valid.id))
    throw new Error("이미 선택한 구간입니다.");
  if (
    selected.filter((segment) => segment.source === "public-catalog").length >=
    12
  )
    throw new Error("주요 구간은 12개까지 선택할 수 있어요.");
  return [
    ...selected,
    { ...valid, mode: "함께", instruction: "", source: "public-catalog" },
  ];
}
export const segmentDistance = (s: SegmentChoice) =>
  s.distance === undefined
    ? "—"
    : `${(s.distance / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} km`;
