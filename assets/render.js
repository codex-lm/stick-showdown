/* Stick Showdown — canvas rendering: desert-noon arena, animated stickmen,
   particles, HUD and banners. Pure drawing from engine state; no logic. */
(function () {
  'use strict';

  var C = globalThis.SS_Config;
  var AR = C.ARENA;

  var COL = {
    sand: '#e8d9b0', sandLight: '#f2e6c8', sky: '#fbf7ec',
    ink: '#2b2118', inkSoft: 'rgba(43,33,24,0.55)',
    terra: '#b5502f', ochre: '#c47f3d', dust: '#c9b285',
    shadow: 'rgba(43,33,24,0.16)', white: '#fdfbf4'
  };

  // ---------- background ----------
  var pebbles = null;
  function makePebbles() {
    var rng = C.makeRng(1234), out = [];
    for (var i = 0; i < 26; i++) {
      out.push({
        x: 40 + rng() * 880, y: AR.floorY + 8 + rng() * 46,
        r: 1.5 + rng() * 3, tuft: rng() < 0.4
      });
    }
    return out;
  }
  function drawBackground(ctx, t) {
    // sky
    ctx.fillStyle = COL.sky;
    ctx.fillRect(0, 0, AR.W, 240);
    // sun with hard ring
    ctx.fillStyle = COL.ochre;
    ctx.beginPath(); ctx.arc(AR.W - 130, 86, 46, 0, 7); ctx.fill();
    ctx.fillStyle = COL.sky;
    ctx.beginPath(); ctx.arc(AR.W - 130, 86, 40, 0, 7); ctx.fill();
    ctx.strokeStyle = COL.ochre; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(AR.W - 130, 86, 52 + Math.sin(t * 1.4) * 1.5, 0, 7); ctx.stroke();
    // sun rays (hard, graphic)
    ctx.strokeStyle = COL.ochre; ctx.lineWidth = 2.5;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 + t * 0.05;
      ctx.beginPath();
      ctx.moveTo(AR.W - 130 + Math.cos(a) * 60, 86 + Math.sin(a) * 60);
      ctx.lineTo(AR.W - 130 + Math.cos(a) * (68 + (i % 2) * 8), 86 + Math.sin(a) * (68 + (i % 2) * 8));
      ctx.stroke();
    }
    // dunes
    ctx.fillStyle = COL.sandLight;
    ctx.beginPath();
    ctx.moveTo(0, 240);
    ctx.quadraticCurveTo(180, 196, 400, 236);
    ctx.quadraticCurveTo(620, 270, 830, 226);
    ctx.quadraticCurveTo(920, 208, AR.W, 232);
    ctx.lineTo(AR.W, 320); ctx.lineTo(0, 320); ctx.closePath(); ctx.fill();
    ctx.fillStyle = COL.dust;
    ctx.beginPath();
    ctx.moveTo(0, 292);
    ctx.quadraticCurveTo(260, 262, 520, 296);
    ctx.quadraticCurveTo(760, 326, AR.W, 288);
    ctx.lineTo(AR.W, 340); ctx.lineTo(0, 340); ctx.closePath(); ctx.fill();
    // ground
    ctx.fillStyle = COL.sand;
    ctx.fillRect(0, 320, AR.W, AR.H - 320);
    // horizon line
    ctx.strokeStyle = COL.dust; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 320); ctx.lineTo(AR.W, 320); ctx.stroke();
    // arena floor line
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, AR.floorY); ctx.lineTo(AR.W, AR.floorY); ctx.stroke();
    // two lone cacti on the mid-ground
    ctx.strokeStyle = 'rgba(74,64,54,0.5)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    [150, 812].forEach(function (cx2, i) {
      var h2 = 40 + i * 12;
      ctx.beginPath(); ctx.moveTo(cx2, 352); ctx.lineTo(cx2, 352 - h2); ctx.stroke();
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx2, 352 - h2 * 0.55); ctx.lineTo(cx2 - 11, 352 - h2 * 0.55);
      ctx.lineTo(cx2 - 11, 352 - h2 * 0.75); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx2, 352 - h2 * 0.35); ctx.lineTo(cx2 + 10, 352 - h2 * 0.35);
      ctx.lineTo(cx2 + 10, 352 - h2 * 0.6); ctx.stroke();
      ctx.lineWidth = 7;
    });
    // pebbles & tufts
    if (!pebbles) pebbles = makePebbles();
    ctx.fillStyle = COL.inkSoft;
    ctx.strokeStyle = COL.inkSoft; ctx.lineWidth = 1.5;
    pebbles.forEach(function (p) {
      if (p.tuft) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 4, p.y - 7);
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 9);
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4, p.y - 6);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    });
  }

  // ---------- zones, drops, projectiles ----------
  function drawZones(ctx, g) {
    g.zones.forEach(function (z) {
      if (z.t < z.warm) {
        var k = z.t / z.warm;
        ctx.save();
        ctx.strokeStyle = COL.ochre; ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.ellipse(z.x, AR.floorY, z.r * (1.25 - 0.25 * k), 12, 0, 0, 7);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COL.terra;
        ctx.font = 'bold 20px Verdana';
        ctx.textAlign = 'center';
        ctx.fillText('!', z.x, AR.floorY - 26 - Math.sin(k * 12) * 3);
        ctx.restore();
      } else {
        ctx.save();
        var a = 0.16 + Math.sin(z.t * 22) * 0.05;
        ctx.fillStyle = 'rgba(181,80,47,' + a.toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(z.x, AR.floorY, z.r, 16, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = COL.terra; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(z.x, AR.floorY, z.r, 16, 0, 0, 7);
        ctx.stroke();
        for (var i = 0; i < 4; i++) {
          var lx = z.x - z.r * 0.6 + i * z.r * 0.4;
          var ly = AR.floorY - ((z.t * 140 + i * 37) % 46);
          ctx.strokeStyle = COL.terra; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 10); ctx.stroke();
        }
        ctx.restore();
      }
    });
  }
  function drawDrops(ctx, g) {
    g.drops.forEach(function (d) {
      if (d.life - d.t < 2 && Math.floor(d.t * 8) % 2 === 0) return; // expiring blink
      var bob = Math.sin(d.t * 4) * 3;
      var x = d.x, y = AR.floorY - 16 + bob;
      ctx.save();
      ctx.fillStyle = COL.shadow;
      ctx.beginPath(); ctx.ellipse(x, AR.floorY + 4, 12, 4, 0, 0, 7); ctx.fill();
      // canteen
      ctx.fillStyle = COL.terra;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.fillRect(x - 3, y - 16, 6, 6);
      ctx.strokeStyle = COL.white; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 5, -0.6, 2.2); ctx.stroke();
      ctx.restore();
    });
  }
  function drawProjectiles(ctx, g) {
    g.projectiles.forEach(function (p) {
      if (p.delay > 0) return;
      ctx.save();
      if (p.type === 'stone') {
        ctx.fillStyle = COL.ink;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      } else if (p.type === 'shock') {
        // dust crest racing along the ground
        ctx.fillStyle = COL.dust;
        ctx.strokeStyle = COL.inkSoft;
        ctx.lineWidth = 2;
        for (var i = 0; i < 3; i++) {
          var h = 22 - i * 6;
          var off = i * 9 * (p.vx > 0 ? -1 : 1);
          ctx.beginPath();
          ctx.moveTo(p.x + off - 8, AR.floorY);
          ctx.quadraticCurveTo(p.x + off, AR.floorY - h, p.x + off + 8, AR.floorY);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      } else if (p.type === 'feather') {
        var a = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = COL.ochre;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 3.5, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
      } else if (p.type === 'bolt') {
        var b = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(b);
        ctx.strokeStyle = COL.ochre; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.strokeStyle = COL.terra; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(16, 0); ctx.stroke();
      } else if (p.type === 'rock') {
        ctx.fillStyle = COL.ink;
        ctx.strokeStyle = COL.ochre; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - p.r, p.y + p.r * 0.5);
        ctx.lineTo(p.x - p.r * 0.6, p.y - p.r);
        ctx.lineTo(p.x + p.r * 0.7, p.y - p.r * 0.8);
        ctx.lineTo(p.x + p.r, p.y + p.r * 0.6);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    });
  }

  // ---------- particles & floaters ----------
  function drawParticles(ctx, g) {
    g.particles.forEach(function (p) {
      var k = 1 - p.t / p.life;
      ctx.save();
      if (p.col === 'ink') {
        ctx.fillStyle = COL.ink;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, 7); ctx.fill();
      } else if (p.col === 'terra') {
        ctx.fillStyle = COL.terra;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, 7); ctx.fill();
      } else if (p.col === 'dust') {
        ctx.fillStyle = COL.dust;
        ctx.globalAlpha = k * 0.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, 7); ctx.fill();
      } else if (p.col === 'impact') {
        // hard manga starburst
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = k;
        ctx.fillStyle = COL.white;
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
          var a = i * Math.PI / 4;
          var rr = p.r * (i % 2 ? 0.45 : 1) * (1.2 - k * 0.4);
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (p.col === 'line') {
        ctx.strokeStyle = COL.inkSoft;
        ctx.globalAlpha = k * 0.8;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.dir * p.r, p.y);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function drawFloaters(ctx, g) {
    g.floaters.forEach(function (f) {
      var a = f.t < 0.15 ? f.t / 0.15 : Math.max(0, 1 - (f.t - 0.6) / 0.5);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = f.col === 'terra' ? COL.terra : COL.ink;
      ctx.font = 'bold 17px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText(f.txt, f.x, f.y);
      ctx.restore();
    });
  }

  // ---------- stickman ----------
  /* Pose = joint angles in radians (0 = down for legs, 0 = horizontal-forward
     for arms measured from shoulder). Renderer maps pose -> skeleton. */
  function fighterPose(f, t) {
    var p = {
      lean: 0, crouch: 0, bob: 0,
      armF: { sh: -0.5, el: 0.5 }, armB: { sh: -0.7, el: 0.6 },
      legF: { hip: 0.12, knee: -0.1 }, legB: { hip: -0.12, knee: 0.1 },
      weaponAng: 0, weaponBack: false, punch: 0, flap: 0
    };
    var s = f.state, T = f.stateT;
    if (s === 'idle' || s === 'spawn') {
      p.bob = Math.sin(t * 3 + f.x * 0.01) * 1.6;
      p.armF = { sh: -1.15, el: 0.9 }; p.armB = { sh: -1.0, el: 1.0 };
    } else if (s === 'run') {
      var ph = f.runPhase * 2;
      p.lean = 0.22 * f.face;
      p.legF = { hip: Math.sin(ph) * 0.85, knee: -Math.max(0, -Math.sin(ph)) * 1.1 };
      p.legB = { hip: -Math.sin(ph) * 0.85, knee: -Math.max(0, Math.sin(ph)) * 1.1 };
      p.armF = { sh: -0.9 - Math.sin(ph) * 0.5, el: 0.7 };
      p.armB = { sh: -0.9 + Math.sin(ph) * 0.5, el: 0.7 };
      p.bob = Math.abs(Math.sin(ph)) * 2.4;
    } else if (s === 'jump') {
      if (f.vy < 0) {
        p.legF = { hip: 0.7, knee: -1.5 }; p.legB = { hip: -0.3, knee: -0.9 };
        p.armF = { sh: -2.4, el: 0.3 }; p.armB = { sh: -2.1, el: 0.3 };
      } else {
        p.legF = { hip: 0.35, knee: -0.35 }; p.legB = { hip: -0.45, knee: 0.3 };
        p.armF = { sh: -1.6, el: 0.4 }; p.armB = { sh: -1.3, el: 0.5 };
      }
    } else if (s === 'dash') {
      p.lean = 0.85 * (f.dashDir || f.face);
      p.legF = { hip: 0.95, knee: -0.4 }; p.legB = { hip: -0.85, knee: -0.7 };
      p.armF = { sh: -0.4, el: 0.2 }; p.armB = { sh: -1.9, el: 0.4 };
    } else if (s === 'hurt') {
      p.lean = -0.35 * f.face; p.crouch = 4;
      p.armF = { sh: -2.6, el: 0.2 }; p.armB = { sh: -2.3, el: 0.3 };
      p.legF = { hip: 0.3, knee: -0.4 }; p.legB = { hip: -0.5, knee: -0.2 };
    } else if (s === 'dead') {
      p.dead = true;
    } else if (s === 'windup') {
      var k = Math.min(1, T / 0.12);
      p.crouch = 3;
      p.armB = { sh: -2.9, el: 0.4 }; p.armF = { sh: -1.2, el: 0.8 };
      p.weaponAng = -0.9; p.weaponBack = true;
      p.lean = -0.12 * f.face * k;
    } else if (s === 'attack') {
      attackPose(f, p, t);
    } else if (s === 'leap') {
      p.legF = { hip: 0.8, knee: -1.6 }; p.legB = { hip: -0.6, knee: -1.2 };
      p.armB = { sh: -3.0, el: 0.2 };
      p.lean = 0.15 * f.face;
    } else if (s === 'land') {
      p.crouch = 10; p.lean = 0.1 * f.face;
      p.armF = { sh: -0.4, el: 0.3 }; p.armB = { sh: -0.6, el: 0.3 };
      p.legF = { hip: 0.55, knee: -1.0 }; p.legB = { hip: -0.55, knee: -0.6 };
    } else if (s === 'dashTele') {
      p.crouch = 6; p.lean = 0.4 * f.face;
      p.armF = { sh: -2.6, el: 0.2 }; p.armB = { sh: -2.4, el: 0.2 };
    } else if (s === 'dashing' || s === 'charging') {
      p.lean = 0.75 * (f.dashDir || f.face);
      p.armF = { sh: -1.9, el: 0.1 }; p.armB = { sh: -1.7, el: 0.1 };
      p.legF = { hip: 1.0, knee: -0.5 }; p.legB = { hip: -0.9, knee: -0.8 };
    } else if (s === 'stunned') {
      p.lean = -0.1 * f.face; p.crouch = 6;
      p.armF = { sh: -0.2, el: 0.2 }; p.armB = { sh: -0.35, el: 0.2 };
      p.bob = Math.sin(t * 20) * 1.2;
    } else if (s === 'hoverHigh' || s === 'hoverLow' || s === 'swoopTele' || s === 'swooping') {
      p.flap = Math.sin(t * 9) * 0.7;
      p.legF = { hip: 0.25, knee: -0.5 }; p.legB = { hip: -0.2, knee: -0.55 };
      p.armF = { sh: -1.5 + p.flap, el: 0.15 };
      p.armB = { sh: -1.5 - p.flap, el: 0.15 };
      if (s === 'swoopTele') {
        p.armF = { sh: -2.9, el: 0 }; p.armB = { sh: -2.7, el: 0 };
      }
      if (s === 'swooping') { p.lean = 0.5 * (f.swVx > 0 ? 1 : -1); }
    } else if (s === 'enter') {
      p.crouch = 8; p.bob = Math.sin(t * 2) * 2;
      p.armF = { sh: -1.0, el: 0.7 }; p.armB = { sh: -0.9, el: 0.7 };
    }
    return p;
  }

  function attackPose(f, p, t) {
    var a = f.attack, w = f.weapon;
    var spec = a ? a.spec : null;
    var wkey = w ? w.key : (f.type || 'fists');
    var ph = a ? a.phase : 'w';
    var k = a ? Math.min(1, a.t / Math.max(0.001, (ph === 'w' ? (spec ? spec.w : a.specW) : ph === 'a' ? (spec ? spec.a : a.specA) : (spec ? spec.r : a.specR)))) : 0;
    if (f.kind === 'enemy' || f.kind === 'boss') {
      // generic enemy/boss swing: overhead chop
      if (ph === 'w') {
        p.armB = { sh: -2.9, el: 0.3 }; p.weaponAng = -1.1; p.weaponBack = true;
        p.lean = -0.1 * f.face; p.crouch = 3;
      } else if (ph === 'a') {
        p.armB = { sh: -0.9, el: 0.05 }; p.weaponAng = 0.35;
        p.lean = 0.28 * f.face;
        p.legF = { hip: 0.4, knee: -0.4 };
      } else {
        p.armB = { sh: -1.2, el: 0.3 }; p.weaponAng = 0.2;
        p.lean = 0.12 * f.face;
      }
      p.armF = { sh: -1.0, el: 0.7 };
      return;
    }
    if (wkey === 'fists') {
      var step = a ? a.step : 0;
      if (ph === 'w') { p.armF = { sh: -1.5, el: 1.4 }; p.lean = -0.06 * f.face; }
      else if (ph === 'a') {
        p.punch = 1;
        var front = step !== 1;
        if (front) p.armF = { sh: -0.05, el: 0.02 };
        else { p.armB = { sh: -0.05, el: 0.02 }; p.armF = { sh: -1.2, el: 1.1 }; }
        p.lean = 0.2 * f.face;
        p.legF = { hip: 0.35, knee: -0.35 }; p.legB = { hip: -0.4, knee: -0.1 };
      } else { p.armF = { sh: -0.9, el: 0.7 }; p.lean = 0.08 * f.face; }
    } else if (wkey === 'stick') {
      if (ph === 'w') {
        p.armF = { sh: -1.9, el: 0.9 }; p.armB = { sh: -1.7, el: 0.8 };
        p.weaponAng = -0.5; p.crouch = 3; p.lean = -0.08 * f.face;
      } else if (ph === 'a') {
        p.armF = { sh: -0.15, el: 0.05 }; p.armB = { sh: -0.35, el: 0.1 };
        p.weaponAng = 0; p.lean = 0.24 * f.face;
        p.legF = { hip: 0.5, knee: -0.45 }; p.legB = { hip: -0.55, knee: -0.05 };
      } else {
        p.armF = { sh: -0.7, el: 0.4 }; p.armB = { sh: -0.8, el: 0.4 };
        p.weaponAng = 0.15; p.lean = 0.1 * f.face;
      }
    } else if (wkey === 'machete') {
      if (ph === 'w') {
        p.armF = { sh: -2.7, el: 0.25 }; p.weaponAng = -1.3;
        p.lean = -0.15 * f.face; p.crouch = 4;
      } else if (ph === 'a') {
        p.armF = { sh: -0.6, el: 0.05 }; p.weaponAng = 0.55;
        p.lean = 0.3 * f.face;
        p.legF = { hip: 0.45, knee: -0.4 };
      } else {
        p.armF = { sh: -1.1, el: 0.3 }; p.weaponAng = 0.3;
        p.lean = 0.14 * f.face;
      }
    } else if (wkey === 'spear') {
      if (ph === 'w') {
        p.armB = { sh: -1.6, el: 0.9 }; p.armF = { sh: -1.1, el: 0.8 };
        p.weaponAng = -0.15; p.crouch = 5; p.lean = -0.1 * f.face;
      } else if (ph === 'a') {
        p.armB = { sh: -0.1, el: 0.02 }; p.armF = { sh: -0.2, el: 0.05 };
        p.weaponAng = 0; p.lean = 0.32 * f.face;
        p.legF = { hip: 0.7, knee: -0.3 }; p.legB = { hip: -0.75, knee: -0.05 };
      } else {
        p.armB = { sh: -0.6, el: 0.5 }; p.armF = { sh: -0.7, el: 0.4 };
        p.weaponAng = 0; p.lean = 0.12 * f.face;
      }
    } else if (wkey === 'sledge') {
      if (ph === 'w') {
        p.armF = { sh: -3.0, el: 0.15 }; p.weaponAng = -1.5;
        p.lean = -0.2 * f.face; p.crouch = 6;
      } else if (ph === 'a') {
        p.armF = { sh: -0.75, el: 0.02 }; p.weaponAng = 0.9;
        p.lean = 0.4 * f.face; p.crouch = 10;
        p.legF = { hip: 0.55, knee: -0.7 }; p.legB = { hip: -0.5, knee: -0.2 };
      } else {
        p.armF = { sh: -1.3, el: 0.3 }; p.weaponAng = 0.7;
        p.lean = 0.18 * f.face; p.crouch = 4;
      }
    }
  }

  function drawFighter(ctx, f, g) {
    var S = f.scale;
    var alpha = 1;
    if (f.state === 'dead') alpha = Math.max(0, 1 - f.stateT / 1.2);
    if (f.state === 'spawn') alpha = Math.min(1, f.stateT / 0.5);
    var t = g ? g.t : 0;
    var pose = fighterPose(f, t);

    ctx.save();
    ctx.globalAlpha = alpha;
    // hard noon shadow
    if (f.state !== 'dead' || f.stateT < 0.4) {
      ctx.fillStyle = COL.shadow;
      ctx.beginPath();
      ctx.ellipse(f.x, AR.floorY + 5, 22 * S, 5.5 * S, 0, 0, 7);
      ctx.fill();
    }

    var legL = 20 * S, torsoL = 26 * S, headR = 9.5 * S;
    var armU = 13 * S, armL = 12 * S, legU = 12 * S, legLw = 12 * S;
    var lw = (f.kind === 'boss' ? 6 : 4.6) * S * (f.type === 'brute' ? 1.45 : 1);
    // player keeps the darkest ink so it always reads on top of enemies
    var baseCol = f.kind === 'player' ? COL.ink : '#4a4036';
    var col = f.hitFlash > 0 && Math.floor(f.hitFlash * 30) % 2 === 0 ? COL.terra : baseCol;

    if (pose.dead) {
      // fallen fighter
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
      var yy = AR.floorY - 6;
      ctx.beginPath();
      ctx.moveTo(f.x - 34 * S, yy);
      ctx.lineTo(f.x + 22 * S, yy);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(f.x + 32 * S, yy - 2, headR, 0, 7); ctx.stroke();
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.moveTo(f.x + 26 * S, yy - headR - 2);
      ctx.lineTo(f.x + 38 * S, yy - headR - 10);
      ctx.moveTo(f.x + 38 * S, yy - headR - 2);
      ctx.lineTo(f.x + 26 * S, yy - headR - 10);
      ctx.stroke();
      ctx.restore();
      return;
    }

    var hipY = f.y - legL + pose.crouch * S - pose.bob * S * 0.4;
    // spawn: rise from the sand
    if (f.state === 'spawn') hipY += (1 - Math.min(1, f.stateT / 0.5)) * 40 * S;

    function J(x, y) { return { x: x, y: y }; }
    function limb(ox, oy, a1, l1, a2, l2) {
      // angles: 0 = straight down, positive = forward (facing dir)
      var x1 = ox + Math.sin(a1) * l1 * f.face, y1 = oy + Math.cos(a1) * l1;
      var x2 = x1 + Math.sin(a1 + a2) * l2 * f.face, y2 = y1 + Math.cos(a1 + a2) * l2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return J(x2, y2);
    }

    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // back leg, front leg (angles from vertical)
    limb(f.x, hipY, pose.legB.hip, legU, pose.legB.knee, legLw);
    limb(f.x, hipY, pose.legF.hip, legU, pose.legF.knee, legLw);

    // torso
    var shX = f.x + Math.sin(pose.lean) * torsoL * (pose.lean > 0 ? 1 : 1) * f.face;
    var shY = hipY - Math.cos(pose.lean) * torsoL;
    ctx.beginPath(); ctx.moveTo(f.x, hipY); ctx.lineTo(shX, shY); ctx.stroke();

    // head
    var hx = shX + Math.sin(pose.lean) * (headR + 3 * S) * f.face;
    var hy = shY - Math.cos(pose.lean) * (headR + 3 * S);
    ctx.beginPath(); ctx.arc(hx, hy, headR, 0, 7); ctx.stroke();
    // eye dot (facing side)
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(hx + headR * 0.45 * f.face, hy - headR * 0.15, 1.8 * S, 0, 7); ctx.fill();

    // identity: player headband (terracotta), brute bandana, boss details
    if (f.kind === 'player') {
      ctx.strokeStyle = COL.terra; ctx.lineWidth = 3.2 * S;
      ctx.beginPath();
      ctx.moveTo(hx - headR * 0.9, hy - headR * 0.45);
      ctx.lineTo(hx + headR * 0.9, hy - headR * 0.45);
      ctx.stroke();
      var fl = Math.sin(t * 7) * 3;
      ctx.beginPath();
      ctx.moveTo(hx - headR * 0.9, hy - headR * 0.45);
      ctx.quadraticCurveTo(hx - headR * 1.9, hy - headR * 0.2 + fl, hx - headR * 2.6, hy - headR * 0.6 + fl);
      ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw;
    } else if (f.kind === 'boss') {
      drawBossHead(ctx, f, hx, hy, headR, t);
    } else if (f.type === 'brute') {
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(hx - headR, hy - headR * 0.4);
      ctx.lineTo(hx + headR, hy - headR * 0.4);
      ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw;
    } else if (f.type === 'scout') {
      // little feather
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 2.4 * S;
      ctx.beginPath();
      ctx.moveTo(hx, hy - headR);
      ctx.lineTo(hx - 2 * S, hy - headR - 8 * S);
      ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw;
    } else if (f.type === 'slinger') {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.arc(hx, hy, headR + 2.5 * S, Math.PI * 0.9, Math.PI * 1.7); ctx.stroke();
    }

    // arms: back then front; front hand carries the weapon
    var handB = limb(shX, shY, Math.PI + pose.armB.sh * -1 * f.face - (f.face > 0 ? 0 : 0), armU, 0, 0);
    // (back arm drawn simplified behind torso)
    var bA = pose.armB;
    var bx1 = shX + Math.cos(bA.sh) * armU * f.face, by1 = shY + Math.sin(bA.sh) * armU;
    var bx2 = bx1 + Math.cos(bA.sh + bA.el) * armL * f.face, by2 = by1 + Math.sin(bA.sh + bA.el) * armL;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();

    var fA = pose.armF;
    var fx1 = shX + Math.cos(fA.sh) * armU * f.face, fy1 = shY + Math.sin(fA.sh) * armU;
    var fx2 = fx1 + Math.cos(fA.sh + fA.el) * armL * f.face, fy2 = fy1 + Math.sin(fA.sh + fA.el) * armL;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(fx1, fy1); ctx.lineTo(fx2, fy2); ctx.stroke();

    // fists dots
    if (f.kind === 'player' && f.weapon.key === 'fists') {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(fx2, fy2, 4.5 * S, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2, by2, 4 * S, 0, 7); ctx.fill();
    }

    // weapon in the front hand
    drawWeapon(ctx, f, fx2, fy2, pose, S, col, t);

    // telegraph "!" while winding up
    var winding = (f.state === 'windup' || f.state === 'dashTele' || f.state === 'swoopTele' || f.state === 'stompTele' || f.state === 'rainTele' || (f.attack && f.attack.phase === 'w') || f.wind === 'throwing');
    if (winding && !f.dead) {
      ctx.fillStyle = COL.terra;
      ctx.font = 'bold ' + Math.round(19 * Math.max(1, S)) + 'px Verdana';
      ctx.textAlign = 'center';
      ctx.globalAlpha = alpha * (0.75 + Math.sin(t * 24) * 0.25);
      ctx.fillText('!', hx, hy - headR - 12 * S);
      ctx.globalAlpha = alpha;
    }

    // vulture wings when hovering
    if (f.kind === 'boss' && f.key === 'vulture' && !f.dead) {
      var wingY = shY - 4;
      var flap = Math.sin(t * 9) * 0.55;
      ctx.strokeStyle = col; ctx.lineWidth = 4.5 * S;
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(shX, wingY);
        ctx.quadraticCurveTo(
          shX + side * 30 * S, wingY - (18 + flap * 14) * S,
          shX + side * 52 * S, wingY - (6 + flap * 20) * S
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(shX + side * 20 * S, wingY - (14 + flap * 10) * S);
        ctx.lineTo(shX + side * 34 * S, wingY - (12 + flap * 12) * S);
        ctx.stroke();
      });
    }
    // El Sol halo
    if (f.kind === 'boss' && f.key === 'elsol' && !f.dead) {
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 3 * S;
      var pulse = 1 + Math.sin(t * 5) * 0.08 + (f.enraged ? 0.15 : 0);
      for (var i = 0; i < 10; i++) {
        var an = i * Math.PI / 5 + t * 0.6;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(an) * headR * 1.5 * pulse, hy + Math.sin(an) * headR * 1.5 * pulse);
        ctx.lineTo(hx + Math.cos(an) * headR * (2.1 + (i % 2) * 0.4) * pulse, hy + Math.sin(an) * headR * (2.1 + (i % 2) * 0.4) * pulse);
        ctx.stroke();
      }
      if (f.enraged) {
        ctx.strokeStyle = COL.terra; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(hx, hy, headR * 2.6 * pulse, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBossHead(ctx, f, hx, hy, headR, t) {
    if (f.key === 'cactus') {
      // spiky hair
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 3 * f.scale;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(hx + i * 4 * f.scale, hy - headR * 0.8);
        ctx.lineTo(hx + i * 6 * f.scale, hy - headR * (1.5 + Math.abs(i) * 0.18));
        ctx.stroke();
      }
    } else if (f.key === 'sidewinder') {
      ctx.strokeStyle = COL.terra; ctx.lineWidth = 3 * f.scale;
      ctx.beginPath();
      ctx.moveTo(hx - headR, hy - headR * 0.35);
      ctx.lineTo(hx + headR, hy - headR * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - headR, hy - headR * 0.35);
      ctx.lineTo(hx - headR * 2.1, hy - headR * 0.9);
      ctx.stroke();
    } else if (f.key === 'vulture') {
      // beak + bald head
      ctx.fillStyle = COL.ochre;
      ctx.beginPath();
      ctx.moveTo(hx + headR * 0.7 * f.face, hy);
      ctx.lineTo(hx + headR * (0.7 + 0.9) * f.face, hy + headR * 0.25);
      ctx.lineTo(hx + headR * 0.7 * f.face, hy + headR * 0.45);
      ctx.closePath(); ctx.fill();
    } else if (f.key === 'titan') {
      // heavy brow
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 5 * f.scale;
      ctx.beginPath();
      ctx.moveTo(hx - headR * 0.9, hy - headR * 0.35);
      ctx.lineTo(hx + headR * 0.9, hy - headR * 0.35);
      ctx.stroke();
      // cracked chest
      ctx.lineWidth = 2.2 * f.scale;
      ctx.beginPath();
      ctx.moveTo(hx - 4 * f.scale, hy + headR * 1.6);
      ctx.lineTo(hx + 3 * f.scale, hy + headR * 2.6);
      ctx.lineTo(hx - 2 * f.scale, hy + headR * 3.6);
      ctx.stroke();
    }
  }

  function drawWeapon(ctx, f, hx, hy, pose, S, col, t) {
    var ang = pose.weaponAng || 0;
    var key;
    if (f.kind === 'player') key = f.weapon.key;
    else if (f.kind === 'boss') key = { cactus: 'club', sidewinder: 'blades', vulture: null, titan: 'hammer', elsol: null }[f.key];
    else key = { bandit: 'knife', scout: 'knife', slinger: 'sling', brute: 'club' }[f.type] || null;
    if (!key) return;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang * f.face + (pose.weaponBack ? -0.5 * f.face : 0));
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    if (key === 'stick') {
      ctx.lineWidth = 4 * S;
      ctx.beginPath(); ctx.moveTo(-10 * S, 0); ctx.lineTo(64 * S, 0); ctx.stroke();
      ctx.fillStyle = COL.ochre;
      ctx.beginPath(); ctx.arc(64 * S, 0, 4.5 * S, 0, 7); ctx.fill();
    } else if (key === 'machete') {
      ctx.lineWidth = 4 * S;
      ctx.beginPath(); ctx.moveTo(-6 * S, 0); ctx.lineTo(14 * S, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(12 * S, -3.5 * S);
      ctx.lineTo(52 * S, -2 * S);
      ctx.lineTo(56 * S, 0);
      ctx.lineTo(12 * S, 3.5 * S);
      ctx.closePath(); ctx.fill();
    } else if (key === 'spear') {
      ctx.lineWidth = 3.4 * S;
      ctx.beginPath(); ctx.moveTo(-26 * S, 0); ctx.lineTo(78 * S, 0); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(78 * S, 0); ctx.lineTo(94 * S, -4 * S); ctx.lineTo(94 * S, 4 * S);
      ctx.closePath(); ctx.fill();
    } else if (key === 'sledge') {
      ctx.lineWidth = 4.4 * S;
      ctx.beginPath(); ctx.moveTo(-14 * S, 0); ctx.lineTo(40 * S, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(32 * S, -12 * S, 14 * S, 24 * S);
    } else if (key === 'club') {
      ctx.lineWidth = 7 * S;
      ctx.beginPath(); ctx.moveTo(-6 * S, 0); ctx.lineTo(54 * S, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(58 * S, 0, 10 * S, 0, 7); ctx.fill();
    } else if (key === 'knife') {
      ctx.lineWidth = 3.2 * S;
      ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(26 * S, 0); ctx.stroke();
    } else if (key === 'hammer') {
      ctx.lineWidth = 6.5 * S;
      ctx.beginPath(); ctx.moveTo(-16 * S, 0); ctx.lineTo(64 * S, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(54 * S, -20 * S, 22 * S, 40 * S);
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 2.5 * S;
      ctx.strokeRect(54 * S, -20 * S, 22 * S, 40 * S);
    } else if (key === 'blades') {
      ctx.lineWidth = 3.4 * S;
      ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(46 * S, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(44 * S, -2.5 * S); ctx.lineTo(58 * S, 0); ctx.lineTo(44 * S, 2.5 * S); ctx.closePath(); ctx.fill();
      // second blade in the back hand area
      ctx.rotate(-0.5);
      ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(40 * S, 0); ctx.stroke();
    } else if (key === 'sling') {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(16 * S, 6 * S, 8 * S, 0.4, 3.6);
      ctx.stroke();
    }
    ctx.restore();
    // swing trail during active frames
    if (f.attack && f.attack.phase === 'a' && f.kind === 'player') {
      var w = f.weapon;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = COL.terra;
      ctx.beginPath();
      var cx = f.x, cy = f.y - 52 * S;
      var rr = (w.reach + 14) * S;
      if (w.key === 'spear') {
        ctx.fillRect(f.x + (f.face > 0 ? 8 * S : -rr), cy - 9 * S, rr, 18 * S);
      } else {
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rr, f.face > 0 ? -0.7 : Math.PI + 0.7, f.face > 0 ? 0.7 : Math.PI - 0.7, f.face < 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- HUD ----------
  function drawHUD(ctx, g, i18n) {
    var p = g.player;
    // HP bar
    ctx.save();
    ctx.translate(38, 18);
    ctx.fillStyle = COL.white;
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
    roundRect(ctx, 0, 0, 220, 24, 6); ctx.fill(); ctx.stroke();
    var hpw = Math.max(0, p.hp / p.maxHp) * 212;
    ctx.fillStyle = p.hp < 25 ? (Math.floor(g.t * 6) % 2 ? COL.terra : COL.ochre) : COL.terra;
    if (hpw > 0) { roundRect(ctx, 4, 4, hpw, 16, 4); ctx.fill(); }
    // tiny stick head icon
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-14, 12, 8, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 20); ctx.lineTo(-14, 30); ctx.stroke();
    // weapon tag
    ctx.fillStyle = COL.ink;
    ctx.font = 'bold 13px Verdana';
    ctx.textAlign = 'left';
    ctx.fillText(i18n.weaponName(g.weaponId).toUpperCase(), 4, 42);
    ctx.restore();

    // score + combo
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.ink;
    ctx.font = 'bold 26px Verdana';
    ctx.fillText(String(g.score), AR.W - 22, 38);
    if (g.combo > 0) {
      ctx.fillStyle = COL.terra;
      ctx.font = 'bold 17px Verdana';
      ctx.fillText('x' + C.comboMult(g.combo) + '  ·  ' + g.combo, AR.W - 22, 62);
      var w = 90 * (g.comboT / C.SCORE.comboWindow);
      ctx.fillStyle = COL.terra;
      ctx.fillRect(AR.W - 22 - w, 68, w, 4);
    }
    ctx.restore();

    // wave dots
    var cfg = C.LEVELS[g.level - 1];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.inkSoft;
    ctx.font = 'bold 13px Verdana';
    var label = i18n.t('level') + ' ' + g.level + ' — ' + i18n.levelName(g.level);
    ctx.fillText(label, AR.W / 2, 26);
    var total = cfg.waves.length + 1;
    for (var i = 0; i < total; i++) {
      var dx = AR.W / 2 - (total - 1) * 14 + i * 28;
      var done = g.phase !== 'waves' || i < g.waveIdx;
      var cur = g.phase === 'waves' && i === g.waveIdx;
      if (i === total - 1) {
        // skull-ish boss dot
        ctx.fillStyle = g.phase === 'waves' ? COL.inkSoft : (g.boss && g.boss.dead ? COL.dust : COL.terra);
        ctx.beginPath(); ctx.arc(dx, 44, cur || g.phase !== 'waves' ? 8 : 6, 0, 7); ctx.fill();
        ctx.fillStyle = COL.white;
        ctx.fillRect(dx - 4, 41, 3, 3); ctx.fillRect(dx + 1, 41, 3, 3);
      } else {
        ctx.fillStyle = done ? COL.dust : cur ? COL.terra : COL.inkSoft;
        ctx.beginPath(); ctx.arc(dx, 44, cur ? 7 : 5, 0, 7); ctx.fill();
      }
    }
    ctx.restore();

    // boss bar
    if (g.boss && !g.boss.dead && g.boss.state !== 'enter') {
      var b = g.boss;
      ctx.save();
      var bw = 470, bx = (AR.W - bw) / 2, by = AR.H - 58;
      ctx.fillStyle = COL.white;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
      roundRect(ctx, bx, by, bw, 20, 6); ctx.fill(); ctx.stroke();
      var hpw2 = Math.max(0, b.hp / b.maxHp) * (bw - 8);
      ctx.fillStyle = b.enraged ? COL.ochre : COL.ink;
      if (hpw2 > 0) { roundRect(ctx, bx + 4, by + 4, hpw2, 12, 4); ctx.fill(); }
      ctx.fillStyle = COL.ink;
      ctx.font = 'bold 15px Verdana';
      ctx.textAlign = 'center';
      var nm = i18n.bossName(b.bossIdx).toUpperCase() + '  ·  ' + i18n.bossEpithet(b.bossIdx);
      ctx.fillText(nm, AR.W / 2, by - 8);
      if (b.enraged) {
        ctx.fillStyle = COL.terra;
        ctx.fillText('!!', bx - 18, by + 16);
      }
      ctx.restore();
    }
  }

  function drawBanner(ctx, g, i18n) {
    if (g.bannerT <= 0 || !g.banner) return;
    var k = g.bannerT;
    var a = k > 1.3 ? (1.6 - k) / 0.3 : Math.min(1, k / 0.4);
    var scale = 1 + Math.max(0, k - 1.3) * 1.2;
    var txt = '', sub = '';
    var b = g.banner;
    if (b.kind === 'wave') {
      txt = i18n.fmt('waveBanner', b.val);
    } else if (b.kind === 'bossIncoming') {
      txt = i18n.t('bossIncoming');
      var idx = C.LEVELS[g.level - 1].boss;
      sub = i18n.bossName(idx).toUpperCase() + ' · ' + i18n.bossEpithet(idx);
    } else if (b.kind === 'enrage') {
      var idx2 = C.LEVELS[g.level - 1].boss;
      txt = i18n.fmt('enrage', { name: i18n.bossName(idx2).toUpperCase() });
    } else if (b.kind === 'bossDefeated') {
      txt = i18n.t('bossDefeated');
    }
    ctx.save();
    ctx.translate(AR.W / 2, 200);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.ink;
    ctx.font = 'bold 40px Verdana';
    ctx.fillText(txt, 0, 0);
    if (sub) {
      ctx.fillStyle = COL.terra;
      ctx.font = 'bold 20px Verdana';
      ctx.fillText(sub, 0, 32);
    }
    ctx.strokeStyle = COL.terra; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-130, 12); ctx.lineTo(130, 12);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- main frame ----------
  function render(ctx, g, i18n) {
    ctx.save();
    if (g.shake > 0.2) {
      ctx.translate((Math.random() * 2 - 1) * g.shake, (Math.random() * 2 - 1) * g.shake);
    }
    drawBackground(ctx, g.t);
    drawZones(ctx, g);
    // draw order: drops, enemies, boss, player, projectiles, particles
    drawDrops(ctx, g);
    g.enemies.forEach(function (e) { drawFighter(ctx, e, g); });
    if (g.boss) drawFighter(ctx, g.boss, g);
    if (g.phase !== 'lost' || g.player.stateT < 1.4) drawFighter(ctx, g.player, g);
    drawProjectiles(ctx, g);
    drawParticles(ctx, g);
    drawFloaters(ctx, g);
    ctx.restore();
    if (!g.noHUD) {
      drawHUD(ctx, g, i18n);
      drawBanner(ctx, g, i18n);
    }
    // poster frame
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, AR.W - 6, AR.H - 6);
  }

  // ---------- icons for menus (drawn on small canvases by ui.js) ----------
  function drawWeaponIcon(ctx, id, cx, cy, sc) {
    var w = C.WEAPONS[id];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = COL.ink; ctx.lineCap = 'round';
    if (id === 0) {
      ctx.fillStyle = COL.ink;
      ctx.beginPath(); ctx.arc(-10 * sc, -6 * sc, 7 * sc, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(10 * sc, 6 * sc, 7 * sc, 0, 7); ctx.fill();
      ctx.strokeStyle = COL.terra; ctx.lineWidth = 3 * sc;
      ctx.beginPath(); ctx.moveTo(-2 * sc, -2 * sc); ctx.lineTo(2 * sc, 2 * sc);
      ctx.moveTo(2 * sc, -2 * sc); ctx.lineTo(-2 * sc, 2 * sc);
      ctx.stroke();
    } else if (id === 1) {
      ctx.lineWidth = 5 * sc;
      ctx.beginPath(); ctx.moveTo(-20 * sc, 10 * sc); ctx.lineTo(18 * sc, -12 * sc); ctx.stroke();
      ctx.fillStyle = COL.ochre;
      ctx.beginPath(); ctx.arc(18 * sc, -12 * sc, 5 * sc, 0, 7); ctx.fill();
    } else if (id === 2) {
      ctx.lineWidth = 5 * sc;
      ctx.beginPath(); ctx.moveTo(-20 * sc, 12 * sc); ctx.lineTo(6 * sc, -4 * sc); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(4 * sc, -8 * sc); ctx.lineTo(24 * sc, -16 * sc); ctx.lineTo(27 * sc, -12 * sc);
      ctx.lineTo(8 * sc, 0); ctx.closePath(); ctx.fill();
    } else if (id === 3) {
      ctx.lineWidth = 4 * sc;
      ctx.beginPath(); ctx.moveTo(-26 * sc, 12 * sc); ctx.lineTo(24 * sc, -10 * sc); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(24 * sc, -10 * sc); ctx.lineTo(34 * sc, -14 * sc); ctx.lineTo(29 * sc, -5 * sc);
      ctx.closePath(); ctx.fill();
    } else if (id === 4) {
      ctx.lineWidth = 5 * sc;
      ctx.beginPath(); ctx.moveTo(-22 * sc, 12 * sc); ctx.lineTo(16 * sc, -8 * sc); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.save(); ctx.translate(16 * sc, -8 * sc); ctx.rotate(-0.45);
      ctx.fillRect(-4 * sc, -14 * sc, 9 * sc, 24 * sc);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBossIcon(ctx, idx, cx, cy, sc) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 3.5 * sc; ctx.lineCap = 'round';
    var bob = 0;
    if (idx === 2) cy += 0; // vulture
    // body
    ctx.beginPath();
    ctx.moveTo(0, 22 * sc + bob); ctx.lineTo(0, -6 * sc + bob);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -14 * sc + bob, 7 * sc, 0, 7); ctx.stroke();
    // arms
    ctx.beginPath();
    ctx.moveTo(0, 0 + bob); ctx.lineTo(-12 * sc, 10 * sc + bob);
    ctx.moveTo(0, 0 + bob); ctx.lineTo(12 * sc, 10 * sc + bob);
    ctx.stroke();
    // legs
    ctx.beginPath();
    ctx.moveTo(0, 22 * sc + bob); ctx.lineTo(-9 * sc, 34 * sc + bob);
    ctx.moveTo(0, 22 * sc + bob); ctx.lineTo(9 * sc, 34 * sc + bob);
    ctx.stroke();
    if (idx === 0) { // cactus spikes
      ctx.beginPath();
      ctx.moveTo(-5 * sc, -19 * sc); ctx.lineTo(-8 * sc, -25 * sc);
      ctx.moveTo(5 * sc, -19 * sc); ctx.lineTo(8 * sc, -25 * sc);
      ctx.stroke();
    } else if (idx === 1) { // sidewinder band
      ctx.strokeStyle = COL.terra; ctx.lineWidth = 2.6 * sc;
      ctx.beginPath(); ctx.moveTo(-7 * sc, -15 * sc); ctx.lineTo(7 * sc, -15 * sc); ctx.stroke();
    } else if (idx === 2) { // vulture wings
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 3 * sc;
      ctx.beginPath();
      ctx.moveTo(0, -2 * sc); ctx.quadraticCurveTo(-16 * sc, -14 * sc, -22 * sc, -4 * sc);
      ctx.moveTo(0, -2 * sc); ctx.quadraticCurveTo(16 * sc, -14 * sc, 22 * sc, -4 * sc);
      ctx.stroke();
    } else if (idx === 3) { // titan mass
      ctx.lineWidth = 5 * sc;
      ctx.beginPath();
      ctx.moveTo(0, 2 * sc); ctx.lineTo(16 * sc, -12 * sc);
      ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.fillRect(12 * sc, -20 * sc, 10 * sc, 12 * sc);
    } else if (idx === 4) { // el sol rays
      ctx.strokeStyle = COL.ochre; ctx.lineWidth = 2.2 * sc;
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 10 * sc, -14 * sc + Math.sin(a) * 10 * sc);
        ctx.lineTo(Math.cos(a) * 14 * sc, -14 * sc + Math.sin(a) * 14 * sc);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  globalThis.SS_Render = {
    COL: COL, render: render, drawFighter: drawFighter,
    drawWeaponIcon: drawWeaponIcon, drawBossIcon: drawBossIcon,
    fighterPose: fighterPose, roundRect: roundRect
  };
})();
