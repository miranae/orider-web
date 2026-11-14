import { Fragment, useRef, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useFirebaseServices } from "./FirebaseServicesContext";

/** Reset local UI state and dispose effects when an app or authentication session is replaced. */
export default function FirebaseSessionBoundary({ children }: { children: ReactNode }) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const values = [services.auth, services.firestore, services.functions, services.scope, services.auth.currentUser, user?.uid];
  const identity = useRef({ values, epoch: 0 });
  if (values.some((value, index) => value !== identity.current.values[index])) {
    identity.current = { values, epoch: identity.current.epoch + 1 };
  }
  return <Fragment key={identity.current.epoch}>{children}</Fragment>;
}
