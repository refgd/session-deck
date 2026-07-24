// frontend/src/lib/stores/layout.js — Workspace layout tree store

import { DEFAULT_HOST } from '../constants.js';
import { paneSessionKey } from '../pane-key-utils.js';

/**
 * Layout tree node types:
 *
 * Leaf (terminal pane):
 *   { session: 'main', host: DEFAULT_HOST, size: 1 }
 * Empty leaf:
 *   { session: null, host: DEFAULT_HOST, size: 1 }
 *
 * Split (container):
 *   { split: 'h' | 'v', children: [node, node, ...], size: 1 }
 *
 * size is a flex ratio — relative to siblings, not absolute pixels.
 */

/**
 * Create a leaf node for a session.
 */
export function leaf(session = null, host = DEFAULT_HOST, size = 1) {
  return { session, host, size };
}

/**
 * Create a horizontal split (children arranged left-to-right).
 */
export function hsplit(children, size = 1) {
  return { split: 'h', children, size };
}

/**
 * Create a vertical split (children arranged top-to-bottom).
 */
export function vsplit(children, size = 1) {
  return { split: 'v', children, size };
}

/**
 * Count total panes in a layout tree.
 */
export function countPanes(node) {
  if (!node.children) return 1;
  if (node.children) return node.children.reduce((sum, c) => sum + countPanes(c), 0);
  return 0;
}

/**
 * Get all session names from a layout tree.
 */
export function getSessionNames(node) {
  if (node.session) return [node.session];
  if (node.children) return node.children.flatMap(c => getSessionNames(c));
  return [];
}

/**
 * Get all session+host pairs from a layout tree.
 * Returns array of { session, host } objects.
 */
export function getSessionPanes(node) {
  if (node.session) return [{ session: node.session, host: node.host || DEFAULT_HOST }];
  if (node.children) return node.children.flatMap(c => getSessionPanes(c));
  return [];
}

/**
 * Like getSessionPanes, but each entry also carries `path` — the array of
 * child indices locating that leaf in the layout tree. Needed so views that
 * flatten the tree (mobile single-pane, zoomed) can reassign the correct pane
 * via updatePaneSession instead of collapsing to the root.
 * Returns array of { session, host, path }.
 */
export function getSessionPanesWithPaths(node, path = []) {
  if (!node.children) return [{ session: node.session || null, host: node.host || DEFAULT_HOST, path }];
  if (node.children) return node.children.flatMap((c, i) => getSessionPanesWithPaths(c, [...path, i]));
  return [];
}

export function getLeafAtPath(root, path = []) {
  const node = getNodeAtPath(root, path);
  return node && !node.children ? node : null;
}

function getNodeAtPath(root, path = []) {
  if (!root || !Array.isArray(path)) return null;
  let node = root;
  for (const idx of path) {
    if (!Number.isInteger(idx) || idx < 0 || !node.children || idx >= node.children.length) {
      return null;
    }
    node = node.children[idx];
  }
  return node || null;
}

/**
 * Rebuild the layout into a sensible shape for the current pane count while
 * preserving pane order and session assignments.
 */
export function autoArrangeLayout(node) {
  const panes = collectLeaves(node);
  if (panes.length === 0) return leaf(null);
  if (panes.length === 1) return { ...panes[0], size: 1 };
  if (panes.length === 2) return hsplit(panes.map(p => ({ ...p, size: 1 })));
  if (panes.length === 3) {
    return hsplit([
      { ...panes[0], size: 2 },
      vsplit([
        { ...panes[1], size: 1 },
        { ...panes[2], size: 1 },
      ], 1),
    ]);
  }
  if (panes.length === 4) {
    return vsplit([
      hsplit([{ ...panes[0], size: 1 }, { ...panes[1], size: 1 }]),
      hsplit([{ ...panes[2], size: 1 }, { ...panes[3], size: 1 }]),
    ]);
  }

  const columns = Math.ceil(Math.sqrt(panes.length));
  const rowNodes = [];
  for (let i = 0; i < panes.length; i += columns) {
    const rowLeaves = panes.slice(i, i + columns).map(p => ({ ...p, size: 1 }));
    if (rowLeaves.length === 1) {
      rowNodes.push(rowLeaves[0]);
    } else {
      rowNodes.push(hsplit(rowLeaves));
    }
  }
  return vsplit(rowNodes);
}

