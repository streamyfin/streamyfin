import json
import socketserver
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock
from urllib.error import HTTPError

from bench.config import Account
from bench.jellyfin import AuthSession, JellyfinClient, JellyfinHttpError


class FakeResponse:
    def __init__(self, payload):
        self.body = json.dumps(payload).encode()

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def patched(payloads):
    """Patch urlopen to answer each call with the next payload and record the requests."""
    responses = [FakeResponse(payload) for payload in payloads]
    requests = []

    def fake_urlopen(request, timeout=None):
        requests.append(request)
        return responses.pop(0)

    return mock.patch("bench.jellyfin.urlopen", side_effect=fake_urlopen), requests


class JellyfinClientTests(unittest.TestCase):
    def setUp(self):
        self.client = JellyfinClient("http://server.example.test:8096")

    def test_authorization_header_has_client_and_device(self):
        patcher, requests = patched([{"Version": "12.4.0"}])
        with patcher:
            self.client.get("/System/Info/Public")
        header = requests[0].get_header("Authorization")
        self.assertIn('Client="Streamyfin E2E bench"', header)
        self.assertIn('DeviceId="streamyfin-e2e-bench', header)
        self.assertIn("Version=", header)
        self.assertEqual(requests[0].full_url, "http://server.example.test:8096/System/Info/Public")

    def test_device_id_is_unique_per_client(self):
        # Jellyfin revokes the previous token of a (user, device id) pair on a new sign-in:
        # two bench processes sharing one device id would log each other out.
        other = JellyfinClient("http://server.example.test:8096")
        self.assertNotEqual(self.client.device_id, other.device_id)
        self.assertTrue(self.client.device_id.startswith("streamyfin-e2e-bench-"))

    def test_logout_posts_to_sessions_logout(self):
        patcher, requests = patched([None])
        with patcher:
            self.client.logout(AuthSession("tok", "user-1"))
        self.assertTrue(requests[0].full_url.endswith("/Sessions/Logout"))
        self.assertEqual(requests[0].get_method(), "POST")
        self.assertEqual(requests[0].get_header("X-emby-token"), "tok")

    def test_user_agent_is_the_bench_not_urllib(self):
        # Cloudflare's browser integrity check answers 403 to Python-urllib/3.x.
        patcher, requests = patched([{"Version": "12.4.0"}])
        with patcher:
            self.client.get("/System/Info/Public")
        self.assertEqual(requests[0].get_header("User-agent"), "Streamyfin-E2E-bench/1.0")

    def test_token_goes_in_x_emby_token(self):
        patcher, requests = patched([[]])
        with patcher:
            self.client.get("/Sessions", token="abc123")
        self.assertEqual(requests[0].get_header("X-emby-token"), "abc123")
        self.assertIn('Token="abc123"', requests[0].get_header("Authorization"))

    def test_authenticate_posts_credentials_and_reads_the_session(self):
        patcher, requests = patched([{"AccessToken": "tok", "User": {"Id": "user-1"}}])
        with patcher:
            session = self.client.authenticate(Account(username="test", password="secret"))
        self.assertEqual(session, AuthSession(token="tok", user_id="user-1"))
        self.assertEqual(requests[0].get_method(), "POST")
        self.assertEqual(json.loads(requests[0].data), {"Username": "test", "Pw": "secret"})
        self.assertTrue(requests[0].full_url.endswith("/Users/AuthenticateByName"))

    def test_find_item_keeps_prefix_match_only(self):
        items = {"Items": [{"Id": "a", "Name": "V010 · something else"}, {"Id": "b", "Name": "V01 · H.264 8 bits 1080p"}]}
        patcher, requests = patched([items])
        with patcher:
            found = self.client.find_item(AuthSession("tok", "user-1"), "V01 ·")
        self.assertEqual(found["Id"], "b")
        url = requests[0].full_url
        self.assertIn("SearchTerm=V01", url)
        self.assertIn("Recursive=true", url)
        self.assertIn("IncludeItemTypes=Movie", url)
        self.assertIn("Fields=MediaSources", url)

    def test_find_item_matches_the_lab_code_in_tags(self):
        # The test library keeps the lab code in Tags; the name is the plain title.
        items = {"Items": [{"Id": "x", "Name": "H.264 10 bits", "Tags": ["Vidéo", "V02"]}, {"Id": "b", "Name": "H.264 8 bits 1080p", "Tags": ["Vidéo", "V01"]}]}
        patcher, requests = patched([items])
        with patcher:
            found = self.client.find_item(AuthSession("tok", "user-1"), "V01")
        self.assertEqual(found["Id"], "b")
        self.assertIn("Tags", requests[0].full_url)

    def test_find_item_does_not_take_a_longer_code_as_a_name_prefix(self):
        patcher, _ = patched([{"Items": [{"Id": "x", "Name": "V010 · something else", "Tags": ["V010"]}]}, {"Items": []}])
        with patcher:
            self.assertIsNone(self.client.find_item(AuthSession("tok", "user-1"), "V01"))

    def test_find_item_falls_back_to_the_tags_filter(self):
        # Jellyfin 10.11 does not match SearchTerm against tags; the Tags filter does.
        patcher, requests = patched([{"Items": []}, {"Items": [{"Id": "b", "Name": "H.264 8 bits 1080p", "Tags": ["V01"]}]}])
        with patcher:
            found = self.client.find_item(AuthSession("tok", "user-1"), "V01")
        self.assertEqual(found["Id"], "b")
        self.assertIn("Tags=V01", requests[1].full_url)

    def test_find_item_returns_none_without_match(self):
        patcher, _ = patched([{"Items": [{"Id": "a", "Name": "V010 · something else"}]}, {"Items": []}])
        with patcher:
            self.assertIsNone(self.client.find_item(AuthSession("tok", "user-1"), "V01 ·"))

    def test_public_info_reads_version(self):
        patcher, _ = patched([{"Version": "12.4.0", "ProductName": "Jellyfin Server"}])
        with patcher:
            self.assertEqual(self.client.public_info()["Version"], "12.4.0")

    def test_http_error_names_status_and_path(self):
        error = HTTPError("http://server.example.test:8096/Sessions", 401, "Unauthorized", {}, None)
        with mock.patch("bench.jellyfin.urlopen", side_effect=error):
            with self.assertRaises(JellyfinHttpError) as caught:
                self.client.get("/Sessions")
        self.assertEqual(caught.exception.status, 401)
        self.assertIn("/Sessions", str(caught.exception))


