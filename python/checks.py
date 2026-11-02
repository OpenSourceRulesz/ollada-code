#!/usr/bin/env python3
"""ollada-code checks, bundled in the extension (stdlib only).

Ported from ollada's standalone infill_verifier.py, with two changes
required by the ollada-code spec (6.6):

  * The prefix/suffix byte-identity drift check is NOT ported. It is
    specific to the <<HOLE>> case, and Fix/Insert have no hole.
  * Broad `except` is a WARNING, never a failure. This check is new
    work: infill_verifier.py does not have it.

Checks, run on the spliced file (original with the selection replaced,
or with the insert spliced in), not just the snippet:

  1. syntax -- ast.parse fails.
  2. undefined names -- a Name the file never defines.
  3. dead code -- a statement unreachable after return/raise/break/
     continue in the same block.
  4. broad except -- `except:` or `except Exception:` as a warning.

Scope handling is the same as infill_verifier.py: file-wide, every
assignment target, function/class name, parameter, import, for-target,
with-item and except-handler name counts as defined, plus builtins.
That is enough for single-function files and avoids false positives
from a name defined in another function.

It does NOT judge semantics. A verifier PASS is not correctness:
the script-test find_max case passes all three failure checks and
still raises TypeError at runtime (max_val=None, then `if x > max_val`).
The extension always shows that warning when checks pass.

Usage:
  python3 checks.py <spliced-file.py>
Output: one JSON object on stdout:
  {"findings": [{"kind": "syntax"|"undefined"|"dead", "message": str}],
   "warnings": [{"kind": "broad-except", "message": str}]}
Exit 0 = no findings (warnings allowed), 1 = one or more findings,
2 = usage error.
"""

from __future__ import annotations

import ast
import builtins
import json
import sys


class _Defs(ast.NodeVisitor):
    def __init__(self):
        self.defined: set[str] = set()

    def _bind(self, node):
        if isinstance(node, ast.Name):
            self.defined.add(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for elt in node.elts:
                self._bind(elt)
        elif isinstance(node, ast.Starred):
            self._bind(node.value)

    def visit_FunctionDef(self, node):
        self.defined.add(node.name)
        for a in node.args.posonlyargs + node.args.args + node.args.kwonlyargs:
            self.defined.add(a.arg)
        if node.args.vararg:
            self.defined.add(node.args.vararg.arg)
        if node.args.kwarg:
            self.defined.add(node.args.kwarg.arg)
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        self.defined.add(node.name)
        self.generic_visit(node)

    def visit_Import(self, node):
        for a in node.names:
            self.defined.add((a.asname or a.name).split(".")[0])
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        for a in node.names:
            self.defined.add(a.asname or a.name)
        self.generic_visit(node)

    def visit_Assign(self, node):
        for t in node.targets:
            self._bind(t)
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        self._bind(node.target)
        self.generic_visit(node)

    def visit_AugAssign(self, node):
        self._bind(node.target)
        self.generic_visit(node)

    def visit_For(self, node):
        self._bind(node.target)
        self.generic_visit(node)

    visit_AsyncFor = visit_For

    def visit_With(self, node):
        for item in node.items:
            if item.optional_vars:
                self._bind(item.optional_vars)
        self.generic_visit(node)

    visit_AsyncWith = visit_With

    def visit_ExceptHandler(self, node):
        if node.name:
            self.defined.add(node.name)
        self.generic_visit(node)

    def visit_comprehension(self, node):
        self._bind(node.target)
        self.generic_visit(node)

    def visit_NamedExpr(self, node):
        self._bind(node.target)
        self.generic_visit(node)


def _dead_code(tree, source: str):
    findings = []
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if not isinstance(body, list):
            continue
        terminated = False
        for stmt in body:
            if terminated:
                seg = ast.get_source_segment(source, stmt)
                findings.append(
                    {
                        "kind": "dead",
                        "message": (
                            f"dead code at line {stmt.lineno}: "
                            f"{(seg.strip().splitlines() or [''])[0] if seg else type(stmt).__name__} "
                            f"unreachable (earlier return/raise in this block)"
                        ),
                    }
                )
            if isinstance(stmt, (ast.Return, ast.Raise, ast.Break, ast.Continue)):
                terminated = True
    return findings


def _broad_except(tree):
    warnings = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            if node.type is None:
                warnings.append(
                    {"kind": "broad-except", "message": f"broad except at line {node.lineno}: bare except"}
                )
            elif isinstance(node, ast.ExceptHandler) and isinstance(node.type, ast.Name) and node.type.id == "Exception":
                warnings.append(
                    {"kind": "broad-except", "message": f"broad except at line {node.lineno}: except Exception"}
                )
    return warnings


def check(source: str):
    findings = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [{"kind": "syntax", "message": f"syntax error at line {exc.lineno}: {exc.msg}"}], []
    defs = _Defs()
    defs.visit(tree)
    allowed = defs.defined | set(dir(builtins))
    undefined = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id not in allowed:
                undefined.add((node.id, node.lineno))
    for name, lineno in sorted(undefined, key=lambda t: t[1]):
        findings.append({"kind": "undefined", "message": f"undefined name '{name}' at line {lineno}"})
    findings.extend(_dead_code(tree, source))
    return findings, _broad_except(tree)


def main(argv) -> int:
    if len(argv) != 2:
        print("usage: checks.py <spliced-file.py>", file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        source = f.read()
    findings, warnings = check(source)
    print(json.dumps({"findings": findings, "warnings": warnings}))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
