"""Pin the demo server's catalog shape before generating local placeholder media."""

import json
from collections import Counter
from pathlib import Path
import unittest

INVENTORY = Path(__file__).with_name("inventory.json")


class DemoInventoryTest(unittest.TestCase):
    def test_demo_catalog_has_the_observed_titles_and_relationships(self):
        inventory = json.loads(INVENTORY.read_text())
        self.assertEqual({kind: len(inventory[kind]) for kind in ("movies", "shows", "episodes", "tracks")}, {
            "movies": 296, "shows": 14, "episodes": 230, "tracks": 94,
        })
        self.assertEqual(len({track["albumKey"] for track in inventory["tracks"]}), 20)
        self.assertEqual(len({track["artistKey"] for track in inventory["tracks"]}), 14)
        self.assertIn("The General", {movie["title"] for movie in inventory["movies"]})
        self.assertIn("Lights Out", {show["title"] for show in inventory["shows"]})
        self.assertIn("Maple Leaf Rag", {track["title"] for track in inventory["tracks"]})

        show_keys = {show["key"] for show in inventory["shows"]}
        self.assertTrue(all(episode["showKey"] in show_keys for episode in inventory["episodes"]))
        self.assertEqual(len({
            (episode["showKey"], episode["season"], episode["episode"])
            for episode in inventory["episodes"]
        }), 230)
        self.assertEqual(len({
            (track["albumKey"], track["track"]) for track in inventory["tracks"]
        }), 94)
        self.assertEqual(len({
            entry["key"]
            for kind in ("movies", "shows", "episodes", "tracks")
            for entry in inventory[kind]
        }), 296 + 14 + 230 + 94)
        self.assertEqual(Counter(key.split(":", 1)[0] for kind in inventory for key in (
            entry["key"] for entry in inventory[kind]
        )), {"movie": 296, "show": 14, "episode": 230, "track": 94})


if __name__ == "__main__":
    unittest.main()
