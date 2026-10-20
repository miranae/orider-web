import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import { LocalizedLink } from "../LocalizedLink";
import { Button, Input, Select } from "../../theme/components";
import koBoard from "../../i18n/resources/ko/board.json";
import enBoard from "../../i18n/resources/en/board.json";
import { useAuth } from "../../contexts/AuthContext";
import { readDashboardPreferences } from "../../hooks/useDashboardPreferences";
import { searchPublicUserProfilesPage, type PublicUserProfile } from "../../services/publicProfiles";

const destinations = {
  activities: "/", athletes: null, clubs: "/clubs", courses: "/explore/courses",
  segments: "/explore/segments", posts: "/community/board",
} as const;
type SearchCategory = keyof typeof destinations;

// 메뉴는 첫 클릭에 바로 열려야 하므로 게시판의 HTTP 네임스페이스 로딩을 기다리지 않는다.
// 명칭은 게시판 정본 리소스에서 동기적으로 공유한다.
const boardTabs = {
  ko: { all: koBoard["tab.all"], inquiry: koBoard["tab.inquiry"], devlog: koBoard["tab.devlog"], archive: koBoard["tab.archive"] },
  en: { all: enBoard["tab.all"], inquiry: enBoard["tab.inquiry"], devlog: enBoard["tab.devlog"], archive: enBoard["tab.archive"] },
};

const defaults: Record<SearchCategory, Record<string, string>> = {
  activities: { q: "", scope: "all", date: "all", sport: "all" },
  athletes: { q: "", match: "prefix" },
  clubs: { q: "", sport: "ALL", city: "" },
  courses: { q: "", surface: "", difficulty: "", mine: "0" },
  segments: { q: "", sport: "bike", cat: "all" },
  posts: { q: "", type: "all", tag: "" },
};
type SearchField = { key: string; label: string; options?: [string, string][] };
const sports: [string, string][] = [["bike", "bike"], ["run", "run"], ["swim", "swim"]];
const fields: Record<SearchCategory, SearchField[]> = {
  activities: [
    { key: "scope", label: "scope", options: [["all", "all"], ["friends", "friends"], ["self", "self"]] },
    { key: "date", label: "date", options: [["all", "all"], ["7d", "7d"], ["30d", "30d"], ["90d", "90d"]] },
    { key: "sport", label: "sport", options: [["all", "all"], ...sports] },
  ],
  athletes: [{ key: "match", label: "match", options: [["prefix", "prefix"], ["exact", "exact"]] }],
  clubs: [{ key: "sport", label: "sport", options: [["ALL", "all"], ...sports, ["tri", "tri"]] }, { key: "city", label: "city" }],
  courses: [
    { key: "surface", label: "surface", options: [["", "all"], ["paved", "paved"], ["gravel", "gravel"], ["mixed", "mixed"]] },
    { key: "difficulty", label: "difficulty", options: [["", "all"], ...[1, 2, 3, 4, 5].map(value => [String(value), `difficulty${value}`] as [string, string])] },
    { key: "mine", label: "owner", options: [["0", "all"], ["1", "myCourses"]] },
  ],
  segments: [
    { key: "sport", label: "sport", options: [["bike", "bike"], ["run", "run"]] },
    { key: "cat", label: "segmentType", options: [["all", "all"], ["climb", "climb"], ["flat", "flat"]] },
  ],
  posts: [{ key: "type", label: "board", options: [["all", "all"], ["inquiry", "inquiry"], ["devlog", "devlog"], ["archive", "archive"]] }, { key: "tag", label: "tag" }],
};
function routeCategory(path: string): SearchCategory | null {
  if (/\/explore\/courses$/.test(path)) return "courses";
  if (/\/explore\/segments$/.test(path)) return "segments";
  if (/\/clubs$/.test(path)) return "clubs";
  if (/\/community\/board$/.test(path)) return "posts";
  if (/^\/(ko|en)\/?$/.test(path) || path === "/") return "activities";
  return null;
}

