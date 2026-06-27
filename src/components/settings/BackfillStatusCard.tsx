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

  async function run(mode: "new" | "recalc-all") {
    if (!uid) return;
    const call = httpsCallable(functions, "backfillVirtualPower");
    await call({ mode });
  }

  const running = job?.status === "queued" || job?.status === "running";
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <Card padding="none" className="p-4 space-y-3">
      <h3 className="font-semibold">{t("equipment.backfillTitle")}</h3>
      <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>
        {t("equipment.backfillDesc")}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={running} onClick={() => run("new")}>
          {t("equipment.backfillNewOnly")}
        </Button>
        <Button variant="secondary" disabled={running} onClick={() => run("recalc-all")}>
          {t("equipment.backfillRecalcAll")}
        </Button>
      </div>
      {job && (
        <div className="space-y-1 text-[length:var(--fs-sm)]">
          <div>
            {t("equipment.backfillStatus", { status: job.status, mode: job.mode })}
          </div>
          <div
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
            <div className="text-red-500">
              {t("equipment.backfillError", { message: job.error })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
