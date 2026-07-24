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
    currentChapter: "",
    selection: null,
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
    return dedupeBookmarks(readJson(storageKey(bookName, "bookmarks"), []));
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
    return merged;
  }

  function replaceBookmarks(bookName, bookmarks) {
    if (!bookName) return;
    writeJson(storageKey(bookName, "bookmarks"), dedupeBookmarks(bookmarks));
  }

  function removeBookmark(bookName, bookmark) {
    var cached = getBookmarks(bookName);
    replaceBookmarks(bookName, cached.filter(function (savedBookmark) {
      return !sameBookmark(savedBookmark, bookmark);
    }));
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

    if (cfi) savePosition(state.currentBook.name, cfi);
    setProgress(percent);
    setStatus(percent ? "已保存进度" : "正在阅读");
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

  function findTextCfi(contents, text) {
    var query = normalizeSearchText(text).toLowerCase();
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

    var index = normalized.indexOf(query);
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
          var recoveredCfi = findTextCfi(contents[i], bookmark.text);
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

  function addBookmark() {
    if (!state.currentBook || !state.rendition) return;

    var location = state.rendition.currentLocation();
    var selection = state.selection;
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
    if (state.currentBook) display(getSavedPosition(state.currentBook.name));
  });
  elements.refresh.addEventListener("click", loadLibrary);
  elements.clearBookmarks.addEventListener("click", function () {
    if (!state.currentBook) return;
    replaceBookmarks(state.currentBook.name, []);
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
