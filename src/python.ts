// Which Python (and so which ollada install) the extension checks.
//
// 0.1.4 dogfood fix: with the workspace opened at a parent folder
// (Documents) the extension only looked for <workspace>/.venv, missed
// <workspace>/ollada-cpu/.venv, and reported "ollada isn't installed"
// while ollada serve worked fine from that venv. Candidates now include
// .venv folders one level down, the extension prefers the first
// candidate that can import ollada, Setup shows the exact path it
// checked, and "Change Python" lets the user pick another one.

export interface PythonCandidate { path: string; source: string; }

export interface CandidateInputs {
  configured?: string;                  // ollada-code.pythonPath setting
  pythonExtension?: string;             // active environment from the Python extension
  folders: string[];                    // workspace folder paths
  childDirs: (dir: string) => string[]; // immediate subfolders (no dot folders, no node_modules)
  exists: (p: string) => boolean;
  join: (...parts: string[]) => string;
}

function venvPythons(dir: string, join: CandidateInputs['join']): string[] {
  return [join(dir, '.venv', 'Scripts', 'python.exe'), join(dir, '.venv', 'bin', 'python')];
}

export function pythonCandidates(inp: CandidateInputs): PythonCandidate[] {
  const out: PythonCandidate[] = [];
  const seen = new Set<string>();
  const add = (p: string | undefined, source: string, mustExist: boolean) => {
    if (!p || seen.has(p)) { return; }
    if (mustExist && !inp.exists(p)) { return; }
    seen.add(p);
    out.push({ path: p, source });
  };
  add(inp.configured, 'the ollada-code.pythonPath setting', false);
  add(inp.pythonExtension, 'the Python extension', true);
  for (const folder of inp.folders) {
    for (const p of venvPythons(folder, inp.join)) { add(p, 'the workspace .venv', true); }
  }
  for (const folder of inp.folders) {
    for (const child of inp.childDirs(folder)) {
      const name = child.split(/[\\/]/).pop() || child;
      for (const p of venvPythons(child, inp.join)) { add(p, `${name}/.venv in the workspace`, true); }
    }
  }
  add('python', 'python on PATH', false);
  add('python3', 'python3 on PATH', false);
  return out;
}
