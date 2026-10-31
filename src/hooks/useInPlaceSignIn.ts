import { useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { isSignInCancelled } from "../utils/signInCancelled";
import { logClientError } from "../services/errorLogger";

/** Keep the current destination while the existing authentication dialog completes. */
export function useInPlaceSignIn() {
  const { signIn } = useAuth();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const login = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      await signIn();
    } catch (error) {
      // A user-cancelled dialog is expected; every other failure must reach operations logging.
      if (!isSignInCancelled(error)) {
        setFailed(true);
        logClientError("useInPlaceSignIn.signIn", error);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { login, pending, failed };
}
