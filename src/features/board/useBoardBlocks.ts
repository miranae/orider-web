import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { useFirebaseServices, type FirebaseServices } from '../../contexts/FirebaseServicesContext';
import { isEmulatorRuntime, isStageComputeRuntime, getRuntimeConfig } from '../../services/runtimeConfig';
import { logClientError } from '../../services/errorLogger';

/** `functions` 는 호출부의 useFirebaseServices() 인스턴스 — 임베드는 별도 Firebase app 이다(#847). */
export async function setBoardAuthorBlocked(targetUid: string, blocked: boolean, services: Pick<FirebaseServices, 'auth' | 'functions' | 'ensureAppCheckReady'>) {
  const { functions } = services;
  const socialFunctions = isStageComputeRuntime(getRuntimeConfig()) ? functions : getFunctions(functions.app, 'asia-northeast3');
  if (isEmulatorRuntime()) connectFunctionsEmulator(socialFunctions, 'localhost', Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
  try {
    await httpsCallable(socialFunctions, 'setActivitySocialBlock')({ targetUid, blocked });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const context = { operation: 'setActivitySocialBlock', blocked,
      errorCode: typeof code === 'string' && /^[a-z0-9/_-]{1,64}$/i.test(code) ? code : 'unknown' };
    try {
      logClientError('Board.authorBlock', new Error('게시판 작성자 차단 요청 실패'), context, { ...services, functions: socialFunctions });
    } catch {
      // eslint-disable-next-line no-console -- 로거 자체 실패의 마지막 진단 경로이며 식별자·본문·토큰은 포함하지 않는다.
      console.error('[Board.authorBlock] 오류 진단 전송 실패', context);
    }
    throw error;
  }
}

export function useBoardBlocks() {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const { firestore } = services;
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
    try { await setBoardAuthorBlocked(targetUid, false, services); } finally { setPending(false); }
  };
  return { blockedUsers, loading, error, retry: () => setRevision(value => value + 1), unblock, pending };
}
