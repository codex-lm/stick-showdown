/* Stick Showdown — game data: weapons, enemies, levels, bosses, scoring.
   Pure data + tiny helpers. No DOM access. Loaded before engine.js. */
(function () {
  'use strict';

  var ARENA = {
    W: 960, H: 540,
    floorY: 476,          // ground line (feet y)
    wallL: 34, wallR: 926 // playable x bounds for fighters
  };

  var PHYS = {
    gravity: 2200,
    playerSpeed: 250,
    jumpV: -760,
    dashSpeed: 430,
    dashTime: 0.16,
    dashIframes: 0.24,
    dashCd: 0.9,
    maxAirDashes: 1
  };

  // Combo steps: d = damage, kb = knockback impulse (px/s), heavy = big feedback.
  // w/a/r = windup/active/recover seconds. arcH = vertical size of hitbox.
  var WEAPONS = [
    {
      id: 0, key: 'fists', reach: 46, arcH: 46, pierce: false, splash: 0,
      steps: [
        { d: 7,  kb: 130, w: 0.06, a: 0.08, r: 0.10, heavy: false },
        { d: 7,  kb: 130, w: 0.06, a: 0.08, r: 0.10, heavy: false },
        { d: 10, kb: 280, w: 0.08, a: 0.08, r: 0.14, heavy: true }
      ]
    },
    {
      id: 1, key: 'stick', reach: 80, arcH: 40, pierce: false, splash: 0,
      steps: [
        { d: 10, kb: 150, w: 0.08, a: 0.08, r: 0.13, heavy: false },
        { d: 13, kb: 260, w: 0.09, a: 0.08, r: 0.16, heavy: true }
      ]
    },
    {
      id: 2, key: 'machete', reach: 64, arcH: 76, pierce: false, splash: 0,
      steps: [
        { d: 13, kb: 190, w: 0.10, a: 0.08, r: 0.17, heavy: false },
        { d: 17, kb: 320, w: 0.12, a: 0.08, r: 0.21, heavy: true }
      ]
    },
    {
      id: 3, key: 'spear', reach: 108, arcH: 26, pierce: true, splash: 0,
      steps: [
        { d: 12, kb: 95,  w: 0.09, a: 0.07, r: 0.14, heavy: false },
        { d: 12, kb: 95,  w: 0.08, a: 0.07, r: 0.14, heavy: false },
        { d: 16, kb: 210, w: 0.11, a: 0.07, r: 0.18, heavy: true }
      ]
    },
    {
      id: 4, key: 'sledge', reach: 58, arcH: 62, pierce: false, splash: 52,
      steps: [
        { d: 24, kb: 430, w: 0.22, a: 0.08, r: 0.30, heavy: true }
      ],
      quakeDmg: 8
    }
  ];

  // Weapon 0 (fists) always available; clearing level n unlocks weapon n
  // (stick=1 after L1, machete=2 after L2, spear=3 after L3, sledge=4 after L4).
  function weaponUnlockedByLevel(levelCleared) { return levelCleared; }

  var ENEMIES = {
    // Base HP tuned (Kimi review 31/10) so scaled values land on clean
    // hit-count thresholds instead of "1 HP over a full combo" spikes.
    bandit: { key: 'bandit', hp: 24, dmg: 8,  speed: 62,  reach: 44, windup: 0.42, active: 0.10, recover: 0.34, cd: 1.15, kbMul: 1,   score: 50,  scale: 1 },
    scout:  { key: 'scout',  hp: 18, dmg: 6,  speed: 132, reach: 40, windup: 0.24, active: 0.08, recover: 0.30, cd: 1.5,  kbMul: 1.4,  score: 70,  scale: 0.92 },
    slinger:{ key: 'slinger',hp: 20, dmg: 7,  speed: 78,  reach: 0,  windup: 0.5,  active: 0,    recover: 0.4,  cd: 2.2,  kbMul: 1,   score: 80,  scale: 0.96 },
    brute:  { key: 'brute',  hp: 58, dmg: 16, speed: 40,  reach: 54, windup: 0.7,  active: 0.12, recover: 0.5,  cd: 1.9,  kbMul: 0.25, score: 120, scale: 1.28 }
  };

  // Bosses: bigger scale each level, enrage below 50% hp (cooldowns x0.85).
  var BOSSES = [
    { key: 'cactus',  level: 1, hp: 380, scale: 2.1,  speed: 66,  score: 550,  dmg: 14 },
    { key: 'sidewinder', level: 2, hp: 560, scale: 1.8, speed: 200, score: 700,  dmg: 15 },
    { key: 'vulture', level: 3, hp: 600, scale: 2.1,  speed: 120, score: 850,  dmg: 14 },
    { key: 'titan',   level: 4, hp: 820, scale: 3.2,  speed: 30,  score: 1000, dmg: 18 },
    { key: 'elsol',   level: 5, hp: 950, scale: 2.5,  speed: 150, score: 1150, dmg: 16 }
  ];

  function enemyScaled(typeKey, level) {
    var base = ENEMIES[typeKey];
    return {
      key: base.key, hp: Math.round(base.hp * (1 + 0.15 * (level - 1))),
      dmg: Math.round(base.dmg * (1 + 0.10 * (level - 1))),
      speed: base.speed * (1 + 0.04 * (level - 1)),
      reach: base.reach, windup: base.windup, active: base.active,
      recover: base.recover, cd: base.cd, kbMul: base.kbMul,
      score: base.score, scale: base.scale
    };
  }

  // Waves per level. 'L'/'R' = spawn side. Trickle: next spawns when alive < cap.
  var LEVELS = [
    { level: 1, waves: [ ['bandit:R', 'bandit:L'], ['bandit:R', 'bandit:L', 'scout:R'] ], boss: 0, par: 45 },
    { level: 2, waves: [ ['bandit:R', 'bandit:L', 'scout:R'], ['scout:L', 'scout:R', 'slinger:L'], ['bandit:R', 'bandit:L', 'slinger:R'] ], boss: 1, par: 70 },
    { level: 3, waves: [ ['scout:R', 'scout:L', 'slinger:R'], ['brute:R', 'bandit:L', 'bandit:R'], ['slinger:L', 'slinger:R', 'scout:L', 'bandit:R'] ], boss: 2, par: 90 },
    { level: 4, waves: [ ['brute:L', 'scout:R', 'scout:L'], ['brute:R', 'slinger:L', 'slinger:R'], ['bandit:R', 'bandit:L', 'brute:R', 'slinger:L'] ], boss: 3, par: 110 },
    { level: 5, waves: [ ['brute:R', 'brute:L', 'slinger:R'], ['scout:L', 'scout:R', 'scout:L', 'slinger:L', 'slinger:R'], ['brute:L', 'slinger:R', 'slinger:L', 'scout:R', 'scout:R'] ], boss: 4, par: 140 }
  ];

  // Reference scores (waves + boss, ~x1.5 average multiplier + ideal bonuses).
  // Medals: gold ~0.82, silver ~0.62, bronze ~0.42 of the perfect-ish run.
  var MEDALS = [
    { gold: 2600, silver: 1950, bronze: 1300 },
    { gold: 4200, silver: 3150, bronze: 2100 },
    { gold: 6000, silver: 4500, bronze: 3000 },
    { gold: 8200, silver: 6150, bronze: 4100 },
    { gold: 10800, silver: 8100, bronze: 5400 }
  ];

  var SCORE = {
    noHitBonus: 300,
    timeBonus: 150,
    healAmount: 10,
    healDropChance: 0.2,
    comboWindow: 2.5,
    comboStep: 6,      // +1 multiplier every N hits
    comboMaxMult: 4
  };

  function comboMult(combo) {
    var m = 1 + Math.floor(combo / SCORE.comboStep);
    return Math.min(m, SCORE.comboMaxMult);
  }

  function medalFor(level, score) {
    var t = MEDALS[level - 1];
    if (!t) return 0;
    if (score >= t.gold) return 3;
    if (score >= t.silver) return 2;
    if (score >= t.bronze) return 1;
    return 0;
  }

  // Deterministic RNG (mulberry32) — injectable for tests.
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  globalThis.SS_Config = {
    ARENA: ARENA, PHYS: PHYS, WEAPONS: WEAPONS, ENEMIES: ENEMIES,
    BOSSES: BOSSES, LEVELS: LEVELS, MEDALS: MEDALS, SCORE: SCORE,
    enemyScaled: enemyScaled, weaponUnlockedByLevel: weaponUnlockedByLevel,
    comboMult: comboMult, medalFor: medalFor, makeRng: makeRng
  };
})();
