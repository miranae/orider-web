import { ToggleButton, ToggleControls, ToggleNote } from "../../theme/components";
interface OverlayControl { key: string; label: string }
interface GroupRideOverlayControlsProps {
  overlays: OverlayControl[];
  activeOverlays: ReadonlySet<string>;
  onToggle: (key: string) => void;
  elevationLabel: string;
}
export function GroupRideOverlayControls({ overlays, activeOverlays, onToggle, elevationLabel }: GroupRideOverlayControlsProps) {
  if (overlays.length === 0) return null;
  return <ToggleControls data-testid="C2R-2-1">
    {overlays.map(({ key, label }) => {
      const active = activeOverlays.has(key);
      return <ToggleButton key={key} selected={active} showCheck onClick={() => onToggle(key)}>{label}</ToggleButton>;
    })}
    <ToggleNote>{elevationLabel}</ToggleNote>
  </ToggleControls>;
}
