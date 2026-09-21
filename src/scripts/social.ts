import {
  addGuestMessage,
  addHoneymoonSuggestion,
  honeymoonPhotoUrl,
  loadSocialFeed,
  uploadHoneymoonPhoto,
  type GuestMessage,
  type HoneymoonSuggestion,
} from "../lib/guest-service";

const root = document.querySelector<HTMLElement>("[data-social-app]");
const messageCarousel = root?.querySelector<HTMLElement>("[data-message-carousel]");
const suggestionCarousel = root?.querySelector<HTMLElement>("[data-suggestion-carousel]");
const messageDots = root?.querySelector<HTMLElement>("[data-message-dots]");
const suggestionDots = root?.querySelector<HTMLElement>("[data-suggestion-dots]");
const status = root?.querySelector<HTMLElement>("[data-social-status]");
const messageDialog = document.querySelector<HTMLDialogElement>("[data-message-dialog]");
const suggestionDialog = document.querySelector<HTMLDialogElement>("[data-suggestion-dialog]");
const messageForm = document.querySelector<HTMLFormElement>("[data-message-form]");
const suggestionForm = document.querySelector<HTMLFormElement>("[data-suggestion-form]");
let loading = false;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function setStatus(text: string, tone: "success" | "error" | "info" = "info") {
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
  status.hidden = !text;
}

function emptyCard(title: string, copy: string) {
  const article = document.createElement("article");
  article.className = "social-empty-card";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const p = document.createElement("p");
  p.textContent = copy;
  article.append(heading, p);
  return article;
}

function renderMessages(messages: GuestMessage[]) {
  if (!messageCarousel) return;
  if (!messages.length) {
    messageCarousel.replaceChildren(emptyCard("Be the first to leave a message", "Your note will appear here for everyone on the guest site."));
    rebuildDots(messageCarousel, messageDots);
    return;
  }
  messageCarousel.replaceChildren(...messages.map((item) => {
    const card = document.createElement("article");
    card.className = "message-card";
    const head = document.createElement("div");
    head.className = "message-card__head";
    const avatar = document.createElement("span");
    avatar.className = "social-avatar";
    avatar.textContent = initials(item.author_name);
    const meta = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.author_name;
    const date = document.createElement("small");
    date.textContent = dateLabel(item.created_at);
    meta.append(name, date);
    head.append(avatar, meta);
    const copy = document.createElement("p");
    copy.textContent = item.message;
    const heart = document.createElement("span");
    heart.className = "message-card__heart";
    heart.textContent = "♡";
    card.append(head, copy, heart);
    return card;
  }));
  rebuildDots(messageCarousel, messageDots);
}

function renderSuggestions(items: HoneymoonSuggestion[]) {
  if (!suggestionCarousel) return;
  if (!items.length) {
    suggestionCarousel.replaceChildren(emptyCard("Where should we go?", "Add a destination you loved and help us build our honeymoon wish-list."));
    rebuildDots(suggestionCarousel, suggestionDots);
    return;
  }
  suggestionCarousel.replaceChildren(...items.map((item) => {
    const card = document.createElement("article");
    card.className = "suggestion-card";
    const visual = document.createElement("div");
    visual.className = "suggestion-card__visual";
    const photo = honeymoonPhotoUrl(item.photo_path);
    if (photo) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "Travel photo for " + item.destination;
      img.loading = "lazy";
      visual.append(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "✈";
      visual.append(placeholder);
    }
    const body = document.createElement("div");
    body.className = "suggestion-card__body";
    const title = document.createElement("h4");
    title.textContent = item.destination;
    const story = document.createElement("p");
    story.textContent = "“" + item.story + "”";
    const by = document.createElement("div");
    by.className = "suggestion-card__by";
    const avatar = document.createElement("span");
    avatar.className = "social-avatar social-avatar--small";
    avatar.textContent = initials(item.author_name);
    const label = document.createElement("span");
    label.textContent = "By " + item.author_name;
    by.append(avatar, label);
    body.append(title, story, by);
    card.append(visual, body);
    return card;
  }));
  rebuildDots(suggestionCarousel, suggestionDots);
}

function rebuildDots(carousel: HTMLElement, dots: HTMLElement | null | undefined) {
  if (!dots) return;
  const cards = [...carousel.children] as HTMLElement[];
  dots.replaceChildren(...cards.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = index === 0 ? "is-active" : "";
    dot.setAttribute("aria-label", "Show item " + (index + 1));
    dot.addEventListener("click", () => centreCard(carousel, index));
    return dot;
  }));
}

