import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const FOCUSABLE = 'summary, button:not([disabled]), a[href], input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 훈련 편집창 공통 키보드 동작. 저장 경고창이 열리면 상위 창의 트랩은 양보한다. */
export function useTrainingDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, busy: boolean) {
  const ref = useRef<T>(null);
  const latest = useRef({ onClose, busy });
  useEffect(() => { latest.current = { onClose, busy }; });
  useBodyScrollLock(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(item => {
      if (item.closest('[hidden]')) return false;
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
      if (event.key === 'Escape' && document.querySelector('[role="tooltip"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = items();
      const first = controls[0] ?? node;
      const last = controls[controls.length - 1] ?? node;
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!hasBlockingDialog() && !node.contains(event.target as Node)) (items()[0] ?? node).focus();
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return ref;
}
