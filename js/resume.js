/* resume.js
   - Supports BOTH:
     A) a combined `resume.json` (preferred), OR
     B) resume-data.js + external `job-points.json`
   - Filtering continues to work even when jobs now have startDate/endDate.
*/

(() => {
  const TAGS = [
    "Leadership",
    "IT",
    "Service",
    "Data Analyst",
    "BA",
    "PM",
    "Financial",
    "Sales",
    "Retail",
    "Physical Labor",
    "Author",
    "Theatre"
  ];

  const RESUME_JSON_URL = "resume.json";       // optional combined file
  const JOB_POINTS_URL = "job-points.json";    // your fixed JSON file

  const $ = (id) => document.getElementById(id);

  const elName = $("name");
  const elContact = $("contact");
  const elSummary = $("summary");
  const elHighlights = $("highlights");
  const elExperience = $("experience");
  const elEducation = $("education");
  const elSkills = $("skills");
  const elFilterChips = $("filterChips");
  const elClearBtn = $("clearBtn");
  const elPrintBtn = $("printBtn");

  const state = {
    selectedTags: new Set(),
    resume: null
  };

  function normalizeToArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "object") {
      // If it's keyed by numbers ("1", "2", "3"...), turn into array in key order.
      const keys = Object.keys(v);
      const numeric = keys.every((k) => /^\d+$/.test(k));
      if (numeric) {
        return keys.sort((a,b) => Number(a)-Number(b)).map((k) => v[k]);
      }
      // Otherwise treat values as array.
      return keys.map((k) => v[k]);
    }
    return [];
  }

  function isYes(v) {
    return String(v || "").trim().toLowerCase() === "yes";
  }

  function safeText(el, text) {
    el.textContent = text || "";
  }

  // Accepts MM/YYYY, M/YYYY, YYYY-MM, YYYY-MM-DD, YYYY, or "Present"
  function parseDateLoose(s) {
    const raw = String(s || "").trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === "present" || lower === "current" || lower === "now") {
      return { kind: "open", raw };
    }

    // MM/YYYY or M/YYYY
    let m = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      const month = Number(m[1]);
      const year = Number(m[2]);
      if (month >= 1 && month <= 12) return { kind: "month", year, month, raw: `${String(month).padStart(2,"0")}/${year}` };
    }

    // YYYY-MM or YYYY-MM-DD
    m = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (month >= 1 && month <= 12) return { kind: "month", year, month, raw: `${String(month).padStart(2,"0")}/${year}` };
    }

    // YYYY
    m = raw.match(/^(\d{4})$/);
    if (m) return { kind: "year", year: Number(m[1]), raw: raw };

    // Fall back: keep raw string
    return { kind: "raw", raw };
  }

  function formatDateRange(startDate, endDate) {
    const s = parseDateLoose(startDate);
    const e = parseDateLoose(endDate);

    const sTxt = s ? (s.raw || "") : "";
    const eTxt = e ? (e.kind === "open" ? "Present" : (e.raw || "")) : "";

    if (!sTxt && !eTxt) return "";
    if (sTxt && !eTxt) return sTxt;
    if (!sTxt && eTxt) return eTxt;
    return `${sTxt} - ${eTxt}`;
  }

  function buildResumeFromGlobals(jobPoints) {
    const profile = window.RESUME_PROFILE || { name: "Your Name", contactLine: "" };
    const sections = window.RESUME_SECTIONS || { summary: "", highlights: [], education: [], skills: "" };
    const jobs = normalizeToArray(window.RESUME_JOBS);

    return {
      profile,
      sections,
      jobs,
      jobPoints
    };
  }

  function normalizeCombinedResumeJson(data) {
    // data can be {profile, sections, jobs, jobPoints} or similar
    const profile = data.profile || data.Profile || data.header || {};
    const sections = data.sections || data.Sections || {};
    const jobs = normalizeToArray(data.jobs || data.Jobs || data.experience || []);
    const jobPoints = normalizeToArray(data.jobPoints || data.points || data.JobPoints || {});
    return { profile, sections, jobs, jobPoints };
  }

  async function tryLoadCombinedResumeJson() {
    try {
      const r = await fetch(RESUME_JSON_URL, { cache: "no-store" });
      if (!r.ok) return null;
      const data = await r.json();
      return normalizeCombinedResumeJson(data);
    } catch {
      return null;
    }
  }

  async function loadJobPoints() {
    // Priority 1: window.JOB_POINTS (inline)
    if (window.JOB_POINTS) {
      return normalizeToArray(window.JOB_POINTS);
    }

    // Priority 2: external file
    try {
      const r = await fetch(JOB_POINTS_URL, { cache: "no-store" });
      if (!r.ok) {
        console.warn(`Could not fetch ${JOB_POINTS_URL} (status ${r.status}).`);
        return [];
      }
      const data = await r.json();
      return normalizeToArray(data);
    } catch (err) {
      console.warn(`Could not fetch ${JOB_POINTS_URL}`, err);
      return [];
    }
  }

  function employerKey(s) {
    return String(s || "").trim();
  }

  function buildJobsByEmployer(jobs) {
    const map = new Map();
    for (const j of jobs || []) {
      const key = employerKey(j.employer || j.Employer);
      if (!key) continue;
      map.set(key, {
        employer: key,
        title: j.title || j.Title || "",
        startDate: j.startDate || j.start || j.StartDate || j["Start Date"] || "",
        endDate: j.endDate || j.end || j.EndDate || j["End Date"] || ""
      });
    }
    return map;
  }

  function pointHasAnySelectedTag(point, selectedTags) {
    if (selectedTags.size === 0) return true;

    for (const tag of selectedTags) {
      if (isYes(point[tag])) return true;
    }
    return false;
  }

  function groupPointsByEmployer(points) {
    const groups = new Map();
    for (const p of points) {
      const emp = employerKey(p.Employer || p.employer);
      if (!emp) continue;
      if (!groups.has(emp)) groups.set(emp, []);
      groups.get(emp).push(p);
    }
    return groups;
  }

  function renderFilterChips() {
    elFilterChips.innerHTML = "";
    for (const tag of TAGS) {
      const label = document.createElement("label");
      label.className = "chip";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedTags.has(tag);
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedTags.add(tag);
        else state.selectedTags.delete(tag);
        render();
      });

      const txt = document.createElement("span");
      txt.textContent = tag;

      label.appendChild(cb);
      label.appendChild(txt);
      elFilterChips.appendChild(label);
    }
  }

  function renderHeader(profile) {
    safeText(elName, profile.name || profile.Name || "Your Name");
    safeText(elContact, profile.contactLine || profile.ContactLine || profile.contact || "");
  }

  function renderSummary(sections) {
    safeText(elSummary, sections.summary || sections.Summary || "");
  }

  function renderHighlights(sections) {
    const items = normalizeToArray(sections.highlights || sections.Highlights);
    elHighlights.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = String(it || "");
      elHighlights.appendChild(li);
    }
  }

  function renderEducation(sections) {
    const edu = normalizeToArray(sections.education || sections.Education);
    elEducation.innerHTML = "";
    for (const e of edu) {
      const div = document.createElement("div");
      div.className = "edu-item";

      const school = document.createElement("div");
      const details = document.createElement("div");

      const schoolName = e.school || e.School || e.institution || e.Institution || "";
      const info = e.details || e.Details || e.degree || e.Degree || "";

      if (schoolName) {
        const strong = document.createElement("strong");
        strong.textContent = schoolName;
        school.appendChild(strong);
      }
      if (info) details.textContent = info;

      div.appendChild(school);
      if (info) div.appendChild(details);

      elEducation.appendChild(div);
    }
  }

  function renderSkills(sections) {
    safeText(elSkills, sections.skills || sections.Skills || "");
  }

  function renderExperience(resume) {
    const jobsByEmployer = buildJobsByEmployer(resume.jobs);
    const allPoints = normalizeToArray(resume.jobPoints);

    // Apply filters to points
    const filteredPoints = allPoints.filter((p) => pointHasAnySelectedTag(p, state.selectedTags));
    const grouped = groupPointsByEmployer(filteredPoints);

    // Determine display order:
    // 1) use RESUME_JOBS order if available
    // 2) otherwise, alphabetical by employer
    const jobOrder = normalizeToArray(resume.jobs).map((j) => employerKey(j.employer || j.Employer)).filter(Boolean);
    const employers = new Set([...grouped.keys()]);

    let orderedEmployers = [];
    for (const e of jobOrder) if (employers.has(e)) orderedEmployers.push(e);
    const remaining = [...employers].filter((e) => !orderedEmployers.includes(e)).sort((a,b) => a.localeCompare(b));
    orderedEmployers = orderedEmployers.concat(remaining);

    elExperience.innerHTML = "";

    if (orderedEmployers.length === 0) {
      const p = document.createElement("p");
      p.className = "summary";
      p.textContent = "No bullet points match the selected filters.";
      elExperience.appendChild(p);
      return;
    }

    for (const emp of orderedEmployers) {
      const jobMeta = jobsByEmployer.get(emp) || { employer: emp, title: "", startDate: "", endDate: "" };
      const points = grouped.get(emp) || [];

      const jobDiv = document.createElement("div");
      jobDiv.className = "job";

      const hdr = document.createElement("div");
      hdr.className = "job-header";

      const title = jobMeta.title ? jobMeta.title : "";
      const dateRange = formatDateRange(jobMeta.startDate, jobMeta.endDate);

      // Match PDF style: Title | Employer | dates
      const parts = [];
      if (title) parts.push(title);
      parts.push(emp);
      if (dateRange) parts.push(dateRange);

      hdr.textContent = parts.join(" | ");
      jobDiv.appendChild(hdr);

      const ul = document.createElement("ul");
      ul.className = "bullets";

      // Keep stable ordering from original JSON by default
      for (const p of points) {
        const li = document.createElement("li");
        // IMPORTANT: use textContent so embedded quotes are safe
        li.textContent = String(p["Bullet Point text"] || p.bullet || p.text || "");
        ul.appendChild(li);
      }

      jobDiv.appendChild(ul);
      elExperience.appendChild(jobDiv);
    }
  }

  function render() {
    if (!state.resume) return;
    renderFilterChips();
    renderHeader(state.resume.profile || {});
    renderSummary(state.resume.sections || {});
    renderHighlights(state.resume.sections || {});
    renderEducation(state.resume.sections || {});
    renderSkills(state.resume.sections || {});
    renderExperience(state.resume);
  }

  function wireButtons() {
    elClearBtn.addEventListener("click", () => {
      state.selectedTags.clear();
      render();
    });

    elPrintBtn.addEventListener("click", () => {
      window.print();
    });
  }

  async function init() {
    wireButtons();

    // 1) prefer combined resume.json if present
    const combined = await tryLoadCombinedResumeJson();
    if (combined) {
      state.resume = combined;
      render();
      return;
    }

    // 2) otherwise: resume-data.js + job-points.json
    const points = await loadJobPoints();
    state.resume = buildResumeFromGlobals(points);
    render();
  }

  init();
})();
