import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadJson, triggerBrowserDownload } from '../frontend/src/lib/browser-download-utils.js';

function documentStub() {
  const created = [];
  const appended = [];
  return {
    created,
    appended,
    body: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement(tag) {
      const node = {
        tag,
        href: '',
        download: '',
        clicked: false,
        removed: false,
        click() {
          this.clicked = true;
        },
        remove() {
          this.removed = true;
        },
      };
      created.push(node);
      return node;
    },
  };
}

test('triggerBrowserDownload creates and clicks a temporary anchor', () => {
  const documentRef = documentStub();

  triggerBrowserDownload('/download/file.txt', 'file.txt', { documentRef });

  assert.equal(documentRef.created.length, 1);
  assert.equal(documentRef.created[0].tag, 'a');
  assert.equal(documentRef.created[0].href, '/download/file.txt');
  assert.equal(documentRef.created[0].download, 'file.txt');
  assert.equal(documentRef.created[0].clicked, true);
  assert.equal(documentRef.created[0].removed, true);
  assert.equal(documentRef.appended[0], documentRef.created[0]);
});

test('downloadJson serializes data and revokes the generated URL', () => {
  const documentRef = documentStub();
  const blobs = [];
  const revoked = [];
  class BlobStub {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      blobs.push(this);
    }
  }
  const urlRef = {
    createObjectURL(blob) {
      assert.equal(blob, blobs[0]);
      return 'blob:test';
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };

  downloadJson({ ok: true }, 'config.json', { documentRef, urlRef, blobRef: BlobStub });

  assert.deepEqual(blobs[0].parts, ['{\n  "ok": true\n}']);
  assert.deepEqual(blobs[0].options, { type: 'application/json' });
  assert.equal(documentRef.created[0].href, 'blob:test');
  assert.equal(documentRef.created[0].download, 'config.json');
  assert.deepEqual(revoked, ['blob:test']);
});