class LocalServer(ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer looks its address up in reverse DNS, which took 35 s on a Mac: a local test
        # server needs no name.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


def serve(handler):
    """A real HTTP server on a free local port; returns it and its base URL."""
    server = LocalServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


class RedirectTests(unittest.TestCase):
    """urllib copies every header, the token among them, into the request a redirect asks for,
    wherever it points."""

    def start(self, handler) -> str:
        server, url = serve(handler)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return url

    def test_a_redirect_to_another_origin_is_refused_with_its_status(self):
        seen = []

        class Elsewhere(BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(dict(self.headers))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, *_):
                pass

        # Another origin by its port alone.
        elsewhere = self.start(Elsewhere)

        class Redirecting(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", elsewhere + "/Sessions")
                self.end_headers()

            def log_message(self, *_):
                pass

        client = JellyfinClient(self.start(Redirecting))
        with self.assertRaises(JellyfinHttpError) as caught:
            client.get("/Sessions", token="secret-token")
        self.assertEqual(caught.exception.status, 302)
        self.assertEqual(seen, [])

    def test_a_redirect_within_the_server_is_followed(self):
        class Moved(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/old":
                    self.send_response(301)
                    self.send_header("Location", "/new")
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"token": self.headers.get("X-Emby-Token")}).encode())

            def log_message(self, *_):
                pass

        client = JellyfinClient(self.start(Moved))
        self.assertEqual(client.get("/old", token="secret-token"), {"token": "secret-token"})


if __name__ == "__main__":
    unittest.main()
