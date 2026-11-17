import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";

const cache = new WeakMap<Firestore, { expiresAt: number; pending: Promise<boolean> }>();
/** 준비 상태는 공개 설정이며 계정 데이터는 캐시하지 않는다. 배포 이전 서버는 기존 조회를 쓴다. */
export function indexedCourseQueries(firestore: Firestore, services?: FirebaseServices): Promise<boolean> {
  const previous = cache.get(firestore);
  if (previous && previous.expiresAt > Date.now()) return previous.pending;
  const pending = getDoc(doc(firestore, "query_optimization_state", "course_catalog")).then(snapshot => {
    const data = snapshot?.data();
    return data?.version === 1 && data?.ready === true;
  }).catch(error => {
    logClientError("courses:query_mode", error, { operation: "get_readiness", path: "query_optimization_state/course_catalog" }, services);
    return false;
  });
  cache.set(firestore, { expiresAt: Date.now() + 60_000, pending });
  return pending;
}
