console.log("POP BOOT ✓ script file loaded", Date.now());
window.popBootLoaded = true;

'use strict';

// === Elements ===
const els = {
  jobInput: document.getElementById('job-input'),
  categorySelect: document.getElementById('category-select'),
  sheetSelect: document.getElementById('sheet-select'),
  filterInput: document.getElementById('filter-input'),
  image: document.getElementById('image'),
  status: document.getElementById('status-text'),
  step1Next: document.querySelector('#step-1 .next-btn'),
  step2Next: document.querySelector('#step-2 .next-btn'),
  step3Next: document.querySelector('#step-3 .next-btn'),
};

function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
  console.log('[STATUS]', msg);
}
window.setStatus = setStatus;

// ---- Optional jobs registry (jobs/jobs.json) ----
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

// --- Step 4-A: Image URL resolver ---
function resolveImageUrl(item, kind = 'image') {
  const job = window.currentJob || {};
  const imagesDir = job.imagesDir || '';
  const thumbsDir = job.thumbsDir || '';

  const raw =
    (kind === 'thumb'
      ? (item.thumb || item.thumbnail || item.thumbPath || '')
      : (item.image || item.path || item.file || '')) || '';

  const looksAbsolute = /^(https?:)?\/\//i.test(raw) || raw.startsWith('/');
  if (raw && looksAbsolute) return raw;

  const hasFolders = raw.includes('/') || raw.includes('\\');
  if (!hasFolders) {
    const base = (kind === 'thumb') ? thumbsDir : imagesDir;
    return base + raw;
  }

  const normalized = raw.replace(/^.\//, '');
  const jobRoot = job.id ? `jobs/${job.id}/` : '';
  return jobRoot + normalized;
}

// (Compatibility shim)
function buildSrc(_jobId, it) {
  return resolveImageUrl(it, 'image');
}

// ---- Access code → currentJob ----
async function applyAccessCode() {
  const accessCode = (els.jobInput?.value || '').trim();
  if (!accessCode) {
    window.currentJob = null;
    setStatus('No access code entered.');
    if (els.step1Next) els.step1Next.disabled = true;
    return false;
  }

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
    window.currentJob = {
      id: accessCode,
      label: accessCode,
      indexUrl: `jobs/${accessCode}/index/assets-index.json`,
      imagesDir: `jobs/${accessCode}/images/`,
      thumbsDir: `jobs/${accessCode}/thumbs/`,
    };
  }

  setStatus(`Access code set: ${window.currentJob.id}`);
  if (els.step1Next) els.step1Next.disabled = false;
  return true;
}
window.applyAccessCode = applyAccessCode;

// ---- Helpers ----
function makeOptions(list, first='Select...'){
  const o = [`<option value="">${first}</option>`];
  for (const it of list) {
    if (typeof it === 'string') o.push(`<option value="${it}">${it}</option>`);
    else if (it && typeof it === 'object')
      o.push(`<option value="${it.value ?? it.name ?? ''}">${it.label ?? it.name ?? it.value ?? ''}</option>`);
  }
  return o.join('');
}

