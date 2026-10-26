"use strict";
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sections = [
  ["hero", "Первый экран", "◈", "Первое, что видит посетитель: заголовок, ваше фото и короткое описание."],
  ["services", "Что делаю", "▦", "Расскажите простыми словами, какие задачи вы решаете для клиентов."],
  ["agent", "AI-агент", "✳", "Измените описание и сценарий демонстрационного диалога. Сообщения проиграются по порядку."],
  ["portfolio", "Портфолио", "↗", "Добавляйте работы, меняйте обложки и ссылки. Стрелки ↑ и ↓ меняют порядок проектов."],
  ["process", "Процесс", "⌁", "Этапы идут сверху вниз. Номера и шкала автоматически подстроятся под список."],
  ["guarantees", "Гарантии", "◇", "Условия работы, которые важно знать заказчику до начала проекта."],
  ["faq", "Вопросы и ответы", "?", "Добавьте ответы на то, о чём клиенты спрашивают чаще всего."],
  ["contact", "Блок связи", "↗", "Финальное приглашение обсудить проект. Ссылка Telegram меняется в разделе «Контакты и сайт»."],
  ["site", "Контакты и сайт", "⚙", "Контакты меняются сразу во всех кнопках и ссылках. Здесь же — логотип и описание для поиска."],
  ["documents", "Документы", "▤", "Тексты публичной оферты и страницы о персональных данных."],
  ["settings", "Доступ и версии", "↶", "Смените пароль или верните предыдущую опубликованную версию."],
];
let content, version, csrf = "", currentSection = "hero", dirty = false, unpublished = false, configured = true, saving = false, uploads = 0;
let setupToken = new URLSearchParams(location.hash.slice(1)).get("setup") || "";
if (setupToken) history.replaceState(null, "", "/admin/");
let toastTimer;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").className = "toast" + (error ? " error-toast" : "");
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, error ? 9000 : 5000);
}

async function api(path, body, binary = false) {
  let response;
  try { response = await fetch("/api/admin/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : {"Content-Type": binary ? "application/octet-stream" : "application/json", "X-CSRF-Token": csrf},
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  }); } catch { throw new Error("Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз."); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error(response.status === 413 ? "Изображение слишком большое. Используйте файл до 12 МБ." : "Сервер временно недоступен. Попробуйте ещё раз через несколько секунд."); }
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие. Попробуйте ещё раз.");
  return result;
}

function get(path) { return path.split(".").reduce((value, key) => value[key], content); }
function set(path, value) {
  const keys = path.split(".");
  const key = keys.pop();
  keys.reduce((node, name) => node[name], content)[key] = value;
  dirty = true;
  updateStatus();
}
function updateStatus() {
  $("#save-state").textContent = uploads ? "Загружаем изображение…" : saving ? "Сохраняем изменения…" : dirty ? "Есть несохранённые изменения" : unpublished ? "Черновик сохранён · ещё не опубликован" : "Все изменения опубликованы";
  $("#status-dot").classList.toggle("dirty", dirty || unpublished);
  $("#publish").textContent = saving ? "Сохраняем…" : "Сохранить и опубликовать";
  for (const button of document.querySelectorAll("#publish, #preview, #draft")) button.disabled = saving || uploads > 0;
}

function field(path, label, options = {}) {
  const value = escape(get(path));
  const attrs = `data-field="${escape(path)}" id="field-${escape(path)}" ${options.required ? "required" : ""}`;
  let input;
  if (options.select) {
    input = `<select ${attrs}>${options.select.map(([key, title]) => `<option value="${escape(key)}" ${get(path) === key ? "selected" : ""}>${escape(title)}</option>`).join("")}</select>`;
  } else if (options.multiline) {
    input = `<textarea ${attrs} rows="${options.rows || 3}" maxlength="6000">${value}</textarea>`;
  } else {
    input = `<input ${attrs} type="${options.type || "text"}" value="${value}" maxlength="${options.max || 6000}" />`;
  }
  return `<label for="field-${escape(path)}">${escape(label)}${input}${options.hint ? `<span class="hint">${escape(options.hint)}</span>` : ""}</label>`;
}

