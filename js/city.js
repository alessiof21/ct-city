/*
 * Город CrossTech — интерактивная карта.
 * Чистый JS без зависимостей. Данные: js/scene-data.js (геометрия из Figma)
 * и js/config.js (тексты, маршруты, параметры анимации).
 */
(function () {
  'use strict';

  var W = 3029, H = 2274;
  var CFG = window.CTC_CONFIG;
  var SCENE = window.CTC_SCENE;
  var root = document.getElementById('ctc-city');
  if (!root || !CFG || !SCENE) return;

  var params = new URLSearchParams(location.search);
  var DEBUG = params.has('debug');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var REDUCED = mqReduce.matches && !params.has('motion');

  var viewport = root.querySelector('.ctc-viewport');
  var sizer = root.querySelector('.ctc-sizer');
  var stage = root.querySelector('.ctc-stage');
  var world = root.querySelector('.ctc-world');
  var cloudsLayer = root.querySelector('.ctc-clouds');
  var hint = root.querySelector('.ctc-hint');

  var k = 0.4, mode = 'fit';

  /* ============================================================ утилиты */
  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function px(v) { return v + 'px'; }
  function pct(v) { return v + '%'; }

  /* ============================================================ масштаб и режимы */
  // Карта показывается в реальном размере макета (1 px макета = 1 CSS px), экран — «окно»,
  // в котором её прокручивают колесом/тачпадом, перетаскивают мышью или пальцем. Зума нет.
  // data-scale на корне задаёт другой фиксированный масштаб, если понадобится (например 0.6).
  var baseScale = parseFloat(root.getAttribute('data-scale')) || 1;

  function layout() {
    // пока открыт попап — карту не трогаем; если размер окна успел измениться, пересчитаем после закрытия
    if (dialog && dialog.hasAttribute('open')) { layout.pending = true; return; }
    layout.pending = false;
    var cw = root.clientWidth || 1;
    var vh = window.innerHeight || 800;
    var first = !layout.done;
    var cx = 0.5, cy = 0.5;
    var at = first && (params.get('at') || '').split(',').map(Number);   // ?at=2300,1050 — центр вида в координатах макета
    if (at && at.length === 2 && !isNaN(at[0]) && !isNaN(at[1])) { cx = at[0] / W; cy = at[1] / H; }
    if (!first && viewport.scrollWidth > 0) {
      cx = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
      cy = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
    }
    root.style.height = px(Math.floor(vh));
    k = baseScale;   // без зума: карта всегда в реальном размере, её только прокручивают
    mode = (W * k > cw + 1 || H * k > vh + 1) ? 'pan' : 'fit';
    root.setAttribute('data-mode', mode);
    root.style.setProperty('--ctc-k', k.toFixed(5));
    viewport.scrollLeft = cx * W * k - viewport.clientWidth / 2;
    viewport.scrollTop = cy * H * k - viewport.clientHeight / 2;
    layout.done = true;
    pickBackground();
    updateVisibleRect();
  }

  var bgImg = stage.querySelector('.ctc-bg');
  var bgFullRequested = false;
  function pickBackground() {
    var dpr = window.devicePixelRatio || 1;
    if (bgFullRequested || k * dpr <= 0.55) return;
    // полную подложку подменяем только после загрузки — без «мигания»
    bgFullRequested = true;
    var full = new Image();
    full.className = 'ctc-bg';
    full.alt = '';
    full.width = W;
    full.height = H;
    full.decoding = 'async';
    full.onload = function () {
      var add = function () { bgImg.parentNode.insertBefore(full, bgImg.nextSibling); };
      if (full.decode) full.decode().then(add, add); else add();
    };
    full.src = bgImg.getAttribute('data-src-full');
  }

  /* Видимая часть сцены в координатах макета — анимируем только то, что видно */
  var vis = { x0: 0, y0: 0, x1: W, y1: H };
  function updateVisibleRect() {
    if (mode !== 'pan') { vis.x0 = 0; vis.y0 = 0; vis.x1 = W; vis.y1 = H; return; }
    var m = 140;
    vis.x0 = viewport.scrollLeft / k - m;
    vis.y0 = viewport.scrollTop / k - m;
    vis.x1 = (viewport.scrollLeft + viewport.clientWidth) / k + m;
    vis.y1 = (viewport.scrollTop + viewport.clientHeight) / k + m;
  }
  function isVisible(x, y) { return x > vis.x0 && x < vis.x1 && y > vis.y0 && y < vis.y1; }

  /* ============================================================ здания */
  var buildingsById = {};
  function buildBuildings() {
    var list = SCENE.buildings.slice();
    // порядок табуляции: сверху вниз, слева направо
    list.sort(function (a, b) {
      var ra = Math.round((a.vis[1] + a.vis[3] / 2) / 220), rb = Math.round((b.vis[1] + b.vis[3] / 2) / 220);
      return ra - rb || a.vis[0] - b.vis[0];
    });
    list.forEach(function (b) {
      var bld = el('div', 'ctc-bld', world);
      bld.style.zIndex = Math.round(b.z);
      bld.setAttribute('data-id', b.id);
      var popup = b.popup && CFG.popups[b.popup];
      b.parts.forEach(function (p) {
        var part = el('div', 'ctc-part', bld);
        part.style.left = px(p.box[0]);
        part.style.top = px(p.box[1]);
        part.style.width = px(p.box[2]);
        part.style.height = px(p.box[3]);
        var inner = el('div', 'ctc-inner', part);
        inner.style.width = px(p.inner ? p.inner[0] : p.box[2]);
        inner.style.height = px(p.inner ? p.inner[1] : p.box[3]);
        if (p.tf) inner.style.transform = p.tf;
        var clip = el('div', 'ctc-clip' + (p.clip ? ' is-crop' : ''), inner);
        var img = el('img', 'ctc-img', clip);
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        if (p.size) { img.width = p.size[0]; img.height = p.size[1]; }
        img.src = p.src;
        img.style.left = pct(p.img[0]);
        img.style.top = pct(p.img[1]);
        img.style.width = pct(p.img[2]);
        img.style.height = pct(p.img[3]);
        if (p.hit && popup) {
          var hit = el('button', 'ctc-hit', clip);
          hit.type = 'button';
          hit.style.left = pct(p.img[0]);
          hit.style.top = pct(p.img[1]);
          hit.style.width = pct(p.img[2]);
          hit.style.height = pct(p.img[3]);
          hit.style.clipPath = 'polygon(' + p.hit.map(function (q) { return q[0] + '% ' + q[1] + '%'; }).join(',') + ')';
          hit.setAttribute('aria-label', popup.title);
          hit.setAttribute('aria-haspopup', 'dialog');
          hit.addEventListener('click', function (e) {
            if (dragMoved) { e.preventDefault(); return; }
            openPopup(b.popup, hit, bld);
          });
          hit.addEventListener('focus', function () {
            if (hit.matches(':focus-visible')) { bld.classList.add('is-kbd-focus'); showTip(b, popup); }
          });
          hit.addEventListener('blur', function () { bld.classList.remove('is-kbd-focus'); hideTip(b); });
          hit.addEventListener('pointerenter', function (e) {
            preloadPopup(b.popup);
            if (e.pointerType === 'mouse' || e.pointerType === 'pen') showTip(b, popup);
          });
          hit.addEventListener('pointerleave', function () { hideTip(b); });
          buildingsById[b.id] = { el: bld, hit: hit, data: b };
        }
      });
    });
  }

  /* ============================================================ плашка с названием при наведении */
  // Макет: Figma 671:1276 «Блок с названием». Шестигранник с синей обводкой и указателем на здание.
  // Живёт в координатах макета (внутри сцены), поэтому едет вместе с картой при прокрутке.
  // Текст — popup.label, если задан, иначе popup.title. Длинное название переносится на 2 строки.
  var TIP = { depth: 26, height: 66, arrowW: 31.18, arrowH: 27, gap: 4, margin: 8 };   // размеры из макета
  var SVGNS = 'http://www.w3.org/2000/svg';
  var tip = null, tipOwner = null;

  function buildTip() {
    tip = el('div', 'ctc-tip', stage);
    tip.setAttribute('aria-hidden', 'true');   // название уже есть в aria-label кнопки здания
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ctc-tip__shape');
    svg.innerHTML = '<defs><clipPath id="ctc-tip-clip"><path/></clipPath></defs>' +
      '<path class="ctc-tip__fill"/><path class="ctc-tip__stroke" clip-path="url(#ctc-tip-clip)"/><path class="ctc-tip__arrow"/>';
    tip.appendChild(svg);
    tip.svg = svg;
    tip.paths = svg.querySelectorAll('path');
    tip.text = el('span', 'ctc-tip__text', tip);
  }

  function showTip(b, popup) {
    if (!tip || dialog.hasAttribute('open') || dragMoved) return;
    tipOwner = b;
    tip.text.textContent = popup.label || popup.title;
    tip.text.style.paddingLeft = tip.text.style.paddingRight = '';
    tip.classList.remove('is-below');
    // высота (1 или 2 строки) задаёт глубину углов: пропорции шестигранника как в макете
    var h = tip.text.offsetHeight;
    var depth = Math.round(TIP.depth * h / TIP.height);
    tip.text.style.paddingLeft = tip.text.style.paddingRight = px(depth + 7);
    var w = tip.text.offsetWidth;

    // якорь — середина верхней кромки здания; если сверху не помещается в видимую часть карты — под зданием
    var v = b.vis, ax = v[0] + v[2] / 2;
    var vx0 = Math.max(0, viewport.scrollLeft / k), vx1 = Math.min(W, (viewport.scrollLeft + viewport.clientWidth) / k);
    var vy0 = Math.max(0, viewport.scrollTop / k);
    var total = h + TIP.arrowH - 1;
    var below = v[1] - TIP.gap - total < vy0 + TIP.margin;
    var top = below ? v[1] + v[3] + TIP.gap : v[1] - TIP.gap - total;
    var left = clamp(ax - w / 2, vx0 + TIP.margin, vx1 - TIP.margin - w);
    var cx = clamp(ax - left, depth + TIP.arrowW, w - depth - TIP.arrowW);

    var y0 = below ? TIP.arrowH - 1 : 0;   // верх шестигранника внутри плашки
    var hex = 'M' + depth + ' ' + y0 + 'H' + (w - depth) + 'L' + w + ' ' + (y0 + h / 2) + 'L' + (w - depth) + ' ' + (y0 + h) +
      'H' + depth + 'L0 ' + (y0 + h / 2) + 'Z';
    var aw = TIP.arrowW / 2;
    var arrow = below
      ? 'M' + (cx - aw) + ' ' + TIP.arrowH + 'H' + (cx + aw) + 'L' + cx + ' 0Z'
      : 'M' + (cx - aw) + ' ' + (h - 1) + 'H' + (cx + aw) + 'L' + cx + ' ' + total + 'Z';
    tip.svg.setAttribute('width', w);
    tip.svg.setAttribute('height', total);
    tip.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + total);
    tip.paths[0].setAttribute('d', hex);
    tip.paths[1].setAttribute('d', hex);
    tip.paths[2].setAttribute('d', hex);
    tip.paths[3].setAttribute('d', arrow);
    tip.classList.toggle('is-below', below);
    tip.style.left = px(Math.round(left));
    tip.style.top = px(Math.round(top));
    tip.classList.add('is-on');
  }

  function hideTip(b) {
    if (!tip || (b && b !== tipOwner)) return;
    tipOwner = null;
    tip.classList.remove('is-on');
  }

  function buildDecor() {
    SCENE.decor.forEach(function (d) {
      var n = el('div', 'ctc-decor', world);
      n.style.width = px(d.w);
      n.style.height = px(d.h);
      n.style.transform = 'translate(' + px(d.x) + ',' + px(d.y) + ')';
      n.style.zIndex = Math.round(d.z);
      var img = el('img', '', n);
      img.alt = '';
      img.decoding = 'async';
      img.src = d.src;
    });
  }

  // Машины, которые стоят на месте всегда (для наполнения); view — ракурс: 0 лево-низ, 1 лево-верх, 2 право-низ, 3 право-верх
  function buildParkedCars() {
    (CFG.parkedCars || []).forEach(function (p) {
      var b = SCENE.cars.filter(function (c) { return c.key === p.brand; })[0] || SCENE.cars[0];
      var n = el('div', 'ctc-car', world);
      n.style.backgroundImage = 'url(' + b.src + ')';
      n.style.backgroundPosition = (p.view * 100 / 3) + '% 0';
      n.style.transform = 'translate(' + px(p.x - 40) + ',' + px(p.y - 54) + ')';
      n.style.zIndex = Math.round(p.y);
      n.setAttribute('data-brand', b.label);
    });
  }

  /* ============================================================ облака */
  function buildClouds() {
    var small = window.innerWidth < 768;
    (CFG.clouds || []).forEach(function (c, i) {
      var n = el('div', 'ctc-cloud', cloudsLayer);
      n.style.left = px(c.x);
      n.style.top = px(c.y);
      n.style.width = px(c.w);
      n.style.height = px(c.h);
      n.style.opacity = c.opacity;
      if (c.rot) n.style.transform = 'rotate(' + c.rot + 'deg)';
      var img = el('img', '', n);
      img.alt = '';
      img.src = 'assets/map/cloud.webp';
      img.decoding = 'async';
      img.style.setProperty('--ctc-dx', px((small ? 0.6 : 1) * c.dx));
      img.style.setProperty('--ctc-dur', (c.dur * (small ? 1.25 : 1)) + 's');
      img.style.setProperty('--ctc-delay', (-rand(0, c.dur)).toFixed(1) + 's');
    });
  }

  /* ============================================================ попап */
  var dialog = document.getElementById('ctc-dialog');
  var dTitle = dialog.querySelector('.ctc-card__title');
  var dText = dialog.querySelector('.ctc-card__text');
  var dTag = dialog.querySelector('.ctc-tag');
  var dPic = dialog.querySelector('.ctc-card__pic');
  var dImg = dPic.querySelector('img');
  var dActions = dialog.querySelector('.ctc-card__actions');
  var dBtn = dActions.querySelector('.ctc-btn');
  var dClose = dialog.querySelector('.ctc-close');
  var lastTrigger = null, activeBld = null, closing = false;
  var preloaded = {};

  function preloadPopup(id) {
    var src = SCENE.popupImages[id];
    if (!src || preloaded[src]) return;
    preloaded[src] = true;
    var im = new Image();
    im.decoding = 'async';
    im.src = src;
  }

  function fillPopup(id) {
    var p = CFG.popups[id];
    dTitle.textContent = p.title;
    dText.textContent = '';
    (p.text || []).forEach(function (t) {
      var para = el('p', '', dText);
      var m = t.match(/^(.*?)([\w.+-]+@[\w-]+\.[\w.]+)(.*)$/);
      if (m) {
        para.appendChild(document.createTextNode(m[1]));
        var a = el('a', '', para);
        a.href = 'mailto:' + m[2];
        a.textContent = m[2];
        if (m[3]) para.appendChild(document.createTextNode(m[3]));
      } else {
        para.textContent = t;
      }
    });
    if (p.tag) { dTag.textContent = p.tag; dTag.hidden = false; } else { dTag.hidden = true; }
    dPic.className = 'ctc-card__pic' + (p.glow ? ' is-glow-' + p.glow : '');
    dImg.classList.remove('is-loaded');
    var src = SCENE.popupImages[id];
    if (src) {
      dImg.onload = function () { dImg.classList.add('is-loaded'); };
      dImg.src = src;
      if (dImg.complete && dImg.naturalWidth) dImg.classList.add('is-loaded');
      dPic.hidden = false;
    } else {
      dPic.hidden = true;
    }
    if (p.button) {
      dActions.hidden = false;
      dBtn.textContent = p.button.label;
      dBtn.href = p.button.url || '#';
      var external = /^https?:/i.test(p.button.url || '');
      if (external) { dBtn.target = '_blank'; dBtn.rel = 'noopener noreferrer'; }
      else { dBtn.removeAttribute('target'); dBtn.removeAttribute('rel'); }
    } else {
      dActions.hidden = true;
    }
  }

  // Блокировка прокрутки страницы без сдвига вёрстки: ширину исчезнувшей полосы прокрутки компенсируем отступом
  function lockPage(on) {
    var de = document.documentElement;
    if (on) {
      var sb = window.innerWidth - de.clientWidth;
      if (sb > 0) de.style.paddingRight = sb + 'px';
      de.classList.add('ctc-lock');
    } else {
      de.classList.remove('ctc-lock');
      de.style.paddingRight = '';
    }
  }

  function openPopup(id, trigger, bld) {
    if (!CFG.popups[id] || closing) return;
    hideTip();
    fillPopup(id);
    lastTrigger = trigger;
    activeBld = bld;
    if (bld) bld.classList.add('is-active');
    lockPage(true);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.scrollTop = 0;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { dialog.classList.add('is-open'); });
    });
    dClose.focus({ preventScroll: true });
  }

  function closePopup() {
    if (!dialog.hasAttribute('open') || closing) return;
    closing = true;
    dialog.classList.remove('is-open');
    var done = function () {
      if (!closing) return;
      closing = false;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
      lockPage(false);
      if (layout.pending) layout();
      if (activeBld) activeBld.classList.remove('is-active');
      if (lastTrigger) lastTrigger.focus({ preventScroll: true });
    };
    var card = dialog.querySelector('.ctc-card');
    var onEnd = function (e) {
      if (e.target !== card || e.propertyName !== 'transform') return;
      card.removeEventListener('transitionend', onEnd);
      done();
    };
    card.addEventListener('transitionend', onEnd);
    setTimeout(done, REDUCED ? 30 : 420);
  }

  dialog.addEventListener('cancel', function (e) { e.preventDefault(); closePopup(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closePopup(); });
  dClose.addEventListener('click', closePopup);
  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(
      dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null && !n.closest('[hidden]'); });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ============================================================ геометрия путей */
  // Изометрия 2:1 — «земля» ↔ экран. Смещение полос считаем в координатах земли.
  function toGround(x, y) { return [y + x / 2, y - x / 2]; }
  function toScreen(gx, gy) { return [gx - gy, (gx + gy) / 2]; }

  // Полоса со смещением off от оси (правостороннее движение); третье число точки [x, y, off] — своё смещение в этой точке
  function offsetPolyline(pts, off) {
    var g = pts.map(function (p) { return toGround(p[0], p[1]); });
    var out = [];
    for (var i = 0; i < g.length; i++) {
      var a = g[Math.max(0, i - 1)], b = g[i], c = g[Math.min(g.length - 1, i + 1)];
      var d1 = norm(b[0] - a[0], b[1] - a[1]), d2 = norm(c[0] - b[0], c[1] - b[1]);
      if (i === 0) d1 = d2;
      if (i === g.length - 1) d2 = d1;
      var nx = -(d1[1] + d2[1]), ny = d1[0] + d2[0];
      var nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      var cosHalf = Math.max(0.5, nx * -d1[1] + ny * d1[0]);
      var o = pts[i][2] != null ? pts[i][2] : off;
      var s = toScreen(b[0] + nx * o / cosHalf, b[1] + ny * o / cosHalf);
      out.push(s);
    }
    return out;
  }
  function norm(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

  function chaikin(pts, iterations) {
    for (var it = 0; it < iterations; it++) {
      if (pts.length < 3) return pts;
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1];
        if (i > 0) out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
        if (i < pts.length - 2) out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function makePath(pts) {
    var len = [0];
    for (var i = 1; i < pts.length; i++) {
      len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { pts: pts, len: len, total: len[len.length - 1] };
  }
  function pointAt(path, s, out) {
    var pts = path.pts, len = path.len;
    if (s <= 0) { out[0] = pts[0][0]; out[1] = pts[0][1]; return out; }
    if (s >= path.total) { var e = pts[pts.length - 1]; out[0] = e[0]; out[1] = e[1]; return out; }
    var lo = 0, hi = len.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (len[mid] <= s) lo = mid; else hi = mid; }
    var t = (s - len[lo]) / ((len[hi] - len[lo]) || 1);
    out[0] = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
    out[1] = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    return out;
  }
  function trimPath(pts, fromStart, fromEnd) {
    var p = makePath(pts), a = [0, 0], b = [0, 0];
    var s0 = Math.min(fromStart, p.total * 0.45), s1 = Math.max(p.total - fromEnd, p.total * 0.55);
    var res = [pointAt(p, s0, a).slice()];
    for (var i = 1; i < pts.length - 1; i++) if (p.len[i] > s0 && p.len[i] < s1) res.push(pts[i]);
    res.push(pointAt(p, s1, b).slice());
    return res;
  }
  function bezier(a, c, b, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return out;
  }
  function lineIntersect(p, d, q, e) {
    var den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-3) return null;
    var t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }

  /* ============================================================ дорожная сеть */
  var roads = null;
  var TRIM_R = 58;          // радиус поворота на перекрёстке: полосы обрезаются, между ними — кривая
  function buildRoads() {
    var R = CFG.roads, T = CFG.traffic;
    var nodes = {};
    Object.keys(R.nodes).forEach(function (id) {
      var n = R.nodes[id];
      nodes[id] = { id: id, x: n.x, y: n.y, type: n.type || 'junction', to: n.to, hold: n.hold || 0, out: [] };
    });
    var TRIM = TRIM_R;
    var lanes = [];
    R.edges.forEach(function (e, ei) {
      var a = nodes[e.from], b = nodes[e.to];
      var center = [[a.x, a.y]].concat(e.pts || []).concat([[b.x, b.y]]);
      [[a, b, center], [b, a, center.slice().reverse()]].forEach(function (dir) {
        var pts = offsetPolyline(dir[2], e.laneOffset || T.laneOffset);
        pts = trimPath(pts, dir[0].type === 'junction' ? TRIM : 0, dir[1].type === 'junction' ? TRIM : 0);
        pts = chaikin(pts, 2);
        var lane = { id: lanes.length, edge: ei, from: dir[0], to: dir[1], path: makePath(pts) };
        lanes.push(lane);
        dir[0].out.push(lane);
      });
    });
    roads = { nodes: nodes, lanes: lanes };
  }

  /* ---------- парковки (плато, настил) ---------- */
  // Каждая стоянка: подъезд (entry) → проезд (drive) → места (slots). Выезд — задним ходом на проезд,
  // затем передом обратно по встречной полосе подъезда. Проезды узкие, поэтому у каждой стоянки свой «шлюз».
  var lots = [];
  function buildParking() {
    (CFG.parkings || []).forEach(function (P, li) {
      var off = P.laneOffset || CFG.traffic.laneOffset;
      var drive = drivePolyline(P.drive);
      var axis = norm(P.axis[0], P.axis[1]);
      var r = P.turnRadius || 30;
      // via — стоянка едет «транзитом» через другую: её подъезд и проезд, затем своя улица (entry)
      var V = P.via != null ? lots[P.via] : null;
      var lot = {
        P: P,
        inCars: 0,                          // сколько машин сейчас заезжают на места
        out: null,                          // машина, которая сейчас выезжает
        waitingOut: 0,                      // сколько машин ждут выезда
        urgent: null,                       // машина, которая ждёт выезда слишком долго: заезд придерживаем
        via: V
      };

      // Маршрут к местам: подъезд (ось) → проезд → место; обратно — задним ходом, по проезду и встречной полосой подъезда
      function route(axisPts, viaLot, gateType, tag) {
        var entry = chaikin(offsetPolyline(axisPts, off), 2);
        var down = chaikin(offsetPolyline(axisPts.slice().reverse(), off), 2);
        if (viaLot) { entry = joinPts(viaLot.transit.inPts, entry); down = joinPts(down, viaLot.transit.outPts); }
        var end = entry[entry.length - 1], prev = entry[entry.length - 3];
        var dir = norm(end[0] - prev[0], end[1] - prev[1]);
        var sK = drive.cross(end, dir), K = drive.at(sK);
        var dd = norm(down[2][0] - down[0][0], down[2][1] - down[0][1]);
        var sK2 = drive.cross(down[0], dd), K2 = drive.at(sK2);
        var j = 0;
        while (j < down.length - 1 && (down[j][0] - K2[0]) * dd[0] + (down[j][1] - K2[1]) * dd[1] < r * 1.5) j++;
        // откуда приезжают и куда уезжают: край карты или «тоннель» (за зданием, с плавным появлением)
        var gate = { id: 'GATE' + li + tag, type: gateType || 'edge' };
        return {
          entry: entry, end: end, K: K, sK: sK, K2: K2, sK2: sK2, down: down, j: j,
          slot: function (sl, i) {
            // проезд → место: по оси разметки, носом к бордюру
            var sQ = drive.cross(sl, axis), Q = drive.at(sQ);
            // место у самого подъезда — заезжаем прямо, иначе повороты «углом»: на проезд и в место
            var corners = sQ - sK < r * 1.5 ? [sl] : [K].concat(drive.between(sK, sQ, r), [Q, sl]);
            var inPath = makePath(entry.slice(0, -2).concat(filletCorners([entry[entry.length - 2], end].concat(corners), r)));
            // задний ход: из места на проезд, хвостом в сторону от подъезда — чтобы потом ехать к нему передом
            var sE = sQ + Math.max(40, r * 2 + (sK2 - sQ)), E = drive.at(sE);
            var back = makePath(filletCorners([sl, Q].concat(drive.between(sQ, sE, r), [E]), r));
            // вперёд по проезду, поворот на встречную полосу подъезда и прочь
            var turn = filletCorners([E].concat(drive.between(sE, sK2, r), [K2, down[j]]), r);
            var outPath = makePath(turn.concat(down.slice(j + 1)));
            var slotNode = { id: 'SLOT' + li + '.' + i, type: 'park' };
            return {
              alt: tag !== '',
              zBias: tag ? (P.alt.zBias || 0) : (P.zBias || 0),   // поправка глубины машины на этом маршруте
              zBiasAboveY: tag ? P.alt.zBiasAboveY : null,           // …только выше этой линии (ниже — честно за зданием)
              // участок чужого шлюза на пути: вход/выход туда (s по полосе) и ожидание/освобождение на обратном пути
              viaIn: viaLot && [viaLot.stopS, sNear(inPath, viaLot.transit.end) + 40],
              viaOut: viaLot && [sNear(outPath, viaLot.transit.end) - 110, sNear(outPath, viaLot.transit.release)],
              lane: { id: 'park' + li + tag + '.' + i, edge: -1, from: gate, to: slotNode, path: inPath },
              back: back,
              outLane: { id: 'unpark' + li + tag + '.' + i, edge: -1, from: slotNode, to: gate, path: outPath },
              // дальше этой точки выезжающая машина освобождает шлюз: обычная — уже на подъезде,
              // транзитная — когда заняла чужой шлюз, из-за здания — почти скрывшись за ним
              releaseS: viaLot ? sNear(outPath, viaLot.transit.end) - 110 :
                gateType === 'tunnel' ? outPath.total - 40 : makePath(turn).total
            };
          }
        };
      }

      var main = route(P.entry, V, P.gate, '');
      // «стоп-линия» перед проездом: дальше — только если шлюз свободен. У транзитной стоянки — там же, где у плато:
      // её улица узкая (встречным не разъехаться), поэтому весь путь от плато до мест — один шлюз
      lot.stopS = V ? V.stopS : makePath(main.entry).total - 10;
      // транзит для других стоянок: подъезд → весь проезд до конца, и обратно → вниз по подъезду
      var sD = drive.length, D = drive.at(sD);
      lot.transit = {
        inPts: main.entry.slice(0, -2).concat(filletCorners([main.entry[main.entry.length - 2], main.end, main.K].concat(drive.between(main.sK, sD, r), [D]), r)),
        outPts: filletCorners([D].concat(drive.between(sD, main.sK2, r), [main.K2, main.down[main.j]]), r).concat(main.down.slice(main.j + 1)),
        end: D,                             // конец проезда: дальше — чужая улица
        release: main.down[main.j]          // выезжающий транзитом здесь уже на подъезде и шлюз свободен
      };
      // alt — второй путь к тем же местам (например, из-за здания), без транзита
      var alt = P.alt ? route(P.alt.entry, null, P.alt.gate, 'b') : null;
      lot.slots = P.slots.map(function (sl, i) {
        return { id: i, busy: null, routes: [main.slot(sl, i)].concat(alt ? [alt.slot(sl, i)] : []) };
      });
      lots.push(lot);
    });
  }

  // Склейка двух полилиний со сглаживанием стыка (полосы разной ширины, смена ряда)
  function joinPts(a, b) {
    var k = 3, mid = chaikin(a.slice(-k).concat(b.slice(0, k)), 2);
    return a.slice(0, -k).concat(mid, b.slice(k));
  }
  // s ближайшей к точке вершины пути
  function sNear(path, pt) {
    var best = 1e18, bi = 0;
    path.pts.forEach(function (p, i) { var d = Math.hypot(p[0] - pt[0], p[1] - pt[1]); if (d < best) { best = d; bi = i; } });
    return path.len[bi];
  }

  // Ось проезда — ломаная; s — расстояние вдоль неё от первой точки (крайние отрезки продолжаются бесконечно)
  function drivePolyline(pts) {
    var segs = [], acc = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a: a, d: norm(b[0] - a[0], b[1] - a[1]), len: len, s0: acc });
      acc += len;
    }
    function segAt(s) { for (var k = 0; k < segs.length - 1; k++) if (s < segs[k].s0 + segs[k].len) return segs[k]; return segs[segs.length - 1]; }
    return {
      length: acc,
      at: function (s) { var g = segAt(s), t = s - g.s0; return [g.a[0] + g.d[0] * t, g.a[1] + g.d[1] * t]; },
      // где прямая (p, dir) пересекает ось: s точки пересечения
      cross: function (p, dir) {
        for (var k = 0; k < segs.length; k++) {
          var g = segs[k], x = lineIntersect(g.a, g.d, p, dir);
          if (!x) continue;
          var t = (x[0] - g.a[0]) * g.d[0] + (x[1] - g.a[1]) * g.d[1];
          if ((t >= 0 || k === 0) && (t <= g.len || k === segs.length - 1)) return g.s0 + t;
        }
        return 0;
      },
      // изломы оси между s1 и s2 (в порядке движения), кроме слишком близких к концам
      between: function (s1, s2, gap) {
        var out = [], lo = Math.min(s1, s2), hi = Math.max(s1, s2);
        for (var k = 1; k < segs.length; k++) if (segs[k].s0 > lo + gap && segs[k].s0 < hi - gap) out.push(segs[k].a);
        return s1 <= s2 ? out : out.reverse();
      }
    };
  }

  function lotRelease(car) {
    if (car.lot && car.lot.out === car) car.lot.out = null;
  }

  // Ломаная с закруглёнными углами: каждый угол — квадратичная кривая радиусом до r (не больше половины соседних отрезков)
  function filletCorners(pts, r) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var u1 = norm(b[0] - a[0], b[1] - a[1]), u2 = norm(c[0] - b[0], c[1] - b[1]);
      var p = [b[0] - u1[0] * rr, b[1] - u1[1] * rr], q = [b[0] + u2[0] * rr, b[1] + u2[1] * rr];
      out = out.concat(bezier(p, b, q, 10));
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function laneDir(path, atEnd) {
    var p = path.pts, n = p.length;
    var a = atEnd ? p[Math.max(0, n - 4)] : p[0], b = atEnd ? p[n - 1] : p[Math.min(n - 1, 3)];
    return norm(b[0] - a[0], b[1] - a[1]);
  }
  function connector(inLane, outLane) {
    var a = inLane.path.pts[inLane.path.pts.length - 1], b = outLane.path.pts[0];
    var da = laneDir(inLane.path, true), db = laneDir(outLane.path, false);
    var c = lineIntersect(a, da, b, db);
    var dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!c || Math.hypot(c[0] - a[0], c[1] - a[1]) > dist * 1.4 || Math.hypot(c[0] - b[0], c[1] - b[1]) > dist * 1.4) {
      c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    return makePath(bezier(a, c, b, 14));
  }

  /* ============================================================ машины */
  var cars = [], carSeq = 0, brandUse = {};
  var locks = {};
  var spawnTimer = 0.4;
  var tmp = [0, 0], tmp2 = [0, 0];

  function nextBrand() {
    var used = {};
    cars.forEach(function (c) { used[c.brand.key] = true; });
    var pool = SCENE.cars.filter(function (b) { return !used[b.key]; });
    if (!pool.length) pool = SCENE.cars;
    pool.sort(function (a, b) { return (brandUse[a.key] || 0) - (brandUse[b.key] || 0); });
    var b = pool[(Math.random() * Math.min(3, pool.length)) | 0];
    brandUse[b.key] = performance.now();
    return b;
  }

  function Car(lane, s, brand) {
    this.id = ++carSeq;
    this.brand = brand || nextBrand();
    this.lane = lane;
    this.path = lane.path;
    this.s = s || 0;
    this.endNode = lane.to;
    this.vmax = rand(CFG.traffic.speed[0], CFG.traffic.speed[1]);
    this.v = this.vmax * 0.6;
    this.x = 0; this.y = 0; this.hx = 1; this.hy = 0;
    this.view = -1; this.z = -1; this.op = -1;
    this.hidden = 0;
    this.lock = null;
    this.lockNode = null;
    this.after = null;          // полоса после коннектора
    this.el = el('div', 'ctc-car', world);
    this.el.style.backgroundImage = 'url(' + this.brand.src + ')';
    this.el.setAttribute('data-brand', this.brand.label);
    this.place();
  }
  Car.prototype.place = function () {
    pointAt(this.path, this.s, tmp);
    pointAt(this.path, Math.min(this.path.total, this.s + 10), tmp2);
    var hx = tmp2[0] - tmp[0], hy = tmp2[1] - tmp[1];
    if (Math.abs(hx) + Math.abs(hy) < 0.01) { pointAt(this.path, Math.max(0, this.s - 10), tmp2); hx = tmp[0] - tmp2[0]; hy = tmp[1] - tmp2[1]; }
    var l = Math.hypot(hx, hy) || 1;
    var sign = this.reverse ? -1 : 1;     // задним ходом машина смотрит против движения
    this.hx = sign * hx / l; this.hy = sign * hy / l;
    this.x = tmp[0]; this.y = tmp[1];
  };
  Car.prototype.opacity = function () {
    var start = this.lane && this.path === this.lane.path ? this.lane.from : null;
    var o = 1, F = 46;
    if (this.path === (this.lane && this.lane.path)) {
      // hold — сколько px у тоннеля машина полностью невидима (выезжает из-под моста, а не поверх него)
      if (start && (start.type === 'tunnel' || start.type === 'link')) o = Math.min(o, (this.s - (start.hold || 0)) / F);
      var end = this.lane.to;
      if (end.type === 'tunnel' || end.type === 'link') o = Math.min(o, (this.path.total - this.s - (end.hold || 0)) / F);
    }
    return clamp(o, 0, 1);
  };
  Car.prototype.render = function () {
    if (!isVisible(this.x, this.y) && this.view !== -1) return;
    var view;
    // ракурсы в спрайте: 0 лево-низ, 1 лево-верх, 2 право-низ, 3 право-верх
    var hx = this.hx, hy = this.hy;
    var cand = hx < 0 ? (hy > 0 ? 0 : 1) : (hy > 0 ? 2 : 3);
    if (this.view === -1 || (Math.abs(hx) > 0.18 && Math.abs(hy) > 0.12)) view = cand; else view = this.view;
    if (view !== this.view) {
      this.view = view;
      this.el.style.backgroundPosition = (view * 100 / 3) + '% 0';
    }
    this.el.style.transform = 'translate3d(' + (this.x - 40).toFixed(1) + 'px,' + (this.y - 54).toFixed(1) + 'px,0)';
    var z = Math.round(this.y + (this.route && !(this.route.zBiasAboveY && this.y > this.route.zBiasAboveY) ? this.route.zBias : 0));
    if (z !== this.z) { this.z = z; this.el.style.zIndex = z; }
    var o = this.hidden > 0 ? 0 : Math.round(this.opacity() * 20) / 20;
    if (o !== this.op) { this.op = o; this.el.style.opacity = o; }
  };
  Car.prototype.remove = function () {
    if (this.lock) releaseLock(this);
    if (this.slot && this.slot.busy === this) this.slot.busy = null;
    var lot = this.lot;
    if (lot) {
      if (this.entered) lot.inCars--;
      if (this.wantOut) lot.waitingOut--;
      if (lot.urgent === this) lot.urgent = null;
      lotRelease(this);
      var VL = lot.via;
      if (VL) {
        if (this.viaIn) VL.inCars--;
        if (VL.out === this) VL.out = null;
        if (VL.urgent === this) VL.urgent = null;
      }
    }
    this.el.remove();
    this.dead = true;
  };

  function releaseLock(car) {
    if (car.lock && locks[car.lock] === car) delete locks[car.lock];
    car.lock = null;
  }

  function spawnCar() {
    // на парковку едут, только если у стоянки нет очереди: никто не ждёт заезда или выезда
    var order = lots.slice().sort(function () { return Math.random() - 0.5; });
    for (var li = 0; li < order.length; li++) {
      var lot = order[li];
      var busy = lot.waitingOut > 0 || lot.urgent || (lot.via && lot.out) ||
        cars.some(function (c) { return c.lot === lot && c.phase === 'in' && !c.entered; });
      if (busy || Math.random() >= lot.P.chance) continue;
      var freeSlots = lot.slots.filter(function (sl) { return !sl.busy; });
      if (!freeSlots.length) continue;
      // второй путь (из-за здания): машина появляется сразу на участке шлюза, поэтому — только когда там совсем пусто
      var useAlt = !!lot.P.alt && Math.random() < lot.P.alt.share;
      if (useAlt && (lot.inCars > 0 || lot.out)) continue;
      var ri = useAlt ? 1 : 0;
      var p0 = freeSlots[0].routes[ri].lane.path.pts[0];
      var clear = cars.every(function (c) { return c.hidden > 0 || Math.hypot(c.x - p0[0], c.y - p0[1]) > 150; });
      if (!clear) continue;
      var slot = pick(freeSlots);
      var pc = new Car(slot.routes[ri].lane, 0);
      pc.slot = slot; slot.busy = pc; pc.route = slot.routes[ri];
      pc.lot = lot; pc.phase = 'in';
      if (useAlt) { pc.entered = true; lot.inCars++; }
      pc.vmax = Math.min(pc.vmax, 44);
      cars.push(pc);
      return true;
    }
    var sources = [];
    Object.keys(roads.nodes).forEach(function (id) {
      var n = roads.nodes[id];
      if (n.type === 'edge' || n.type === 'tunnel') n.out.forEach(function (l) { sources.push(l); });
    });
    for (var tries = 0; tries < 6; tries++) {
      var lane = pick(sources);
      var p0 = lane.path.pts[0];
      var free = cars.every(function (c) { return c.hidden > 0 || Math.hypot(c.x - p0[0], c.y - p0[1]) > 150; });
      if (free) { cars.push(new Car(lane, 0)); return true; }
    }
    return false;
  }

  function chooseNext(car) {
    var node = car.lane.to;
    var opts = node.out.filter(function (l) { return l.edge !== car.lane.edge; });
    if (!opts.length) opts = node.out;
    return pick(opts);
  }

  function stepCar(car, dt) {
    var T = CFG.traffic;
    var lot = car.lot;
    if (car.parked != null) {         // стоит на месте; потом ждёт, пока шлюз стоянки освободится, и выезжает
      car.parked -= dt;
      if (car.parked > 0) return;
      if (!car.wantOut) { car.wantOut = true; lot.waitingOut++; }
      // ждёт выезда дольше 8 с — новые машины придерживаются наверху съезда, пока она не уедет
      if (car.parked < -8 && !lot.urgent) lot.urgent = car;
      if (lot.inCars > 0 || lot.out) return;
      // иначе заезд в приоритете: если кто-то уже ждёт наверху съезда, сначала пропускаем его
      if (lot.urgent !== car) {
        for (var wi = 0; wi < cars.length; wi++) {
          var wc = cars[wi];
          if (wc.lot === lot && wc.phase === 'in' && !wc.entered && wc.s > lot.stopS - 160) return;
        }
      }
      if (lot.urgent === car) lot.urgent = null;
      car.wantOut = false; lot.waitingOut--;
      lot.out = car;
      car.parked = null; car.phase = 'back'; car.reverse = true;
      car.path = car.route.back; car.s = 0; car.v = 0;
      car.place();
      return;
    }
    if (car.hidden > 0) {             // проезд сквозного тоннеля
      car.hidden -= dt;
      if (car.hidden <= 0) {
        car.hidden = 0;
        car.lane = car.after; car.path = car.lane.path; car.s = 0; car.after = null;
        car.place();
      }
      return;
    }
    // целевая скорость: дистанция до машин впереди и пешеходы на пути
    var target = car.vmax;
    car.why = '';
    var held = car.lock ? car.lockNode : null;
    var blocked = null;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car || o.hidden > 0 || o.dead || o.parked != null) continue;
      // владелец «замка» не ждёт машины, которые стоят перед этим же перекрёстком на других въездах
      if (held && o.lane !== car.lane && o.path === o.lane.path && o.lane.to === held && o.lock !== held.id) continue;
      var dx = o.x - car.x, dy = o.y - car.y;
      var d = Math.hypot(dx, dy);
      if (d > 190) continue;
      var proj = dx * car.hx + dy * car.hy;
      if (proj <= 0) continue;
      var lat = Math.abs(dx * car.hy - dy * car.hx);
      var same = o.hx * car.hx + o.hy * car.hy;
      // держим дистанцию только до попутных машин; пересечения разводят «замки» перекрёстков
      if (lat < 30 && same > 0.6) {
        { var lim = Math.max(0, (proj - T.gap) * 1.6); if (lim < 1) car.why = 'car' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
      } else if ((car.entered || car.viaIn) && (o.entered || o.viaIn) && lat < 40 && proj < 110 && o.blockedBy !== car.id) {
        // на плато: передняя машина поворачивает в место — ждём, пока она не уйдёт с проезда
        { var lim = Math.max(0, (proj - 58) * 1.6); if (lim < 1) car.why = 'lotcar' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
        blocked = o.id;
      }
    }
    car.blockedBy = blocked;
    for (var w = 0; w < walkers.length; w++) {
      var p = walkers[w];
      var wx = p.x - car.x, wy = p.y - car.y;
      var wp = wx * car.hx + wy * car.hy;
      if (wp > 0 && wp < 120 && Math.abs(wx * car.hy - wy * car.hx) < 34) { var lim = Math.max(0, (wp - 52) * 1.4); if (lim < 1) car.why = 'walker' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
    }
    // перекрёсток: занять «замок» узла, иначе ждать
    var node = car.lane && car.path === car.lane.path ? car.lane.to : null;
    if (node && node.type === 'junction') {
      var toEnd = car.path.total - car.s;
      if (toEnd < T.lockRadius - TRIM_R) {
        if (!locks[node.id] || locks[node.id] === car) {
          if (car.lock && car.lock !== node.id) releaseLock(car);
          locks[node.id] = car; car.lock = node.id; car.lockNode = node;
        } else {
          { var lim = Math.max(0, (toEnd - 40) * 1.5); if (lim < 1) car.why = 'lock' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }   // стоп-линия
        }
      }
    }
    if (car.lock && car.lockNode && car.path === car.lane.path && car.lane.from === car.lockNode && car.s > T.lockRadius - TRIM_R + 24) {
      releaseLock(car);
    }
    if (car.phase === 'in') {
      // «шлюз» плато: за стоп-линию наверху съезда — только если никто не выезжает.
      // Заезд в приоритете: выезжающие ждут на месте, пока на плато никто не едет (мест конечное число, так что очередь не вечная)
      if (!car.entered) {
        // у транзитной стоянки urgent не держит на подъезде (иначе стояли бы на съезде по минуте) — он только запрещает новые заезды
        var stopS = lot.stopS, mayEnter = !lot.out && (lot.via || !lot.urgent);
        if (mayEnter && car.s >= stopS - 60) { car.entered = true; lot.inCars++; }
        else if (!mayEnter) { var lim = Math.max(0, (stopS - 60 - car.s) * 1.5); if (lim < 1) car.why = 'lotgate' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
      }
      target = Math.min(target, 14 + (car.path.total - car.s) * 0.45);   // подъезд к месту
      // транзит через чужой шлюз (настил ← плато): заезжаем туда по тем же правилам, на выходе освобождаем
      var VI = car.route.viaIn, VL = lot.via;
      if (VI && !car.viaDone) {
        if (!car.viaIn) {
          var vOk = !VL.out && !VL.urgent;
          if (vOk && car.s >= VI[0] - 60) { car.viaIn = true; VL.inCars++; }
          else if (!vOk) { var lim = Math.max(0, (VI[0] - 60 - car.s) * 1.5); if (lim < 1) car.why = 'via-in' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
        } else if (car.s > VI[1]) { car.viaIn = false; car.viaDone = true; VL.inCars--; }
      }
    }
    // обратный транзит: перед чужим шлюзом ждём, пока там никто не едет, и занимаем его как выезжающий
    var VO = car.route && car.route.viaOut;
    if (VO && (car.phase === 'out' || car.phase === 'gone') && !car.viaOutDone) {
      var VL2 = lot.via;
      if (!car.viaOut) {
        if (car.s >= VO[0] - 150) {
          if (!VL2.out && VL2.inCars <= 0 && (!VL2.urgent || VL2.urgent === car)) {
            car.viaOut = true; VL2.out = car;
            if (VL2.urgent === car) VL2.urgent = null;
          } else {
            { var lim = Math.max(0, (VO[0] - car.s) * 1.5); if (lim < 1) car.why = 'via-out' + (typeof o !== 'undefined' && o && o.id ? ':' + o.id : ''); target = Math.min(target, lim); }
            car.viaWait = (car.viaWait || 0) + dt;
            if (car.viaWait > 8 && !VL2.urgent) VL2.urgent = car;   // ждём долго — придерживаем заезд на плато
          }
        }
      } else if (car.s > VO[1]) { car.viaOut = false; car.viaOutDone = true; if (VL2.out === car) VL2.out = null; }
    }
    if (car.phase === 'back') target = Math.min(target, lot.P.reverseSpeed || 30, 8 + (car.path.total - car.s) * 0.6);
    if (car.phase === 'out' && car.s > car.route.releaseS) { lotRelease(car); car.phase = 'gone'; }
    var a = target > car.v ? 70 : 220;
    car.v += clamp(target - car.v, -a * dt, a * dt);
    car.s += car.v * dt;

    if (car.s >= car.path.total) {
      var over = car.s - car.path.total;
      if (car.phase === 'back') {     // выехали задним ходом — дальше передом к съезду, место свободно
        car.phase = 'out'; car.reverse = false;
        car.vmax = rand(CFG.traffic.speed[0], CFG.traffic.speed[1]);
        car.slot.busy = null;
        car.lane = car.route.outLane; car.path = car.lane.path; car.s = 0; car.v = 0;
        car.place();
        return;
      }
      if (car.after) {                // коннектор пройден — выходим на полосу
        car.lane = car.after; car.path = car.lane.path; car.after = null; car.s = over;
      } else {
        var end = car.lane.to;
        if (end.type === 'park') {
          if (car.entered) { car.entered = false; lot.inCars--; }
          car.phase = 'parked';
          car.s = car.path.total; car.v = 0;
          car.parked = rand(lot.P.stay[0], lot.P.stay[1]);
          car.place();
          return;
        }
        if (end.type === 'edge' || end.type === 'tunnel') { car.remove(); return; }
        if (end.type === 'link') {
          var pair = roads.nodes[end.to];
          var outLane = pair.out[0];
          car.after = outLane;
          car.hidden = Math.hypot(pair.x - end.x, pair.y - end.y) / car.vmax;
          car.render();
          return;
        }
        var next = chooseNext(car);
        car.after = next;
        car.path = connector(car.lane, next);
        car.s = over;
      }
    }
    car.place();
  }

  /* ============================================================ пешеходы */
  var walkers = [], persons = [];
  var walk = null;
  function buildWalkGraph() {
    var Wc = CFG.walk;
    if (!Wc) return;
    var nodes = {};
    Object.keys(Wc.nodes).forEach(function (id) { var n = Wc.nodes[id]; nodes[id] = { id: id, x: n[0], y: n[1], adj: [] }; });
    Wc.edges.forEach(function (e) {
      var a = nodes[e[0]], b = nodes[e[1]];
      var opt = e[2] || {};
      // z — глубина пешехода на этом ребре не меньше z: он на проезде перед участками, хотя ноги выше их нижнего угла
      a.adj.push({ to: b, crossing: !!opt.crossing, z: opt.z || 0 });
      b.adj.push({ to: a, crossing: !!opt.crossing, z: opt.z || 0 });
    });
    walk = { nodes: nodes, list: Object.keys(nodes).map(function (k2) { return nodes[k2]; }) };
  }

  var WALK_SPRITES = {
    m1: { up: 'assets/people/walk-m1-lu.webp', down: 'assets/people/walk-m1-ld.webp' },
    m2: { up: 'assets/people/walk-m2-lu.webp', down: 'assets/people/walk-m2-ld.webp' }
  };

  function Walker(kind, node, lateral) {
    this.kind = kind;
    this.sprites = WALK_SPRITES[kind];
    this.from = node;
    this.to = pick(node.adj).to;
    this.prev = null;
    this.t = 0;
    this.v = rand(CFG.walkers.speed[0], CFG.walkers.speed[1]);
    this.dist = rand(0, 100);
    this.lat = lateral;
    this.wait = 0;
    this.x = node.x; this.y = node.y;
    this.frame = -1; this.dirUp = null; this.flip = null; this.z = -1;
    this.el = el('div', 'ctc-walker', world);
    this.sp = el('span', '', this.el);
  }
  Walker.prototype.segLen = function () { return Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y) || 1; };
  Walker.prototype.step = function (dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    var L = this.segLen();
    // перед зеброй — пропустить машины
    var edge = null;
    for (var i = 0; i < this.from.adj.length; i++) if (this.from.adj[i].to === this.to) edge = this.from.adj[i];
    if (edge && edge.crossing && this.t < 0.02) {
      var mx = (this.from.x + this.to.x) / 2, my = (this.from.y + this.to.y) / 2;
      for (var c = 0; c < cars.length; c++) {
        if (!cars[c].hidden && Math.hypot(cars[c].x - mx, cars[c].y - my) < 170) { this.idle = true; return; }
      }
    }
    // другой пешеход впереди: попутный — подождать, встречный — развернуться (дорожки узкие, обойти негде)
    for (var q = 0; q < walkers.length; q++) {
      var o = walkers[q];
      if (o === this) continue;
      var ox = o.x - this.x, oy = o.y - this.y;
      var ahead = ox * this.hx + oy * this.hy;
      if (ahead <= 0 || ahead > 34 || Math.abs(ox * this.hy - oy * this.hx) > 14) continue;
      if (o.hx * this.hx + o.hy * this.hy > 0) { this.idle = true; return; }
      var f = this.from; this.from = this.to; this.to = f; this.t = 1 - this.t;
      break;
    }
    this.idle = false;
    this.zMin = edge ? edge.z : 0;
    var ds = this.v * dt;
    this.t += ds / L;
    this.dist += ds;
    if (this.t >= 1) {
      var arrived = this.to;
      var opts = arrived.adj.filter(function (e) { return e.to !== this.from; }, this);
      var next = opts.length ? pick(opts).to : this.from;    // тупик — разворот
      this.prev = this.from;
      this.from = arrived;
      this.to = next;
      this.t = 0;
      if (!opts.length ? Math.random() < 0.55 : Math.random() < 0.12) this.wait = rand(1.5, 4);   // постоять: в тупике — чаще
    }
    var dx = this.to.x - this.from.x, dy = this.to.y - this.from.y, l = Math.hypot(dx, dy) || 1;
    this.hx = dx / l; this.hy = dy / l;
    this.x = this.from.x + dx * this.t + (-this.hy) * this.lat;
    this.y = this.from.y + dy * this.t + (this.hx) * this.lat * 0.5;
  };
  Walker.prototype.render = function () {
    if (!isVisible(this.x, this.y) && this.frame !== -1) return;
    var up = this.hy < 0;
    var flip = this.hx > 0;
    var stride = CFG.walkers.stride;
    var frame = (this.wait > 0 || this.idle) ? 0 : Math.floor(this.dist / (stride / 10)) % 10;
    if (up !== this.dirUp) { this.dirUp = up; this.sp.style.backgroundImage = 'url(' + (up ? this.sprites.up : this.sprites.down) + ')'; }
    if (flip !== this.flip) { this.flip = flip; this.el.classList.toggle('is-flip', flip); }
    if (frame !== this.frame) { this.frame = frame; this.sp.style.backgroundPosition = (frame * 100 / 9) + '% 0'; }
    this.el.style.transform = 'translate3d(' + (this.x - 9.1).toFixed(1) + 'px,' + (this.y - 45).toFixed(1) + 'px,0)';
    var z = Math.round(Math.max(this.y, this.zMin || 0));
    if (z !== this.z) { this.z = z; this.el.style.zIndex = z; }
  };

  function buildWalkers() {
    if (!walk) return;
    var start = (CFG.walk.starts || []).slice();
    var n = CFG.walkers.count;
    for (var i = 0; i < n; i++) {
      var id = start.length ? start[i % start.length] : pick(walk.list).id;
      var w = new Walker(i % 2 ? 'm2' : 'm1', walk.nodes[id], rand(-2, 2));
      w.t = rand(0.05, 0.7);
      w.step(0);
      walkers.push(w);
    }
  }

  function buildPersons() {
    (CFG.standing || []).forEach(function (p, i) {
      var n = el('div', 'ctc-person' + (p.flip ? ' is-flip' : ''), world);
      placePerson(n, p.x, p.y, p.flip);
      // roam — «переходит» на другое место, пока ни старого, ни нового места не видно на экране
      if (p.roam) roamers.push({ el: n, x: p.x, y: p.y, R: p.roam, t: rand(p.roam.every[0], p.roam.every[1]) });
      var img = el('img', '', n);
      img.alt = '';
      img.decoding = 'async';
      img.width = 56; img.height = 144;
      img.src = 'assets/people/stand-' + p.who + '.webp';
      var dur = rand(3.4, 5.2);
      img.style.setProperty('--ctc-bd', dur.toFixed(2) + 's');
      img.style.setProperty('--ctc-bdelay', (-rand(0, dur)).toFixed(2) + 's');
      img.style.setProperty('--ctc-sway', (rand(0.35, 0.8) * (i % 2 ? 1 : -1)).toFixed(2) + 'deg');
      persons.push(n);
    });
  }

  var roamers = [];
  function placePerson(n, x, y, flip) {
    n.style.transform = 'translate(' + px(x - 9.1) + ',' + px(y - 45) + ')';
    n.style.zIndex = Math.round(y);
    n.classList.toggle('is-flip', !!flip);
  }
  function stepRoamers(dt) {
    roamers.forEach(function (r) {
      r.t -= dt;
      if (r.t > 0 || isVisible(r.x, r.y)) return;      // пока на него смотрят — стоит на месте
      var free = r.R.spots.filter(function (s) { return (s[0] !== r.x || s[1] !== r.y) && !isVisible(s[0], s[1]); });
      if (!free.length) return;
      var s = pick(free);
      r.x = s[0]; r.y = s[1];
      placePerson(r.el, s[0], s[1], s[2]);
      r.t = rand(r.R.every[0], r.R.every[1]);
    });
  }

  /* ============================================================ цикл анимации */
  var running = false, onScreen = true, rafId = 0, last = 0;
  var fps = 0, fpsAcc = 0, fpsN = 0;

  function frame(t) {
    rafId = 0;
    if (!running) return;
    var dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    spawnTimer -= dt;
    var alive = cars.filter(function (c) { return !c.dead; }).length;
    if (spawnTimer <= 0 && alive < CFG.traffic.count) {
      spawnCar();
      spawnTimer = rand(CFG.traffic.spawnEvery[0], CFG.traffic.spawnEvery[1]);
    }
    for (var i = 0; i < cars.length; i++) if (!cars[i].dead) stepCar(cars[i], dt);
    cars = cars.filter(function (c) { return !c.dead; });
    for (i = 0; i < cars.length; i++) cars[i].render();
    for (i = 0; i < walkers.length; i++) { walkers[i].step(dt); walkers[i].render(); }
    stepRoamers(dt);
    if (DEBUG) debugTick(dt);
    rafId = requestAnimationFrame(frame);
  }
  function start() {
    if (running || REDUCED) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function syncRunning() {
    if (!document.hidden && onScreen) start(); else stop();
    root.classList.toggle('is-paused', !running);
  }

  /* Статичная картинка для «уменьшить движение»: машины стоят на полосах, люди стоят */
  function placeStatic() {
    var lanes = roads.lanes.filter(function (l) { return l.path.total > 300; });
    for (var i = 0; i < Math.min(6, CFG.traffic.count); i++) {
      var lane = lanes[(i * 3) % lanes.length];
      var c = new Car(lane, lane.path.total * (0.3 + 0.12 * (i % 4)));
      cars.push(c);
      c.render();
    }
    walkers.forEach(function (w) { w.wait = 1e9; w.render(); });
  }

  /* ============================================================ панорамирование мышью */
  var dragMoved = false;
  (function setupDrag() {
    var down = null;
    viewport.addEventListener('pointerdown', function (e) {
      if (mode !== 'pan' || e.pointerType !== 'mouse' || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, sl: viewport.scrollLeft, st: viewport.scrollTop };
      dragMoved = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!dragMoved && Math.hypot(dx, dy) > 6) { dragMoved = true; viewport.classList.add('is-dragging'); hideTip(); }
      if (dragMoved) { viewport.scrollLeft = down.sl - dx; viewport.scrollTop = down.st - dy; }
    });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = null;
      viewport.classList.remove('is-dragging');
      setTimeout(function () { dragMoved = false; }, 0);
    });
  })();

  var hintTimer = 0;
  function showHint() {
    if (mode !== 'pan' || !hint) return;
    hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Двигайте карту пальцем' : 'Перетащите карту мышью';
    hint.classList.add('is-on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.remove('is-on'); }, 3200);
  }
  viewport.addEventListener('scroll', function () {
    updateVisibleRect();
    if (hint && hint.classList.contains('is-on') && !dragMoved) {
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hint.classList.remove('is-on'); }, 600);
    }
  }, { passive: true });

  /* ============================================================ отладка (?debug=1) */
  var dbgPanel = null, dbgSvg = null, dbgAcc = 0;
  function buildDebug() {
    root.classList.add('ctc-is-debug');
    var NS = 'http://www.w3.org/2000/svg';
    dbgSvg = document.createElementNS(NS, 'svg');
    dbgSvg.setAttribute('class', 'ctc-debug');
    dbgSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    stage.appendChild(dbgSvg);
    var add = function (tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (a) { n.setAttribute(a, attrs[a]); });
      dbgSvg.appendChild(n);
      return n;
    };
    roads.lanes.forEach(function (l, i) {
      add('polyline', { points: l.path.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none',
        stroke: i % 2 ? '#00e5ff' : '#ffea00', 'stroke-width': 4, 'stroke-dasharray': '14 8', opacity: 0.9 });
      var e = l.path.pts[l.path.pts.length - 1];
      add('circle', { cx: e[0], cy: e[1], r: 6, fill: i % 2 ? '#00e5ff' : '#ffea00' });
    });
    lots.forEach(function (lot) { lot.slots.forEach(function (slot) { slot.routes.forEach(function (sl) {
      add('polyline', { points: sl.lane.path.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: '#ff9100', 'stroke-width': 3, 'stroke-dasharray': '10 6' });
      add('polyline', { points: sl.back.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: '#e040fb', 'stroke-width': 3, 'stroke-dasharray': '4 4' });
      add('polyline', { points: sl.outLane.path.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: '#76ff03', 'stroke-width': 2, 'stroke-dasharray': '10 6' });
    }); }); });
    Object.keys(roads.nodes).forEach(function (id) {
      var n = roads.nodes[id];
      add('circle', { cx: n.x, cy: n.y, r: 10, fill: '#ff3d00' });
      var t = add('text', { x: n.x + 14, y: n.y - 10, fill: '#fff', 'font-size': 30, 'font-weight': 700, stroke: '#000', 'stroke-width': 1 });
      t.textContent = id + ' ' + n.type;
    });
    if (walk) {
      var seen = {};
      walk.list.forEach(function (a) {
        a.adj.forEach(function (e) {
          var key = [a.id, e.to.id].sort().join('|');
          if (seen[key]) return;
          seen[key] = 1;
          add('line', { x1: a.x, y1: a.y, x2: e.to.x, y2: e.to.y, stroke: e.crossing ? '#ff4dff' : '#7CFF6B', 'stroke-width': 3 });
        });
        add('circle', { cx: a.x, cy: a.y, r: 5, fill: '#7CFF6B' });
        var t = add('text', { x: a.x + 6, y: a.y - 6, fill: '#eaffea', 'font-size': 18, stroke: '#000', 'stroke-width': 0.6 });
        t.textContent = a.id;
      });
    }
    dbgPanel = el('div', 'ctc-debug-panel', root);
    var style = el('style', '', document.head);
    style.textContent = '.ctc-is-debug .ctc-hit{background:rgba(255,0,80,.28)}.ctc-is-debug .ctc-car{outline:1px dashed rgba(255,255,255,.6)}';
    stage.addEventListener('click', function (e) {
      var r = stage.getBoundingClientRect();
      var x = Math.round((e.clientX - r.left) / k), y = Math.round((e.clientY - r.top) / k);
      console.log('[ctc] x,y =', x, y);
      dbgPanel.setAttribute('data-click', x + ', ' + y);
    }, true);
  }
  function debugTick(dt) {
    fpsAcc += dt; fpsN++;
    dbgAcc += dt;
    if (dbgAcc < 0.5) return;
    fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; dbgAcc = 0;
    dbgPanel.textContent = 'fps ' + fps + '  k ' + k.toFixed(3) + '  mode ' + mode +
      '\nmachines ' + cars.length + '  walkers ' + walkers.length +
      '\nlocks ' + Object.keys(locks).map(function (n) { return n + ':' + locks[n].id; }).join(' ') +
      '\nclick ' + (dbgPanel.getAttribute('data-click') || '—');
  }

  /* ============================================================ самопроверка (?selftest) */
  // Прогоняет симуляцию в ускоренном режиме и пишет статистику в <pre id="ctc-selftest">.
  function selfTest(seconds) {
    var dt = 1 / 30, steps = Math.round(seconds / dt);
    var stats = { seconds: seconds, spawned: 0, removed: 0, minGap: 1e9, minGapPair: '', closeCalls: 0, maxStopped: 0, stuckCars: [], carsAvg: 0, linkPasses: 0 };
    var stopped = {}, prevIds = {};
    var prevOut = [], outHold = [];
    var origRemove = Car.prototype.remove;
    Car.prototype.remove = function () { stats.removed++; origRemove.call(this); };
    for (var s = 0; s < steps; s++) {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && cars.length < CFG.traffic.count) {
        if (spawnCar()) stats.spawned++;
        spawnTimer = rand(CFG.traffic.spawnEvery[0], CFG.traffic.spawnEvery[1]);
      }
      for (var i = 0; i < cars.length; i++) {
        var wasHidden = cars[i].hidden > 0;
        if (!cars[i].dead) stepCar(cars[i], dt);
        if (!wasHidden && cars[i].hidden > 0) stats.linkPasses++;
      }
      cars = cars.filter(function (c) { return !c.dead; });
      for (i = 0; i < walkers.length; i++) walkers[i].step(dt);
      stats.carsAvg += cars.length / steps;
      lots.forEach(function (lot, li) {   // сколько длится один выезд (пока остальные ждут у стоп-линии)
        if (lot.out) { if (lot.out !== prevOut[li]) { prevOut[li] = lot.out; outHold[li] = 0; } outHold[li] += dt; stats.maxOutHold = Math.max(stats.maxOutHold || 0, +outHold[li].toFixed(1)); }
        else prevOut[li] = null;
      });
      for (i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (c.hidden > 0) continue;
        SCENE.decor.forEach(function (d, di) {      // машина «под» декором (остановкой, скамейкой)
          if (c.y < d.z && c.x + 34 > d.x && c.x - 34 < d.x + d.w && c.y > d.y && c.y - 50 < d.y + d.h) {
            stats.decorHits = stats.decorHits || {};
            var key = di + ' ' + d.src.split('/').pop() + ' @' + Math.round(d.x) + ',' + Math.round(d.y);
            stats.decorHits[key] = (stats.decorHits[key] || 0) + 1;
          }
        });
        if (c.v < 1 && c.parked == null) stopped[c.id] = (stopped[c.id] || 0) + dt; else stopped[c.id] = 0;
        if (c.parked != null) stats.parkedFrames = (stats.parkedFrames || 0) + 1;
        if (c.parked != null && c.parked < 0) stats.maxLeaveWait = Math.max(stats.maxLeaveWait || 0, +(-c.parked).toFixed(1));
        if (stopped[c.id] > 6) {
          stats.longStops = stats.longStops || {};
          var lk = c.lane.from.id + '>' + c.lane.to.id + (c.after ? ' conn' : '') + ' @' + Math.round(c.x / 20) * 20 + ',' + Math.round(c.y / 20) * 20 + ' why=' + (c.why || '?').split(':')[0] + (c.phase ? ' ' + c.phase : '');
          stats.longStops[lk] = Math.max(stats.longStops[lk] || 0, +stopped[c.id].toFixed(1));
        }
        if (stopped[c.id] > stats.maxStopped) {
          stats.maxStopped = +stopped[c.id].toFixed(1);
          stats.maxStoppedAt = c.id + ' ' + c.lane.from.id + '>' + c.lane.to.id + ' ' + (c.phase || '') + (c.entered ? '+' : '') + ' @' + Math.round(c.x) + ',' + Math.round(c.y) +
            (c.lot ? ' out=' + (c.lot.out && c.lot.out.id + ':' + c.lot.out.phase) + ' in=' + c.lot.inCars + ' blk=' + c.blockedBy : '');
        }
        for (var j = i + 1; j < cars.length; j++) {
          var o = cars[j];
          if (o.hidden > 0 || c.opacity() < 0.5 || o.opacity() < 0.5) continue;
          var d = Math.hypot(o.x - c.x, o.y - c.y);
          if (d < stats.minGap) { stats.minGap = +d.toFixed(1); stats.minGapPair = c.lane.from.id + '>' + c.lane.to.id + ' / ' + o.lane.from.id + '>' + o.lane.to.id + ' @' + Math.round(c.x) + ',' + Math.round(c.y); }
          if (d < 34) {
            stats.closeCalls++;
            var key = (c.after ? 'conn ' : '') + c.lane.from.id + '>' + c.lane.to.id + ' / ' + (o.after ? 'conn ' : '') + o.lane.from.id + '>' + o.lane.to.id;
            stats.closeKinds = stats.closeKinds || {};
            stats.closeKinds[key] = (stats.closeKinds[key] || 0) + 1;
          }
        }
      }
    }
    Object.keys(stopped).forEach(function (id) { if (stopped[id] > 12) stats.stuckCars.push(id + ':' + stopped[id].toFixed(1) + 's'); });
    stats.stuckInfo = cars.filter(function (c) { return stopped[c.id] > 12; }).map(function (c) {
      return c.id + ' ' + c.lane.from.id + '>' + c.lane.to.id + (c.after ? ' (conn)' : '') + ' @' + Math.round(c.x) + ',' + Math.round(c.y) +
        ' toEnd ' + Math.round(c.path.total - c.s) + ' lock ' + (c.lock || '-');
    });
    stats.locks = Object.keys(locks).map(function (n) { return n + ':' + locks[n].id; });
    stats.lots = lots.map(function (lot) { return { inCars: lot.inCars, out: lot.out && lot.out.id, waitingOut: lot.waitingOut,
      slots: lot.slots.map(function (sl) { var c = sl.busy; return c ? c.id + ':' + c.phase + (c.entered ? '+' : '') + (c.wantOut ? 'w' : '') + '@' + Math.round(c.x) + ',' + Math.round(c.y) + ' v' + c.v.toFixed(0) : '-'; }) }; });
    stats.carsAvg = +stats.carsAvg.toFixed(2);
    var pre = el('pre', '', document.body);
    pre.id = 'ctc-selftest';
    pre.textContent = JSON.stringify(stats);
  }

  /* ============================================================ старт */
  function init() {
    buildTip();
    buildBuildings();
    buildDecor();
    buildParkedCars();
    buildPersons();
    buildClouds();
    buildRoads();
    buildParking();
    buildWalkGraph();
    buildWalkers();
    layout();
    if (DEBUG) buildDebug();
    walkers.forEach(function (w) { w.render(); });

    var ready = function () { root.setAttribute('data-state', 'ready'); };
    if (params.has('shot')) { document.documentElement.classList.add('ctc-shot'); root.querySelector('.ctc-loader').remove(); ready(); }
    if (bgImg.complete && bgImg.naturalWidth) ready();
    else { bgImg.addEventListener('load', ready); bgImg.addEventListener('error', ready); }
    setTimeout(ready, 4000);

    // ?debug=1: доступ к состоянию машин из консоли — window.CTC_DEBUG.cars()
    if (DEBUG) window.CTC_DEBUG = { cars: function () { return cars; }, walkers: function () { return walkers; } };
    if (params.has('selftest')) { selfTest(+params.get('selftest') || 180); return; }
    if (REDUCED) { placeStatic(); }
    else {
      // заранее «прогреть» трафик, чтобы при открытии машины уже ехали по всей карте
      for (var i = 0; i < CFG.traffic.count; i++) spawnCar();
      for (var s = 0; s < 360; s++) {
        for (var j = 0; j < cars.length; j++) if (!cars[j].dead) stepCar(cars[j], 1 / 15);
        cars = cars.filter(function (c) { return !c.dead; });
        if (cars.length < CFG.traffic.count && s % 25 === 0) spawnCar();
        for (j = 0; j < walkers.length; j++) walkers[j].step(1 / 15);
      }
      cars.forEach(function (c) { c.render(); });
      walkers.forEach(function (w) { w.render(); });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        syncRunning();
      }, { threshold: 0.01 }).observe(root);
    }
    document.addEventListener('visibilitychange', syncRunning);
    syncRunning();

    var rt = 0;
    var onResize = function () { cancelAnimationFrame(rt); rt = requestAnimationFrame(layout); };
    window.addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(root.parentElement || root);
    if (mode === 'pan') setTimeout(showHint, 700);

    // ?open=569:220 — сразу открыть попап (удобно для проверки и демонстрации конкретного здания)
    var openId = params.get('open');
    if (openId && CFG.popups[openId]) {
      var target = Object.keys(buildingsById).map(function (key) { return buildingsById[key]; })
        .filter(function (b) { return b.data.popup === openId; })[0];
      setTimeout(function () { openPopup(openId, target ? target.hit : null, target ? target.el : null); }, 300);
    }

    mqReduce.addEventListener && mqReduce.addEventListener('change', function () { location.reload(); });
  }

  init();
})();
