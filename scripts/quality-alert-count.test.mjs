import assert from "node:assert/strict";
import test from "node:test";
import { countAlertCalls } from "./quality-alert-count.mjs";

test("counts native and unresolved alert calls while ignoring text and method declarations", () => {
  assert.equal(countAlertCalls(`alert('one'); window.alert('two'); globalThis.alert('three'); self['alert']('four');
    unknown.alert('five'); const value = 'alert(fake)'; // window.alert(fake)
    const object = { alert() {} };`), 5);
});
test("excludes only local receivers of the explicitly imported async dialog API", () => {
  assert.equal(countAlertCalls(`import { useDialog } from '../contexts/DialogContext';
    function Form() { const dialog = useDialog(); return () => dialog.alert('async'); }
    function Other() { const dialog = useDialog(); dialog['alert']('async'); }
    function Unknown() { const dialog = otherApi(); dialog.alert('count'); }`, 'src/pages/Form.tsx'), 1);
});
test("supports an aliased approved import without accepting a lookalike hook", () => {
  assert.equal(countAlertCalls(`import { useDialog as useAppDialog } from './DialogContext';
    const dialog = useAppDialog(); dialog.alert('async');`, 'src/contexts/DialogContext.test.tsx'), 0);
  assert.equal(countAlertCalls(`import { useDialog } from 'untrusted/DialogContext';
    const dialog = useDialog(); dialog.alert('count');`), 1);
});
test("keeps shadowed receivers and shadowed hook calls in the budget", () => {
  assert.equal(countAlertCalls(`import { useDialog } from '../contexts/DialogContext';
    const dialog = useDialog();
    function Shadow(dialog) { dialog.alert('count'); }
    function HookShadow(useDialog) { const nested = useDialog(); nested.alert('count'); }
    function BlockShadow() { const dialog = external(); dialog.alert('count'); }
    dialog.alert('async');`, 'src/pages/Form.tsx'), 3);
});

test("counts mutable dialog receivers that may be reassigned to a native API", () => {
  assert.equal(countAlertCalls(`import { useDialog } from '../contexts/DialogContext';
    let dialog = useDialog(); dialog = window; dialog.alert('native');`, 'src/pages/Form.tsx'), 1);
});
test("does not approve a same-named relative module outside the real context directory", () => {
  assert.equal(countAlertCalls(`import { useDialog } from './DialogContext';
    const dialog = useDialog(); dialog.alert('unknown');`, 'src/untrusted/Form.tsx'), 1);
});

test("counts const dialog receivers with explicit alert method writes", () => {
  for (const write of ["dialog.alert = window.alert", "dialog['alert'] = window.alert",
    "dialog.alert ||= window.alert", "dialog['alert']++", "--dialog.alert", "delete dialog.alert"]) {
    assert.equal(countAlertCalls(`import { useDialog } from '../contexts/DialogContext';
      const dialog = useDialog(); ${write}; dialog.alert('native');`, 'src/pages/Form.tsx'), 1, write);
  }
  assert.equal(countAlertCalls(`import { useDialog } from '../contexts/DialogContext';
    const dialog = useDialog(); function suspicious(dialog) { dialog.alert = window.alert; }
    dialog.alert('conservatively counted');`, 'src/pages/Form.tsx'), 1);
});
