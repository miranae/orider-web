interface OverlayControl {
  key: string;
  label: string;
  dotColor: string;
}

interface GroupRideOverlayControlsProps {
  overlays: OverlayControl[];
  activeOverlays: ReadonlySet<string>;
  onToggle: (key: string) => void;
  elevationLabel: string;
}

export function GroupRideOverlayControls({
  overlays,
  activeOverlays,
  onToggle,
  elevationLabel,
}: GroupRideOverlayControlsProps) {
  if (overlays.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span
        className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[length:var(--fs-xs)] font-medium rounded-full cursor-default"
        style={{
          background: "color-mix(in srgb, var(--chart-altitude) 15%, transparent)",
          color: "var(--ink-1)",
          border: "1px solid color-mix(in srgb, var(--chart-altitude) 30%, transparent)",
        }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: "var(--chart-altitude)" }} />
        {elevationLabel}
      </span>
      {overlays.map(({ key, label, dotColor }) => {
        const active = activeOverlays.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(key)}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[length:var(--fs-xs)] font-medium rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]"
            style={active ? {
              color: "var(--ink-1)",
              borderColor: dotColor,
              backgroundColor: `color-mix(in srgb, ${dotColor} 8%, transparent)`,
            } : {
              background: "var(--bg-2)",
              color: "var(--ink-2)",
              borderColor: "var(--line)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: active ? dotColor : "var(--ink-3)" }}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
