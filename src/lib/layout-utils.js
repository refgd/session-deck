import { DEFAULT_HOST } from './constants.js';

export const MAX_LAYOUT_JSON_BYTES = 64 * 1024;
export const MAX_LAYOUT_DEPTH = 32;
export const MAX_LAYOUT_PANES = 64;
export const MAX_LAYOUT_CHILDREN = 16;

export function stripLayoutSessions(node, options = {}) {
  const counter = options.counter || { value: 0 };
  const defaultHost = options.defaultHost || DEFAULT_HOST;

  if (!node || typeof node !== 'object') return node;

  if (node.session) {
    counter.value++;
    return {
      session: `pane-${counter.value}`,
      host: defaultHost,
      ...(node.size ? { size: node.size } : {}),
    };
  }

  if (Array.isArray(node.children)) {
    return {
      direction: node.direction,
      ...(node.size ? { size: node.size } : {}),
      children: node.children.map(child => stripLayoutSessions(child, { counter, defaultHost })),
    };
  }

  return node;
}

export function countLayoutPanes(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.session) return 1;
  if (Array.isArray(node.children)) {
    return node.children.reduce((sum, child) => sum + countLayoutPanes(child), 0);
  }
  return 0;
}

export function parseLayoutJson(value) {
  if (Buffer.byteLength(String(value || ''), 'utf8') > MAX_LAYOUT_JSON_BYTES) {
    throw layoutError('layout_json is too large');
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw layoutError('layout_json must be a JSON object');
  }
  assertLayoutBounds(parsed);
  return parsed;
}

export function assertLayoutBounds(layout) {
  const text = JSON.stringify(layout);
  if (Buffer.byteLength(text, 'utf8') > MAX_LAYOUT_JSON_BYTES) {
    throw layoutError('layout_json is too large');
  }
  const counter = { panes: 0, nodes: 0 };
  visitLayout(layout, 1, counter);
  return layout;
}

function visitLayout(node, depth, counter) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw layoutError('layout_json must be a JSON object');
  }
  if (depth > MAX_LAYOUT_DEPTH) {
    throw layoutError(`layout_json depth must be ${MAX_LAYOUT_DEPTH} or less`);
  }
  counter.nodes++;

  if (Array.isArray(node.children)) {
    if (node.children.length > MAX_LAYOUT_CHILDREN) {
      throw layoutError(`layout_json children must be ${MAX_LAYOUT_CHILDREN} or fewer per node`);
    }
    for (const child of node.children) visitLayout(child, depth + 1, counter);
    return;
  }

  counter.panes++;
  if (counter.panes > MAX_LAYOUT_PANES) {
    throw layoutError(`layout_json must contain ${MAX_LAYOUT_PANES} panes or fewer`);
  }
}

function layoutError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}
