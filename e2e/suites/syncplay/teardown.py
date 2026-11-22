#!/usr/bin/env python3
"""Remove this checkout's throwaway Jellyfin: container, network and every file under .state.

Run it with the same checkout that ran setup.py. It refuses a container that another
checkout's compose.yml started, so a second worktree never takes down the first one's.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import setup  # noqa: E402


def teardown():
    owned = setup.identity()
    setup.refuse_foreign_container(owned["SYNCPLAY_CONTAINER"])
    subprocess.run(
        ["docker", "compose", "-f", str(setup.ROOT / "compose.yml"), "down", "--remove-orphans"],
        check=True, env={**os.environ, **owned},
    )
    for path in (setup.STATE, setup.ROOT / "artifacts"):
        if path.exists():
            shutil.rmtree(path)
    setup.ENV_FILE.unlink(missing_ok=True)
    print(f"Removed {owned['SYNCPLAY_CONTAINER']} and {setup.STATE}")


if __name__ == "__main__":
    teardown()
