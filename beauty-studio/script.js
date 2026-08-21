/* =========================================================================
   Maison Éclat — Interaktionen
   Lenis (Smooth Scroll) + GSAP ScrollTrigger + SplitType + Spline 3D.
   Alles defensiv: fällt eine CDN-Library aus, bleibt die Seite bedienbar.
   ========================================================================= */
(function () {
  "use strict";

  /* --------------------------------------------------------------- Setup */
  var hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = (navigator.connection && navigator.connection.saveData) === true;
  var isTouch = window.matchMedia("(hover: none)").matches;

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------- Lenis Smooth Scroll */
  var lenis = null;

  function initLenis() {
    if (typeof window.Lenis === "undefined" || prefersReduced) return null;

    lenis = new Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      touchMultiplier: 1.6
    });

    if (hasGSAP) {
      // Lenis und GSAP teilen sich einen Ticker (kein zweiter rAF-Loop).
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    return lenis;
  }

  initLenis();

  /* ------------------------------------------------------ Anker-Scrollen */
  document.querySelectorAll("[data-scroll-to]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      var id = link.getAttribute("href");
      if (!id || id.charAt(0) !== "#") return;
      var target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      var offset = id === "#top" ? 0 : -(parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--header-h")) || 64);

      if (lenis) {
        lenis.scrollTo(target, { offset: offset, duration: 1.2 });
      } else {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
      }
      // Fokus mitnehmen (Tastaturbedienung)
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  });

  /* ------------------------------------------------------ Header-Zustand */
  var header = document.getElementById("siteHeader");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ====================================================== SPLINE 3D-SZENE
     Wird erst nach dem Laden der Seite nachgezogen, damit der LCP
     (die Headline) nicht auf ein ~2 MB Renderer-Bundle warten muss.
     Schlägt das Laden fehl, bleibt das CSS-Objekt (#orb) stehen.
     ===================================================================== */
  var VIEWER_SRC = "https://cdn.jsdelivr.net/npm/@splinetool/viewer@1.9.82/build/spline-viewer.js";
  var stage = document.getElementById("splineStage");
  var splineViewer = null;

  function loadSpline() {
    if (!stage) return;
    var url = stage.dataset.splineUrl;
    if (!url) return;

    // Auf schwachen/sparsamen Geräten gar nicht erst laden.
    var weak = saveData || prefersReduced ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
      (navigator.connection && /2g/.test(navigator.connection.effectiveType || ""));
    if (weak) return;

    var module = document.createElement("script");
    module.type = "module";
    module.src = VIEWER_SRC;
    module.onerror = function () { stage.classList.remove("is-live"); };
    document.head.appendChild(module);

    splineViewer = document.createElement("spline-viewer");
    splineViewer.setAttribute("url", url);
    splineViewer.setAttribute("loading-anim-type", "none");
    splineViewer.setAttribute("events-target", "global");
    splineViewer.addEventListener("load-complete", function () {
      stage.classList.add("is-live");
      if (hasGSAP) ScrollTrigger.refresh();
    });
    splineViewer.addEventListener("error", function () { stage.classList.remove("is-live"); });

    // Sicherheitsnetz: kommt nach 9 s kein load-complete, bleibt der Fallback.
    setTimeout(function () {
      if (!stage.classList.contains("is-live")) splineViewer.style.display = "none";
    }, 9000);

    stage.querySelector(".stage__inner").appendChild(splineViewer);
  }

  if (document.readyState === "complete") {
    setTimeout(loadSpline, 0);
  } else {
    window.addEventListener("load", function () { setTimeout(loadSpline, 200); });
  }

  /**
   * Scroll-Fortschritt an die 3D-Szene weiterreichen.
   * In Spline eine Variable `scrollProgress` (Number, 0–1) anlegen und
   * z. B. an die Y-Rotation des Objekts binden.
   */
  function pushScrollProgress(progress) {
    var orb = document.getElementById("orb");
    if (orb) orb.style.setProperty("--orb-spin", (progress * 720).toFixed(2) + "deg");

    if (!splineViewer) return;
    try {
      var app = splineViewer.application || splineViewer._spline || splineViewer;
      if (app && typeof app.setVariable === "function") {
        app.setVariable("scrollProgress", progress);
      }
    } catch (err) {
      /* Variable existiert in der Szene nicht — bewusst ignorieren. */
    }
  }

  /* ------------------------------------------------------- Formular ---- */
  var form = document.getElementById("bookingForm");
  if (form) {
    var status = document.getElementById("formStatus");

    var markInvalid = function (input, invalid) {
      var field = input.closest(".field");
      var error = form.querySelector('[data-error-for="' + input.id + '"]');
      if (field) field.classList.toggle("field--invalid", invalid);
      if (error) error.hidden = !invalid;
      input.setAttribute("aria-invalid", invalid ? "true" : "false");
    };

    form.querySelectorAll("input, textarea").forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.getAttribute("aria-invalid") === "true") markInvalid(input, !input.checkValidity());
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var firstInvalid = null;

      form.querySelectorAll("input, select, textarea").forEach(function (input) {
        var invalid = !input.checkValidity();
        markInvalid(input, invalid);
        if (invalid && !firstInvalid) firstInvalid = input;
      });

      if (firstInvalid) {
        status.textContent = "";
        firstInvalid.focus();
        return;
      }

      /*  Demo ohne Backend. Zum Scharfschalten reicht eines davon:
          - Netlify:  <form name="booking" data-netlify="true"> ... </form>
          - Formspree: form.action = "https://formspree.io/f/XXXX"; method="POST"
          - Eigene API: fetch("/api/booking", { method: "POST", body: new FormData(form) })  */
      status.textContent = "Danke! Ihre Anfrage ist notiert — wir melden uns innerhalb eines Werktags.";
      form.reset();
      if (hasGSAP && !prefersReduced) {
        gsap.fromTo(status, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
      }
    });
  }

  /* ================================================ SCROLL-INSZENIERUNG */
  if (!hasGSAP) return;

  var mm = gsap.matchMedia();

  /* --- 1. Hero: Intro + 3D-Bühne ------------------------------------- */
  var heroFades = gsap.utils.toArray("[data-hero-fade]");

  if (prefersReduced) {
    gsap.set(heroFades, { opacity: 1, y: 0 });
  } else {
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .from(heroFades, { opacity: 0, y: 26, duration: 0.9, stagger: 0.09, delay: 0.15 });
  }

  // Fortschritt über die gesamte Seite → Rotation der Szene
  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    onUpdate: function (self) { pushScrollProgress(self.progress); }
  });

  // Bühne nach dem Hero ausblenden (sie ist fixed und läge sonst darunter).
  if (stage) {
    ScrollTrigger.create({
      trigger: "#hero",
      start: "bottom 80%",
      end: "bottom 20%",
      scrub: true,
      animation: gsap.fromTo(stage, { autoAlpha: 1 }, { autoAlpha: 0, ease: "none" })
    });
  }

  /* --- 2. Features: gestaffeltes Fade-In ------------------------------ */
  var features = gsap.utils.toArray("#featureCards .feature");

  if (prefersReduced) {
    gsap.set(features, { opacity: 1, y: 0 });
  } else {
    gsap.set(features, { opacity: 0, y: 48 });
    ScrollTrigger.create({
      trigger: "#featureCards",
      start: "top 82%",
      once: true,
      animation: gsap.to(features, {
        opacity: 1,
        y: 0,
        duration: 0.85,
        ease: "power3.out",
        stagger: 0.16
      })
    });
  }

  /* --- 3. Social Proof: horizontaler Parallax -------------------------- */
  gsap.utils.toArray("[data-proof-row]").forEach(function (row) {
    var dir = parseFloat(row.dataset.proofRow) || 1;
    // Distanz an die Überbreite der Reihe koppeln, damit nie Leerraum entsteht.
    var travel = Math.min(row.scrollWidth - window.innerWidth, 420) * 0.9;
    if (travel < 60) travel = 120;

    ScrollTrigger.create({
      trigger: "#proof",
      start: "top bottom",
      end: "bottom top",
      scrub: prefersReduced ? false : 1,
      invalidateOnRefresh: true,
      animation: gsap.fromTo(
        row,
        { x: dir * travel * 0.5 },
        { x: dir * -travel * 0.5, ease: "none" }
      )
    });
  });

  var proofBits = gsap.utils.toArray("[data-proof-quote]");
  if (prefersReduced) {
    gsap.set(proofBits, { opacity: 1, y: 0 });
  } else {
    gsap.set(proofBits, { opacity: 0, y: 34 });
    ScrollTrigger.create({
      trigger: ".quote",
      start: "top 85%",
      once: true,
      animation: gsap.to(proofBits, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.15 })
    });
  }

  /* --- 4. Pricing: Scale-On-Scroll (0.95 → 1) -------------------------- */
  var prices = gsap.utils.toArray("#pricingCards .price");

  if (prefersReduced) {
    gsap.set(prices, { opacity: 1, scale: 1 });
  } else {
    prices.forEach(function (card, i) {
      gsap.set(card, { opacity: 0.35, scale: 0.95, transformOrigin: "50% 60%" });
      ScrollTrigger.create({
        trigger: card,
        start: "top 92%",
        end: "top 52%",
        scrub: 0.6,
        animation: gsap.to(card, { opacity: 1, scale: 1, ease: "none", delay: i * 0.02 })
      });
    });
  }

  /* --- 5. Outro: zeilenweiser Mask-Reveal (SplitType) ------------------ */
  var outro = document.getElementById("outroTitle");
  var splitInstance = null;

  function buildOutroReveal() {
    if (!outro || typeof window.SplitType === "undefined") return;

    if (splitInstance) {
      // vorherige Maskierung entfernen, bevor neu umgebrochen wird
      outro.querySelectorAll(".line-mask").forEach(function (mask) {
        var line = mask.firstElementChild;
        if (line) mask.replaceWith(line);
      });
      splitInstance.revert();
      splitInstance = null;
    }

    splitInstance = new SplitType(outro, { types: "lines", lineClass: "line" });

    // Jede Zeile in eine overflow-hidden-Maske packen
    splitInstance.lines.forEach(function (line) {
      var mask = document.createElement("span");
      mask.className = "line-mask";
      line.parentNode.insertBefore(mask, line);
      mask.appendChild(line);
    });

    if (prefersReduced) {
      gsap.set(splitInstance.lines, { yPercent: 0, opacity: 1 });
      return;
    }

    gsap.set(splitInstance.lines, { yPercent: 115, opacity: 0 });
    ScrollTrigger.create({
      trigger: outro,
      start: "top 85%",
      once: true,
      animation: gsap.to(splitInstance.lines, {
        yPercent: 0,
        opacity: 1,
        duration: 1,
        ease: "power4.out",
        stagger: 0.11
      })
    });
  }

  // Erst nach dem Laden der Webfonts splitten — sonst brechen die Zeilen falsch.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(buildOutroReveal);
  } else {
    buildOutroReveal();
  }

  /* --- Resize: Zeilen neu umbrechen, ScrollTrigger neu vermessen ------- */
  var lastWidth = window.innerWidth;
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Math.abs(window.innerWidth - lastWidth) < 40) return;  // Mobile-URL-Leiste ignorieren
      lastWidth = window.innerWidth;
      buildOutroReveal();
      ScrollTrigger.refresh();
    }, 220);
  });

  /* --- Desktop-Feinschliff: sanfter Parallax auf den Hero-Text --------- */
  mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", function () {
    var tween = gsap.to(".hero__copy", { yPercent: -12, opacity: 0.15, ease: "none" });
    var st = ScrollTrigger.create({
      trigger: "#hero",
      start: "top top",
      end: "bottom top",
      scrub: true,
      animation: tween
    });
    return function () { st.kill(); tween.revert(); };
  });

  /* Nach dem Laden der Webfonts einmal neu vermessen. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
})();
