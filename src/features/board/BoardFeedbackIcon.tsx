import { Bug, CircleHelp, Lightbulb, MessageCircle } from "lucide-react";
import { ICON_SIZE } from "../../theme/tokens/icon";

export function BoardFeedbackIcon({ type, size = ICON_SIZE.lg }: { type: string; size?: number }) {
  const Icon = type === "bug" ? Bug : type === "feature" ? Lightbulb : type === "question" ? CircleHelp : MessageCircle;
  return <Icon size={size} aria-hidden="true" className="shrink-0" />;
}
