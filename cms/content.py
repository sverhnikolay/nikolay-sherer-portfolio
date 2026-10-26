"""Structured content and safe HTML rendering. The existing site is the template."""
import copy
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent


def soup_for(name="index.html"):
    return BeautifulSoup((ROOT / name).read_text(encoding="utf-8"), "html.parser")


def text(node):
    if node is None:
        return ""
    node = copy.copy(node)
    for br in node.find_all("br"):
        br.replace_with("\ue000")
    for small in node.find_all("small"):
        small.insert_before("\ue000")
    return re.sub(r"\s+", " ", node.get_text()).replace("\ue000", "\n").strip()


def heading(node):
    base = copy.copy(node)
    accent = base.select_one("em")
    value = text(accent)
    if accent:
        accent.decompose()
    return {"title": text(base), "accent": value}


def initial_content():
    s = soup_for()
    hero = s.select_one(".hero")
    title = hero.select_one("h1")
    hero_title = copy.copy(title)
    highlight = hero_title.select_one("span")
    hero_text = text(highlight)
    highlight.decompose()
    data = {
        "site": {
            "name": text(s.select_one(".profile-heading span")),
            "role": text(s.select_one(".hero-profile-copy p")),
            "telegram": "sh3r3r", "email": "sherer.nikolay@yandex.ru", "phone": "+7 977 844-72-65",
            "logo": s.select_one(".brand-logo")["src"],
            "favicon": s.select_one('link[rel="icon"]')["href"],
            "title": text(s.title), "description": s.select_one('meta[name="description"]')["content"],
            "footer": text(s.select_one(".footer-identity p")),
        },
        "hero": {
            "label": text(hero.select_one(".hero-eyebrow")),
            "title": text(hero_title).split("\n")[0].strip(), "accent": hero_text,
            "continuation": text(hero_title).split("\n")[-1].strip(),
            "description": text(hero.select_one(".hero-lead")),
            "button": text(hero.select_one(".hero-actions .button span")),
            "secondary": "Посмотреть работы", "photo": hero.select_one(".hero-photo img")["src"],
            "metrics": [{"value": text(n.select_one("strong")), "label": text(n.select_one("span"))}
                        for n in s.select(".hero-metrics > div")],
            "words": [text(n) for n in s.select(".marquee-group")[0].select("span")],
        },
    }
    for key, selector in [("services", "#services"), ("portfolio", "#cases"), ("process", "#process"),
                          ("guarantees", "#guarantees"), ("faq", "#faq"), ("contact", "#contact"), ("agent", "#agent-demo")]:
        node = s.select_one(selector)
        data[key] = {**heading(node.select_one("h2"))}
        if node.select_one(".section-kicker"):
            data[key]["label"] = text(node.select_one(".section-kicker"))
    data["services"]["items"] = [{"title": text(n.h3), "description": text(n.p)} for n in s.select(".service-card")]
    data["portfolio"]["items"] = [{
        "title": text(n.h3), "category": text(n.select_one(".project-caption div span")),
        "description": text(n.select_one(".project-caption p")), "url": n.a["href"],
        "image": n.img["src"], "status": text(n.select_one(".project-status")),
    } for n in s.select(".project-tile")]
    data["portfolio"]["button"] = text(s.select_one(".portfolio-cta .button span"))
    data["process"]["items"] = [{"title": text(n.h3), "label": text(n.select_one(".scroll-process-card-label")),
        "description": text(n.p), "image": n.img["src"]} for n in s.select(".scroll-process-stage")]
    data["guarantees"]["items"] = [{"title": text(n.h3), "description": text(n.p), "image": n.img["src"]}
                                           for n in s.select(".guarantee-card")]
    data["faq"]["description"] = text(s.select_one(".faq-heading p"))
    data["faq"]["items"] = [{"question": text(n.summary), "answer": text(n.p)} for n in s.select(".faq-list details")]
    data["agent"].update({
        "description": text(s.select_one(".agent-demo-copy > p")),
        "benefits": [{"value": text(n.b), "label": text(n.select_one("span"))} for n in s.select(".agent-benefits > div")],
        "chatTitle": text(s.select_one(".agent-chat-header b")), "brand": text(s.select_one(".agent-chat-brand")),
        "messages": [],
    })
    for n in s.select("[data-chat-item]"):
        node = copy.copy(n)
        stamp = text(node.time)
        if node.time:
            node.time.decompose()
        icon = node.select_one(".agent-success-icon")
        if icon:
            icon.decompose()
        speaker = "client" if "agent-message--client" in n["class"] else "success" if "agent-message--success" in n["class"] else "bot"
        data["agent"]["messages"].append({"speaker": speaker,
                                             "text": text(node), "time": stamp})
    data["contact"].update({"description": text(s.select_one(".contact-card > p")),
        "button": text(s.select_one(".contact-card .button span")), "response": text(s.select_one(".response-time span"))})
    data["documents"] = {}
    for key, filename in [("offer", "offer.html"), ("privacy", "privacy.html")]:
        doc = soup_for(filename)
        data["documents"][key] = {"title": text(doc.h1), "intro": text(doc.select_one(".legal-lead")),
            "sections": [{"title": text(n.h2), "text": text(n.p)} for n in doc.select("main > section")],
            "updated": text(doc.select_one("main > small"))}
    return data