function collectLeaves(node) {
  if (!node) return [];
  if (!node.children) {
    return [{
      session: node.session || null,
      host: node.host || DEFAULT_HOST,
      paneTitle: node.paneTitle || undefined,
      size: 1,
    }];
  }
  return node.children.flatMap(collectLeaves);
}

/**
 * Apply real session names to a template layout.
 * Replaces placeholder session names with names from the provided list,
 * cycling if there are more panes than sessions.
 */
export function applySessionsToTemplate(node, sessionNames, counter = { i: 0 }) {
  if (!node.children) {
    const name = sessionNames[counter.i % sessionNames.length] || 'main';
    counter.i++;
    return { ...node, session: name };
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map(c => applySessionsToTemplate(c, sessionNames, counter)),
    };
  }
  return node;
}

/**
 * Remove a pane at the given path from the layout tree.
 * Returns the new root node (may collapse parent splits).
 * Returns null if the last pane is removed.
 */
export function removePane(root, path) {
  if (!Array.isArray(path)) return root;
  if (path.length === 0) return null; // removing the root itself

  const parent = getNodeAtPath(root, path.slice(0, -1));
  if (!parent?.children) return root;

  const idx = path[path.length - 1];
  if (!Number.isInteger(idx) || idx < 0 || idx >= parent.children.length) return root;
  parent.children.splice(idx, 1);

  // If parent has only one child left, collapse it
  if (parent.children.length === 1) {
    const survivor = parent.children[0];
    // Replace parent's properties with survivor's
    if (!survivor.children) {
      delete parent.split;
      delete parent.children;
      parent.session = survivor.session || null;
      parent.host = survivor.host || DEFAULT_HOST;
    } else {
      parent.split = survivor.split;
      parent.children = survivor.children;
    }
  }

  // If parent has zero children (shouldn't happen but safety)
  if (parent.children && parent.children.length === 0) {
    return null;
  }

  return root;
}

/**
 * Split a pane at the given path into two panes.
 * direction: 'h' (side-by-side) or 'v' (top-bottom)
 * Returns the modified root.
 */
export function splitPaneAt(root, path, direction, newSession = 'main', newHost = DEFAULT_HOST) {
  if (!Array.isArray(path)) return root;
  const target = getLeafAtPath(root, path);
  if (!target) return root;
  const parent = path.length > 0 ? getNodeAtPath(root, path.slice(0, -1)) : null;
  const parentIdx = path[path.length - 1];

  const newNode = {
    split: direction,
    size: target.size || 1,
    children: [
      {
        session: target.session || null,
        host: target.host || DEFAULT_HOST,
        size: 1,
        ...(target.paneTitle ? { paneTitle: target.paneTitle } : {}),
      },
      { session: newSession || null, host: newHost || DEFAULT_HOST, size: 1 },
    ],
  };

  if (parent) {
    parent.children[parentIdx] = newNode;
  } else {
    // Splitting the root leaf
    return newNode;
  }

  return root;
}

/**
 * Move a pane from one location to adjacent to another pane.
 * sourcePane: "host:session" pane id, or a session name for compatibility
 * targetPane: "host:session" pane id, or a session name for compatibility
 * position: 'left' | 'right' | 'top' | 'bottom'
 * Returns new root (deep cloned).
 */
