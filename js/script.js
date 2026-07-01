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
