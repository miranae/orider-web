import ActivityPage from "../../pages/ActivityPage";
import type { PublicActivitySessionOptions } from "../../hooks/usePublicActivitySession";

/** Embedded and web links share the existing activity detail presentation. */
export default function PublicActivitySurface(props: PublicActivitySessionOptions) {
  return <ActivityPage publicAccess={props} />;
}