class ContentError(ValueError):
    pass


def validate(data):
    """Only known fields, plain text, safe links and local image paths are accepted."""
    defaults = initial_content()

    def visit(value, template, path=""):
        if isinstance(template, dict):
            if not isinstance(value, dict) or set(value) != set(template):
                raise ContentError("Состав полей изменился. Обновите страницу редактора.")
            return {k: visit(value[k], v, f"{path}.{k}") for k, v in template.items()}
        if isinstance(template, list):
            if not isinstance(value, list) or not 1 <= len(value) <= (60 if path.endswith("messages") else 30):
                raise ContentError("В списке должно быть от 1 до 30 элементов (в диалоге — до 60).")
            return [visit(v, template[0], f"{path}.{i}") for i, v in enumerate(value)]
        if not isinstance(value, str) or len(value) > 6000 or "\x00" in value:
            raise ContentError("Текст слишком длинный. Максимум — 6000 знаков в одном поле.")
        value = value.strip()
        last = path.split(".")[-1]
        if last in ("image", "photo", "logo", "favicon"):
            if not re.fullmatch(r"(?:assets|media)/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg|ico)", value, re.I) or ".." in value:
                raise ContentError("Выберите изображение через кнопку загрузки.")
        if last == "url":
            parsed = urlsplit(value)
            if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
                raise ContentError("Ссылка на проект должна начинаться с https:// или http://.")
        if last == "telegram" and not re.fullmatch(r"[A-Za-z0-9_]{5,32}", value):
            raise ContentError("Введите имя Telegram без @ и без ссылки, например sh3r3r.")
        if last == "email" and not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", value):
            raise ContentError("Проверьте адрес электронной почты.")
        if last == "phone" and not re.fullmatch(r"[+\d ()-]{7,30}", value):
            raise ContentError("Проверьте номер телефона.")
        if last == "speaker" and value not in ("bot", "client", "success"):
            raise ContentError("Выберите автора сообщения.")
        return value

    clean = visit(data, defaults)
    if len(json.dumps(clean)) > 500_000:
        raise ContentError("Содержимое слишком большое.")
    return clean


def rich(value):
    return html.escape(value).replace("\n", "<br />")


def chat_message(message):
    kind = message["speaker"]
    classes = "agent-message agent-message--" + ("client" if kind == "client" else "bot")
    markup = rich(message["text"])
    if kind == "success":
        classes += " agent-message--success"
        lines = message["text"].splitlines() or [""]
        markup = '<span class="agent-success-icon" aria-hidden="true">✓</span><span><b>' + rich(lines[0]) + '</b>' + ''.join('<small>' + rich(line) + '</small>' for line in lines[1:]) + '</span>'
    return f'<div class="{classes}" data-chat-item>{markup}<time>{rich(message["time"])}</time></div>'


