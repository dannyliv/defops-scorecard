/**
 * DEFOPS Coverage Scorecard
 * Local-only assessment SPA — Patch · Revoke · Reconstruct
 */
(function () {
  "use strict";

  const STORAGE_KEY = "defops-scorecard-v1";

  const RUBRIC = [
    { value: 0, label: "Missing / unknown" },
    { value: 1, label: "Manual / ad hoc" },
    { value: 2, label: "Documented process, partial automation" },
    { value: 3, label: "Measured, owned, tested regularly" },
  ];

  const DIMENSIONS = [
    {
      id: "patch",
      name: "Patch / close loop",
      description:
        "Can you ship a fix from a known exploit path and prove it stays closed?",
    },
    {
      id: "identity",
      name: "Agent identity & revocation",
      description:
        "Can you kill agent/tool credentials and confirm they stay dead?",
    },
    {
      id: "trajectory",
      name: "Trajectory & summary integrity",
      description:
        "Do logs/summaries resist spoof/omission; can you reconstruct what happened?",
    },
    {
      id: "credentials",
      name: "Credential & key lifecycle (AI APIs)",
      description:
        "Keys/tokens for model/tool APIs: rotate, scope, detect leak?",
    },
    {
      id: "registry",
      name: "Registry & publish controls",
      description:
        "Who can publish tools/skills/agents; review gates; supply-chain pins?",
    },
    {
      id: "sharedstate",
      name: "Shared-state / improvised-C2 detection",
      description:
        "Can you catch agents colluding via shared memory/files/side channels?",
    },
    {
      id: "evalfidelity",
      name: "Independent eval fidelity",
      description:
        "Do third-party/red-team evals match production stack (not demoware)?",
    },
  ];

  /** Research-demo: high claims vibe / low ops scores */
  const PROFILE_RESEARCH_DEMO = {
    scores: {
      patch: 1,
      identity: 0,
      trajectory: 1,
      credentials: 0,
      registry: 1,
      sharedstate: 0,
      evalfidelity: 2,
    },
    notes: {
      patch: "Hotfixes after incidents; no proof-of-closure cadence.",
      identity: "Agent tokens not centrally revocable; long-lived defaults.",
      trajectory: "Summaries trusted; limited spoof resistance testing.",
      credentials: "Shared API keys; rotation ad hoc after leaks.",
      registry: "Publish mostly honor-system; weak supply-chain pins.",
      sharedstate: "No dedicated detection for colluding agents.",
      evalfidelity:
        "Strong paper evals on a sanitized harness; production stack differs.",
    },
  };

  /** Ops-ready: high close-loop scores */
  const PROFILE_OPS_READY = {
    scores: {
      patch: 3,
      identity: 3,
      trajectory: 3,
      credentials: 3,
      registry: 2,
      sharedstate: 2,
      evalfidelity: 3,
    },
    notes: {
      patch: "Exploit-path → patch → regression test owned and measured.",
      identity: "Kill-switch with post-revoke confirmation drills.",
      trajectory: "Tamper-evident logs; reconstruction runbooks tested.",
      credentials: "Scoped keys, rotation SLAs, leak detection wired.",
      registry: "Review gates + pins; automation expanding.",
      sharedstate: "Shared memory/file side-channel hunts on a schedule.",
      evalfidelity: "Red team runs against production-equivalent stack.",
    },
  };

  const VIEWS = ["home", "assessment", "dashboard", "profiles", "data", "about"];

  let state = loadState();
  let radarChart = null;

  function defaultState() {
    const scores = {};
    const notes = {};
    DIMENSIONS.forEach((d) => {
      scores[d.id] = null;
      notes[d.id] = "";
    });
    return { scores, notes, updatedAt: null };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      DIMENSIONS.forEach((d) => {
        const s = parsed.scores && parsed.scores[d.id];
        base.scores[d.id] =
          s === 0 || s === 1 || s === 2 || s === 3 ? s : null;
        base.notes[d.id] =
          parsed.notes && typeof parsed.notes[d.id] === "string"
            ? parsed.notes[d.id]
            : "";
      });
      base.updatedAt = parsed.updatedAt || null;
      return base;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("DEFOPS: could not persist to localStorage", err);
    }
  }

  function scoredCount() {
    return DIMENSIONS.filter((d) => state.scores[d.id] !== null).length;
  }

  function allScores() {
    return DIMENSIONS.map((d) => state.scores[d.id]);
  }

  function meanScore() {
    const vals = allScores().filter((v) => v !== null);
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return sum / vals.length;
  }

  /**
   * Verdict rules:
   * - Fund: mean ≥ 2.5 AND no dim at 0
   * - Don't fund: mean < 1.5 OR ≥2 dims at 0
   * - Else Gate
   *
   * Incomplete assessments (any null) use only scored dims for mean,
   * but nulls are not treated as 0. Unscored dims do not count toward
   * the "dims at 0" rule. If nothing scored → Gate.
   */
  function computeVerdict() {
    const vals = allScores();
    const scored = vals.filter((v) => v !== null);
    if (!scored.length) {
      return {
        verdict: "Gate",
        reason: "No dimensions scored yet. Complete the assessment for a diligence verdict.",
      };
    }

    const mean = scored.reduce((a, b) => a + b, 0) / scored.length;
    const zeros = scored.filter((v) => v === 0).length;
    const incomplete = scored.length < DIMENSIONS.length;

    if (mean >= 2.5 && zeros === 0) {
      return {
        verdict: "Fund",
        reason: incomplete
          ? `Mean ${mean.toFixed(2)} with no zeros among scored dims — remaining dims still open; treat as provisional Fund until complete.`
          : `Mean ${mean.toFixed(2)} ≥ 2.5 and no dimension at 0. Ops close-loop coverage looks fundable.`,
      };
    }

    if (mean < 1.5 || zeros >= 2) {
      const parts = [];
      if (mean < 1.5) parts.push(`mean ${mean.toFixed(2)} < 1.5`);
      if (zeros >= 2) parts.push(`${zeros} dimensions at 0`);
      return {
        verdict: "Don't fund",
        reason: `${parts.join("; ")}. Close-loop gaps are material for diligence.`,
      };
    }

    return {
      verdict: "Gate",
      reason: incomplete
        ? `Mean ${mean.toFixed(2)} with ${zeros} zero(s) among scored dims — Gate pending full coverage and remediation.`
        : `Mean ${mean.toFixed(2)}; ${zeros} dimension(s) at 0. Gate until gaps are closed and retested.`,
    };
  }

  function buildExportPayload() {
    return {
      schema: "defops-scorecard/v1",
      exportedAt: new Date().toISOString(),
      dimensions: DIMENSIONS.map((d) => ({
        id: d.id,
        name: d.name,
        score: state.scores[d.id],
        note: state.notes[d.id] || "",
      })),
      scores: { ...state.scores },
      notes: { ...state.notes },
      summary: {
        mean: meanScore(),
        scored: scoredCount(),
        total: DIMENSIONS.length,
        verdict: computeVerdict().verdict,
      },
    };
  }

  /* ---------- UI: Assessment ---------- */

  function renderDimensions() {
    const list = document.getElementById("dim-list");
    if (!list) return;
    list.innerHTML = "";

    DIMENSIONS.forEach((dim, index) => {
      const card = document.createElement("article");
      card.className = "dim-card" + (state.scores[dim.id] !== null ? " scored" : "");
      card.dataset.dim = dim.id;

      const header = document.createElement("div");
      header.className = "dim-header";
      header.innerHTML =
        `<span class="dim-num" aria-hidden="true">${index + 1}</span>` +
        `<h3 class="dim-title" id="dim-title-${dim.id}">${escapeHtml(dim.name)}</h3>`;

      const desc = document.createElement("p");
      desc.className = "dim-desc";
      desc.textContent = dim.description;

      const group = document.createElement("div");
      group.className = "score-group";
      group.setAttribute("role", "group");
      group.setAttribute(
        "aria-labelledby",
        `dim-title-${dim.id}`
      );

      RUBRIC.forEach((r) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "score-btn" + (r.value === 3 ? " score-high" : "");
        btn.dataset.value = String(r.value);
        btn.setAttribute(
          "aria-label",
          `${dim.name}: score ${r.value} — ${r.label}`
        );
        btn.setAttribute(
          "aria-pressed",
          state.scores[dim.id] === r.value ? "true" : "false"
        );
        btn.innerHTML = `<strong>${r.value}</strong> · ${escapeHtml(r.label)}`;
        btn.addEventListener("click", () => {
          state.scores[dim.id] = r.value;
          saveState();
          renderDimensions();
          updateProgress();
          updateDashboard();
        });
        group.appendChild(btn);
      });

      const notesWrap = document.createElement("div");
      notesWrap.className = "dim-notes";
      const label = document.createElement("label");
      label.htmlFor = `note-${dim.id}`;
      label.textContent = "Notes (optional)";
      const ta = document.createElement("textarea");
      ta.id = `note-${dim.id}`;
      ta.placeholder = "Evidence, owners, gaps…";
      ta.value = state.notes[dim.id] || "";
      ta.setAttribute("aria-label", `Notes for ${dim.name}`);
      ta.addEventListener("input", () => {
        state.notes[dim.id] = ta.value;
        saveState();
      });
      notesWrap.appendChild(label);
      notesWrap.appendChild(ta);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(group);
      card.appendChild(notesWrap);
      list.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateProgress() {
    const n = scoredCount();
    const pct = Math.round((n / DIMENSIONS.length) * 100);
    const label = document.getElementById("progress-label");
    const pctEl = document.getElementById("progress-pct");
    const bar = document.getElementById("progress-bar");
    const fill = document.getElementById("progress-fill");
    if (label) label.textContent = `${n} of ${DIMENSIONS.length} scored`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (bar) bar.setAttribute("aria-valuenow", String(pct));
    if (fill) fill.style.width = `${pct}%`;
  }

  /* ---------- UI: Dashboard ---------- */

  function shortLabel(name) {
    const map = {
      patch: "Patch",
      identity: "Identity",
      trajectory: "Trajectory",
      credentials: "Credentials",
      registry: "Registry",
      sharedstate: "Shared-state",
      evalfidelity: "Eval fidelity",
    };
    return map[name] || name;
  }

  function updateDashboard() {
    const mean = meanScore();
    const { verdict, reason } = computeVerdict();

    const meanEl = document.getElementById("overall-mean");
    const pctEl = document.getElementById("overall-pct");
    const badge = document.getElementById("verdict-badge");
    const reasonEl = document.getElementById("verdict-reason");
    const breakdown = document.getElementById("score-breakdown");

    if (meanEl) {
      meanEl.textContent = mean === null ? "—" : mean.toFixed(2);
    }
    if (pctEl) {
      pctEl.textContent =
        mean === null ? "—" : `${Math.round((mean / 3) * 100)}%`;
    }

    if (badge) {
      badge.textContent = verdict;
      badge.className = "verdict-badge";
      if (verdict === "Fund") badge.classList.add("verdict-fund");
      else if (verdict === "Don't fund") badge.classList.add("verdict-dont");
      else badge.classList.add("verdict-gate");
    }
    if (reasonEl) reasonEl.textContent = reason;

    if (breakdown) {
      breakdown.innerHTML = "";
      DIMENSIONS.forEach((d) => {
        const li = document.createElement("li");
        const score = state.scores[d.id];
        const scoreSpan = document.createElement("span");
        scoreSpan.className = "bd-score";
        if (score === 0) scoreSpan.classList.add("zero");
        if (score === 3) scoreSpan.classList.add("high");
        scoreSpan.textContent = score === null ? "—" : String(score);
        const nameSpan = document.createElement("span");
        nameSpan.textContent = d.name;
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        breakdown.appendChild(li);
      });
    }

    updateRadar();
  }

  function updateRadar() {
    const canvas = document.getElementById("radar-chart");
    const hint = document.getElementById("chart-empty-hint");
    if (!canvas || typeof Chart === "undefined") return;

    const hasAny = scoredCount() > 0;
    if (hint) hint.hidden = hasAny;

    const labels = DIMENSIONS.map((d) => shortLabel(d.id));
    const data = DIMENSIONS.map((d) =>
      state.scores[d.id] === null ? 0 : state.scores[d.id]
    );

    const cfg = {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "DEFOPS score",
            data,
            fill: true,
            backgroundColor: "rgba(0, 212, 255, 0.18)",
            borderColor: "#00d4ff",
            pointBackgroundColor: "#5eead4",
            pointBorderColor: "#0a0e17",
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#00d4ff",
            borderWidth: 2,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const dim = DIMENSIONS[ctx.dataIndex];
                const raw = state.scores[dim.id];
                return raw === null
                  ? `${dim.name}: unscored`
                  : `${dim.name}: ${raw}/3`;
              },
            },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 3,
            ticks: {
              stepSize: 1,
              color: "#94a3b8",
              backdropColor: "transparent",
              font: { family: "'IBM Plex Mono', monospace", size: 10 },
            },
            pointLabels: {
              color: "#e8eef7",
              font: {
                family: "'Bricolage Grotesque', sans-serif",
                size: 11,
                weight: "600",
              },
            },
            grid: { color: "rgba(148, 163, 184, 0.2)" },
            angleLines: { color: "rgba(148, 163, 184, 0.2)" },
          },
        },
      },
    };

    if (radarChart) {
      radarChart.data.datasets[0].data = data;
      radarChart.update();
    } else {
      radarChart = new Chart(canvas, cfg);
    }
  }

  /* ---------- Navigation ---------- */

  function currentHash() {
    const h = (location.hash || "#home").replace(/^#/, "").split("?")[0];
    return VIEWS.includes(h) ? h : "home";
  }

  function showView(name) {
    const view = VIEWS.includes(name) ? name : "home";
    document.querySelectorAll(".view").forEach((el) => {
      const match = el.dataset.view === view;
      el.hidden = !match;
    });
    document.querySelectorAll(".site-nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === view);
    });
    const nav = document.getElementById("site-nav");
    const toggle = document.getElementById("nav-toggle");
    if (nav) nav.classList.remove("open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
    if (view === "dashboard") {
      updateDashboard();
      // Chart.js needs visible canvas for correct layout
      requestAnimationFrame(() => {
        if (radarChart) radarChart.resize();
      });
    }
    if (view === "assessment") {
      updateProgress();
    }
    window.scrollTo(0, 0);
  }

  function onHashChange() {
    showView(currentHash());
  }

  /* ---------- Profiles / Data ---------- */

  function applyProfile(profile, label) {
    DIMENSIONS.forEach((d) => {
      state.scores[d.id] =
        profile.scores[d.id] !== undefined ? profile.scores[d.id] : null;
      state.notes[d.id] = profile.notes[d.id] || "";
    });
    saveState();
    renderDimensions();
    updateProgress();
    updateDashboard();
    const status = document.getElementById("profiles-status");
    if (status) {
      status.textContent = `Loaded “${label}”. Open Dashboard to see the radar and verdict.`;
    }
  }

  function setDataStatus(msg) {
    const el = document.getElementById("data-status");
    if (el) el.textContent = msg;
  }

  async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function exportJson() {
    const payload = buildExportPayload();
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `defops-scorecard-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDataStatus("Export downloaded.");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const scores = data.scores || {};
        const notes = data.notes || {};
        // Also accept dimensions[] shape
        if (Array.isArray(data.dimensions)) {
          data.dimensions.forEach((row) => {
            if (row && row.id) {
              if (row.score === 0 || row.score === 1 || row.score === 2 || row.score === 3) {
                scores[row.id] = row.score;
              } else if (row.score === null) {
                scores[row.id] = null;
              }
              if (typeof row.note === "string") notes[row.id] = row.note;
            }
          });
        }
        DIMENSIONS.forEach((d) => {
          const s = scores[d.id];
          state.scores[d.id] =
            s === 0 || s === 1 || s === 2 || s === 3 ? s : null;
          state.notes[d.id] =
            typeof notes[d.id] === "string" ? notes[d.id] : "";
        });
        saveState();
        renderDimensions();
        updateProgress();
        updateDashboard();
        setDataStatus("Import successful. Scores restored from file.");
      } catch (err) {
        setDataStatus("Import failed: invalid JSON.");
        console.warn(err);
      }
    };
    reader.onerror = () => setDataStatus("Import failed: could not read file.");
    reader.readAsText(file);
  }

  async function copyHash() {
    const text = JSON.stringify(buildExportPayload());
    const hex = await sha256Hex(text);
    const display = document.getElementById("hash-display");
    if (display) {
      display.hidden = false;
      display.textContent = hex;
    }
    try {
      await navigator.clipboard.writeText(hex);
      setDataStatus("SHA-256 copied to clipboard.");
    } catch {
      setDataStatus("SHA-256 computed (copy manually from below).");
    }
  }

  function clearAll() {
    if (
      !confirm(
        "Clear all DEFOPS scores and notes from this browser? This cannot be undone."
      )
    ) {
      return;
    }
    state = defaultState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    saveState();
    renderDimensions();
    updateProgress();
    updateDashboard();
    const hashDisplay = document.getElementById("hash-display");
    if (hashDisplay) {
      hashDisplay.hidden = true;
      hashDisplay.textContent = "";
    }
    setDataStatus("All local assessment data cleared.");
    const profilesStatus = document.getElementById("profiles-status");
    if (profilesStatus) profilesStatus.textContent = "";
  }

  /* ---------- Init ---------- */

  function bindUi() {
    window.addEventListener("hashchange", onHashChange);

    const toggle = document.getElementById("nav-toggle");
    const nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
    }

    const resetBtn = document.getElementById("btn-reset-scores");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm("Reset all scores and notes?")) return;
        state = defaultState();
        saveState();
        renderDimensions();
        updateProgress();
        updateDashboard();
      });
    }

    const loadResearch = document.getElementById("load-research-demo");
    const loadOps = document.getElementById("load-ops-ready");
    if (loadResearch) {
      loadResearch.addEventListener("click", () =>
        applyProfile(PROFILE_RESEARCH_DEMO, "Research-demo")
      );
    }
    if (loadOps) {
      loadOps.addEventListener("click", () =>
        applyProfile(PROFILE_OPS_READY, "Ops-ready")
      );
    }

    const btnExport = document.getElementById("btn-export");
    const btnHash = document.getElementById("btn-hash");
    const btnClear = document.getElementById("btn-clear");
    const importFile = document.getElementById("import-file");

    if (btnExport) btnExport.addEventListener("click", exportJson);
    if (btnHash) btnHash.addEventListener("click", () => { copyHash(); });
    if (btnClear) btnClear.addEventListener("click", clearAll);
    if (importFile) {
      importFile.addEventListener("change", () => {
        const file = importFile.files && importFile.files[0];
        if (file) importJson(file);
        importFile.value = "";
      });
    }
  }

  function init() {
    bindUi();
    renderDimensions();
    updateProgress();
    if (!location.hash || location.hash === "#") {
      location.replace("#home");
    }
    showView(currentHash());
    // Defer first chart paint until Chart.js is ready
    if (typeof Chart !== "undefined") {
      updateDashboard();
    } else {
      window.addEventListener("load", () => updateDashboard());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for console debugging / tests (non-essential)
  window.DEFOPS = {
    computeVerdict,
    meanScore,
    buildExportPayload,
    DIMENSIONS,
    getState: () => state,
  };
})();