function centreCard(carousel: HTMLElement, index: number) {
  const card = carousel.children[index] as HTMLElement | undefined;
  if (!card) return;
  const left = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
  carousel.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

function currentIndex(carousel: HTMLElement) {
  const cards = [...carousel.children] as HTMLElement[];
  if (!cards.length) return 0;
  const centre = carousel.scrollLeft + carousel.clientWidth / 2;
  let active = 0;
  let nearest = Number.POSITIVE_INFINITY;
  cards.forEach((card, index) => {
    const distance = Math.abs(card.offsetLeft + card.clientWidth / 2 - centre);
    if (distance < nearest) { nearest = distance; active = index; }
  });
  return active;
}

function bindCarousel(carousel: HTMLElement | null | undefined, dots: HTMLElement | null | undefined, prevSelector: string, nextSelector: string) {
  if (!carousel) return;
  const update = () => {
    const active = currentIndex(carousel);
    dots?.querySelectorAll("button").forEach((dot, index) => dot.classList.toggle("is-active", index === active));
  };
  let raf = 0;
  carousel.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); });
  document.querySelector(prevSelector)?.addEventListener("click", () => centreCard(carousel, Math.max(0, currentIndex(carousel) - 1)));
  document.querySelector(nextSelector)?.addEventListener("click", () => centreCard(carousel, Math.min(carousel.children.length - 1, currentIndex(carousel) + 1)));
}

bindCarousel(messageCarousel, messageDots, "[data-message-prev]", "[data-message-next]");
bindCarousel(suggestionCarousel, suggestionDots, "[data-suggestion-prev]", "[data-suggestion-next]");

export async function hydrateSocial() {
  if (!root || loading) return;
  loading = true;
  try {
    const feed = await loadSocialFeed();
    renderMessages(feed.messages);
    renderSuggestions(feed.suggestions);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "We could not load this page.", "error");
  } finally {
    loading = false;
  }
}

document.querySelector("[data-open-message]")?.addEventListener("click", () => messageDialog?.showModal());
document.querySelector("[data-close-message]")?.addEventListener("click", () => messageDialog?.close());
document.querySelector("[data-open-suggestion]")?.addEventListener("click", () => suggestionDialog?.showModal());
document.querySelector("[data-close-suggestion]")?.addEventListener("click", () => suggestionDialog?.close());

messageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loading) return;
  const feedback = messageForm.querySelector<HTMLElement>("[data-message-feedback]");
  const button = messageForm.querySelector<HTMLButtonElement>("[type=submit]");
  const data = new FormData(messageForm);
  button && (button.disabled = true);
  if (feedback) feedback.hidden = true;
  try {
    await addGuestMessage(String(data.get("message") || ""));
    messageForm.reset();
    messageDialog?.close();
    setStatus("Your message has been added ♡", "success");
    await hydrateSocial();
  } catch (error) {
    if (feedback) { feedback.textContent = error instanceof Error ? error.message : "Please try again."; feedback.hidden = false; }
  } finally {
    button && (button.disabled = false);
  }
});

suggestionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loading) return;
  const feedback = suggestionForm.querySelector<HTMLElement>("[data-suggestion-feedback]");
  const button = suggestionForm.querySelector<HTMLButtonElement>("[type=submit]");
  const data = new FormData(suggestionForm);
  const file = data.get("photo");
  button && (button.disabled = true);
  if (feedback) feedback.hidden = true;
  try {
    let photoPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (feedback) { feedback.textContent = "Uploading your photo…"; feedback.hidden = false; }
      photoPath = await uploadHoneymoonPhoto(file);
    }
    await addHoneymoonSuggestion(String(data.get("destination") || ""), String(data.get("story") || ""), photoPath);
    suggestionForm.reset();
    suggestionDialog?.close();
    setStatus("Your honeymoon suggestion has been added ✈", "success");
    await hydrateSocial();
  } catch (error) {
    if (feedback) { feedback.textContent = error instanceof Error ? error.message : "Please try again."; feedback.hidden = false; }
  } finally {
    button && (button.disabled = false);
  }
});

if (document.documentElement.dataset.guestView === "home") void hydrateSocial();