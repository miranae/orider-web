import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button, IconButton } from "../../../theme/components";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import "./PlanActionsMenu.css";

export interface PlanActionItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void | Promise<void>;
}

/** 계획 카드 머리의 ⋯ 버튼(데스크톱 단계 막대·모바일 계획 머리 공용) — 펼침 패널(버튼 + aria-expanded/aria-controls)로 관리 동작을 모은다. 닫히면 자리를 차지하지 않는다. */
export default function PlanActionsMenu({ label, items, testId }: { label: string; items: PlanActionItem[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={rootRef} className="plan-actions-menu" data-testid={testId}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) { setOpen(false); triggerRef.current?.focus(); } }}>
      <IconButton ref={triggerRef} size="sm" icon={<MoreHorizontal size={ICON_SIZE.md} />} aria-label={label} title={label}
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} />
      <div id={panelId} className="plan-actions-menu__panel" hidden={!open}>
        {items.map((item) => (
          <Button key={item.id} variant="ghost" size="sm" data-testid={item.id} leadingIcon={item.icon}
            className={item.danger ? 'plan-actions-menu__item plan-actions-menu__item--danger' : 'plan-actions-menu__item'}
            onClick={() => { setOpen(false); void item.onSelect(); }}>
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
