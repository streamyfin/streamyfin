import hashlib
from io import BytesIO
import unittest
from unittest import mock

from bench import download
from bench.download import fetch_verified


class FetchVerifiedTests(unittest.TestCase):
    def test_returns_bytes_when_sha256_matches_and_forwards_timeout(self):
        payload = b"verified archive bytes"
        digest = hashlib.sha256(payload).hexdigest()
        calls = []

        def fake_urlopen(url, timeout=None):
            calls.append((url, timeout))
            return BytesIO(payload)

        with mock.patch.object(download.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = fetch_verified("https://example.test/archive.tar.xz", digest, "Example 1.0", 120)

        self.assertEqual(result, payload)
        self.assertEqual(calls, [("https://example.test/archive.tar.xz", 120)])

    def test_raises_runtime_error_when_sha256_mismatches(self):
        with mock.patch.object(download.urllib.request, "urlopen", return_value=BytesIO(b"tampered")):
            with self.assertRaises(RuntimeError) as caught:
                fetch_verified("https://example.test/archive.tar.xz", "0" * 64, "Example 1.0", 45)

        self.assertEqual(str(caught.exception), "Example 1.0 download checksum mismatch; nothing installed")


if __name__ == "__main__":
    unittest.main()
