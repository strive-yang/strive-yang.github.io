(function () {
  var root = document.querySelector("[data-epub-reader]");
  if (!root) return;

  var OWNER = "strive-yang";
  var REPO = "strive-yang.github.io";
  var BOOK_DIR = "tools/booklist";
  var STORAGE_PREFIX = "ys:epub-reader:";
  var GITHUB_CONTENTS_URL = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + BOOK_DIR;
  var SUPABASE_CDN_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  var cloudLibraryPromise = null;

  var elements = {
    list: root.querySelector("[data-book-list]"),
    refresh: root.querySelector("[data-reader-refresh]"),
    viewportWrap: root.querySelector(".reader-viewport-wrap"),
    viewport: root.querySelector("[data-reader-viewport]"),
    titles: root.querySelectorAll("[data-reader-title]"),
    statuses: root.querySelectorAll("[data-reader-status]"),
    progress: root.querySelector("[data-reader-progress]"),
    progressBar: root.querySelector("[data-reader-progress-bar]"),
    bookmark: root.querySelectorAll("[data-reader-bookmark]"),
    fontSmaller: root.querySelectorAll("[data-reader-font-smaller]"),
    fontLarger: root.querySelectorAll("[data-reader-font-larger]"),
    fontSizes: root.querySelectorAll("[data-reader-font-size]"),
    theme: root.querySelectorAll("[data-reader-theme]"),
    themeLabels: root.querySelectorAll("[data-reader-theme-label]"),
    themeActions: root.querySelectorAll("[data-reader-theme-action]"),
    fullscreen: root.querySelectorAll("[data-reader-fullscreen]"),
    fullscreenLabels: root.querySelectorAll("[data-reader-fullscreen-label]"),
    frame: root.querySelector("[data-reader-frame]"),
    menuToggle: root.querySelector("[data-reader-menu-toggle]"),
    menuClose: root.querySelectorAll("[data-reader-menu-close]"),
    controlLayer: root.querySelector("[data-reader-control-layer]"),
    layerTitle: root.querySelector("[data-reader-layer-title]"),
    tocLists: root.querySelectorAll("[data-toc-list], [data-toc-list-mobile]"),
    bookmarkLists: root.querySelectorAll("[data-bookmark-list], [data-bookmark-list-mobile]"),
    clearBookmarks: root.querySelector("[data-reader-clear-bookmarks]"),
    resume: root.querySelector("[data-reader-resume]"),
    tabs: root.querySelectorAll("[data-reader-tab]"),
    panels: root.querySelectorAll("[data-reader-panel]"),
    cloud: root.querySelector("[data-reader-cloud]"),
    cloudStatus: root.querySelector("[data-reader-cloud-status]"),
    cloudForm: root.querySelector("[data-reader-cloud-form]"),
    cloudEmail: root.querySelector("[data-reader-cloud-email]"),
    cloudSubmit: root.querySelector("[data-reader-cloud-submit]"),
    cloudAccount: root.querySelector("[data-reader-cloud-account]"),
    cloudUser: root.querySelector("[data-reader-cloud-user]"),
    cloudSignOut: root.querySelector("[data-reader-cloud-sign-out]"),
    cloudMessage: root.querySelector("[data-reader-cloud-message]")
  };

  var state = {
    books: [],
    currentBook: null,
    book: null,
    rendition: null,
    locationsReady: false,
    pendingCfi: "",
    isRendering: false,
    fontSize: 105,
    theme: "day",
    menuOpen: false,
    toc: [],
    currentChapter: "",
    selection: null,
    positionRevision: 0,
    isRestoring: false,
    cloud: {
      enabled: false,
      client: null,
      session: null,
      saveTimers: {},
      subscription: null
    },
    swipe: {
      active: false,
      animating: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      dragX: 0,
      viewportWidth: 0,
      frameId: 0,
      resetTimer: 0,
      startedAt: 0,
      suppressClickUntil: 0
    }
  };

  function storageKey(bookName, suffix) {
    return STORAGE_PREFIX + bookName + ":" + suffix;
  }

  function encodeBookUrl(name) {
    return "/" + BOOK_DIR + "/" + encodeURIComponent(name);
  }

  function cleanTitle(name) {
    return String(name || "")
      .replace(/\.epub$/i, "")
      .replace(/\s*\([^)]*(z-library|1lib|z-lib)[^)]*\)\s*/gi, "")
      .trim();
  }

  function twoDigit(index) {
    return String(index).padStart(2, "0");
  }

  function compactLabel(value, fallback) {
    var text = String(value || fallback || "").replace(/\s+/g, " ").trim();
    return text || "未命名章节";
  }

  function normalizeSearchText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function truncateText(value, length) {
    var text = normalizeSearchText(value);
    return text.length > length ? text.slice(0, length).trim() + "…" : text;
  }

  function flattenToc(items, level, output) {
    (items || []).forEach(function (item) {
      if (!item) return;
      output.push({
        label: compactLabel(item.label || item.title, "章节"),
        href: item.href || item.cfi || "",
        level: level
      });
      flattenToc(item.subitems || item.subItems || item.children, level + 1, output);
    });
    return output;
  }

  function clampFontSize(value) {
    return Math.max(80, Math.min(160, Number(value) || 105));
  }

  function setFontSize(value) {
    state.fontSize = clampFontSize(value);
    elements.fontSizes.forEach(function (fontSize) {
      fontSize.textContent = state.fontSize + "%";
    });
    try {
      localStorage.setItem(STORAGE_PREFIX + "font-size", String(state.fontSize));
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
    if (state.rendition) state.rendition.themes.fontSize(state.fontSize + "%");
  }

  function themeConfig(name) {
    if (name === "night") {
      return {
        body: {
          color: "#d6d3c8",
          background: "#11100d"
        },
        link: "#78a6c8"
      };
    }
    return {
      body: {
        color: "#1e293b",
        background: "#fffaf0"
      },
      link: "#0077b5"
    };
  }

  function applyBookTheme() {
    if (!state.rendition) return;
    var config = themeConfig(state.theme);
    state.rendition.themes.default({
      "body": {
        "font-family": "Georgia, 'Noto Serif SC', serif",
        "line-height": "1.72",
        "color": config.body.color,
        "background": config.body.background
      },
      "p": {
        "line-height": "1.72"
      },
      "a": {
        "color": config.link
      }
    });
    state.rendition.themes.fontSize(state.fontSize + "%");
    root.querySelectorAll("#epubViewport iframe").forEach(function (frame) {
      try {
        var doc = frame.contentDocument;
        if (!doc || !doc.body) return;
        doc.documentElement.style.background = config.body.background;
        doc.body.style.background = config.body.background;
        doc.body.style.color = config.body.color;
      } catch (error) {
        // Ignore cross-frame styling failures; epub.js theme registration still applies to new renders.
      }
    });
  }

  function setTheme(name) {
    state.theme = name === "night" ? "night" : "day";
    root.setAttribute("data-reader-theme-mode", state.theme);
    elements.themeLabels.forEach(function (label) {
      label.textContent = state.theme === "night" ? "夜" : "日";
    });
    elements.themeActions.forEach(function (label) {
      label.textContent = state.theme === "night" ? "日间" : "夜间";
    });
    try {
      localStorage.setItem(STORAGE_PREFIX + "theme", state.theme);
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
    applyBookTheme();
  }

  function toggleTheme() {
    setTheme(state.theme === "night" ? "day" : "night");
  }

  function setMenuOpen(isOpen) {
    state.menuOpen = !!isOpen;
    if (!elements.controlLayer) return;
    elements.controlLayer.classList.toggle("is-open", state.menuOpen);
    elements.controlLayer.setAttribute("aria-hidden", String(!state.menuOpen));
    if (state.menuOpen && elements.layerTitle) {
      elements.layerTitle.textContent = state.currentChapter || "目录与书签";
    }
  }

  function toggleFullscreen() {
    var target = elements.frame || root;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) target.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    setMenuOpen(false);
  }

  function syncFullscreenState() {
    var isFullscreen = document.fullscreenElement === elements.frame;
    elements.fullscreenLabels.forEach(function (label) {
      label.textContent = isFullscreen ? "退出全屏" : "全屏";
    });
  }

  function setStatus(message) {
    elements.statuses.forEach(function (status) {
      status.textContent = message;
    });
  }

  function setProgress(percent) {
    var normalized = Math.max(0, Math.min(100, Number(percent) || 0));
    elements.progress.textContent = Math.round(normalized) + "%";
    elements.progressBar.style.width = normalized + "%";
  }

  function readJson(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
  }

  function normalizePosition(position) {
    if (typeof position === "string") position = { cfi: position };
    if (!position || typeof position !== "object" || !position.cfi) return null;
    var percent = Number(position.percent);
    return {
      cfi: String(position.cfi),
      endCfi: position.endCfi ? String(position.endCfi) : "",
      href: position.href ? String(position.href) : "",
      percent: Number.isFinite(percent) ? percent : 0,
      chapter: compactLabel(position.chapter, "阅读进度"),
      text: normalizeSearchText(position.text),
      prefix: normalizeSearchText(position.prefix),
      suffix: normalizeSearchText(position.suffix),
      updatedAt: position.updatedAt ? String(position.updatedAt) : ""
    };
  }

  function getSavedProgress(bookName) {
    if (!bookName) return null;
    try {
      var raw = localStorage.getItem(storageKey(bookName, "position"));
      if (!raw) return null;
      try {
        return normalizePosition(JSON.parse(raw));
      } catch (parseError) {
        return normalizePosition(raw);
      }
    } catch (error) {
      return null;
    }
  }

  function writeSavedProgress(bookName, position) {
    var normalized = normalizePosition(position);
    if (!bookName || !normalized) return;
    try {
      localStorage.setItem(storageKey(bookName, "position"), JSON.stringify(normalized));
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
  }

  function savePosition(bookName, cfi, location) {
    if (!bookName || !cfi) return;
    var previous = getSavedProgress(bookName);
    var position = {
      cfi: cfi,
      endCfi: currentLocationEndCfi(location),
      href: currentLocationHref(location),
      percent: currentPercent(location),
      chapter: state.currentChapter || "阅读进度",
      text: previous && previous.cfi === cfi ? previous.text : "",
      prefix: previous && previous.cfi === cfi ? previous.prefix : "",
      suffix: previous && previous.cfi === cfi ? previous.suffix : "",
      updatedAt: new Date().toISOString()
    };
    writeSavedProgress(bookName, position);
    scheduleCloudSave(bookName);

    var revision = ++state.positionRevision;
    getBookmarkContext(cfi, "").then(function (context) {
      if (revision !== state.positionRevision || !state.currentBook || state.currentBook.name !== bookName) return;
      var latest = getSavedProgress(bookName);
      if (!latest || latest.cfi !== cfi) return;
      latest.text = context.text;
      latest.prefix = context.prefix;
      latest.suffix = context.suffix;
      writeSavedProgress(bookName, latest);
      scheduleCloudSave(bookName);
    });
  }

  function getBookmarks(bookName) {
    if (!bookName) return [];
    return dedupeBookmarks(readJson(storageKey(bookName, "bookmarks"), []));
  }

  function getBookmarksUpdatedAt(bookName) {
    if (!bookName) return "";
    try {
      return localStorage.getItem(storageKey(bookName, "bookmarks-updated-at")) || "";
    } catch (error) {
      return "";
    }
  }

  function setBookmarksUpdatedAt(bookName, value) {
    if (!bookName) return;
    try {
      localStorage.setItem(storageKey(bookName, "bookmarks-updated-at"), value || new Date().toISOString());
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
  }

  function normalizeBookmark(bookmark) {
    if (!bookmark || typeof bookmark !== "object" || !bookmark.cfi) return null;
    var percent = Number(bookmark.percent);
    return {
      cfi: String(bookmark.cfi),
      endCfi: bookmark.endCfi ? String(bookmark.endCfi) : "",
      href: bookmark.href ? String(bookmark.href) : "",
      percent: Number.isFinite(percent) ? percent : 0,
      chapter: compactLabel(bookmark.chapter, "书签"),
      label: normalizeSearchText(bookmark.label) || "阅读位置",
      text: normalizeSearchText(bookmark.text),
      prefix: normalizeSearchText(bookmark.prefix),
      suffix: normalizeSearchText(bookmark.suffix),
      createdAt: bookmark.createdAt ? String(bookmark.createdAt) : ""
    };
  }

  function sameBookmark(left, right) {
    if (!left || !right) return false;
    if (left.cfi && right.cfi && left.cfi === right.cfi) return true;
    if (!left.text || !right.text) return false;
    if (normalizeSearchText(left.text).toLowerCase() !== normalizeSearchText(right.text).toLowerCase()) {
      return false;
    }
    return !!left.href && left.href === right.href;
  }

  function dedupeBookmarks(bookmarks) {
    return (Array.isArray(bookmarks) ? bookmarks : []).reduce(function (result, bookmark) {
      var normalized = normalizeBookmark(bookmark);
      if (!normalized) return result;
      var exists = result.some(function (savedBookmark) {
        return sameBookmark(savedBookmark, normalized);
      });
      if (!exists) result.push(normalized);
      return result;
    }, []);
  }

  function mergeBookmarks(bookName, additions) {
    if (!bookName) return [];
    var cached = getBookmarks(bookName);
    var merged = dedupeBookmarks((additions || []).concat(cached));
    writeJson(storageKey(bookName, "bookmarks"), merged);
    setBookmarksUpdatedAt(bookName);
    scheduleCloudSave(bookName);
    return merged;
  }

  function replaceBookmarks(bookName, bookmarks) {
    if (!bookName) return;
    writeJson(storageKey(bookName, "bookmarks"), dedupeBookmarks(bookmarks));
    setBookmarksUpdatedAt(bookName);
    scheduleCloudSave(bookName);
  }

  function removeBookmark(bookName, bookmark) {
    var cached = getBookmarks(bookName);
    replaceBookmarks(bookName, cached.filter(function (savedBookmark) {
      return !sameBookmark(savedBookmark, bookmark);
    }));
  }

  function timestampValue(value) {
    var parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function setCloudUi(mode, message) {
    if (!elements.cloud) return;
    var isSignedIn = !!(state.cloud.session && state.cloud.session.user);
    elements.cloud.setAttribute("data-cloud-state", mode || "local");
    elements.cloudForm.hidden = !state.cloud.enabled || isSignedIn;
    elements.cloudAccount.hidden = !isSignedIn;

    if (!state.cloud.enabled) {
      elements.cloudStatus.textContent = "本机保存";
    } else if (mode === "busy") {
      elements.cloudStatus.textContent = "正在同步";
    } else if (mode === "error") {
      elements.cloudStatus.textContent = "云端离线";
    } else if (isSignedIn) {
      elements.cloudStatus.textContent = "已开启同步";
    } else {
      elements.cloudStatus.textContent = "等待登录";
    }

    if (isSignedIn) {
      elements.cloudUser.textContent = state.cloud.session.user.email || "已登录账户";
    }
    if (message) {
      elements.cloudMessage.textContent = message;
    } else if (!state.cloud.enabled) {
      elements.cloudMessage.textContent = "当前进度保存在此浏览器。";
    } else if (isSignedIn) {
      elements.cloudMessage.textContent = "进度与书签会自动同步到云端。";
    } else {
      elements.cloudMessage.textContent = "登录后可在不同设备继续阅读。";
    }
  }

  function cloudPayload(bookName) {
    if (!state.cloud.session || !state.cloud.session.user) return null;
    var bookmarks = getBookmarks(bookName);
    var bookmarksUpdatedAt = getBookmarksUpdatedAt(bookName);
    if (!bookmarksUpdatedAt && bookmarks.length) {
      bookmarksUpdatedAt = new Date().toISOString();
      setBookmarksUpdatedAt(bookName, bookmarksUpdatedAt);
    }
    return {
      user_id: state.cloud.session.user.id,
      book_id: bookName,
      position: getSavedProgress(bookName) || {},
      bookmarks: bookmarks,
      bookmarks_updated_at: bookmarksUpdatedAt || null,
      updated_at: new Date().toISOString()
    };
  }

  function pushBookState(bookName) {
    if (!state.cloud.enabled || !state.cloud.client || !state.cloud.session || !bookName) {
      return Promise.resolve(false);
    }
    var payload = cloudPayload(bookName);
    if (!payload) return Promise.resolve(false);
    setCloudUi("busy");
    return state.cloud.client
      .from("reader_state")
      .upsert(payload, { onConflict: "user_id,book_id" })
      .then(function (result) {
        if (result.error) throw result.error;
        setCloudUi("ready", "刚刚已同步，离线时仍会保存在本机。");
        return true;
      }).catch(function () {
        setCloudUi("error", "云同步失败，本机记录不受影响。请检查配置或网络。");
        return false;
      });
  }

  function scheduleCloudSave(bookName) {
    if (!state.cloud.enabled || !state.cloud.session || !bookName) return;
    if (state.cloud.saveTimers[bookName]) window.clearTimeout(state.cloud.saveTimers[bookName]);
    state.cloud.saveTimers[bookName] = window.setTimeout(function () {
      delete state.cloud.saveTimers[bookName];
      pushBookState(bookName);
    }, 1200);
  }

  function flushScheduledCloudSave(bookName) {
    if (!bookName || !state.cloud.saveTimers[bookName]) return;
    window.clearTimeout(state.cloud.saveTimers[bookName]);
    delete state.cloud.saveTimers[bookName];
    pushBookState(bookName);
  }

  function chooseCloudBookmarks(bookName, remoteBookmarks, remoteUpdatedAt) {
    var localBookmarks = getBookmarks(bookName);
    var localUpdatedAt = getBookmarksUpdatedAt(bookName);
    var localTime = timestampValue(localUpdatedAt);
    var remoteTime = timestampValue(remoteUpdatedAt);
    var chosen = localBookmarks;
    var chosenUpdatedAt = localUpdatedAt;
    var shouldPush = false;

    if (!localTime && localBookmarks.length && remoteBookmarks.length) {
      chosen = dedupeBookmarks(localBookmarks.concat(remoteBookmarks));
      chosenUpdatedAt = new Date().toISOString();
      shouldPush = true;
    } else if (!localTime && !localBookmarks.length && remoteBookmarks.length) {
      chosen = remoteBookmarks;
      chosenUpdatedAt = remoteUpdatedAt || new Date().toISOString();
    } else if ((!remoteTime && localBookmarks.length) || localTime > remoteTime) {
      chosen = localBookmarks;
      chosenUpdatedAt = localUpdatedAt || new Date().toISOString();
      shouldPush = true;
    } else if (remoteTime >= localTime) {
      chosen = remoteBookmarks;
      chosenUpdatedAt = remoteUpdatedAt || new Date().toISOString();
    }

    writeJson(storageKey(bookName, "bookmarks"), dedupeBookmarks(chosen));
    setBookmarksUpdatedAt(bookName, chosenUpdatedAt);
    return shouldPush;
  }

  function syncBookFromCloud(bookName) {
    if (!state.cloud.enabled || !state.cloud.client || !state.cloud.session || !bookName) {
      return Promise.resolve({ positionChanged: false });
    }
    setCloudUi("busy", "正在合并本机与云端记录…");
    var userId = state.cloud.session.user.id;
    return state.cloud.client
      .from("reader_state")
      .select("position,bookmarks,bookmarks_updated_at,updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookName)
      .maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (!result.data) {
          return pushBookState(bookName).then(function () {
            return { positionChanged: false };
          });
        }

        var localPosition = getSavedProgress(bookName);
        var remotePosition = normalizePosition(result.data.position);
        var positionChanged = false;
        var shouldPush = false;
        if (remotePosition && (!localPosition || timestampValue(remotePosition.updatedAt) > timestampValue(localPosition.updatedAt))) {
          positionChanged = !localPosition || localPosition.cfi !== remotePosition.cfi;
          writeSavedProgress(bookName, remotePosition);
        } else if (localPosition && (!remotePosition || timestampValue(localPosition.updatedAt) > timestampValue(remotePosition.updatedAt))) {
          shouldPush = true;
        }

        var remoteBookmarks = dedupeBookmarks(result.data.bookmarks || []);
        shouldPush = chooseCloudBookmarks(bookName, remoteBookmarks, result.data.bookmarks_updated_at) || shouldPush;
        renderBookmarks();

        if (shouldPush) {
          return pushBookState(bookName).then(function () {
            return { positionChanged: positionChanged };
          });
        }
        setCloudUi("ready");
        return { positionChanged: positionChanged };
      }).catch(function () {
        setCloudUi("error", "云端记录读取失败，已继续使用本机进度。");
        return { positionChanged: false };
      });
  }

  function syncCurrentBookFromCloud() {
    if (!state.currentBook) return;
    var bookName = state.currentBook.name;
    syncBookFromCloud(bookName).then(function (result) {
      if (!result.positionChanged || !state.currentBook || state.currentBook.name !== bookName) return;
      displaySavedProgress(getSavedProgress(bookName), "已恢复云端进度");
    });
  }

  function loadCloudLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (cloudLibraryPromise) return cloudLibraryPromise;
    cloudLibraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = SUPABASE_CDN_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return cloudLibraryPromise;
  }

  function initializeCloud() {
    var config = window.EPUB_READER_CLOUD || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      setCloudUi("local");
      return Promise.resolve();
    }

    if (!window.supabase || !window.supabase.createClient) {
      setCloudUi("busy", "正在载入云同步组件…");
      return loadCloudLibrary().then(function () {
        if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase client unavailable");
        return initializeCloud();
      }).catch(function () {
        setCloudUi("error", "云同步组件载入失败，已使用本机保存。");
      });
    }

    try {
      state.cloud.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      state.cloud.enabled = true;
    } catch (error) {
      setCloudUi("error", "云同步配置无效，已使用本机保存。");
      return Promise.resolve();
    }

    var authListener = state.cloud.client.auth.onAuthStateChange(function (event, session) {
      state.cloud.session = session;
      setCloudUi(session ? "ready" : "local");
      if (session && event !== "INITIAL_SESSION") {
        window.setTimeout(syncCurrentBookFromCloud, 0);
      }
    });
    state.cloud.subscription = authListener.data.subscription;

    return state.cloud.client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      state.cloud.session = result.data.session;
      setCloudUi(state.cloud.session ? "ready" : "local");
    }).catch(function () {
      setCloudUi("error", "无法读取登录状态，已使用本机保存。");
    });
  }

  function sendMagicLink(email) {
    if (!state.cloud.client || !email) return Promise.resolve();
    elements.cloudSubmit.disabled = true;
    setCloudUi("busy", "正在发送登录链接…");
    return state.cloud.client.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: window.location.origin + "/tools/epub-reader/",
        shouldCreateUser: true
      }
    }).then(function (result) {
      if (result.error) throw result.error;
      setCloudUi("local", "登录链接已发送，请前往邮箱确认。");
    }).catch(function () {
      setCloudUi("error", "登录链接发送失败，请检查邮箱与 Supabase 设置。");
    }).finally(function () {
      elements.cloudSubmit.disabled = false;
    });
  }

  function renderBookList() {
    if (!state.books.length) {
      elements.list.innerHTML = '<p class="reader-empty">没有找到 EPUB 文件。</p>';
      return;
    }

    elements.list.innerHTML = state.books.map(function (book, index) {
      return [
        '<button class="book-item" type="button" data-book-index="' + index + '">',
        '<strong>Book ' + twoDigit(index + 1) + "</strong>",
        '<span>' + escapeHtml(cleanTitle(book.name)) + "</span>",
        '<small>' + escapeHtml(book.name) + "</small>",
        "</button>"
      ].join("");
    }).join("");

    elements.list.querySelectorAll("[data-book-index]").forEach(function (button) {
      button.addEventListener("click", function () {
        loadBook(state.books[Number(button.getAttribute("data-book-index"))]);
      });
    });
  }

  function renderToc() {
    var html = state.toc.length ? state.toc.map(function (item, index) {
      return [
        '<button class="toc-item level-' + Math.min(item.level, 3) + '" type="button" data-toc-index="' + index + '">',
        '<strong>' + twoDigit(index + 1) + "</strong>",
        '<span>' + escapeHtml(item.label) + "</span>",
        "</button>"
      ].join("");
    }).join("") : '<p class="reader-empty">当前书籍没有可用目录。</p>';

    elements.tocLists.forEach(function (list) {
      list.innerHTML = html;
      list.querySelectorAll("[data-toc-index]").forEach(function (button) {
        button.addEventListener("click", function () {
          var item = state.toc[Number(button.getAttribute("data-toc-index"))];
          if (!item || !item.href) return;
          setActiveTab("toc");
          setMenuOpen(false);
          display(item.href);
        });
      });
    });
  }

  function renderBookmarks() {
    if (!state.currentBook) {
      elements.bookmarkLists.forEach(function (list) {
        list.innerHTML = '<p class="reader-empty">当前书籍还没有书签。</p>';
      });
      return;
    }

    var bookmarks = getBookmarks(state.currentBook.name);
    if (!bookmarks.length) {
      elements.bookmarkLists.forEach(function (list) {
        list.innerHTML = '<p class="reader-empty">当前书籍还没有书签。</p>';
      });
      return;
    }

    var chapterCounts = {};
    var html = bookmarks.map(function (bookmark, index) {
      var percent = Number.isFinite(bookmark.percent) ? Math.round(bookmark.percent) + "%" : "位置";
      var chapter = compactLabel(bookmark.chapter, "书签");
      chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1;
      return [
        '<div class="bookmark-item">',
        '<button type="button" data-bookmark-index="' + index + '">',
        '<strong>' + escapeHtml(chapter + " " + twoDigit(chapterCounts[chapter])) + "</strong>",
        '<span>' + escapeHtml(percent + " · " + (bookmark.label || "阅读位置")) + "</span>",
        "</button>",
        '<button class="bookmark-remove" type="button" data-bookmark-remove="' + index + '" aria-label="删除书签">×</button>',
        "</div>"
      ].join("");
    }).join("");

    elements.bookmarkLists.forEach(function (list) {
      list.innerHTML = html;
      list.querySelectorAll("[data-bookmark-index]").forEach(function (button) {
        button.addEventListener("click", function () {
          var bookmark = bookmarks[Number(button.getAttribute("data-bookmark-index"))];
          if (bookmark && bookmark.cfi) {
            setMenuOpen(false);
            displayBookmark(bookmark);
          }
        });
      });

      list.querySelectorAll("[data-bookmark-remove]").forEach(function (button) {
        button.addEventListener("click", function () {
          var index = Number(button.getAttribute("data-bookmark-remove"));
          var bookmark = bookmarks[index];
          if (!bookmark) return;
          removeBookmark(state.currentBook.name, bookmark);
          renderBookmarks();
        });
      });
    });
  }

  function markActiveBook() {
    elements.list.querySelectorAll("[data-book-index]").forEach(function (button) {
      var book = state.books[Number(button.getAttribute("data-book-index"))];
      button.classList.toggle("is-active", !!state.currentBook && book.name === state.currentBook.name);
    });
  }

  function setActiveTab(name) {
    elements.tabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.getAttribute("data-reader-tab") === name);
    });
    elements.panels.forEach(function (panel) {
      panel.classList.toggle("is-active", panel.getAttribute("data-reader-panel") === name);
    });
  }

  function chapterForLocation(location) {
    if (!state.toc.length || !location || !location.start) return state.currentChapter || "";
    var href = location.start.href || "";
    var index = 0;
    for (var i = 0; i < state.toc.length; i += 1) {
      var tocHref = state.toc[i].href ? state.toc[i].href.split("#")[0] : "";
      if (tocHref && href && (href.indexOf(tocHref) !== -1 || tocHref.indexOf(href) !== -1)) {
        index = i;
      }
    }
    return state.toc[index] ? state.toc[index].label : state.currentChapter;
  }

  function currentLocationCfi(location) {
    if (!location) return "";
    if (location.start && location.start.cfi) return location.start.cfi;
    if (typeof location === "string") return location;
    return "";
  }

  function currentLocationEndCfi(location) {
    if (!location || !location.end || !location.end.cfi) return "";
    return location.end.cfi;
  }

  function currentLocationHref(location) {
    if (!location || !location.start || !location.start.href) return "";
    return location.start.href;
  }

  function currentPercent(location) {
    if (!location) return 0;
    if (typeof location.percentage === "number") return location.percentage * 100;
    if (location.start && typeof location.start.percentage === "number") return location.start.percentage * 100;
    if (state.locationsReady && state.book && state.book.locations && location.start && location.start.cfi) {
      try {
        return state.book.locations.percentageFromCfi(location.start.cfi) * 100;
      } catch (error) {
        return 0;
      }
    }
    return 0;
  }

  function updateLocation(location) {
    if (!state.currentBook) return;
    var cfi = currentLocationCfi(location);
    var percent = currentPercent(location);
    state.currentChapter = chapterForLocation(location) || state.currentChapter;
    state.selection = null;

    if (cfi && !state.isRestoring) savePosition(state.currentBook.name, cfi, location);
    setProgress(percent);
    setStatus(percent ? (state.isRestoring ? "正在恢复进度" : "已保存进度") : "正在阅读");
  }

  function display(target, silent) {
    if (!state.rendition || state.isRendering) return Promise.resolve(false);
    state.isRendering = true;
    return state.rendition.display(target || undefined).then(function () {
      return true;
    }).catch(function () {
      if (!silent) setStatus("无法跳转到该位置");
      return false;
    }).finally(function () {
      state.isRendering = false;
    });
  }

  function textContextFromRange(range, preferredText) {
    if (!range || !range.startContainer) {
      return { text: normalizeSearchText(preferredText), prefix: "", suffix: "" };
    }

    var doc = range.startContainer.ownerDocument;
    var rootNode = doc && doc.body;
    if (!rootNode || !doc.createTreeWalker) {
      return { text: normalizeSearchText(preferredText || range.toString()), prefix: "", suffix: "" };
    }

    var nodeFilter = doc.defaultView && doc.defaultView.NodeFilter ? doc.defaultView.NodeFilter : window.NodeFilter;
    var walker = doc.createTreeWalker(rootNode, nodeFilter.SHOW_TEXT, null);
    var rawText = "";
    var startIndex = -1;
    var endIndex = -1;
    var node;

    while ((node = walker.nextNode())) {
      if (node === range.startContainer) startIndex = rawText.length + range.startOffset;
      if (node === range.endContainer) endIndex = rawText.length + range.endOffset;
      rawText += node.nodeValue || "";
    }

    if (startIndex < 0) {
      return { text: normalizeSearchText(preferredText || range.toString()), prefix: "", suffix: "" };
    }

    var selectedText = normalizeSearchText(preferredText || range.toString());
    var text = selectedText || normalizeSearchText(rawText.slice(startIndex, startIndex + 180));
    var textEnd = selectedText && endIndex >= startIndex ? endIndex : startIndex + 180;
    return {
      text: text.slice(0, 180),
      prefix: normalizeSearchText(rawText.slice(Math.max(0, startIndex - 80), startIndex)).slice(-80),
      suffix: normalizeSearchText(rawText.slice(textEnd, textEnd + 80)).slice(0, 80)
    };
  }

  function getBookmarkContext(cfi, preferredText) {
    if (!state.book || !cfi || !state.book.getRange) {
      return Promise.resolve({ text: normalizeSearchText(preferredText), prefix: "", suffix: "" });
    }
    return state.book.getRange(cfi).then(function (range) {
      return textContextFromRange(range, preferredText);
    }).catch(function () {
      return { text: normalizeSearchText(preferredText), prefix: "", suffix: "" };
    });
  }

  function findTextCfi(contents, anchor) {
    var query = normalizeSearchText(anchor && anchor.text).toLowerCase();
    var prefix = normalizeSearchText(anchor && anchor.prefix).toLowerCase();
    var suffix = normalizeSearchText(anchor && anchor.suffix).toLowerCase();
    if (!contents || !contents.document || !contents.cfiFromRange || !query) return "";

    var doc = contents.document;
    var rootNode = doc.body;
    if (!rootNode || !doc.createTreeWalker) return "";
    var nodeFilter = doc.defaultView && doc.defaultView.NodeFilter ? doc.defaultView.NodeFilter : window.NodeFilter;
    var walker = doc.createTreeWalker(rootNode, nodeFilter.SHOW_TEXT, null);
    var normalized = "";
    var positions = [];
    var node;

    while ((node = walker.nextNode())) {
      var parentName = node.parentNode && node.parentNode.nodeName ? node.parentNode.nodeName.toLowerCase() : "";
      if (parentName === "script" || parentName === "style") continue;
      var value = node.nodeValue || "";
      for (var i = 0; i < value.length; i += 1) {
        var character = value.charAt(i);
        if (/\s/.test(character)) {
          if (!normalized || normalized.charAt(normalized.length - 1) === " ") continue;
          character = " ";
        } else {
          character = character.toLowerCase();
        }
        normalized += character;
        positions.push({ node: node, offset: i });
      }
    }

    var index = -1;
    var bestScore = -1;
    var searchFrom = 0;
    var candidate;
    while ((candidate = normalized.indexOf(query, searchFrom)) >= 0) {
      var before = normalized.slice(Math.max(0, candidate - prefix.length), candidate);
      var after = normalized.slice(candidate + query.length, candidate + query.length + suffix.length);
      var score = (prefix && before === prefix ? 1 : 0) + (suffix && after === suffix ? 1 : 0);
      if (score > bestScore) {
        index = candidate;
        bestScore = score;
      }
      if (score === 2) break;
      searchFrom = candidate + 1;
    }
    if (index < 0 || !positions[index] || !positions[index + query.length - 1]) return "";
    var start = positions[index];
    var end = positions[index + query.length - 1];
    var range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    return contents.cfiFromRange(range);
  }

  function recoverBookmarkCfi(bookmark) {
    var recoverFromText = function () {
      if (!bookmark.href || !bookmark.text) return Promise.resolve("");
      return display(bookmark.href, true).then(function (displayed) {
        if (!displayed || !state.rendition) return "";
        var contents = state.rendition.getContents ? state.rendition.getContents() : [];
        for (var i = 0; i < contents.length; i += 1) {
          var recoveredCfi = findTextCfi(contents[i], bookmark);
          if (recoveredCfi) return recoveredCfi;
        }
        return "";
      });
    };

    return recoverFromText().then(function (recoveredCfi) {
      if (recoveredCfi) return recoveredCfi;
      if (!state.locationsReady || !state.book || !state.book.locations) return "";
      if (!Number.isFinite(bookmark.percent)) return "";
      try {
        return state.book.locations.cfiFromPercentage(Math.max(0, Math.min(1, bookmark.percent / 100)));
      } catch (error) {
        return "";
      }
    });
  }

  function updateStoredBookmarkCfi(bookmark, cfi) {
    if (!state.currentBook || !bookmark || !cfi) return;
    var bookmarks = getBookmarks(state.currentBook.name);
    bookmarks.forEach(function (savedBookmark) {
      if (sameBookmark(savedBookmark, bookmark)) savedBookmark.cfi = cfi;
    });
    replaceBookmarks(state.currentBook.name, bookmarks);
    renderBookmarks();
  }

  function displaySavedProgress(position, successMessage) {
    var normalized = normalizePosition(position);
    if (!normalized) return display();
    return display(normalized.cfi, true).then(function (displayed) {
      if (displayed) {
        if (successMessage) setStatus(successMessage);
        return null;
      }
      setStatus("正在恢复精确阅读位置");
      return recoverBookmarkCfi(normalized);
    }).then(function (recoveredCfi) {
      if (recoveredCfi === null) return true;
      if (!recoveredCfi) {
        setStatus("原位置已变化，已打开最近章节");
        return false;
      }
      normalized.cfi = recoveredCfi;
      normalized.updatedAt = new Date().toISOString();
      if (state.currentBook) {
        writeSavedProgress(state.currentBook.name, normalized);
        scheduleCloudSave(state.currentBook.name);
      }
      return display(recoveredCfi).then(function (displayed) {
        if (displayed) setStatus(successMessage || "已通过文本锚点恢复进度");
        return displayed;
      });
    });
  }

  function displayBookmark(bookmark) {
    display(bookmark.cfi, true).then(function (displayed) {
      if (displayed) return null;
      setStatus("正在恢复书签位置");
      return recoverBookmarkCfi(bookmark);
    }).then(function (recoveredCfi) {
      if (recoveredCfi === null) return;
      if (!recoveredCfi) {
        if (!state.isRendering) setStatus("无法跳转到该书签");
        return;
      }
      updateStoredBookmarkCfi(bookmark, recoveredCfi);
      display(recoveredCfi).then(function (displayed) {
        if (displayed) setStatus("已通过书签后备信息恢复位置");
      });
    });
  }

  function turnPage(direction) {
    if (!state.rendition) return Promise.resolve();
    var result = direction === "next" ? state.rendition.next() : state.rendition.prev();
    return result && typeof result.then === "function" ? result : Promise.resolve(result);
  }

  function goPrevious() {
    if (!state.rendition || state.swipe.animating) return Promise.resolve();
    return completeSwipe("previous", 0);
  }

  function goNext() {
    if (!state.rendition || state.swipe.animating) return Promise.resolve();
    return completeSwipe("next", 0);
  }

  function clearSwipeStyles() {
    if (!elements.viewport || !elements.viewportWrap) return;
    if (state.swipe.resetTimer) {
      window.clearTimeout(state.swipe.resetTimer);
      state.swipe.resetTimer = 0;
    }
    if (state.swipe.frameId) {
      window.cancelAnimationFrame(state.swipe.frameId);
      state.swipe.frameId = 0;
    }
    elements.viewport.style.transform = "";
    elements.viewport.style.opacity = "";
    elements.viewport.style.transformOrigin = "";
    elements.viewport.classList.remove("is-swipe-snapback");
    elements.viewportWrap.classList.remove("is-swiping", "is-turning-next", "is-turning-previous");
    elements.viewportWrap.removeAttribute("data-swipe-direction");
    elements.viewportWrap.style.removeProperty("--swipe-progress");
    elements.viewportWrap.style.removeProperty("--swipe-start-x");
    elements.viewportWrap.style.removeProperty("--swipe-start-angle");
  }

  function snapBackSwipe() {
    state.swipe.active = false;
    elements.viewportWrap.classList.remove("is-swiping");
    elements.viewport.classList.add("is-swipe-snapback");
    elements.viewport.style.transform = "translate3d(0, 0, 0)";
    elements.viewport.style.opacity = "1";
    state.swipe.resetTimer = window.setTimeout(clearSwipeStyles, 190);
  }

  function renderSwipeDrag() {
    state.swipe.frameId = 0;
    if (!state.swipe.active) return;
    var width = state.swipe.viewportWidth || 600;
    var direction = state.swipe.dragX < 0 ? "next" : "previous";
    var progress = Math.min(1, Math.abs(state.swipe.dragX) / Math.max(72, width * 0.16));
    var visualX = state.swipe.dragX * 0.38;
    var angle = (direction === "next" ? -1 : 1) * progress * 3.2;
    elements.viewportWrap.setAttribute("data-swipe-direction", direction);
    elements.viewportWrap.style.setProperty("--swipe-progress", String(progress));
    elements.viewport.style.transformOrigin = direction === "next" ? "left center" : "right center";
    elements.viewport.style.transform = "perspective(1400px) translate3d(" + visualX + "px, 0, 0) rotateY(" + angle + "deg)";
  }

  function scheduleSwipeRender() {
    if (state.swipe.frameId) return;
    state.swipe.frameId = window.requestAnimationFrame(renderSwipeDrag);
  }

  function swipeMotionDuration() {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduceMotion ? 0 : 310;
  }

  function completeSwipe(direction, dragX) {
    var duration = swipeMotionDuration();
    var visualX = dragX * 0.38;
    var startAngle = (direction === "next" ? -1 : 1) * Math.min(3.2, Math.abs(dragX) / 28);
    state.swipe.active = false;
    state.swipe.animating = true;
    state.swipe.suppressClickUntil = Date.now() + duration + 220;
    if (state.swipe.resetTimer) {
      window.clearTimeout(state.swipe.resetTimer);
      state.swipe.resetTimer = 0;
    }
    if (state.swipe.frameId) {
      window.cancelAnimationFrame(state.swipe.frameId);
      state.swipe.frameId = 0;
    }
    elements.viewportWrap.style.setProperty("--swipe-start-x", visualX + "px");
    elements.viewportWrap.style.setProperty("--swipe-start-angle", startAngle + "deg");
    elements.viewportWrap.classList.remove("is-swiping");
    elements.viewportWrap.classList.add(direction === "next" ? "is-turning-next" : "is-turning-previous");
    elements.viewport.style.transform = "";
    elements.viewport.style.transformOrigin = "";

    var pageTurn = new Promise(function (resolve) {
      window.setTimeout(resolve, duration ? 86 : 0);
    }).then(function () {
      return turnPage(direction).catch(function () {
        return undefined;
      });
    });
    var motion = new Promise(function (resolve) {
      window.setTimeout(resolve, duration);
    });

    return Promise.all([pageTurn, motion]).finally(function () {
      state.swipe.animating = false;
      clearSwipeStyles();
    });
  }

  function startSwipe(event) {
    if (!state.rendition || state.menuOpen || state.swipe.animating) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    state.swipe.active = true;
    state.swipe.pointerId = event.pointerId;
    state.swipe.startX = event.clientX;
    state.swipe.startY = event.clientY;
    state.swipe.dragX = 0;
    state.swipe.viewportWidth = elements.viewportWrap.clientWidth || 600;
    state.swipe.startedAt = Date.now();
    if (state.swipe.resetTimer) {
      window.clearTimeout(state.swipe.resetTimer);
      state.swipe.resetTimer = 0;
    }
    elements.viewport.classList.remove("is-swipe-snapback");
    try {
      elements.viewportWrap.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is optional; touch-action still keeps horizontal gestures responsive.
    }
  }

  function moveSwipe(event) {
    if (!state.swipe.active || event.pointerId !== state.swipe.pointerId) return;
    var deltaX = event.clientX - state.swipe.startX;
    var deltaY = event.clientY - state.swipe.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2 && Math.abs(deltaX) < 18) {
      snapBackSwipe();
      return;
    }
    if (Math.abs(deltaX) < 5) return;

    var limit = Math.min(150, state.swipe.viewportWidth * 0.24);
    state.swipe.dragX = Math.max(-limit, Math.min(limit, deltaX));
    elements.viewportWrap.classList.add("is-swiping");
    scheduleSwipeRender();
    if (event.cancelable) event.preventDefault();
  }

  function endSwipe(event) {
    if (!state.swipe.active || event.pointerId !== state.swipe.pointerId) return;
    var deltaX = event.clientX - state.swipe.startX;
    var elapsed = Math.max(1, Date.now() - state.swipe.startedAt);
    var threshold = Math.min(76, state.swipe.viewportWidth * 0.12);
    var isFastSwipe = Math.abs(deltaX) > 28 && Math.abs(deltaX) / elapsed > 0.45;

    if (event.type !== "pointercancel" && (Math.abs(deltaX) >= threshold || isFastSwipe)) {
      completeSwipe(deltaX < 0 ? "next" : "previous", state.swipe.dragX);
    } else {
      snapBackSwipe();
    }
  }

  function isSwipeClickSuppressed(event) {
    return event.detail > 0 && Date.now() < state.swipe.suppressClickUntil;
  }

  function getLiveSelection() {
    if (!state.rendition || !state.rendition.getContents) return null;
    var contents = state.rendition.getContents();
    for (var i = 0; i < contents.length; i += 1) {
      var content = contents[i];
      var selection = content.window && content.window.getSelection ? content.window.getSelection() : null;
      if (!selection || selection.rangeCount < 1 || selection.isCollapsed) continue;
      var text = normalizeSearchText(selection.toString());
      if (!text || !content.cfiFromRange) continue;
      try {
        return {
          cfi: content.cfiFromRange(selection.getRangeAt(0)),
          text: text
        };
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function addBookmark() {
    if (!state.currentBook || !state.rendition) return;

    var location = state.rendition.currentLocation();
    var selection = getLiveSelection();
    state.selection = selection;
    var cfi = selection && selection.cfi ? selection.cfi : currentLocationCfi(location);
    if (!cfi) return;

    var bookName = state.currentBook.name;
    var chapter = state.currentChapter || "书签";
    var percent = currentPercent(location);
    var preferredText = selection && selection.text ? selection.text : "";
    setStatus("正在保存书签");
    getBookmarkContext(cfi, preferredText).then(function (context) {
      var bookmark = {
        cfi: cfi,
        endCfi: selection ? "" : currentLocationEndCfi(location),
        href: currentLocationHref(location),
        percent: percent,
        chapter: chapter,
        label: preferredText ? truncateText(preferredText, 42) : "第 " + Math.max(1, Math.round(percent)) + "% 处",
        text: context.text,
        prefix: context.prefix,
        suffix: context.suffix,
        createdAt: new Date().toISOString()
      };
      var cached = getBookmarks(bookName);
      var exists = cached.some(function (savedBookmark) {
        return sameBookmark(savedBookmark, bookmark);
      });

      if (!exists) mergeBookmarks(bookName, [bookmark]);
      if (state.currentBook && state.currentBook.name === bookName) {
        renderBookmarks();
        setActiveTab("bookmarks");
        setStatus(exists ? "该位置已在浏览器书签中" : "已添加书签");
      }
    });
  }

  function destroyCurrentBook() {
    if (state.rendition) {
      try {
        state.rendition.destroy();
      } catch (error) {
        // Epub.js can throw if an iframe is already gone during a fast switch.
      }
    }
    if (state.book) {
      try {
        state.book.destroy();
      } catch (error) {
        // Keep switching books responsive even if cleanup fails internally.
      }
    }
    state.book = null;
    state.rendition = null;
    state.locationsReady = false;
    state.pendingCfi = "";
    state.isRendering = false;
    state.toc = [];
    state.currentChapter = "";
    state.selection = null;
    state.positionRevision += 1;
    state.isRestoring = false;
  }

  function loadBook(bookInfo) {
    if (!bookInfo || !window.ePub) {
      setStatus("阅读器依赖未加载");
      return;
    }

    destroyCurrentBook();
    state.currentBook = bookInfo;
    try {
      localStorage.setItem(STORAGE_PREFIX + "last-book", bookInfo.name);
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
    elements.titles.forEach(function (title) {
      title.textContent = cleanTitle(bookInfo.name);
    });
    elements.viewport.innerHTML = "";
    setProgress(0);
    setStatus("正在打开 EPUB");
    elements.tocLists.forEach(function (list) {
      list.innerHTML = '<p class="reader-empty">正在读取目录...</p>';
    });
    markActiveBook();
    renderBookmarks();

    var savedProgress = getSavedProgress(bookInfo.name);
    state.pendingCfi = savedProgress ? savedProgress.cfi : "";
    state.book = window.ePub(bookInfo.url);
    state.rendition = state.book.renderTo(elements.viewport, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      manager: "default",
      spread: "none"
    });

    applyBookTheme();

    state.rendition.on("relocated", updateLocation);
    state.rendition.on("rendered", function () {
      setStatus("正在阅读");
    });
    state.rendition.on("keyup", function (event) {
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
    });
    state.rendition.on("selected", function (cfiRange, contents) {
      var selection = contents && contents.window ? contents.window.getSelection() : null;
      var text = selection ? normalizeSearchText(selection.toString()) : "";
      state.selection = cfiRange && text ? {
        cfi: cfiRange,
        text: text
      } : null;
      if (state.selection) setStatus("已选中文字，可添加精确书签");
    });

    state.book.loaded.navigation.then(function (navigation) {
      state.toc = flattenToc(navigation && navigation.toc ? navigation.toc : [], 0, []);
      state.currentChapter = state.toc[0] ? state.toc[0].label : "";
      renderToc();
    }).catch(function () {
      state.toc = [];
      renderToc();
    });

    state.book.ready.then(function () {
      return state.book.locations.generate(1200);
    }).then(function () {
      state.locationsReady = true;
      if (state.rendition) updateLocation(state.rendition.currentLocation());
    }).catch(function () {
      setStatus("目录位置生成失败，仍可阅读");
    });

    state.isRestoring = true;
    displaySavedProgress(savedProgress, savedProgress ? "已恢复本机进度" : "正在阅读").finally(function () {
      if (!state.currentBook || state.currentBook.name !== bookInfo.name) return;
      state.isRestoring = false;
      syncBookFromCloud(bookInfo.name).then(function (result) {
        if (!result.positionChanged || !state.currentBook || state.currentBook.name !== bookInfo.name) return;
        displaySavedProgress(getSavedProgress(bookInfo.name), "已恢复云端进度");
      });
    });
  }

  function normalizeBooks(items) {
    return items.filter(function (item) {
      return item && item.name && /\.epub$/i.test(item.name);
    }).map(function (item) {
      return {
        name: item.name,
        url: encodeBookUrl(item.name)
      };
    }).sort(function (left, right) {
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }

  function fetchManifest() {
    return fetch("/" + BOOK_DIR + "/index.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("manifest not found");
        return response.json();
      });
  }

  function fetchGithubBooks() {
    var controller = window.AbortController ? new AbortController() : null;
    var timeout = controller ? window.setTimeout(function () {
      controller.abort();
    }, 6000) : null;

    return fetch(GITHUB_CONTENTS_URL, {
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) throw new Error("github contents unavailable");
        return response.json();
      }).finally(function () {
        if (timeout) window.clearTimeout(timeout);
      });
  }

  function mergeBookSources(sources) {
    var seen = {};
    return sources.reduce(function (merged, source) {
      normalizeBooks(source || []).forEach(function (book) {
        if (seen[book.name]) return;
        seen[book.name] = true;
        merged.push(book);
      });
      return merged;
    }, []).sort(function (left, right) {
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }

  function loadLibrary() {
    setStatus("正在读取书库");
    elements.list.innerHTML = '<p class="reader-empty">正在读取书库...</p>';

    Promise.allSettled([fetchGithubBooks(), fetchManifest()]).then(function (results) {
      var sources = results.filter(function (result) {
        return result.status === "fulfilled";
      }).map(function (result) {
        return result.value;
      });

      if (!sources.length) throw new Error("no book sources");

      state.books = mergeBookSources(sources);
      renderBookList();
      setStatus(state.books.length ? "请选择书籍" : "没有 EPUB 文件");
      var lastBookName = localStorage.getItem(STORAGE_PREFIX + "last-book");
      var initialBook = state.books.find(function (book) {
        return book.name === lastBookName;
      }) || state.books[0];

      if (initialBook) loadBook(initialBook);
    }).catch(function () {
      elements.list.innerHTML = '<p class="reader-empty">书库读取失败，请检查网络或 index.json。</p>';
      setStatus("书库读取失败");
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  root.querySelectorAll("[data-reader-prev]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      if (!isSwipeClickSuppressed(event)) goPrevious();
    });
  });

  root.querySelectorAll("[data-reader-next]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      if (!isSwipeClickSuppressed(event)) goNext();
    });
  });

  if (elements.menuToggle) {
    elements.menuToggle.addEventListener("click", function (event) {
      if (isSwipeClickSuppressed(event)) return;
      setMenuOpen(true);
    });
  }

  if (elements.viewportWrap && window.PointerEvent) {
    elements.viewportWrap.addEventListener("pointerdown", startSwipe);
    elements.viewportWrap.addEventListener("pointermove", moveSwipe);
    elements.viewportWrap.addEventListener("pointerup", endSwipe);
    elements.viewportWrap.addEventListener("pointercancel", endSwipe);
  }

  elements.menuClose.forEach(function (button) {
    button.addEventListener("click", function () {
      setMenuOpen(false);
    });
  });

  elements.tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setActiveTab(tab.getAttribute("data-reader-tab"));
    });
  });

  elements.fontSmaller.forEach(function (button) {
    button.addEventListener("click", function () {
      setFontSize(state.fontSize - 5);
    });
  });

  elements.fontLarger.forEach(function (button) {
    button.addEventListener("click", function () {
      setFontSize(state.fontSize + 5);
    });
  });

  elements.theme.forEach(function (button) {
    button.addEventListener("click", toggleTheme);
  });

  elements.fullscreen.forEach(function (button) {
    button.addEventListener("click", toggleFullscreen);
  });
  document.addEventListener("fullscreenchange", syncFullscreenState);

  elements.bookmark.forEach(function (button) {
    button.addEventListener("click", addBookmark);
  });
  elements.resume.addEventListener("click", function () {
    if (state.currentBook) displaySavedProgress(getSavedProgress(state.currentBook.name), "已回到保存进度");
  });
  elements.refresh.addEventListener("click", loadLibrary);
  elements.clearBookmarks.addEventListener("click", function () {
    if (!state.currentBook) return;
    replaceBookmarks(state.currentBook.name, []);
    renderBookmarks();
    setStatus("已清空书签");
  });

  if (elements.cloudForm) {
    elements.cloudForm.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMagicLink(elements.cloudEmail.value.trim());
    });
  }

  if (elements.cloudSignOut) {
    elements.cloudSignOut.addEventListener("click", function () {
      if (!state.cloud.client) return;
      setCloudUi("busy", "正在退出云同步账户…");
      state.cloud.client.auth.signOut().then(function (result) {
        if (result.error) throw result.error;
        state.cloud.session = null;
        setCloudUi("local", "已退出，后续记录只保存在本机。");
      }).catch(function () {
        setCloudUi("error", "退出失败，请稍后重试。");
      });
    });
  }

  document.addEventListener("keydown", function (event) {
    var tagName = event.target && event.target.tagName ? event.target.tagName : "";
    if (!state.rendition || /input|textarea|select/i.test(tagName)) return;
    if (event.key === "Escape") setMenuOpen(false);
    if (event.key === "ArrowLeft") goPrevious();
    if (event.key === "ArrowRight") goNext();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && state.currentBook) {
      flushScheduledCloudSave(state.currentBook.name);
    }
  });

  window.addEventListener("beforeunload", function () {
    if (!state.currentBook) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "last-book", state.currentBook.name);
    } catch (error) {
      // Some private browsing modes disable localStorage during unload.
    }
  });

  if (!window.ePub) {
    setStatus("阅读器依赖未加载");
    elements.list.innerHTML = '<p class="reader-empty">epub.js 未加载，请检查本地依赖文件。</p>';
    return;
  }

  setFontSize(localStorage.getItem(STORAGE_PREFIX + "font-size") || 105);
  setTheme(localStorage.getItem(STORAGE_PREFIX + "theme") || "day");
  initializeCloud().finally(loadLibrary);
})();
