import "../i18n/legalResources";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { isSignInCancelled } from "../utils/signInCancelled";
import { LocalizedLink } from "../components/LocalizedLink";
import { Button, Card, Text } from "../theme/components";
import { getAccountDeletionStatus, readAccountDeletionReceipt, saveAccountDeletionReceipt, reauthenticateAccountDeletion, requestAccountDeletion, requiresDeletionReauthentication, requiresDeletionOwnerLogin, type AccountDeletionStatus } from "../services/accountDeletion";

export default function AccountDeletionPage() {
  const { t } = useTranslation("legal");
  const { user, loading, signIn } = useAuth();
  const [job, setJob] = useState<AccountDeletionStatus | null>(null);
  const [jobOwner, setJobOwner] = useState<string | undefined>();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [hasReceipt, setHasReceipt] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const identity = useRef(user?.uid);
  identity.current = user?.uid;
  const requesting = useRef(false);
  const previousIdentity = useRef(user?.uid);
  const accountGeneration = useRef({ uid: user?.uid, generation: 0 });
  if (user && accountGeneration.current.uid !== user.uid) {
    accountGeneration.current = { uid: user.uid, generation: accountGeneration.current.generation + 1 };
  }
  const visibleJob = !user || jobOwner === user.uid ? job : null;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setChecked(false);
    const saved = readAccountDeletionReceipt(user?.uid);
    setJobOwner(saved?.owner ?? user?.uid);
    setHasReceipt(!!saved);
    if (previousIdentity.current !== user?.uid && user) {
      setJob(null);
      setSessionUnavailable(false);
      previousIdentity.current = user?.uid;
    }
    setError(null);
    setConfirmation("");
    setNeedsReauth(false);
    if (!user && !saved) return;
    async function check() {
      try {
        const status = await getAccountDeletionStatus(saved?.receipt);
        if (!active) return;
        setChecked(true);
        setJob(status);
        setError(null);
        if (status && status.state !== "complete") timer = setTimeout(() => void check(), 5000);
      } catch {
        if (active) setError("statusFailed");
      }
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [user?.uid, refresh]);

  async function submit() {
    if (!user || !checked || job || requesting.current || confirmation !== "DELETE") return;
    const uid = user.uid;
    const generation = accountGeneration.current.generation;
    requesting.current = true;
    setBusy(true);
    setError(null);
    try {
      const { receipt, ...status } = await requestAccountDeletion();
      if (accountGeneration.current.generation !== generation || (identity.current && identity.current !== uid)) return;
      setSessionUnavailable(saveAccountDeletionReceipt(uid, receipt) === false);
      setJob(status);
      setConfirmation("");
      setRefresh(value => value + 1);
    } catch (failure) {
      if (accountGeneration.current.generation !== generation || (identity.current && identity.current !== uid)) return;
      const reauth = requiresDeletionReauthentication(failure);
      const ownerLogin = requiresDeletionOwnerLogin(failure);
      setNeedsReauth(reauth || ownerLogin);
      setError(ownerLogin ? "ownerLoginRequired" : reauth ? "reauthRequired" : "requestFailed");
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }

  async function authenticate(reauth: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (reauth) await reauthenticateAccountDeletion();
      else await signIn();
      setNeedsReauth(false);
    } catch (err) {
      if (!isSignInCancelled(err)) setError("signInFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto space-y-6 pb-20">
      <Text as="h1" variant="title">{t("accountDeletion.title")}</Text>
      <p>{t("accountDeletion.intro")}</p>
      <Card className="space-y-4"><p>{t("accountDeletion.support")}</p><a href="mailto:orider.app@gmail.com?subject=O-Rider%20account%20deletion%20request" className="text-[var(--lime)] underline">orider.app@gmail.com</a></Card>
      <Card className="space-y-4">
        <Text as="h2" variant="subtitle">{t("accountDeletion.scopeTitle")}</Text>
        <p>{t("accountDeletion.scope")}</p>
        <p>{t("accountDeletion.retention")}</p>
        <p>{t("accountDeletion.providerRetention")}</p>
        <p>{t("accountDeletion.backupRetention")}</p>
        <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--lime)] underline">{t("accountDeletion.providerPolicy")}</a>
        <p>{t("accountDeletion.thirdParty")}</p>
        <p>{t("accountDeletion.steps")}</p>
      </Card>
      <Card className="space-y-4">
        <Text as="h2" variant="subtitle">{t("accountDeletion.requestTitle")}</Text>
        {loading && <p role="status">{t("accountDeletion.checking")}</p>}
        {!loading && !user && !hasReceipt && <><p>{t("accountDeletion.signInHelp")}</p><Button loading={busy} onClick={() => void authenticate(false)}>{t("accountDeletion.signIn")}</Button></>}
        {user && <p>{t("accountDeletion.account", { account: user.email ?? user.displayName ?? user.uid })}</p>}
        {(user || hasReceipt) && !checked && !error && <p role="status">{t("accountDeletion.checking")}</p>}
        {visibleJob && <p role="status" aria-live="polite">{t(`accountDeletion.state.${visibleJob.state}`)}</p>}
        {visibleJob?.providerDeletionRequested && <p role="status">{t("accountDeletion.providerProcessing")}</p>}
        {sessionUnavailable && <p role="status">{t("accountDeletion.sessionUnavailable")}</p>}
        {error && <p role="alert">{t(`accountDeletion.${error}`)}</p>}
        {(user || hasReceipt) && error === "statusFailed" && <Button onClick={() => setRefresh(value => value + 1)}>{t("accountDeletion.retryStatus")}</Button>}
        {user && needsReauth && <Button loading={busy} onClick={() => void authenticate(true)}>{t("accountDeletion.reauthenticate")}</Button>}
        {user && checked && !job && error !== "statusFailed" && <>
          <label className="block space-y-2"><span>{t("accountDeletion.confirm")}</span><input className="ds-input" value={confirmation} autoComplete="off" onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
          <Button variant="danger" loading={busy} disabled={confirmation !== "DELETE" || needsReauth} onClick={() => void submit()}>{t("accountDeletion.submit")}</Button>
        </>}
        {visibleJob?.state !== "complete" && <p>{t("accountDeletion.completionNote")}</p>}
      </Card>
      <LocalizedLink to="/privacy" className="text-[var(--lime)] underline">{t("accountDeletion.privacyLink")}</LocalizedLink>
    </main>
  );
}
