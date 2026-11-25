#!/usr/bin/env python3
"""Remove this checkout's throwaway Jellyfin and Seerr, and every file under .state.

Run it with the same checkout that ran setup.py. It refuses a container that another
checkout's compose.yml started, or a fixture port another process holds, so a second
worktree never takes down the first one's. The native backend's .tools/ stays.
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import setup  # noqa: E402


def teardown():
    owned = setup.identity()
    fixture = setup.backend(owned)
    fixture.refuse_foreign(owned)
    fixture.down(owned)
    for path in (setup.STATE, setup.ROOT / "artifacts"):
        if path.exists():
            shutil.rmtree(path)
    setup.ENV_FILE.unlink(missing_ok=True)
    removed = owned["SYNCPLAY_CONTAINER"] if fixture.name == "docker" else "this checkout's Jellyfin and Seerr processes"
    print(f"Removed {removed} and {setup.STATE}")


if __name__ == "__main__":
    teardown()