def render(data, document="index.html", preview=False):
    s = soup_for(document)

    def put(selector, value, markup=False):
        for node in s.select(selector):
            node.clear()
            node.extend(BeautifulSoup(value if markup else rich(value), "html.parser").contents)

    def attr(selector, key, value):
        for node in s.select(selector):
            node[key] = value

    def image(selector, src):
        for node in s.select(selector):
            if node.get("src", "").lstrip("/") != src:
                node.attrs.pop("srcset", None)
            elif node.get("srcset"):
                node["srcset"] = re.sub(r"(?<!/)assets/", "/assets/", node["srcset"])
            node["src"] = "/" + src

    site = data["site"]
    telegram = "https://t.me/" + site["telegram"]
    for link in s.select('a[href^="https://t.me/"]'):
        link["href"] = telegram
        if text(link).startswith("@"):
            link.string = "@" + site["telegram"]
    for link in s.select('a[href^="mailto:"]'):
        link["href"] = "mailto:" + site["email"]
        link.string = site["email"]
    for link in s.select('a[href^="tel:"]'):
        link["href"] = "tel:" + re.sub(r"[^+\d]", "", site["phone"])
        link.string = site["phone"]
    image(".brand-logo, .footer-logo img, .legal-logo", site["logo"])
    if document != "index.html":
        entry = data["documents"]["offer" if document == "offer.html" else "privacy"]
        put("h1", entry["title"])
        put(".legal-lead", entry["intro"])
        blocks = s.select("main > section")
        for block in blocks[1:]:
            block.decompose()
        blocks[0].replace_with(BeautifulSoup("".join(f'<section><h2>{rich(n["title"])}</h2><p>{rich(n["text"])}</p></section>' for n in entry["sections"]), "html.parser"))
        put("main > small", entry["updated"])
        put("title", entry["title"] + " — " + site["name"])
    else:
        put("title", site["title"])
        attr('meta[name="description"], meta[property="og:description"]', "content", site["description"])
        attr('meta[property="og:title"]', "content", site["title"])
        attr('link[rel="icon"], link[rel="apple-touch-icon"]', "href", "/" + site["favicon"])
        attr('link[rel="icon"]', "type", "image/png" if site["favicon"].endswith("png") else "image/webp")
        put(".profile-heading span", site["name"])
        put(".hero-profile-copy p", site["role"])
        put(".footer-identity p", site["footer"])
        year_node = s.select_one(".footer-identity small")
        year_node.clear()
        year_node.extend(BeautifulSoup('© <span data-year></span> ' + html.escape(site["name"]), "html.parser").contents)
        h = data["hero"]
        put(".hero-eyebrow", h["label"])
        put(".hero h1", rich(h["title"]) + ' <span>' + rich(h["accent"]) + '</span><br />' + rich(h["continuation"]), True)
        put(".hero-lead", h["description"])
        put(".hero-actions .button span", h["button"])
        put(".hero-work-link", rich(h["secondary"]) + ' <span aria-hidden="true">↘</span>', True)
        image(".hero-photo img", h["photo"])
        put(".hero-metrics", "".join(f'<div><strong>{rich(n["value"])}</strong><span>{rich(n["label"])}</span></div>' for n in h["metrics"]), True)
        put(".marquee-group", "".join(f'<span>{rich(word)}</span><i>—</i>' for word in h["words"]), True)
        selectors = {"services": "#services", "agent": "#agent-demo", "portfolio": "#cases", "process": "#process", "guarantees": "#guarantees", "faq": "#faq", "contact": "#contact"}
        for key, selector in selectors.items():
            entry = data[key]
            put(selector + " h2", rich(entry["title"]) + '<br /><em>' + rich(entry["accent"]) + '</em>', True)
            if "label" in entry:
                put(selector + " .section-kicker", entry["label"])
        icons = [str(n) for n in s.select(".service-icon svg")]
        put(".service-grid", "".join(f'<article class="service-card reveal"><div class="service-top"><div class="service-icon" aria-hidden="true">{icons[i % len(icons)]}</div></div><h3>{rich(n["title"])}</h3><p>{rich(n["description"])}</p></article>' for i, n in enumerate(data["services"]["items"])), True)
        tiles = []
        for n in data["portfolio"]["items"]:
            tiles.append(f'<article class="project-tile reveal"><a class="project-preview" href="{html.escape(n["url"], quote=True)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть проект {html.escape(n["title"], quote=True)}"><img src="/{n["image"]}" alt="{html.escape(n["title"], quote=True)}" loading="lazy" decoding="async"/><span class="project-status"><i></i>{rich(n["status"])}</span><span class="project-open" aria-hidden="true">↗</span></a><div class="project-caption"><div><span>{rich(n["category"])}</span><h3>{rich(n["title"])}</h3></div><p>{rich(n["description"])}</p></div></article>')
        put(".showcase-grid", "".join(tiles), True)
        put(".portfolio-cta .button span:first-child", data["portfolio"]["button"])
        put(".scroll-process-list", "".join(f'<li class="scroll-process-stage" data-process-stage><span class="scroll-process-node" aria-hidden="true"><b>{i+1}</b></span><article class="scroll-process-card"><span class="scroll-process-card-label">{rich(n["label"])}</span><h3>{rich(n["title"])}</h3><p>{rich(n["description"])}</p><img class="scroll-process-art" src="/{n["image"]}" width="640" height="640" loading="lazy" decoding="async" alt="" aria-hidden="true"/></article></li>' for i,n in enumerate(data["process"]["items"])), True)
        put(".guarantee-grid", "".join(f'<article class="guarantee-card reveal"><span class="guarantee-icon"><img src="/{n["image"]}" width="512" height="512" loading="lazy" decoding="async" alt="" aria-hidden="true"/></span><div><h3>{rich(n["title"])}</h3><p>{rich(n["description"])}</p></div></article>' for n in data["guarantees"]["items"]), True)
        put(".faq-heading p", data["faq"]["description"])
        put(".faq-list", "".join(f'<details><summary>{rich(n["question"])}<span></span></summary><p>{rich(n["answer"])}</p></details>' for n in data["faq"]["items"]), True)
        agent = data["agent"]
        put(".agent-demo-copy > p", agent["description"])
        put(".agent-benefits", "".join(f'<div><b>{rich(n["value"])}</b><span>{rich(n["label"])}</span></div>' for n in agent["benefits"]), True)
        put(".agent-chat-header b", agent["chatTitle"])
        put(".agent-chat-brand", agent["brand"])
        put(".agent-chat-body", "".join(chat_message(n) for n in agent["messages"]) + '<div class="agent-typing" data-chat-typing aria-label="AI-агент печатает"><i></i><i></i><i></i></div>', True)
        put(".contact-card > p", data["contact"]["description"])
        put(".contact-card .button span", data["contact"]["button"])
        put(".response-time span", data["contact"]["response"])
    # Absolute assets also work inside the admin preview.
    for node in s.select("[src], [href]"):
        for attr_name in ("src", "href"):
            val = node.get(attr_name, "")
            if val.startswith(("assets/", "styles.css", "script.js", "index.html", "offer.html", "privacy.html")):
                node[attr_name] = "/" + val
    if preview:
        notice = BeautifulSoup('<div style="position:fixed;bottom:16px;left:16px;z-index:99999;padding:14px 20px;background:white;color:#151515;border-radius:14px;font:600 16px/1.4 system-ui;box-shadow:0 4px 30px #0005">Предпросмотр · посетители пока видят опубликованную версию</div>', "html.parser")
        s.body.append(notice)
    return str(s).encode("utf-8")
