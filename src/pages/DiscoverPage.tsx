import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Map as MapIcon, Trophy, Route as RouteIcon, Search } from "lucide-react";
import { firestore } from "../services/firebase";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card, Text } from "../theme/components";
import ChallengeFeed from "../components/discover/ChallengeFeed";
import { fetchStaticJson } from "../utils/staticJson";
import { segmentTileUrl } from "../utils/segmentTiles";

/**
 * 탐색 허브 랜딩(/discover) — '발견→처방→도전' 진입점 (이슈 #486).
 *
 * P0 범위: (1) 통합검색(세그먼트·코스 across) — 전역 검색의 강제 /explore 리다이렉트 대체,
 *         (2) 세그먼트맵·리더보드·코스 진입 카드.
 * 맞춤 챌린지 피드(PDC 결정적 카드)는 #491(P1)에서 이 페이지에 얹는다.
 * mapbox 미사용 — 경량 일반 라우트.
 */

interface SegHit { id: string; name: string; city?: string; state?: string; distance: number; averageGrade: number; climbCategory: number }
interface CourseHit { id: string; name: string; distance: number; elevationGain: number }

const km = (m: number) => (m / 1000).toFixed(1);
const catLabel = (c: number) => (c >= 5 ? "HC" : c >= 1 ? `Cat ${c}` : "");

export default function DiscoverPage() {
  const { t } = useTranslation("common");
  const [sp, setSp] = useSearchParams();
  const [input, setInput] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState((sp.get("q") ?? "").trim());
  const [segs, setSegs] = useState<SegHit[] | null>(null);
  const [courses, setCourses] = useState<CourseHit[] | null>(null);
  const loadedRef = useRef(false);

  // 입력 디바운스 → 질의 + URL 동기화(공유·새로고침 복원)
  useEffect(() => {
    const id = setTimeout(() => {
      const v = input.trim();
      setQ(v);
      setSp(v ? { q: v } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [input, setSp]);

  // 첫 질의 시점에 두 소스 1회 로드(세그먼트 overview + 코스). 빈 질의면 로드 안 함(비용 절약).
  useEffect(() => {
    if (!q || loadedRef.current) return;
    loadedRef.current = true;
    fetchStaticJson<{ segments: SegHit[] }>(segmentTileUrl("overview.json"))
      .then((d: { segments: SegHit[] }) =>
        setSegs(d.segments.map((s) => ({ id: s.id, name: s.name, city: s.city, state: s.state, distance: s.distance, averageGrade: s.averageGrade, climbCategory: s.climbCategory }))),
      )
      .catch(() => setSegs([]));
    getDocs(query(collection(firestore, "courses"), where("deletedAt", "==", null)))
      .then((snap) =>
        setCourses(snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, name: x.name ?? "", distance: x.distance ?? 0, elevationGain: x.elevationGain ?? 0 } as CourseHit;
        })),
      )
      .catch(() => setCourses([]));
  }, [q]);

  const lq = q.toLowerCase();
  const segResults = useMemo(
    () => (!q || !segs ? [] : segs.filter((s) => `${s.name} ${s.city ?? ""} ${s.state ?? ""}`.toLowerCase().includes(lq)).slice(0, 8)),
    [q, segs, lq],
  );
  const courseResults = useMemo(
    () => (!q || !courses ? [] : courses.filter((c) => c.name.toLowerCase().includes(lq)).slice(0, 8)),
    [q, courses, lq],
  );
  const loading = !!q && (segs === null || courses === null);
  const empty = !!q && !loading && segResults.length === 0 && courseResults.length === 0;

  const entries = [
    { to: "/explore", icon: MapIcon, label: t("nav.segments"), desc: t("discover.entrySegmentsDesc") },
    { to: "/leaderboard", icon: Trophy, label: t("nav.leaderboard"), desc: t("discover.entryLeaderboardDesc") },
    { to: "/courses", icon: RouteIcon, label: t("nav.courses"), desc: t("discover.entryCoursesDesc") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{t("discover.title")}</h1>
        <p className="text-[length:var(--fs-sm)] mt-1" style={{ color: "var(--ink-3)" }}>{t("discover.subtitle")}</p>
      </div>

      {/* 통합검색 */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }}><Search size={18} /></span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("discover.searchPlaceholder")}
          aria-label={t("discover.searchPlaceholder")}
          className="w-full pl-10 pr-3 py-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)]"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
        />
      </div>

      {q ? (
        <div className="space-y-5">
          {loading && <Text variant="body" tone="tertiary" as="p">{t("discover.searching")}</Text>}
          {empty && <Text variant="body" tone="tertiary" as="p">{t("discover.noResults")}</Text>}

          {segResults.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <Text as="div" variant="eyebrow">{t("nav.segments")}</Text>
                <Link to={`/explore?q=${encodeURIComponent(q)}`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("discover.viewAll")}</Link>
              </div>
              <div className="space-y-2">
                {segResults.map((s) => (
                  <Link key={s.id} to={`/segment/${s.id}`}>
                    <Card padding="none" className="p-3! hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                      <div className="flex items-center gap-2">
                        {catLabel(s.climbCategory) && <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] font-bold" style={{ background: "var(--bg-3)", color: "var(--lime)" }}>{catLabel(s.climbCategory)}</span>}
                        <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{s.name}</span>
                      </div>
                      <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                        {km(s.distance)}km · {s.averageGrade.toFixed(1)}%{s.city ? ` · ${s.city}` : ""}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {courseResults.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <Text as="div" variant="eyebrow">{t("nav.courses")}</Text>
                <Link to={`/courses?q=${encodeURIComponent(q)}`} className="text-[length:var(--fs-xs)]" style={{ color: "var(--lime)" }}>{t("discover.viewAll")}</Link>
              </div>
              <div className="space-y-2">
                {courseResults.map((c) => (
                  <Link key={c.id} to={`/course/${c.id}`}>
                    <Card padding="none" className="p-3! hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                      <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{c.name}</span>
                      <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{km(c.distance)}km · ↑{Math.round(c.elevationGain)}m</div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* 진입 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {entries.map((e) => (
              <Link key={e.to} to={e.to}>
                <Card padding="none" className="p-4! h-full hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                  <e.icon size={22} style={{ color: "var(--lime)" }} />
                  <div className="font-semibold text-[length:var(--fs-base)] mt-2" style={{ color: "var(--ink-0)" }}>{e.label}</div>
                  <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{e.desc}</div>
                </Card>
              </Link>
            ))}
          </div>

          {/* 맞춤 도전 피드 (#491) — PDC 결정적 카드 + 인기 코스 + RiderType 요약 */}
          <ChallengeFeed />
        </div>
      )}
    </div>
  );
}
