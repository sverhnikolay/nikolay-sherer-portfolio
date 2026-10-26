"""Small single-owner CMS. All durable state stays outside versioned releases."""
import argparse
import hashlib
import hmac
import io
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from PIL import Image, ImageOps, UnidentifiedImageError
from content import ContentError, ROOT, initial_content, render, validate

STATE = Path(os.environ.get("CMS_DATA_DIR", ROOT / ".cms-data"))
ORIGIN = os.environ.get("CMS_ORIGIN", "http://127.0.0.1:8787")
SECURE = os.environ.get("CMS_SECURE", "1") != "0"
COOKIE = "__Host-portfolio_session" if SECURE else "portfolio_session"
SESSION_SECONDS = 12 * 3600
LOCK = threading.RLock()
CACHE = {}
Image.MAX_IMAGE_PIXELS = 24_000_000


def db():
    connection = sqlite3.connect(STATE / "cms.sqlite3", timeout=15)
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o750)
    (STATE / "media").mkdir(exist_ok=True, mode=0o755)
    os.chmod(STATE / "media", 0o755)
    with db() as c:
        c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), password TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), published TEXT NOT NULL, draft TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, content TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, created INTEGER NOT NULL);
        """)
        if not c.execute("SELECT 1 FROM content").fetchone():
            payload = json.dumps(initial_content(), ensure_ascii=False)
            c.execute("INSERT INTO content VALUES(1,?,?,1,?)", (payload, payload, int(time.time())))
        configured = c.execute("SELECT 1 FROM account").fetchone()
    os.chmod(STATE / "cms.sqlite3", 0o600)
    if not configured and not (STATE / "setup-token").exists():
        descriptor = os.open(STATE / "setup-token", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as f:
            f.write(secrets.token_urlsafe(32))


def password_hash(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024).hex()
    return salt + ":" + digest


def password_matches(password, stored):
    salt, expected = stored.split(":")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024).hex()
    return hmac.compare_digest(expected, digest)


def check_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        raise ContentError("Придумайте пароль от 12 до 128 символов.")


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Handler(BaseHTTPRequestHandler):
    server_version = "Portfolio"

    def log_message(self, fmt, *args):
        # Never log request bodies, cookies, setup tokens or query strings.
        logging.info("%s %s %s", self.command, self.path.split("?")[0], args[1] if len(args) > 1 else "")

    def send(self, status, body, content_type="application/json; charset=utf-8", cookie=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store" if self.path.startswith(("/admin", "/api/")) else "no-cache")
        if self.path.startswith("/admin") and not self.path.startswith("/admin/preview"):
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.send_header("X-Frame-Options", "DENY")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def error(self, status, message):
        self.send(status, {"error": message})

    def read_body(self, maximum=600_000):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ContentError("Не удалось прочитать запрос.")
        if not 0 < length <= maximum:
            raise ContentError("Файл слишком большой. Используйте изображение до 12 МБ.")
        return self.rfile.read(length)

    def read_json(self):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            raise ContentError("Не удалось прочитать форму. Обновите страницу.")
        value = json.loads(self.read_body())
        if not isinstance(value, dict):
            raise ContentError("Не удалось прочитать форму.")
        return value

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            token = cookie[COOKIE].value if COOKIE in cookie else ""
        except Exception:
            return None
        with db() as c:
            return c.execute("SELECT * FROM sessions WHERE token=? AND expires>?", (token_hash(token), int(time.time()))).fetchone()

    def require_session(self, csrf=False):
        session = self.session()
        if not session:
            self.error(401, "Войдите в админку ещё раз. Изменения на этой странице сохранены до обновления.")
            return None
        if csrf and not hmac.compare_digest(session["csrf"], self.headers.get("X-CSRF-Token", "")):
            self.error(403, "Сессия обновилась. Войдите ещё раз.")
            return None
        return session

    def new_session(self, c):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        c.execute("DELETE FROM sessions WHERE expires<?", (int(time.time()),))
        c.execute("INSERT INTO sessions VALUES(?,?,?)", (token_hash(token), csrf, int(time.time()) + SESSION_SECONDS))
        cookie = f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS}"
        if SECURE:
            cookie += "; Secure"
        return csrf, cookie

    def do_GET(self):
        try:
            self.get()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            logging.exception("GET failed")
            self.error(500, "Не удалось открыть страницу. Попробуйте ещё раз.")

    def get(self):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html", "/offer.html", "/privacy.html", "/admin/preview"):
            preview = path == "/admin/preview"
            if preview and not self.require_session():
                return
            with db() as c:
                row = c.execute("SELECT * FROM content WHERE id=1").fetchone()
            document = path.lstrip("/") if path in ("/offer.html", "/privacy.html") else "index.html"
            payload = row["draft" if preview else "published"]
            cache_key = (document, token_hash(payload), preview)
            with LOCK:
                if cache_key not in CACHE:
                    result = render(json.loads(payload), document, preview)
                    if len(CACHE) > 12:
                        CACHE.clear()
                    CACHE[cache_key] = result
                body = CACHE[cache_key]
            self.send(200, body, "text/html; charset=utf-8")
        elif path in ("/admin", "/admin/", "/admin/admin.js", "/admin/admin.css"):
            filename = path.rsplit("/", 1)[-1] if path.endswith((".js", ".css")) else "index.html"
            file = ROOT / "admin" / filename
            mime = "text/javascript" if filename.endswith("js") else "text/css" if filename.endswith("css") else "text/html"
            self.send(200, file.read_bytes(), mime + "; charset=utf-8")
        elif path == "/api/admin/session":
            session = self.session()
            with db() as c:
                configured = bool(c.execute("SELECT 1 FROM account").fetchone())
            self.send(200, {"configured": configured, "authenticated": bool(session), "csrf": session["csrf"] if session else ""})
        elif path == "/api/admin/content":
            if not self.require_session():
                return
            with db() as c:
                row = c.execute("SELECT * FROM content WHERE id=1").fetchone()
            self.send(200, {"content": json.loads(row["draft"]), "version": row["version"], "updated": row["updated"], "unpublished": row["draft"] != row["published"]})
        elif path == "/api/admin/history":
            if not self.require_session():
                return
            with db() as c:
                rows = c.execute("SELECT id,created FROM history ORDER BY id DESC LIMIT 20").fetchall()
            self.send(200, {"items": [dict(r) for r in rows]})
        elif not SECURE and path.startswith(("/assets/", "/media/")):
            # Development only; production files are served directly by Nginx.
            import mimetypes
            folder = STATE / "media" if path.startswith("/media/") else ROOT / "assets"
            relative = path.removeprefix("/media/" if path.startswith("/media/") else "/assets/")
            file = (folder / relative).resolve()
            if not file.is_relative_to(folder.resolve()) or not file.is_file():
                return self.error(404, "Файл не найден.")
            self.send(200, file.read_bytes(), mimetypes.guess_type(str(file))[0] or "application/octet-stream")
        elif not SECURE and path in ("/styles.css", "/script.js"):
            self.send(200, (ROOT / path.lstrip("/")).read_bytes(), "text/css" if path.endswith("css") else "text/javascript")
        else:
            self.error(404, "Страница не найдена.")

    def do_POST(self):
        try:
            self.post()
        except (ContentError, json.JSONDecodeError) as error:
            self.error(400, str(error) if isinstance(error, ContentError) else "Не удалось прочитать форму.")
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            logging.exception("POST failed")
            self.error(500, "Не удалось сохранить. Ваши изменения остались в редакторе, попробуйте ещё раз.")

    def post(self):
        if self.headers.get("Origin") != ORIGIN:
            return self.error(403, "Откройте редактор по основному адресу сайта.")
        path = urlsplit(self.path).path
        if path in ("/api/admin/login", "/api/admin/setup"):
            return self.authenticate(path)
        session = self.require_session(csrf=True)
        if not session:
            return
        if path == "/api/admin/upload":
            return self.upload()
        body = self.read_json()
        if path == "/api/admin/logout":
            with db() as c:
                c.execute("DELETE FROM sessions WHERE token=?", (session["token"],))
            self.send(200, {"ok": True}, cookie=f"{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + ("; Secure" if SECURE else ""))
        elif path in ("/api/admin/draft", "/api/admin/publish", "/api/admin/restore"):
            with LOCK, db() as c:
                c.execute("BEGIN IMMEDIATE")
                row = c.execute("SELECT * FROM content WHERE id=1").fetchone()
                if body.get("version") != row["version"]:
                    return self.error(409, "Содержимое уже изменилось в другой вкладке. Скопируйте нужный текст и обновите страницу.")
                if path.endswith("restore"):
                    old = c.execute("SELECT content FROM history WHERE id=?", (body.get("id"),)).fetchone()
                    if not old:
                        raise ContentError("Эта версия не найдена.")
                    content = validate(json.loads(old["content"]))
                else:
                    content = validate(body.get("content"))
                # Render before committing, so invalid content never breaks the public site.
                render(content)
                payload = json.dumps(content, ensure_ascii=False)
                version, now = row["version"] + 1, int(time.time())
                published = payload if path.endswith("publish") else row["published"]
                if path.endswith("publish") and payload != row["published"]:
                    c.execute("INSERT INTO history(content,created) VALUES(?,?)", (row["published"], now))
                    c.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 20)")
                c.execute("UPDATE content SET published=?,draft=?,version=?,updated=? WHERE id=1", (published, payload, version, now))
                CACHE.clear()
            self.send(200, {"version": version, "updated": now, "unpublished": payload != published, "content": content})
        elif path == "/api/admin/password":
            check_password(body.get("password"))
            with LOCK, db() as c:
                stored = c.execute("SELECT password FROM account WHERE id=1").fetchone()[0]
                if not isinstance(body.get("current"), str) or not password_matches(body["current"], stored):
                    return self.error(400, "Текущий пароль не подходит.")
                c.execute("UPDATE account SET password=? WHERE id=1", (password_hash(body["password"]),))
                c.execute("DELETE FROM sessions")
                csrf, cookie = self.new_session(c)
            self.send(200, {"ok": True, "csrf": csrf}, cookie=cookie)
        else:
            self.error(404, "Действие не найдено.")

    def authenticate(self, path):
        body = self.read_json()
        ip = self.headers.get("X-Real-IP", self.client_address[0])[:64]
        with LOCK, db() as c:
            c.execute("DELETE FROM attempts WHERE created<?", (int(time.time()) - 900,))
            if c.execute("SELECT COUNT(*) FROM attempts WHERE ip=?", (ip,)).fetchone()[0] >= 8:
                return self.error(429, "Слишком много попыток. Повторите вход через 15 минут.")
            account = c.execute("SELECT password FROM account WHERE id=1").fetchone()
            accepted = False
            password = body.get("password", "")
            if not isinstance(password, str) or len(password) > 128:
                raise ContentError("Проверьте пароль.")
            if path.endswith("setup"):
                if account:
                    return self.error(409, "Пароль уже создан. Войдите в админку.")
                tokenfile = STATE / "setup-token"
                valid_token = tokenfile.exists() and hmac.compare_digest(str(body.get("token", "")), tokenfile.read_text().strip())
                if valid_token:
                    check_password(password)
                    c.execute("INSERT INTO account VALUES(1,?)", (password_hash(password),))
                    accepted = True
            elif account:
                accepted = password_matches(password, account[0])
            if not accepted:
                c.execute("INSERT INTO attempts VALUES(?,?)", (ip, int(time.time())))
                return self.error(401, "Пароль не подходит." if path.endswith("login") else "Нужна личная ссылка для первого входа.")
            c.execute("DELETE FROM attempts WHERE ip=?", (ip,))
            csrf, cookie = self.new_session(c)
        if path.endswith("setup"):
            (STATE / "setup-token").unlink(missing_ok=True)
        self.send(200, {"ok": True, "csrf": csrf}, cookie=cookie)

    def upload(self):
        raw = self.read_body(12 * 1024 * 1024)
        try:
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ("PNG", "JPEG", "WEBP"):
                    raise ContentError("Поддерживаются PNG, JPG и WebP.")
                if image.width * image.height > Image.MAX_IMAGE_PIXELS:
                    raise ContentError("Изображение слишком большое по разрешению. Используйте фото до 24 мегапикселей.")
                image = ImageOps.exif_transpose(image)
                image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                name = secrets.token_hex(16) + ".webp"
                image.save(STATE / "media" / name, "WEBP", quality=90, method=4)
                os.chmod(STATE / "media" / name, 0o644)
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ContentError("Не удалось прочитать изображение. Выберите PNG, JPG или WebP до 12 МБ.")
        self.send(200, {"path": "media/" + name})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("CMS_PORT", "8787")))
    parser.add_argument("--setup-link", action="store_true")
    args = parser.parse_args()
    initialize()
    if args.setup_link:
        tokenfile = STATE / "setup-token"
        print(ORIGIN + "/admin/#setup=" + tokenfile.read_text().strip() if tokenfile.exists() else "Already configured")
    else:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        logging.info("CMS listening on 127.0.0.1:%s", args.port)
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
