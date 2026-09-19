const STORAGE_KEYS = {
  position: "doctor-choi-reader.position.v1",
  bookmarks: "doctor-choi-reader.bookmarks.v1",
  settings: "doctor-choi-reader.settings.v1",
};

const DEFAULT_SETTINGS = {
  font: "noto-serif",
  fontSize: 19,
  lineHeight: 1.9,
  paragraphGap: 0.55,
  pagePadding: 52,
};

const FONT_FAMILIES = {
  "noto-serif": '"Noto Serif KR", serif',
  gowun: '"Gowun Batang", serif',
  nanum: '"Nanum Myeongjo", serif',
  "noto-sans": '"Noto Sans KR", sans-serif',
};

const state = {
  catalog: null,
  volumeData: null,
  volumeNumber: 1,
  chapterIndex: 0,
  pageIndex: 0,
  pages: [],
  pagesPerView: 2,
  settings: loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  cache: new Map(),
  paginationToken: 0,
};

let deferredInstallPrompt = null;

const elements = {
  library: document.querySelector("#library"),
  reader: document.querySelector("#reader"),
  volumeGrid: document.querySelector("#volume-grid"),
  continueSection: document.querySelector("#continue-section"),
  continueButton: document.querySelector("#continue-button"),
  continueTitle: document.querySelector("#continue-title"),
  continueMeta: document.querySelector("#continue-meta"),
  libraryBookmarks: document.querySelector("#library-bookmarks"),
  installApp: document.querySelector("#install-app"),
  backToLibrary: document.querySelector("#back-to-library"),
  volumeSelect: document.querySelector("#volume-select"),
  chapterSelect: document.querySelector("#chapter-select"),
  bookmarkButton: document.querySelector("#bookmark-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  bookmarksDialog: document.querySelector("#bookmarks-dialog"),
  closeBookmarks: document.querySelector("#close-bookmarks"),
  bookmarksList: document.querySelector("#bookmarks-list"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  book: document.querySelector("#book"),
  leftPage: document.querySelector("#left-page"),
  rightPage: document.querySelector("#right-page"),
  leftContent: document.querySelector("#left-page-content"),
  rightContent: document.querySelector("#right-page-content"),
  leftHead: document.querySelector("#left-running-head"),
  rightHead: document.querySelector("#right-running-head"),
  leftNumber: document.querySelector("#left-page-number"),
  rightNumber: document.querySelector("#right-page-number"),
  progress: document.querySelector("#page-progress"),
  progressLabel: document.querySelector("#progress-label"),
  volumeProgress: document.querySelector("#volume-progress"),
  loading: document.querySelector("#loading"),
  loadingMessage: document.querySelector("#loading-message"),
  toast: document.querySelector("#toast"),
  measurePage: document.querySelector("#measure-page"),
  fontSelect: document.querySelector("#font-select"),
  fontSize: document.querySelector("#font-size"),
  fontSizeOutput: document.querySelector("#font-size-output"),
  lineHeight: document.querySelector("#line-height"),
  lineHeightOutput: document.querySelector("#line-height-output"),
  paragraphGap: document.querySelector("#paragraph-gap"),
  paragraphGapOutput: document.querySelector("#paragraph-gap-output"),
  pagePadding: document.querySelector("#page-padding"),
  pagePaddingOutput: document.querySelector("#page-padding-output"),
  resetSettings: document.querySelector("#reset-settings"),
};

let toastTimer;
let settingsTimer;
let resizeTimer;
let pointerStart = null;

init();

async function init() {
  applySettings(false);
  bindEvents();
  registerServiceWorker();

  try {
    const response = await fetch("./data/catalog.json");
    if (!response.ok) throw new Error(`목록을 불러오지 못했습니다 (${response.status})`);
    state.catalog = await response.json();
    populateVolumeSelect();
    renderLibrary();
  } catch (error) {
    console.error(error);
    elements.volumeGrid.innerHTML = `
      <div class="empty-bookmarks">
        책 데이터를 불러오지 못했습니다.<br />HTTP 서버로 실행했는지 확인해 주세요.
      </div>`;
  }
}

function bindEvents() {
  elements.continueButton.addEventListener("click", continueReading);
  elements.libraryBookmarks.addEventListener("click", openBookmarksDialog);
  elements.installApp.addEventListener("click", installPwa);
  elements.closeBookmarks.addEventListener("click", () => elements.bookmarksDialog.close());
  elements.backToLibrary.addEventListener("click", showLibrary);
  elements.previousPage.addEventListener("click", previousPage);
  elements.nextPage.addEventListener("click", nextPage);
  elements.bookmarkButton.addEventListener("click", toggleBookmark);
  elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
  elements.volumeSelect.addEventListener("change", () => startVolume(Number(elements.volumeSelect.value)));
  elements.chapterSelect.addEventListener("change", async () => {
    state.chapterIndex = Number(elements.chapterSelect.value);
    state.pageIndex = 0;
    await paginateCurrentChapter();
  });
  elements.progress.addEventListener("input", () => {
    const requested = Number(elements.progress.value);
    state.pageIndex = normalizePageIndex(requested);
    renderSpread();
    savePosition();
  });

  const settingInputs = [elements.fontSelect, elements.fontSize, elements.lineHeight, elements.paragraphGap, elements.pagePadding];
  settingInputs.forEach((input) => {
    input.addEventListener("input", () => {
      readSettingsFromControls();
      applySettings();
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => repaginateAtCurrentRatio(), 180);
    });
  });
  elements.resetSettings.addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    applySettings();
    repaginateAtCurrentRatio();
    showToast("기본 설정으로 되돌렸습니다");
  });

  elements.book.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, time: Date.now() };
  });
  elements.book.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const elapsed = Date.now() - pointerStart.time;
    pointerStart = null;
    if (elapsed < 650 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      dx < 0 ? nextPage() : previousPage();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (elements.reader.hidden || document.querySelector("dialog[open]")) return;
    if (["ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      nextPage();
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      previousPage();
    }
    if (event.key.toLowerCase() === "b") toggleBookmark();
  });

  window.addEventListener("resize", () => {
    if (elements.reader.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => repaginateAtCurrentRatio(), 240);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!isStandalone()) elements.installApp.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installApp.hidden = true;
    showToast("홈 화면에 설치했습니다");
  });
}

