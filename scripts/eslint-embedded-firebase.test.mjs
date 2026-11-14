import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { embeddedFirebaseRule } from './eslint-embedded-firebase.mjs';
const linter = new Linter();
const lint = (code, filename = `${process.cwd()}/src/services/example.ts`) => linter.verify(code, [{
  files: ['**/*.ts'], languageOptions: { parser: tseslint.parser },
  plugins: { embed: { rules: { firebase: embeddedFirebaseRule } } }, rules: { 'embed/firebase': 'error' },
}], { filename });
test('all canonical Firebase import paths and export forms are blocked', () => {
  for (const code of [
    'import { auth } from "./firebase";', 'import { functions as backend } from "./firebase.js";',
    'import { firestore } from "@/services/firebase.ts";', 'import { auth } from "@shared/../src/services/firebase";', 'import * as firebase from "../services/firebase";',
    'export { auth as ordinaryAuth } from "./firebase";', 'export * from "./firebase";',
    'const firebase = import("./firebase");',
  ]) { const messages = lint(code); assert.equal(messages.length, 1, code); assert.equal(messages[0].ruleId, 'embed/firebase', code); }
});
test('type-only and safe utility imports, and unrelated files named firebase are allowed', () => {
  for (const code of ['import type { auth } from "./firebase";', 'import { type auth, ensureAppCheckReady } from "./firebase";', 'export type { auth } from "./firebase";', 'import { auth } from "./other/firebase";']) assert.deepEqual(lint(code), [], code);
});
