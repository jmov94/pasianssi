// Jaon arpominen siemenluvusta. Sama siemen tuottaa aina saman jaon, joten voitettavien
// jakojen listaan (ratkaistavat.js) riittää tallentaa pelkät siemenluvut.
// Käytössä sekä pelissä (window.Jako) että työkalussa tyokalut/ratkaistavat.js (Node).
(function (root) {
  'use strict';

  // mulberry32: pieni ja nopea siemenluvullinen satunnaislukugeneraattori
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Palauttaa pöydän sarakkeet (alin kortti ensin), pakan (päällimmäinen viimeisenä)
  // ja tiedon, mitkä kortit ovat kuvapuoli ylöspäin. Kortti on numero 0–51:
  // maa = c / 13 (♠ ♥ ♦ ♣), arvo = c % 13 + 1.
  function deal(seed) {
    const next = rng(seed);
    const deck = [];
    for (let i = 0; i < 52; i++) deck.push(i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    const tableau = [[], [], [], [], [], [], []];
    const up = new Array(52).fill(false);
    // Jaetaan rivi kerrallaan kuten oikeassa pelissä, ylin kortti kuvapuoli ylöspäin
    for (let r = 0; r < 7; r++) {
      for (let k = r; k < 7; k++) {
        const c = deck.pop();
        tableau[k].push(c);
        up[c] = r === k;
      }
    }
    return { tableau, stock: deck, up };
  }

  const api = { deal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Jako = api;
})(this);
