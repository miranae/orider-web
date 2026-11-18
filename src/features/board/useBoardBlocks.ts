import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { useFirebaseServices } from '../../contexts/FirebaseServicesContext';
import { isEmulatorRuntime, isStageComputeRuntime, getRuntimeConfig } from '../../services/runtimeConfig';
import { logClientError } from '../../services/errorLogger';

/** `functions` 는 호출부의 useFirebaseServices() 인스턴스 — 임베드는 별도 Firebase app 이다(#847). */
export async function setBoardAuthorBlocked(targetUid: string, blocked: boolean, functions: Functions) {
  const socialFunctions = isStageComputeRuntime(getRuntimeConfig()) ? functions : getFunctions(functions.app, 'asia-northeast3');
  if (isEmulatorRuntime()) connectFunctionsEmulator(socialFunctions, 'localhost', Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
  try {
    await httpsCallable(socialFunctions, 'setActivitySocialBlock')({ targetUid, blocked });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    try {
      logClientError('Board.authorBlock', new Error('게시판 작성자 차단 요청 실패'), {
        operation: 'setActivitySocialBlock', blocked,
        errorCode: typeof code === 'string' && /^[a-z0-9/_-]{1,64}$/i.test(code) ? code : 'unknown',
      });
    } catch { /* 로거의 동기 실패로 원래 요청 오류를 바꾸지 않는다. */ }
    throw error;
  }
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
