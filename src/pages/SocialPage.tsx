import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { Search, ChevronRight, UserPlus } from "lucide-react";
import { useFriends } from "../hooks/useFriends";
import { useMyGroups } from "../hooks/useGroup";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Avatar from "../components/Avatar";
import { Text } from "../theme/components";
import { useMobile } from "../hooks/useMobile";

export default function SocialPage() {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<"friends" | "groups">("friends");
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: 14 }}>
        {t("auth.loginRequiredTitle")}
      </div>
    );
  }

  return (
    <div>
      {/* Page header — 모바일은 하단 탭 바가 "소셜" 라벨 제공하므로 중복 제목 숨김 */}
      <div
        className="hidden md:flex items-center sticky top-0 z-10"
        style={{
          height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)",
          padding: "0 16px",
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>
          {t("nav.social")}
        </span>
      </div>

      {/* Tabs */}
      <div
        className="flex sticky z-[9] top-0 md:top-[52px]"
        role="tablist"
        style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--bg-1)" }}
      >
        {(["friends", "groups"] as const).map((k) => {
          const label = k === "friends" ? t("social.tabFriends") : t("social.tabGroups");
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              role="tab"
              aria-selected={active}
              className="flex-1 flex items-center justify-center relative"
              style={{
                padding: "12px 0", fontSize: 13, fontWeight: 500, minHeight: 44,
                color: active ? "var(--ink-0)" : "var(--ink-3)",
                background: "none", border: "none", cursor: "pointer",
              }}
            >
              {label}
              {active && (
                <div
                  style={{
                    position: "absolute", bottom: 0, left: 16, right: 16,
                    height: 2, background: "var(--lime)", borderRadius: "2px 2px 0 0",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "friends" && <FriendsTab />}
      {tab === "groups" && <GroupsTab onNavigate={(id) => navigate(`/group/${id}`)} />}
    </div>
  );
}

function FriendsTab() {
  const { t } = useTranslation("common");
  const { friends, friendCode, loading } = useFriends();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useMobile();
  // 전폭 행: Layout px-4(16px) 인셋 음수마진으로 상쇄
  const fullBleedRow: CSSProperties = isMobile
    ? { padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)", margin: "0 -16px" }
    : { padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)" };

  const filtered = searchQuery
    ? friends.filter((f) => f.nickname?.toLowerCase().includes(searchQuery.toLowerCase()))
    : friends;

  return (
    <>
      {/* Search + invite */}
      <div className="flex gap-2" style={{ padding: "var(--space-3) var(--space-4) var(--space-2)" }}>
        <div
          className="flex-1 flex items-center gap-1.5"
          style={{
            background: "var(--bg-2)", border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-md)", padding: "var(--space-2) var(--space-3)",
          }}
        >
          <Search size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t("social.searchFriendsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "none", border: "none", outline: "none", flex: 1,
              fontSize: 13, color: "var(--ink-1)", fontFamily: "inherit",
            }}
          />
        </div>
        <button
          onClick={() => {
            if (friendCode) {
              navigator.clipboard.writeText(friendCode);
              showToast(t("social.friendCodeCopied"));
            }
          }}
          style={{
            padding: "8px 14px", background: "var(--lime)", border: "none",
            borderRadius: "var(--r-md)", fontSize: 12, fontWeight: 600,
            color: "var(--primary-fg)", cursor: "pointer", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 'var(--space-1)',
          }}
        >
          <UserPlus size={14} />
          {t("social.invite")}
        </button>
      </div>

      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("social.followingCount", { count: friends.length })}</Text>
      </div>

      {loading && (
        <div style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
          {t("button.loading")}
        </div>
      )}

      {filtered.map((f) => (
        <Link
          key={f.userId}
          to={`/athlete/${f.userId}`}
          className="flex items-center gap-3"
          style={{ ...fullBleedRow, textDecoration: "none" }}
        >
          <Avatar userId={f.userId} name={f.nickname || t("label.rider")} imageUrl={f.profileImage} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>{f.nickname || t("label.rider")}</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{t("social.following")}</div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
        </Link>
      ))}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: 14, lineHeight: 1.5 }}>
          {searchQuery ? t("social.searchEmpty") : t("social.noFriends")}
        </div>
      )}
    </>
  );
}

function GroupsTab({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { groups, loading } = useMyGroups(user?.uid);
  const isMobile = useMobile();
  // 전폭 행: Layout px-4(16px) 인셋 음수마진으로 상쇄
  const fullBleedRow: CSSProperties = isMobile
    ? { padding: "14px 16px", borderBottom: "1px solid var(--line-soft)", margin: "0 -16px" }
    : { padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" };

  return (
    <>
      <div style={{ padding: "var(--space-3) var(--space-4) var(--space-2)" }}>
        <Link
          to="/groups"
          style={{
            display: "block", width: "100%", padding: 11, textAlign: "center",
            background: "var(--bg-2)", border: "1px dashed var(--line)",
            borderRadius: "var(--r-lg)", fontSize: 13, color: "var(--ink-3)",
            textDecoration: "none", fontWeight: 500,
          }}
        >
          {t("social.newGroup")}
        </Link>
      </div>

      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("social.myGroupCount", { count: groups.length })}</Text>
      </div>

      {loading && (
        <div style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
          {t("button.loading")}
        </div>
      )}

      {groups.map((g) => (
        <div
          key={g.id}
          onClick={() => onNavigate(g.id)}
          className="flex items-center gap-3 cursor-pointer"
          style={fullBleedRow}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: "color-mix(in oklch, var(--lime) 14%, var(--bg-2))",
              border: "1px solid color-mix(in oklch, var(--lime) 30%, transparent)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>{g.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>
              {t("social.memberCount", { count: g.memberCount || 0 })}
            </div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
        </div>
      ))}

      {!loading && groups.length === 0 && (
        <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: 14 }}>
          {t("social.noGroups")}
        </div>
      )}
    </>
  );
}
