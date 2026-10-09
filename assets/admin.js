/*
 * Admin panel — edits data.json directly in the GitHub repo via the GitHub REST API.
 *
 * Flow: GET /repos/{owner}/{repo}/contents/data.json  → edit locally →
 *       PUT /repos/{owner}/{repo}/contents/data.json  (creates a commit) →
 *       the GitHub Pages workflow redeploys the site automatically.
 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const FILE = "data.json";
  const API = "https://api.github.com";
  const LS_KEY = "bd-admin";
  // This page belongs to this repository. The GitHub Pages URL is also
  // inspected below, so the settings still work when previewed from a fork.
  const DEFAULT_REPO = { owner: "david77david00", repo: "birthday-wishes" };

  /*
   * The panel reads and writes data.json through the GitHub Contents API, so the
   * token has to be able to do both. Spell the two supported token kinds out in
   * every token error: a rejected login is otherwise a dead end, because GitHub
   * only answers with a bare 401/403 and no hint about what was wrong.
   */
  const TOKEN_KINDS =
    'a <code>ghp_…</code> classic personal access token with the <code>repo</code> scope, ' +
    'or a <code>github_pat_…</code> fine-grained token with <b>Contents: Read and write</b> access';
  const TOKEN_INVALID = `This panel requires a valid GitHub token: ${TOKEN_KINDS}.`;
  const TOKEN_NO_WRITE = `This token can't write to this repository. This panel requires a valid GitHub token: ${TOKEN_KINDS}.`;

  const state = {
    cfg: null,          // { token, owner, repo, branch }
    sha: null,          // blob sha of data.json on GitHub (needed for updates)
    original: "",       // JSON string as last loaded/saved (to detect unsaved changes)
    data: { settings: {}, people: [] },
    editing: -1,
    lastAdded: null
  };

  /* ---------- repo auto-detection ---------- */
  function guessRepo() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const owner = h.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean)[0];
      const repo = seg && !seg.endsWith(".html") ? seg : `${owner}.github.io`;
      return { owner, repo };
    }
    return { ...DEFAULT_REPO };
  }

  function loadCfg() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY) || "null");
    } catch { return null; }
  }
  function saveCfg(cfg, remember) {
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(LS_KEY);
    (remember ? localStorage : sessionStorage).setItem(LS_KEY, JSON.stringify(cfg));
  }

  /* ---------- UTF-8 safe base64 ---------- */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  /* ---------- GitHub API ---------- */
  async function gh(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${state.cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {})
      }
    });
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error((body && body.message) || `GitHub error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const repoPath = () => `/repos/${encodeURIComponent(state.cfg.owner)}/${encodeURIComponent(state.cfg.repo)}`;

  async function fetchData() {
    try {
      const file = await gh(`${repoPath()}/contents/${FILE}?ref=${encodeURIComponent(state.cfg.branch)}`);
      state.sha = file.sha;
      const json = JSON.parse(b64decode(file.content));
      state.data = normalize(json);
    } catch (err) {
      if (err.status !== 404) throw err;
      state.sha = null; // file doesn't exist yet — it will be created on first save
      state.data = normalize({});
    }
    state.original = serialize();
  }

  async function pushData(message) {
    const body = { message, content: b64encode(serialize()), branch: state.cfg.branch };
    if (state.sha) body.sha = state.sha;
    const res = await gh(`${repoPath()}/contents/${FILE}`, { method: "PUT", body: JSON.stringify(body) });
    state.sha = res.content.sha;
    state.original = serialize();
    return res;
  }

  /* ---------- data helpers ---------- */
  function normalize(json) {
    const s = json.settings || {};
    return {
      settings: {
        title: s.title || "Happy Birthday",
        subtitle: s.subtitle || "",
        music: s.music || "",
        timezone: s.timezone || "Asia/Kolkata"
      },
      people: (Array.isArray(json.people) ? json.people : [])
        .filter((p) => p && p.name && BD.parseDate(p.date))
        .map((p) => ({ name: String(p.name).trim(), date: p.date, note: p.note ? String(p.note) : "" }))
    };
  }
  const serialize = () => JSON.stringify(state.data, null, 2) + "\n";
  const isDirty = () => serialize() !== state.original;

  /* ---------- UI helpers ---------- */
  function toast(html, type = "", ms = 4000) {
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = html;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function confirmBox(title, msg, okLabel = "Delete") {
    return new Promise((resolve) => {
      const dlg = $("#confirmDlg");
      $("#confirmTitle").textContent = title;
      $("#confirmMsg").textContent = msg;
      $("#confirmOk").textContent = okLabel;
      dlg.returnValue = "";
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
      dlg.showModal();
    });
  }

  function updateDirty() {
    const dirty = isDirty();
    $("#dirty").hidden = !dirty;
    $("#discardBtn").hidden = !dirty;
    $("#saveBtn").disabled = !dirty;
  }

  /* ---------- rendering ---------- */
  function renderList() {
    const q = $("#q").value.trim().toLowerCase();
    const sort = $("#sort").value;
    const now = new Date();
    let rows = state.data.people.map((person, index) => ({ person, index, info: BD.info(person, now) }));
    if (q) rows = rows.filter((r) => r.person.name.toLowerCase().includes(q));
    if (sort === "next") rows.sort((a, b) => a.info.next - b.info.next);
    else if (sort === "name") rows.sort((a, b) => a.person.name.localeCompare(b.person.name));
    else rows.sort((a, b) => a.info.month - b.info.month || a.info.day - b.info.day);

    const list = $("#list");
    list.innerHTML = "";
    rows.forEach(({ person, index, info }) => {
      const p = BD.parseDate(person.date);
      const when = info.isToday ? "<b>🎉 Today!</b>"
        : info.daysUntil === 1 ? "<b>Tomorrow</b>"
        : `in <b>${info.daysUntil}</b> days`;
      const row = document.createElement("div");
      row.className = "row" + (info.isToday ? " is-today" : "") + (state.lastAdded === person ? " new" : "");
      row.innerHTML = `
        <div class="avatar" style="background:${BD.gradientFor(person.name)}">${esc(BD.initials(person.name))}</div>
        <div class="who">
          <h2 title="${esc(person.name)}">${esc(person.name)}</h2>
          <p>${p.d} ${BD.MONTHS[p.m - 1]} ${p.y}${info.turning > 0 ? ` · turns ${info.turning}` : ""}${person.note ? ` · “${esc(person.note)}”` : ""}</p>
        </div>
        <div class="when">${when}</div>
        <div class="actions">
          <button class="icon-btn" data-edit="${index}" title="Edit">✏️</button>
          <button class="icon-btn del" data-del="${index}" title="Delete">🗑️</button>
        </div>`;
      list.appendChild(row);
    });
    state.lastAdded = null;
    $("#listEmpty").hidden = state.data.people.length > 0;
    $("#countBadge").textContent = state.data.people.length;
    updateDirty();
  }

  function renderSettings() {
    const f = $("#settingsForm");
    for (const k of ["title", "subtitle", "music", "timezone"]) f.elements[k].value = state.data.settings[k] || "";
  }

  function renderAll() {
    renderList();
    renderSettings();
    const url = `https://github.com/${state.cfg.owner}/${state.cfg.repo}`;
    $("#repoLink").href = url;
    $("#repoLink").textContent = `${state.cfg.owner}/${state.cfg.repo} · ${state.cfg.branch}`;
    $("#historyLink").href = `${url}/commits/${state.cfg.branch}/${FILE}`;
  }

  /* ---------- add / edit / delete ---------- */
  function openEditor(index = -1) {
    state.editing = index;
    const f = $("#editForm");
    const p = index >= 0 ? state.data.people[index] : { name: "", date: "", note: "" };
    $("#editTitle").textContent = index >= 0 ? "Edit person" : "Add person";
    f.elements.name.value = p.name;
    f.elements.date.value = p.date;
    f.elements.note.value = p.note || "";
    $("#editDlg").showModal();
    setTimeout(() => f.elements.name.focus(), 50);
  }

  $("#editForm").addEventListener("submit", (e) => {
    const f = e.target;
    const person = { name: f.elements.name.value.trim(), date: f.elements.date.value, note: f.elements.note.value.trim() };
    if (!person.name || !BD.parseDate(person.date)) { e.preventDefault(); toast("Please enter a name and a valid date.", "bad"); return; }
    const dup = state.data.people.findIndex((p, i) => i !== state.editing && p.name.toLowerCase() === person.name.toLowerCase());
    if (dup >= 0 && !window.confirm(`“${person.name}” is already in the list. Add anyway?`)) { e.preventDefault(); return; }
    if (state.editing >= 0) {
      state.data.people[state.editing] = person;
      toast(`✏️ Updated <b>${esc(person.name)}</b> — remember to save.`);
    } else {
      state.data.people.push(person);
      toast(`➕ Added <b>${esc(person.name)}</b> — remember to save.`);
    }
    state.lastAdded = person;
    renderList();
  });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  $("#list").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (edit) openEditor(+edit.dataset.edit);
    if (del) {
      const i = +del.dataset.del;
      const person = state.data.people[i];
      if (await confirmBox("Delete person?", `Remove “${person.name}” from the birthday list?`)) {
        state.data.people.splice(i, 1);
        renderList();
        toast(`🗑️ Removed <b>${esc(person.name)}</b> — remember to save.`);
      }
    }
  });

  $("#addBtn").addEventListener("click", () => openEditor());
  $("#q").addEventListener("input", renderList);
  $("#sort").addEventListener("change", renderList);

  $("#settingsForm").addEventListener("input", (e) => {
    const { name, value } = e.target;
    state.data.settings[name] = value.trim();
    updateDirty();
  });

  /* ---------- tabs ---------- */
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
  });

  /* ---------- save / discard ---------- */
  $("#saveBtn").addEventListener("click", async () => {
    const btn = $("#saveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      const before = JSON.parse(state.original || "{}");
      const res = await pushData(commitMessage(before, state.data));
      const commitUrl = res.commit && res.commit.html_url;
      toast(`✅ Saved to GitHub! The live site updates in about a minute.${commitUrl ? ` <a href="${commitUrl}" target="_blank" rel="noopener">View commit</a>` : ""}`, "ok", 7000);
    } catch (err) {
      if (err.status === 409 || err.status === 422) {
        toast("⚠️ The file changed on GitHub since you loaded it. Reload the page and apply your change again.", "bad", 9000);
      } else if (err.status === 401 || err.status === 403) {
        toast(`🔒 GitHub rejected the token. This panel requires a valid GitHub token: ${TOKEN_KINDS}.`, "bad", 9000);
      } else {
        toast("❌ Save failed: " + esc(err.message), "bad", 8000);
      }
    } finally {
      btn.innerHTML = "☁️ Save to GitHub";
      updateDirty();
    }
  });

  function commitMessage(before, after) {
    const oldNames = new Set((before.people || []).map((p) => p.name));
    const newNames = new Set(after.people.map((p) => p.name));
    const added = [...newNames].filter((n) => !oldNames.has(n));
    const removed = [...oldNames].filter((n) => !newNames.has(n));
    const parts = [];
    if (added.length) parts.push("add " + added.join(", "));
    if (removed.length) parts.push("remove " + removed.join(", "));
    if (!parts.length) parts.push("update birthdays");
    const msg = "Admin: " + parts.join("; ");
    return msg.length > 70 ? msg.slice(0, 67) + "…" : msg;
  }

  $("#discardBtn").addEventListener("click", async () => {
    if (!(await confirmBox("Discard changes?", "All unsaved changes will be lost.", "Discard"))) return;
    state.data = normalize(JSON.parse(state.original));
    renderAll();
  });

  addEventListener("beforeunload", (e) => {
    if (state.cfg && isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- import / export ---------- */
  function parseImport(text) {
    text = text.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      const json = JSON.parse(text);
      return normalize(Array.isArray(json) ? { people: json } : json).people;
    }
    return BD.parseLegacyText(text);
  }

  async function doImport(replace) {
    let people;
    try { people = parseImport($("#importText").value); } catch { toast("Couldn't read that — check the format.", "bad"); return; }
    if (!people.length) { toast("Nothing to import — check the format.", "bad"); return; }
    if (replace) {
      if (!(await confirmBox("Replace whole list?", `This replaces all ${state.data.people.length} people with ${people.length} imported ones.`, "Replace"))) return;
      state.data.people = people;
    } else {
      const have = new Set(state.data.people.map((p) => p.name.toLowerCase() + p.date));
      const fresh = people.filter((p) => !have.has(p.name.toLowerCase() + p.date));
      state.data.people.push(...fresh);
      people = fresh;
    }
    $("#importText").value = "";
    renderList();
    toast(`📥 Imported ${people.length} ${people.length === 1 ? "person" : "people"} — remember to save.`, "ok");
  }
  $("#importMerge").addEventListener("click", () => doImport(false));
  $("#importReplace").addEventListener("click", () => doImport(true));

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("#exportJson").addEventListener("click", () => download("data.json", serialize(), "application/json"));
  $("#exportTxt").addEventListener("click", () => {
    const txt = state.data.people.map((p) => {
      const d = BD.parseDate(p.date);
      return `${p.name}\n${String(d.d).padStart(2, "0")} ${String(d.m).padStart(2, "0")} ${d.y}`;
    }).join("\n") + "\n";
    download("birthdays.txt", txt, "text/plain");
  });

  /* ---------- login / logout ---------- */
  async function connect(cfg) {
    state.cfg = cfg;
    const repo = await gh(repoPath());
    if (!cfg.branch) cfg.branch = repo.default_branch || "main";
    if (repo.permissions && !repo.permissions.push) {
      const err = new Error("This token can read the repo but can't write to it.");
      err.status = 403;
      throw err;
    }
    await fetchData();
    return cfg;
  }

  function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    renderAll();
  }

  // `msg` is rendered as HTML so the token names can be marked up as <code>.
  // Every caller passes either a hard-coded string below or an escaped message.
  function showLogin(msg, isHtml = false) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    const e = $("#loginErr");
    e.hidden = !msg;
    if (isHtml) e.innerHTML = msg || "";
    else e.textContent = msg || "";
  }

  // Pasting a GitHub token is an explicit user action, so connect immediately
  // instead of making the user fill in the already-detected repository or click
  // a second button. The button remains available for tokens with another prefix.
  $("#token").addEventListener("paste", () => {
    setTimeout(() => {
      const token = $("#token").value.trim();
      if (/^(ghp_|github_pat_)/.test(token) && !$("#loginBtn").disabled) {
        $("#loginForm").requestSubmit();
      }
    }, 0);
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn");
    const detected = guessRepo();
    const cfg = {
      token: $("#token").value.trim(),
      owner: detected.owner,
      repo: detected.repo,
      branch: ""
    };
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connecting…';
    try {
      await connect(cfg);
      saveCfg(cfg, $("#remember").checked);
      $("#token").value = "";
      showApp();
      toast(`👋 Connected to <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>`, "ok");
    } catch (err) {
      state.cfg = null;
      const msg = err.status === 401 ? TOKEN_INVALID
        : err.status === 404 ? "Repository not found — or the token doesn't have access to it."
        : err.status === 403 ? TOKEN_NO_WRITE
        : esc(err.message);
      showLogin(msg, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Connect to GitHub";
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    if (isDirty() && !(await confirmBox("Log out?", "You have unsaved changes that will be lost.", "Log out"))) return;
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(LS_KEY);
    state.original = serialize(); // suppress beforeunload
    state.cfg = null;
    showLogin();
  });

  /* ---------- boot ---------- */
  (async function boot() {
    const saved = loadCfg();
    if (saved && saved.token) {
      try {
        await connect(saved);
        showApp();
        toast(`👋 Connected to <b>${esc(saved.owner)}/${esc(saved.repo)}</b>`, "ok");
        return;
      } catch (err) {
        state.cfg = null;
        showLogin(
          err.status === 401
            ? `Your saved token has expired or been revoked. ${TOKEN_INVALID}`
            : "Couldn't connect: " + esc(err.message),
          true
        );
        return;
      }
    }
    showLogin();
  })();
})();
