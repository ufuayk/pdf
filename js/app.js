/* pdf-show — tarayıcıda çalışan PDF sunum motoru. Sunucuya hiçbir şey gönderilmez. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var pdfjs = window.pdfjsLib;
  var CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
  pdfjs.GlobalWorkerOptions.workerSrc = CDN + 'legacy/build/pdf.worker.min.js';

  /* ---------- Dil ---------- */
  var T = {
    en: {
      heroTitle: 'Present PDFs like slides.',
      heroSub: 'Drop a 16:9 PDF. It goes fullscreen and plays like a real slideshow: click to advance, smooth transitions, nothing to install.',
      dropTitle: 'Drop your PDF here', chooseBtn: 'Choose file', dragVeil: 'Drop to present',
      privacy: 'Your file is never uploaded. Everything runs in your browser.',
      f1t: 'Click to advance', f1d: 'Left click goes forward, right click goes back. Just like PowerPoint.',
      f2t: 'Pixel-faithful', f2d: "Rendered at your screen's resolution with the original aspect ratio. No cropping, no distortion.",
      f3t: 'Free forever', f3d: 'Open source, no ads, no tracking, no accounts. Works in every modern browser.',
      keysTitle: 'Controls', kNext: 'Next page', kPrev: 'Previous page', kEnds: 'First / last page',
      kJump: 'Go to page 12', kAnim: 'Toggle transition animation', kFull: 'Toggle fullscreen',
      kBlack: 'Black out the screen', kExit: 'Leave fullscreen', start: 'Start in fullscreen',
      footer: 'Free and open source software.',
      endTitle: 'Thanks for using pdf\u2011show',
      endText: 'No ads, no tracking, no accounts. pdf-show is free software kept alive by volunteer work. If you like it, star the project or say hi to the developer.',
      replay: 'Play again', another: 'Open another PDF', passLabel: 'This PDF is password protected', passOk: 'Open',
      animOn: 'Transitions on', animOff: 'Transitions off',
      errPdf: "Couldn't open this file. Make sure it's a valid PDF.", errType: 'Please choose a PDF file.',
      wrongPass: 'Wrong password, try again.', page: 'Page'
    },
    tr: {
      heroTitle: 'PDF\u2019lerini slayt gibi sun.',
      heroSub: '16:9 PDF\u2019ini bırak. Tam ekran olur ve gerçek bir slayt gösterisi gibi oynar: tıkla-geç, yumuşak geçişler, kurulum yok.',
      dropTitle: 'PDF\u2019ini buraya bırak', chooseBtn: 'Dosya seç', dragVeil: 'Sunmak için bırak',
      privacy: 'Dosyan sunucuya gönderilmez. Her şey tarayıcında işlenir.',
      f1t: 'Tıkla, geç', f1d: 'Sol tık ileri, sağ tık geri. Tıpkı PowerPoint gibi.',
      f2t: 'Piksel sadakati', f2d: 'Ekran çözünürlüğünde, orijinal en-boy oranıyla çizilir. Kırpma yok, bozulma yok.',
      f3t: 'Sonsuza dek ücretsiz', f3d: 'Açık kaynak, reklamsız, takipsiz, hesapsız. Her modern tarayıcıda çalışır.',
      keysTitle: 'Kontroller', kNext: 'Sonraki sayfa', kPrev: 'Önceki sayfa', kEnds: 'İlk / son sayfa',
      kJump: '12. sayfaya git', kAnim: 'Geçiş animasyonunu aç/kapat', kFull: 'Tam ekran aç/kapat',
      kBlack: 'Ekranı karart', kExit: 'Tam ekrandan çık', start: 'Tam ekranda başlat',
      footer: 'Özgür ve açık kaynaklı yazılım.',
      endTitle: 'pdf\u2011show\u2019u kullandığın için teşekkürler',
      endText: 'Reklam yok, takip yok, hesap yok. pdf-show özgür yazılımdır ve gönüllü emekle yaşar. Beğendiysen projeye bir yıldız bırak veya geliştiriciye selam ver.',
      replay: 'Baştan oynat', another: 'Başka PDF aç', passLabel: 'Bu PDF parola korumalı', passOk: 'Aç',
      animOn: 'Geçişler açık', animOff: 'Geçişler kapalı',
      errPdf: 'Bu dosya açılamadı. Geçerli bir PDF seçtiğinden emin ol.', errType: 'Lütfen bir PDF dosyası seç.',
      wrongPass: 'Parola yanlış, tekrar dene.', page: 'Sayfa'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('pdfshow.lang') === 'tr' ? 'tr' : 'en'; } catch (e) {}
  function t(k) { return (T[lang] && T[lang][k]) || T.en[k] || k; }
  function applyLang() {
    document.documentElement.lang = lang;
    [].forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $('lang').textContent = lang === 'tr' ? 'English' : 'Türkçe';
    var h = $('helpBody');
    if (!h.firstChild) h.appendChild(document.querySelector('.keys').cloneNode(true));
    else { h.innerHTML = ''; h.appendChild(document.querySelector('.keys').cloneNode(true)); }
  }
  $('lang').onclick = function () {
    lang = lang === 'tr' ? 'en' : 'tr';
    try { localStorage.setItem('pdfshow.lang', lang); } catch (e) {}
    applyLang();
  };

  /* ---------- Durum ---------- */
  var doc = null, total = 0, cur = 0;           // cur: 0..total-1, total = bitiş sayfası
  var animOn = true;
  try { animOn = localStorage.getItem('pdfshow.anim') !== '0'; } catch (e) {}
  var cache = {};                                // sayfa -> {canvas, key}
  var token = 0, busy = false, wanted = null, jumpBuf = '', jumpTimer = null;
  var wakeLock = null;

  var stage = $('stage'), show = $('show'), home = $('home');

  /* ---------- Yardımcılar ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1400);
  }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement); }
  function enterFull() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
    if (!fn) return Promise.reject(new Error('no fullscreen'));
    try { return Promise.resolve(fn.call(el)); } catch (e) { return Promise.reject(e); }
  }
  function exitFull() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || document.mozCancelFullScreen;
    if (fn && isFull()) try { fn.call(document); } catch (e) {}
  }
  function toggleFull() { if (isFull()) exitFull(); else enterFull().catch(function () {}); }

  function keepAwake() {
    try {
      if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (l) {
        wakeLock = l; l.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && doc) keepAwake(); });

  /* ---------- PDF yükleme ---------- */
  function openFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { warn(t('errType')); return; }
    var fullP = enterFull().then(function () { return true; }, function () { return false; });
    readBuffer(file).then(function (buf) {
      return loadDoc(buf).then(function (d) {
        doc = d; total = d.numPages; cache = {}; cur = 0;
        return fullP.then(function (ok) { begin(ok); });
      });
    }).catch(function (e) {
      if (!(e && e.cancelled)) { exitFull(); warn(t('errPdf')); }
    });
  }
  function warn(msg) { show.hidden = true; home.hidden = false; alert(msg); }
  function readBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file);
    });
  }
  function loadDoc(buf) {
    var task = pdfjs.getDocument({
      data: buf, cMapUrl: CDN + 'cmaps/', cMapPacked: true, standardFontDataUrl: CDN + 'standard_fonts/'
    });
    task.onPassword = function (update, reason) {
      $('pass').hidden = false; $('passInput').value = ''; $('passInput').focus();
      if (reason === 2) toast(t('wrongPass'));
      $('passForm').onsubmit = function (ev) { ev.preventDefault(); $('pass').hidden = true; update($('passInput').value); };
    };
    return task.promise;
  }

  function begin(fullOk) {
    home.hidden = true; show.hidden = false; $('end').hidden = true; $('help').hidden = true;
    document.title = 'pdf-show';
    keepAwake();
    $('animBtn').classList.toggle('off', !animOn);
    wake();
    stage.innerHTML = '';
    if (!fullOk && !isFull() && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) {
      $('start').hidden = false;           // tarayıcı otomatik tam ekrana izin vermediyse tek tıkla başlat
      $('startBtn').focus();
    }
    goTo(0, 0);
  }
  $('startBtn').onclick = function (e) { e.stopPropagation(); enterFull().catch(function () {}); $('start').hidden = true; };

  function closeShow() {
    exitFull(); show.hidden = true; home.hidden = false; $('end').hidden = true;
    stage.innerHTML = ''; cache = {}; token++;
    if (doc) { try { doc.destroy(); } catch (e) {} doc = null; }
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    $('file').value = '';
  }

  /* ---------- Sayfa çizimi ---------- */
  function boxSize() { return { w: window.innerWidth, h: window.innerHeight }; }

  function renderPage(n) {          // n: 0-tabanlı
    var b = boxSize(), key = b.w + 'x' + b.h;
    if (cache[n] && cache[n].key === key) return Promise.resolve(cache[n].canvas);
    return doc.getPage(n + 1).then(function (page) {
      var v1 = page.getViewport({ scale: 1 });
      var fit = Math.min(b.w / v1.width, b.h / v1.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var scale = fit * dpr;
      var maxSide = 4096, longest = Math.max(v1.width, v1.height) * scale;
      if (longest > maxSide) scale *= maxSide / longest;
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = Math.floor(v1.width * fit) + 'px';
      c.style.height = Math.floor(v1.height * fit) + 'px';
      var ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        cache[n] = { canvas: c, key: key };
        var keep = Object.keys(cache);                       // bellek için uzaktaki sayfaları at
        keep.forEach(function (k) { if (Math.abs(k - n) > 3) delete cache[k]; });
        return c;
      });
    });
  }
  function copyCanvas(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.style.width = src.style.width; c.style.height = src.style.height;
    c.getContext('2d', { alpha: false }).drawImage(src, 0, 0);
    return c;
  }
  function preload(n) {
    var list = [n + 1, n - 1, n + 2].filter(function (i) { return i >= 0 && i < total; });
    (function next() {
      var i = list.shift(); if (i === undefined || cur !== n) return;
      renderPage(i).then(next, next);
    })();
  }

  /* ---------- Gezinme ---------- */
  function updateHud() {
    var shown = Math.min(cur + 1, total);
    $('counter').textContent = (cur >= total ? total : shown) + ' / ' + total;
    $('progress').firstChild.style.width = (cur >= total ? 100 : (shown / total) * 100) + '%';
  }

  function goTo(n, dir) {
    if (!doc) return;
    n = Math.max(0, Math.min(total, n));
    if (busy) { wanted = { n: n, dir: dir }; return; }        // art arda basışlarda sonuncusu kazanır
    if (n === cur && stage.firstChild && n !== 0) return;
    busy = true;
    var my = ++token, from = cur;
    cur = n; updateHud();
    if (n >= total) {                                          // bitiş sayfası
      showEnd(); busy = false; return flush();
    }
    $('end').hidden = true;
    renderPage(n).then(function (canvas) {
      if (my !== token) return;
      var el = copyCanvas(canvas);
      swap(el, dir || (n >= from ? 1 : -1), from);
      preload(n);
    }).catch(function () {}).then(function () { busy = false; flush(); });
  }
  function flush() { if (wanted) { var w = wanted; wanted = null; goTo(w.n, w.dir); } }

  function swap(el, dir, from) {
    var old = [].slice.call(stage.children);
    var wasEnd = from >= total;
    stage.appendChild(el);
    var canAnim = animOn && el.animate && old.length && !wasEnd && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canAnim) { old.forEach(function (o) { o.remove(); }); return; }
    var d = 90 * dir, dur = 280, ease = 'cubic-bezier(.22,.7,.2,1)';
    el.animate([{ opacity: 0, transform: 'translateX(' + d + 'px)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: ease });
    old.forEach(function (o) {
      var a = o.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-d) + 'px)' }], { duration: dur, easing: ease, fill: 'forwards' });
      a.onfinish = function () { o.remove(); };
    });
    setTimeout(function () { old.forEach(function (o) { if (o.parentNode) o.remove(); }); }, dur + 80);
  }

  function showEnd() {
    var e = $('end'); e.hidden = false;
    e.style.animation = animOn ? '' : 'none';
    $('hud').classList.add('on-end');
    var a = e.querySelector('a'); if (a) a.blur();
  }
  function next() { if (cur < total) goTo(cur + 1, 1); }
  function prev() { if (cur > 0) goTo(cur - 1, -1); }
  function replay() { $('end').hidden = true; goTo(0, -1); }

  function toggleAnim() {
    animOn = !animOn;
    try { localStorage.setItem('pdfshow.anim', animOn ? '1' : '0'); } catch (e) {}
    $('animBtn').classList.toggle('off', !animOn);
    toast(t(animOn ? 'animOn' : 'animOff'));
  }
  function toggleHelp() { $('help').hidden = !$('help').hidden; }
  function toggleBlack() { $('black').hidden = !$('black').hidden; }

  /* ---------- Girdi: klavye ---------- */
  document.addEventListener('keydown', function (e) {
    if (show.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('pass').hidden) return;
    var k = e.key;
    if (/^[0-9]$/.test(k)) {                                    // sayı yaz + Enter = sayfaya git
      jumpBuf = (jumpBuf + k).slice(0, 5); toast(t('page') + ' ' + jumpBuf + ' ↵');
      clearTimeout(jumpTimer); jumpTimer = setTimeout(function () { jumpBuf = ''; }, 2500);
      return e.preventDefault();
    }
    if (k === 'Enter' && jumpBuf) {
      goTo(Math.min(parseInt(jumpBuf, 10), total) - 1, 0); jumpBuf = ''; return e.preventDefault();
    }
    if (!$('start').hidden && k !== 'Escape') { $('start').hidden = true; enterFull().catch(function () {}); return e.preventDefault(); }
    if (!$('help').hidden) { if (k === 'Escape' || k === '?' || k === 'h' || k === 'H') toggleHelp(); return e.preventDefault(); }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Spacebar': case 'Enter': case 'n': case 'N':
        next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P':
        prev(); break;
      case 'Home': goTo(0, -1); break;
      case 'End': goTo(total - 1, 1); break;
      case 'z': case 'Z': toggleAnim(); break;
      case 'f': case 'F': toggleFull(); break;
      case 'b': case 'B': case '.': toggleBlack(); break;
      case '?': case 'h': case 'H': toggleHelp(); break;
      case 'Escape': if (!isFull()) closeShow(); return;        // tam ekrandaysa tarayıcı zaten çıkarır
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- Girdi: fare / dokunma / tekerlek ---------- */
  function onStageClick(e) {
    if (e.target.closest('#hud, #end, #help, #start, #toast')) return;
    if (e.button !== 0) return;
    if (!$('help').hidden) return toggleHelp();
    if (!$('black').hidden) return toggleBlack();
    next();
  }
  show.addEventListener('click', onStageClick);
  show.addEventListener('contextmenu', function (e) {
    e.preventDefault();                                          // sağ tık = geri
    if (e.target.closest('#hud, #help')) return;
    if (!$('black').hidden) toggleBlack(); else prev();
  });
  var lastWheel = 0;
  show.addEventListener('wheel', function (e) {
    var now = Date.now(); if (now - lastWheel < 350 || Math.abs(e.deltaY) < 8) return;
    lastWheel = now; if (e.deltaY > 0) next(); else prev(); e.preventDefault();
  }, { passive: false });
  var tx = null;
  show.addEventListener('touchstart', function (e) { tx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  show.addEventListener('touchend', function (e) {
    if (tx === null || e.target.closest('#hud, #end, #help')) return;
    var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) { e.preventDefault(); if (dx < 0) next(); else prev(); }
  });

  $('hud').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    e.stopPropagation(); doAct(b.getAttribute('data-act'));
  });
  $('end').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) doAct(b.getAttribute('data-act'));
  });
  function doAct(a) {
    ({ prev: prev, next: next, anim: toggleAnim, full: toggleFull, help: toggleHelp, close: closeShow, replay: replay })[a]();
  }

  /* ---------- İmleci ve arayüzü gizle ---------- */
  var idleTimer;
  function wake() { show.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(function () { show.classList.add('idle'); }, 2200); }
  show.addEventListener('mousemove', wake);
  show.addEventListener('touchstart', wake, { passive: true });

  /* ---------- Yeniden boyutlandırma / tam ekran değişimi ---------- */
  var rz;
  function onResize() {
    clearTimeout(rz);
    rz = setTimeout(function () {
      if (!doc || show.hidden || cur >= total) return;
      cache = {}; var n = cur; cur = -1; busy = false; goTo(n, 0);
    }, 180);
  }
  window.addEventListener('resize', onResize);
  ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) { document.addEventListener(ev, onResize); });

  /* ---------- Dosya seçme ve sürükle-bırak ---------- */
  $('file').addEventListener('change', function () { openFile(this.files[0]); });
  $('drop').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  var depth = 0, veil = $('drag'), frame = $('drop');
  function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; veil.hidden = false; frame.classList.add('over'); });
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) { veil.hidden = true; frame.classList.remove('over'); } });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); depth = 0; veil.hidden = true; frame.classList.remove('over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { if (!show.hidden) { closeShow(); } openFile(f); }
  });

  applyLang();
})();