async function installPwa() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installApp.hidden = true;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || window.navigator.standalone === true;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch (error) {
      console.warn("오프라인 읽기 준비에 실패했습니다.", error);
    }
  });
}

function populateVolumeSelect() {
  elements.volumeSelect.innerHTML = state.catalog.volumes
    .map((volume) => `<option value="${volume.volume}">${volume.volume}권</option>`)
    .join("");
}

function renderLibrary() {
  const position = loadJSON(STORAGE_KEYS.position, null);
  elements.volumeGrid.innerHTML = "";

  state.catalog.volumes.forEach((volume) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "volume-card";
    button.setAttribute("aria-label", `${volume.volume}권, ${volume.startEpisode}화부터 ${volume.endEpisode}화`);

    const progress = position?.volume === volume.volume ? calculateSavedVolumeProgress(position, volume) : 0;
    button.innerHTML = `
      <span class="volume-number">${String(volume.volume).padStart(2, "0")}</span>
      <span class="volume-title">닥터 최태수</span>
      <span class="volume-range">${volume.startEpisode}–${volume.endEpisode}화</span>
      <span class="volume-progress-bar" aria-hidden="true"><span style="--progress:${progress}%"></span></span>`;
    button.addEventListener("click", () => startVolume(volume.volume));
    elements.volumeGrid.appendChild(button);
  });

  if (position && position.volume >= 1 && position.volume <= 27) {
    elements.continueSection.hidden = false;
    elements.continueTitle.textContent = `${position.volume}권 · ${position.chapterNumber}화`;
    elements.continueMeta.textContent = `${Math.max(1, position.pageIndex + 1)}쪽에서 이어 읽기`;
  } else {
    elements.continueSection.hidden = true;
  }
}

function calculateSavedVolumeProgress(position, volume) {
  const chapterOffset = Math.max(0, position.chapterNumber - volume.startEpisode);
  return Math.min(100, Math.round((chapterOffset / volume.chapterCount) * 100));
}

async function continueReading() {
  const position = loadJSON(STORAGE_KEYS.position, null);
  if (!position) return;
  await startVolume(position.volume, position);
}

async function startVolume(volumeNumber, requestedPosition = null) {
  showLoading(`${volumeNumber}권을 펼치고 있습니다…`);
  try {
    state.volumeData = await loadVolume(volumeNumber);
    state.volumeNumber = volumeNumber;
    state.chapterIndex = 0;
    state.pageIndex = 0;

    if (requestedPosition?.chapterNumber) {
      const matchedIndex = state.volumeData.chapters.findIndex((chapter) => chapter.number === requestedPosition.chapterNumber);
      if (matchedIndex >= 0) state.chapterIndex = matchedIndex;
      state.pageIndex = Math.max(0, Number(requestedPosition.pageIndex) || 0);
    }

    elements.volumeSelect.value = String(volumeNumber);
    elements.chapterSelect.innerHTML = state.volumeData.chapters
      .map((chapter, index) => `<option value="${index}">${chapter.number}화</option>`)
      .join("");
    elements.chapterSelect.value = String(state.chapterIndex);

    elements.library.hidden = true;
    elements.reader.hidden = false;
    await nextFrame();
    await paginateCurrentChapter(state.pageIndex);
  } catch (error) {
    console.error(error);
    showToast("책을 여는 중 문제가 생겼습니다");
    showLibrary();
  } finally {
    hideLoading();
  }
}

