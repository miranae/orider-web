import { useAuth } from "../contexts/AuthContext";
import PermissionGate from "../components/redesign/states/PermissionGate";
import AthletePage from "./AthletePage";

/** /athlete/me — 로그인 uid 로 내 선수 프로필을 연다. 비로그인은 로그인 유도. */
export default function AthleteMePage() {
  const { user, loading, signInWithGoogle } = useAuth();
  if (loading) return null;
  if (!user) return <PermissionGate onAction={() => { void signInWithGoogle(); }} />;
  return <AthletePage meUserId={user.uid} />;
}
