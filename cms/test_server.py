"""Integration coverage for authentication, publishing, uploads and persistence."""
import copy
import http.cookiejar
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor

from PIL import Image


class EditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="portfolio-cms-test-")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.origin = f"http://127.0.0.1:{cls.port}"
        cls.env = {**os.environ, "CMS_DATA_DIR": cls.temp.name, "CMS_ORIGIN": cls.origin, "CMS_SECURE": "0"}
        cls.start()

    @classmethod
    def start(cls):
        cls.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name("server.py")), "--port", str(cls.port)], env=cls.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with build_opener().open(cls.origin + "/api/admin/session", timeout=1) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(.1)
        raise RuntimeError("Test CMS failed to start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.temp.cleanup()

    def test_editor_workflow(self):
        client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        csrf = ""

        def call(path, payload=None, expected=200, origin=None, binary=False, authenticated=True):
            opener = client if authenticated else build_opener()
            headers = {"Origin": origin or self.origin, "X-CSRF-Token": csrf}
            if payload is not None:
                headers["Content-Type"] = "image/png" if binary else "application/json"
            data = None if payload is None else payload if binary else json.dumps(payload).encode()
            try:
                response = opener.open(Request(self.origin + path, data=data, headers=headers), timeout=15)
            except HTTPError as error:
                response = error
            body = response.read()
            self.assertEqual(response.status, expected, body[:300])
            return json.loads(body) if response.headers.get("Content-Type", "").startswith("application/json") else body

        self.assertFalse(call("/api/admin/session")["configured"])
        call("/api/admin/content", expected=401)
        token = (Path(self.temp.name) / "setup-token").read_text()
        password = "Local-editor-test-12345"
        call("/api/admin/setup", {"token": token, "password": password}, expected=403, origin="https://attacker.invalid")
        csrf = call("/api/admin/setup", {"token": token, "password": password})["csrf"]
        self.assertFalse((Path(self.temp.name) / "setup-token").exists())
        call("/api/admin/setup", {"token": token, "password": password}, expected=409)
        row = call("/api/admin/content")
        original = copy.deepcopy(row["content"])
        self.assertNotIn("\n", original["hero"]["description"], "HTML indentation must not become manual line breaks")
        self.assertIn("\n", original["hero"]["metrics"][0]["label"], "Intentional line breaks must be preserved")
        changed = copy.deepcopy(original)
        changed["hero"]["title"] = 'Проверка <script>alert("xss")</script>'
        changed["portfolio"]["items"].append({**changed["portfolio"]["items"][0], "title": "Новая работа"})
        bad = copy.deepcopy(changed)
        bad["portfolio"]["items"][0]["url"] = "javascript:alert(1)"
        call("/api/admin/publish", {"content": bad, "version": row["version"]}, expected=400)
        saved = call("/api/admin/draft", {"content": changed, "version": row["version"]})
        self.assertNotIn("&lt;script&gt;", call("/").decode())
        self.assertIn("&lt;script&gt;", call("/admin/preview").decode())
        call("/admin/preview", expected=401, authenticated=False)
        published = call("/api/admin/publish", {"content": changed, "version": saved["version"]})
        self.assertIn("&lt;script&gt;", call("/").decode())
        self.assertNotIn('<script>alert("xss")</script>', call("/").decode())
        call("/api/admin/publish", {"content": changed, "version": saved["version"]}, expected=409)
        saved_csrf = csrf
        csrf = "invalid"
        call("/api/admin/draft", {"content": original, "version": published["version"]}, expected=403)
        csrf = saved_csrf
        photo = io.BytesIO()
        Image.new("RGB", (50, 40), "red").save(photo, "PNG")
        upload = call("/api/admin/upload", photo.getvalue(), binary=True)
        self.assertTrue((Path(self.temp.name) / upload["path"]).exists())
        self.assertEqual(call("/" + upload["path"])[:4], b"RIFF")
        call("/api/admin/upload", b"<svg onload='alert(1)'>", binary=True, expected=400)
        history = call("/api/admin/history")["items"]
        self.assertEqual(len(history), 1)
        restored = call("/api/admin/restore", {"id": history[0]["id"], "version": published["version"]})
        self.assertEqual(restored["content"], original)
        self.assertTrue(restored["unpublished"])
        call("/api/admin/publish", {"content": restored["content"], "version": restored["version"]})
        self.assertNotIn("&lt;script&gt;", call("/").decode())
        new_password = "Changed-local-password-123"
        call("/api/admin/password", {"current": password, "password": new_password})
        call("/api/admin/logout", {}, expected=403)
        csrf = call("/api/admin/session")["csrf"]
        call("/api/admin/logout", {})
        call("/api/admin/content", expected=401)
        csrf = call("/api/admin/login", {"password": new_password})["csrf"]
        self.process.terminate()
        self.process.wait(timeout=10)
        self.start()
        self.assertTrue(call("/api/admin/session")["authenticated"])
        self.assertEqual(call("/api/admin/content")["content"], original)
        call("/api/admin/logout", {})
        for _ in range(8):
            call("/api/admin/login", {"password": "wrong"}, expected=401)
        call("/api/admin/login", {"password": new_password}, expected=429)


if __name__ == "__main__":
    unittest.main(verbosity=2)
