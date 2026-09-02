import type { HostBridgeEnvelope } from "./bridge";

export const RETAINED_SURFACE_SELECTION_CAPABILITY = "host.surfaceSelected" as const;

export type TrainingSurfaceKind = "fitness" | "plan";

export interface SurfaceSelection {
  surface: TrainingSurfaceKind | null;
  requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSurfaceSelectionMessage(
  message: HostBridgeEnvelope,
): SurfaceSelection | null {
  if (message.type !== "host.surfaceSelected") return null;
  if (
    message.requestId !== undefined
    && (message.requestId.length === 0 || message.requestId.length > 128)
  ) return null;
  if (!isRecord(message.payload)) return null;
  const keys = Object.keys(message.payload);
  if (keys.length !== 1 || keys[0] !== "surface") return null;
  const surface = message.payload.surface;
  if (surface !== "fitness" && surface !== "plan" && surface !== null) return null;
  return { surface, requestId: message.requestId };
}
