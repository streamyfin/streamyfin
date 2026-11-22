"""Keep the demo-derived fixture small enough for a few browsing screens."""

import json
from collections import Counter
from pathlib import Path
import unittest

INVENTORY = Path(__file__).with_name("inventory.json")


class DemoInventoryTest(unittest.TestCase):
    def test_compact_catalog_keeps_browsing_depth_and_relationships(self):
        inventory = json.loads(INVENTORY.read_text())
        self.assertEqual({kind: len(inventory[kind]) for kind in ("movies", "shows", "episodes", "tracks")}, {
            "movies": 20, "shows": 4, "episodes": 12, "tracks": 15,
        })
        self.assertEqual(len({track["albumKey"] for track in inventory["tracks"]}), 5)
        self.assertEqual(len({track["artistKey"] for track in inventory["tracks"]}), 5)
        self.assertIn("The General", {movie["title"] for movie in inventory["movies"]})
        self.assertIn("Lights Out", {show["title"] for show in inventory["shows"]})
        self.assertIn("Maple Leaf Rag", {track["title"] for track in inventory["tracks"]})

        show_keys = {show["key"] for show in inventory["shows"]}
        self.assertTrue(all(episode["showKey"] in show_keys for episode in inventory["episodes"]))
        self.assertEqual(len({
            (episode["showKey"], episode["season"], episode["episode"])
            for episode in inventory["episodes"]
        }), 12)
        self.assertEqual(len({
            (track["albumKey"], track["track"]) for track in inventory["tracks"]
        }), 15)
        self.assertEqual(len({
            entry["key"]
            for kind in ("movies", "shows", "episodes", "tracks")
            for entry in inventory[kind]
        }), 20 + 4 + 12 + 15)
        self.assertEqual(Counter(key.split(":", 1)[0] for kind in inventory for key in (
            entry["key"] for entry in inventory[kind]
        )), {"movie": 20, "show": 4, "episode": 12, "track": 15})


if __name__ == "__main__":
    unittest.main()
