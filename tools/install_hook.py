#!/usr/bin/env python3
"""Install tools/pre-commit as .git/hooks/pre-commit (once per clone).  Use --force to replace a different existing hook."""
import shutil
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src, dst = ROOT / "tools" / "pre-commit", ROOT / ".git" / "hooks" / "pre-commit"
if not (ROOT / ".git").exists():
    raise SystemExit("No .git folder here. Run `git init -b main` first.")
dst.parent.mkdir(exist_ok=True)
if dst.exists() and dst.read_bytes() != src.read_bytes() and "--force" not in sys.argv:
    raise SystemExit(f"{dst} already exists and is different. Use --force to replace it.")
shutil.copyfile(src, dst)
dst.chmod(dst.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
print(f"Installed {dst.relative_to(ROOT)}. Every commit now runs tools/audit_public.py on the staged files.")
