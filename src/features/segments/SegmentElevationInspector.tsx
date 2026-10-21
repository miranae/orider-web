import { useId, useRef, useState, type ComponentProps } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ElevationChart from "../../components/ElevationChart";
import { Button } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

/** Uses only the chart's existing recorded samples; no additional reads. */
export default function SegmentElevationInspector(props: ComponentProps<typeof ElevationChart>) {
  const { t } = useTranslation("segment");
  const { t: common } = useTranslation("common");
  const [selection, setSelection] = useState<{ data: typeof props.data; index: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const interaction = useRef<"pointer" | "keyboard" | "closed">("pointer");
  const hintId = useId();
  const index = selection?.data === props.data ? selection.index : null;
  const sample = index === null ? null : props.data[index];
  const inspect = (next: number | null) => {
    if (next === null) return; // Canvas-to-panel movement must keep the scrollable panel open.
    setSelection(current => current?.data === props.data && current.index === next ? current : { data: props.data, index: next });
    props.onHoverIndex?.(next);
  };
  const hover = (next: number | null) => { if (interaction.current === "pointer") inspect(next); };
  const pointerIntent = (target: EventTarget) => { if (!panel.current?.contains(target as Node)) interaction.current = "pointer"; };
  const dismiss = () => { interaction.current = "closed"; setSelection(null); props.onHoverIndex?.(null); };
  const close = () => { wrapper.current?.focus({ preventScroll: true }); dismiss(); };
  return <>
    <p id={hintId} className="text-[length:var(--ft-body-size)] mb-2" style={{color:"var(--ink-2)"}}>{t("chart.inspectHint")}</p>
    <div ref={wrapper} tabIndex={0} role="group" aria-label={t("chart.elevationTitle")} aria-describedby={hintId} className="relative rounded-[var(--r-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lime)]"
      onFocus={event => { if (!panel.current?.contains(event.target as Node)) { if (interaction.current === "closed") interaction.current = "keyboard"; inspect(index ?? 0); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) dismiss(); }}
      onPointerMoveCapture={event => pointerIntent(event.target)}
      onPointerDownCapture={event => pointerIntent(event.target)}
      onPointerDown={event => { event.currentTarget.focus({preventScroll:true}); interaction.current = "pointer"; }}
      onPointerLeave={event => { if (event.pointerType !== "touch") dismiss(); }}
      onKeyDownCapture={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.stopPropagation();
        if (panel.current?.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation();
        interaction.current = "keyboard";
        const last = props.data.length - 1;
        inspect(event.key === "Home" ? 0 : event.key === "End" ? last : Math.max(0, Math.min(last, (index ?? 0) + (event.key === "ArrowLeft" ? -1 : 1))));
      }}>
      <ElevationChart {...props} xAxisLabel={t("chart.distanceAxis")} onHoverIndex={hover} />
      {sample && <div ref={panel} className="absolute top-0 right-0 z-10 p-3 rounded-[var(--r-lg)] border text-[length:var(--ft-body-size)]" data-testid="segment-elevation-inspection" role="group" aria-label={t("chart.sampleTitle")} tabIndex={0}
        onPointerDown={event => { event.stopPropagation(); if (event.pointerType === "touch") event.currentTarget.focus({preventScroll:true}); }}
        style={{width:"min(320px, 100%, calc(100vw - 32px))",maxHeight:"min(20rem, 50vh)",overflowY:"auto",background:"var(--bg-1)",borderColor:"var(--line)",boxShadow:"var(--shadow-md)",color:"var(--ink-1)"}}>
        <div className="sticky top-0 flex items-center justify-between gap-2 mb-2" style={{background:"var(--bg-1)"}}><strong>{t("chart.sampleTitle")}</strong><Button variant="ghost" size="sm" aria-label={common("button.close")} onClick={event => {event.stopPropagation();close();}}><X size={ICON_SIZE.md} aria-hidden="true" /></Button></div>
        <dl className="grid grid-cols-2 gap-3">
          <div><dt style={{color:"var(--ink-2)"}}>{t("distance")}</dt><dd className="m-0 font-medium">{Number.isFinite(sample.distance) ? `${(sample.distance / 1000).toFixed(2)} km` : "—"}</dd></div>
          <div><dt style={{color:"var(--ink-2)"}}>{t("chart.altitude")}</dt><dd className="m-0 font-medium">{Number.isFinite(sample.elevation) ? `${sample.elevation.toFixed(0)} m` : "—"}</dd></div>
        </dl>
        <p className="mt-2 mb-0" style={{color:"var(--ink-2)"}}>{t("chart.sampleBasis")}</p>
      </div>}
    </div>
  </>;
}
