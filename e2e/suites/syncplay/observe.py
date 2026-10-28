#!/usr/bin/env python3
"""Read-only Jellyfin session and group evidence for manual SyncPlay rounds.

A thin wrapper over the shared bench observer (`bench/sessions.py`) that keeps the
throwaway server of setup.py as its default and the SyncPlay group assertions.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from bench.jellyfin import JellyfinClient  # noqa: E402
from bench.sessions import check, skew_seconds, snapshot  # noqa: E402

UI_CLIENTS = ("Streamyfin", "Jellyfin Web")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default="snapshot")
    parser.add_argument("--expect-members", type=int)
    parser.add_argument("--expect-active", type=int, default=2, help="Minimum active playback sessions; 1 for a single native player")
    parser.add_argument("--expect-paused", choices=("true", "false"))
    parser.add_argument("--expect-item")
    parser.add_argument("--max-skew", type=float)
    parser.add_argument("--device", action="append", help="Only this device name; repeat for each client under test")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "observations.json")
    args = parser.parse_args()

    credentials = json.loads((ROOT / ".state" / "credentials.json").read_text())
    token = credentials["host"]["token"]
    client = JellyfinClient(credentials["url"])
    views = [v for v in snapshot(client.sessions(token)) if v.client in UI_CLIENTS and (not args.device or v.device in args.device)]
    groups = client.get("/SyncPlay/List", token=token) or []
    failures = check(
        views,
        expect_item=args.expect_item,
        expect_paused=None if args.expect_paused is None else args.expect_paused == "true",
        expect_active=args.expect_active,
        max_skew_seconds=args.max_skew,
        expect_members=args.expect_members,
        groups=groups,
    )
    observation = {
        "label": args.label,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "serverVersion": credentials.get("serverVersion"),
        # Group info carries public state only, never account tokens.
        "groups": [{key: group.get(key) for key in ("GroupId", "GroupName", "Participants", "LastUpdatedAt", "State")} for group in groups],
        "sessions": [
            {
                "id": v.id, "client": v.client, "deviceName": v.device, "userName": v.user, "groupId": v.group_id,
                "itemId": v.item_id, "itemName": v.item_name, "paused": v.is_paused, "positionSeconds": v.position_seconds,
            }
            for v in views
        ],
        "skewSeconds": skew_seconds(views),
        "deviceFilter": args.device,
        "assertionsPassed": not failures,
        "failures": failures,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    history = json.loads(args.output.read_text()) if args.output.exists() else []
    history.append(observation)
    args.output.write_text(json.dumps(history, indent=2) + "\n")
    print(json.dumps(observation, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
