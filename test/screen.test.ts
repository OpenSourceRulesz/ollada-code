import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shouldShowChat, showDownloadButton } from '../src/screen';

test('screen choice: serving shows Chat, not serving shows Setup, forced Setup always wins', () => {
  assert.equal(shouldShowChat(true, false), true);
  assert.equal(shouldShowChat(false, false), false);
  assert.equal(shouldShowChat(true, true), false);
  assert.equal(shouldShowChat(false, true), false);
});

test('download button: hidden when downloaded, red, or Unknown; shown otherwise', () => {
  assert.equal(showDownloadButton('Runs on CPU', false), true);
  assert.equal(showDownloadButton('Runs, slowly', false), true);
  assert.equal(showDownloadButton('Runs on CPU', true), false);
  assert.equal(showDownloadButton('Needs a GPU', false), false);
  assert.equal(showDownloadButton("Won't fit", false), false);
  assert.equal(showDownloadButton('Unknown', false), false);
});
