import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const FOCUSABLE = 'summary, button:not([disabled]), a[href], input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 훈련 편집창 공통 키보드 동작. 저장 경고창이 열리면 상위 창의 트랩은 양보한다. */
export function useTrainingDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, busy: boolean, active = true) {
  const ref = useRef<T>(null);
  const latest = useRef({ onClose, busy });
  useEffect(() => { latest.current = { onClose, busy }; });
  useBodyScrollLock(active);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Portalled calendars/listboxes are still owned by a control in this dialog.
    // Ownership is explicit (ARIA ids), never inferred from any open popup on the page.
    const ownedPortals = () => {
      const roots: HTMLElement[] = [];
      const owners: HTMLElement[] = [node];
      for (const owner of owners) {
        for (const control of owner.querySelectorAll<HTMLElement>("[aria-controls], [aria-owns], [aria-describedby]")) {
          const ids = [control.getAttribute("aria-controls"), control.getAttribute("aria-owns"), control.getAttribute("aria-describedby")].filter(Boolean).join(" ").split(/\s+/);
          for (const id of ids) {
            const portal = document.getElementById(id);
            if (!portal || node.contains(portal) || roots.includes(portal) || portal.closest("[hidden], [inert]")) continue;
            if (!["dialog", "listbox", "tooltip", "group"].includes(portal.getAttribute("role") ?? "")) continue;
            roots.push(portal); owners.push(portal);
          }
        }
      }
      return roots;
    };
    const contains = (target: Node | null) => target != null && (node.contains(target) || ownedPortals().some(portal => portal.contains(target)));
    const items = () => [node, ...ownedPortals()].flatMap(root => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))).filter(item => {
      if (item.matches(':disabled') || item.getAttribute('tabindex') === '-1' || item.closest('[hidden], [inert]')) return false;
      for (let parent = item.parentElement; parent && node.contains(parent); parent = parent.parentElement) {
        if (parent.tagName !== 'DETAILS' || parent.hasAttribute('open')) continue;
        const summary = Array.from(parent.children).find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(item)) return false;
      }
      return true;
    });
    (node.querySelector<HTMLElement>("[data-dialog-initial-focus]:not([disabled])") ?? items()[0] ?? node).focus();
    const hasBlockingDialog = () => {
      const panel = document.querySelector('.app-dialog__panel');
      return !!panel && panel !== node && !node.contains(panel);
    };
    const onKey = (event: KeyboardEvent) => {
      if (hasBlockingDialog()) return;
      if (event.key === 'Escape' && ownedPortals().length > 0) return;
      if (event.key === 'Escape' && document.querySelector('[role="tooltip"]')) return;
      if (event.key === 'Escape') {
        const expanded = node.querySelector<HTMLElement>('[role="combobox"][aria-expanded="true"]');
        // The combobox owns its portalled listbox; let its target handler close that first.
        if (expanded && (expanded.contains(event.target as Node) || expanded === document.activeElement)) return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = items();
      const first = controls[0] ?? node;
      const last = controls[controls.length - 1] ?? node;
      if (event.shiftKey && (document.activeElement === first || !contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!hasBlockingDialog() && !contains(event.target as Node)) (items()[0] ?? node).focus();
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [active]);
  return ref;
}
