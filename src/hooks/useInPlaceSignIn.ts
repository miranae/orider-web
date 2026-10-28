import { useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { isSignInCancelled } from "../utils/signInCancelled";

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
      if (!isSignInCancelled(error)) setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { login, pending, failed };
}
