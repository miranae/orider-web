import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMembers } from "../../hooks/useGroup";
import { useGroupRides } from "../../hooks/useGroupRides";
import GroupSubNav from "../../components/group/GroupSubNav";
import RideCard from "../../components/group/RideCard";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";

export default function GroupRidesPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading } = useGroup(groupId);
  const { members } = useGroupMembers(groupId);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const { rides, loading } = useGroupRides(memberIds);

  const [minParticipants, setMinParticipants] = useState(0);

  const filteredRides = useMemo(() => {
    if (minParticipants === 0) return rides;
    return rides.filter((r) => r.participantCount >= minParticipants);
  }, [rides, minParticipants]);

  if (groupLoading || !group) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-7 w-16 rounded-full" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
      </div>
    );
  }

  const isCreator = user?.uid === group.creatorId;

  return (
    <div>
      <GroupSubNav group={group} isCreator={isCreator} />

      <div className="flex items-center gap-3 mb-4">
        <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{t("filter.byParticipants")}:</span>
        {[0, 2, 5].map((n) => (
          <button
            key={n}
            onClick={() => setMinParticipants(n)}
            className="px-3 py-1 text-[length:var(--fs-xs)] rounded-full transition-colors"
            style={
              minParticipants === n
                ? { background: "var(--lime)", color: "var(--bg-0)" }
                : { background: "var(--bg-2)", color: "var(--ink-2)" }
            }
          >
            {n === 0 ? t("filter.all") : `${n}${t("filter.all")}+`}
          </button>
        ))}
      </div>

      {loading && rides.length === 0 ? (
        <LoadingSkeleton kind="list" count={5} />
      ) : filteredRides.length === 0 ? (
        <EmptyState icon="🚴" title={t("empty.noRides")} compact />
      ) : (
        <div className="space-y-3">
          {filteredRides.map((r) => (
            <RideCard key={r.groupRideId} ride={r} />
          ))}
        </div>
      )}
    </div>
  );
}
