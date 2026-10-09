/* Public birthday countdown page. Data lives in /data.json (edited via admin.html). */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const state = { people: [], settings: {}, filter: "all", query: "", loadedData: false };
  let audioWasPlayingBeforeBirthday = false;

  /* ---------- background decoration ---------- */
  function decorate() {
    const stars = $("#stars");
    // Keep the decorative layer light; it is behind the useful content and
    // should never compete with scrolling or the countdown timer.
    const starCount = innerWidth < 600 ? 28 : 48;
    for (let i = 0; i < starCount; i++) {
      const s = document.createElement("i");
      s.className = "star";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.animationDelay = Math.random() * 3 + "s";
      s.style.transform = `scale(${Math.random() * 1.5 + 0.5})`;
      stars.appendChild(s);
    }
    const colors = ["#ff6b9d", "#9b5cff", "#ffd166", "#4de3ff", "#43e97b", "#ff8a5c"];
    const balloons = $("#balloons");
    const count = innerWidth < 600 ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const b = document.createElement("i");
      b.className = "balloon";
      const c = colors[i % colors.length];
      b.style.background = `radial-gradient(circle at 35% 30%, ${c}ee, ${c}99 60%, ${c}66)`;
      b.style.left = Math.random() * 95 + "%";
      b.style.animationDuration = 16 + Math.random() * 14 + "s";
      b.style.animationDelay = -Math.random() * 30 + "s";
      const scale = 0.6 + Math.random() * 0.7;
      b.style.width = 46 * scale + "px";
      b.style.height = 58 * scale + "px";
      balloons.appendChild(b);
    }
  }

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, "0");

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "style") e.setAttribute("style", v);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) e.appendChild(c);
    return e;
  }

  function siteDateParts(date = new Date()) {
    const timezone = state.settings.timezone || "Asia/Kolkata";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  }
  function isBirthdayToday(person, date = new Date()) {
    const birthday = BD.parseDate(person.date);
    if (!birthday) return false;
    const today = siteDateParts(date);
    return birthday.m === Number(today.month) && birthday.d === Number(today.day);
  }
  /* ---------- render ---------- */
  function renderStats(sorted) {
    const now = new Date();
    const month = sorted.filter((x) => x.info.month === now.getMonth() + 1).length;
    const soon = sorted.filter((x) => x.info.daysUntil <= 30).length;
    const stats = $("#stats");
    stats.innerHTML = "";
    [[sorted.length, "People"], [month, "This month"], [soon, "Next 30 days"]].forEach(([n, l]) => {
      stats.appendChild(el("div", { class: "stat glass" }, [el("b", { text: n }), el("span", { text: l })]));
    });
  }

  function renderSpotlight(sorted) {
    const box = $("#spotlight");
    const wasBirthdayMode = document.body.classList.contains("birthday-mode");
    box.innerHTML = "";
    box.classList.remove("today");
    const todays = sorted.filter((x) => isBirthdayToday(x.person));
    document.body.classList.toggle("birthday-mode", todays.length > 0);

    if (todays.length) {
      if (!wasBirthdayMode) audioWasPlayingBeforeBirthday = !musicEl().paused;
      musicEl().pause();
      box.hidden = false;
      const wishes = el("div", { class: "birthday-wishes" });
      todays.forEach(({ person }) => {
        const wish = person.note || `Wishing you a wonderful birthday, ${person.name}! May your year be full of joy, laughter and success.`;
        wishes.appendChild(el("article", { class: "birthday-person" }, [
          el("h1", { class: "birthday-name", text: `Happy Birthday, ${person.name}!` }),
          el("p", { class: "birthday-wish", text: wish })
        ]));
      });
      const video = el("video", {
        class: "birthday-video birthday-video-only", autoplay: "", muted: "", loop: "", playsinline: "",
        preload: "auto", "aria-label": "Birthday wishes video"
      });
      video.muted = true;
      video.volume = 0;
      video.src = "assets/birthday-video.mp4";
      video.addEventListener("canplay", () => video.play().catch(() => {}), { once: true });
      box.append(wishes, video);
      return;
    }

    if (wasBirthdayMode && audioWasPlayingBeforeBirthday && musicStarted) {
      playRequested = true;
      GESTURES.forEach((ev) => document.addEventListener(ev, playMusic, { capture: true, passive: true }));
    }
    if (wasBirthdayMode) audioWasPlayingBeforeBirthday = false;
    if (!sorted.length) { box.hidden = true; return; }
    box.hidden = false;

    const { person, info } = sorted[0];
    const meta = `${info.label}${info.turning > 0 ? ` · turns ${info.turning}` : ""}`;
    const units = ["Days", "Hours", "Minutes", "Seconds"].map((l, i) =>
      el("div", { class: "unit" }, [el("span", { class: "num", "data-big": "dhms"[i], text: "00" }), el("span", { class: "lbl", text: l })]));
    box.append(...[
      el("div", { class: "spot-label", text: "⏳ Next birthday" }),
      el("div", { class: "spot-name", text: person.name }),
      el("div", { class: "spot-meta", text: meta }),
      person.note ? el("div", { class: "spot-note", text: `“${person.note}”` }) : null,
      el("div", { class: "big-count", "data-date": person.date }, units)
    ].filter(Boolean));
  }

  function card({ person, info }, index) {
    const c = el("article", { class: "card glass" + (isBirthdayToday(person) ? " is-today" : ""), "data-date": person.date });
    c.style.animationDelay = Math.min(index * 45, 600) + "ms";

    let tag = null;
    const birthdayToday = isBirthdayToday(person);
    if (birthdayToday) tag = el("span", { class: "tag today", text: "TODAY 🎉" });
    else if (info.daysUntil === 1) tag = el("span", { class: "tag soon", text: "Tomorrow" });
    else if (info.daysUntil <= 7) tag = el("span", { class: "tag soon", text: "This week" });

    const sub = `${info.label}${info.turning > 0 ? ` · turns ${info.turning}` : ""}`;
    c.append(
      el("div", { class: "card-top" }, [
        el("div", { class: "avatar", style: `background:${BD.gradientFor(person.name)}`, text: BD.initials(person.name) }),
        el("div", { class: "who" }, [el("h2", { text: person.name, title: person.name }), el("p", { text: sub })])
      ])
    );
    if (tag) c.appendChild(tag);

    if (birthdayToday) {
      c.appendChild(el("div", { class: "celebrate", text: "🎉 Happy Birthday! 🎂" }));
    } else {
      const count = el("div", { class: "count" });
      ["Days", "Hrs", "Min", "Sec"].forEach((l, i) =>
        count.appendChild(el("div", {}, [el("b", { "data-u": "dhms"[i], text: "0" }), el("span", { text: l })])));
      c.appendChild(count);
    }
    c.appendChild(el("div", { class: "progress", title: "Progress to next birthday" }, [el("i", { style: `width:${(info.progress * 100).toFixed(2)}%` })]));
    if (person.note) c.appendChild(el("p", { class: "note", text: `“${person.note}”` }));
    return c;
  }

  function filtered(sorted) {
    const now = new Date();
    const q = state.query.trim().toLowerCase();
    return sorted.filter(({ person, info }) => {
      if (q && !person.name.toLowerCase().includes(q)) return false;
      if (state.filter === "month") return info.month === now.getMonth() + 1;
      if (state.filter === "30") return info.daysUntil <= 30;
      return true;
    });
  }

  let lastDay = "";
  function render() {
    lastDay = JSON.stringify(siteDateParts());
    const sorted = BD.sortByNext(state.people);
    renderStats(sorted);
    renderSpotlight(sorted);
    const list = filtered(sorted);
    const grid = $("#grid");
    grid.innerHTML = "";
    list.forEach((x, i) => grid.appendChild(card(x, i)));
    $("#empty").hidden = list.length > 0 || !state.people.length;
    tick();
  }

  /* ---------- live countdown (single timer for everything) ---------- */
  function tick() {
    const now = new Date();
    if (JSON.stringify(siteDateParts(now)) !== lastDay) return render(); // site-timezone midnight rollover
    document.querySelectorAll("[data-date]").forEach((node) => {
      const info = BD.info({ date: node.getAttribute("data-date") }, now);
      if (!info) return;
      const t = BD.splitMs(info.ms);
      node.querySelectorAll("[data-u]").forEach((b) => {
        const u = b.getAttribute("data-u");
        b.textContent = u === "d" ? t.d : pad(t[u]);
      });
      node.querySelectorAll("[data-big]").forEach((b) => {
        const u = b.getAttribute("data-big");
        b.textContent = u === "d" ? t.d : pad(t[u]);
      });
      const bar = node.querySelector(".progress i");
      if (bar) bar.style.width = (info.progress * 100).toFixed(3) + "%";
    });
  }

  /* ---------- settings ---------- */
  const musicEl = () => $("#lagu");

  function applySettings(s) {
    if (s.title) { $("#title").textContent = s.title; document.title = "🎉 " + s.title; }
    $("#subtitle").textContent = s.subtitle || "";
    const a = musicEl();
    if (state.people.some((person) => isBirthdayToday(person))) a.pause();
    if (!s.music) {
      // Music turned off in the admin panel: stop it and drop the fallback src.
      a.pause();
      a.removeAttribute("src");
      a.load();
      currentSrc = "";
    } else if (a.getAttribute("src") !== s.music) {
      // New song set in the admin panel: switch to it, and keep playing if music was on.
      // A dead URL is caught by musicError(), which falls back to the bundled song.
      const wasPlaying = !a.paused;
      setSong(s.music);
      if (wasPlaying) { playRequested = true; a.play().catch(() => {}); }
    }
  }

  /* ---------- background music: starts on the first gesture (no button) ---------- */
  // Browsers only allow sound after a real user gesture. These listeners keep
  // trying until the music is really playing, without requiring an inline handler
  // on every body click.
  //
  // The song also ships with the site (assets/music/DEVIL.mp3), served from the same
  // host as the page, because a URL on GitHub's raw hosts can 404 or be blocked by a
  // network. The page's URL comes first; if it ever fails, the same song is tried
  // from these copies, in order.
  const MUSIC_SOURCES = [
    "assets/music/DEVIL.mp3",
    "https://raw.githubusercontent.com/all-drama/Nxnx/main/DEVIL.mp3",
  ];
  // Keep the listener list small: pointerup covers mouse and modern touch, while
  // touchend supports older mobile browsers and keydown covers keyboard users.
  const GESTURES = ["pointerup", "touchend", "keydown"];
  let musicStarted = false;  // the song has actually played at least once
  let playRequested = false; // a gesture asked for it, and it hasn't been paused since
  let currentSrc = "";       // the URL we last asked the <audio> to load

  function setSong(url) {
    currentSrc = url;
    musicEl().src = url;
  }

  function playMusic() {
    const a = musicEl();
    if (state.people.some((person) => isBirthdayToday(person))) { a.pause(); return; }
    if (!a.src) return;                               // no song at all
    if (musicStarted && !playRequested) return;       // paused on purpose: leave it alone
    if (!a.paused) return;                            // already playing
    playRequested = true;
    a.play().catch(() => { /* not allowed yet - the next tap tries again */ });
  }

  // A dead URL must not leave the page silent: move on to the next copy of the song.
  function musicError() {
    if (!currentSrc) return;                          // music is switched off
    const a = musicEl();
    const next = MUSIC_SOURCES[MUSIC_SOURCES.indexOf(currentSrc) + 1];
    if (!next) return;                                // out of copies
    const retry = musicStarted || playRequested;
    setSong(next);
    if (retry) { playRequested = true; a.play().catch(() => {}); }
  }

  function setupMusic() {
    const a = musicEl();
    currentSrc = a.getAttribute("src") || "";
    GESTURES.forEach((ev) => document.addEventListener(ev, playMusic, { capture: true, passive: true }));
    a.addEventListener("error", musicError);
    a.addEventListener("pause", () => { if (musicStarted) playRequested = false; });
    a.addEventListener("playing", () => {
      // Started. From now on taps don't touch it.
      musicStarted = true;
      GESTURES.forEach((ev) => document.removeEventListener(ev, playMusic, { capture: true }));
    }, { once: true });
    // A song that fails before this script has run leaves an error on the element
    // with no event to catch it, so check for one now.
    if (a.error) musicError();
  }

  // Used by the inline onclick on <body> in index.html.
  window.playMusic = playMusic;

  /* ---------- data ---------- */
  async function load() {
    try {
      const res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const people = Array.isArray(data.people) ? data.people.filter((p) => p && p.name && p.date) : [];
      const settings = data.settings || {};
      if (state.loadedData && JSON.stringify(people) === JSON.stringify(state.people) &&
          JSON.stringify(settings) === JSON.stringify(state.settings)) return;
      state.people = people;
      state.settings = settings;
      state.loadedData = true;
      applySettings(state.settings);
      render();
      // Do not call play() here. Apart from being blocked by browsers, an early
      // attempt can start downloading the large audio file before the visitor
      // asks for music. setupMusic() waits for a real gesture instead.
    } catch (err) {
      console.error("Could not load data.json", err);
      if (!state.people.length) {
        $("#empty").hidden = false;
        $("#empty").textContent = "Couldn't load birthdays right now. Please refresh 🙏";
      }
    } finally {
      $("#loading").hidden = true;
    }
  }

  /* ---------- confetti ---------- */
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  let pieces = [], raf = null;
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener("resize", resize);
  resize();

  function burst(n = 180) {
    const colors = ["#ff6b9d", "#9b5cff", "#ffd166", "#4de3ff", "#43e97b", "#ffffff"];
    for (let i = 0; i < n; i++) {
      pieces.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4,
        y: innerHeight * 0.3,
        vx: (Math.random() - 0.5) * 16,
        vy: Math.random() * -14 - 4,
        size: Math.random() * 8 + 4,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        circle: Math.random() < 0.3
      });
    }
    if (!raf) frame();
  }
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      ctx.restore();
    });
    pieces = pieces.filter((p) => p.y < innerHeight + 40);
    raf = pieces.length ? requestAnimationFrame(frame) : null;
    if (!pieces.length) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* ---------- events ---------- */
  $("#title").addEventListener("click", () => burst());
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
    state.filter = b.dataset.filter;
    render();
  });

  decorate();
  setupMusic();
  load();
  setInterval(tick, 1000);
  setInterval(load, 5 * 60 * 1000); // pick up admin changes without reload
})();
