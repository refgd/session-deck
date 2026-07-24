import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTemplateRow,
  deleteTemplateRow,
  getTemplateRow,
  listTemplateRows,
  serializeTemplate,
  updateTemplateRow,
} from '../src/lib/template-store.js';
import { createMemoryDb } from '../test-support/db.js';

test('template store creates templates with session-free layouts', () => {
  const db = createMemoryDb();
  try {
    const created = createTemplateRow(db, {
      name: 'split',
      description: 'Two panes',
      layout: {
        direction: 'h',
        children: [
          { session: 'main', host: 'prod' },
          { session: 'logs', host: 'prod' },
        ],
      },
    });

    assert.equal(created.paneCount, 2);
    assert.deepEqual(created.layout, {
      direction: 'h',
      children: [
        { session: 'pane-1', host: 'reliant' },
        { session: 'pane-2', host: 'reliant' },
      ],
    });

    const serialized = serializeTemplate(created.row);
    assert.equal(serialized.name, 'split');
    assert.equal(serialized.description, 'Two panes');
    assert.equal(serialized.paneCount, 2);
    assert.deepEqual(listTemplateRows(db).map(row => row.name), ['split']);
  } finally {
    db.close();
  }
});

test('template store updates only provided fields and rejects empty updates', () => {
  const db = createMemoryDb();
  try {
    const created = createTemplateRow(db, {
      name: 'single',
      layout: { session: 'main' },
    });

    assert.equal(updateTemplateRow(db, created.row.id, {}), false);
    assert.equal(updateTemplateRow(db, created.row.id, {
      name: 'renamed',
      description: 'Updated',
    }), true);

    const row = getTemplateRow(db, created.row.id);
    assert.equal(row.name, 'renamed');
    assert.equal(row.description, 'Updated');
  } finally {
    db.close();
  }
});

test('template store deletes templates by id', () => {
  const db = createMemoryDb();
  try {
    const created = createTemplateRow(db, {
      name: 'single',
      layout: { session: 'main' },
    });

    assert.equal(deleteTemplateRow(db, 999), null);
    assert.equal(deleteTemplateRow(db, created.row.id).name, 'single');
    assert.equal(getTemplateRow(db, created.row.id), undefined);
  } finally {
    db.close();
  }
});
