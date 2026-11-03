import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { pythonCandidates } from '../src/python';

const join = path.win32.join;

test('workspace = Documents: finds ollada-cpu\\.venv one level down', () => {
  const docs = 'C:\\Users\\user\\Documents';
  const venv = join(docs, 'ollada-cpu', '.venv', 'Scripts', 'python.exe');
  const found = pythonCandidates({
    folders: [docs],
    childDirs: (d) => (d === docs ? [join(docs, 'ollada-cpu'), join(docs, 'notes')] : []),
    exists: (p) => p === venv,
    join,
  });
  const hit = found.find((c) => c.path === venv);
  assert.ok(hit, JSON.stringify(found));
  assert.equal(hit!.source, 'ollada-cpu/.venv in the workspace');
  assert.deepEqual(found.slice(-2).map((c) => c.path), ['python', 'python3'], 'PATH comes last');
});

test('workspace = ollada-cpu: the workspace .venv comes before subfolders', () => {
  const root = 'C:\\Users\\user\\Documents\\ollada-cpu';
  const venv = join(root, '.venv', 'Scripts', 'python.exe');
  const found = pythonCandidates({ folders: [root], childDirs: () => [], exists: (p) => p === venv, join });
  assert.equal(found[0].path, venv);
  assert.equal(found[0].source, 'the workspace .venv');
});

test('a configured Python always comes first, even if it does not exist yet', () => {
  const found = pythonCandidates({ configured: 'D:\\py\\python.exe', pythonExtension: 'C:\\other\\python.exe', folders: [], childDirs: () => [], exists: () => true, join });
  assert.equal(found[0].path, 'D:\\py\\python.exe');
  assert.equal(found[1].path, 'C:\\other\\python.exe');
});
