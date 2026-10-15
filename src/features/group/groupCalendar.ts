import type { Group } from "@shared/types";
import { getRuntimeConfig } from "../../services/runtimeConfig";

/** groupEventCalendar serves only public active groups. */
export function groupCalendarUrl(group: Pick<Group, "id" | "visibility" | "isActive"> | null): string | null {
  if (!group || group.visibility !== "public" || group.isActive === false) return null;
  const config = getRuntimeConfig();
  const base = config.appEnvironment === "stage" ? config.firebaseFunctionsBase : `https://${config.firebaseFunctionsRegion || "us-central1"}-${config.firebaseProjectId}.cloudfunctions.net`;
  return `${base}/groupEventCalendar?groupId=${encodeURIComponent(group.id)}`;
}
