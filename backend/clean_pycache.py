"""Script to delete all __pycache__ directories and compiled Python files (.pyc, .pyo) in backend.

Usage:
    python clean_pycache.py
    python clean_pycache.py --include-venv   # also clean inside .venv/
    python clean_pycache.py --dry-run        # preview what would be deleted
"""

import argparse
import os
import shutil
import stat
import sys
from pathlib import Path


def _handle_remove_readonly(func, path, exc_info):
    """Clear readonly bit and retry deletion on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def clean_pycache(
    target_dir: Path,
    include_venv: bool = False,
    dry_run: bool = False,
) -> tuple[int, int, int]:
    """Recursively clean __pycache__ directories and stray .pyc/.pyo files.

    Returns:
        tuple[int, int, int]: (dirs_deleted, files_deleted, bytes_freed)
    """
    dirs_deleted = 0
    files_deleted = 0
    bytes_freed = 0

    venv_names = {".venv", "venv", "env", ".env_test"}

    # 1. Remove __pycache__ directories
    pycache_dirs = []
    for p in target_dir.rglob("__pycache__"):
        if p.is_dir():
            if not include_venv and any(part in venv_names for part in p.parts):
                continue
            pycache_dirs.append(p)

    for p in pycache_dirs:
        dir_size = 0
        try:
            for item in p.rglob("*"):
                if item.is_file():
                    try:
                        dir_size += item.stat().st_size
                    except OSError:
                        pass
        except OSError:
            pass

        if dry_run:
            print(f"[DRY-RUN] Would delete directory: {p}")
        else:
            try:
                shutil.rmtree(p, onerror=_handle_remove_readonly)
                print(f"Deleted directory: {p}")
            except OSError as err:
                print(f"Failed to delete directory {p}: {err}", file=sys.stderr)
                continue

        dirs_deleted += 1
        bytes_freed += dir_size

    # 2. Clean stray .pyc, .pyo files outside __pycache__
    stray_files = []
    for ext in ("*.pyc", "*.pyo"):
        for f in target_dir.rglob(ext):
            if f.is_file():
                if not include_venv and any(part in venv_names for part in f.parts):
                    continue
                # If still inside a __pycache__ that wasn't deleted (e.g. error or dry run), skip
                if f.parent.name == "__pycache__":
                    continue
                stray_files.append(f)

    for f in stray_files:
        try:
            file_size = f.stat().st_size
        except OSError:
            file_size = 0

        if dry_run:
            print(f"[DRY-RUN] Would delete stray file: {f}")
        else:
            try:
                f.unlink()
                print(f"Deleted stray file: {f}")
            except OSError as err:
                print(f"Failed to delete file {f}: {err}", file=sys.stderr)
                continue

        files_deleted += 1
        bytes_freed += file_size

    return dirs_deleted, files_deleted, bytes_freed


def format_bytes(size: int) -> str:
    """Format bytes to human readable size."""
    float_size = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if float_size < 1024:
            return f"{float_size:.2f} {unit}"
        float_size /= 1024
    return f"{float_size:.2f} TB"


def main():
    parser = argparse.ArgumentParser(
        description="Delete all __pycache__ directories and .pyc/.pyo files in backend."
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Target directory (defaults to backend directory).",
    )
    parser.add_argument(
        "--include-venv",
        action="store_true",
        help="Include .venv / virtual environment folders (default: False).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files and directories that would be deleted without actually deleting them.",
    )

    args = parser.parse_args()
    target_path = args.path.resolve()

    if not target_path.exists() or not target_path.is_dir():
        print(f"Error: Target path does not exist or is not a directory: {target_path}", file=sys.stderr)
        sys.exit(1)

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Scanning for __pycache__ in: {target_path}")
    print(f"Include virtual environment: {args.include_venv}")
    print("-" * 60)

    dirs_deleted, files_deleted, bytes_freed = clean_pycache(
        target_dir=target_path,
        include_venv=args.include_venv,
        dry_run=args.dry_run,
    )

    print("-" * 60)
    action_label = "Would delete" if args.dry_run else "Deleted"
    print(f"{action_label}: {dirs_deleted} '__pycache__' directories, {files_deleted} standalone bytecode files.")
    print(f"Total space freed: {format_bytes(bytes_freed)}")


if __name__ == "__main__":
    main()
