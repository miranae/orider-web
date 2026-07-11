import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Group } from "@shared/types";
import { useToast } from "../../contexts/ToastContext";
import {
  createGroupChallenge,
  joinGroupChallenge,
  useGroupChallenges,
  useManagedGroups,
} from "../../hooks/useGroupChallenges";
import { logClientError } from "../../services/errorLogger";
import { Button, Card, Chip, Text } from "../../theme/components";
import { LoadingSkeleton } from "../redesign";

export default function GroupChallengesPanel({ userId, groups }: { userId: string; groups: Group[] }) {
  const { t } = useTranslation("group");
  const { showToast } = useToast();
  const managedGroups = useManagedGroups(userId, groups);
  const { challenges, loading } = useGroupChallenges();
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!managedGroups.some((group) => group.id === groupId)) setGroupId(managedGroups[0]?.id ?? "");
  }, [groupId, managedGroups]);

  const create = async () => {
    if (!groupId || name.trim().length < 2 || submitting) return;
    setSubmitting(true);
    try {
      await createGroupChallenge({ groupId, name });
      setName("");
      showToast(t("challenges.createSuccess"));
    } catch (err) {
      logClientError("GroupChallengesPanel.create", err, { groupId });
      showToast(t("challenges.createFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const join = async (challengeId: string) => {
    if (!groupId || joiningId) return;
    setJoiningId(challengeId);
    try {
      await joinGroupChallenge({ challengeId, groupId });
      showToast(t("challenges.joinSuccess"));
    } catch (err) {
      logClientError("GroupChallengesPanel.join", err, { groupId, challengeId });
      showToast(t("challenges.joinFailed"), "error");
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <section className="mb-8" aria-labelledby="group-challenges-title">
      <div className="flex items-end justify-between mb-3" style={{ gap: "var(--space-3)" }}>
        <div>
          <h2 id="group-challenges-title" className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{t("challenges.title")}</h2>
          <p className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>{t("challenges.desc")}</p>
        </div>
      </div>

      {managedGroups.length > 0 && (
        <Card padding="compact" className="mb-3">
          <div className="flex items-end flex-wrap" style={{ gap: "var(--space-2)" }}>
            <label className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>
              <span className="block mb-1">{t("challenges.managedGroup")}</span>
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="px-3 py-2 rounded-[var(--r-md)]" style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}>
                {managedGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label className="text-[length:var(--fs-xs)] flex-1" style={{ color: "var(--ink-2)", minWidth: 180 }}>
              <span className="block mb-1">{t("challenges.name")}</span>
              <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} maxLength={80} placeholder={t("challenges.namePlaceholder")} className="w-full px-3 py-2 rounded-[var(--r-md)]" style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }} />
            </label>
            <Button onClick={() => { void create(); }} disabled={submitting || name.trim().length < 2} size="sm">
              {submitting ? t("challenges.creating") : t("challenges.create")}
            </Button>
          </div>
        </Card>
      )}

      {loading ? <LoadingSkeleton kind="list" count={2} /> : challenges.length === 0 ? (
        <Card padding="compact"><Text as="p" variant="body" tone="tertiary">{t("challenges.empty")}</Text></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--space-3)" }}>
          {challenges.map((challenge) => {
            const alreadyJoined = !!groupId && challenge.participantGroupIds.includes(groupId);
            return (
              <Card key={challenge.id} padding="none" style={{ padding: "var(--space-4)" }}>
                <div className="flex items-center justify-between mb-3" style={{ gap: "var(--space-2)" }}>
                  <div className="min-w-0">
                    <h3 className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-1)" }}>{challenge.name}</h3>
                    <Text as="span" variant="eyebrow">{challenge.monthKey} · {t("challenges.distance")}</Text>
                  </div>
                  {groupId && (alreadyJoined ? <Chip>{t("challenges.joined")}</Chip> : (
                    <Button variant="secondary" size="sm" disabled={joiningId === challenge.id} onClick={() => { void join(challenge.id); }}>
                      {joiningId === challenge.id ? t("challenges.joining") : t("challenges.join")}
                    </Button>
                  ))}
                </div>
                <ol className="space-y-2" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {challenge.standings.slice(0, 5).map((standing) => (
                    <li key={standing.groupId} className="flex items-center justify-between text-[length:var(--fs-xs)]" style={{ gap: "var(--space-2)" }}>
                      <span className="truncate" style={{ color: "var(--ink-2)" }}>{standing.rank}. {standing.badge ? `${standing.badge} · ` : ""}{standing.name}</span>
                      <Text variant="num">{standing.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text>
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
