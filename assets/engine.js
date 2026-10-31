/* Stick Showdown — engine: physics, combat, enemy & boss AI, waves, scoring.
   Pure logic over a state object G; no DOM. Audio/particles are requested
   through G.events and drained by the UI/renderer each frame. */
(function () {
  'use strict';

  var C = globalThis.SS_Config;
  var AR = C.ARENA, PH = C.PHYS, SC = C.SCORE;

  // ---------- geometry helpers (exposed for tests) ----------
  function bodyBox(f) {
    var w = 26 * f.scale, h = 86 * f.scale;
    return { x: f.x - w / 2, y: f.y - h, w: w, h: h };
  }
  function meleeBox(f, reach, arcH) {
    var x0 = f.x + f.face * 8;
    var chest = f.y - 86 * f.scale * 0.62;
    var half = (arcH * f.scale) / 2;
    return {
      x: Math.min(x0, x0 + f.face * reach * f.scale),
      y: chest - half,
      w: reach * f.scale,
      h: half * 2
    };
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function rectsOverlapScale(a, b) { return overlap(a, b); }

  // ---------- factories ----------
  function mkPlayer(weaponId) {
    return {
      kind: 'player', x: 180, y: AR.floorY, vx: 0, vy: 0, face: 1,
      hp: 100, maxHp: 100, scale: 1, w: 26, h: 86,
      state: 'idle', stateT: 0, onGround: true, dead: false,
      weapon: C.WEAPONS[weaponId] || C.WEAPONS[0],
      attack: null, attackBuf: 0, comboWindowT: 0,
      dashT: 0, dashCd: 0, airDashes: 1, iframes: 0, hitFlash: 0,
      powerCd: 0, powerHitT: 0,
      kbResist: 1, runPhase: 0
    };
  }
  function mkEnemy(typeKey, level, x, face) {
    var s = C.enemyScaled(typeKey, level);
    return {
      kind: 'enemy', type: s.key, x: x, y: AR.floorY, vx: 0, vy: 0, face: face,
      hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed, reach: s.reach,
      windup: s.windup, active: s.active, recover: s.recover, atkCd: s.cd,
      kbMul: s.kbMul, score: s.score, scale: s.scale,
      state: 'spawn', stateT: 0, cd: 0.4, onGround: true, dead: false,
      attack: null, iframes: 0, hitFlash: 0, retreatT: 0, runPhase: 0
    };
  }
  function mkBoss(idx, level) {
    var s = C.BOSSES[idx];
    return {
      kind: 'boss', bossIdx: idx, key: s.key, x: 720, y: AR.floorY, vx: 0, vy: 0, face: -1,
      hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed, score: s.score, scale: s.scale,
      state: 'enter', stateT: 0, onGround: true, dead: false,
      attack: null, iframes: 0, hitFlash: 0, enraged: false,
      patCd: 2.0, leapCd: 6, swoopCd: 6, rainCd: 8, zoneCd: 8, volleyCd: 3.2,
      hoverY: 300, hoverDir: -1, hitOncePer: null, mercyMark: 0, runPhase: 0
    };
  }

  function newGame(level, weaponId, rng) {
    var cfg = C.LEVELS[level - 1];
    var g = {
      t: 0, level: level, weaponId: weaponId,
      rng: rng || C.makeRng((Date.now() ^ (level * 2654435761)) >>> 0),
      phase: 'waves', phaseT: 0,
      waveIdx: -1, waveTotal: cfg.waves.length,
      spawnQueue: [], spawnGapT: 0,
      enemies: [], boss: null, projectiles: [], drops: [], zones: [],
      particles: [], floaters: [], events: [],
      player: mkPlayer(weaponId),
      score: 0, kills: 0, combo: 0, comboT: 0, maxCombo: 0,
      elapsed: 0, hurtCount: 0, banner: null, bannerT: 0,
      hitstop: 0, shake: 0, result: null
    };
    nextWave(g);
    return g;
  }

  // ---------- events ----------
  function sfx(g, name, vol) { g.events.push({ type: 'sfx', name: name, vol: vol }); }
  function fx(g, kind, x, y, opts) {
    var e = { type: 'fx', kind: kind, x: x, y: y };
    if (opts) for (var k in opts) e[k] = opts[k];
    g.events.push(e);
  }
  function float(g, x, y, txt, col) { g.floaters.push({ x: x, y: y, txt: txt, t: 0, col: col || 'ink' }); }
  function banner(g, kind, val) { g.banner = { kind: kind, val: val }; g.bannerT = 1.6; }

  // ---------- waves ----------
  function aliveCount(g) { return g.enemies.filter(function (e) { return !e.dead; }).length; }
  function nextWave(g) {
    var cfg = C.LEVELS[g.level - 1];
    g.waveIdx++;
    if (g.waveIdx >= cfg.waves.length) {
      g.phase = 'bossIntro'; g.phaseT = 0;
      banner(g, 'bossIncoming');
      sfx(g, 'roar');
      return;
    }
    g.spawnQueue = cfg.waves[g.waveIdx].slice();
    banner(g, 'wave', { n: g.waveIdx + 1, m: cfg.waves.length });
    g.spawnGapT = 0;
  }
  function spawnCap(g) { return 3 + (g.level >= 3 ? 1 : 0); }
  function trySpawn(g, dt) {
    if (!g.spawnQueue.length) return;
    g.spawnGapT -= dt;
    if (aliveCount(g) < spawnCap(g) && g.spawnGapT <= 0) {
      var spec = g.spawnQueue.shift().split(':');
      var x = spec[1] === 'L' ? AR.wallL + 26 : AR.wallR - 26;
      var face = spec[1] === 'L' ? 1 : -1;
      g.enemies.push(mkEnemy(spec[0], g.level, x, face));
      fx(g, 'dust', x, AR.floorY, { n: 6 });
      g.spawnGapT = 0.5;
    }
  }

  // ---------- damage ----------
  function damagePlayer(g, d, fromX, opts) {
    var p = g.player;
    if (p.dead) return false;
    // Desert counter: dodging INTO the blow with dash i-frames rewards the
    // next hit (Kimi's idea) — slow-mo beat, distinct sound, ×1.5 damage.
    if (p.dashT > 0) {
      if (p.powerCd <= 0) {
        p.powerHitT = 1.5; p.powerCd = 1.2;
        g.hitstop = Math.max(g.hitstop, 0.14);
        fx(g, 'sparkle', p.x, p.y - 70, {});
        float(g, p.x, p.y - 96, 'x1.5', 'terra');
        sfx(g, 'perfect');
      }
      return false;
    }
    if (p.iframes > 0) return false;
    p.hp -= d;
    p.hitFlash = 0.18;
    p.iframes = 0.5;
    g.combo = 0;
    g.hurtCount++;
    var dir = p.x < fromX ? -1 : 1;
    p.vx = dir * (opts && opts.kb ? opts.kb : 260);
    if (opts && opts.up) p.vy = -opts.up;
    p.state = 'hurt'; p.stateT = 0; p.attack = null;
    g.hitstop = Math.max(g.hitstop, 0.07);
    g.shake = Math.max(g.shake, 5);
    fx(g, 'blood', p.x, p.y - 60, { n: 6 });
    fx(g, 'impact', p.x, p.y - 60, {});
    sfx(g, 'hurt');
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.state = 'dead'; p.stateT = 0;
      g.phase = 'lost'; g.phaseT = 0;
      g.hitstop = 0.25; g.shake = 9;
      sfx(g, 'gameover');
    }
    return true;
  }
  function damageFighter(g, f, d, fromX, kb, heavy) {
    if (f.dead || f.iframes > 0) return false;
    f.hp -= d;
    f.hitFlash = 0.15;
    var dir = f.x < fromX ? -1 : 1;
    if (f.kind === 'boss') {
      // bosses keep their poise: damage yes, stunlock no
      f.vx = dir * kb * 0.12;
    } else {
      f.vx = dir * kb * (f.kbMul !== undefined ? f.kbMul : 1);
      // brutes shrug off light hits
      var stunnable = f.type !== 'brute' || heavy;
      if (stunnable && f.state !== 'spawn') { f.state = 'hurt'; f.stateT = 0; f.attack = null; }
    }
    g.hitstop = Math.max(g.hitstop, heavy ? 0.11 : 0.06);
    g.shake = Math.max(g.shake, heavy ? 7 : 3);
    fx(g, 'ink', f.x + (f.x < fromX ? -8 : 8), f.y - 86 * f.scale * 0.6, { n: heavy ? 8 : 5 });
    if (heavy) fx(g, 'impact', f.x, f.y - 86 * f.scale * 0.6, {});
    sfx(g, heavy ? 'hitHeavy' : 'hit');
    if (f.hp <= 0) killFighter(g, f);
    return true;
  }
  function killFighter(g, f) {
    f.hp = 0; f.dead = true; f.state = 'dead'; f.stateT = 0; f.vx = (f.x < g.player.x ? -1 : 1) * 120;
    fx(g, 'ink', f.x, f.y - 40, { n: 10 });
    if (f.kind === 'enemy') {
      g.kills++;
      var pts = Math.round(f.score * C.comboMult(g.combo));
      g.score += pts;
      float(g, f.x, f.y - 90 * f.scale, '+' + pts, 'ink');
      sfx(g, 'enemyDie');
      if (g.rng() < SC.healDropChance) {
        g.drops.push({ x: f.x, y: AR.floorY, t: 0, life: 6 });
        sfx(g, 'drop');
      }
    } else if (f.kind === 'boss') {
      f.gravOff = false;
      g.kills++;
      var bp = Math.round(f.score * C.comboMult(g.combo));
      g.score += bp;
      float(g, f.x, f.y - 90 * f.scale, '+' + bp, 'terra');
      g.hitstop = 0.3; g.shake = 10;
      sfx(g, 'bossDie');
      g.phase = 'won'; g.phaseT = 0;
      banner(g, 'bossDefeated');
      finishVictory(g);
    }
  }
  function finishVictory(g) {
    var cfg = C.LEVELS[g.level - 1];
    var noHit = g.hurtCount === 0;
    var fast = g.elapsed <= cfg.par;
    var bonus = 0;
    if (noHit) { bonus += SC.noHitBonus; float(g, g.player.x, g.player.y - 110, '+' + SC.noHitBonus, 'terra'); }
    if (fast) { bonus += SC.timeBonus; float(g, g.player.x, g.player.y - 130, '+' + SC.timeBonus, 'terra'); }
    g.score += bonus;
    g.result = {
      won: true, score: g.score, kills: g.kills, maxCombo: g.maxCombo,
      time: g.elapsed, noHit: noHit, fast: fast,
      medal: C.medalFor(g.level, g.score)
    };
    sfx(g, 'fanfare');
  }

  // ---------- player update ----------
  function updatePlayer(g, dt, input) {
    var p = g.player;
    p.stateT += dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.powerCd > 0) p.powerCd -= dt;
    if (p.powerHitT > 0) p.powerHitT -= dt;
    if (p.attackBuf > 0) p.attackBuf -= dt;
    if (p.comboWindowT > 0) p.comboWindowT -= dt;
    if (p.dead) { physicsBody(p, dt, 0.9); return; }

    var canAct = !p.attack && p.state !== 'hurt';
    // input buffers
    if (input.attack) p.attackBuf = 0.18;
    // dash
    if (input.dash && p.dashCd <= 0 && p.dashT <= 0 && p.state !== 'hurt' && !p.attack) {
      var dir = input.left ? -1 : input.right ? 1 : p.face;
      p.dashT = PH.dashTime; p.dashDir = dir; p.face = dir;
      p.iframes = Math.max(p.iframes, PH.dashIframes);
      p.dashCd = PH.dashCd;
      if (!p.onGround) p.airDashes = Math.max(0, p.airDashes - 1);
      else p.airDashes = 1;
      p.state = 'dash'; p.stateT = 0;
      fx(g, 'speedline', p.x, p.y - 50, { dir: dir });
      sfx(g, 'dash');
    }
    // jump
    if (input.jump && p.onGround && canAct && p.dashT <= 0) {
      p.vy = PH.jumpV; p.onGround = false; p.state = 'jump'; p.stateT = 0;
      fx(g, 'dust', p.x, p.y, { n: 4 });
      sfx(g, 'jump');
    }
    // attack start / chain
    if (p.attackBuf > 0 && p.state !== 'hurt' && p.dashT <= 0) {
      if (!p.attack) {
        startAttackStep(g, p, 0);
        p.attackBuf = 0;
      }
    }
    // horizontal control
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = (p.dashDir || p.face) * PH.dashSpeed;
      if (p.dashT <= 0) p.vx *= 0.35;
    } else if (p.attack) {
      p.vx *= Math.pow(0.001, dt); // commit while attacking
    } else if (p.state === 'hurt') {
      p.vx *= Math.pow(0.05, dt);
      if (p.stateT > 0.28) { p.state = 'idle'; p.stateT = 0; }
    } else {
      var mv = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      p.vx = mv * PH.playerSpeed;
      if (mv !== 0) { p.face = mv; p.runPhase += dt * 10; }
      p.state = p.onGround ? (mv !== 0 ? 'run' : 'idle') : 'jump';
    }
    physicsBody(p, dt, 1);
    if (p.onGround && p.state !== 'run') p.runPhase = 0;

    // attack progression
    if (p.attack) progressAttack(g, p, dt, g.enemies, g.boss);
  }

  function startAttackStep(g, p, stepIdx) {
    var spec = p.weapon.steps[stepIdx];
    p.attack = {
      step: stepIdx, phase: 'w', t: 0, spec: spec,
      hitDone: [], total: p.weapon.steps.length
    };
    p.state = 'attack'; p.stateT = 0;
    sfx(g, 'swing', stepIdx === p.weapon.steps.length - 1 ? 1 : 0.7);
  }

  function progressAttack(g, p, dt, enemies, boss) {
    var a = p.attack, w = p.weapon;
    a.t += dt;
    if (a.phase === 'w' && a.t >= a.spec.w) { a.phase = 'a'; a.t = 0;
      if (w.key === 'spear') p.vx = p.face * 190;
      if (w.key === 'sledge' && p.onGround) sledgeQuake(g, p);
    }
    if (a.phase === 'a') {
      var box = meleeBox(p, w.reach, w.arcH);
      var targets = enemies.filter(function (e) { return !e.dead && e.state !== 'spawn'; });
      if (boss && !boss.dead && boss.state !== 'enter') targets = targets.concat([boss]);
      for (var i = 0; i < targets.length; i++) {
        var tgt = targets[i];
        if (a.hitDone.indexOf(tgt) >= 0) continue;
        if (overlap(box, bodyBox(tgt))) {
          a.hitDone.push(tgt);
          var dmg = a.spec.d * (p.powerHitT > 0 ? 1.5 : 1);
          var powered = p.powerHitT > 0;
          if (powered) p.powerHitT = 0;
          if (damageFighter(g, tgt, dmg, p.x, a.spec.kb, a.spec.heavy || powered)) {
            g.combo++; g.comboT = SC.comboWindow;
            if (g.combo > g.maxCombo) g.maxCombo = g.combo;
            if (g.combo > 0 && g.combo % 5 === 0) {
              float(g, p.x, p.y - 120, 'x' + C.comboMult(g.combo), 'terra');
              sfx(g, 'combo', Math.min(1, 0.4 + g.combo * 0.02));
            }
          }
        }
      }
      if (a.t >= a.spec.a) { a.phase = 'r'; a.t = 0; }
    }
    if (a.phase === 'r') {
      var last = a.step === w.steps.length - 1;
      var chaining = p.attackBuf > 0 && !last;
      if (chaining) { p.attackBuf = 0; startAttackStep(g, p, a.step + 1); return; }
      if (a.t >= a.spec.r) {
        p.attack = null; p.comboWindowT = 0.5;
        p.state = p.onGround ? 'idle' : 'jump';
      }
    }
  }

  function sledgeQuake(g, p) {
    var box = {
      x: Math.min(p.x, p.x + p.face * (p.weapon.reach + p.weapon.splash)),
      y: AR.floorY - 30, w: p.weapon.reach + p.weapon.splash, h: 40
    };
    if (p.face < 0) box.x = p.x - (p.weapon.reach + p.weapon.splash);
    g.shake = Math.max(g.shake, 5);
    fx(g, 'dust', p.x + p.face * 40, AR.floorY, { n: 8 });
    sfx(g, 'quake');
    var targets = g.enemies.filter(function (e) { return !e.dead && e.state !== 'spawn' && e.onGround; });
    if (g.boss && !g.boss.dead && g.boss.onGround) targets = targets.concat([g.boss]);
    targets.forEach(function (e) {
      if (overlap(box, bodyBox(e)) && e !== g.player) {
        damageFighter(g, e, p.weapon.quakeDmg || 8, p.x, 200, false);
      }
    });
  }

  function physicsBody(f, dt, friction) {
    if (!f.gravOff) f.vy += PH.gravity * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y >= AR.floorY) {
      if (!f.onGround && f.kind === 'player' && f.vy > 500) { /* land */ }
      f.y = AR.floorY; f.vy = 0;
      if (!f.onGround && f.kind === 'player') { f.airDashes = 1; }
      f.onGround = true;
    } else f.onGround = false;
    if (f.x < AR.wallL) { f.x = AR.wallL; f.vx = Math.max(0, f.vx); }
    if (f.x > AR.wallR) { f.x = AR.wallR; f.vx = Math.min(0, f.vx); }
  }

  // ---------- enemy AI ----------
  function updateEnemy(g, e, dt) {
    e.stateT += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.dead) {
      e.vx *= Math.pow(0.05, dt);
      physicsBody(e, dt, 0.1);
      return;
    }
    var p = g.player;
    var dx = p.x - e.x, adx = Math.abs(dx), dir = dx > 0 ? 1 : -1;

    if (e.state === 'spawn') {
      if (e.stateT >= 0.5) { e.state = 'idle'; e.stateT = 0; }
      return;
    }
    if (e.state === 'hurt') {
      e.vx *= Math.pow(0.04, dt);
      if (e.stateT > 0.24) { e.state = 'idle'; e.stateT = 0; }
      physicsBody(e, dt, 1);
      return;
    }
    if (e.attack) { progressEnemyAttack(g, e, dt); physicsBody(e, dt, 1); return; }
    if (e.cd > 0) e.cd -= dt;

    if (e.type === 'bandit') {
      e.face = dir;
      if (adx > e.reach * 0.85) { e.vx = dir * e.speed; e.state = 'run'; e.runPhase += dt * 9; }
      else {
        e.vx = 0; e.state = 'idle';
        if (e.cd <= 0 && !p.dead) beginEnemyAttack(g, e);
      }
    } else if (e.type === 'scout') {
      if (e.retreatT > 0) {
        e.retreatT -= dt; e.face = dir; e.vx = -dir * e.speed * 0.8; e.state = 'run'; e.runPhase += dt * 12;
      } else if (adx > e.reach * 0.9) { e.vx = dir * e.speed; e.face = dir; e.state = 'run'; e.runPhase += dt * 14; }
      else {
        e.vx = 0; e.state = 'idle'; e.face = dir;
        if (e.cd <= 0 && !p.dead) beginEnemyAttack(g, e);
      }
    } else if (e.type === 'slinger') {
      e.face = dir;
      if (e.wind === 'throwing') { e.vx = 0; e.state = 'windup'; return; }
      if (adx < 240) { e.vx = -dir * e.speed; e.state = 'run'; e.runPhase += dt * 10; }
      else if (adx > 380) { e.vx = dir * e.speed; e.state = 'run'; e.runPhase += dt * 10; }
      else {
        e.vx = 0; e.state = 'idle';
        if (e.cd <= 0 && !p.dead) {
          e.wind = 'throwing'; e.state = 'windup'; e.stateT = 0; e.windT = 0;
        }
      }
      if (e.wind === 'throwing') {
        e.windT += dt;
        if (e.windT >= e.windup) {
          throwStone(g, e);
          e.wind = null; e.cd = e.atkCd; e.state = 'idle';
        }
      }
    } else if (e.type === 'brute') {
      e.face = dir;
      if (adx > e.reach * 0.9) { e.vx = dir * e.speed; e.state = 'run'; e.runPhase += dt * 6; }
      else {
        e.vx = 0; e.state = 'idle';
        if (e.cd <= 0 && !p.dead) beginEnemyAttack(g, e);
      }
    }
    // separation from other enemies
    g.enemies.forEach(function (o) {
      if (o === e || o.dead) return;
      var d = e.x - o.x;
      if (Math.abs(d) < 34) e.x += (d >= 0 ? 1 : -1) * 26 * dt;
    });
    physicsBody(e, dt, 1);
  }

  function beginEnemyAttack(g, e) {
    e.attack = { phase: 'w', t: 0, hitDone: false };
    e.state = 'windup'; e.stateT = 0;
    e.face = g.player.x > e.x ? 1 : -1;
  }
  function progressEnemyAttack(g, e, dt) {
    var a = e.attack;
    a.t += dt;
    if (a.phase === 'w' && a.t >= e.windup) { a.phase = 'a'; a.t = 0; sfx(g, 'swing', 0.6); }
    if (a.phase === 'a') {
      var box = meleeBox(e, e.reach, 44);
      if (!a.hitDone && overlap(box, bodyBox(g.player))) {
        a.hitDone = true;
        damagePlayer(g, e.dmg, e.x, { kb: e.type === 'brute' ? 420 : 240, up: e.type === 'brute' ? 260 : 120 });
      }
      if (a.t >= e.active) { a.phase = 'r'; a.t = 0; }
    }
    if (a.phase === 'r' && a.t >= e.recover) {
      e.attack = null; e.cd = e.atkCd; e.state = 'idle';
      if (e.type === 'scout') e.retreatT = 0.6;
    }
  }
  function throwStone(g, e) {
    var p = g.player;
    var T = 0.9;
    var tx = p.x + p.vx * 0.35; // lead the player
    var dx = tx - e.x;
    var dy = (AR.floorY - 40) - (e.y - 60);
    g.projectiles.push({
      type: 'stone', from: 'enemy', x: e.x + e.face * 14, y: e.y - 60,
      vx: dx / T, vy: dy / T - 0.5 * PH.gravity * T,
      r: 7, dmg: e.dmg, grav: true
    });
    sfx(g, 'throw');
  }

  // ---------- projectiles / zones / drops ----------
  function updateProjectiles(g, dt) {
    var p = g.player;
    for (var i = g.projectiles.length - 1; i >= 0; i--) {
      var pr = g.projectiles[i];
      if (pr.delay > 0) { pr.delay -= dt; if (pr.delay > 0) continue; }
      if (pr.grav) pr.vy += PH.gravity * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      var life = pr.life !== undefined ? (pr.life -= dt) : (pr.life = 3);
      if (pr.type === 'shock') pr.y = AR.floorY;
      // hit player
      if (!p.dead && p.iframes <= 0 && p.dashT <= 0) {
        var pw = pr.type === 'shock' ? 20 : pr.type === 'rock' ? 16 : pr.r;
        var ph2 = pr.type === 'shock' ? 30 : pr.type === 'rock' ? 20 : pr.r;
        if (Math.abs(pr.x - p.x) < pw + 12 && pr.y + ph2 > p.y - 86 && pr.y - ph2 < p.y) {
          damagePlayer(g, pr.dmg, pr.x, { kb: 220, up: pr.type === 'rock' ? 200 : 120 });
          g.projectiles.splice(i, 1);
          continue;
        }
      }
      var gone = false;
      if (pr.type === 'bolt' || pr.type === 'feather') {
        if (pr.x < AR.wallL - 40 || pr.x > AR.wallR + 40 || pr.y < -40 || pr.y > AR.floorY + 40) gone = true;
      } else if (pr.y >= AR.floorY) {
        fx(g, pr.type === 'rock' ? 'dust' : 'dust', pr.x, AR.floorY, { n: 4 });
        gone = true;
      } else if (pr.x < AR.wallL - 60 || pr.x > AR.wallR + 60) gone = true;
      if (life <= 0) gone = true;
      if (gone) g.projectiles.splice(i, 1);
    }
  }
  function updateZones(g, dt) {
    var p = g.player;
    g.zones = g.zones.filter(function (z) {
      z.t += dt;
      if (z.t >= z.warm && z.t < z.warm + z.burn) {
        if (Math.abs(p.x - z.x) < z.r && Math.abs(p.y - AR.floorY) < 14) {
          z.tick = (z.tick || 0) + dt;
          if (z.tick >= 0.5) {
            z.tick = 0;
            if (p.iframes <= 0 && p.dashT <= 0 && !p.dead) {
              p.hp -= z.dps * 0.5; p.hitFlash = 0.1;
              fx(g, 'blood', p.x, p.y - 50, { n: 2 });
              if (p.hp <= 0) damagePlayer(g, 1, p.x + 10, {});
            }
          }
        }
      }
      return z.t < z.warm + z.burn;
    });
  }
  function updateDrops(g, dt) {
    var p = g.player;
    for (var i = g.drops.length - 1; i >= 0; i--) {
      var d = g.drops[i];
      d.t += dt;
      if (d.t > d.life) { g.drops.splice(i, 1); continue; }
      if (!p.dead && Math.abs(p.x - d.x) < 30 && Math.abs(p.y - d.y) < 60) {
        p.hp = Math.min(p.maxHp, p.hp + SC.healAmount);
        float(g, d.x, d.y - 40, '+' + SC.healAmount, 'terra');
        fx(g, 'sparkle', d.x, d.y - 20, {});
        sfx(g, 'pickup');
        g.drops.splice(i, 1);
      }
    }
  }

  // ---------- bosses ----------
  function bossEnrageCheck(g, b) {
    if (!b.enraged && b.hp <= b.maxHp * 0.5) {
      b.enraged = true;
      banner(g, 'enrage', b.key);
      g.shake = Math.max(g.shake, 6);
      sfx(g, 'enrage');
    }
    // mercy heals at 75 / 50 / 25 %
    var marks = [0.75, 0.5, 0.25];
    for (var i = 0; i < 3; i++) {
      if (b.hp <= b.maxHp * marks[i] && b.mercyMark <= i) {
        b.mercyMark = i + 1;
        var side = g.player.x < (AR.wallL + AR.wallR) / 2 ? AR.wallR - 120 : AR.wallL + 120;
        g.drops.push({ x: side, y: AR.floorY, t: 0, life: 8 });
        sfx(g, 'drop');
      }
    }
  }
  function bossCdMul(b) { return b.enraged ? 0.85 : 1; }
  function shockwave(g, x, dmg) {
    g.projectiles.push({ type: 'shock', from: 'enemy', x: x, y: AR.floorY, vx: 330, vy: 0, dmg: dmg, life: 1.4, r: 10 });
    g.projectiles.push({ type: 'shock', from: 'enemy', x: x, y: AR.floorY, vx: -330, vy: 0, dmg: dmg, life: 1.4, r: 10 });
    fx(g, 'dust', x, AR.floorY, { n: 8 });
    g.shake = Math.max(g.shake, 6);
    sfx(g, 'shockwave');
  }

  function updateBoss(g, dt) {
    var b = g.boss, p = g.player;
    if (!b) return;
    b.stateT += dt;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    if (b.dead) { b.vx *= Math.pow(0.02, dt); physicsBody(b, dt, 1); return; }
    bossEnrageCheck(g, b);
    var dx = p.x - b.x, adx = Math.abs(dx), dir = dx > 0 ? 1 : -1;
    var mul = bossCdMul(b);
    if (b.leapCd > 0) b.leapCd -= dt / mul;
    if (b.swoopCd > 0) b.swoopCd -= dt / mul;
    if (b.rainCd > 0) b.rainCd -= dt / mul;
    if (b.zoneCd > 0) b.zoneCd -= dt / mul;
    if (b.volleyCd > 0) b.volleyCd -= dt / mul;
    if (b.patCd > 0) b.patCd -= dt / mul;

    if (b.state === 'enter') {
      b.face = dir;
      if (b.stateT > 1.2) { b.state = 'idle'; b.stateT = 0; }
      return;
    }
    if (b.attack) { progressBossAttack(g, b, dt); if (!b.gravOff) physicsBody(b, dt, 1); return; }

    // Cactus Jack: slam on landing
    if (b.key === 'cactus' && b.state === 'leap' && b.onGround && b.stateT > 0.08) {
      shockwave(g, b.x, 12);
      b.state = 'land'; b.stateT = 0; b.vx = 0;
      return;
    }

    switch (b.key) {
      case 'cactus': updateCactus(g, b, dt, adx, dir, mul); break;
      case 'sidewinder': updateSidewinder(g, b, dt, adx, dir, mul); break;
      case 'vulture': updateVulture(g, b, dt, adx, dir, mul); break;
      case 'titan': updateTitan(g, b, dt, adx, dir, mul); break;
      case 'elsol': updateElSol(g, b, dt, adx, dir, mul); break;
    }
    if (!b.gravOff) physicsBody(b, dt, 1);
    else {
      b.x = Math.max(AR.wallL + 26, Math.min(AR.wallR - 26, b.x));
      b.vx = 0; b.vy = 0;
    }
  }

  function bossMelee(g, b, dmg, reach, arcH, kb, up, tele, act, rec) {
    b.attack = { phase: 'w', t: 0, spec: { dmg: dmg, reach: reach, arcH: arcH, kb: kb, up: up, tele: tele, act: act, rec: rec }, hitDone: false };
    b.state = 'windup'; b.stateT = 0;
    b.face = g.player.x > b.x ? 1 : -1;
  }
  function progressBossAttack(g, b, dt) {
    var a = b.attack, s = a.spec;
    a.t += dt;
    if (a.phase === 'w' && a.t >= s.tele) { a.phase = 'a'; a.t = 0; sfx(g, 'swing', 1); }
    if (a.phase === 'a') {
      var box = meleeBox(b, s.reach, s.arcH);
      if (!a.hitDone && overlap(box, bodyBox(g.player))) {
        a.hitDone = true;
        damagePlayer(g, s.dmg, b.x, { kb: s.kb, up: s.up });
      }
      if (a.t >= s.act) { a.phase = 'r'; a.t = 0; }
    }
    if (a.phase === 'r' && a.t >= s.rec) { b.attack = null; b.state = 'idle'; b.stateT = 0; }
  }

  // — Cactus Jack: walk, club swing, leaping slam with shockwaves —
  function updateCactus(g, b, dt, adx, dir, mul) {
    if (b.state === 'land') {
      b.vx = 0;
      if (b.stateT >= 0.6) { b.state = 'idle'; b.stateT = 0; }
      return;
    }
    if (b.leapCd <= 0 && b.onGround && adx > 120) { cactusLeap(g, b, dir); return; }
    if (adx < b.reach * b.scale * 0.8) {
      b.vx = 0;
      if (b.patCd <= 0) {
        bossMelee(g, b, b.dmg, 84, 80, 380, 160, 0.55 * mul, 0.12, 0.5);
        b.patCd = 2.6 * mul;
      }
    } else {
      b.vx = dir * b.speed; b.face = dir; b.state = 'run'; b.runPhase += dt * 7;
    }
  }
  function cactusLeap(g, b, dir) {
    var p = g.player;
    var T = 0.62;
    b.vy = -680;
    b.vx = Math.max(-520, Math.min(520, (p.x - b.x) / T));
    b.onGround = false;
    b.state = 'leap'; b.stateT = 0;
    b.leapCd = b.enraged ? 4.5 : 6;
    b.leapLanded = false;
    fx(g, 'dust', b.x, AR.floorY, { n: 6 });
    sfx(g, 'jump', 0.6);
  }
  // — Sidewinder: spacing, telegraphed dash-slash, punish stagger —
  function updateSidewinder(g, b, dt, adx, dir, mul) {
    if (b.state === 'dashTele') {
      b.vx = 0;
      if (b.stateT >= 0.5) {
        b.state = 'dashing'; b.stateT = 0; b.hitOnce = false;
        b.dashDir = b.playerLockX > b.x ? 1 : -1; b.face = b.dashDir;
        sfx(g, 'dash', 1);
      }
      return;
    }
    if (b.state === 'dashing') {
      b.vx = b.dashDir * 900;
      if (b.stateT > 0.12 && !b.hitOnce) {
        if (Math.abs(g.player.x - b.x) < 60 * b.scale && g.player.y > AR.floorY - 70) {
          if (damagePlayer(g, b.dmg, b.x, { kb: 300, up: 200 })) b.hitOnce = true;
        }
      }
      if (b.x <= AR.wallL + 30 || b.x >= AR.wallR - 30) {
        b.vx = 0; b.state = 'stunned'; b.stateT = 0;
        fx(g, 'dust', b.x, AR.floorY, { n: 6 });
        g.shake = Math.max(g.shake, 4);
      }
      return;
    }
    if (b.state === 'stunned') {
      b.vx = 0;
      if (b.stateT >= 1.0) {
        if (b.dashCount > 1) {
          b.dashCount--; b.state = 'dashTele'; b.stateT = 0;
          b.playerLockX = g.player.x;
        } else { b.state = 'idle'; b.stateT = 0; }
      }
      return;
    }
    if (adx < 95 * b.scale) {
      b.vx = 0;
      if (b.patCd <= 0) {
        bossMelee(g, b, 10, 90, 90, 260, 120, 0.3 * mul, 0.1, 0.35);
        b.patCd = (1.3 + g.rng() * 0.2) * mul;
      }
      return;
    }
    // spacing + dash pattern
    if (adx < 260) { b.vx = -dir * b.speed * 0.7; b.face = dir; b.state = 'run'; b.runPhase += dt * 11; }
    else if (adx > 340) { b.vx = dir * b.speed; b.face = dir; b.state = 'run'; b.runPhase += dt * 11; }
    else { b.vx = 0; b.state = 'idle'; }
    if (b.patCd <= 0) {
      b.state = 'dashTele'; b.stateT = 0; b.vx = 0;
      b.playerLockX = g.player.x;
      b.dashCount = b.enraged ? 2 : 1;
      b.patCd = 3.2 * mul;
    }
  }
  // — The Vulture: hovers high/low, feather fans on low hover, telegraphed swoop —
  function updateVulture(g, b, dt, adx, dir, mul) {
    b.gravOff = true;
    if (b.state === 'swoopTele') {
      if (b.stateT >= 0.5) {
        var p = g.player;
        var dx = p.x - b.x, dy = (p.y - 40) - b.y;
        var L = Math.hypot(dx, dy) || 1;
        b.swVx = dx / L * 700; b.swVy = dy / L * 700;
        b.state = 'swooping'; b.stateT = 0; b.hitOnce = false;
        sfx(g, 'dash', 0.9);
      }
      return;
    }
    if (b.state === 'swooping') {
      b.x += b.swVx * dt; b.y += b.swVy * dt;
      if (!b.hitOnce && Math.abs(g.player.x - b.x) < 55 * b.scale && Math.abs((g.player.y - 44) - b.y) < 60) {
        if (damagePlayer(g, b.dmg, b.x, { kb: 320, up: 240 })) b.hitOnce = true;
      }
      if (b.stateT > 0.9 || b.y > AR.floorY - 60 || b.x < AR.wallL + 20 || b.x > AR.wallR - 20) {
        b.state = 'hoverLow'; b.stateT = 0; b.hoverT = 0;
      }
      return;
    }
    // hover cycle
    b.hoverT = (b.hoverT || 0) + dt;
    var high = b.state === 'hoverHigh';
    var targetY = high ? 250 : 400;
    var dur = high ? (b.enraged ? 1.2 : 2.0) : 2.6;
    b.y += (targetY - b.y) * Math.min(1, dt * 3);
    var want = 200, d2 = want - adx;
    if (Math.abs(d2) > 40) { b.vx = dir * b.speed * 0.6 * (d2 > 0 ? 1 : -1); b.face = dir; b.runPhase += dt * 6; }
    else { b.vx = 0; b.face = dir; }
    b.x += b.vx * dt;
    b.x = Math.max(AR.wallL + 30, Math.min(AR.wallR - 30, b.x));
    if (b.swoopCd <= 0) {
      b.state = 'swoopTele'; b.stateT = 0;
      b.swoopCd = b.enraged ? 4.5 : 6;
      return;
    }
    if (!high && b.patCd <= 0) {
      featherFan(g, b);
      b.patCd = 3.0 * mul;
    }
    if (b.hoverT > dur) {
      b.state = high ? 'hoverLow' : 'hoverHigh';
      b.hoverT = 0;
    }
  }
  function featherFan(g, b) {
    var p = g.player;
    var n = b.enraged ? 5 : 3;
    var cx = p.x - b.x, cy = (p.y - 50) - b.y;
    var base = Math.atan2(cy, cx);
    for (var i = 0; i < n; i++) {
      var a2 = base + (i - (n - 1) / 2) * (Math.PI / 14);
      g.projectiles.push({
        type: 'feather', from: 'enemy', x: b.x, y: b.y,
        vx: Math.cos(a2) * 300, vy: Math.sin(a2) * 300, r: 8, dmg: 8
      });
    }
    sfx(g, 'throw');
  }
  // — Dust Titan: slow walk, smash, stomp waves, telegraphed rock rain —
  function updateTitan(g, b, dt, adx, dir, mul) {
    if (b.state === 'stompTele') {
      b.vx = 0; b.face = dir;
      if (b.stateT >= 0.4) {
        shockwave(g, b.x, 12);
        b.state = 'idle'; b.stateT = 0;
      }
      return;
    }
    if (b.state === 'rainTele') {
      b.vx = 0;
      if (b.stateT >= 0.5) {
        var n = b.enraged ? 8 : 5;
        for (var i = 0; i < n; i++) {
          var px = g.player.x + (g.rng() * 2 - 1) * (60 + i * 26);
          px = Math.max(AR.wallL + 30, Math.min(AR.wallR - 30, px));
          g.zones.push({ x: px, r: 34, warm: 0.8, burn: 0.2, dps: 0, warn: true });
          g.projectiles.push({
            type: 'rock', from: 'enemy', x: px, y: -30 - i * 40,
            vx: 0, vy: 260 + g.rng() * 120, r: 14, dmg: 12, grav: false, delay: 0.8
          });
        }
        sfx(g, 'warning');
        b.state = 'idle'; b.stateT = 0;
        b.rainCd = 8 * mul;
      }
      return;
    }
    if (b.rainCd <= 0 && adx > 200) { b.state = 'rainTele'; b.stateT = 0; b.face = dir; return; }
    if (b.leapCd <= 0 && adx < 400) {
      // telegraphed stomp waves
      b.state = 'stompTele'; b.stateT = 0;
      b.leapCd = 7 * mul;
      return;
    }
    if (adx < 110 * b.scale) {
      b.vx = 0;
      if (b.patCd <= 0) {
        bossMelee(g, b, b.dmg, 110, 120, 460, 220, 0.65 * mul, 0.12, 0.6);
        b.patCd = 3.4 * mul;
        sfx(g, 'quake');
      }
    } else {
      b.vx = dir * b.speed; b.face = dir; b.state = 'run'; b.runPhase += dt * 5;
    }
  }
  // — El Sol: aimed bolts, scorch zones, charging dash, close swipe; rain when enraged —
  function updateElSol(g, b, dt, adx, dir, mul) {
    if (b.state === 'chargeTele') {
      b.vx = 0;
      if (b.stateT >= 0.5) {
        b.state = 'charging'; b.stateT = 0; b.hitOnce = false;
        b.dashDir = b.playerLockX > b.x ? 1 : -1; b.face = b.dashDir;
        sfx(g, 'dash', 1);
      }
      return;
    }
    if (b.state === 'charging') {
      b.vx = b.dashDir * 800;
      if (b.stateT > 0.1 && !b.hitOnce && Math.abs(g.player.x - b.x) < 60 * b.scale) {
        if (damagePlayer(g, b.dmg, b.x, { kb: 340, up: 220 })) b.hitOnce = true;
      }
      if (b.x <= AR.wallL + 30 || b.x >= AR.wallR - 30) {
        b.vx = 0; b.state = 'idle'; b.stateT = 0;
        fx(g, 'dust', b.x, AR.floorY, { n: 6 }); g.shake = Math.max(g.shake, 4);
      }
      return;
    }
    if (b.rainCd <= 0) {
      var n = 4;
      for (var i = 0; i < n; i++) {
        var px = g.player.x + (g.rng() * 2 - 1) * (70 + i * 30);
        px = Math.max(AR.wallL + 30, Math.min(AR.wallR - 30, px));
        g.projectiles.push({
          type: 'rock', from: 'enemy', x: px, y: -30 - i * 40,
          vx: 0, vy: 300 + g.rng() * 100, r: 12, dmg: 10, grav: false, delay: 0.8
        });
      }
      sfx(g, 'warning');
      b.rainCd = 9 * mul;
      return;
    }
    if (b.zoneCd <= 0) {
      for (var z = 0; z < 2; z++) {
        var zx = g.player.x + (z === 0 ? -1 : 1) * (90 + g.rng() * 80);
        zx = Math.max(AR.wallL + 50, Math.min(AR.wallR - 50, zx));
        g.zones.push({ x: zx, r: 70, warm: 0.7, burn: 3, dps: 12, tick: 0 });
      }
      sfx(g, 'warning');
      b.zoneCd = 8 * mul;
      return;
    }
    if (b.volleyCd <= 0) {
      var p = g.player;
      var base = Math.atan2((p.y - 50) - b.y, p.x - b.x);
      var nb = b.enraged ? 5 : 3;
      for (var k = 0; k < nb; k++) {
        var a2 = base + (k - (nb - 1) / 2) * (Math.PI / 16);
        g.projectiles.push({
          type: 'bolt', from: 'enemy', x: b.x + Math.cos(base) * 40, y: b.y - 90 * b.scale * 0.6,
          vx: Math.cos(a2) * 340, vy: Math.sin(a2) * 340, r: 8, dmg: 9
        });
      }
      sfx(g, 'throw');
      b.volleyCd = 3.2 * mul;
      return;
    }
    if (adx < 90 * b.scale) {
      b.vx = 0;
      if (b.patCd <= 0) {
        bossMelee(g, b, b.dmg, 100, 100, 380, 180, 0.35 * mul, 0.1, 0.45);
        b.patCd = 2.2 * mul;
      }
      return;
    }
    if (b.patCd <= 0 && adx > 240) {
      b.state = 'chargeTele'; b.stateT = 0;
      b.playerLockX = g.player.x;
      b.patCd = 6 * mul;
      return;
    }
    if (adx < 300) { b.vx = -dir * b.speed * 0.6; b.face = dir; b.state = 'run'; b.runPhase += dt * 8; }
    else { b.vx = 0; b.state = 'idle'; b.face = dir; }
  }

  // ---------- particles & floaters ----------
  function updateParticles(g, dt) {
    for (var i = g.particles.length - 1; i >= 0; i--) {
      var pa = g.particles[i];
      pa.t += dt;
      if (pa.grav) pa.vy += 1400 * dt;
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      if (pa.t >= pa.life) g.particles.splice(i, 1);
    }
    for (var j = g.floaters.length - 1; j >= 0; j--) {
      var fl = g.floaters[j];
      fl.t += dt; fl.y -= 34 * dt;
      if (fl.t > 1.1) g.floaters.splice(j, 1);
    }
  }

  function spawnEventFx(g, e) {
    var i, n;
    if (e.kind === 'ink') {
      n = e.n || 5;
      for (i = 0; i < n; i++) g.particles.push({
        x: e.x, y: e.y, vx: (Math.random() * 2 - 1) * 220, vy: -Math.random() * 240,
        grav: true, t: 0, life: 0.4 + Math.random() * 0.3, r: 2 + Math.random() * 3, col: 'ink'
      });
    } else if (e.kind === 'blood') {
      n = e.n || 6;
      for (i = 0; i < n; i++) g.particles.push({
        x: e.x, y: e.y, vx: (Math.random() * 2 - 1) * 260, vy: -Math.random() * 200,
        grav: true, t: 0, life: 0.35 + Math.random() * 0.3, r: 2 + Math.random() * 3, col: 'terra'
      });
    } else if (e.kind === 'dust') {
      n = e.n || 4;
      for (i = 0; i < n; i++) g.particles.push({
        x: e.x + (Math.random() * 2 - 1) * 14, y: e.y - 4,
        vx: (Math.random() * 2 - 1) * 120, vy: -30 - Math.random() * 60,
        grav: false, t: 0, life: 0.5 + Math.random() * 0.4, r: 4 + Math.random() * 5, col: 'dust'
      });
    } else if (e.kind === 'impact') {
      g.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, grav: false, t: 0, life: 0.18, r: 26, col: 'impact' });
    } else if (e.kind === 'speedline') {
      for (i = 0; i < 4; i++) g.particles.push({
        x: e.x, y: e.y + (i - 1.5) * 12, vx: -e.dir * (300 + i * 60), vy: 0,
        grav: false, t: 0, life: 0.2, r: 18 + i * 4, col: 'line', dir: e.dir
      });
    } else if (e.kind === 'sparkle') {
      for (i = 0; i < 6; i++) g.particles.push({
        x: e.x, y: e.y, vx: Math.cos(i / 6 * 6.28) * 90, vy: Math.sin(i / 6 * 6.28) * 90,
        grav: false, t: 0, life: 0.4, r: 2.5, col: 'terra'
      });
    }
  }

  // ---------- main update ----------
  function update(g, dt, input) {
    input = input || {};
    if (g.hitstop > 0) {
      g.hitstop -= dt;
      updateParticles(g, dt);
      return;
    }
    g.t += dt;
    g.elapsed += dt;
    if (g.bannerT > 0) g.bannerT -= dt;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 22);
    if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }

    updatePlayer(g, dt, input);
    g.enemies.forEach(function (e) { updateEnemy(g, e, dt); });
    g.enemies = g.enemies.filter(function (e) { return !(e.dead && e.stateT > 1.2); });
    if (g.boss) updateBoss(g, dt);
    updateProjectiles(g, dt);
    updateZones(g, dt);
    updateDrops(g, dt);
    updateParticles(g, dt);

    // fx events → particles (drained here; sfx events drained by UI)
    for (var i = g.events.length - 1; i >= 0; i--) {
      if (g.events[i].type === 'fx') { spawnEventFx(g, g.events[i]); g.events.splice(i, 1); }
    }

    // phase progression
    if (g.phase === 'waves') {
      trySpawn(g, dt);
      if (!g.spawnQueue.length && aliveCount(g) === 0) nextWave(g);
    } else if (g.phase === 'bossIntro') {
      g.phaseT += dt;
      if (g.phaseT > 1.4 && !g.boss) {
        g.boss = mkBoss(C.LEVELS[g.level - 1].boss, g.level);
        g.phase = 'boss';
      }
    } else if (g.phase === 'won') {
      g.phaseT += dt;
    } else if (g.phase === 'lost') {
      g.phaseT += dt;
    }
  }
  function drainSfx(g) {
    var out = [];
    for (var i = 0; i < g.events.length; i++) if (g.events[i].type === 'sfx') out.push(g.events[i]);
    g.events = g.events.filter(function (e) { return e.type !== 'sfx'; });
    return out;
  }

  globalThis.SS_Engine = {
    newGame: newGame, update: update, drainSfx: drainSfx,
    bodyBox: bodyBox, meleeBox: meleeBox, overlap: overlap,
    mkPlayer: mkPlayer, mkEnemy: mkEnemy, mkBoss: mkBoss,
    damagePlayer: damagePlayer, damageFighter: damageFighter,
    comboMult: C.comboMult
  };
})();
