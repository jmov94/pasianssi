#!/usr/bin/env node
// Etsii voitettavia jakoja ja kirjoittaa niiden siemenluvut tiedostoon ratkaistavat.js.
//
//   node tyokalut/ratkaistavat.js [jakoja_per_tila]   (oletus 1000)
//
// Ratkaisija näkee kaikki kortit (myös kuvapuoli alaspäin olevat) ja etsii syvyyshaulla
// siirtosarjan, jolla kaikki kortit päätyvät pohjapinoihin. Mukaan otetaan vain jaot, jotka
// ratkeavat alle EASY_LIMIT kokeillulla tilanteella: ne ovat voitettavia ja suoraviivaisia.
// (Noin 3/4 kaikista jaoista on voitettavia, mutta osa vain hyvin tarkalla pelillä.) Se käyttää vain osaa pelin
// sallimista siirroista, joten löytynyt ratkaisu on aina laillinen myös pelissä.
// Jokainen ratkaisu pelataan vielä erikseen läpi pelin säännöillä (check), ennen kuin
// siemen hyväksytään.
'use strict';

const fs = require('fs');
const path = require('path');
const Jako = require('../jako.js');

const rank = c => c % 13 + 1;
const suit = c => (c / 13) | 0;
const red = c => suit(c) === 1 || suit(c) === 2;
const EASY_LIMIT = 1000;

// --- Ratkaisija ------------------------------------------------------------

function initial(seed) {
  const d = Jako.deal(seed);
  return {
    t: d.tableau.map(col => col.slice()),
    down: d.tableau.map(col => col.length - 1),
    f: [0, 0, 0, 0],
    s: d.stock.slice(),
    w: [],
  };
}

function clone(st) {
  return { t: st.t.map(c => c.slice()), down: st.down.slice(), f: st.f.slice(), s: st.s.slice(), w: st.w.slice() };
}

function key(st) {
  let k = st.f.join('') + '|' + String.fromCharCode(...st.s.map(c => c + 48)) + '|' +
    String.fromCharCode(...st.w.map(c => c + 48));
  // Sarakkeiden järjestyksellä ei ole väliä: lajitellaan, jotta symmetriset tilat yhdistyvät
  const cols = st.t.map((c, i) => st.down[i] + ':' + String.fromCharCode(...c.map(x => x + 48)));
  cols.sort();
  return k + '|' + cols.join('/');
}

const toFound = (st, c) => st.f[suit(c)] === rank(c) - 1;
const stacks = (c, on) => on !== undefined && red(c) !== red(on) && rank(on) === rank(c) + 1;

// Varma pohjapinosiirto: kortista ei voi enää olla hyötyä pöydällä
function safe(st, c) {
  const r = rank(c);
  if (r <= 2) return true;
  const opp = red(c) ? [0, 3] : [1, 2];
  return st.f[opp[0]] >= r - 1 && st.f[opp[1]] >= r - 1;
}

function reveal(st, k) {
  if (st.down[k] > 0 && st.down[k] === st.t[k].length) st.down[k]--;
}

function autoMoves(st, log) {
  let moved = true;
  while (moved) {
    moved = false;
    for (let k = 0; k < 7; k++) {
      const col = st.t[k];
      const c = col[col.length - 1];
      if (c !== undefined && toFound(st, c) && safe(st, c)) {
        col.pop(); st.f[suit(c)]++; reveal(st, k); log.push(['t', k, 'f', 1]); moved = true;
      }
    }
    const w = st.w[st.w.length - 1];
    if (w !== undefined && toFound(st, w) && safe(st, w)) {
      st.w.pop(); st.f[suit(w)]++; log.push(['w', 0, 'f', 1]); moved = true;
    }
  }
}

function kingAvailable(st) {
  const w = st.w[st.w.length - 1];
  if (w !== undefined && rank(w) === 13) return true;
  for (let k = 0; k < 7; k++) {
    for (let i = Math.max(1, st.down[k]); i < st.t[k].length; i++) if (rank(st.t[k][i]) === 13) return true;
  }
  return false;
}

// Siirrot järjestyksessä, jossa ne kannattaa kokeilla
function moves(st, draw) {
  const out = [];
  // 1. pohjapinoon
  for (let k = 0; k < 7; k++) {
    const c = st.t[k][st.t[k].length - 1];
    if (c !== undefined && toFound(st, c)) out.push(['t', k, 'f', 1]);
  }
  const w = st.w[st.w.length - 1];
  if (w !== undefined && toFound(st, w)) out.push(['w', 0, 'f', 1]);
  // 2. sarakkeesta toiseen
  for (let a = 0; a < 7; a++) {
    const col = st.t[a];
    if (st.down[a] >= col.length) continue;
    const base = st.down[a];
    for (let b = 0; b < 7; b++) {
      if (a === b) continue;
      const top = st.t[b][st.t[b].length - 1];
      // koko näkyvä osa: paljastaa kortin tai tyhjentää sarakkeen kuninkaalle
      const x = col[base];
      const fits = top === undefined ? rank(x) === 13 : stacks(x, top);
      if (fits) {
        if (base > 0) out.push(['t', a, b, col.length - base]);
        else if (top !== undefined && kingAvailable(st)) out.push(['t', a, b, col.length - base]);
      }
      // osa näkyvästä: vain jos alle jäävä kortti pääsee pohjapinoon
      for (let i = base + 1; i < col.length; i++) {
        if (top !== undefined && stacks(col[i], top) && toFound(st, col[i - 1])) out.push(['t', a, b, col.length - i]);
      }
    }
  }
  // 3. poistopinosta pöytään
  if (w !== undefined) {
    let emptyDone = false;
    for (let b = 0; b < 7; b++) {
      const top = st.t[b][st.t[b].length - 1];
      if (top === undefined) {
        if (rank(w) === 13 && !emptyDone) { out.push(['w', 0, b, 1]); emptyDone = true; }
      } else if (stacks(w, top)) out.push(['w', 0, b, 1]);
    }
  }
  // 4. nosto pakasta tai pakan kääntö
  if (st.s.length || st.w.length) out.push(['s', 0, 'w', draw]);
  return out;
}

