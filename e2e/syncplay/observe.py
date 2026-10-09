#!/usr/bin/env python3
"""Read-only, token-free Jellyfin session/group evidence for manual UI tests."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from setup import api, STATE


def timestamp(value):
    if not value or value.startswith("0001-"):
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default="snapshot")
    parser.add_argument("--expect-members", type=int)
    parser.add_argument("--expect-active", type=int, default=2, help="Minimum active playback sessions for item/pause assertions; use 1 for isolated native EOF tests")
    parser.add_argument("--expect-paused", choices=("true", "false"))
    parser.add_argument("--expect-item")
    parser.add_argument("--max-skew", type=float)
    parser.add_argument("--device", action="append", help="Only include this device name; repeat for each client under test")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "artifacts" / "observations.json")
    args = parser.parse_args()
    credentials = json.loads((STATE / "credentials.json").read_text())
    token = credentials["host"]["token"]
    groups = api("/SyncPlay/List", token=token)
    raw_sessions = api("/Sessions", token=token)
    now = datetime.now(timezone.utc)
    sessions = []
    for session in raw_sessions:
        client = session.get("Client", "")
        if client not in ("Streamyfin", "Jellyfin Web"):
            continue
        if args.device and session.get("DeviceName") not in args.device:
            continue
        state = session.get("PlayState", {})
        item = session.get("NowPlayingItem") or {}
        seconds = state.get("PositionTicks", 0) / 10_000_000
        check_in = timestamp(session.get("LastPlaybackCheckIn"))
        age = max(0, (now - check_in).total_seconds()) if check_in else None
        # Jellyfin 10.11.11 already advances playing PositionTicks each second.
        # Adding LastPlaybackCheckIn age would extrapolate the same time twice.
        projected = seconds
        sessions.append({
            "id": session["Id"], "client": session.get("Client"),
            "deviceName": session.get("DeviceName"), "userName": session.get("UserName"),
            "groupId": session.get("SyncPlayGroupId"),
            "itemId": item.get("Id"), "itemName": item.get("Name"),
            "paused": state.get("IsPaused"), "positionSeconds": seconds,
            "lastPlaybackCheckIn": session.get("LastPlaybackCheckIn"),
            "checkInAgeSeconds": age, "projectedPositionSeconds": projected,
        })
    # Group info contains public group/member state, never account access tokens.
    group_summary = [{key: group.get(key) for key in ("GroupId", "GroupName", "Participants", "LastUpdatedAt", "State")} for group in groups]
    playing = [session for session in sessions if session["itemId"]]
    failures = []
    if args.expect_members is not None:
        actual = max((len(group.get("Participants") or []) for group in groups), default=0)
        if actual != args.expect_members:
            failures.append(f"Group members {actual}, expected {args.expect_members}")
    if args.expect_paused:
        expected = args.expect_paused == "true"
        if len(playing) < args.expect_active or any(session["paused"] != expected for session in playing):
            failures.append(f"Expected {args.expect_active} active playback sessions paused={expected}")
    if args.expect_item and (len(playing) < args.expect_active or any(session["itemId"] != args.expect_item for session in playing)):
        failures.append(f"Expected {args.expect_active} playback sessions on item {args.expect_item}")
    skew = None
    if len(playing) >= 2:
        projected = [session["projectedPositionSeconds"] for session in playing]
        skew = max(projected) - min(projected)
    if args.max_skew is not None and (skew is None or skew > args.max_skew):
        failures.append(f"Projected playback skew {skew}, maximum {args.max_skew}s")
    observation = {
        "label": args.label, "capturedAt": now.isoformat(),
        "serverUrl": credentials["url"], "serverVersion": credentials["serverVersion"],
        "groups": group_summary, "sessions": sessions, "projectedSkewSeconds": skew,
        "deviceFilter": args.device,
        "assertionsPassed": not failures, "failures": failures,
        "note": "Playing PositionTicks already include Jellyfin's server estimate; no additional client extrapolation. Stale paused/playing reports can skew this estimate. Pair with actual client UI observations.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    history = json.loads(args.output.read_text()) if args.output.exists() else []
    history.append(observation)
    args.output.write_text(json.dumps(history, indent=2) + "\n")
    print(json.dumps(observation, indent=2))
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
