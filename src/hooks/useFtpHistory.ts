import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { parseFtpHistoryEntry, type FtpHistoryEntry } from "@shared/training/ftpHistory";

export function useFtpHistory(uid: string | null | undefined) {
  const { firestore } = useFirebaseServices();
  const [entries, setEntries] = useState<FtpHistoryEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      query(
        collection(firestore, "users", uid, "ftpHistory"),
        orderBy("changedAt", "asc"),
      ),
      (snapshot) => {
        setEntries(snapshot.docs.flatMap((entry) => {
          const parsed = parseFtpHistoryEntry(entry.id, entry.data());
          return parsed ? [parsed] : [];
        }));
        setLoading(false);
      },
      (error) => {
        setEntries([]);
        setLoading(false);
        logClientError("useFtpHistory.load", error, { uid });
      },
    );
  }, [firestore, uid]);

  return { entries, loading };
}