async function loadVolume(volumeNumber) {
  if (state.cache.has(volumeNumber)) return state.cache.get(volumeNumber);
  const descriptor = state.catalog.volumes.find((volume) => volume.volume === volumeNumber);
  if (!descriptor) throw new Error("존재하지 않는 권입니다.");
  const response = await fetch(descriptor.path);
  if (!response.ok) throw new Error(`${volumeNumber}권을 불러오지 못했습니다 (${response.status})`);
  const data = await response.json();
  state.cache.clear();
  state.cache.set(volumeNumber, data);
  return data;
}

async function paginateCurrentChapter(requestedPage = 0) {
  if (!state.volumeData) return;
  const token = ++state.paginationToken;
  elements.book.setAttribute("aria-busy", "true");
  const chapter = currentChapter();
  elements.chapterSelect.value = String(state.chapterIndex);

  if (document.fonts?.ready) await document.fonts.ready;
  await nextFrame();

  state.pagesPerView = getPagesPerView();
  const rect = elements.leftContent.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 100) {
    await nextFrame();
  }

  const contentRect = elements.leftContent.getBoundingClientRect();
  elements.measurePage.style.width = `${contentRect.width}px`;
  elements.measurePage.style.height = `${contentRect.height}px`;

  const pages = buildPages(chapter);
  if (token !== state.paginationToken) return;
  state.pages = pages.length ? pages : [{ showTitle: true, lines: [""] }];
  state.pageIndex = normalizePageIndex(Math.min(requestedPage, state.pages.length - 1));
  renderSpread();
  savePosition();
  elements.book.setAttribute("aria-busy", "false");
}

function buildPages(chapter) {
  const lines = chapter.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const pages = [];
  let page = { showTitle: true, lines: [] };

  for (const originalLine of lines) {
    let remaining = originalLine;
    while (remaining.length) {
      const candidate = { ...page, lines: [...page.lines, remaining] };
      if (pageFits(candidate, chapter.title)) {
        page = candidate;
        remaining = "";
        continue;
      }

      if (page.lines.length > 0 || page.showTitle) {
        pages.push(page);
        page = { showTitle: false, lines: [] };
        continue;
      }

      const splitAt = findFittingTextLength(remaining, chapter.title);
      const safeSplit = Math.max(1, splitAt);
      page.lines.push(remaining.slice(0, safeSplit));
      pages.push(page);
      page = { showTitle: false, lines: [] };
      remaining = remaining.slice(safeSplit).trimStart();
    }
  }

  if (page.lines.length || page.showTitle) pages.push(page);
  return pages;
}

function pageFits(page, title) {
  renderMeasuredPage(page, title);
  return elements.measurePage.scrollHeight <= elements.measurePage.clientHeight + 1;
}

function renderMeasuredPage(page, title) {
  elements.measurePage.replaceChildren();
  if (page.showTitle) {
    const heading = document.createElement("h2");
    heading.textContent = title;
    elements.measurePage.appendChild(heading);
  }
  page.lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    elements.measurePage.appendChild(paragraph);
  });
}

