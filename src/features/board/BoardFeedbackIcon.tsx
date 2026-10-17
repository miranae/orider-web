import { Bug, CircleHelp, Lightbulb, MessageCircle } from "lucide-react";

export function BoardFeedbackIcon({ type, size = 20 }: { type: string; size?: number }) {
  const Icon = type === "bug" ? Bug : type === "feature" ? Lightbulb : type === "question" ? CircleHelp : MessageCircle;
  return <Icon size={size} aria-hidden="true" className="shrink-0" />;
}
