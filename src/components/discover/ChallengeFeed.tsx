/**
 * ChallengeFeed — /discover 맞춤 도전 피드 (이슈 #491).
 *
 * '둘러보기'를 '도전 가능한 다음 기록'으로. 학습 불필요·결정적:
 *   - 세그먼트 overview(GCS 캐시 1 fetch) + 내 베스트(collectionGroup efforts 1 query,
 *     LeaderboardPage 와 동일 패턴) + PDC + riderType → shared/training/challengeFeed.
 *   - 3 카테고리(내 기록 깨기·내 강점·새로운 곳) 각 카드에 #487 PDC 예상 완주시간.
 *   - 인기 코스(likeCount) + RiderType 요약(RiderTypeCard 재사용).
 * 비로그인/PDC 미비: 인기 코스 + 주목 세그먼트 폴백(데모성 발견).
 *
 * 보류(후속): 동네 레전드 도전(Local Legend cron 미배포 시 공허 — 배포 후 활성),
 *  리더보드 진입가능(세그먼트별 effort cutoff 필요 — fan-out; SegmentPage #487 예상순위로 대체).
 */
import { useEffect, useMemo, useState } from "react";
import { collectionGroup, getDocs, limit, orderBy, query, where, collection } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { Flame, Mountain, MapPin, Route as RouteIcon } from "lucide-react";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { usePdc } from "../../hooks/usePdc";
import { logClientError } from "../../services/errorLogger";
import { LocalizedLink as Link } from "../LocalizedLink";
import { Card, Text } from "../../theme/components";
import RiderTypeCard from "../RiderTypeCard";
import { buildChallengeFeed, type FeedSegment, type ChallengeCard } from "@shared/training/challengeFeed";

const TILES_BASE = import.meta.env.VITE_SEGMENT_TILES_BASE;

interface OverviewSeg {
  id: string; name: string; distance: number; averageGrade: number; climbCategory: number; city?: string;
}
interface CourseHit { id: string; name: string; distance: number; elevationGain: number; likeCount: number }

const km = (m: number) => (m / 1000).toFixed(1);
const catLabel = (c: number) => (c >= 5 ? "HC" : c >= 1 ? `Cat ${c}` : "");

