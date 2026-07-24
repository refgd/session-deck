import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setupWizardSource = readFileSync(new URL('../frontend/src/lib/SetupWizard.svelte', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../frontend/src/App.svelte', import.meta.url), 'utf8');
const appModalsSource = readFileSync(new URL('../frontend/src/lib/AppModals.svelte', import.meta.url), 'utf8');
const layoutStoreSource = readFileSync(new URL('../frontend/src/lib/stores/layout.js', import.meta.url), 'utf8');

test('setup wizard no longer offers layout presets during first-run workspace creation', () => {
  assert.doesNotMatch(setupWizardSource, /layoutPresets/);
  assert.doesNotMatch(setupWizardSource, /workspacePreset/);
  assert.doesNotMatch(setupWizardSource, /claude-focus|quad|infra|deck|mixed/);
});

test('setup wizard creates the first workspace with one empty pane', () => {
  assert.match(appSource, /workspaceCreateDraft\(\s*setupWsName\s*\)/);
  assert.match(appSource, /createWorkspace\(\s*draft\.name,\s*draft\.layout\s*\)/);
  assert.doesNotMatch(appSource, /setupWsPreset/);
});

test('regular new workspace flow creates one empty pane without preset controls', () => {
  assert.match(appSource, /workspaceCreateDraft\(\s*newWsName,\s*DEFAULT_HOST\s*\)/);
  assert.match(appSource, /createWorkspace\(\s*draft\.name,\s*draft\.layout\s*\)/);
  assert.doesNotMatch(appModalsSource, /layoutPreset|savedTemplates|workspacePreset|layoutPresets/);
});

test('frontend layout store does not expose legacy default layout presets', () => {
  assert.doesNotMatch(layoutStoreSource, /export function presets/);
  assert.doesNotMatch(layoutStoreSource, /claude-focus|quad|infra|deck|mixed/);
});
