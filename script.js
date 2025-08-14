
const categorySelect = document.getElementById('category-select');
const sheetSelect = document.getElementById('sheet-select');
const imageEl = document.getElementById('image');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const filterInput = document.getElementById('filter-input');
const statusText = document.getElementById('status-text');

let data = {};
let filteredList = [];
let currentIndex = 0;

async function loadData() {
  setStatus('Loading sections-index.json...');
  try {
    const res = await fetch('sections-index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    initCategories();
    setStatus('Ready.');
  } catch (err) {
    setStatus('Failed to load sections-index.json');
    console.error(err);
  }
}

function initCategories() {
  categorySelect.innerHTML = '';
  const categories = Object.keys(data);
  for (const cat of categories) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  }
  if (categories.length) {
    updateSheets();
  }
}

function updateSheets() {
  const cat = categorySelect.value;
  const all = (data[cat] || []).slice(); // copy
  applyFilterAndPopulate(all);
}

function applyFilterAndPopulate(list) {
  const q = filterInput.value.trim().toLowerCase();
  let result = list;
  if (q) {
    result = list.filter(item =>
      item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
    );
  }
  filteredList = result;
  sheetSelect.innerHTML = '';
  filteredList.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = item.name;
    sheetSelect.appendChild(opt);
  });
  currentIndex = 0;
  if (filteredList.length) {
    sheetSelect.value = '0';
    showCurrent();
  } else {
    imageEl.removeAttribute('src');
    setStatus('No matches.');
  }
}

function showCurrent() {
  if (!filteredList.length) return;
  const item = filteredList[currentIndex];
  imageEl.src = item.path;
  imageEl.alt = item.name;
  sheetSelect.value = String(currentIndex);
  setStatus(`${item.name} (${currentIndex + 1}/${filteredList.length})`);
}

function next() {
  if (!filteredList.length) return;
  currentIndex = (currentIndex + 1) % filteredList.length;
  showCurrent();
}

function prev() {
  if (!filteredList.length) return;
  currentIndex = (currentIndex - 1 + filteredList.length) % filteredList.length;
  showCurrent();
}

categorySelect.addEventListener('change', updateSheets);
sheetSelect.addEventListener('change', () => {
  currentIndex = Number(sheetSelect.value) || 0;
  showCurrent();
});
filterInput.addEventListener('input', updateSheets);
nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', prev);

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
});

function setStatus(msg) {
  statusText.textContent = msg;
}

loadData();
// ----- Touch: swipe (next/prev) + pinch-to-zoom + pan -----
(() => {
  const area = document.getElementById('image-wrapper');
  const img = document.getElementById('image');

  // Transform state
  let scale = 1, minScale = 1, maxScale = 6;
  let tx = 0, ty = 0;
  let lastTap = 0;

  // Active pointers
  const pts = new Map();

  function applyTransform() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.style.transformOrigin = 'center center';
    img.style.willChange = 'transform';
  }

  // Helpers for pinch
  function dist([a,b]) {
    const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }
  function center([a,b]) {
    return { x: (a.clientX + b.clientX)/2, y: (a.clientY + b.clientY)/2 };
  }

  // Clamp pan so you can’t fling the image off-screen entirely
  function clampPan() {
    const rect = area.getBoundingClientRect();
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    // Rough visible size after scale (contain)
    const vw = rect.width, vh = rect.height;
    const maxX = Math.max(0, (iw*scale - vw) / 2) + 40; // a little slack
    const maxY = Math.max(0, (ih*scale - vh) / 2) + 40;

    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  // Swipe detection (when scale is ~1)
  let swipeStartX = null, swipeStartY = null, swipeStartTime = 0;

  area.addEventListener('pointerdown', (e) => {
    area.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, e);
    if (pts.size === 1) {
      swipeStartX = e.clientX; swipeStartY = e.clientY; swipeStartTime = Date.now();
    }
  });

  area.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e);

    const arr = [...pts.values()];
    if (arr.length === 2) {
      // Pinch zoom
      const dNow = dist(arr);
      const cNow = center(arr);

      if (!area._pinchRef) {
        area._pinchRef = { d0: dNow, scale0: scale, c0: cNow, tx0: tx, ty0: ty };
        return;
      }
      const { d0, scale0, c0, tx0, ty0 } = area._pinchRef;
      const factor = dNow / (d0 || 1);
      scale = Math.min(maxScale, Math.max(minScale, scale0 * factor));

      // Pan relative to pinch center
      tx = tx0 + (cNow.x - c0.x);
      ty = ty0 + (cNow.y - c0.y);
      clampPan();
      applyTransform();
    } else if (arr.length === 1 && scale > 1.01) {
      // Drag/pan when zoomed
      const p = arr[0];
      if (!area._dragRef) {
        area._dragRef = { x0: p.clientX, y0: p.clientY, tx0: tx, ty0: ty };
        return;
      }
      const { x0, y0, tx0, ty0 } = area._dragRef;
      tx = tx0 + (p.clientX - x0);
      ty = ty0 + (p.clientY - y0);
      clampPan();
      applyTransform();
    }
  });

  area.addEventListener('pointerup', (e) => {
    area.releasePointerCapture(e.pointerId);
    pts.delete(e.pointerId);
    area._pinchRef = null;
    area._dragRef = null;

    // Swipe only if not zoomed in
    if (scale <= 1.02 && swipeStartX != null) {
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      const dt = Date.now() - swipeStartTime;
      const isSwipe = dt < 500 && Math.abs(dx) > 60 && Math.abs(dy) < 80;
      if (isSwipe) {
        if (dx < 0) next(); else prev();
      }
    }
    swipeStartX = swipeStartY = null;
  });

  // Double-tap to reset
  area.addEventListener('pointerdown', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      scale = 1; tx = 0; ty = 0; applyTransform();
    }
    lastTap = now;
  });

  // When image changes, reset transform
  const _showCurrent = showCurrent;
  showCurrent = function() {
    scale = 1; tx = 0; ty = 0;
    _showCurrent();
    applyTransform();
  }
})();
