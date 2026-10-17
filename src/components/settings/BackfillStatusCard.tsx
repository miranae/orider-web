import GlossaryText from "../common/GlossaryText";
import { useState } from "react";
import { useDialog } from "../../contexts/DialogContext";
import { useToast } from "../../contexts/ToastContext";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { functions } from "../../services/firebase";
import { useBackfillJob } from "../../hooks/useBackfillJob";
import { Button, Card } from "../../theme/components";

interface Props {
  uid: string | null;
}

export function BackfillStatusCard({ uid }: Props) {
  const { t } = useTranslation("settings");
  const job = useBackfillJob(uid);
  const dialog = useDialog();
  const { showToast } = useToast();
  const [requesting, setRequesting] = useState(false);

  async function run(mode: "new" | "recalc-all") {
    if (!uid || requesting || running) return;
    setRequesting(true);
    try {
      const confirmed = await dialog.confirm(t(mode === "new" ? "equipment.backfillConfirmNew" : "equipment.backfillConfirmAll"));
      if (!confirmed) return;
      const call = httpsCallable(functions, "backfillVirtualPower");
      await call({ mode });
    } catch {
      showToast(t("equipment.backfillRequestFailed"));
    } finally {
      setRequesting(false);
    }
  }

  const running = job?.status === "queued" || job?.status === "running";
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <Card padding="none" className="p-4 space-y-3">
      <h3 className="font-semibold"><GlossaryText>{t("equipment.backfillTitle")}</GlossaryText></h3>
      <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>
        <GlossaryText>{t("equipment.backfillDesc")}</GlossaryText>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!uid || running || requesting} onClick={() => run("new")}>
          {t("equipment.backfillNewOnly")}
        </Button>
        <Button variant="secondary" disabled={!uid || running || requesting} onClick={() => run("recalc-all")}>
          {t("equipment.backfillRecalcAll")}
        </Button>
      </div>
      {job && (
        <div className="space-y-1 text-[length:var(--fs-sm)]">
          <div>
            {t("equipment.backfillStatus", { status: t(`equipment.backfillState${job.status}`), mode: t(job.mode === "new" ? "equipment.backfillModeNew" : "equipment.backfillModeAll") })}
          </div>
          <div
            role="progressbar" aria-label={t("equipment.backfillTitle")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
            className="h-2 rounded-[var(--r-sm)] overflow-hidden"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="h-full"
              style={{ width: `${pct}%`, background: "var(--lime)" }}
            />
          </div>
          <div>
            {t("equipment.backfillProgress", { done: job.done, total: job.total })}
            {job.failed > 0 ? ` · ${t("equipment.backfillFailed", { count: job.failed })}` : ""}
            {job.pendingStreams > 0 ? ` · ${t("equipment.backfillPendingStreams", { count: job.pendingStreams })}` : ""}
          </div>
          {job.error && (
            <div style={{ color: "var(--rose)" }}>
              {t("equipment.backfillError", { message: job.error })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
