const doc = document.documentElement;
const body = document.body;
const header = document.querySelector("[data-header]");
const progress = document.querySelector(".page-progress span");
const menuButton = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");
const navLinks = [...document.querySelectorAll('.desktop-nav a[href^="#"]')];

if (new URLSearchParams(window.location.search).has("qa")) {
  doc.classList.add("qa-mode");
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();

// Reveal content as it enters the viewport.
const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px 6% 0px" },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

// Scroll progress and a calm hide/reveal header pattern.
let previousScroll = window.scrollY;
let scrollTicking = false;

function updateScrollUI() {
  const currentScroll = window.scrollY;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const percentage = maxScroll > 0 ? (currentScroll / maxScroll) * 100 : 0;

  progress.style.width = `${percentage}%`;

  if (!body.classList.contains("menu-open")) {
    const goingDown = currentScroll > previousScroll;
    header.classList.toggle("is-hidden", goingDown && currentScroll > 240);
  }

  previousScroll = currentScroll;
  scrollTicking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollUI);
  },
  { passive: true },
);

updateScrollUI();

// Mobile menu.
function closeMenu() {
  menuButton.classList.remove("active");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Открыть меню");
  mobileMenu.classList.remove("open");
  mobileMenu.setAttribute("aria-hidden", "true");
  body.classList.remove("menu-open");
}

menuButton.addEventListener("click", () => {
  const isOpen = !mobileMenu.classList.contains("open");
  menuButton.classList.toggle("active", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  mobileMenu.classList.toggle("open", isOpen);
  mobileMenu.setAttribute("aria-hidden", String(!isOpen));
  body.classList.toggle("menu-open", isOpen);
  header.classList.remove("is-hidden");
});

mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) closeMenu();
});

// Current section state in desktop navigation.
const linkedSections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
      });
    },
    { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.1, 0.3] },
  );

  linkedSections.forEach((section) => sectionObserver.observe(section));
}

// Animated numbers.
const counters = document.querySelectorAll("[data-counter]");

function animateCounter(element) {
  const target = Number(element.dataset.counter);
  const startTime = performance.now();
  const duration = 1500;

  function frame(now) {
    const progressValue = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progressValue, 4);
    element.textContent = Math.round(target * eased);
    if (progressValue < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if ("IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.5 },
  );
  counters.forEach((counter) => counterObserver.observe(counter));
} else {
  counters.forEach((counter) => {
    counter.textContent = counter.dataset.counter;
  });
}

// Fine-pointer effects only: background spotlight, restrained 3D tilt and magnetic CTAs.
const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Looping AI-agent conversation demo.
document.querySelectorAll("[data-agent-chat]").forEach((chat) => {
  const messages = [...chat.querySelectorAll("[data-chat-item]")];
  const typing = chat.querySelector("[data-chat-typing]");
  const bodyElement = chat.querySelector(".agent-chat-body");
  let timers = [];
  let started = false;

  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  };

  const showMessage = (index) => {
    messages[index]?.classList.add("is-visible");
    requestAnimationFrame(() => {
      bodyElement.scrollTo({ top: bodyElement.scrollHeight, behavior: "smooth" });
    });
  };

  const schedule = (callback, delay) => {
    timers.push(window.setTimeout(callback, delay));
  };

  const playConversation = () => {
    clearTimers();
    messages.forEach((message) => message.classList.remove("is-visible"));
    typing?.classList.remove("is-visible");
    bodyElement.scrollTop = 0;

    showMessage(0);
    schedule(() => showMessage(1), 1600);
    schedule(() => typing?.classList.add("is-visible"), 2550);
    schedule(() => typing?.classList.remove("is-visible"), 3450);
    schedule(() => showMessage(2), 3500);
    schedule(() => showMessage(3), 5350);
    schedule(() => typing?.classList.add("is-visible"), 6250);
    schedule(() => typing?.classList.remove("is-visible"), 7100);
    schedule(() => showMessage(4), 7150);
    schedule(playConversation, 12200);
  };

  if (reduceMotion) {
    messages.forEach((message) => message.classList.add("is-visible"));
    return;
  }

  if ("IntersectionObserver" in window) {
    const chatObserver = new IntersectionObserver(
      (entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting) || started) return;
        started = true;
        playConversation();
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    chatObserver.observe(chat);
  } else {
    playConversation();
  }
});

if (hasFinePointer && !reduceMotion) {
  const cursorGlow = document.querySelector(".cursor-glow");
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let glowX = pointerX;
  let glowY = pointerY;

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { passive: true },
  );

  function animateGlow() {
    glowX += (pointerX - glowX) * 0.09;
    glowY += (pointerY - glowY) * 0.09;
    cursorGlow.style.left = `${glowX}px`;
    cursorGlow.style.top = `${glowY}px`;
    requestAnimationFrame(animateGlow);
  }

  animateGlow();

  document.querySelectorAll("[data-portrait-tilt]").forEach((portrait) => {
    portrait.addEventListener("pointermove", (event) => {
      const rect = portrait.getBoundingClientRect();
      const localX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const localY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const tiltX = (0.5 - localY) * 5.5;
      const tiltY = (localX - 0.5) * 7;
      const tiltStrength = Math.min(1, Math.hypot(localX - 0.5, localY - 0.5) * 2);
      const sheenX = (localX - 0.5) * 44;
      const sheenY = (localY - 0.5) * 8;
      const sheenAngle = (localY - 0.5) * 5;
      const sheenOpacity = 0.18 + tiltStrength * 0.58;

      portrait.style.setProperty("--portrait-rx", `${tiltX}deg`);
      portrait.style.setProperty("--portrait-ry", `${tiltY}deg`);
      portrait.style.setProperty("--portrait-sheen-x", `${sheenX}%`);
      portrait.style.setProperty("--portrait-sheen-y", `${sheenY}%`);
      portrait.style.setProperty("--portrait-sheen-angle", `${sheenAngle}deg`);
      portrait.style.setProperty("--portrait-sheen-opacity", sheenOpacity.toFixed(2));
    });

    portrait.addEventListener("pointerleave", () => {
      portrait.style.setProperty("--portrait-rx", "0deg");
      portrait.style.setProperty("--portrait-ry", "0deg");
      portrait.style.setProperty("--portrait-sheen-x", "0%");
      portrait.style.setProperty("--portrait-sheen-y", "0%");
      portrait.style.setProperty("--portrait-sheen-angle", "0deg");
      portrait.style.setProperty("--portrait-sheen-opacity", "0.18");
    });
  });

  document.querySelectorAll(".magnetic").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      element.style.transform = `translate(${x * 0.08}px, ${y * 0.12}px)`;
    });

    element.addEventListener("pointerleave", () => {
      element.style.transform = "";
    });
  });
}