function image(path, label) {
  return `<div class="image-field"><img data-image-preview="${escape(path)}" src="/${escape(get(path))}" alt="${escape(label)}" /><div class="image-actions"><label>${escape(label)}</label><label class="file-button">↑ Загрузить изображение<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="${escape(path)}" /></label><p>JPG, PNG или WebP · до 12 МБ</p></div></div>`;
}

function panel(title, html, note = "") {
  return `<section class="panel"><div class="panel-heading"><h2>${escape(title)}</h2></div>${note ? `<p class="panel-note">${escape(note)}</p>` : ""}${html}</section>`;
}
function sectionHeading(key) {
  return panel("Заголовок раздела", field(`${key}.label`, "Надпись над заголовком") + field(`${key}.title`, "Основная строка") + field(`${key}.accent`, "Строка красным"));
}

const itemTemplates = {};
function list(path, title, renderFields, addLabel, fresh = {}) {
  itemTemplates[path] = fresh;
  const items = get(path);
  return items.map((item, i) => `<section class="panel repeat-item"><div class="panel-heading"><div class="item-title"><span class="item-number">${i + 1}</span><h3>${escape(item.title || item.question || (typeof item === "string" ? item : title + " " + (i + 1)))}</h3></div><div class="item-actions"><button type="button" class="icon-button" data-move="${path}" data-index="${i}" data-direction="-1" aria-label="Переместить вверх" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="icon-button" data-move="${path}" data-index="${i}" data-direction="1" aria-label="Переместить вниз" ${i === items.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="icon-button danger" data-remove="${path}" data-index="${i}" ${items.length === 1 ? "disabled" : ""}>Удалить</button></div></div>${renderFields(`${path}.${i}`, item)}</section>`).join("") + `<button type="button" class="add-button" data-add="${path}">＋ ${escape(addLabel)}</button>`;
}

async function confirmAction(title, message) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = message;
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), {once: true}));
}

