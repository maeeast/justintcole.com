/*
  Resume Maker (dropdown filters + PDF export)

  Data files:
    data/jobs.json
    data/job-points.json

  Date parsing supports: YYYY-MM-DD, YYYY-MM, MM/YYYY, YYYY, and "Present"/"Current".
*/

(function () {
  'use strict';

  // Must match the flag keys inside each record in data/job-points.json
  const WORK_TYPES = [
    { key: 'IT', label: 'IT' },
    { key: 'BA', label: 'Business Analyst' },
    { key: 'PM', label: 'Project Manager' },
    { key: 'Data Analyst', label: 'Data Analyst' },
    { key: 'Financial', label: 'Financial' },
    { key: 'Sales', label: 'Sales' },
    { key: 'Retail', label: 'Retail' },
    { key: 'Physical Labor', label: 'Physical Labor' },
    { key: 'Service', label: 'Service' },
    { key: 'Author', label: 'Author' },
    { key: 'Theatre', label: 'Theatre' }
  ];

  const DEFAULT_WORK_TYPE = 'ALL';
  const DEFAULT_YEARS_BACK = '3';

  const YEARS_BACK_OPTIONS = [
    { value: '1', label: 'Last 1 year' },
    { value: '3', label: 'Last 3 years' },
    { value: '5', label: 'Last 5 years' },
    { value: '10', label: 'Last 10 years' },
    { value: '15', label: 'Last 15 years' },
    { value: '20', label: 'Last 20 years' },
    { value: 'ALL', label: 'All time' }
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function safeText(v) {
    return (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  }

  function isYes(v) {
    if (v === true || v === 1) return true;
    if (typeof v !== 'string') return false;
    const s = v.trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === 'y' || s === '1';
  }

  function unique(paths) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
    return out;
  }

  function buildCandidatePaths(filename) {
    // Prefer /data first, then fallback to same folder.
    const dirs = ['data', './data', '../data', '../../data', '/data'];
    const paths = [];
    for (const d of dirs) paths.push(`${d}/${filename}`);
    paths.push(filename);
    return unique(paths);
  }

  async function fetchFirstJson(candidatePaths) {
    let lastErr = null;
    for (const p of candidatePaths) {
      try {
        const url = new URL(p, document.baseURI).toString();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status} for ${p}`);
          continue;
        }
        const data = await res.json();
        return { path: p, data };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Unable to load JSON');
  }

  function toArray(json) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      return Object.keys(json).map(k => json[k]);
    }
    return [];
  }

  function normalizeEmployerKey(s) {
    return safeText(s).toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  }

  function baseEmployerKey(s) {
    return normalizeEmployerKey(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  function parseFlexibleDate(raw, isEnd) {
    const s = safeText(raw);
    if (!s) return null;
    const lower = s.toLowerCase();
    if (lower === 'present' || lower === 'current' || lower === 'now' || lower === 'ongoing') return null;

    let m = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(y, mo - 1, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    m = lower.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const dt = isEnd ? new Date(y, mo, 0) : new Date(y, mo - 1, 1);
      return isNaN(dt.getTime()) ? null : dt;
    }

    m = lower.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mo = Number(m[1]);
      const y = Number(m[2]);
      const dt = isEnd ? new Date(y, mo, 0) : new Date(y, mo - 1, 1);
      return isNaN(dt.getTime()) ? null : dt;
    }

    m = lower.match(/^(\d{4})$/);
    if (m) {
      const y = Number(m[1]);
      const dt = isEnd ? new Date(y, 11, 31) : new Date(y, 0, 1);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatMonthYear(dt) {
    if (!dt || !(dt instanceof Date) || isNaN(dt.getTime())) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  function formatRange(startDt, endDt) {
    const start = startDt ? formatMonthYear(startDt) : '';
    const end = endDt ? formatMonthYear(endDt) : 'Present';
    if (!start && end === 'Present') return '';
    if (!start) return end;
    return `${start} \u2013 ${end}`;
  }

  function normalizeJob(j, idx, now) {
    const id = safeText(j.id || j.Id || j.jobId || j.job_id || j.JobId) || String(idx + 1);
    const employer = safeText(j.employer || j.Employer || j.company || j.Company || j.organization || j.Organization);
    const title = safeText(j.title || j.Title || j.role || j.Role || j.position || j.Position);
    const location = safeText(j.location || j.Location);

    const startRaw = j.start_date ?? j.startDate ?? j.StartDate ?? j.start ?? j.from ?? '';
    const endRaw = j.end_date ?? j.endDate ?? j.EndDate ?? j.end ?? j.to ?? '';

    let startDt = parseFlexibleDate(startRaw, false);
    let endDt = parseFlexibleDate(endRaw, true);

    // Optional approximation (if no dates exist)
    const yrs = Number(j.yearsInRole ?? j.years_in_role ?? j.durationYears ?? j.duration_years ?? NaN);
    if (!startDt && !endDt && !isNaN(yrs) && yrs > 0) {
      endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDt = new Date(now.getFullYear() - yrs, now.getMonth(), now.getDate());
    }

    return { id, employer, title, location, startDt, endDt };
  }

  function tagKeyVariants(label) {
    const lower = label.toLowerCase();
    const snake = lower.replace(/\s+/g, '_');
    const nospace = lower.replace(/\s+/g, '');
    return unique([label, lower, snake, nospace]);
  }

  function readTag(rec, label) {
    if (!rec) return false;
    for (const k of tagKeyVariants(label)) {
      if (Object.prototype.hasOwnProperty.call(rec, k)) return isYes(rec[k]);
    }
    return false;
  }

  function normalizePoint(p, idx) {
    const id = safeText(p.id || p.Id || p.pointId || p.point_id || p.JobPointId || p.BulletId) || String(idx + 1);
    const employer = safeText(p.Employer || p.employer || p.company || p.Company || p.organization || p.Organization);
    const text = safeText(
      p['Bullet Point text'] ?? p['Bullet Point Text'] ?? p.bullet_point_text ?? p.bulletPointText ?? p.bullet ?? p.text ?? p.Text
    );
    const jobId = safeText(p.jobId || p.JobId || p.job_id || p.roleId || p.role_id);

    const tags = {};
    for (const wt of WORK_TYPES) tags[wt.key] = readTag(p, wt.key);

    return { id, employer, text, jobId, tags };
  }

  function jobInRange(job, cutoff) {
    if (!cutoff) return true;
    if (!job.startDt && !job.endDt) return true; // unknown dates => keep
    if (!job.endDt) return true; // current/ongoing
    return job.endDt >= cutoff;
  }

  function sortJobsNewestFirst(a, b) {
    const aEnd = a.endDt ? a.endDt.getTime() : Number.POSITIVE_INFINITY;
    const bEnd = b.endDt ? b.endDt.getTime() : Number.POSITIVE_INFINITY;
    if (aEnd !== bEnd) return bEnd - aEnd;
    const aStart = a.startDt ? a.startDt.getTime() : 0;
    const bStart = b.startDt ? b.startDt.getTime() : 0;
    return bStart - aStart;
  }

  function pointsForJob(job, points) {
    const byId = job.id ? points.filter(pt => pt.jobId && pt.jobId === job.id) : [];
    if (byId.length) return byId;

    const empKey = normalizeEmployerKey(job.employer);
    const direct = points.filter(pt => normalizeEmployerKey(pt.employer) === empKey);
    if (direct.length) return direct;

    const baseKey = baseEmployerKey(job.employer);
    return points.filter(pt => baseEmployerKey(pt.employer) === baseKey);
  }

  function buildFilename(workTypeKey, yearsBack) {
    const typePart = workTypeKey === 'ALL' ? 'All' : workTypeKey.replace(/\s+/g, '-');
    const yearsPart = yearsBack === 'ALL' ? 'AllTime' : `Last-${yearsBack}-Years`;
    return `Justin-T-Cole_${typePart}_${yearsPart}.pdf`;
  }

  function renderNoResults(container) {
    container.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'no-results';
    d.innerHTML = '<strong>No results</strong><div class="muted" style="margin-top:6px;">Try selecting a different type of work, or increase “How far back”.</div>';
    container.appendChild(d);
  }

  function renderError(container, message) {
    container.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'no-results';
    d.innerHTML = `<strong>${safeText(message)}</strong>`;
    container.appendChild(d);
  }

  function createRoleCard(job, pts) {
    const card = document.createElement('div');
    card.className = 'role-card';

    const header = document.createElement('div');
    header.className = 'role-header';

    const title = document.createElement('h4');
    title.className = 'role-title';
    title.textContent = job.title ? `${job.employer} — ${job.title}` : job.employer;

    const meta = document.createElement('div');
    meta.className = 'role-meta';
    const range = formatRange(job.startDt, job.endDt);
    const loc = job.location ? ` • ${job.location}` : '';
    meta.textContent = `${range}${loc}`.trim();

    header.appendChild(title);
    header.appendChild(meta);

    const ul = document.createElement('ul');
    ul.style.marginTop = '10px';

    for (const p of pts) {
      const li = document.createElement('li');
      li.textContent = p.text;
      ul.appendChild(li);
    }

    card.appendChild(header);
    card.appendChild(ul);

    return card;
  }

  async function init() {
    const workTypeSelect = byId('workTypeSelect');
    const yearsBackSelect = byId('yearsBackSelect');
    const downloadPdfBtn = byId('downloadPdfBtn');
    const resetBtn = byId('resetFilters');
    const resultsSummary = byId('resultsSummary');
    const resumeContainer = byId('resumeContainer');
    const pdfSubtitle = byId('pdfSubtitle');

    if (!workTypeSelect || !yearsBackSelect || !resumeContainer) return;

    // Build selects
    workTypeSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL';
    allOpt.textContent = 'All work';
    workTypeSelect.appendChild(allOpt);

    for (const wt of WORK_TYPES) {
      const o = document.createElement('option');
      o.value = wt.key;
      o.textContent = wt.label;
      workTypeSelect.appendChild(o);
    }

    yearsBackSelect.innerHTML = '';
    for (const y of YEARS_BACK_OPTIONS) {
      const o = document.createElement('option');
      o.value = y.value;
      o.textContent = y.label;
      yearsBackSelect.appendChild(o);
    }

    workTypeSelect.value = DEFAULT_WORK_TYPE;
    yearsBackSelect.value = DEFAULT_YEARS_BACK;

    const now = new Date();

    let jobs = [];
    let points = [];

    try {
      const jobsRes = await fetchFirstJson(buildCandidatePaths('jobs.json'));
      jobs = toArray(jobsRes.data).map((j, idx) => normalizeJob(j, idx, now)).filter(j => j.employer);
    } catch (e) {
      renderError(resumeContainer, 'Could not load jobs. Make sure data/jobs.json exists and is reachable from resume.html.');
      console.error(e);
      return;
    }

    try {
      const pointsRes = await fetchFirstJson(buildCandidatePaths('job-points.json'));
      points = toArray(pointsRes.data).map((p, idx) => normalizePoint(p, idx)).filter(p => p.employer && p.text);
    } catch (e) {
      renderError(
        resumeContainer,
        'Could not load job points. Make sure data/job-points.json exists and is reachable from resume.html (and you are not opening the file via file://).'
      );
      console.error(e);
      return;
    }

    function render() {
      const workType = workTypeSelect.value || 'ALL';
      const yearsBack = yearsBackSelect.value || 'ALL';

      const cutoff = yearsBack === 'ALL'
        ? null
        : new Date(now.getFullYear() - Number(yearsBack), now.getMonth(), now.getDate());

      const jobsSorted = [...jobs].sort(sortJobsNewestFirst);

      const cards = [];
      let totalPts = 0;

      for (const job of jobsSorted) {
        if (!jobInRange(job, cutoff)) continue;

        let pts = pointsForJob(job, points);
        if (workType !== 'ALL') pts = pts.filter(p => p.tags[workType]);
        if (pts.length === 0) continue;

        cards.push(createRoleCard(job, pts));
        totalPts += pts.length;
      }

      const workTypeLabel = workType === 'ALL'
        ? 'All work'
        : (WORK_TYPES.find(w => w.key === workType)?.label || workType);

      const yearsLabel = yearsBack === 'ALL' ? 'All time' : `Last ${yearsBack} years`;

      if (pdfSubtitle) pdfSubtitle.textContent = `${workTypeLabel} • ${yearsLabel}`;
      if (resultsSummary) resultsSummary.textContent = `${cards.length} role${cards.length === 1 ? '' : 's'} • ${totalPts} bullet point${totalPts === 1 ? '' : 's'}`;

      resumeContainer.innerHTML = '';
      if (cards.length === 0) {
        renderNoResults(resumeContainer);
        return;
      }
      for (const c of cards) resumeContainer.appendChild(c);
    }

    workTypeSelect.addEventListener('change', render);
    yearsBackSelect.addEventListener('change', render);

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        workTypeSelect.value = DEFAULT_WORK_TYPE;
        yearsBackSelect.value = DEFAULT_YEARS_BACK;
        render();
      });
    }

    if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener('click', function () {
        const workType = workTypeSelect.value || 'ALL';
        const yearsBack = yearsBackSelect.value || 'ALL';
        const el = document.getElementById('resumePrintable') || document.body;

        if (!window.html2pdf) {
          window.print();
          return;
        }

        const options = {
          margin: 0.4,
          filename: buildFilename(workType, yearsBack),
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        window.html2pdf().set(options).from(el).save();
      });
    }

    // Initial render
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
