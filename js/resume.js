/* global html2pdf */

/**
 * Resume builder logic
 * - Filters: Type of work (single-select), How far back (last N years)
 * - Data sources:
 *   - resume-data.js provides either:
 *       A) window.RESUME_PROFILE / window.RESUME_SECTIONS / window.RESUME_JOBS  (supported)
 *       B) window.RESUME_DATA (supported)
 *   - job-points.json provides bullet points and tag flags (and optionally dates)
 */

(function () {
  // -----------------------------
  // Config
  // -----------------------------
  const TAGS = [
    { key: "Leadership", label: "Leadership" },
    { key: "IT", label: "IT" },
    { key: "Service", label: "Service" },
    { key: "Data Analyst", label: "Data Analyst" },
    { key: "BA", label: "BA" },
    { key: "PM", label: "PM" },
    { key: "Financial", label: "Financial" },
    { key: "Sales", label: "Sales" },
    { key: "Retail", label: "Retail" },
    { key: "Physical Labor", label: "Physical Labor" },
    { key: "Author", label: "Author" },
    { key: "Theatre", label: "Theatre" },
  ];

  const YEARS_BACK_OPTIONS = [
    { value: "all", label: "All time" },
    { value: "3", label: "Last 3 years" },
    { value: "5", label: "Last 5 years" },
    { value: "10", label: "Last 10 years" },
    { value: "15", label: "Last 15 years" },
    { value: "20", label: "Last 20 years" },
    { value: "25", label: "Last 25 years" },
    { value: "30", label: "Last 30 years" },
  ];

  // -----------------------------
  // Utils
  // -----------------------------
  const $id = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toEmployerKey(s) {
    return String(s ?? "").trim().toLowerCase();
  }

  function tagLabelFromKey(key) {
    const found = TAGS.find((t) => t.key === key);
    return found ? found.label : key;
  }

  function parseDateLoose(value) {
    // Accept: "YYYY", "YYYY-MM", "YYYY-MM-DD", "MM/YYYY", "Present"
    const v = String(value ?? "").trim();
    if (!v) return null;
    if (/present|current|now/i.test(v)) return new Date();

    // MM/YYYY or M/YYYY
    const m0 = v.match(/^(\d{1,2})\/(\d{4})$/);
    if (m0) {
      const mo = Number(m0[1]) - 1;
      const y = Number(m0[2]);
      const dt = new Date(y, mo, 1);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // YYYY-MM or YYYY
    const m1 = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m1) {
      const y = Number(m1[1]);
      const mo = Number(m1[2]) - 1;
      const d = m1[3] ? Number(m1[3]) : 1;
      const dt = new Date(y, mo, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const m2 = v.match(/^(\d{4})$/);
    if (m2) {
      const dt = new Date(Number(m2[1]), 0, 1);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // Fallback: Date.parse
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t);
    return null;
  }

  function overlapsCutoff(job, cutoffDate) {
    // include if job ended after cutoff (or ongoing), or if unknown dates
    const start = parseDateLoose(job.startDate);
    const end = parseDateLoose(job.endDate) || new Date();
    if (!start && !end) return true;
    return end >= cutoffDate;
  }

  function formatDateRange(startDate, endDate) {
    const s = String(startDate ?? "").trim();
    const e = String(endDate ?? "").trim();
    if (!s && !e) return "";
    if (!s) return e;
    if (!e) return s;
    return `${s} – ${e}`;
  }

  function normalizePoint(raw) {
    // raw may use various field names
    const employer = raw.Employer ?? raw.employer ?? raw.Company ?? raw.company ?? "";
    const bullet =
      raw["Bullet Point text"] ??
      raw.bullet ??
      raw.bulletText ??
      raw["bullet point"] ??
      raw["Bullet"] ??
      "";

    // Optional dates in the job-points json (helpful for roles not in RESUME_* metadata)
    const startDate = raw.startDate ?? raw["Start Date"] ?? raw["Start"] ?? "";
    const endDate = raw.endDate ?? raw["End Date"] ?? raw["End"] ?? "";

    const tags = [];
    for (const t of TAGS) {
      const v = raw[t.key];
      if (String(v ?? "").trim().toLowerCase() === "yes") tags.push(t.key);
    }

    return {
      employer: String(employer ?? "").trim(),
      employerKey: toEmployerKey(employer),
      bullet: String(bullet ?? "").trim(),
      tags,
      startDate: String(startDate ?? "").trim(),
      endDate: String(endDate ?? "").trim(),
    };
  }

  function groupPointsByEmployer(points) {
    const byEmployer = new Map();
    for (const p of points) {
      if (!p.employerKey) continue;
      if (!byEmployer.has(p.employerKey)) byEmployer.set(p.employerKey, []);
      byEmployer.get(p.employerKey).push(p);
    }
    return byEmployer;
  }

  function buildJobMetaIndex(jobs) {
    const m = new Map();
    for (const j of jobs) {
      const key = toEmployerKey(j.employer);
      if (!key) continue;
      m.set(key, j);
    }
    return m;
  }

  function mergeJobsWithPoints(pointsByEmployer, jobsMeta) {
    const jobMetaByEmployer = buildJobMetaIndex(jobsMeta || []);

    const merged = [];
    for (const [employerKey, points] of pointsByEmployer.entries()) {
      const meta = jobMetaByEmployer.get(employerKey) || {
        employer: points[0]?.employer || employerKey,
        title: "",
        location: "",
        startDate: "",
        endDate: "",
      };

      // If meta missing dates but points include them, fill in.
      const metaStart = String(meta.startDate ?? "").trim();
      const metaEnd = String(meta.endDate ?? "").trim();
      const pointStart = points.find((p) => p.startDate)?.startDate || "";
      const pointEnd = points.find((p) => p.endDate)?.endDate || "";

      merged.push({
        employer: meta.employer || points[0]?.employer || employerKey,
        title: meta.title || "",
        location: meta.location || "",
        startDate: metaStart || pointStart || "",
        endDate: metaEnd || pointEnd || "",
        points: points.map((p) => ({ bullet: p.bullet, tags: p.tags })),
      });
    }

    // Sort by endDate desc then startDate desc, unknown dates last
    merged.sort((a, b) => {
      const ae = parseDateLoose(a.endDate) || new Date(0);
      const be = parseDateLoose(b.endDate) || new Date(0);
      if (be.getTime() !== ae.getTime()) return be - ae;
      const as = parseDateLoose(a.startDate) || new Date(0);
      const bs = parseDateLoose(b.startDate) || new Date(0);
      return bs - as;
    });

    return merged;
  }

  function normalizeResumeData() {
    // Preferred: window.RESUME_DATA
    if (window.RESUME_DATA && typeof window.RESUME_DATA === "object") {
      const d = window.RESUME_DATA;
      return {
        profile: d.profile || {},
        sections: d.sections || {},
        jobs: d.jobs || [],
      };
    }

    // Back-compat: window.RESUME_PROFILE / window.RESUME_SECTIONS / window.RESUME_JOBS
    const profile = window.RESUME_PROFILE || {};
    const sections = window.RESUME_SECTIONS || {};
    const jobs = window.RESUME_JOBS || [];

    const skillsString = sections.skills || "";
    const skillsItems = skillsString
      ? String(skillsString)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      profile: {
        name: profile.name || "",
        contactLine: profile.contactLine || "",
        summary: sections.summary || "",
        highlights: Array.isArray(sections.highlights) ? sections.highlights : [],
      },
      sections: {
        education: Array.isArray(sections.education) ? sections.education : [],
        skills: skillsItems.length ? [{ group: "Technical Skills", items: skillsItems }] : [],
      },
      jobs,
    };
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function renderNoResults(container) {
    container.innerHTML = `
      <div class="no-results">
        <strong>No results</strong><br/>
        Try selecting a different type of work, or increase “How far back”.
      </div>
    `;
  }

  function renderSectionHeading(text) {
    return `<h4 style="margin-top:18px;">${escapeHtml(text)}</h4>`;
  }

  function renderBullets(points) {
    if (!points?.length) return "";
    return `
      <ul style="margin-top:8px;">
        ${points.map((p) => `<li>${escapeHtml(p.bullet)}</li>`).join("")}
      </ul>
    `;
  }

  function renderJob(job) {
    const dateRange = formatDateRange(job.startDate, job.endDate);
    const metaBits = [];
    if (job.location) metaBits.push(job.location);
    if (dateRange) metaBits.push(dateRange);

    const meta = metaBits.length ? `<div class="muted">${escapeHtml(metaBits.join(" • "))}</div>` : "";

    const titleLine = job.title
      ? `<div><strong>${escapeHtml(job.title)}</strong> — ${escapeHtml(job.employer)}</div>`
      : `<div><strong>${escapeHtml(job.employer)}</strong></div>`;

    return `
      <div style="margin-bottom:14px; page-break-inside: avoid; break-inside: avoid;">
        ${titleLine}
        ${meta}
        ${renderBullets(job.points)}
      </div>
    `;
  }

  function renderResume(container, resume, jobs) {
    const parts = [];

    // Optional contact line (if you want it visible in the export area)
    if (resume.profile?.contactLine) {
      parts.push(`<div class="muted" style="margin-bottom:10px;">${escapeHtml(resume.profile.contactLine)}</div>`);
    }

    // Summary
    if (resume.profile?.summary) {
      parts.push(renderSectionHeading("Summary"));
      parts.push(`<p>${escapeHtml(resume.profile.summary)}</p>`);
    }

    // Highlights
    if (resume.profile?.highlights?.length) {
      parts.push(renderSectionHeading("Highlights"));
      parts.push(`<ul>${resume.profile.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`);
    }

    // Experience
    parts.push(renderSectionHeading("Experience"));
    if (!jobs?.length) {
      parts.push(`<div class="no-results">No roles matched the current filters.</div>`);
    } else {
      parts.push(jobs.map(renderJob).join(""));
    }

    // Education
    if (resume.sections?.education?.length) {
      parts.push(renderSectionHeading("Education"));
      parts.push(
        resume.sections.education
          .map((e) => {
            const school = e.school || "";
            const degree = e.degree || "";
            const details = e.details || "";

            const line1 = `<div><strong>${escapeHtml(school)}</strong>${degree ? ` — ${escapeHtml(degree)}` : ""}</div>`;
            const line2 = details ? `<div class="muted">${escapeHtml(details)}</div>` : "";
            return `<div style="margin-bottom:10px;">${line1}${line2}</div>`;
          })
          .join("")
      );
    }

    // Skills
    if (resume.sections?.skills?.length) {
      parts.push(renderSectionHeading("Skills"));
      parts.push(
        resume.sections.skills
          .map((s) => {
            const items = (s.items || []).map(escapeHtml).join(", ");
            return `<div><strong>${escapeHtml(s.group)}</strong>${items ? `: ${items}` : ""}</div>`;
          })
          .join("")
      );
    }

    container.innerHTML = parts.join("");
  }

  // -----------------------------
  // Filters
  // -----------------------------
  function populateSelect(select, options) {
    select.innerHTML = options
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join("");
  }

  function computeCutoffFromYearsBack(value) {
    if (value === "all") return null;
    const years = Number(value);
    if (!Number.isFinite(years) || years <= 0) return null;
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d;
  }

  function buildSubtitle(selectedTag, yearsBackVal) {
    const tagText = selectedTag === "All" ? "All work types" : tagLabelFromKey(selectedTag);
    const yearsText = yearsBackVal === "all" ? "All time" : `Last ${yearsBackVal} years`;
    return `${tagText} • ${yearsText}`;
  }

  function sanitizeFilePart(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_\-]+/g, "");
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function loadJobPoints() {
    // Prefer inline points if present (optional)
    if (window.JOB_POINTS) {
      const raw = window.JOB_POINTS;
      const rows = Array.isArray(raw) ? raw : Object.values(raw || {});
      return rows
        .filter((r) => r && typeof r === "object")
        .map(normalizePoint)
        .filter((p) => p.employerKey && p.bullet);
    }

    const res = await fetch("job-points.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load job-points.json (${res.status})`);
    const raw = await res.json();

    const rows = Array.isArray(raw) ? raw : Object.values(raw || {});
    return rows
      .filter((r) => r && typeof r === "object")
      .map(normalizePoint)
      .filter((p) => p.employerKey && p.bullet);
  }

  // -----------------------------
  // Main
  // -----------------------------
  let ALL_JOBS = []; // merged jobs with points
  let BASE = null;

  function applyFiltersAndRender() {
    const container = $id("resumeContainer");
    const resultsSummary = $id("resultsSummary");
    const pdfSubtitle = $id("pdfSubtitle");

    if (!container || !BASE) return;

    const selectedTag = ($id("workTypeSelect")?.value || "All").trim() || "All";
    const yearsBackVal = ($id("yearsBackSelect")?.value || "all").trim() || "all";

    // Tag filter
    const tagFiltered = ALL_JOBS
      .map((job) => {
        if (selectedTag === "All") return job;
        const points = (job.points || []).filter((p) => (p.tags || []).includes(selectedTag));
        return { ...job, points };
      })
      .filter((job) => (job.points || []).length > 0);

    // Years-back filter (role-level)
    const cutoff = computeCutoffFromYearsBack(yearsBackVal);
    const finalJobs = cutoff ? tagFiltered.filter((j) => overlapsCutoff(j, cutoff)) : tagFiltered;

    // Render
    if (!finalJobs.length) {
      renderNoResults(container);
    } else {
      renderResume(container, BASE, finalJobs);
    }

    // Summary + subtitle
    const bullets = finalJobs.reduce((sum, j) => sum + (j.points?.length || 0), 0);
    const roles = finalJobs.length;

    if (resultsSummary) {
      resultsSummary.textContent = `${roles} role${roles === 1 ? "" : "s"} • ${bullets} bullet${bullets === 1 ? "" : "s"}`;
    }
    if (pdfSubtitle) {
      pdfSubtitle.textContent = buildSubtitle(selectedTag, yearsBackVal);
    }
  }

  function wirePdfButton() {
    const btn = $id("downloadPdfBtn");
    if (!btn) return;

    btn.addEventListener("click", function () {
      const printable = $id("resumePrintable");
      if (!printable) return;

      const selectedTag = ($id("workTypeSelect")?.value || "All").trim() || "All";
      const yearsBackVal = ($id("yearsBackSelect")?.value || "all").trim() || "all";

      const fileSafeTag = selectedTag === "All" ? "all" : sanitizeFilePart(tagLabelFromKey(selectedTag));
      const fileSafeYears = yearsBackVal === "all" ? "all_time" : `last_${sanitizeFilePart(yearsBackVal)}_years`;
      const filename = `Justin_T_Cole_Resume_${fileSafeTag}_${fileSafeYears}.pdf`;

      const opt = {
        margin: [0.4, 0.4, 0.4, 0.4],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      };

      html2pdf().set(opt).from(printable).save();
    });
  }

  function wireResetButton() {
    const btn = $id("resetFilters");
    if (!btn) return;

    btn.addEventListener("click", function () {
      const wt = $id("workTypeSelect");
      const yb = $id("yearsBackSelect");
      if (wt) wt.value = "All";
      if (yb) yb.value = "all";
      applyFiltersAndRender();
    });
  }

  function wireFilterEvents() {
    const wt = $id("workTypeSelect");
    const yb = $id("yearsBackSelect");

    if (wt) wt.addEventListener("change", applyFiltersAndRender);
    if (yb) yb.addEventListener("change", applyFiltersAndRender);
  }

  async function init() {
    BASE = normalizeResumeData();

    // Fill selects
    const wt = $id("workTypeSelect");
    const yb = $id("yearsBackSelect");

    if (wt) {
      populateSelect(wt, [{ value: "All", label: "All" }, ...TAGS.map((t) => ({ value: t.key, label: t.label }))]);
    }
    if (yb) {
      populateSelect(yb, YEARS_BACK_OPTIONS);
    }

    wireFilterEvents();
    wirePdfButton();
    wireResetButton();

    // Load and merge points + job metadata
    try {
      const points = await loadJobPoints();
      const grouped = groupPointsByEmployer(points);
      ALL_JOBS = mergeJobsWithPoints(grouped, BASE.jobs || []);
      applyFiltersAndRender();
    } catch (err) {
      console.error(err);
      const container = $id("resumeContainer");
      if (container) {
        container.innerHTML = `
          <div class="no-results">
            <strong>Could not load job points.</strong><br/>
            Make sure <code>job-points.json</code> is present next to this page (or update the fetch path in <code>resume.js</code>).
          </div>
        `;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
