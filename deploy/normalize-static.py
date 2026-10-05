"""Provide flat segment-prefetch aliases for this Next.js Windows export."""
from pathlib import Path
from shutil import copyfile
import sys

root = Path(sys.argv[1]).resolve()
for source in root.rglob('__PAGE__.txt'):
    if source.parent.name.startswith('__next.'):
        alias = source.parent.parent / (source.parent.name + '.__PAGE__.txt')
        copyfile(source, alias)
        alias.chmod(0o644)
        print(alias.relative_to(root))
