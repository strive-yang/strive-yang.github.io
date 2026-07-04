(function () {
  var root = document.querySelector("[data-epub-reader]");
  if (!root) return;

  var OWNER = "strive-yang";
  var REPO = "strive-yang.github.io";
  var BOOK_DIR = "tools/booklist";
  var STORAGE_PREFIX = "ys:epub-reader:";
  var GITHUB_CONTENTS_URL = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + BOOK_DIR;

  var elements = {
    list: root.querySelector("[data-book-list]"),
    refresh: root.querySelector("[data-reader-refresh]"),
    viewport: root.querySelector("[data-reader-viewport]"),
    title: root.querySelector("[data-reader-title]"),
    status: root.querySelector("[data-reader-status]"),
    progress: root.querySelector("[data-reader-progress]"),
    progressBar: root.querySelector("[data-reader-progress-bar]"),
    bookmark: root.querySelectorAll("[data-reader-bookmark]"),
    fontSmaller: root.querySelector("[data-reader-font-smaller]"),
    fontLarger: root.querySelector("[data-reader-font-larger]"),
    fontSize: root.querySelector("[data-reader-font-size]"),
    theme: root.querySelectorAll("[data-reader-theme]"),
    themeLabel: root.querySelector("[data-reader-theme-label]"),
    fullscreen: root.querySelectorAll("[data-reader-fullscreen]"),
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
    panels: root.querySelectorAll("[data-reader-panel]")
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
    currentChapter: ""
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
    if (elements.fontSize) elements.fontSize.textContent = state.fontSize + "%";
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
    if (elements.themeLabel) elements.themeLabel.textContent = state.theme === "night" ? "夜" : "日";
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
  }

  function setStatus(message) {
    if (elements.status) elements.status.textContent = message;
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

  function getSavedPosition(bookName) {
    return localStorage.getItem(storageKey(bookName, "position")) || "";
  }

  function savePosition(bookName, cfi) {
    if (!bookName || !cfi) return;
    try {
      localStorage.setItem(storageKey(bookName, "position"), cfi);
    } catch (error) {
      setStatus("浏览器无法保存本地记录");
    }
  }

  function getBookmarks(bookName) {
    if (!bookName) return [];
    return readJson(storageKey(bookName, "bookmarks"), []);
  }

  function saveBookmarks(bookName, bookmarks) {
    if (!bookName) return;
    writeJson(storageKey(bookName, "bookmarks"), bookmarks);
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
      var percent = bookmark.percent ? Math.round(bookmark.percent) + "%" : "位置";
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
            display(bookmark.cfi);
          }
        });
      });

      list.querySelectorAll("[data-bookmark-remove]").forEach(function (button) {
        button.addEventListener("click", function () {
          var index = Number(button.getAttribute("data-bookmark-remove"));
          bookmarks.splice(index, 1);
          saveBookmarks(state.currentBook.name, bookmarks);
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

    if (cfi) savePosition(state.currentBook.name, cfi);
    setProgress(percent);
    setStatus(percent ? "已保存进度" : "正在阅读");
  }

  function display(target) {
    if (!state.rendition || state.isRendering) return;
    state.isRendering = true;
    state.rendition.display(target || undefined).catch(function () {
      setStatus("无法跳转到该位置");
    }).finally(function () {
      state.isRendering = false;
    });
  }

  function goPrevious() {
    if (!state.rendition) return;
    state.rendition.prev();
  }

  function goNext() {
    if (!state.rendition) return;
    state.rendition.next();
  }

  function addBookmark() {
    if (!state.currentBook || !state.rendition) return;

    var location = state.rendition.currentLocation();
    var cfi = currentLocationCfi(location);
    if (!cfi) return;

    var percent = currentPercent(location);
    var bookmarks = getBookmarks(state.currentBook.name);
    var exists = bookmarks.some(function (bookmark) {
      return bookmark.cfi === cfi;
    });

    if (!exists) {
      bookmarks.unshift({
        cfi: cfi,
        percent: percent,
        chapter: state.currentChapter || "书签",
        label: "第 " + Math.max(1, Math.round(percent)) + "% 处",
        createdAt: new Date().toISOString()
      });
      saveBookmarks(state.currentBook.name, bookmarks.slice(0, 50));
    }

    renderBookmarks();
    setActiveTab("bookmarks");
    setStatus(exists ? "该位置已在书签中" : "已添加书签");
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
    elements.title.textContent = cleanTitle(bookInfo.name);
    elements.viewport.innerHTML = "";
    setProgress(0);
    setStatus("正在打开 EPUB");
    elements.tocLists.forEach(function (list) {
      list.innerHTML = '<p class="reader-empty">正在读取目录...</p>';
    });
    markActiveBook();
    renderBookmarks();

    var savedPosition = getSavedPosition(bookInfo.name);
    state.pendingCfi = savedPosition;
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

    display(savedPosition);
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
    button.addEventListener("click", goPrevious);
  });

  root.querySelectorAll("[data-reader-next]").forEach(function (button) {
    button.addEventListener("click", goNext);
  });

  if (elements.menuToggle) {
    elements.menuToggle.addEventListener("click", function () {
      setMenuOpen(true);
    });
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

  if (elements.fontSmaller) {
    elements.fontSmaller.addEventListener("click", function () {
      setFontSize(state.fontSize - 5);
    });
  }

  if (elements.fontLarger) {
    elements.fontLarger.addEventListener("click", function () {
      setFontSize(state.fontSize + 5);
    });
  }

  elements.theme.forEach(function (button) {
    button.addEventListener("click", toggleTheme);
  });

  elements.fullscreen.forEach(function (button) {
    button.addEventListener("click", toggleFullscreen);
  });

  elements.bookmark.forEach(function (button) {
    button.addEventListener("click", addBookmark);
  });
  elements.resume.addEventListener("click", function () {
    if (state.currentBook) display(getSavedPosition(state.currentBook.name));
  });
  elements.refresh.addEventListener("click", loadLibrary);
  elements.clearBookmarks.addEventListener("click", function () {
    if (!state.currentBook) return;
    saveBookmarks(state.currentBook.name, []);
    renderBookmarks();
    setStatus("已清空书签");
  });

  document.addEventListener("keydown", function (event) {
    var tagName = event.target && event.target.tagName ? event.target.tagName : "";
    if (!state.rendition || /input|textarea|select/i.test(tagName)) return;
    if (event.key === "Escape") setMenuOpen(false);
    if (event.key === "ArrowLeft") goPrevious();
    if (event.key === "ArrowRight") goNext();
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
  loadLibrary();
})();