export function movePane(root, sourcePane, targetPane, position) {
  if (sourcePane === targetPane) return root;

  // Deep clone
  root = JSON.parse(JSON.stringify(root));

  // Handle 'swap' — just swap the session/host data between the two leaves
  if (position === 'swap') {
    const srcPath = findPathByPane(root, sourcePane);
    const tgtPath = findPathByPane(root, targetPane);
    if (!srcPath || !tgtPath) return root;

    let srcNode = root;
    for (const idx of srcPath) srcNode = srcNode.children[idx];
    let tgtNode = root;
    for (const idx of tgtPath) tgtNode = tgtNode.children[idx];

    // Swap session and host
    const tmpSession = srcNode.session;
    const tmpHost = srcNode.host;
    srcNode.session = tgtNode.session;
    srcNode.host = tgtNode.host;
    tgtNode.session = tmpSession;
    tgtNode.host = tmpHost;
    return root;
  }

  // Check if source and target are siblings in a matching split direction
  // If so, just reorder children instead of creating nested splits
  const sourcePath = findPathByPane(root, sourcePane);
  const targetPath = findPathByPane(root, targetPane);
  if (!sourcePath || !targetPath) return root;

  const direction = (position === 'left' || position === 'right') ? 'h' : 'v';
  const insertBefore = (position === 'left' || position === 'top');

  // Check if siblings in same parent with matching direction
  if (sourcePath.length === targetPath.length && sourcePath.length > 0) {
    const sourceParentPath = sourcePath.slice(0, -1);
    const targetParentPath = targetPath.slice(0, -1);
    if (sourceParentPath.join(',') === targetParentPath.join(',')) {
      let parent = root;
      for (const idx of sourceParentPath) parent = parent.children[idx];
      if (parent.split === direction) {
        // Same parent, same direction — reorder children
        const srcIdx = sourcePath[sourcePath.length - 1];
        const tgtIdx = targetPath[targetPath.length - 1];
        const [removed] = parent.children.splice(srcIdx, 1);
        const newIdx = insertBefore
          ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx)
          : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
        parent.children.splice(newIdx, 0, removed);
        return root;
      }
    }
  }

  // General case: remove source, wrap target in a new split
  let sourceNode = root;
  for (const idx of sourcePath) sourceNode = sourceNode.children[idx];
  const sourceLeaf = { session: sourceNode.session, host: sourceNode.host, size: 1 };

  root = removePane(root, sourcePath);
  if (!root) return { ...sourceLeaf };

  // Re-find target after removal
  const newTargetPath = findPathByPane(root, targetPane);
  if (!newTargetPath) return root;

  let targetNode = root;
  let targetParent = null;
  let targetIdx = -1;
  for (let i = 0; i < newTargetPath.length; i++) {
    targetParent = targetNode;
    targetIdx = newTargetPath[i];
    targetNode = targetNode.children[newTargetPath[i]];
  }

  if (!targetNode) return root;

  // If target's parent already splits in the same direction, insert as sibling
  if (targetParent && targetParent.split === direction) {
    const insertIdx = insertBefore ? targetIdx : targetIdx + 1;
    targetParent.children.splice(insertIdx, 0, sourceLeaf);
    return root;
  }

  // Otherwise wrap target in a new split
  const newSplit = {
    split: direction,
    size: targetNode.size || 1,
    children: insertBefore
      ? [sourceLeaf, { ...targetNode, size: 1 }]
      : [{ ...targetNode, size: 1 }, sourceLeaf],
  };

  if (targetParent) {
    targetParent.children[targetIdx] = newSplit;
  } else {
    root = newSplit;
  }

  return root;
}

function findPathByPane(node, pane, path = []) {
  if (node.session && paneMatches(node, pane)) return path;
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const found = findPathByPane(node.children[i], pane, [...path, i]);
      if (found) return found;
    }
  }
  return null;
}

function paneMatches(node, pane) {
  if (!String(pane).includes(':')) return node.session === pane;
  return paneSessionKey(node.host, node.session, DEFAULT_HOST) === pane;
}
