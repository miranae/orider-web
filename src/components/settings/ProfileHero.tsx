import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Text } from "../../theme/components";

interface ProfileHeroProps {
  nickname: string;
  email?: string | null;
  photoURL?: string | null;
  friendCode?: string | null;
  stravaConnected?: boolean;
  onEditNickname?: () => void;
  actions?: ReactNode;
}

export function ProfileHero({
  nickname,
  email,
  photoURL,
  friendCode,
  stravaConnected,
  onEditNickname,
  actions,
}: ProfileHeroProps) {
  const { t } = useTranslation("settings");
  const initial = (nickname || "?").slice(0, 1).toUpperCase();
  const size = 72;
  return (
    <Card padding="none"
      style={{
        padding: "22px 24px",
        marginBottom: 'var(--space-5)',
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 22,
        alignItems: "center",
      }}
    >
      {photoURL ? (
        <img
          src={photoURL}
          alt={nickname}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            border: "1px solid var(--line-soft)",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "color-mix(in oklch, var(--lime) 18%, var(--bg-2))",
            color: "var(--ink-0)",
            fontSize: size * 0.42,
            fontWeight: 600,
            border: "1px solid var(--line-soft)",
          }}
        >
          {initial}
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-2)', marginBottom: 2 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--ink-0)",
              letterSpacing: "-0.015em",
            }}
          >
            {nickname || t("profile.noName")}
          </h2>
          {onEditNickname && (
            <Button variant="ghost"
              onClick={onEditNickname}
              style={{ padding: "3px 6px", fontSize: 11 }}
              aria-label={t("profile.editNickname")}
            >
              <Pencil size={11} /> {t("profile.change")}
            </Button>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-3)",
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {friendCode && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Text variant="mono"
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  padding: "2px 8px",
                  background: "color-mix(in oklch, var(--aqua) 12%, var(--bg-1))",
                  border: "1px solid color-mix(in oklch, var(--aqua) 30%, transparent)",
                  borderRadius: 6,
                  color: "var(--aqua)",
                  letterSpacing: "0.08em",
                }}
              >
                {friendCode}
              </Text>
              {t("profile.friendCodeLabel")}
            </span>
          )}
          {email && (
            <>
              {friendCode && <span>·</span>}
              <span>{email}</span>
            </>
          )}
          {stravaConnected && (
            <>
              <span>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--lime)",
                  }}
                />
                {t("profile.stravaConnected")}
              </span>
            </>
          )}
        </div>
      </div>

      {actions && <div style={{ display: "flex", gap: 6 }}>{actions}</div>}
    </Card>
  );
}
