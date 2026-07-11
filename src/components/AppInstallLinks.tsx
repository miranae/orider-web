import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";

interface AppInstallLinksProps {
  appStoreLabel: string;
  playStoreLabel: string;
  compact?: boolean;
}

export default function AppInstallLinks({ appStoreLabel, playStoreLabel, compact = false }: AppInstallLinksProps) {
  const padding = compact ? "8px 10px" : "10px 12px";
  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={ORIDER_APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 rounded-[var(--r-md)]"
        style={{ padding, minHeight: 44, background: "var(--bg-3)", textDecoration: "none" }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" className="shrink-0" style={{ color: "var(--lime)" }} aria-hidden="true"><path d="M16.365 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.6-2.99 1.52-.12-1.12.49-2.31 1.18-3.08.78-.85 2.1-1.49 2.99-1.52zM20.93 17.14c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.7-3.43 2.71-1.47.04-1.94-.86-3.62-.86-1.68 0-2.2.84-3.6.9-1.42.06-2.55-1.45-3.51-2.78-1.96-2.74-3.46-7.74-1.45-11.12.99-1.68 2.77-2.74 4.71-2.78 1.43-.03 2.79.96 3.66.96.87 0 2.52-1.19 4.25-1.02.72.03 2.75.29 4.05 2.2-.11.07-2.42 1.42-2.39 4.22.03 3.35 2.95 4.46 2.98 4.47z"/></svg>
        <span className="truncate text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--ink-0)" }}>{appStoreLabel}</span>
      </a>
      <a
        href={ORIDER_PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 rounded-[var(--r-md)]"
        style={{ padding, minHeight: 44, background: "var(--bg-3)", textDecoration: "none" }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" className="shrink-0" style={{ color: "var(--lime)" }} aria-hidden="true"><path d="M3.6 2.3a1 1 0 0 0-.6.92v17.56a1 1 0 0 0 .6.92l10.2-9.7L3.6 2.3zM15.1 10.4l2.9 1.6 2.74 1.5c.74.41.74 1.59 0 2l-2.74 1.5-2.9 1.6-2.85-2.7 2.85-2.8-2.85-2.7 2.85.9zm-.85-.85L4.7 1.5l9.55 5.25 1.65 1.5-1.65 1.3zm0 4.9l1.65 1.3-1.65 1.5L4.7 22.5l9.55-8.05z"/></svg>
        <span className="truncate text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--ink-0)" }}>{playStoreLabel}</span>
      </a>
    </div>
  );
}
