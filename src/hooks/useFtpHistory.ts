import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { parseFtpHistoryEntry, type FtpHistoryEntry } from "@shared/training/ftpHistory";

export function useFtpHistory(uid: string | null | undefined, active = true) {
  const { firestore } = useFirebaseServices();
  const [entries, setEntries] = useState<FtpHistoryEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));

  const ownerUid = useRef(uid);
  const generationRef = useRef(0);
  const loadedUid = useRef<string | null | undefined>(null);
  useEffect(() => {
    const generation = ++generationRef.current;
    if (ownerUid.current !== uid) {
      loadedUid.current = null;
      setEntries([]);
      setLoading(Boolean(uid));
      ownerUid.current = uid;
    }
    if (!active && uid) return;
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    if (loadedUid.current !== uid) setLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(firestore, "users", uid, "ftpHistory"),
        orderBy("changedAt", "asc"),
      ),
      (snapshot) => {
        if (generationRef.current !== generation) return;
        loadedUid.current = uid;
        setEntries(snapshot.docs.flatMap((entry) => {
          const parsed = parseFtpHistoryEntry(entry.id, entry.data());
          return parsed ? [parsed] : [];
        }));
        setLoading(false);
      },
      (error) => {
        if (generationRef.current !== generation) return;
        setEntries([]);
        setLoading(false);
        logClientError("useFtpHistory.load", error, { uid });
      },
    );
    return () => {
      generationRef.current += 1;
      unsubscribe();
    };
  }, [active, firestore, uid]);

  return ownerUid.current === uid ? { entries, loading } : { entries: [], loading: Boolean(uid) };
}