export default function MobileMenuSearch({ onNavigate }: { onNavigate: () => void }) {
  const { t, i18n } = useTranslation("common");
  const boardTabLabels = (i18n.resolvedLanguage ?? i18n.language).startsWith("ko") ? boardTabs.ko : boardTabs.en;
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const storageKey = `orider.menuSearch.v1.${user?.uid ?? "guest"}`;
  const [category, setCategory] = useState<SearchCategory>(() => routeCategory(location.pathname) ?? "activities");
  const [drafts, setDrafts] = useState<Record<SearchCategory, Record<string, string>>>(() => {
    let restored = defaults;
    let restoredRoute: string | undefined;
    try {
      const raw = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (raw?.drafts && typeof raw.drafts === "object") {
        restored = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
          Object.fromEntries(Object.entries(value).map(([field, fallback]) => [field, typeof raw.drafts[key]?.[field] === "string" ? raw.drafts[key][field] : fallback])),
        ])) as typeof defaults;
        restoredRoute = raw.route;
      }
    } catch { /* 저장소가 없어도 현재 URL 조건으로 검색할 수 있다. */ }
    const current = routeCategory(location.pathname);
    if (!current || restoredRoute === `${location.pathname}${location.search}`) return restored;
    const params = new URLSearchParams(location.search);
    const initial = { ...defaults[current] };
    if (current === "activities" && user) {
      const preferences = readDashboardPreferences(user.uid);
      initial.scope = preferences.feedScope;
      initial.date = preferences.datePreset;
      initial.sport = preferences.sportFilter;
    }
    for (const key of Object.keys(initial)) if (params.has(key)) initial[key] = params.get(key)!;
    return { ...restored, [current]: initial };
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ route: `${location.pathname}${location.search}`, drafts })); } catch { /* 메모리의 입력 상태를 유지한다. */ }
  }, [drafts, storageKey, location.pathname, location.search]);
  const draft = drafts[category];
  const query = draft.q ?? "";
  const updateDraft = (key: string, value: string) => {
    setDrafts(previous => ({ ...previous, [category]: { ...previous[category], [key]: value } }));
    if (category === "athletes") {
      epoch.current += 1;
      setProfiles([]); setPage(null); setSearched(""); setLoading(false); setFailed(false);
    }
  };
  const activeCount = Object.entries(draft).filter(([key, value]) => key === "q" ? value.trim() : value !== defaults[category][key]).length;
  const applyDestination = (values: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value.trim() && (category === "activities" || value !== defaults[category][key])) params.set(key, value.trim());
    }
    onNavigate();
    navigate(`${destinations[category]}${params.size ? `?${params}` : ""}`);
  };
  const [profiles, setProfiles] = useState<PublicUserProfile[]>([]);
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = useState<Awaited<ReturnType<typeof searchPublicUserProfilesPage>> | null>(null);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const epoch = useRef(0);

  const searchAthletes = async (keyword: string, more = false) => {
    const request = ++epoch.current;
    setLoading(true);
    setFailed(false);
    if (!more) { setProfiles([]); setPage(null); setSearched(keyword); }
    try {
      const result = draft.match === "exact"
        ? await searchPublicUserProfilesPage(keyword, more ? page?.cursor : null, undefined, "exact")
        : await searchPublicUserProfilesPage(keyword, more ? page?.cursor : null);
      if (request !== epoch.current) return;
      setProfiles(previous => more ? [...previous, ...result.items] : result.items);
      setPage(result);
    } catch {
      if (request === epoch.current) setFailed(true);
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  };

  return <div className="mobile-menu-search">
    <form role="search" aria-label={t("topnav.menuSearch.label")} onSubmit={event => {
      event.preventDefault();
      const keyword = query.trim();
      if (category === "athletes") { if (keyword) void searchAthletes(keyword); return; }
      applyDestination(draft);
    }}>
      <Select className="mobile-menu-control" aria-label={t("topnav.menuSearch.category")} value={category} onChange={event => {
        epoch.current += 1;
        setCategory(event.target.value as SearchCategory);
        setProfiles([]); setPage(null); setSearched(""); setLoading(false); setFailed(false);
      }}>
        {(Object.keys(destinations) as SearchCategory[]).map(key => <option key={key} value={key}>{t(`topnav.menuSearch.${key}`)}</option>)}
      </Select>
      <Input className="mobile-menu-control" type="search" aria-label={t("topnav.menuSearch.keyword")} placeholder={t("topnav.menuSearch.placeholder")}
        value={query} onChange={event => updateDraft("q", event.target.value)} required={category === "athletes"} />
      <Button type="submit" size="lg" iconOnly variant="ghost" aria-label={t("topnav.menuSearch.submit")} disabled={(category === "athletes" && !query.trim()) || loading}><Search size={20} /></Button>
    </form>
    <fieldset className="mobile-menu-filter-section" aria-label={t("topnav.menuSearch.filters", { count: activeCount })}>
      <legend><span className="mobile-menu-filter-header">
        <span>{t("topnav.menuSearch.filters", { count: activeCount })}</span>
        <Button variant="ghost" size="sm" onClick={() => {
          epoch.current += 1;
          setDrafts(previous => ({ ...previous, [category]: { ...defaults[category] } }));
          setProfiles([]); setPage(null); setSearched(""); setLoading(false); setFailed(false);
          if (category !== "athletes") applyDestination(defaults[category]);
        }}>{t("topnav.menuSearch.clear")}</Button>
      </span></legend>
      <div className="mobile-menu-filters">
        {fields[category].map(field => <label key={field.key}>
          <span>{t(`topnav.menuSearch.${field.label}`)}</span>
          {field.options ? <Select className="mobile-menu-control" aria-label={t(`topnav.menuSearch.${field.label}`)} value={draft[field.key]} onChange={event => updateDraft(field.key, event.target.value)}>
            {field.options.map(([value, label]) => <option key={value} value={value} disabled={!user && ((field.key === "scope" && value !== "all") || (field.key === "mine" && value === "1"))}>{category === "posts" && field.key === "type" ? boardTabLabels[value as keyof typeof boardTabLabels] : t(`topnav.menuSearch.${label}`)}</option>)}
          </Select> : <Input className="mobile-menu-control" aria-label={t(`topnav.menuSearch.${field.label}`)} value={draft[field.key]} onChange={event => updateDraft(field.key, event.target.value)} />}
        </label>)}
      </div>
    </fieldset>
    {(category === "athletes" || category === "clubs") && <p className="mobile-search-hint">{t(`topnav.menuSearch.${category === "athletes" && draft.match === "exact" ? "athletesExactHint" : `${category}Hint`}`)}</p>}
    {category === "athletes" && searched && <div aria-live="polite" className="mobile-athlete-results">
      {profiles.map(profile => <LocalizedLink key={profile.id} to={`/athlete/${profile.id}`} onClick={onNavigate} className="mobile-navigation-link">
        <span className="mobile-athlete-avatar" aria-hidden="true">
          {profile.photoURL && !failedPhotos.has(profile.id) ? <img src={profile.photoURL} alt="" onError={() => {
            setFailedPhotos(previous => new Set(previous).add(profile.id));
          }} /> : profile.nickname.slice(0, 1)}
        </span><span>{profile.nickname}</span>
      </LocalizedLink>)}
      {loading ? <p role="status">{t("topnav.menuSearch.loading")}</p> : failed ? <>
        <p role="alert">{t("topnav.menuSearch.failed")}</p>
        <Button variant="secondary" onClick={() => void searchAthletes(searched, profiles.length > 0)}>{t("topnav.menuSearch.retry")}</Button>
      </> : profiles.length === 0 ? <p>{t("topnav.menuSearch.empty")}</p> : null}
      {!loading && !failed && page?.hasMore && <Button variant="secondary" onClick={() => void searchAthletes(searched, true)}>{t("topnav.menuSearch.more")}</Button>}
    </div>}
  </div>;
}
