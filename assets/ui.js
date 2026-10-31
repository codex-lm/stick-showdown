/* Stick Showdown — UI: screens, input (keyboard + touch), game loop, saves.
   Saves use localStorage when available and silently fall back to memory
   (the LOB7 reader may isolate storage). */
(function () {
  'use strict';

  var C = globalThis.SS_Config, E = globalThis.SS_Engine;
  var R = globalThis.SS_Render, A = globalThis.SS_Audio, I = globalThis.SS_I18N;

  var SAVE_KEY = 'stickshowdown_v1';
  var memSave = null;
  function loadSave() {
    try {
      var raw = globalThis.localStorage && localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage isolated */ }
    return memSave || defaultSave();
  }
  function persistSave(s) {
    memSave = s;
    try {
      if (globalThis.localStorage) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (e) { /* keep memory copy */ }
  }
  function defaultSave() {
    return {
      lang: null, muted: false,
      unlockedLevel: 1, lastWeapon: 0,
      best: {}, medals: {}
    };
  }

  // ---------- state ----------
  var save = loadSave();
  var G = null;              // live game or null
  var menuT = 0;             // menu demo clock
  var currentScreen = 'title';
  var selectedLevel = 1;
  var equippedWeapon = save.lastWeapon || 0;
  var ctx = null, canvas = null;

  var held = { left: false, right: false };
  var edges = { jump: false, attack: false, dash: false };
  var prevButtons = {};

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function applyI18n() {
    document.documentElement.lang = I.getLang();
    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (n) {
      n.textContent = I.t(n.getAttribute('data-i18n'));
    });
    document.title = I.t('title') + ' — ' + I.t('tagline');
  }
  function show(screen) {
    currentScreen = screen;
    ['title', 'howto', 'credits', 'levels', 'overlay'].forEach(function (s) {
      var el = $('screen-' + s);
      if (el) el.classList.toggle('hidden', s !== screen);
    });
    if (screen === 'levels') buildLevelSelect();
  }

  // ---------- title ----------
  function initTitle() {
    $('btn-play').addEventListener('click', function () { A.init(); A.play('ui'); show('levels'); });
    $('btn-howto').addEventListener('click', function () { A.init(); A.play('ui'); show('howto'); });
    $('btn-credits').addEventListener('click', function () { A.init(); A.play('ui'); show('credits'); });
    $('btn-back-howto').addEventListener('click', function () { A.play('ui'); show('title'); });
    $('btn-back-credits').addEventListener('click', function () { A.play('ui'); show('title'); });
    $('btn-lang').addEventListener('click', function () {
      var order = ['en', 'fr', 'es'];
      var next = order[(order.indexOf(I.getLang()) + 1) % order.length];
      I.setLang(next); save.lang = next; persistSave(save);
      A.play('ui'); applyI18n(); refreshToggles();
    });
    $('btn-sound').addEventListener('click', function () {
      A.init();
      save.muted = !save.muted;
      A.setEnabled(!save.muted);
      persistSave(save);
      A.play('ui'); refreshToggles();
    });
  }
  function refreshToggles() {
    $('btn-lang').textContent = I.t('language') + ' · ' + I.t('langName');
    $('btn-sound').textContent = I.t('sound') + ' · ' + I.t(save.muted ? 'off' : 'on');
  }

  // ---------- level select ----------
  function buildLevelSelect() {
    var wrap = $('level-cards');
    wrap.innerHTML = '';
    for (var lvl = 1; lvl <= 5; lvl++) {
      (function (lvl) {
        var locked = lvl > save.unlockedLevel;
        var cfg = C.LEVELS[lvl - 1];
        var card = document.createElement('button');
        card.className = 'level-card' + (locked ? ' locked' : '');
        var medal = save.medals[lvl] || 0;
        var best = save.best[lvl] || 0;
        card.innerHTML =
          '<div class="lc-head"><span class="lc-num">' + lvl + '</span>' +
          '<span class="lc-name">' + I.levelName(lvl) + '</span></div>' +
          '<canvas class="lc-boss" width="90" height="72"></canvas>' +
          '<div class="lc-info"><span>' + cfg.waves.length + ' ' + I.t('waves') + ' · ' +
          I.t('boss') + ' : ' + I.bossName(cfg.boss) + '</span>' +
          '<span class="lc-medals">' + medalDots(medal) + '</span>' +
          '<span class="lc-best">' + (best ? I.t('best') + ' : ' + best : (locked ? I.t('locked') : '')) + '</span></div>';
        if (!locked) {
          card.addEventListener('click', function () {
            A.play('ui');
            selectedLevel = lvl;
            buildWeaponStrip();
            $('btn-start').disabled = false;
            document.querySelectorAll('.level-card').forEach(function (c) { c.classList.remove('sel'); });
            card.classList.add('sel');
          });
        }
        wrap.appendChild(card);
        var cv = card.querySelector('.lc-boss');
        var c2 = cv.getContext('2d');
        R.drawBossIcon(c2, cfg.boss, 45, 26, locked ? 0.85 : 1.1);
        if (locked) { c2.globalAlpha = 0.98; c2.fillStyle = 'rgba(232,217,176,0.55)'; c2.fillRect(0, 0, 90, 72); }
      })(lvl);
    }
    buildWeaponStrip();
    $('btn-back-levels').addEventListener('click', function () { A.play('ui'); show('title'); });
    $('btn-start').addEventListener('click', function () {
      A.init(); A.play('start');
      startGame(selectedLevel, equippedWeapon);
    });
    if (selectedLevel <= save.unlockedLevel) {
      var first = wrap.children[Math.min(selectedLevel, 5) - 1];
      if (first) { first.classList.add('sel'); }
    }
    $('btn-start').disabled = false;
  }
  function medalDots(m) {
    var out = '';
    for (var i = 1; i <= 3; i++) out += '<span class="dot m' + i + (m >= i ? ' on' : '') + '"></span>';
    return out;
  }
  function buildWeaponStrip() {
    var strip = $('weapon-strip');
    strip.innerHTML = '';
    // weapon w is unlocked when w === 0 (fists) or level w has been cleared
    var unlockedMax = 0;
    for (var w = 0; w <= 4; w++) if (w === 0 || save.unlockedLevel > w) unlockedMax = w;
    for (var id = 0; id <= 4; id++) {
      (function (id) {
        var unlocked = id <= unlockedMax;
        var b = document.createElement('button');
        b.className = 'weapon-btn' + (unlocked ? '' : ' locked') + (equippedWeapon === id ? ' sel' : '');
        b.innerHTML = '<canvas width="64" height="44"></canvas>' +
          '<span class="wb-name">' + I.weaponName(id) + '</span>' +
          '<span class="wb-desc">' + (unlocked ? I.t(['wFistsD', 'wStickD', 'wMacheteD', 'wSpearD', 'wSledgeD'][id])
            : I.fmt('unlockBy', { n: id })) + '</span>';
        if (unlocked) {
          b.addEventListener('click', function () {
            equippedWeapon = id; save.lastWeapon = id; persistSave(save);
            A.play('ui'); buildWeaponStrip();
          });
        }
        strip.appendChild(b);
        R.drawWeaponIcon(b.querySelector('canvas').getContext('2d'), id, 30, 24, 1);
      })(id);
    }
    if (equippedWeapon > unlockedMax) equippedWeapon = unlockedMax;
  }

  // ---------- game ----------
  function startGame(level, weapon) {
    G = E.newGame(level, weapon, C.makeRng((Date.now() & 0xffff) ^ (level * 7919)));
    show('none');
    document.body.classList.add('playing');
    $('hud-touch').classList.toggle('visible', isTouch());
  }
  function quitToMenu() { G = null; document.body.classList.remove('playing'); show('levels'); }

  function finishLevel() {
    var res = G.result;
    var isBest = false;
    if (res.won) {
      if ((save.best[G.level] || 0) < res.score) { save.best[G.level] = res.score; isBest = true; }
      if ((save.medals[G.level] || 0) < res.medal) save.medals[G.level] = res.medal;
      var newUnlock = G.level >= save.unlockedLevel && G.level < 5;
      if (newUnlock) save.unlockedLevel = G.level + 1;
      persistSave(save);
    }
    var ov = $('ov-panel');
    var html;
    if (res.won) {
      var unlockedW = G.level < 5 ? C.weaponUnlockedByLevel(G.level) : -1;
      html = '<h2 class="win">' + I.t('victory') + '</h2>' +
        '<div class="stats">' +
        statRow(I.t('time'), fmtTime(res.time)) +
        statRow(I.t('kills'), res.kills) +
        statRow(I.t('maxCombo'), res.maxCombo) +
        (res.noHit ? statRow(I.t('noHit'), '+' + C.SCORE.noHitBonus) : '') +
        (res.fast ? statRow(I.t('timeBonus'), '+' + C.SCORE.timeBonus) : '') +
        statRow(I.t('total'), '<b>' + res.score + '</b>') +
        '</div>' +
        (isBest ? '<div class="newbest">' + I.t('newBest') + '</div>' : '') +
        (res.medal > 0 ? '<div class="medal-line">' + I.fmt('medalEarned', { m: I.t(['', 'medal1', 'medal2', 'medal3'][res.medal]) }) + '</div>' : '') +
        (unlockedW >= 1 ? '<div class="unlock-line">' + I.fmt('weaponUnlocked', { w: I.weaponName(unlockedW) }) + '</div>' : '');
      var btns = [];
      if (G.level < 5) btns.push(['btn-next', I.t('nextLevel'), function () { A.play('start'); startGame(G.level + 1, equippedWeapon); }]);
      btns.push(['btn-replay', I.t('replay'), function () { A.play('start'); startGame(G.level, equippedWeapon); }]);
      btns.push(['btn-menu2', I.t('menu'), function () { A.play('ui'); quitToMenu(); }]);
      html += '<div class="btn-row" id="ov-btns"></div>';
      ov.innerHTML = html;
      var row = $('ov-btns');
      btns.forEach(function (b) {
        var el = document.createElement('button');
        el.className = 'btn ' + (b[0] === 'btn-next' ? 'primary' : '');
        el.textContent = b[1];
        el.addEventListener('click', b[2]);
        row.appendChild(el);
      });
      if (unlockedW >= 1) A.play('unlock');
    } else {
      html = '<h2 class="lose">' + I.t('defeat') + '</h2>' +
        '<p class="hint">' + I.t('defeatHint') + '</p>' +
        '<div class="stats">' + statRow(I.t('total'), '<b>' + res.score + '</b>') + '</div>' +
        '<div class="btn-row" id="ov-btns"></div>';
      ov.innerHTML = html;
      var row2 = $('ov-btns');
      [['r', I.t('retry'), function () { A.play('start'); startGame(G.level, equippedWeapon); }],
       ['m', I.t('menu'), function () { A.play('ui'); quitToMenu(); }]].forEach(function (b) {
        var el = document.createElement('button');
        el.className = 'btn';
        el.textContent = b[1];
        el.addEventListener('click', b[2]);
        row2.appendChild(el);
      });
    }
    show('overlay');
  }
  function statRow(k, v) { return '<div class="srow"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function fmtTime(s) {
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  var paused = false;
  function pauseGame() {
    if (!G || paused) return;
    paused = true;
    var ov = $('ov-panel');
    ov.innerHTML = '<h2>' + I.t('paused') + '</h2><div class="btn-row" id="ov-btns"></div>';
    show('overlay');
    var row = $('ov-btns');
    [['p', I.t('resume'), function () { A.play('ui'); unpause(); }],
     ['r', I.t('restart'), function () { A.play('start'); paused = false; startGame(G.level, equippedWeapon); }],
     ['m', I.t('menu'), function () { A.play('ui'); paused = false; quitToMenu(); }]].forEach(function (b) {
      var el = document.createElement('button');
      el.className = 'btn';
      el.textContent = b[1];
      el.addEventListener('click', b[2]);
      row.appendChild(el);
    });
  }
  function unpause() { paused = false; show('none'); }

  // ---------- input ----------
  var KEYS = {
    ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', Space: 'jump',
    KeyJ: 'attack', KeyX: 'attack',
    KeyK: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash'
  };
  function initInput() {
    window.addEventListener('keydown', function (ev) {
      A.init();
      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        if (G && !paused) { pauseGame(); ev.preventDefault(); }
        else if (paused) { unpause(); ev.preventDefault(); }
        return;
      }
      var k = KEYS[ev.code];
      if (!k) return;
      ev.preventDefault();
      if (k === 'left' || k === 'right') held[k] = true;
      else if (!ev.repeat) edges[k] = true;
    });
    window.addEventListener('keyup', function (ev) {
      var k = KEYS[ev.code];
      if (k === 'left' || k === 'right') held[k] = false;
    });
    window.addEventListener('blur', function () { held.left = held.right = false; if (G && !paused) pauseGame(); });

    // touch buttons
    document.querySelectorAll('[data-btn]').forEach(function (b) {
      var name = b.getAttribute('data-btn');
      function down(e) {
        e.preventDefault();
        A.init();
        b.classList.add('active');
        if (name === 'left' || name === 'right') held[name] = true;
        else edges[name] = true;
      }
      function up(e) {
        e.preventDefault();
        b.classList.remove('active');
        if (name === 'left' || name === 'right') held[name] = false;
      }
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }
  function isTouch() {
    return (globalThis.matchMedia && matchMedia('(pointer: coarse)').matches) ||
      'ontouchstart' in window;
  }

  // ---------- canvas ----------
  function initCanvas() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    var dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = 960 * dpr;
    canvas.height = 540 * dpr;
    ctx.scale(dpr, dpr);
  }

  // ---------- menu demo scene ----------
  var demo = null;
  function makeDemo() {
    var p = E.mkPlayer(0); p.x = 240;
    var b = E.mkEnemy('bandit', 1, 700, -1);
    return { t: 0, shake: 0, hitstop: 0, noHUD: true, banner: null, bannerT: 0,
      enemies: [b], boss: null, projectiles: [], drops: [], zones: [], particles: [], floaters: [],
      player: p, combo: 0, comboT: 0, score: 0, level: 1, weaponId: 0,
      phase: 'menu', waveIdx: 0, spawnQueue: [] };
  }

  // ---------- main loop ----------
  // rAF with a setTimeout watchdog: some embedded readers throttle rAF
  // even on visible documents; the fallback keeps the game running.
  var last = 0, acc = 0, rafPending = false, rafFired = false, rafId = 0;
  function schedule() {
    if (rafPending) return;
    rafPending = true; rafFired = false;
    rafId = globalThis.requestAnimationFrame(function (ts) {
      rafFired = true; rafPending = false;
      loop(ts);
    });
    setTimeout(function () {
      if (rafPending && !rafFired) {
        cancelAnimationFrame(rafId);
        rafPending = false;
        loop(performance.now());
      }
    }, 60);
  }
  function loop(ts) {
    schedule();
    if (!last) last = ts;
    var dt = Math.min(0.06, (ts - last) / 1000);
    last = ts;

    if (G && !paused) {
      acc += dt;
      var steps = 0;
      while (acc >= 1 / 60 && steps < 4) {
        E.update(G, 1 / 60, {
          left: held.left, right: held.right,
          jump: edges.jump, attack: edges.attack, dash: edges.dash
        });
        edges.jump = edges.attack = edges.dash = false;
        acc -= 1 / 60;
        steps++;
      }
      if (steps >= 4) acc = 0;
      E.drainSfx(G).forEach(function (ev) { A.play(ev.name, ev.vol); });
      if ((G.phase === 'won' && G.phaseT > 1.3) || (G.phase === 'lost' && G.phaseT > 1.7)) {
        if (!G.result && G.phase === 'lost') G.result = { won: false, score: G.score };
        finishLevel();
      }
    } else {
      menuT += dt;
      if (!demo) demo = makeDemo();
      demo.t = menuT;
      demo.player.stateT = menuT;
      demo.enemies[0].stateT = menuT;
    }

    // render
    var scene = G || demo;
    if (scene && ctx) {
      R.render(ctx, scene, I);
    }
  }

  // ---------- boot ----------
  function init() {
    if (save.lang) I.setLang(save.lang);
    else {
      var nav = (globalThis.navigator && navigator.language || 'en').slice(0, 2).toLowerCase();
      I.setLang(['en', 'fr', 'es'].indexOf(nav) >= 0 ? nav : 'en');
    }
    A.setEnabled(!save.muted);
    equippedWeapon = save.lastWeapon || 0;
    initCanvas();
    initTitle();
    initInput();
    applyI18n();
    refreshToggles();
    show('title');
    $('hud-touch').classList.toggle('visible', isTouch() && !!G);
    schedule();
    // inert dev hook: only active with #debug in the URL (local verification)
    if (globalThis.location && /debug/.test(location.hash)) {
      globalThis.SS_DEBUG = {
        get game() { return G; },
        start: function (l, w) { startGame(l, w === undefined ? equippedWeapon : w); },
        equip: function (w) { equippedWeapon = w; },
        lang: function (c) { I.setLang(c); applyI18n(); },
        save: function () { return save; },
        // synchronous fixed-step pump (for automated verification when the
        // host throttles rAF/timers); mirrors the loop body exactly
        step: function (n) {
          n = n || 1;
          for (var i = 0; i < n; i++) {
            if (G && !paused) {
              E.update(G, 1 / 60, {
                left: held.left, right: held.right,
                jump: edges.jump, attack: edges.attack, dash: edges.dash
              });
              edges.jump = edges.attack = edges.dash = false;
              E.drainSfx(G).forEach(function (ev) { A.play(ev.name, ev.vol); });
              if ((G.phase === 'won' && G.phaseT > 1.3) || (G.phase === 'lost' && G.phaseT > 1.7)) {
                if (!G.result && G.phase === 'lost') G.result = { won: false, score: G.score };
                finishLevel();
              }
            } else {
              menuT += 1 / 60;
              if (!demo) demo = makeDemo();
              demo.t = menuT;
              demo.player.stateT = menuT;
              demo.enemies[0].stateT = menuT;
            }
          }
          if (ctx) R.render(ctx, G || demo, I);
          return G ? { t: G.t, phase: G.phase } : { menu: true };
        }
      };
    }
  }

  if (globalThis.document && document.readyState !== 'loading') init();
  else if (globalThis.document) document.addEventListener('DOMContentLoaded', init);

  globalThis.SS_UI = { init: init };
})();
