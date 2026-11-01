import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { useFirebaseServices } from '../../contexts/FirebaseServicesContext';
import { isEmulatorRuntime } from '../../services/runtimeConfig';

/** `functions` 는 호출부의 useFirebaseServices() 인스턴스 — 임베드는 별도 Firebase app 이다(#847). */
export async function setBoardAuthorBlocked(targetUid: string, blocked: boolean, functions: Functions) {
  const socialFunctions = getFunctions(functions.app, 'asia-northeast3');
  if (isEmulatorRuntime()) connectFunctionsEmulator(socialFunctions, 'localhost', 5001);
  await httpsCallable(socialFunctions, 'setActivitySocialBlock')({ targetUid, blocked });
}

export function useBoardBlocks() {
  const { user } = useAuth();
  const { firestore, functions } = useFirebaseServices();
  const uid = user?.uid;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ uid: string; users: { id: string; targetUid: string }[] } | null>(null);
  useEffect(() => {
    setError(null);
    if (!uid) return;
    return onSnapshot(collection(firestore, `users/${uid}/blocks`), snap => {
      setError(null);
      setState({ uid, users: snap.docs.map(item => ({ id: item.id, targetUid: item.id })) });
    }, failure => { setError(failure); });
  }, [firestore, uid, revision]);
  const blockedUsers = uid && state?.uid === uid ? state.users : [];
  const loading = Boolean(uid && state?.uid !== uid && !error);
  const unblock = async (targetUid: string) => {
    if (!uid || pending) return;
    setPending(true);
    try { await setBoardAuthorBlocked(targetUid, false, functions); } finally { setPending(false); }
  };
  return { blockedUsers, loading, error, retry: () => setRevision(value => value + 1), unblock, pending };
}
