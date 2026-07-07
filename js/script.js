(function () {
  var header = document.querySelector("[data-header]");
  var nav = document.querySelector("[data-site-nav]");
  var navToggle = document.querySelector("[data-nav-toggle]");

  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  }

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.tagName !== "A") return;
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  var copyButtons = document.querySelectorAll("[data-copy-value]");

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        if (document.execCommand("copy")) {
          resolve();
        } else {
          reject(new Error("Copy command failed"));
        }
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  copyButtons.forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();

      var value = button.getAttribute("data-copy-value") || "";
      var originalText = button.textContent;
      if (!value) return;

      copyText(value).then(function () {
        button.textContent = "Copied";
        button.classList.add("is-copied");
        window.setTimeout(function () {
          button.textContent = originalText;
          button.classList.remove("is-copied");
        }, 1600);
      }).catch(function () {
        button.textContent = "Failed";
        window.setTimeout(function () {
          button.textContent = originalText;
        }, 1800);
      });
    });
  });

  var postLists = document.querySelectorAll("[data-post-list]");

  function formatPostDate(dateText) {
    return String(dateText || "").replace(/-/g, ".");
  }

  function sortPosts(posts) {
    return posts.slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  }

  function getFilteredPosts(list, posts) {
    var year = list.getAttribute("data-post-year");
    var month = list.getAttribute("data-post-month");
    var limit = Number(list.getAttribute("data-post-limit")) || 0;

    var filtered = posts.filter(function (post) {
      var parts = String(post.date || "").split("-");
      if (year && parts[0] !== year) return false;
      if (month && parts[1] !== month) return false;
      return true;
    });

    return limit > 0 ? filtered.slice(0, limit) : filtered;
  }

  function renderTimeline(list, posts) {
    list.innerHTML = "";

    if (!posts.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "当前时间范围内暂无文章。";
      list.appendChild(empty);
      return;
    }

    posts.forEach(function (post) {
      var item = document.createElement("a");
      var time = document.createElement("time");
      var title = document.createElement("span");
      var summary = document.createElement("small");

      item.className = "timeline-item";
      item.href = post.url || "/blog/";
      time.dateTime = post.date || "";
      time.textContent = formatPostDate(post.date);
      title.textContent = post.title || "Untitled";
      summary.textContent = post.summary || "";

      item.appendChild(time);
      item.appendChild(title);
      item.appendChild(summary);
      list.appendChild(item);
    });
  }

  function renderCards(list, posts) {
    list.innerHTML = "";

    if (!posts.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "暂无文章。";
      list.appendChild(empty);
      return;
    }

    posts.forEach(function (post) {
      var card = document.createElement("article");
      var meta = document.createElement("p");
      var title = document.createElement("h3");
      var summary = document.createElement("p");
      var link = document.createElement("a");

      card.className = "article-card";
      meta.className = "article-meta-line";
      meta.textContent = formatPostDate(post.date) + " · " + (post.category || "Blog");
      title.textContent = post.title || "Untitled";
      summary.textContent = post.summary || "";
      link.className = "card-link";
      link.href = post.url || "/blog/";
      link.textContent = "Read article";

      card.appendChild(meta);
      card.appendChild(title);
      card.appendChild(summary);
      card.appendChild(link);
      list.appendChild(card);
    });
  }

  function renderPostLists(posts) {
    var sorted = sortPosts(posts);

    postLists.forEach(function (list) {
      var filtered = getFilteredPosts(list, sorted);
      if (list.getAttribute("data-post-list") === "cards") {
        renderCards(list, filtered);
      } else {
        renderTimeline(list, filtered);
      }
    });
  }

  if (postLists.length && window.fetch) {
    fetch("/blog/posts.json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to load posts");
        return response.json();
      })
      .then(function (posts) {
        renderPostLists(Array.isArray(posts) ? posts : []);
      })
      .catch(function () {
        // Keep the static fallback content when posts.json is unavailable.
      });
  }

  var commissionInput = document.querySelector("[data-commission-input]");
  var commissionCalc = document.querySelector("[data-commission-calc]");
  var commissionTotal = document.querySelector("[data-commission-total]");
  var commissionSales = document.querySelector("[data-commission-sales]");
  var commissionRate = document.querySelector("[data-commission-rate]");
  var commissionBreakdown = document.querySelector("[data-commission-breakdown]");
  var quickAmountButtons = document.querySelectorAll("[data-quick-amount]");

  function formatCurrency(value) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2
    }).format(value);
  }

  function parseAmount(value) {
    var normalized = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    var parts = normalized.split(".");
    if (parts.length > 2) {
      normalized = parts.shift() + "." + parts.join("");
    }
    return Math.max(0, Number(normalized) || 0);
  }

  function formatInputAmount(value) {
    var raw = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    var parts = raw.split(".");
    var integerPart = parts.shift() || "";
    var decimalPart = parts.length ? "." + parts.join("").slice(0, 2) : "";

    if (!integerPart && decimalPart) integerPart = "0";

    return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + decimalPart;
  }

  function formatPlainAmount(value) {
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 2
    }).format(value);
  }

  function calculateCommission(amount) {
    var tiers = [
      { from: 0, to: 50000, rate: 0.05 },
      { from: 50000, to: 100000, rate: 0.06 },
      { from: 100000, to: 150000, rate: 0.07 },
      { from: 150000, to: 200000, rate: 0.08 },
      { from: 200000, to: Infinity, rate: 0.09 }
    ];

    return tiers.map(function (tier) {
      var taxable = Math.max(0, Math.min(amount, tier.to) - tier.from);
      return {
        label: tier.to === Infinity
          ? formatPlainAmount(tier.from) + " 以上"
          : formatPlainAmount(tier.from) + "-" + formatPlainAmount(tier.to),
        rate: tier.rate,
        taxable: taxable,
        commission: taxable * tier.rate
      };
    });
  }

  function renderCommission() {
    if (!commissionInput || !commissionTotal || !commissionBreakdown) return;

    var amount = parseAmount(commissionInput.value);
    var rows = calculateCommission(amount);
    var total = rows.reduce(function (sum, row) {
      return sum + row.commission;
    }, 0);
    var effectiveRate = amount > 0 ? (total / amount) * 100 : 0;

    commissionTotal.textContent = formatCurrency(total);
    commissionSales.textContent = formatCurrency(amount);
    commissionRate.textContent = effectiveRate.toFixed(2) + "%";
    commissionBreakdown.innerHTML = rows.map(function (row) {
      return [
        '<div class="breakdown-row">',
        "<span>" + row.label + "</span>",
        "<span>" + (row.rate * 100).toFixed(0) + "%</span>",
        "<span>" + formatCurrency(row.taxable) + "</span>",
        "<span>" + formatCurrency(row.commission) + "</span>",
        "</div>"
      ].join("");
    }).join("");
  }

  if (commissionInput) {
    commissionInput.addEventListener("input", function () {
      commissionInput.value = formatInputAmount(commissionInput.value);
      renderCommission();
    });
    if (commissionCalc) {
      commissionCalc.addEventListener("click", renderCommission);
    }
    quickAmountButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        commissionInput.value = formatInputAmount(button.getAttribute("data-quick-amount"));
        renderCommission();
      });
    });
    renderCommission();
  }

  var canvas = document.querySelector("[data-network-canvas]");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var context = canvas.getContext("2d");
  var points = [];
  var width = 0;
  var height = 0;

  function resizeCanvas() {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    var count = Math.max(46, Math.floor((width * height) / 23000));
    points = Array.from({ length: count }, function () {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 1.6
      };
    });
  }

  function drawNetwork() {
    context.clearRect(0, 0, width, height);

    for (var i = 0; i < points.length; i += 1) {
      var point = points[i];

      context.beginPath();
      context.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      context.fillStyle = "rgba(15, 159, 122, 0.42)";
      context.fill();

      for (var j = i + 1; j < points.length; j += 1) {
        var next = points[j];
        var dx = point.x - next.x;
        var dy = point.y - next.y;
        var distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 138) {
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(next.x, next.y);
          context.strokeStyle = "rgba(0, 119, 181, " + (0.16 * (1 - distance / 138)) + ")";
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }
  }

  window.addEventListener("resize", function () {
    resizeCanvas();
    drawNetwork();
  });

  resizeCanvas();
  drawNetwork();
})();
