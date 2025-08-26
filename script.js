'use strict';

// === Elements ===
const els = {
  jobInput: document.getElementById('job-input'),
  categorySelect: document.getElementById('category-select'),
  sheetSelect: document.getElementById('sheet-select'),
  filterInput: document.getElementById('filter-input'),
  image: document.getElementById('image'),
  status: document.getElementById('status-text'),
};

function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
  console.log('[STATUS]', msg);
}

// ---------- Optional registry (maps job id -> folder paths) ----------
async function ensureJobsRegistry() {
  try {
    const r = await fetch('jobs/jobs.json', { cache: 'no-store' });
    if (!r.ok) throw 0;
    const data = await r.json();
    window.jobsRegistry = (data && data.jobs) || [];
  } catch {
    window.jobsRegistry = [];
  }
}
function normalizeJobPath(p) {
  return 'jobs/' + String(p || '').replace(/^(\.\/|\/)+/, '');
}

// ---------- Build currentJob from typed job number ----------
async function applyAccessCode() {
  const accessCode = (els.jobInput?.value || '').trim();
  if (!accessCode) {
    window.currentJob = null;
    setStatus('No access code entered.');
    return;
  }

  // make sure the registry is loaded (if you’re using jobs/jobs.json)
  if (!Array.isArray(window.jobsRegistry)) await ensureJobsRegistry();

  const lower = accessCode.toLowerCase();
  const entry = (window.jobsRegistry || []).find(j =>
    String(j.id || '').toLowerCase() === lower ||
    String(j.label || '').toLowerCase() === lower
  );

  if (entry) {
    window.currentJob = {
      id: entry.id || accessCode,
      label: entry.label || accessCode,
      indexUrl: normalizeJobPath(entry.index || `${accessCode}/index/assets-index.json`),
      imagesDir: normalizeJobPath(entry.imagesDir || `${accessCode}/images/`),
      thumbsDir: normalizeJobPath(entry.thumbsDir || `${accessCode}/thumbs/`),
    };
  } else {
    // fallback: folder name == access code
    window.currentJob = {
      id: accessCode,
      label: accessCode,
      indexUrl: `jobs/${accessCode}/index/assets-index.json`,
      imagesDir: `jobs/${accessCode}/images/`,
      thumbsDir: `jobs/${accessCode}/thumbs/`,
    };
  }

  setStatus(`Access code set: ${window.currentJob.id}`);
}


// ---------- Index helpers ----------
function groupArrayIndexByCategory(items) {
  const groups = {};
  for (const it of items) {
    const raw = (it.path || '').replace(/^\.\//, '');
    const segs = raw.split('/');

    let cat = 'All';
    const iImages = segs.findIndex(s => s.toLowerCase() === 'images');
    if (iImages !== -1 && segs[iImages + 1]) {
      if (segs.length > iImages + 2) cat = segs[iImages + 1];
    } else if (segs[0] === 'assets' && segs[1] && segs.length > 2) {
      cat = segs[1];
    }

    (groups[cat] ||= []).push({
      name: it.name || it.label || segs[segs.length - 1] || 'item',
      label: it.label || it.name,
      path: it.path,
    });
  }

  // collapse to All if almost all are singletons
  let total = 0, singles = 0;
  for (const k of Object.keys(groups)) {
    const len = groups[k].length;
    total += len;
    if (len === 1) singles++;
  }
  if (singles >= total * 0.9) {
    const all = [];
    for (const k of Object.keys(groups)) all.push(...groups[k]);
    return { All: all };
  }
  return groups;
}

function normalizeIndex(raw) {
  return Array.isArray(raw) ? groupArrayIndexByCategory(raw) : raw;
}

function makeOptions(list, firstLabel = 'Select...') {
  const opts = [`<option value="">${firstLabel}</option>`];
  for (const item of list) {
    if (typeof item === 'string') {
      opts.push(`<option value="${item}">${item}</option>`);
    } else if (item && typeof item === 'object') {
      opts.push(`<option value="${item.value || item.name || item.label}">${item.label || item.name || item.value}</option>`);
    }
  }
  return opts.join('\n');
}

// expose key functions globally
window.setStatus = setStatus;
window.applyAccessCode = applyAccessCode;
window.loadIndexForCurrentJob = typeof loadIndexForCurrentJob !== 'undefined' ? loadIndexForCurrentJob : undefined;
window.onCategoryChange = typeof onCategoryChange !== 'undefined' ? onCategoryChange : undefined; // (optional, handy)
window.applyJobNumber = applyAccessCode;  // alias so Enter/Change handlers work
