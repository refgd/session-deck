import test from 'node:test';
import assert from 'node:assert/strict';
import {
  killTerminal,
  registerActiveTerminal,
} from '../src/services/terminal.js';

test('registerActiveTerminal replaces duplicate ids and kills the stale PTY', () => {
  const id = 'test-duplicate-terminal';
  const first = fakePty();
  const second = fakePty();

  try {
    registerActiveTerminal(id, { term: first, sessionName: 'main', hostName: 'local' }, { maxActive: 10 });
    registerActiveTerminal(id, { term: second, sessionName: 'main', hostName: 'local' }, { maxActive: 10 });

    assert.equal(first.killed, 1);
    assert.equal(second.killed, 0);
  } finally {
    killTerminal(id);
  }

  assert.equal(second.killed, 1);
});

test('registerActiveTerminal prunes the oldest PTY when the active limit is reached', () => {
  const ids = ['test-limit-1', 'test-limit-2', 'test-limit-3'];
  const terms = ids.map(() => fakePty());

  try {
    registerActiveTerminal(ids[0], { term: terms[0], sessionName: 'one', hostName: 'local' }, { maxActive: 2 });
    registerActiveTerminal(ids[1], { term: terms[1], sessionName: 'two', hostName: 'local' }, { maxActive: 2 });
    registerActiveTerminal(ids[2], { term: terms[2], sessionName: 'three', hostName: 'local' }, { maxActive: 2 });

    assert.equal(terms[0].killed, 1);
    assert.equal(terms[1].killed, 0);
    assert.equal(terms[2].killed, 0);
  } finally {
    ids.forEach(id => killTerminal(id));
  }
});

function fakePty() {
  return {
    killed: 0,
    kill() {
      this.killed += 1;
    },
    resize() {},
  };
}
