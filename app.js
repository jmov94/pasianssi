'use strict';

(() => {
  // Kortti on numero 0–51: maa = c / 13, arvo = c % 13 + 1 (A = 1, K = 13)
  const SUITS = ['♠', '♥', '♦', '♣'].map(s => s + '︎'); // ♠ ♥ ♦ ♣ tekstinä, ei emojina
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const FOUND = ['f0', 'f1', 'f2', 'f3'];
  const TAB = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
  const SAVE_KEY = 'pasianssi.peli';
  const STATS_KEY = 'pasianssi.tilastot';
  const MAX_HISTORY = 200;

  const rank = c => c % 13 + 1;
  const suit = c => Math.floor(c / 13);
  const isRed = c => suit(c) === 1 || suit(c) === 2;
  const last = pile => pile[pile.length - 1];
  const $ = id => document.getElementById(id);

  const board = $('board');
  const overlay = $('overlay');
  const els = [];   // korttien elementit numeron mukaan
  const slots = {}; // tyhjien paikkojen elementit

  let S;            // pelin tila: { piles, up, moves, draw, elapsed, won, counted }
  let history = []; // kumoamista varten: JSON-kuvat aiemmista tiloista
  let L;            // mitat: leveys, korkeus, kortin koko, välit
  let busy = false; // jakoanimaatio tai automaattinen lopetus käynnissä
  let drag = null;
  let gameId = 0;   // vanhentuneet ajastimet tunnistetaan tästä

  // --- Tallennus --------------------------------------------------------

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ S, history })); } catch { /* täynnä tai estetty */ }
  }

  function validState(s) {
    if (!s || !s.piles || !Array.isArray(s.up) || s.up.length !== 52 || (s.draw !== 1 && s.draw !== 3)) return false;
    const seen = new Set();
    let count = 0;
    for (const k of ['stock', 'waste', ...FOUND, ...TAB]) {
      if (!Array.isArray(s.piles[k])) return false;
      for (const c of s.piles[k]) {
        if (!Number.isInteger(c) || c < 0 || c > 51) return false;
        seen.add(c);
        count++;
      }
    }
    return count === 52 && seen.size === 52;
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (d && validState(d.S)) {
        S = d.S;
        S.elapsed = S.elapsed || 0;
        history = Array.isArray(d.history) ? d.history : [];
        return true;
      }
    } catch { /* rikkinäinen tallennus: aloitetaan alusta */ }
    return false;
  }

  function loadStats() {
    const st = { played: 0, won: 0, best: 0 };
    try { Object.assign(st, JSON.parse(localStorage.getItem(STATS_KEY))); } catch { /* ei tilastoja */ }
    return st;
  }

  function saveStats(st) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch { /* ei tallennusta */ }
  }

  // --- Säännöt ----------------------------------------------------------

  function newGame(draw) {
    gameId++;
    board.classList.remove('scatter');
    const deck = [...Array(52).keys()];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const piles = { stock: [], waste: [] };
    for (const k of [...FOUND, ...TAB]) piles[k] = [];
    const up = Array(52).fill(false);
    // Jaetaan rivi kerrallaan kuten oikeassa pelissä, ylin kortti kuvapuoli ylöspäin
    for (let r = 0; r < 7; r++) {
      for (let k = r; k < 7; k++) {
        const c = deck.pop();
        piles[TAB[k]].push(c);
        up[c] = r === k;
      }
    }
    piles.stock = deck;
    S = { piles, up, moves: 0, draw, elapsed: 0, won: false, counted: false };
    history = [];
    save();
    deal();
  }

  function canPlace(cards, to) {
    const pile = S.piles[to];
    const c = cards[0];
    const t = last(pile);
    if (to[0] === 'f') {
      if (cards.length !== 1) return false;
      return t === undefined ? rank(c) === 1 : suit(t) === suit(c) && rank(c) === rank(t) + 1;
    }
    if (to[0] === 't') {
      if (t === undefined) return rank(c) === 13;
      return S.up[t] && isRed(t) !== isRed(c) && rank(t) === rank(c) + 1;
    }
    return false;
  }

  // Pöydän kuvapuoli ylöspäin olevat kortit ovat aina valmiiksi järjestyksessä,
  // joten minkä tahansa niistä voi nostaa päällä olevineen.
  function canPick(from, i) {
    const pile = S.piles[from];
    if (i < 0 || i >= pile.length) return false;
    if (from === 'waste' || from[0] === 'f') return i === pile.length - 1;
    if (from[0] === 't') return S.up[pile[i]];
    return false;
  }

  function pileOf(c) {
    for (const k in S.piles) if (S.piles[k].includes(c)) return k;
    return null;
  }

  // Napautus: ensin pohjapinoon, sitten toisen kortin päälle, viimeisenä tyhjään sarakkeeseen
  function findTarget(from, i) {
    const cards = S.piles[from].slice(i);
    if (cards.length === 1 && from[0] !== 'f') {
      for (const f of FOUND) if (canPlace(cards, f)) return f;
    }
    let empty = null;
    for (const t of TAB) {
      if (t === from || !canPlace(cards, t)) continue;
      if (S.piles[t].length) return t;
      empty = empty || t;
    }
    // Kuningasta ei kannata siirtää tyhjästä sarakkeesta toiseen
    if (empty && !(from[0] === 't' && i === 0)) return empty;
    return null;
  }

  function snapshot() {
    history.push(JSON.stringify({ piles: S.piles, up: S.up, moves: S.moves }));
    if (history.length > MAX_HISTORY) history.shift();
  }

  function move(from, i, to) {
    snapshot();
    S.piles[to].push(...S.piles[from].splice(i));
    const t = last(S.piles[from]);
    if (from[0] === 't' && t !== undefined) S.up[t] = true;
    afterMove();
  }

  function drawStock() {
    if (busy || S.won) return;
    const { stock, waste } = S.piles;
    if (!stock.length && !waste.length) return;
    snapshot();
    if (stock.length) {
      for (let n = 0; n < S.draw && stock.length; n++) {
        const c = stock.pop();
        S.up[c] = true;
        waste.push(c);
      }
    } else {
      // Pakka loppui: poistopino käännetään takaisin pakaksi
      while (waste.length) {
        const c = waste.pop();
        S.up[c] = false;
        stock.push(c);
      }
    }
    afterMove();
  }

  function afterMove() {
    if (!S.counted) {
      S.counted = true;
      const st = loadStats();
      st.played++;
      saveStats(st);
    }
    S.moves++;
    render();
    if (FOUND.every(f => S.piles[f].length === 13)) return win();
    save();
    if (!busy && canAutoComplete()) autoComplete();
  }

  function undo() {
    if (busy || S.won || !history.length) return;
    const h = JSON.parse(history.pop());
    S.piles = h.piles;
    S.up = h.up;
    S.moves = h.moves;
    save();
    render();
  }

  // Kun kaikki kortit ovat näkyvissä ja pakka on tyhjä, peli on ratkaistu
  function canAutoComplete() {
    return !S.won && !S.piles.stock.length && !S.piles.waste.length &&
      TAB.every(t => S.piles[t].every(c => S.up[c]));
  }

  function autoComplete() {
    busy = true;
    const id = gameId;
    const step = () => {
      if (id !== gameId) return;
      // Pienin jäljellä oleva kortti on aina jonkin sarakkeen päällimmäinen
      let from = null;
      for (const t of TAB) {
        const c = last(S.piles[t]);
        if (c !== undefined && (from === null || rank(c) < rank(last(S.piles[from])))) from = t;
      }
      const to = from && FOUND.find(f => canPlace([last(S.piles[from])], f));
      if (!to) { busy = false; return; }
      move(from, S.piles[from].length - 1, to);
      if (!S.won) setTimeout(step, 90);
    };
    setTimeout(step, 200);
  }

  function win() {
    S.won = true;
    busy = false;
    history = [];
    const st = loadStats();
    st.won++;
    if (!st.best || S.elapsed < st.best) st.best = S.elapsed;
    saveStats(st);
    save();
    updateInfo();
    const id = gameId;
    setTimeout(() => {
      if (id !== gameId) return;
      scatter();
      setTimeout(() => { if (id === gameId) showDialog(true); }, 1100);
    }, 500);
  }

  // --- Asettelu ja piirto ----------------------------------------------

  function colX(i) { return L.ox + i * (L.cw + L.gap); }

  function layout() {
    const W = board.clientWidth;
    const H = board.clientHeight;
    const gap = Math.round(Math.max(4, Math.min(14, W * 0.014)));
    const cw = Math.floor(Math.max(20, Math.min((W - gap * 8) / 7, (H - gap * 3) / (1.4 * 4.2), 130)));
    const ch = Math.round(cw * 1.4);
    const ox = Math.round((W - (7 * cw + 6 * gap)) / 2);
    L = { W, H, gap, cw, ch, ox, top: gap, tabY: Math.round(gap * 2.5 + ch) };
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', ch + 'px');
    board.style.setProperty('--r', Math.max(3, Math.round(cw * 0.08)) + 'px');
    const place = (k, x, y) => { slots[k].style.transform = `translate(${x}px, ${y}px)`; };
    place('stock', colX(0), L.top);
    FOUND.forEach((f, i) => place(f, colX(3 + i), L.top));
    TAB.forEach((t, i) => place(t, colX(i), L.tabY));
  }

  // Jokaisen kortin paikka ja pinoamisjärjestys nykyisessä tilassa
  function positions() {
    const pos = [];
    const { stock, waste } = S.piles;
    stock.forEach((c, i) => { pos[c] = { x: colX(0), y: L.top, z: 1 + i }; });
    const fanFrom = Math.max(0, waste.length - (S.draw === 3 ? 3 : 1));
    waste.forEach((c, i) => {
      pos[c] = { x: Math.round(colX(1) + Math.max(0, i - fanFrom) * L.cw * 0.28), y: L.top, z: 100 + i };
    });
    FOUND.forEach((f, k) => S.piles[f].forEach((c, i) => { pos[c] = { x: colX(3 + k), y: L.top, z: 200 + i }; }));
    const avail = L.H - L.tabY - L.ch - L.gap;
    TAB.forEach((t, k) => {
      const p = S.piles[t];
      const down = L.ch * 0.1;
      const up = L.ch * 0.3;
      let need = 0;
      for (let i = 0; i < p.length - 1; i++) need += S.up[p[i]] ? up : down;
      const f = need > avail ? Math.max(0, avail) / need : 1; // pitkä sarake tiivistetään
      let y = L.tabY;
      p.forEach((c, i) => {
        pos[c] = { x: colX(k), y: Math.round(y), z: 300 + i };
        y += (S.up[c] ? up : down) * f;
      });
    });
    return pos;
  }

  function setFace(el, up, animate) {
    if (el._up === up) return;
    const first = el._up === undefined;
    el._up = up;
    el.classList.toggle('up', up);
    el.classList.toggle('down', !up);
    if (up && animate && !first) restartAnim(el, 'flip');
  }

  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function render(instant = false) {
    const pos = positions();
    for (let c = 0; c < 52; c++) {
      const el = els[c];
      const p = pos[c];
      if (instant) { clearTimeout(el._zt); el._zt = 0; el.classList.remove('flying'); }
      setFace(el, S.up[c], !instant);
      el._z = p.z;
      if (el._x !== p.x || el._y !== p.y) {
        el._x = p.x;
        el._y = p.y;
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        if (!instant) {
          // Liikkuva kortti lentää muiden yli eikä ota napautuksia vastaan ennen laskeutumista,
          // jotta nopeat napautukset pakkaan osuvat pakkaan eivätkä lentävään korttiin
          el.style.zIndex = 1000 + p.z;
          el.classList.add('flying');
          clearTimeout(el._zt);
          el._zt = setTimeout(() => { el._zt = 0; el.style.zIndex = el._z; el.classList.remove('flying'); }, 260);
          continue;
        }
      }
      if (!el._zt) el.style.zIndex = p.z;
    }
    slots.stock.textContent = !S.piles.stock.length && S.piles.waste.length ? '↻' : '';
    updateInfo();
  }

  function renderInstant() {
    board.classList.add('instant');
    for (const el of els) { el.style.transitionDelay = ''; el._x = NaN; }
    render(true);
    void board.offsetWidth;
    board.classList.remove('instant');
  }

  // Uuden pelin jako: kortit lentävät pakasta sarakkeisiin yksi kerrallaan
  function deal() {
    const id = gameId;
    busy = true;
    drag = null;
    const sx = colX(0);
    const sy = L.top;
    board.classList.add('instant');
    els.forEach(el => {
      clearTimeout(el._zt);
      el._zt = 0;
      el.style.transitionDelay = '';
      el.classList.remove('dragging', 'flying');
      setFace(el, false, false);
      el._x = sx;
      el._y = sy;
      el.style.transform = `translate(${sx}px, ${sy}px)`;
    });
    S.piles.stock.forEach((c, i) => { els[c].style.zIndex = 1 + i; els[c]._z = 1 + i; });
    void board.offsetWidth;
    board.classList.remove('instant');

    const pos = positions();
    let n = 0;
    for (let r = 0; r < 7; r++) {
      for (let k = r; k < 7; k++) {
        const c = S.piles[TAB[k]][r];
        const el = els[c];
        const p = pos[c];
        const delay = n * 35;
        el.style.zIndex = 100 + n++;
        el.style.transitionDelay = delay + 'ms';
        el._x = p.x;
        el._y = p.y;
        el._z = p.z;
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        setTimeout(() => {
          if (id !== gameId) return;
          el.style.transitionDelay = '';
          el.style.zIndex = el._z;
          setFace(el, S.up[c], true);
        }, delay + 230);
      }
    }
    setTimeout(() => { if (id === gameId) busy = false; }, n * 35 + 260);
    slots.stock.textContent = '';
    updateInfo();
  }

  // Voiton juhlistus: kortit lentävät ympäri pöytää
  function scatter() {
    board.classList.add('scatter');
    els.forEach((el, c) => {
      const x = Math.round(Math.random() * (L.W - L.cw));
      const y = Math.round(Math.random() * (L.H - L.ch));
      const a = Math.round(Math.random() * 60 - 30);
      el.style.transitionDelay = c * 15 + 'ms';
      el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
      el._x = NaN;
    });
  }

  function fmt(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function updateInfo() {
    $('moves').textContent = `Siirrot ${S.moves}`;
    $('time').textContent = fmt(S.elapsed);
    $('undo').disabled = !history.length || S.won;
  }

  function showDialog(won) {
    const st = loadStats();
    $('dlg-title').textContent = won ? 'Voitit! 🎉' : 'Uusi peli';
    $('dlg-text').textContent = won ? `${S.moves} siirtoa, aika ${fmt(S.elapsed)}` : '';
    $('dlg-stats').textContent = st.played
      ? `Voitot ${st.won} / ${st.played}` + (st.best ? ` · paras aika ${fmt(st.best)}` : '')
      : '';
    $('close').textContent = won ? 'Sulje' : 'Peruuta';
    overlay.hidden = false;
  }

  function hideDialog() { overlay.hidden = true; }

  // --- Kosketus ja hiiri -----------------------------------------------

  function tap(from, i) {
    const to = findTarget(from, i);
    if (to) move(from, i, to);
    else S.piles[from].slice(i).forEach(c => restartAnim(els[c], 'shake'));
  }

  function overlapArea(ax, ay, bx, by, bw, bh) {
    const w = Math.min(ax + L.cw, bx + bw) - Math.max(ax, bx);
    const h = Math.min(ay + L.ch, by + bh) - Math.max(ay, by);
    return w > 0 && h > 0 ? w * h : 0;
  }

  // Pudotuspaikka: se sallittu pino, jonka päälle raahattu kortti osuu eniten
  function dropTarget(d, dx, dy) {
    const el = els[d.cards[0]];
    const x = el._x + dx;
    const y = el._y + dy;
    let best = null;
    let bestArea = 0;
    for (const to of [...FOUND, ...TAB]) {
      if (to === d.from || !canPlace(d.cards, to)) continue;
      const k = to[0] === 'f' ? 3 + Number(to[1]) : Number(to[1]);
      const py = to[0] === 'f' ? L.top : L.tabY;
      const t = last(S.piles[to]);
      const h = to[0] === 't' && t !== undefined ? els[t]._y - py + L.ch : L.ch;
      const a = overlapArea(x, y, colX(k), py, L.cw, h);
      if (a > bestArea) { bestArea = a; best = to; }
    }
    return best;
  }

  function endDrag(d, to) {
    d.cards.forEach(c => els[c].classList.remove('dragging'));
    if (to) {
      move(d.from, d.i, to);
    } else {
      d.cards.forEach(c => { els[c]._x = NaN; }); // palaa takaisin paikalleen
      render();
    }
  }

  board.addEventListener('pointerdown', e => {
    if (busy || S.won || drag || e.button > 0) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl) {
      const slot = e.target.closest('.slot');
      if (slot && slot.dataset.pile === 'stock') drawStock();
      return;
    }
    const c = Number(cardEl.dataset.id);
    const from = pileOf(c);
    const i = S.piles[from].indexOf(c);
    if (from === 'stock') return drawStock();
    if (!canPick(from, i)) return;
    board.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, from, i, cards: S.piles[from].slice(i), x0: e.clientX, y0: e.clientY, moved: false };
  });

  board.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      drag.cards.forEach((c, k) => {
        const el = els[c];
        clearTimeout(el._zt);
        el._zt = 0;
        el.classList.add('dragging');
        el.style.zIndex = 2000 + k;
      });
    }
    drag.cards.forEach(c => {
      const el = els[c];
      el.style.transform = `translate(${el._x + dx}px, ${el._y + dy}px)`;
    });
  });

  board.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return tap(d.from, d.i);
    endDrag(d, dropTarget(d, e.clientX - d.x0, e.clientY - d.y0));
  });

  board.addEventListener('pointercancel', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) endDrag(d, null);
  });

  board.addEventListener('contextmenu', e => e.preventDefault());

  // --- Painikkeet ja näppäimet ------------------------------------------

  $('new').addEventListener('click', () => showDialog(false));
  $('undo').addEventListener('click', undo);
  $('close').addEventListener('click', hideDialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) hideDialog(); });
  overlay.querySelectorAll('[data-draw]').forEach(b => b.addEventListener('click', () => {
    hideDialog();
    newGame(Number(b.dataset.draw));
  }));

  document.addEventListener('keydown', e => {
    if (!overlay.hidden) {
      if (e.key === 'Escape') hideDialog();
      return;
    }
    if (e.key === 'u' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
    else if (e.key === ' ') { e.preventDefault(); drawStock(); }
    else if (e.key === 'n') showDialog(false);
  });

  // --- Käynnistys --------------------------------------------------------

  function createDom() {
    const slot = (pile, label) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.pile = pile;
      s.textContent = label;
      board.appendChild(s);
      slots[pile] = s;
    };
    slot('stock', '');
    FOUND.forEach(f => slot(f, 'A'));
    TAB.forEach(t => slot(t, 'K'));
    for (let c = 0; c < 52; c++) {
      const el = document.createElement('div');
      el.className = 'card ' + (isRed(c) ? 'red' : 'black');
      el.dataset.id = c;
      const s = SUITS[suit(c)];
      el.innerHTML = `<span class="rank">${RANKS[rank(c) - 1]}</span><span class="s1">${s}</span><span class="s2">${s}</span>`;
      el.addEventListener('animationend', () => el.classList.remove('flip', 'shake'));
      board.appendChild(el);
      els[c] = el;
    }
  }

  createDom();
  layout();
  if (load()) {
    renderInstant();
    if (S.won) showDialog(true);
  } else {
    newGame(1);
  }

  new ResizeObserver(() => {
    if (board.clientWidth === L.W && board.clientHeight === L.H) return;
    if (drag) {
      drag.cards.forEach(c => els[c].classList.remove('dragging'));
      drag = null;
    }
    layout();
    renderInstant();
  }).observe(board);

  // Kello käy vain, kun peli on aloitettu ja sivu on näkyvissä
  setInterval(() => {
    if (S.moves > 0 && !S.won && !document.hidden && overlay.hidden) {
      S.elapsed++;
      $('time').textContent = fmt(S.elapsed);
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ilman offline-tukea */ });
  }
})();