function apply(st, m, draw) {
  const [from, a, to, n] = m;
  if (from === 's') {
    if (st.s.length) {
      for (let i = 0; i < draw && st.s.length; i++) st.w.push(st.s.pop());
    } else {
      while (st.w.length) st.s.push(st.w.pop());
    }
    return;
  }
  const cards = from === 'w' ? st.w.splice(-1) : st.t[a].splice(st.t[a].length - n);
  if (from === 't') reveal(st, a);
  if (to === 'f') st.f[suit(cards[0])]++;
  else st.t[to].push(...cards);
}

function solve(seed, draw, limit = EASY_LIMIT) {
  const seen = new Set();
  let nodes = 0;
  const log = [];
  const start = initial(seed);
  autoMoves(start, log);

  function dfs(st, path) {
    if (st.f.every(x => x === 13)) return true;
    if (++nodes > limit) return false;
    const k = key(st);
    if (seen.has(k)) return false;
    seen.add(k);
    for (const m of moves(st, draw)) {
      const next = clone(st);
      apply(next, m, draw);
      const sub = [m];
      autoMoves(next, sub);
      path.push(...sub);
      if (dfs(next, path)) return true;
      path.length -= sub.length;
      if (nodes > limit) return false;
    }
    return false;
  }

  return dfs(start, log) ? { log, nodes } : null;
}

// --- Tarkistus pelin säännöillä (erillinen toteutus) ------------------------

function check(seed, draw, log) {
  const d = Jako.deal(seed);
  const up = d.up.slice();
  const t = d.tableau.map(c => c.slice());
  const f = [[], [], [], []]; // pelissä pohjapino ei ole sidottu maahan: etsitään sopiva
  const s = d.stock.slice();
  const w = [];
  const fail = msg => { throw new Error(`siemen ${seed}: ${msg}`); };

  for (const [from, a, to, n] of log) {
    if (from === 's') {
      if (s.length) { for (let i = 0; i < draw && s.length; i++) { const c = s.pop(); up[c] = true; w.push(c); } }
      else if (w.length) { while (w.length) { const c = w.pop(); up[c] = false; s.push(c); } }
      else fail('nosto tyhjästä pakasta');
      continue;
    }
    const src = from === 'w' ? w : t[a];
    if (src.length < n) fail('liian vähän kortteja');
    const cards = src.slice(src.length - n);
    if (!cards.every(c => up[c])) fail('kuvapuoli alaspäin olevaa korttia siirretty');
    for (let i = 1; i < cards.length; i++) {
      if (red(cards[i]) === red(cards[i - 1]) || rank(cards[i - 1]) !== rank(cards[i]) + 1) fail('siirretty jono ei ole järjestyksessä');
    }
    const c = cards[0];
    if (to === 'f') {
      if (n !== 1) fail('pohjapinoon vain yksi kortti');
      const pile = f.find(p => (p.length === 0 && rank(c) === 1) || (p.length && suit(p[p.length - 1]) === suit(c) && rank(p[p.length - 1]) === rank(c) - 1));
      if (!pile) fail('kortti ei sovi pohjapinoon');
      pile.push(c);
    } else {
      const dest = t[to];
      const top = dest[dest.length - 1];
      if (top === undefined ? rank(c) !== 13 : !(up[top] && red(top) !== red(c) && rank(top) === rank(c) + 1)) fail('kortti ei sovi sarakkeeseen');
      dest.push(...cards);
    }
    src.splice(src.length - n);
    if (from === 't' && t[a].length) up[t[a][t[a].length - 1]] = true;
  }
  if (!f.every(p => p.length === 13)) fail('peli ei päättynyt voittoon');
}

// --- Ajo -------------------------------------------------------------------

if (require.main === module) {
  const want = Number(process.argv[2]) || 1000;
  const out = {};
  for (const draw of [1, 3]) {
    const seeds = [];
    let tried = 0;
    let seed = draw === 1 ? 1 : 1000000;
    const t0 = Date.now();
    while (seeds.length < want) {
      tried++;
      const res = solve(seed, draw);
      if (res) { check(seed, draw, res.log); seeds.push(seed); }
      seed++;
    }
    out[draw] = seeds;
    const pct = Math.round(100 * seeds.length / tried);
    console.log(`nosta ${draw}: ${seeds.length} hyväksyttyä / ${tried} kokeiltua (${pct} %), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const file = path.join(__dirname, '..', 'ratkaistavat.js');
  fs.writeFileSync(file,
    '// Generoitu: node tyokalut/ratkaistavat.js. Siemenluvut jaoille (jako.js), jotka on\n' +
    '// todettu voitettaviksi ja suoraviivaisiksi. Avaimena kerralla nostettavien korttien määrä.\n' +
    `self.RATKAISTAVAT = ${JSON.stringify(out)};\n`);
  console.log('kirjoitettu', file);
}

module.exports = { solve, check };