function findFittingTextLength(text, title) {
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const fits = pageFits({ showTitle: false, lines: [text.slice(0, middle)] }, title);
    if (fits) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function renderSpread() {
  const chapter = currentChapter();
  const leftPage = state.pages[state.pageIndex];
  const rightPage = state.pagesPerView === 2 ? state.pages[state.pageIndex + 1] : null;

  renderPage(elements.leftPage, elements.leftContent, elements.leftHead, elements.leftNumber, leftPage, state.pageIndex, chapter);
  renderPage(elements.rightPage, elements.rightContent, elements.rightHead, elements.rightNumber, rightPage, state.pageIndex + 1, chapter);

  const visibleLastPage = Math.min(state.pages.length, state.pageIndex + state.pagesPerView);
  elements.progress.min = "0";
  elements.progress.max = String(Math.max(0, state.pages.length - 1));
  elements.progress.step = String(state.pagesPerView);
  elements.progress.value = String(state.pageIndex);
  elements.progressLabel.textContent = `${chapter.number}화 · ${state.pageIndex + 1}–${visibleLastPage}/${state.pages.length}쪽`;

  const chapterRatio = state.pages.length ? visibleLastPage / state.pages.length : 0;
  const volumeRatio = (state.chapterIndex + chapterRatio) / state.volumeData.chapters.length;
  elements.volumeProgress.textContent = `${state.volumeNumber}권 ${Math.min(100, Math.round(volumeRatio * 100))}%`;

  const atBeginning = state.volumeNumber === 1 && state.chapterIndex === 0 && state.pageIndex === 0;
  const atEnd = state.volumeNumber === 27 && state.chapterIndex === state.volumeData.chapters.length - 1 && visibleLastPage >= state.pages.length;
  elements.previousPage.disabled = atBeginning;
  elements.nextPage.disabled = atEnd;
  updateBookmarkButton();
}

function renderPage(pageElement, contentElement, headElement, numberElement, page, index, chapter) {
  contentElement.replaceChildren();
  pageElement.classList.toggle("blank-page", !page);
  if (!page) {
    headElement.textContent = "";
    numberElement.textContent = "";
    return;
  }

  if (page.showTitle) {
    const heading = document.createElement("h2");
    heading.textContent = chapter.title;
    contentElement.appendChild(heading);
  }
  page.lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    contentElement.appendChild(paragraph);
  });

  headElement.textContent = index % 2 === 0 ? `닥터 최태수 · ${state.volumeNumber}권` : chapter.title;
  numberElement.textContent = String(index + 1);
}

async function nextPage() {
  if (!state.pages.length) return;
  if (state.pageIndex + state.pagesPerView < state.pages.length) {
    state.pageIndex += state.pagesPerView;
    renderSpread();
    savePosition();
    return;
  }
  await moveChapter(1);
}

async function previousPage() {
  if (!state.pages.length) return;
  if (state.pageIndex > 0) {
    state.pageIndex = Math.max(0, state.pageIndex - state.pagesPerView);
    renderSpread();
    savePosition();
    return;
  }
  await moveChapter(-1);
}

async function moveChapter(direction) {
  const nextChapterIndex = state.chapterIndex + direction;
  if (nextChapterIndex >= 0 && nextChapterIndex < state.volumeData.chapters.length) {
    state.chapterIndex = nextChapterIndex;
    state.pageIndex = 0;
    await paginateCurrentChapter(direction < 0 ? Number.MAX_SAFE_INTEGER : 0);
    return;
  }

  const nextVolume = state.volumeNumber + direction;
  if (nextVolume < 1 || nextVolume > 27) return;
  showLoading(`${nextVolume}권을 펼치고 있습니다…`);
  try {
    state.volumeData = await loadVolume(nextVolume);
    state.volumeNumber = nextVolume;
    state.chapterIndex = direction > 0 ? 0 : state.volumeData.chapters.length - 1;
    elements.volumeSelect.value = String(nextVolume);
    elements.chapterSelect.innerHTML = state.volumeData.chapters
      .map((chapter, index) => `<option value="${index}">${chapter.number}화</option>`)
      .join("");
    await paginateCurrentChapter(direction < 0 ? Number.MAX_SAFE_INTEGER : 0);
  } finally {
    hideLoading();
  }
}

function normalizePageIndex(index) {
  const maximum = Math.max(0, state.pages.length - 1);
  const clamped = Math.max(0, Math.min(Number(index) || 0, maximum));
  if (state.pagesPerView === 2) return Math.floor(clamped / 2) * 2;
  return clamped;
}

function currentChapter() {
  return state.volumeData.chapters[state.chapterIndex];
}

function getPagesPerView() {
  return window.matchMedia("(min-width: 900px) and (orientation: landscape)").matches ? 2 : 1;
}

async function repaginateAtCurrentRatio() {
  if (elements.reader.hidden || !state.pages.length) return;
  const oldRatio = state.pages.length > 1 ? state.pageIndex / (state.pages.length - 1) : 0;
  await paginateCurrentChapter(0);
  state.pageIndex = normalizePageIndex(Math.round(oldRatio * Math.max(0, state.pages.length - 1)));
  renderSpread();
  savePosition();
}

