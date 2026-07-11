import { LocalizedLink as Link } from "../../../components/LocalizedLink";
import { Button, Card, Text } from "../../../theme/components";

export function StreamUnavailableCard({
  title,
  message,
  onRetry,
  retryLabel,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card padding="none" style={{ padding: "var(--space-5)" }}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--r-lg)]"
          style={{ background: "color-mix(in srgb, var(--amber) 14%, transparent)", color: "var(--amber)" }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.4 2.7 18a1.8 1.8 0 0 0 1.6 2.7h15.4a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{title}</h3>
          <p className="mt-1 text-[length:var(--fs-sm)] leading-6" style={{ color: "var(--ink-3)" }}>{message}</p>
          {onRetry && (
            <Button size="sm" variant="outline" style={{ marginTop: "var(--space-3)" }} onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ActivityProcessingState({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto py-16">
      <Card padding="none" style={{ padding: "var(--space-6)", textAlign: "center" }}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--r-lg)]" style={{ background: "color-mix(in srgb, var(--aqua) 14%, transparent)", color: "var(--aqua)" }}>
          <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <Text as="h1" variant="title">{title}</Text>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ marginTop: "var(--space-2)" }}>
          {description}
        </Text>
        <Button variant="outline" style={{ marginTop: "var(--space-4)" }} onClick={onRetry}>
          {retryLabel}
        </Button>
      </Card>
    </div>
  );
}

export function DeletedActivityState({
  canRestore,
  deletedLabel,
  restoreLabel,
  backHomeLabel,
  onRestore,
}: {
  canRestore: boolean;
  deletedLabel: string;
  restoreLabel: string;
  backHomeLabel: string;
  onRestore: () => void;
}) {
  return (
    <div className="text-center py-16" style={{ color: "var(--ink-2)" }}>
      <div className="text-[48px] mb-4">🗑️</div>
      <p className="text-[length:var(--fs-lg)]">{deletedLabel}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        {canRestore && (
          <Button size="sm" variant="outline" onClick={onRestore}>
            {restoreLabel}
          </Button>
        )}
        <Link to="/" className="text-[length:var(--fs-sm)] inline-block hover:underline" style={{ color: "var(--lime)" }}>{backHomeLabel}</Link>
      </div>
    </div>
  );
}
