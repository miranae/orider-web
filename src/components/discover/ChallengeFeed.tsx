/**
 * ChallengeFeed — 공개 프론트엔드용 Discover 카드.
 *
 * 개인화 세그먼트 예측과 챌린지 생성 로직은 서버/비공개 코드 경계 안에 둔다.
 * 공개 클라이언트는 정적 overview와 공개 코스 메타데이터만 사용해 탐색용 카드를 렌더링한다.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { Mountain, Route as RouteIcon, Trophy } from "lucide-react";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { MONTHLY_CHALLENGE_TIERS, useMonthlyChallenge, type MonthlyChallengeTier } from "../../hooks/useMonthlyChallenge";
import { isVisibleCourseDocData } from "../../features/courses/courseVisibility";
import { LocalizedLink as Link } from "../LocalizedLink";
import { Button, Card, Chip, Text } from "../../theme/components";
import { fetchStaticJson } from "../../utils/staticJson";
import { segmentTileUrl } from "../../utils/segmentTiles";

interface OverviewSeg {
  id: string;
  name: string;
  distance: number;
  averageGrade: number;
  climbCategory: number;
  city?: string;
}

interface CourseHit {
  id: string;
  name: string;
  distance: number;
  elevationGain: number;
  likeCount: number;
}

const km = (m: number) => (m / 1000).toFixed(1);
const catLabel = (c: number) => (c >= 5 ? "HC" : c >= 1 ? `Cat ${c}` : "");

export default function ChallengeFeed() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { showToast } = useToast();
  const monthly = useMonthlyChallenge(user?.uid);
  const [segments, setSegments] = useState<OverviewSeg[] | null>(null);
  const [courses, setCourses] = useState<CourseHit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStaticJson<{ segments: OverviewSeg[] }>(segmentTileUrl("overview.json"))
      .then((data) => { if (!cancelled) setSegments(data.segments); })
      .catch((err) => {
        logClientError("ChallengeFeed.overview", err, {});
        if (!cancelled) setSegments([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(firestore, "courses")))
      .then((snap) => {
        const items = snap.docs
          .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
          .filter((item) => isVisibleCourseDocData(item.data))
          .map((item) => ({
            id: item.id,
            name: item.data.name ?? "",
            distance: item.data.distance ?? 0,
            elevationGain: item.data.elevationGain ?? 0,
            likeCount: item.data.likeCount ?? 0,
          } as CourseHit));
        items.sort((a, b) => b.likeCount - a.likeCount || b.distance - a.distance);
        if (!cancelled) setCourses(items.slice(0, 4));
      })
      .catch((err) => {
        logClientError("ChallengeFeed.courses", err, {});
        if (!cancelled) setCourses([]);
      });
    return () => { cancelled = true; };
  }, []);

  const notable = useMemo(() => {
    if (!segments) return null;
    return segments
      .filter((segment) => segment.climbCategory >= 1)
      .sort((a, b) => b.climbCategory - a.climbCategory || b.distance - a.distance || a.id.localeCompare(b.id))
      .slice(0, 4);
  }, [segments]);

  return (
    <div className="space-y-5">
      {user && (
        <section aria-labelledby="personal-monthly-challenge-title">
          <SectionHeader icon={Trophy} title={t("discover.challenge.monthlyTitle")} />
          <Card padding="none" className="p-4!" style={{ borderRadius: "var(--r-lg)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="personal-monthly-challenge-title" className="font-semibold" style={{ color: "var(--ink-0)" }}>
                  {t("discover.challenge.monthlyHeading", { month: monthly.monthKey })}
                </h3>
                <Text as="p" variant="body" tone="tertiary">{t("discover.challenge.monthlyDescription")}</Text>
              </div>
              {monthly.participation && <Chip>{t("discover.challenge.joined")}</Chip>}
            </div>
            {monthly.loading ? (
              <Text as="p" variant="body" tone="tertiary" style={{ marginTop: "var(--space-3)" }}>{t("discover.challenge.loading")}</Text>
            ) : monthly.participation && monthly.progress ? (
              <div className="mt-4">
                <div className="flex justify-between text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>
                  <span>{monthly.progress.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</span>
                  <span>{monthly.participation.tierKm.toLocaleString()} km</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("discover.challenge.monthlyProgressLabel")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(monthly.progress.percent)}
                  className="h-2 mt-2 overflow-hidden rounded-full"
                  style={{ background: "var(--bg-3)" }}
                >
                  <div className="h-full rounded-full" style={{ width: `${monthly.progress.percent}%`, background: "var(--lime)" }} />
                </div>
                <Text as="p" variant="body" tone={monthly.progress.completed ? "accent" : "tertiary"} style={{ marginTop: "var(--space-2)" }}>
                  {monthly.progress.completed
                    ? t("discover.challenge.monthlyCompleted")
                    : t("discover.challenge.monthlyRemaining", { distance: monthly.progress.remainingKm.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
                </Text>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-4">
                {MONTHLY_CHALLENGE_TIERS.map((tier) => (
                  <Button
                    key={tier}
                    variant="secondary"
                    size="sm"
                    disabled={monthly.joining}
                    onClick={() => {
                      void monthly.join(tier as MonthlyChallengeTier)
                        .then(() => showToast(t("discover.challenge.joinSuccess", { tier })))
                        .catch((err) => {
                          logClientError("ChallengeFeed.monthlyJoin", err, { tier, monthKey: monthly.monthKey });
                          showToast(t("discover.challenge.joinFailed"), "error");
                        });
                    }}
                  >
                    {t("discover.challenge.joinTier", { tier })}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      <FallbackSegments segments={notable} />

      {courses && courses.length > 0 && (
        <section>
          <SectionHeader icon={RouteIcon} title={t("discover.challenge.popularCourses")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {courses.map((course) => (
              <Link key={course.id} to={`/course/${course.id}`}>
                <Card padding="none" className="p-3! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                  <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{course.name}</span>
                  <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                    {km(course.distance)}km · ↑{Math.round(course.elevationGain)}m
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Mountain; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={15} style={{ color: "var(--lime)" }} />
      <Text as="div" variant="eyebrow">{title}</Text>
    </div>
  );
}

function FallbackSegments({ segments }: { segments: OverviewSeg[] | null }) {
  const { t } = useTranslation("common");
  if (!segments || segments.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={Mountain} title={t("discover.challenge.notable")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {segments.map((segment) => (
          <Link key={segment.id} to={`/segment/${segment.id}`}>
            <Card padding="none" className="p-3! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
              <div className="flex items-center gap-2">
                {catLabel(segment.climbCategory) && (
                  <span className="text-[length:var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] font-bold" style={{ background: "var(--bg-3)", color: "var(--lime)" }}>
                    {catLabel(segment.climbCategory)}
                  </span>
                )}
                <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{segment.name}</span>
              </div>
              <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                {km(segment.distance)}km · {Number.isFinite(segment.averageGrade) ? segment.averageGrade.toFixed(1) : "0.0"}%{segment.city ? ` · ${segment.city}` : ""}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
