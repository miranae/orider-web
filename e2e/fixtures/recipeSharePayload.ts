import { z } from "zod";
import type { RecipePublicCard } from "../../src/components/creator/RecipeShareCard";

const publicCardSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(1000),
  footer: z.string().max(200),
  imageDataUrl: z.string().max(600000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  imageAlt: z.string().max(300).optional(),
  kicker: z.string().max(100).optional(),
  kind: z.enum(["story", "badge", "load", "diary", "alert", "log"]).optional(),
  metrics: z.array(z.object({ label: z.string().max(60), value: z.string().max(60) })).max(3).optional(),
});

/** Local, test-only public DTO injection. No browser storage or production request is made. */
export function parseRecipeSharePayload(payload: string | null): RecipePublicCard | null {
  if (!payload) return null;
  if (payload.length > 900000) throw new Error("Fixture payload exceeds limit");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return publicCardSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
