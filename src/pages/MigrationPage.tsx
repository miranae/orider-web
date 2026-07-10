import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LogIn } from "lucide-react";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useAuth } from "../contexts/AuthContext";
import { useStrava } from "../hooks/useStrava";
import { useToast } from "../contexts/ToastContext";

type Step = "landing" | "progress" | "report";
type MigrationProgressLike = {
  totalActivities?: number | null;
  importedActivities?: number | null;
  skippedActivities?: number | null;
  currentPage?: number | null;
};

export function calculateMigrationProgressPercent(progress: MigrationProgressLike | null | undefined): number {
  if (!progress) return 0;
  const totalActivities = progress.totalActivities ?? 0;
  if (totalActivities > 0) {
    const completedActivities = (progress.importedActivities ?? 0) + (progress.skippedActivities ?? 0);
    return Math.min(95, Math.round((completedActivities / totalActivities) * 95));
  }
  return progress.currentPage ? Math.min(90, progress.currentPage * 10) : 0;
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`ds-card ds-card--bare overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

/* ── Spinner (reusable) ── */
function Spinner({ size = "w-4 h-4" }: { size?: string }) {
  return (
    <svg className={`${size} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ── Step Indicator ── */
function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div className={`w-8 sm:w-12 h-0.5 ${isDone ? 'bg-[var(--lime)]' : 'bg-[var(--line-soft)]'}`} />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[length:var(--fs-xs)] font-bold transition-colors ${
                isDone ? 'bg-[var(--lime)] text-[var(--bg-0)]' :
                isActive ? 'bg-[var(--lime)] text-[var(--bg-0)] ring-4 ring-[var(--lime)]/20' :
                'bg-[var(--bg-2)] text-[var(--ink-3)]'
              }`}>
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-[10px] sm:text-[length:var(--fs-xs)] font-medium whitespace-nowrap ${
                isActive ? 'text-[var(--lime)]' :
                isDone ? 'text-[var(--ink-1)]' :
                'text-[var(--ink-3)]'
              }`}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MigrationPage() {
  const { t } = useTranslation("migration");
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const { connectStrava, startMigration, cancelMigration, verifyMigration, fixMigration, loading, error } = useStrava();
  const [signInPending, setSignInPending] = useState(false);

  const [step, setStep] = useState<Step | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    totalStrava: number;
    totalImported: number;
    missingActivityCount: number;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleSignIn = async () => {
    if (signInPending) return;
    setSignInPending(true);
    try {
      await signInWithGoogle();
    } catch {
      showToast(t("userMigration.loginFailed"), "error");
    } finally {
      setSignInPending(false);
    }
  };

  // Determine initial step based on migration status
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStep("landing");
      return;
    }
    if (!profile) return;

    const status = profile.migration?.status;
    if (status === "QUEUED" || status === "RUNNING" || status === "WAITING") {
      setStep("progress");
    } else if (status === "DONE") {
      setStep("report");
    } else {
      setStep("landing");
    }
  }, [authLoading, user, profile]);

  const handleStartMigration = async () => {
    try {
      await startMigration();
      setStep("progress");
    } catch {
      // error is set in hook
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMigration();
      setStep("landing");
    } catch {
      // error is set in hook
    }
  };

  const handleRetry = async () => {
    try {
      await startMigration();
      setStep("progress");
    } catch {
      // error is set in hook
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null);
    setVerifying(true);
    try {
      const result = await verifyMigration();
      setVerifyResult(result);
    } catch {
      // error is set in hook
    } finally {
      setVerifying(false);
    }
  };

  const handleFix = async () => {
    try {
      await fixMigration();
      setVerifyResult(null);
    } catch {
      // error is set in hook
    }
  };

  const migration = profile?.migration;
  const progress = migration?.progress;
  const report = migration?.report;

  const progressPercent = calculateMigrationProgressPercent(progress);

  const waitUntil = progress?.waitUntil;
  const migrationStatus = migration?.status;

  const currentStepIndex = step === "landing" ? 0 : step === "progress" ? 1 : 2;

  if (authLoading || step === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-6">
      {/* Step Indicator */}
      {step !== "report" && (
        <StepIndicator current={currentStepIndex} steps={[t("userMigration.stepConnect"), t("userMigration.stepImport"), t("userMigration.stepDone")]} />
      )}

      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">
          {step === "report" ? t("userMigration.headerReportTitle") :
           step === "progress" ? t("userMigration.headerProgressTitle") :
           t("userMigration.headerLandingTitle")}
        </h1>
        <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)]">
          {step === "report" ? t("userMigration.headerReportSubtitle") :
           step === "progress" ? t("userMigration.headerProgressSubtitle") :
           t("userMigration.headerLandingSubtitle")}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-[var(--r-xl)] border px-4 py-3 text-[length:var(--fs-sm)] flex items-start gap-2" style={{ background: "color-mix(in oklch, var(--rose) 10%, var(--bg-1))", borderColor: "color-mix(in oklch, var(--rose) 32%, var(--line-soft))", color: "var(--rose)" }}>
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════ LANDING ═══════════════════════════════════════ */}
      {step === "landing" && (
        <Section className="p-8">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-[var(--lime)]/15 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-[var(--lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              {profile?.stravaConnected && (
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-2 border-[var(--bg-1)] rounded-full flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--lime) 18%, var(--bg-1))", color: "var(--lime)" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)]">
                {profile?.stravaConnected ? t("userMigration.landingConnectedTitle") : t("userMigration.landingNotConnectedTitle")}
              </h2>
              <p className="text-[var(--ink-2)] max-w-sm mx-auto">
                {profile?.stravaConnected
                  ? t("userMigration.landingConnectedDesc")
                  : t("userMigration.landingNotConnectedDesc")}
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              {!user ? (
                <button
                  onClick={handleSignIn}
                  disabled={signInPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-xl)] hover:bg-[var(--bg-3)] transition-colors font-medium text-[var(--ink-0)]"
                >
                  <LogIn size={18} />
                  {signInPending ? t("userMigration.loginLoading") : t("userMigration.loginGoogle")}
                </button>
              ) : !profile?.stravaConnected ? (
                <button
                  onClick={() => connectStrava("/migrate")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--strava)] text-[var(--primary-fg)] rounded-[var(--r-xl)] hover:opacity-90 transition-opacity font-bold shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
                  {t("userMigration.connectStrava")}
                </button>
              ) : (
                <button
                  onClick={handleStartMigration}
                  disabled={loading}
                  className={`w-full px-4 py-3 bg-[var(--lime)] text-[var(--bg-0)] rounded-[var(--r-xl)] hover:opacity-90 transition-opacity font-bold text-[length:var(--fs-lg)] disabled:opacity-50 ${loading ? 'cursor-wait' : ''}`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      {t("userMigration.starting")}
                    </span>
                  ) : t("userMigration.startMigration")}
                </button>
              )}
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-6 border-t border-[var(--line-soft)]">
               {[
                 { icon: "🔒", label: t("userMigration.feature1Label"), desc: t("userMigration.feature1Desc") },
                 { icon: "🔄", label: t("userMigration.feature2Label"), desc: t("userMigration.feature2Desc") },
                 { icon: "📦", label: t("userMigration.feature3Label"), desc: t("userMigration.feature3Desc") }
               ].map((item) => (
                 <div key={item.label} className="flex flex-col items-center gap-1.5 p-3 rounded-[var(--r-lg)] bg-[var(--bg-2)]">
                   <span className="text-[length:var(--fs-2xl)]">{item.icon}</span>
                   <div className="text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)]">{item.label}</div>
                   <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)]">{item.desc}</div>
                 </div>
               ))}
            </div>
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════ PROGRESS ═══════════════════════════════════════ */}
      {step === "progress" && (
        <Section className="p-8">
           <div className="text-center space-y-6">
              {/* Status Icon */}
              <div className="relative inline-block">
                 {migrationStatus === "FAILED" ? (
                   <div className="w-20 h-20 rounded-full flex items-center justify-center animate-pulse" style={{ background: "color-mix(in oklch, var(--rose) 12%, var(--bg-1))", color: "var(--rose)" }}>
                     <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                     </svg>
                   </div>
                 ) : migrationStatus === "WAITING" ? (
                   <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--amber) 12%, var(--bg-1))", color: "var(--amber)" }}>
                     <svg className="w-10 h-10 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                   </div>
                 ) : (
                   <div className="w-20 h-20 relative">
                     <div className="absolute inset-0 border-4 border-[var(--line-soft)] rounded-full" />
                     <div className="absolute inset-0 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
                     <div className="absolute inset-0 flex items-center justify-center font-bold text-[length:var(--fs-lg)] text-[var(--lime)]">
                       {Math.round(progressPercent)}%
                     </div>
                   </div>
                 )}
              </div>

              {/* Status Text */}
              <div className="space-y-2">
                 <h2 className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)]">
                   {migrationStatus === "FAILED" ? t("userMigration.progressFailedTitle") :
                    migrationStatus === "WAITING" ? t("userMigration.progressWaitingTitle") :
                    t("userMigration.progressFetchingTitle")}
                 </h2>
                 <p className="text-[var(--ink-2)] max-w-md mx-auto">
                   {migrationStatus === "FAILED" ? t("userMigration.progressFailedDesc") :
                    migrationStatus === "WAITING" ? t("userMigration.progressWaitingDesc", { time: formatTime(waitUntil ?? Date.now()) }) :
                    progress?.importedActivities
                      ? t("userMigration.progressFetchingWithCount", { count: progress.importedActivities, page: progress.currentPage })
                      : t("userMigration.progressFetchingNoCount")}
                 </p>
              </div>

              {/* Progress Bar */}
              {migrationStatus !== "FAILED" && (
                <div className="max-w-md mx-auto space-y-2">
                  <div className="h-2.5 bg-[var(--bg-2)] rounded-full overflow-hidden">
	                    <div
	                      className="h-full rounded-full transition-all duration-500"
	                      style={{
	                        background: migrationStatus === "WAITING" ? "var(--amber)" : "var(--lime)",
	                        width: `${progressPercent}%`,
	                      }}
	                    />
                  </div>
                </div>
              )}

              {/* Detail info cards */}
              {migrationStatus !== "FAILED" && progress && (
                <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                  <div className="bg-[var(--bg-2)] rounded-[var(--r-lg)] p-3">
                    <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">{progress.importedActivities ?? 0}</div>
                    <div className="text-[11px] text-[var(--ink-2)]">{t("userMigration.imported")}</div>
                  </div>
                  <div className="bg-[var(--bg-2)] rounded-[var(--r-lg)] p-3">
                    <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">{progress.skippedActivities ?? 0}</div>
                    <div className="text-[11px] text-[var(--ink-2)]">{t("userMigration.skipped")}</div>
                  </div>
                </div>
              )}

              {/* Tip */}
              {migrationStatus !== "FAILED" && (
                <div className="rounded-[var(--r-xl)] border px-4 py-3 text-[length:var(--fs-sm)] max-w-md mx-auto text-left flex items-start gap-2.5" style={{ background: "color-mix(in oklch, var(--aqua) 10%, var(--bg-1))", borderColor: "color-mix(in oklch, var(--aqua) 30%, var(--line-soft))", color: "var(--ink-1)" }}>
                  <span className="text-[length:var(--fs-lg)] shrink-0">💡</span>
                  <span>{t("userMigration.tip")}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4">
                 {migrationStatus === "FAILED" ? (
                   <div className="space-y-3">
                     <button
                       onClick={handleRetry}
                       disabled={loading}
                       className={`px-8 py-3 bg-[var(--lime)] text-[var(--bg-0)] font-bold rounded-[var(--r-xl)] hover:opacity-90 transition-opacity ${loading ? 'cursor-wait' : ''}`}
                     >
                       {loading ? (
                         <span className="flex items-center gap-2">
                           <Spinner />
                           {t("userMigration.starting")}
                         </span>
                       ) : t("userMigration.retry")}
                     </button>
                     <div>
                       <button
                         onClick={handleCancel}
                         disabled={loading}
                         className={`text-[length:var(--fs-sm)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors ${loading ? 'cursor-wait opacity-60' : ''}`}
                       >
                         {loading ? t("userMigration.cancelling") : t("userMigration.backToStart")}
                       </button>
                     </div>
                   </div>
                 ) : (
                   <button
                     onClick={handleCancel}
                     disabled={loading}
                     className={`text-[length:var(--fs-sm)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors ${loading ? 'cursor-wait opacity-60' : ''}`}
                   >
                     {loading ? t("userMigration.cancelling") : t("userMigration.cancel")}
                   </button>
                 )}
              </div>
           </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════ REPORT ═══════════════════════════════════════ */}
      {step === "report" && report && (
        <div className="space-y-6">
           <Section className="p-8 text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--lime) 16%, var(--bg-1))", color: "var(--lime)" }}>
                 <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                 </svg>
              </div>
              <div>
                <h2 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)]">{t("userMigration.reportTitle")}</h2>
                <p className="text-[var(--ink-2)] mt-1">
                  {t("userMigration.reportSummaryPrefix")}
                  <strong className="text-[var(--ink-0)]">{t("userMigration.reportSummaryCount", { count: report.totalActivities })}</strong>
                  {t("userMigration.reportSummarySuffix")}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-[var(--line-soft)]">
                 <StatBox label={t("userMigration.totalDistance")} value={`${Math.round(report.totalDistance / 1000).toLocaleString()}`} unit="km" />
                 <StatBox label={t("userMigration.totalTime")} value={formatDurationSimple(report.totalTime, t("userMigration.hourSuffix"))} />
                 <StatBox label={t("userMigration.totalElevation")} value={`${Math.round(report.totalElevation).toLocaleString()}`} unit="m" />
                 <StatBox label={t("userMigration.totalCalories")} value={`${Math.round(report.totalCalories).toLocaleString()}`} unit="kcal" />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                 <button
                   onClick={() => navigate("/")}
                   className="px-6 py-3 bg-[var(--lime)] text-[var(--bg-0)] font-bold rounded-[var(--r-xl)] hover:opacity-90 transition-opacity"
                 >
                   {t("userMigration.viewFeed")}
                 </button>
                 {!verifyResult && (
                   <button
                     onClick={handleVerify}
                     disabled={verifying}
                     className={`px-6 py-3 border-2 border-[var(--lime)] text-[var(--lime)] font-bold rounded-[var(--r-xl)] hover:bg-[var(--lime)]/10 transition-colors disabled:opacity-60 ${verifying ? 'cursor-wait' : ''}`}
                   >
                     {verifying ? (
                       <span className="flex items-center gap-2">
                         <Spinner />
                         {t("userMigration.verifying")}
                       </span>
                     ) : t("userMigration.verify")}
                   </button>
                 )}
              </div>

              {/* Next steps suggestion */}
              <div className="pt-4 border-t border-[var(--line-soft)]">
                <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mb-3">{t("userMigration.nextSteps")}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { label: t("userMigration.nextProfile"), path: user ? `/athlete/${user.uid}` : "/" },
                    { label: t("userMigration.nextLeaderboard"), path: "/explore" },
                    { label: t("userMigration.nextFriends"), path: "/friends" },
                  ].map(item => (
                    <button key={item.label} onClick={() => navigate(item.path)} className="text-[length:var(--fs-xs)] px-3 py-1.5 rounded-full bg-[var(--bg-2)] text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors">
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
           </Section>

           {verifyResult && (
             <Section className="p-6">
                <h3 className="font-bold text-[var(--ink-0)] mb-4 flex items-center gap-2">
                  {t("userMigration.verifyTitle")}
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-[length:var(--fs-sm)] border-b border-[var(--line-soft)] pb-2">
                     <span className="text-[var(--ink-2)]">{t("userMigration.verifyStravaActivities")}</span>
                     <span className="font-medium">{t("userMigration.verifyCountUnit", { count: verifyResult.totalStrava })}</span>
                  </div>
                  <div className="flex justify-between text-[length:var(--fs-sm)] border-b border-[var(--line-soft)] pb-2">
                     <span className="text-[var(--ink-2)]">{t("userMigration.verifyImportedActivities")}</span>
                     <span className="font-medium text-[var(--ink-0)]">{t("userMigration.verifyCountUnit", { count: verifyResult.totalImported })}</span>
                  </div>
                  {verifyResult.missingActivityCount > 0 ? (
                    <div className="p-4 rounded-[var(--r-lg)] space-y-3" style={{ background: "color-mix(in oklch, var(--amber) 12%, var(--bg-1))" }}>
                       <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-1)" }}>
                         {t("userMigration.verifyMissingPrefix")}
                         <strong>{t("userMigration.verifyMissingCount", { count: verifyResult.missingActivityCount })}</strong>
                         {t("userMigration.verifyMissingSuffix")}
                       </div>
                       <button
                         onClick={handleFix}
                         disabled={loading}
                         className={`w-full py-2.5 bg-[var(--amber)] text-[var(--primary-fg)] font-bold rounded-[var(--r-lg)] hover:opacity-90 transition-opacity text-[length:var(--fs-sm)] ${loading ? 'cursor-wait' : ''}`}
                       >
                         {loading ? (
                           <span className="flex items-center justify-center gap-2">
                             <Spinner />
                             {t("userMigration.verifyFixing")}
                           </span>
                         ) : t("userMigration.verifyFix")}
                       </button>
                    </div>
                  ) : (
                    <div className="text-center py-3 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)]" style={{ background: "color-mix(in oklch, var(--lime) 12%, var(--bg-1))", color: "var(--lime)" }}>
                       {t("userMigration.verifyAllMatch")}
                    </div>
                  )}
                </div>
             </Section>
           )}
        </div>
      )}
      {step === "report" && !report && (
        <Section className="p-8 text-center space-y-5">
          <div className="w-20 h-20 mx-auto bg-[var(--bg-2)] rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-[var(--lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-[length:var(--fs-2xl)] font-bold text-[var(--ink-0)]">{t("userMigration.reportTitle")}</h2>
            <p className="text-[var(--ink-2)] mt-1">{t("userMigration.reportUnavailableDesc")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/")}
              className="px-6 py-3 bg-[var(--lime)] text-[var(--bg-0)] font-bold rounded-[var(--r-xl)] hover:opacity-90 transition-opacity"
            >
              {t("userMigration.viewFeed")}
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className={`px-6 py-3 border-2 border-[var(--lime)] text-[var(--lime)] font-bold rounded-[var(--r-xl)] hover:bg-[var(--lime)]/10 transition-colors disabled:opacity-60 ${verifying ? 'cursor-wait' : ''}`}
            >
              {verifying ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  {t("userMigration.verifying")}
                </span>
              ) : t("userMigration.verify")}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

function StatBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-[var(--bg-2)] rounded-[var(--r-lg)] p-3">
      <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{label}</div>
      <div className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)] mt-1">
        {value}<span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)] ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

function formatDurationSimple(ms: number, hourSuffix: string): string {
  const hours = Math.floor(ms / 3600000);
  return `${hours}${hourSuffix}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
