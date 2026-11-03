import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupOpenByDefault, showDownloadButton } from '../src/screen';
import { getWebviewHtml } from '../src/webview';

test('Chat is always visible: Setup starts open only while serve is not reachable', () => {
  assert.equal(setupOpenByDefault(false), true);
  assert.equal(setupOpenByDefault(true), false);
  const html = getWebviewHtml();
  // No full-screen gate: the chat log and the bottom dock are always in the page.
  assert.ok(html.includes('id="log"') && html.includes('id="dock"'));
  assert.ok(!html.includes('id="chat-screen" style="display:none"'));
});

test('layout: header first, log in the middle, actions and composer pinned at the bottom', () => {
  const html = getWebviewHtml();
  const top = html.indexOf('id="top"');
  const log = html.indexOf('id="log"');
  const dock = html.indexOf('id="dock"');
  const fix = html.indexOf('id="fix-btn"');
  const composer = html.indexOf('id="composer"');
  assert.ok(top < log && log < dock, 'header, then log, then dock');
  assert.ok(fix > dock && composer > dock, 'Explain/Fix/Insert and the composer live in the bottom dock');
  assert.ok(html.includes('#log { flex: 1; min-height: 0; overflow-y: auto;'), 'only the log scrolls');
  assert.ok(html.includes('scrollLog()'), 'new messages scroll the log to the bottom');
});

test('no dead Replay button: Watch diffusion is only rendered when snapshots exist', () => {
  const html = getWebviewHtml();
  assert.ok(!html.includes('Replay not available for this model'));
  assert.ok(html.includes("(r.replayAvailable ? '<button data-watch="));
});

test('download button: hidden when downloaded, red, or Unknown; shown otherwise', () => {
  assert.equal(showDownloadButton('Runs on CPU', false), true);
  assert.equal(showDownloadButton('Runs, slowly', false), true);
  assert.equal(showDownloadButton('Runs on CPU', true), false);
  assert.equal(showDownloadButton('Needs a GPU', false), false);
  assert.equal(showDownloadButton("Won't fit", false), false);
  assert.equal(showDownloadButton('Unknown', false), false);
});
