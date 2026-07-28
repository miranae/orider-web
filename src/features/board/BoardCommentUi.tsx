import type { FormEvent, ReactNode } from "react";
import { Button, Textarea } from "../../theme/components";

interface BoardCommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  placeholder: string;
  submitLabel: string;
}

export function BoardCommentComposer({
  value,
  onChange,
  onSubmit,
  submitting,
  placeholder,
  submitLabel,
}: BoardCommentComposerProps) {
  return (
    <form onSubmit={onSubmit} className="mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={3}
          className="flex-1 text-[length:var(--fs-sm)]"
        />
        <Button
          type="submit"
          disabled={submitting || !value.trim()}
          variant="secondary"
          className="px-5 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] font-bold disabled:opacity-50"
        >
          {submitting ? "..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function BoardCommentText({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[length:var(--fs-sm)] text-[var(--ink-1)] leading-relaxed">
      {children}
    </p>
  );
}
