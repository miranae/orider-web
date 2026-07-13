import { httpsCallable, type Functions } from "firebase/functions";

export const COURSE_ROUTING_CALLABLE = "routeCourse";

export type CourseRoutingProfile = "road" | "gravel" | "mtb" | "city";

export interface CourseRoutingWaypoint {
  lat: number;
  lon: number;
}

export interface CourseRoutingRequest {
  waypoints: CourseRoutingWaypoint[];
  profile: CourseRoutingProfile;
  avoidHighways: boolean;
  targetDistanceM?: number;
  roundTripSeed?: number;
}

export interface CourseRoutingResult {
  contractVersion: 1;
  geometry: {
    type: "LineString";
    coordinates: Array<[lon: number, lat: number]>;
  };
  encodedPolyline?: string;
  distanceM: number;
  durationSeconds: number;
  ascentM?: number;
  descentM?: number;
  surfaceSummary?: Array<{ surface: string; distanceM: number }>;
  attribution: string;
}

export type CourseRoutingFailureReason =
  | "NO_ROUTE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_REJECTED"
  | "INVALID_RESPONSE";

export class CourseRoutingError extends Error {
  constructor(public readonly reason?: CourseRoutingFailureReason) {
    super(reason ?? "UNKNOWN");
    this.name = "CourseRoutingError";
  }
}

function isFiniteCoordinate([lon, lat]: [number, number]): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function validateCourseRoutingResult(value: CourseRoutingResult): CourseRoutingResult {
  const surfaceSummaryValid = value.surfaceSummary === undefined || (
    Array.isArray(value.surfaceSummary)
    && value.surfaceSummary.length <= 32
    && value.surfaceSummary.every((item) => typeof item.surface === "string"
      && item.surface.trim().length > 0
      && item.surface.length <= 80
      && Number.isFinite(item.distanceM)
      && item.distanceM >= 0)
  );
  if (
    value.contractVersion !== 1
    || value.geometry?.type !== "LineString"
    || value.geometry.coordinates.length < 2
    || value.geometry.coordinates.length > 50_000
    || !value.geometry.coordinates.every(isFiniteCoordinate)
    || !Number.isFinite(value.distanceM)
    || value.distanceM <= 0
    || !Number.isFinite(value.durationSeconds)
    || value.durationSeconds < 0
    || typeof value.attribution !== "string"
    || value.attribution.trim().length === 0
    || !surfaceSummaryValid
    || (value.ascentM !== undefined && (!Number.isFinite(value.ascentM) || value.ascentM < 0))
    || (value.descentM !== undefined && (!Number.isFinite(value.descentM) || value.descentM < 0))
  ) {
    throw new CourseRoutingError("INVALID_RESPONSE");
  }
  return value;
}

export async function requestCourseRoute(
  firebaseFunctions: Functions,
  request: CourseRoutingRequest,
): Promise<CourseRoutingResult> {
  try {
    const routeCourse = httpsCallable<CourseRoutingRequest, CourseRoutingResult>(
      firebaseFunctions,
      COURSE_ROUTING_CALLABLE,
      { timeout: 30_000 },
    );
    const response = await routeCourse(request);
    return validateCourseRoutingResult(response.data);
  } catch (error) {
    if (error instanceof CourseRoutingError) throw error;
    const details = (error as { details?: { reason?: unknown } }).details;
    const reason = typeof details?.reason === "string" ? details.reason : undefined;
    const knownReasons: CourseRoutingFailureReason[] = [
      "NO_ROUTE", "RATE_LIMITED", "TIMEOUT", "UPSTREAM_UNAVAILABLE", "UPSTREAM_REJECTED", "INVALID_RESPONSE",
    ];
    throw new CourseRoutingError(knownReasons.includes(reason as CourseRoutingFailureReason)
      ? reason as CourseRoutingFailureReason
      : undefined);
  }
}
