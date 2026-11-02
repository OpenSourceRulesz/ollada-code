// Runs the bundled Python checks (python/checks.py, stdlib only)
// with the venv Python, exactly like the existing fix_file.py workflow.
// The extension never reimplements Python AST checks in TypeScript:
// that would risk diverging from the proven verifier.
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CheckFinding { kind: string; message: string; }
export interface CheckResult { findings: CheckFinding[]; warnings: CheckFinding[]; }

export function runChecks(python: string, checksScript: string, splicedSource: string): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollada-code-checks-'));
    const tmpFile = path.join(tmpDir, 'spliced.py');
    fs.writeFileSync(tmpFile, splicedSource, 'utf-8');
    const child = childProcess.spawn(python, [checksScript, tmpFile], { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (err) => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      reject(err);
    });
    child.on('close', () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try {
        const parsed = JSON.parse(stdout.trim()) as CheckResult;
        resolve({ findings: parsed.findings ?? [], warnings: parsed.warnings ?? [] });
      } catch {
        reject(new Error(`Checks script output was not JSON: ${stderr || stdout}`));
      }
    });
  });
}
