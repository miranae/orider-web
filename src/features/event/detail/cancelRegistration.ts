import { httpsCallable } from "firebase/functions";
import { functions } from "../../../services/firebase";

export async function cancelEventRegistration(eventId: string): Promise<void> {
  const fn = httpsCallable<{ eventId: string }, { success: true }>(functions, "cancelRegistration");
  const { data } = await fn({ eventId });
  if (data.success !== true) throw new Error("cancel-registration-failed");
}
