/* Shared helpers used by both the public page and the admin panel. */
(function (global) {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  const DAY = 86400000;

  const GRADIENTS = [
    ["#ff6b9d", "#c44dff"], ["#ffa62b", "#ff5e62"], ["#43e97b", "#38f9d7"],
    ["#4facfe", "#00f2fe"], ["#f093fb", "#f5576c"], ["#fa709a", "#fee140"],
    ["#a18cd1", "#fbc2eb"], ["#667eea", "#764ba2"], ["#30cfd0", "#330867"],
    ["#f6d365", "#fda085"], ["#5ee7df", "#b490ca"], ["#ff9a9e", "#fad0c4"]
  ];

  function parseDate(str) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str || "").trim());
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /* Birthday date (local midnight) in a given year; Feb 29 falls back to Feb 28. */
  function birthdayInYear(p, year) {
    let d = p.d;
    if (p.m === 2 && d === 29 && !isLeap(year)) d = 28;
    return new Date(year, p.m - 1, d);
  }

  /* Info about a person's next birthday relative to `now`. */
  function info(person, now = new Date()) {
    const p = parseDate(person.date);
    if (!p) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = birthdayInYear(p, now.getFullYear());
    if (next < today) next = birthdayInYear(p, now.getFullYear() + 1);
    const prev = birthdayInYear(p, next.getFullYear() - 1);
    const isToday = next.getTime() === today.getTime();
    const daysUntil = Math.round((next - today) / DAY);
    const ms = Math.max(0, next - now);
    const progress = isToday ? 1 : Math.min(1, Math.max(0, (now - prev) / (next - prev)));
    return {
      next,
      isToday,
      daysUntil,
      ms,
      progress,
      turning: next.getFullYear() - p.y,
      month: p.m,
      day: p.d,
      label: `${p.d} ${MONTHS[p.m - 1]}`
    };
  }

  function splitMs(ms) {
    return {
      d: Math.floor(ms / DAY),
      h: Math.floor((ms % DAY) / 3600000),
      m: Math.floor((ms % 3600000) / 60000),
      s: Math.floor((ms % 60000) / 1000)
    };
  }

  function sortByNext(people, now = new Date()) {
    return people
      .map((person) => ({ person, info: info(person, now) }))
      .filter((x) => x.info)
      .sort((a, b) => a.info.next - b.info.next || a.person.name.localeCompare(b.person.name));
  }

  function initials(name) {
    const parts = String(name).replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function gradientFor(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    const [a, b] = GRADIENTS[h % GRADIENTS.length];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* Parse the legacy "Name\nDD MM YYYY" text format (ok.txt). */
  function parseLegacyText(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const parts = lines[i + 1].split(/[\s/.-]+/);
      if (parts.length !== 3) continue;
      const [d, m, y] = parts;
      out.push({
        name: lines[i],
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        note: ""
      });
    }
    return out.filter((p) => parseDate(p.date));
  }

  global.BD = {
    MONTHS, parseDate, info, splitMs, sortByNext, initials, gradientFor, ordinal, parseLegacyText
  };
})(window);
