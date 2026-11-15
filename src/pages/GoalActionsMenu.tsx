import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button, IconButton } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import "./GoalActionsMenu.css";

export interface GoalActionItem {
  id: string;
  label: string;
  danger?: boolean;
  onSelect: () => void | Promise<void>;
}

/** 목표 카드 제목 옆 ⋯ 버튼 — 펼침 패널(버튼 + aria-expanded/aria-controls)로 드문 관리 동작을 모은다. 닫히면 자리를 차지하지 않는다. */
export default function GoalActionsMenu({ label, items, disabled = false }: { label: string; items: GoalActionItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (items.length === 0) return null;
  const expanded = open && !disabled;
  return (
    <div ref={rootRef} className="goal-actions-menu"
      onKeyDown={(event) => { if (event.key === "Escape" && expanded) { setOpen(false); triggerRef.current?.focus(); } }}>
      <IconButton ref={triggerRef} size="sm" variant="ghost" icon={<MoreHorizontal size={ICON_SIZE.md} />} aria-label={label} title={label}
        disabled={disabled} aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen((value) => !value)} />
      <div id={panelId} className="goal-actions-menu__panel" hidden={!expanded}>
        {items.map((item) => (
          <Button key={item.id} variant="ghost" size="sm" data-testid={item.id}
            className={item.danger ? "goal-actions-menu__item goal-actions-menu__item--danger" : "goal-actions-menu__item"}
            onClick={() => { setOpen(false); void item.onSelect(); }}>
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
