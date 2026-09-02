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
let scrollTicking = false;

function updateScrollUI() {
  const currentScroll = window.scrollY;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const percentage = maxScroll > 0 ? (currentScroll / maxScroll) * 100 : 0;

  progress.style.width = `${percentage}%`;

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

window.addEventListener("scroll", updateCurrentSection, { passive: true });
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
  let started = false;
  let conversationRun = 0;

  const pause = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));

  const scrollConversation = () => {
    requestAnimationFrame(() => {
      bodyElement.scrollTo({ top: bodyElement.scrollHeight, behavior: "smooth" });
    });
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
    hideTyping();
    await typeBotMessage(0, runId);
    await pause(750);
    showMessage(1);

    const turns = [[2, 3], [4, 5], [6, 7], [8, 9]];
    for (const [botIndex, clientIndex] of turns) {
      await pause(850);
      showTyping();
      await pause(650);
      hideTyping();
      await typeBotMessage(botIndex, runId);
      await pause(750);
      showMessage(clientIndex);
    }

    await pause(850);
    showTyping();
    await pause(700);
    hideTyping();
    await typeBotMessage(10, runId);
    await pause(4500);
    if (runId === conversationRun) playConversation();
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

// The moving journey point activates each milestone when it reaches the node.
document.querySelectorAll(".journey").forEach((journey) => {
  const steps = [...journey.querySelectorAll(".journey-step")];
  if (!steps.length) return;

  const finalHoldDuration = 1500;
  const travelDuration = 1300;
  const travelDistance = steps.length - 1;
  const totalTravelDuration = travelDistance * travelDuration;
  const cycleDuration = totalTravelDuration + finalHoldDuration;
  let animationFrame = 0;
  let cycleStartedAt = 0;
  let activeIndex = -2;
  let nodePositions = [];
  let nodeHitRadii = [];
  let lastStepPosition = 0;

  const setActiveStep = (index) => {
    if (index === activeIndex) return;
    activeIndex = index;
    steps.forEach((step, stepIndex) => step.classList.toggle("is-active", stepIndex === index));
  };

  const refreshJourneyGeometry = () => {
    const verticalJourney = window.matchMedia("(max-width: 1000px)").matches;
    const journeyRect = journey.getBoundingClientRect();
    const centers = steps.map((step) => {
      const nodeRect = step.querySelector(".journey-node").getBoundingClientRect();
      return verticalJourney
        ? nodeRect.top + nodeRect.height / 2 - journeyRect.top
        : nodeRect.left + nodeRect.width / 2;
    });
    nodeHitRadii = steps.map((step) => step.querySelector(".journey-node").getBoundingClientRect().width / 2);

    if (verticalJourney) {
      const lineStart = centers[0];
      const lineLength = centers.at(-1) - lineStart;
      journey.style.setProperty("--journey-line-start", `${lineStart}px`);
      journey.style.setProperty("--journey-line-length", `${lineLength}px`);
      nodePositions = centers.map((center) => center - lineStart);
    } else {
      const lineRect = journey.querySelector(".journey-line").getBoundingClientRect();
      journey.style.removeProperty("--journey-line-start");
      journey.style.removeProperty("--journey-line-length");
      nodePositions = centers.map((center) => center - lineRect.left);
    }
  };

  const setProgress = (stepPosition) => {
    if (!nodePositions.length) refreshJourneyGeometry();
    lastStepPosition = stepPosition;
    const lowerIndex = Math.min(Math.floor(stepPosition), steps.length - 1);
    const upperIndex = Math.min(lowerIndex + 1, steps.length - 1);
    const fraction = stepPosition - lowerIndex;
    const pointPosition = nodePositions[lowerIndex] + (nodePositions[upperIndex] - nodePositions[lowerIndex]) * fraction;
    journey.style.setProperty("--journey-progress", `${pointPosition}px`);
    return pointPosition;
  };

  const renderJourney = (now) => {
    if (!cycleStartedAt) cycleStartedAt = now;
    const elapsed = (now - cycleStartedAt) % cycleDuration;
    const stepPosition = elapsed < totalTravelDuration
      ? elapsed / travelDuration
      : steps.length - 1;

    const pointPosition = setProgress(stepPosition);
    const nextActiveIndex = nodePositions.findIndex(
      (nodePosition, index) => Math.abs(nodePosition - pointPosition) <= nodeHitRadii[index],
    );
    setActiveStep(nextActiveIndex);
    animationFrame = window.requestAnimationFrame(renderJourney);
  };

  const startJourney = () => {
    window.cancelAnimationFrame(animationFrame);
    cycleStartedAt = 0;
    refreshJourneyGeometry();
    setProgress(0);
    setActiveStep(0);
    animationFrame = window.requestAnimationFrame(renderJourney);
  };

  const stopJourney = () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };

  if (reduceMotion || doc.classList.contains("qa-mode")) {
    refreshJourneyGeometry();
    setProgress(0);
    setActiveStep(0);
    return;
  }

  if ("IntersectionObserver" in window) {
    const journeyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) startJourney();
          else stopJourney();
        });
      },
      { threshold: 0.22 },
    );
    journeyObserver.observe(journey);
  } else {
    startJourney();
  }

  window.addEventListener(
    "resize",
    () => {
      refreshJourneyGeometry();
      setProgress(lastStepPosition);
    },
    { passive: true },
  );
});

// Lightweight project estimate: transparent starting point, not a binding quote.
document.querySelectorAll("[data-cost-calculator]").forEach((calculator) => {
  const range = calculator.querySelector("#calc-blocks");
  const blockCount = calculator.querySelector("[data-block-count]");
  const total = calculator.querySelector("[data-calc-total]");
  const link = calculator.querySelector("[data-calc-link]");
  const options = [...calculator.querySelectorAll("[data-calc-option]")];
  const designOptions = [...calculator.querySelectorAll("[data-calc-design]")];
  const formatPrice = new Intl.NumberFormat("ru-RU").format;

  const updateEstimate = () => {
    const blocks = Number(range.value);
    const selectedDesign = designOptions.find((option) => option.checked);
    const designPrice = Number(selectedDesign?.dataset.price || 0);
    const optionTotal = options.reduce(
      (sum, option) => sum + (option.checked ? Number(option.dataset.price) : 0),
      0,
    );
    const estimatedPrice = 4900 + Math.max(0, blocks - 5) * 2700 + designPrice + optionTotal;
    const progressValue = ((blocks - Number(range.min)) / (Number(range.max) - Number(range.min))) * 100;
    const chosenOptions = options.filter((option) => option.checked).map((option) => option.value);
    const message = [
      "Здравствуйте, Николай. Хочу уточнить стоимость проекта.",
      `Блоков: ${blocks}.`,
      `Дизайн: ${selectedDesign?.value || "Готовый дизайн"}.`,
      chosenOptions.length ? `Дополнительно: ${chosenOptions.join(", ")}.` : "Без дополнительных опций.",
      `Предварительная оценка на сайте: от ${formatPrice(estimatedPrice)} ₽.`,
    ].join(" ");

    blockCount.textContent = String(blocks);
    total.textContent = `от ${formatPrice(estimatedPrice)} ₽`;
    range.style.setProperty("--range-progress", `${progressValue}%`);
    link.href = `https://t.me/sh3r3r?text=${encodeURIComponent(message)}`;
  };

  range.addEventListener("input", updateEstimate);
  designOptions.forEach((option) => option.addEventListener("change", updateEstimate));
  options.forEach((option) => option.addEventListener("change", updateEstimate));
  updateEstimate();
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