function renderEditor(scroll = false) {
  const section = sections.find(([key]) => key === currentSection);
  document.querySelectorAll("[data-section]").forEach((button) => {
    if (button.dataset.section === currentSection) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  let html = `<div class="page-intro"><span class="eyebrow">РЕДАКТОР САЙТА / ${escape(section[1].toUpperCase())}</span><h1>${escape(section[1])}</h1><p>${escape(section[3])}</p></div>`;
  if (currentSection === "hero") {
    html += panel("Заголовок и описание", field("hero.label", "Надпись над заголовком") + field("hero.title", "Начало заголовка") + field("hero.accent", "Акцент красным") + field("hero.continuation", "Продолжение на следующей строке") + field("hero.description", "Короткое описание", {multiline: true}) + `<div class="field-row">${field("hero.button", "Главная кнопка")}${field("hero.secondary", "Кнопка портфолио")}</div>`);
    html += panel("Ваша карточка", image("hero.photo", "Ваше фото") + field("site.name", "Имя") + field("site.role", "Кто вы и чем занимаетесь"));
    html += `<h2>Цифры под первым экраном</h2>` + list("hero.metrics", "Показатель", (p) => `<div class="field-row">${field(p + ".value", "Значение")}${field(p + ".label", "Подпись", {multiline: true, rows: 2})}</div>`, "Добавить показатель", {value: "", label: ""});
    html += `<h2>Бегущая строка</h2>` + panel("Направления работы", fieldWords());
  } else if (currentSection === "services") {
    html += sectionHeading("services") + list("services.items", "Услуга", (p) => field(p + ".title", "Название услуги") + field(p + ".description", "Описание", {multiline: true}), "Добавить услугу", {title: "Новая услуга", description: ""});
  } else if (currentSection === "portfolio") {
    html += sectionHeading("portfolio") + list("portfolio.items", "Проект", (p) => image(p + ".image", "Обложка проекта") + `<div class="field-row">${field(p + ".title", "Название проекта")}${field(p + ".category", "Сфера бизнеса")}</div>` + field(p + ".url", "Ссылка на сайт", {type: "url", hint: "Полный адрес, например https://example.ru"}) + field(p + ".description", "Описание проекта", {multiline: true}) + field(p + ".status", "Надпись на обложке"), "Добавить проект", {title: "Новый проект", category: "", description: "", url: "https://example.ru", status: "Демонстрационный проект"});
    html += panel("Кнопка под работами", field("portfolio.button", "Текст кнопки"));
  } else if (currentSection === "process") {
    html += sectionHeading("process") + list("process.items", "Этап", (p) => field(p + ".label", "Короткая подпись над названием") + field(p + ".title", "Название этапа") + field(p + ".description", "Что происходит на этапе", {multiline: true}) + image(p + ".image", "Иллюстрация этапа"), "Добавить этап", {title: "Новый этап", label: "", description: ""});
  } else if (currentSection === "guarantees") {
    html += sectionHeading("guarantees") + list("guarantees.items", "Гарантия", (p) => field(p + ".title", "Заголовок") + field(p + ".description", "Описание", {multiline: true}) + image(p + ".image", "Иконка"), "Добавить гарантию", {title: "Новая гарантия", description: ""});
  } else if (currentSection === "faq") {
    html += sectionHeading("faq") + panel("Подсказка посетителю", field("faq.description", "Текст под заголовком", {multiline: true})) + list("faq.items", "Вопрос", (p) => field(p + ".question", "Вопрос") + field(p + ".answer", "Ответ", {multiline: true}), "Добавить вопрос", {question: "Новый вопрос", answer: ""});
  } else if (currentSection === "contact") {
    html += panel("Приглашение к диалогу", field("contact.title", "Основная строка") + field("contact.accent", "Строка красным") + field("contact.description", "Описание", {multiline: true}) + field("contact.button", "Текст кнопки Telegram") + field("contact.response", "Подпись под кнопкой"));
  } else if (currentSection === "site") {
    html += panel("Связь с вами", field("site.telegram", "Имя в Telegram", {hint: "Без @ и без ссылки. Обновится во всех кнопках сайта."}) + `<div class="field-row">${field("site.email", "Электронная почта", {type: "email"})}${field("site.phone", "Телефон", {type: "tel"})}</div>`);
    html += panel("Логотип и подвал", image("site.logo", "Логотип в шапке и подвале") + image("site.favicon", "Иконка вкладки браузера") + field("site.footer", "Короткое описание внизу сайта", {multiline: true}));
    html += panel("Вкладка и поиск", field("site.title", "Название вкладки браузера") + field("site.description", "Описание сайта для поиска", {multiline: true, hint: "Одно-два предложения. Этот же текст используется в описании ссылки при отправке."}));
  } else if (currentSection === "agent") {
    html += sectionHeading("agent") + panel("Описание возможностей", field("agent.description", "Описание", {multiline: true}));
    html += list("agent.benefits", "Преимущество", (p) => `<div class="field-row">${field(p + ".value", "Крупная надпись")}${field(p + ".label", "Подпись")}</div>`, "Добавить преимущество", {value: "", label: ""});
    html += panel("Шапка чата", `<div class="field-row">${field("agent.chatTitle", "Имя AI-агента")}${field("agent.brand", "Название компании")}</div>`);
    html += `<h2>Сценарий диалога</h2>` + list("agent.messages", "Сообщение", (p) => `<div class="field-row">${field(p + ".speaker", "Кто пишет", {select: [["bot", "AI-агент"], ["client", "Клиент"], ["success", "AI-агент: подтверждение записи"]]})}${field(p + ".time", "Время в сообщении")}</div>` + field(p + ".text", "Текст сообщения", {multiline: true}), "Добавить сообщение", {speaker: "bot", text: "", time: "14:05"});
  } else if (currentSection === "documents") {
    for (const [key, title] of [["offer", "Публичная оферта"], ["privacy", "Персональные данные"]]) {
      const p = "documents." + key;
      html += panel(title, field(p + ".title", "Заголовок документа") + field(p + ".intro", "Вступление", {multiline: true}) + field(p + ".updated", "Дата обновления"));
      html += list(p + ".sections", "Пункт документа", (q) => field(q + ".title", "Заголовок пункта") + field(q + ".text", "Текст", {multiline: true, rows: 5}), "Добавить пункт документа", {title: "Новый пункт", text: ""});
    }
  } else if (currentSection === "settings") {
    html += panel("Ваш сеанс", '<p class="panel-note">Если пользуетесь чужим устройством, выйдите после редактирования.</p><button type="button" class="button quiet" data-logout>Выйти из админки</button>');
    html += panel("Изменить пароль", `<form id="password-form" class="password-grid"><label>Текущий пароль<input name="current" type="password" autocomplete="current-password" required maxlength="128" /></label><label>Новый пароль<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" /><span class="hint">От 12 символов. Например, несколько слов, которые легко запомнить.</span></label><label>Повторите новый пароль<input name="confirm" type="password" autocomplete="new-password" required maxlength="128" /></label><button class="button quiet" type="submit">Изменить пароль</button></form>`);
    html += panel("Предыдущие версии", `<p class="panel-note">Перед каждой публикацией сохраняется предыдущая версия. Восстановление откроет её как черновик: вы сможете проверить результат и опубликовать.</p><div id="history-list">Загружаем версии…</div>`);
  }
  $("#editor").innerHTML = html;
  if (scroll) window.scrollTo({top: 0, behavior: "instant"});
  if (currentSection === "settings") loadHistory();
}

function fieldWords() {
  return `<label>По одному направлению в строке<textarea rows="8" data-words>${escape(content.hero.words.join("\n"))}</textarea><span class="hint">Разделители и бесконечное движение добавятся автоматически.</span></label>`;
}

async function loadHistory() {
  try {
    const result = await api("history");
    if (!$("#history-list")) return;
    $("#history-list").innerHTML = result.items.length ? result.items.map((item) => `<div class="history-row"><p>Версия до публикации<br /><b>${escape(new Date(item.created * 1000).toLocaleString("ru-RU"))}</b></p><button type="button" class="button quiet" data-restore="${item.id}">Открыть как черновик</button></div>`).join("") : '<p>Здесь появятся версии после первого изменения и публикации.</p>';
  } catch (error) { toast(error.message, true); }
}

async function save(publish = false) {
  if (uploads) { toast("Дождитесь окончания загрузки изображения."); return false; }
  if (saving) return false;
  saving = true;
  updateStatus();
  try {
    const result = await api(publish ? "publish" : "draft", {content, version});
    version = result.version;
    unpublished = result.unpublished;
    dirty = false;
    toast(publish ? "Готово! Изменения уже видны на сайте." : "Черновик сохранён. Посетители пока видят прежнюю версию.");
    return true;
  } catch (error) { toast(error.message, true); return false; }
  finally { saving = false; updateStatus(); }
}

async function startEditor() {
  const result = await api("content");
  content = result.content;
  version = result.version;
  unpublished = result.unpublished;
  $("#auth").hidden = true;
  $("#loading").hidden = true;
  $("#app").hidden = false;
  $("#section-nav").innerHTML = sections.map(([key, label, icon]) => `<button type="button" data-section="${key}"><span class="nav-icon" aria-hidden="true">${icon}</span>${escape(label)}</button>`).join("");
  renderEditor();
  updateStatus();
}

$("#section-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-section]");
  if (!button) return;
  currentSection = button.dataset.section;
  renderEditor(true);
});

