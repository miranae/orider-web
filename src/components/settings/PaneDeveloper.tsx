import { useEffect, useMemo, useState } from "react";
import { KeyRound, Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Text } from "../../theme/components";
import { useToast } from "../../contexts/ToastContext";
import { logClientError } from "../../services/errorLogger";
import {
  createPersonalApiKey,
  listPersonalApiKeys,
  revokePersonalApiKey,
  type CreatedPersonalApiKey,
  type PersonalApiKeySummary,
  type PersonalApiScope,
} from "../../services/personalDataApi";
import { Field, SettingsCard, fieldInputStyle } from "./_primitives";

const AVAILABLE_SCOPES: PersonalApiScope[] = [
  "profile:read",
  "activities:read",
  "streams:read",
  "fitness:read",
  "exports:read",
];

function formatDate(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

export function PaneDeveloper() {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const [keys, setKeys] = useState<PersonalApiKeySummary[]>([]);
  const [createdKey, setCreatedKey] = useState<CreatedPersonalApiKey | null>(null);
  const [name, setName] = useState("Personal dashboard");
  const [scopes, setScopes] = useState<PersonalApiScope[]>(["profile:read", "activities:read", "fitness:read"]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const curlExample = useMemo(() => {
    const token = createdKey?.key || "orid_your_personal_api_key";
    return `curl -H "X-API-Key: ${token}" https://orider.co.kr/api/v1/activities?limit=5`;
  }, [createdKey?.key]);

  async function loadKeys() {
    setLoading(true);
    try {
      setKeys(await listPersonalApiKeys());
    } catch (err) {
      showToast(`${t("pane.developer.loadFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  function toggleScope(scope: PersonalApiScope) {
    setScopes((prev) => prev.includes(scope)
      ? prev.filter((item) => item !== scope)
      : [...prev, scope]);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || scopes.length === 0) {
      showToast(t("pane.developer.createInvalid"));
      return;
    }
    setCreating(true);
    try {
      const key = await createPersonalApiKey({ name: trimmed, scopes });
      setCreatedKey(key);
      setKeys(await listPersonalApiKeys());
      showToast(t("pane.developer.created"));
    } catch (err) {
      showToast(`${t("pane.developer.createFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: PersonalApiKeySummary) {
    if (!window.confirm(t("pane.developer.revokeConfirm", { name: key.name }))) return;
    setRevokingId(key.id);
    try {
      await revokePersonalApiKey(key.id);
      setKeys((prev) => prev.filter((item) => item.id !== key.id));
      showToast(t("pane.developer.revoked"));
    } catch (err) {
      showToast(`${t("pane.developer.revokeFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRevokingId(null);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(t("pane.developer.copied"));
    } catch (err) {
      logClientError("PaneDeveloper.copy", err);
      showToast(t("pane.developer.copyFailed"));
    }
  }

  return (
    <>
      <SettingsCard title={t("pane.developer.cardCreate")}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <Text as="p" variant="bodySmall" style={{ color: "var(--ink-2)" }}>
              {t("pane.developer.intro")}
            </Text>
            <div className="mt-4">
              <Field label={t("pane.developer.keyName")} hint={t("pane.developer.keyNameHint")}>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  style={fieldInputStyle}
                  maxLength={80}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Text as="div" variant="eyebrow">{t("pane.developer.scopes")}</Text>
              <div className="mt-2 flex flex-wrap gap-2">
                {AVAILABLE_SCOPES.map((scope) => {
                  const selected = scopes.includes(scope);
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className="rounded-[var(--r-sm)] border px-2 py-1 text-[length:var(--fs-xs)]"
                      style={{
                        background: selected ? "var(--lime)" : "var(--bg-2)",
                        borderColor: selected ? "var(--lime)" : "var(--line)",
                        color: selected ? "var(--bg-0)" : "var(--ink-2)",
                      }}
                    >
                      {scope}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="rounded-[var(--r-lg)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
            <KeyRound size={20} style={{ color: "var(--lime)" }} />
            <Text as="p" variant="bodySmall" className="mt-2" style={{ color: "var(--ink-2)" }}>
              {t("pane.developer.once")}
            </Text>
            <Button className="mt-3 w-full" size="sm" variant="primary" loading={creating} onClick={handleCreate}>
              {creating ? t("pane.developer.creating") : t("pane.developer.create")}
            </Button>
          </div>
        </div>
      </SettingsCard>

      {createdKey && (
        <SettingsCard title={t("pane.developer.cardNewKey")}>
          <Text as="p" variant="bodySmall" style={{ color: "var(--ink-2)" }}>
            {t("pane.developer.newKeyWarning")}
          </Text>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 rounded-[var(--r-md)] px-3 py-2 text-[length:var(--fs-sm)]" style={{ background: "var(--bg-2)", color: "var(--ink-0)", overflowWrap: "anywhere" }}>
              {createdKey.key}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copyText(createdKey.key)}>
              <Copy size={15} />
              {t("pane.developer.copy")}
            </Button>
          </div>
        </SettingsCard>
      )}

      <SettingsCard title={t("pane.developer.cardKeys")} action={<Button size="sm" variant="secondary" onClick={() => void loadKeys()}>{t("pane.developer.refresh")}</Button>}>
        {loading ? (
          <Text variant="bodySmall" style={{ color: "var(--ink-2)" }}>{t("pane.developer.loading")}</Text>
        ) : keys.length === 0 ? (
          <Text variant="bodySmall" style={{ color: "var(--ink-2)" }}>{t("pane.developer.empty")}</Text>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="rounded-[var(--r-lg)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold" style={{ color: "var(--ink-0)" }}>{key.name}</div>
                    <div className="mt-1 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                      {key.prefix} · {t("pane.developer.createdAt")}: {formatDate(key.createdAt)} · {t("pane.developer.lastUsedAt")}: {formatDate(key.lastUsedAt)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" loading={revokingId === key.id} onClick={() => void handleRevoke(key)}>
                    <Trash2 size={15} />
                    {t("pane.developer.revoke")}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {key.scopes.map((scope) => <Chip key={scope}>{scope}</Chip>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title={t("pane.developer.cardExample")}>
        <Text as="p" variant="bodySmall" style={{ color: "var(--ink-2)" }}>
          {t("pane.developer.exampleHint")}
        </Text>
        <div className="mt-3 flex gap-2">
          <code className="min-w-0 flex-1 rounded-[var(--r-md)] px-3 py-2 text-[length:var(--fs-xs)]" style={{ background: "var(--bg-2)", color: "var(--ink-0)", overflowWrap: "anywhere" }}>
            {curlExample}
          </code>
          <Button size="sm" variant="secondary" onClick={() => void copyText(curlExample)}>
            <Copy size={15} />
            {t("pane.developer.copy")}
          </Button>
        </div>
      </SettingsCard>
    </>
  );
}