// Natural sort by label/name (e.g., D-2 before D-10) — keeps your labels
function naturalByLabel(a, b) {
  const pick = (x) => (x?.label ?? x?.name ?? x?.tag ?? x?.path ?? '').toString();
  return pick(a).localeCompare(pick(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Group items WITHOUT changing your category labels
function group(items) {
  const out = { All: [] };

  for (const it of items) {
    const rawPath = String(it.path || it.image || it.file || '').replace(/^\.\//, '');
    const segs = rawPath.split('/');

    // Prefer folder category: .../(images|assets)/<Category>/<file>
    let cat = '';
    for (const marker of ['images', 'assets']) {
      const idx = segs.findIndex(s => s.toLowerCase() === marker);
      if (idx !== -1 && segs[idx + 1] && segs.length > idx + 2) {
        cat = segs[idx + 1]; // use folder name AS-IS
        break;
      }
    }

    // Fallback: filename prefix as-is (e.g., D-12 -> "D")
    if (!cat) {
      const base = (it.label || it.name || segs.at(-1) || '');
      const m = base.match(/^([A-Za-z]+)[-_]/);
      cat = m ? m[1] : 'Misc';
    }

    const norm = {
      name:  it.name  || it.label || segs.at(-1) || 'item',
      label: it.label || it.name  || rawPath,
      path:  it.image || it.path  || it.file     || rawPath,
      thumb: it.thumb || it.thumbnail || it.thumbPath
    };

    (out[cat] ||= []).push(norm);
    out.All.push(norm);
  }

  return out;
}
// ---- Load index for current job ----
async function loadIndexForCurrentJob(){
  if (!window.currentJob?.indexUrl){ setStatus('No access code set.'); return; }
  setStatus('Loading index…');
  try {
    const res = await fetch(window.currentJob.indexUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const arr = Array.isArray(raw) ? raw : Object.values(raw || {}).flat();
    if (!arr.length){ setStatus('No items in index.'); return; }

  const groups = group(arr);

// Sort every category (including "All") by label using natural order
Object.keys(groups).forEach(k => {
  groups[k] = (groups[k] || []).slice().sort(naturalByLabel);
});

// Now publish the **sorted** index
window.currentIndex = groups;

    // Fill categories (move "All" to end)
    const cats = Object.keys(groups).sort((a, b) => {
      if (a === 'All' && b !== 'All') return 1;
      if (b === 'All' && a !== 'All') return -1;
      return a.localeCompare(b);
    });
    if (els.categorySelect) {
      els.categorySelect.innerHTML = makeOptions(
        cats.map(c => ({ value: c, label: `${c} (${(groups[c] || []).length})` })),
        'Select a category'
      );
      els.categorySelect.value = '';
    }
    if (els.step2Next) els.step2Next.disabled = true;

    // Clear sheets list
    if (els.sheetSelect) els.sheetSelect.innerHTML = makeOptions([], 'Select a sheet');

    // State
    window._allItems = arr;
    window._items = [];
    window._pos = 0;

    // Show helper with caption overlay
    window._show = function(i){
      window._pos = Math.max(0, Math.min(i, window._items.length - 1));
      const it = window._items[window._pos];
      const img = els.image;

      // Ensure wrapper positioned for caption
      const wrap = document.getElementById('image-wrapper');
      if (wrap && getComputedStyle(wrap).position === 'static') {
        wrap.style.position = 'relative';
      }

      // Create caption once
      let cap = document.getElementById('image-caption');
      if (!cap && wrap) {
        cap = document.createElement('div');
        cap.id = 'image-caption';
        Object.assign(cap.style, {
          position: 'absolute',
          left: '12px',
          bottom: '12px',
          padding: '6px 10px',
          borderRadius: '10px',
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          fontSize: '14px',
          lineHeight: '1.2',
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 24px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        });
        wrap.appendChild(cap);
      }

      if (!it) {
        img?.removeAttribute('src');
        if (cap) cap.textContent = '';
        return;
      }

      // Show the full image
      img.src = buildSrc(window.currentJob.id, it);

      // Caption text: Category • Label (pos/total)
      const label = it.label || it.name || it.path || '';
      const cat = els.categorySelect?.value || '';
      if (cap) cap.textContent = `${cat ? cat + ' • ' : ''}${label}  (${window._pos + 1}/${window._items.length})`;

      // Footer status + sync sheet select
      setStatus(`Showing: ${label} (${window._pos + 1}/${window._items.length})`);
      if (els.sheetSelect) els.sheetSelect.value = it.path;
    };

    // Wire once
    if (!window._wired){
      window._wired = true;

      // Category changed
      els.categorySelect?.addEventListener('change', () => {
        const cat = els.categorySelect.value;
        const base = window.currentIndex[cat] || [];
        if (els.step2Next) els.step2Next.disabled = !cat;

        const q = (els.filterInput?.value || '').toLowerCase();
        window._items = q
          ? base.filter(it => (`${it.name||''} ${it.label||''} ${it.path||''}`).toLowerCase().includes(q))
          : base;

        // Populate sheets dropdown
        if (els.sheetSelect) {
          els.sheetSelect.innerHTML = makeOptions(
            window._items.map(x => ({ value: x.path, label: x.label || x.name || x.path })),
            'Select a sheet'
          );
        }
        if (window._items.length) {
          _show(0);
          if (els.step3Next) els.step3Next.disabled = false;
        } else {
          els.image?.removeAttribute('src');
          if (els.step3Next) els.step3Next.disabled = true;
          setStatus('No matches.');
        }
      });

      // Sheet changed
      els.sheetSelect?.addEventListener('change', () => {
        const i = window._items.findIndex(it => it.path === els.sheetSelect.value);
        if (i >= 0) _show(i);
        if (els.step3Next) els.step3Next.disabled = i < 0;
      });

      // Filter typing
      els.filterInput?.addEventListener('input', () => {
        const cat = els.categorySelect?.value || '';
        const base = window.currentIndex[cat] || [];
        const q = (els.filterInput.value || '').toLowerCase();
        window._items = q
          ? base.filter(it => (`${it.name||''} ${it.label||''} ${it.path||''}`).toLowerCase().includes(q))
          : base;

        if (els.sheetSelect) {
          els.sheetSelect.innerHTML = makeOptions(
            window._items.map(x => ({ value: x.path, label: x.label || x.name || x.path })),
            'Select a sheet'
          );
        }
        if (window._items.length) {
          _show(0);
          if (els.step3Next) els.step3Next.disabled = false;
        } else {
          els.image?.removeAttribute('src');
          if (els.step3Next) els.step3Next.disabled = true;
          setStatus('No matches.');
        }
      });

      // Prev/Next buttons
      document.getElementById('prev-btn')?.addEventListener('click', () => _show(window._pos - 1));
      document.getElementById('next-btn')?.addEventListener('click', () => _show(window._pos + 1));
    } // end if !_wired

    setStatus(`Index loaded. ${Object.keys(groups).length} categor${Object.keys(groups).length===1?'y':'ies'} found.`);
  } catch (err) {
    console.error(err);
    setStatus('Failed to load index.');
  }
}
window.loadIndexForCurrentJob = loadIndexForCurrentJob;

// Step 1 → Step 2 wiring (always ensure)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('job-input');
  const next1 = document.querySelector('#step-1 .next-btn');
  if (!input || !next1) return;

  // Enable the Next button when there’s text
  const enable = () => next1.disabled = !input.value.trim();
  input.addEventListener('input', enable); enable();

  // When you click Next OR press Enter
  const go = async () => {
    try {
      const ok = await applyAccessCode();
      if (!ok) return;
      await loadIndexForCurrentJob();
      document.getElementById('step-1')?.classList.remove('active');
      document.getElementById('step-2')?.classList.add('active');
      document.getElementById('category-select')?.focus();
    } catch (e) {
      console.error(e);
      setStatus('Error preparing job.');
    }
  };

  next1.addEventListener('click', go);
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') go();
  });
});

// Generic step navigation for buttons with data-go="N"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (!btn) return;
  const n = parseInt(btn.getAttribute('data-go'), 10);
  if (!n) return;
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const next = document.getElementById(`step-${n}`);
  if (next) next.classList.add('active');
});