$("#editor").addEventListener("input", (event) => {
  if (event.target.matches("[data-field]")) set(event.target.dataset.field, event.target.value);
  if (event.target.matches("[data-words]")) set("hero.words", event.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
});

$("#editor").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-upload]");
  if (!input || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 12 * 1024 * 1024) { input.value = ""; return toast("Выберите изображение до 12 МБ.", true); }
  input.disabled = true;
  uploads += 1;
  updateStatus();
  const label = input.closest(".file-button");
  label.classList.add("saving");
  try {
    const result = await api("upload", file, true);
    set(input.dataset.upload, result.path);
    const imageElement = [...document.querySelectorAll("[data-image-preview]")].find((n) => n.dataset.imagePreview === input.dataset.upload);
    if (imageElement) imageElement.src = "/" + result.path;
    toast("Изображение загружено. Опубликуйте, когда будете готовы.");
  } catch (error) { toast(error.message, true); }
  finally { input.disabled = false; input.value = ""; label.classList.remove("saving"); uploads -= 1; updateStatus(); }
});

$("#editor").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (uploads) return toast("Дождитесь окончания загрузки изображения.");
  if (button.hasAttribute("data-logout")) return logout();
  if (button.dataset.add) {
    const path = button.dataset.add;
    const items = get(path);
    if (items.length >= (path.endsWith("messages") ? 60 : 30)) return toast("Достигнут максимум элементов.", true);
    const sample = typeof items[0] === "object" ? structuredClone(items[0]) : "";
    const next = typeof sample === "object" ? {...sample, ...itemTemplates[path]} : "";
    set(path, [...items, next]);
    renderEditor();
    const add = [...document.querySelectorAll("[data-add]")].find((n) => n.dataset.add === path);
    add?.previousElementSibling?.scrollIntoView({behavior: "smooth", block: "center"});
  } else if (button.dataset.move) {
    const path = button.dataset.move;
    const items = [...get(path)], index = Number(button.dataset.index), next = index + Number(button.dataset.direction);
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    set(path, items);
    renderEditor();
  } else if (button.dataset.remove) {
    const path = button.dataset.remove, items = [...get(path)], index = Number(button.dataset.index);
    if (items.length <= 1) return;
    if (!await confirmAction("Удалить этот элемент?", "Он исчезнет из редактора. На сайте изменения появятся только после публикации.")) return;
    items.splice(index, 1);
    set(path, items);
    renderEditor();
  } else if (button.dataset.restore) {
    if (!await confirmAction("Открыть предыдущую версию?", "Текущий черновик будет заменён. Опубликованный сайт останется прежним до вашего решения о публикации.")) return;
    try {
      const result = await api("restore", {id: Number(button.dataset.restore), version});
      content = result.content; version = result.version; dirty = false; unpublished = result.unpublished;
      updateStatus(); toast("Версия открыта как черновик. Проверьте её через предпросмотр.");
    } catch (error) { toast(error.message, true); }
  }
});