function showLibrary() {
  if (state.volumeData) savePosition();
  elements.reader.hidden = true;
  elements.library.hidden = false;
  renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function savePosition() {
  if (!state.volumeData) return;
  const position = {
    volume: state.volumeNumber,
    chapterNumber: currentChapter().number,
    pageIndex: state.pageIndex,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.position, JSON.stringify(position));
}

function toggleBookmark() {
  if (!state.volumeData) return;
  const chapter = currentChapter();
  const key = `${state.volumeNumber}-${chapter.number}-${state.pageIndex}`;
  const bookmarks = loadJSON(STORAGE_KEYS.bookmarks, []);
  const existingIndex = bookmarks.findIndex((bookmark) => bookmark.key === key);

  if (existingIndex >= 0) {
    bookmarks.splice(existingIndex, 1);
    showToast("책갈피를 지웠습니다");
  } else {
    bookmarks.unshift({
      key,
      volume: state.volumeNumber,
      chapterNumber: chapter.number,
      pageIndex: state.pageIndex,
      createdAt: new Date().toISOString(),
    });
    showToast("현재 페이지를 책갈피에 저장했습니다");
  }

  localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
  updateBookmarkButton();
}

function updateBookmarkButton() {
  if (!state.volumeData) return;
  const key = `${state.volumeNumber}-${currentChapter().number}-${state.pageIndex}`;
  const isBookmarked = loadJSON(STORAGE_KEYS.bookmarks, []).some((bookmark) => bookmark.key === key);
  elements.bookmarkButton.classList.toggle("is-bookmarked", isBookmarked);
  elements.bookmarkButton.textContent = isBookmarked ? "♠" : "♧";
  elements.bookmarkButton.setAttribute("aria-label", isBookmarked ? "현재 페이지 책갈피 지우기" : "현재 페이지 책갈피");
}

function openBookmarksDialog() {
  const bookmarks = loadJSON(STORAGE_KEYS.bookmarks, []);
  elements.bookmarksList.replaceChildren();

  if (!bookmarks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-bookmarks";
    empty.textContent = "아직 저장한 책갈피가 없습니다.";
    elements.bookmarksList.appendChild(empty);
  } else {
    bookmarks.forEach((bookmark) => {
      const item = document.createElement("div");
      item.className = "bookmark-item";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "bookmark-open";
      const title = document.createElement("strong");
      title.textContent = `${bookmark.volume}권 · ${bookmark.chapterNumber}화`;
      const meta = document.createElement("small");
      meta.textContent = `${bookmark.pageIndex + 1}쪽 · ${formatDate(bookmark.createdAt)}`;
      open.append(title, meta);
      open.addEventListener("click", async () => {
        elements.bookmarksDialog.close();
        await startVolume(bookmark.volume, bookmark);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "bookmark-delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${bookmark.volume}권 ${bookmark.chapterNumber}화 책갈피 삭제`);
      remove.addEventListener("click", () => {
        const next = loadJSON(STORAGE_KEYS.bookmarks, []).filter((saved) => saved.key !== bookmark.key);
        localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(next));
        openBookmarksDialogRefresh();
      });

      item.append(open, remove);
      elements.bookmarksList.appendChild(item);
    });
  }

  elements.bookmarksDialog.showModal();
}

function openBookmarksDialogRefresh() {
  elements.bookmarksDialog.close();
  openBookmarksDialog();
}

function readSettingsFromControls() {
  state.settings = {
    font: elements.fontSelect.value,
    fontSize: Number(elements.fontSize.value),
    lineHeight: Number(elements.lineHeight.value),
    paragraphGap: Number(elements.paragraphGap.value),
    pagePadding: Number(elements.pagePadding.value),
  };
}

function applySettings(save = true) {
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const root = document.documentElement;
  root.style.setProperty("--font-family", FONT_FAMILIES[state.settings.font] || FONT_FAMILIES[DEFAULT_SETTINGS.font]);
  root.style.setProperty("--font-size", `${state.settings.fontSize}px`);
  root.style.setProperty("--line-height", state.settings.lineHeight);
  root.style.setProperty("--paragraph-gap", `${state.settings.paragraphGap}em`);
  root.style.setProperty("--page-padding", `${state.settings.pagePadding}px`);

  elements.fontSelect.value = state.settings.font;
  elements.fontSize.value = state.settings.fontSize;
  elements.lineHeight.value = state.settings.lineHeight;
  elements.paragraphGap.value = state.settings.paragraphGap;
  elements.pagePadding.value = state.settings.pagePadding;
  elements.fontSizeOutput.textContent = `${state.settings.fontSize}px`;
  elements.lineHeightOutput.textContent = state.settings.lineHeight.toFixed(2);
  elements.paragraphGapOutput.textContent = `${state.settings.paragraphGap.toFixed(2)}em`;
  elements.pagePaddingOutput.textContent = `${state.settings.pagePadding}px`;

  if (save) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function showLoading(message) {
  elements.loadingMessage.textContent = message;
  elements.loading.hidden = false;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 1900);
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "저장됨";
  }
}

function loadJSON(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
