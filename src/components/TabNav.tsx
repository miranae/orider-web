import { NavLink, useParams } from "react-router-dom";
import { SUPPORTED_LANGS } from "../i18n/detector";

const langSet = new Set<string>([...SUPPORTED_LANGS]);
const tabFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]";

/** RouteTab `to` 에 현재 로케일 prefix(`/ko` 등) 부여. 절대 URL·이미 prefix 된 경로는 이중화 없이 그대로. */
function localizeTo(to: string, lang: string | undefined): string {
  if (/^[a-z]+:\/\//i.test(to) || to.startsWith("//") || to.startsWith("mailto:") || to.startsWith("tel:")) return to;
  const norm = to.startsWith("/") ? to : "/" + to;
  const firstSeg = norm.split("/")[1];
  if (firstSeg !== undefined && langSet.has(firstSeg)) return norm; // 이미 lang prefix 있음 → /ko/ko 방지
  return `/${lang ?? "ko"}${norm}`;
}

interface TabNavProps {
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export default function TabNav({ tabs, activeTab, onChange }: TabNavProps) {
  return (
    <div className="flex border-b overflow-x-auto" role="tablist" style={{ borderColor: "var(--line-soft)" }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-shrink-0 whitespace-nowrap rounded-t-[var(--r-sm)] px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors ${tabFocusClass} ${
            activeTab === tab.id
              ? ""
              : "border-transparent hover:border-[var(--line)]"
          }`}
          style={activeTab === tab.id ? { borderColor: "var(--lime)", color: "var(--lime)" } : { color: "var(--ink-2)" }}
        >
          {tab.label}
          {tab.count != null && (
            <span className="ml-1.5 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

interface RouteTab {
  to: string;
  label: string;
  end?: boolean;
}

interface RouteTabNavProps {
  tabs: RouteTab[];
}

export function RouteTabNav({ tabs }: RouteTabNavProps) {
  const { lang } = useParams();
  return (
    <div className="flex border-b overflow-x-auto" style={{ borderColor: "var(--line-soft)" }}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={localizeTo(tab.to, lang)}
          end={tab.end}
          className={({ isActive }) =>
            `flex-shrink-0 whitespace-nowrap rounded-t-[var(--r-sm)] px-4 py-2.5 text-[length:var(--fs-sm)] font-medium border-b-2 transition-colors ${tabFocusClass} ${
              isActive
                ? ""
                : "border-transparent hover:border-[var(--line)]"
            }`
          }
          style={({ isActive }) => isActive ? { borderColor: "var(--lime)", color: "var(--lime)" } : { color: "var(--ink-2)" }}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