$("#editor").addEventListener("submit", async (event) => {
  if (event.target.id !== "password-form") return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  if (values.password !== values.confirm) return toast("Новые пароли не совпадают.", true);
  const button = event.target.querySelector("button");
  button.disabled = true;
  try { const result = await api("password", values); csrf = result.csrf; event.target.reset(); toast("Пароль изменён. Остальные сеансы завершены."); }
  catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

$("#publish").addEventListener("click", () => save(true));
$("#draft").addEventListener("click", () => save(false));
$("#preview").addEventListener("click", async () => {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  if (dirty && !await save(false)) { tab?.close(); return; }
  if (tab) tab.location = "/admin/preview";
  else toast("Разрешите открытие новой вкладки для предпросмотра.", true);
});
async function logout() {
  if (dirty && !await save(false)) return;
  try { await api("logout", {}); dirty = false; location.reload(); }
  catch (error) { toast(error.message, true); }
}
$("#logout").addEventListener("click", logout);
window.addEventListener("beforeunload", (event) => { if (dirty || uploads) { event.preventDefault(); event.returnValue = ""; } });

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#auth-error").textContent = "";
  const password = $("#password").value;
  if (!configured && password !== $("#password-confirm").value) { $("#auth-error").textContent = "Пароли не совпадают."; return; }
  $("#login-button").disabled = true;
  try {
    const result = await api(configured ? "login" : "setup", {password, token: setupToken || $("#setup-token").value});
    csrf = result.csrf;
    setupToken = "";
    $("#auth-form").reset();
    await startEditor();
  } catch (error) { $("#auth-error").textContent = error.message; }
  finally { $("#login-button").disabled = false; }
});

(async () => {
  try {
    const state = await api("session");
    configured = state.configured;
    csrf = state.csrf;
    if (state.authenticated) return await startEditor();
    $("#loading").hidden = true;
    $("#auth").hidden = false;
    if (!configured) {
      $("#auth-title").textContent = "Создайте свой пароль";
      $("#auth-description").textContent = "Это первый вход. Придумайте пароль от 12 символов — дальше входить будете только по нему.";
      $("#confirm-label").hidden = false;
      $("#setup-token-label").hidden = !!setupToken;
      $("#password").minLength = 12;
      $("#password").autocomplete = "new-password";
      $("#password-confirm").required = true;
      $("#login-button").textContent = "Создать пароль и войти";
    }
  } catch (error) { $("#loading").textContent = "Не удалось открыть редактор. Обновите страницу через несколько секунд."; }
})();