function fmtTime(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function ChallengeFeed() {
  const { t } = useTranslation("common");
  const { user, profile } = useAuth();
  const { pdc } = usePdc(user?.uid);

  const [segs, setSegs] = useState<OverviewSeg[] | null>(null);
  const [myBest, setMyBest] = useState<Record<string, number>>({});
  const [courses, setCourses] = useState<CourseHit[] | null>(null);

  const weightKg = profile?.weightKg ?? null;
  const cp = pdc?.cp?.value ?? null;
  const wPrime = pdc?.cp?.wPrime ?? null;
  const riderType = pdc?.riderType?.type ?? null;
  const hasPdc = !!user && cp != null && cp > 0 && weightKg != null && weightKg > 0;

  // overview(세그먼트) 로드 — PDC 있을 때만(피드 계산에 필요). 캐시 정적 파일 1 fetch.
  useEffect(() => {
    if (!hasPdc) { setSegs(null); return; }
    let cancelled = false;
    fetch(`${TILES_BASE}/overview.json`)
      .then((r) => r.json())
      .then((d: { segments: OverviewSeg[] }) => { if (!cancelled) setSegs(d.segments); })
      .catch((err) => { logClientError("ChallengeFeed.overview", err, {}); if (!cancelled) setSegs([]); });
    return () => { cancelled = true; };
  }, [hasPdc]);

  // 내 베스트(세그먼트별 최단 elapsed) — collectionGroup 1 query (LeaderboardPage 패턴).
  useEffect(() => {
    if (!user) { setMyBest({}); return; }
    let cancelled = false;
    getDocs(query(collectionGroup(firestore, "efforts"), where("userId", "==", user.uid), orderBy("elapsedTime", "asc"), limit(500)))
      .then((snap) => {
        const best: Record<string, number> = {};
        snap.forEach((d) => {
          const segId = d.ref.parent.parent?.id;
          if (!segId) return;
          const ms = d.data().elapsedTime;
          if (typeof ms !== "number") return;
          const sec = ms / 1000;
          if (best[segId] == null || sec < best[segId]) best[segId] = sec;
        });
        if (!cancelled) setMyBest(best);
      })
      .catch((err) => { logClientError("ChallengeFeed.myBest", err, { uid: user.uid }); if (!cancelled) setMyBest({}); });
    return () => { cancelled = true; };
  }, [user]);

  // 인기 코스 — likeCount desc top.
  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(firestore, "courses"), where("deletedAt", "==", null)))
      .then((snap) => {
        const cs = snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, name: x.name ?? "", distance: x.distance ?? 0, elevationGain: x.elevationGain ?? 0, likeCount: x.likeCount ?? 0 } as CourseHit;
        });
        cs.sort((a, b) => b.likeCount - a.likeCount || b.distance - a.distance);
        if (!cancelled) setCourses(cs.slice(0, 4));
      })
      .catch((err) => { logClientError("ChallengeFeed.courses", err, {}); if (!cancelled) setCourses([]); });
    return () => { cancelled = true; };
  }, []);

  const feed = useMemo(() => {
    if (!hasPdc || !segs) return null;
    const feedSegs: FeedSegment[] = segs.map((s) => ({
      id: s.id, name: s.name, distanceM: s.distance, avgGradePct: s.averageGrade, climbCategory: s.climbCategory, ...(s.city ? { city: s.city } : {}),
    }));
    return buildChallengeFeed({ segments: feedSegs, myBestSecBySegment: myBest, cp, wPrime, riderWeightKg: weightKg, riderType, limitPerCategory: 4 });
  }, [hasPdc, segs, myBest, cp, wPrime, weightKg, riderType]);

  // 폴백 소스: PDC 경로면 이미 받은 segs 재사용, 비로그인/PDC 미비면 overview 별도 1 fetch.
  const [fallbackRaw, setFallbackRaw] = useState<OverviewSeg[] | null>(null);
  useEffect(() => {
    if (hasPdc) return; // PDC 있으면 segs 재사용 — 별도 fetch 불필요
    let cancelled = false;
    fetch(`${TILES_BASE}/overview.json`)
      .then((r) => r.json())
      .then((d: { segments: OverviewSeg[] }) => { if (!cancelled) setFallbackRaw(d.segments); })
      .catch((err) => { logClientError("ChallengeFeed.fallbackOverview", err, {}); if (!cancelled) setFallbackRaw([]); });
    return () => { cancelled = true; };
  }, [hasPdc]);

  // 주목 세그먼트(등급순) — feed 가 비거나 PDC 미비일 때 표시.
  const notable = useMemo(() => {
    const source = segs ?? fallbackRaw;
    if (!source) return null;
    return source.filter((s) => s.climbCategory >= 1).sort((a, b) => b.climbCategory - a.climbCategory || b.distance - a.distance).slice(0, 4);
  }, [segs, fallbackRaw]);

  const feedHasCards = !!feed && (feed.beatPr.length > 0 || feed.strength.length > 0 || feed.newPlace.length > 0);

  return (
    <div className="space-y-5">
      {hasPdc && pdc && <RiderTypeCard pdc={pdc} />}

      {feedHasCards ? (
        <>
          <FeedSection icon={Flame} title={t("discover.challenge.beatPr")} cards={feed!.beatPr} kind="beatPr" />
          <FeedSection icon={Mountain} title={t("discover.challenge.strength")} cards={feed!.strength} kind="strength" />
          <FeedSection icon={MapPin} title={t("discover.challenge.newPlace")} cards={feed!.newPlace} kind="newPlace" />
        </>
      ) : (
        <FallbackSegments segs={notable} />
      )}

      {/* 인기 코스 */}
      {courses && courses.length > 0 && (
        <section>
          <SectionHeader icon={RouteIcon} title={t("discover.challenge.popularCourses")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {courses.map((c) => (
              <Link key={c.id} to={`/course/${c.id}`}>
                <Card padding="none" className="p-3! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                  <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{c.name}</span>
                  <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{km(c.distance)}km · ↑{Math.round(c.elevationGain)}m</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Flame; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={15} style={{ color: "var(--lime)" }} />
      <Text as="div" variant="eyebrow">{title}</Text>
    </div>
  );
}

function FeedSection({ icon, title, cards, kind }: { icon: typeof Flame; title: string; cards: ChallengeCard[]; kind: "beatPr" | "strength" | "newPlace" }) {
  if (cards.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={icon} title={title} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cards.map((c) => <ChallengeCardItem key={c.segmentId} card={c} kind={kind} />)}
      </div>
    </section>
  );
}

function ChallengeCardItem({ card, kind }: { card: ChallengeCard; kind: "beatPr" | "strength" | "newPlace" }) {
  const { t } = useTranslation("common");
  return (
    <Link to={`/segment/${card.segmentId}`}>
      <Card padding="none" className="p-3! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
        <div className="flex items-center gap-2">
          {catLabel(card.climbCategory) && <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] font-bold" style={{ background: "var(--bg-3)", color: "var(--lime)" }}>{catLabel(card.climbCategory)}</span>}
          <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{card.name}</span>
        </div>
        <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
          {km(card.distanceM)}km · {card.avgGradePct.toFixed(1)}%{card.city ? ` · ${card.city}` : ""}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[length:var(--fs-sm)] font-bold" style={{ color: "var(--lime)" }}>{t("discover.challenge.predicted", { time: fmtTime(card.predictedSec) })}</span>
          {kind === "beatPr" && card.improvementSec != null && (
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--amber)" }}>{t("discover.challenge.faster", { sec: Math.round(card.improvementSec) })}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}

function FallbackSegments({ segs }: { segs: OverviewSeg[] | null }) {
  const { t } = useTranslation("common");
  if (!segs || segs.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={Mountain} title={t("discover.challenge.notable")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {segs.map((s) => (
          <Link key={s.id} to={`/segment/${s.id}`}>
            <Card padding="none" className="p-3! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
              <div className="flex items-center gap-2">
                {catLabel(s.climbCategory) && <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] font-bold" style={{ background: "var(--bg-3)", color: "var(--lime)" }}>{catLabel(s.climbCategory)}</span>}
                <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{s.name}</span>
              </div>
              <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{km(s.distance)}km · {s.averageGrade.toFixed(1)}%{s.city ? ` · ${s.city}` : ""}</div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
