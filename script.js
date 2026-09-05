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
revealItems.forEach((item) => item.addEventListener("animationend", (event) => {
  if (event.target === item && event.animationName === "reveal-in") item.classList.add("is-settled");
}));

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
let scrollTicking = false;

function updateScrollUI() {
  const currentScroll = window.scrollY;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const percentage = maxScroll > 0 ? (currentScroll / maxScroll) * 100 : 0;

  progress.style.transform = `scaleX(${percentage / 100})`;

  header.classList.remove("is-hidden");
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

const updateCurrentSection = () => {
  const marker = window.innerHeight * 0.34;
  const currentSection = linkedSections.find((section) => {
    const rect = section.getBoundingClientRect();
    return rect.top <= marker && rect.bottom > marker;
  });

  if (!currentSection) return;
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${currentSection.id}`);
  });
};

let sectionTicking = false;
window.addEventListener("scroll", () => {
  if (sectionTicking || window.innerWidth <= 900) return;
  sectionTicking = true;
  requestAnimationFrame(() => {
    updateCurrentSection();
    sectionTicking = false;
  });
}, { passive: true });
updateCurrentSection();

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
  const messageBlueprints = messages.map((message) => message.innerHTML);
  let inViewport = false;
  let running = false;
  let conversationRun = 0;
  let pendingScroll = 0;
  let lastScrollAt = 0;
  let lastScrollHeight = 0;

  const pause = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));

  const scrollConversation = () => {
    if (!running || pendingScroll) return;
    pendingScroll = window.setTimeout(() => {
      pendingScroll = 0;
      if (!running) return;
      const height = bodyElement.scrollHeight;
      if (height !== lastScrollHeight) {
        bodyElement.scrollTop = height;
        lastScrollHeight = height;
      }
      lastScrollAt = performance.now();
    }, Math.max(0, 120 - (performance.now() - lastScrollAt)));
  };

  const showMessage = (index) => {
    messages[index]?.classList.add("is-visible");
    scrollConversation();
  };

  const showTyping = () => {
    if (!typing) return;
    bodyElement.append(typing);
    typing.classList.add("is-visible");
    scrollConversation();
  };

  const hideTyping = () => typing?.classList.remove("is-visible");

  const resetConversation = () => {
    messages.forEach((message, index) => {
      message.innerHTML = messageBlueprints[index];
      message.classList.remove("is-visible", "is-typing-message");
    });
    typing?.classList.remove("is-visible");
    bodyElement.scrollTop = 0;
    lastScrollHeight = 0;
  };

  const typeBotMessage = async (index, runId) => {
    const message = messages[index];
    if (!message || runId !== conversationRun) return;

    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!node.nodeValue?.trim() || !parent || parent.closest("time, .agent-success-icon")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
    textNodes.forEach(({ node }) => { node.nodeValue = ""; });

    message.classList.add("is-visible", "is-typing-message");
    scrollConversation();

    for (const { node, text } of textNodes) {
      for (const character of text) {
        if (runId !== conversationRun) return;
        node.nodeValue += character;
        if (character.trim()) scrollConversation();
        const delay = /[.!?—,:]/.test(character) ? 52 : character === " " ? 10 : 21;
        await pause(delay);
      }
    }

    message.classList.remove("is-typing-message");
  };

  const playConversation = async () => {
    const runId = ++conversationRun;
    resetConversation();

    showTyping();
    await pause(650);
    if (runId !== conversationRun) return;
    hideTyping();
    await typeBotMessage(0, runId);
    await pause(750);
    if (runId !== conversationRun) return;
    showMessage(1);

    const turns = [[2, 3], [4, 5], [6, 7], [8, 9]];
    for (const [botIndex, clientIndex] of turns) {
      await pause(850);
      if (runId !== conversationRun) return;
      showTyping();
      await pause(650);
      if (runId !== conversationRun) return;
      hideTyping();
      await typeBotMessage(botIndex, runId);
      await pause(750);
      if (runId !== conversationRun) return;
      showMessage(clientIndex);
    }

    await pause(850);
    if (runId !== conversationRun) return;
    showTyping();
    await pause(700);
    if (runId !== conversationRun) return;
    hideTyping();
    await typeBotMessage(10, runId);
    await pause(4500);
    if (runId === conversationRun) playConversation();
  };

  if (reduceMotion) {
    messages.forEach((message) => message.classList.add("is-visible"));
    return;
  }

  const syncConversation = () => {
    const shouldRun = inViewport && !document.hidden;
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      playConversation();
    } else {
      conversationRun += 1;
      clearTimeout(pendingScroll);
      pendingScroll = 0;
      hideTyping();
    }
  };
  document.addEventListener("visibilitychange", syncConversation);

  if ("IntersectionObserver" in window) {
    const chatObserver = new IntersectionObserver(
      (entries) => {
        inViewport = entries.some((entry) => entry.isIntersecting);
        syncConversation();
      },
      { threshold: 0.3 },
    );
    chatObserver.observe(chat);
  } else {
    inViewport = true;
    syncConversation();
  }
});

// Scroll-driven process: the rail follows the viewport and activates each passed stage.
document.querySelectorAll("[data-scroll-process]").forEach((process) => {
  const stages = [...process.querySelectorAll("[data-process-stage]")];
  const rail = process.querySelector(".scroll-process-rail");
  if (!stages.length || !rail) return;

  let nodePositions = [];
  let railStart = 0;
  let railLength = 1;
  let frame = 0;

  const measure = () => {
    nodePositions = stages.map((stage) => {
      const node = stage.querySelector(".scroll-process-node");
      return stage.offsetTop + node.offsetTop + node.offsetHeight / 2;
    });
    railStart = nodePositions[0];
    railLength = Math.max(1, nodePositions.at(-1) - railStart);
    process.style.setProperty("--process-rail-start", `${railStart}px`);
    process.style.setProperty("--process-rail-length", `${railLength}px`);
  };

  const render = () => {
    frame = 0;
    if (!nodePositions.length) measure();

    const processRect = process.getBoundingClientRect();
    const triggerY = window.innerHeight * (window.innerWidth <= 760 ? 0.58 : 0.54);
    const rawCursorPosition = triggerY - processRect.top;
    const cursorPosition = Math.min(
      railStart + railLength,
      Math.max(railStart, rawCursorPosition),
    );
    const started = rawCursorPosition >= railStart;
    const progressValue = (cursorPosition - railStart) / railLength;
    process.classList.toggle("is-started", started);
    process.style.setProperty("--process-progress", progressValue.toFixed(4));
    process.style.setProperty("--process-fill", `${cursorPosition - railStart}px`);

    let currentIndex = -1;
    nodePositions.forEach((position, index) => {
      const reached = started && cursorPosition >= position - 1;
      stages[index].classList.toggle("is-reached", reached);
      if (reached) currentIndex = index;
    });
    stages.forEach((stage, index) => {
      const current = index === currentIndex;
      stage.classList.toggle("is-current", current);
      if (current) stage.setAttribute("aria-current", "step");
      else stage.removeAttribute("aria-current");
    });
  };

  const requestRender = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(render);
  };

  const refresh = () => {
    nodePositions = [];
    measure();
    requestRender();
  };

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  document.fonts?.ready.then(refresh);
  refresh();
});

// Smooth FAQ disclosure without changing native keyboard semantics.
document.querySelectorAll(".faq-list details").forEach((details) => {
  const summary = details.querySelector("summary");
  if (!summary) return;

  let faqAnimation = null;

  summary.addEventListener("click", (event) => {
    event.preventDefault();

    const opening = !details.open || details.classList.contains("is-closing");
    const startHeight = details.getBoundingClientRect().height;
    faqAnimation?.cancel();

    if (opening) {
      details.open = true;
      details.classList.remove("is-closing");
    } else {
      details.classList.add("is-closing");
    }

    const endHeight = opening ? details.scrollHeight : summary.getBoundingClientRect().height;
    if (reduceMotion) {
      if (!opening) details.open = false;
      details.classList.remove("is-closing");
      return;
    }

    faqAnimation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 420, easing: "cubic-bezier(.22,.8,.2,1)" },
    );

    faqAnimation.onfinish = () => {
      if (!opening) details.open = false;
      details.classList.remove("is-closing");
      faqAnimation = null;
    };
  });
});

// Off-screen marquees do not need an active compositor animation.
if ("IntersectionObserver" in window) {
  document.querySelectorAll(".marquee-track").forEach((track) => {
    let visible = false;
    const sync = () => { track.style.animationPlayState = visible && !document.hidden ? "running" : "paused"; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(track.closest(".marquee"));
    document.addEventListener("visibilitychange", sync);
    sync();
  });
}

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
