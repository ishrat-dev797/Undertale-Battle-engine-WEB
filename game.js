// ============================================================
// YOUR GAME - edit this file to make your own battle.
// The engine (script.js) reads this config; no engine code needed.
// ============================================================

// ============================================================
// PHASE 2 helpers (used by the phase-2 attacks at the bottom of this file)
// ============================================================
// slash = Sans's slash cuts (hit much harder than bones),  orange = damage when the ORANGE soul stands still
const DMG2 = { bone: 4, orb: 3, blaster: 6, slash: 10, orange: 3 }, DMG3 = { bone: 3, orb: 2, blaster: 5, slash: 8, orange: 2 };
const DMG = { ...DMG2 };       // phase 2 hits harder than phase 1 (bones 3 / blasters 5)
// what happens the moment a slash cut LANDS: the screen glitches for a split second (frames / power) and shakes. Set glitch: 0 to turn the glitch off.
const SLASH_FX = { glitch: 7, power: 1.1, shake: 6, shakeFrames: 12 };

// a bone that slides along one wall of the box - used by the gravity-slam attack. wall = the soul's current "floor"
function wallBone(a, wall, size, speed) {
    const r = a.box, th = 14, d = DMG.bone;
    if (wall === "down")  return a.bone({ x: r.right, y: r.bottom - size, w: th, h: size, vx: -speed, damage: d });
    if (wall === "up")    return a.bone({ x: r.left - th, y: r.top, w: th, h: size, vx: speed, damage: d });
    if (wall === "right") return a.bone({ x: r.right - size, y: r.top - th, w: size, h: th, vy: speed, horizontal: true, damage: d });
    return a.bone({ x: r.left, y: r.bottom, w: size, h: th, vy: -speed, horizontal: true, damage: d });
}

// ---- shared pattern helpers (phase 2, 2.5 and 3) ----
const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
};
// SLASH CUT: Sans slashes (a.slash = sound + the slash gif on him), a thin line shows where the cut will land, then it strikes.
// (x1,y1)-(x2,y2) = the cut line, warn = frames of warning, strike = frames it hurts. Stand OFF the line when it strikes.
function cutLine(a, x1, y1, x2, y2, warn = 30, strike = 9, thick = 16) {
    const b = a.spawn({ type: "cut", x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: 1, h: 1, damage: DMG.slash, life: warn + strike + 14, clip: true });
    b.update = () => {                                   // the first frame the cut is "hot": the slash LANDS
        if (b.age !== warn) return;
        a.shake(SLASH_FX.shake, SLASH_FX.shakeFrames); a.camKick(0.03); a.freeze(2); a.pulse(0.6);
        if (SLASH_FX.glitch > 0) a.glitch(SLASH_FX.glitch, SLASH_FX.power);
        for (let i = 0; i < 5; i++) { const t = a.rand(0.35, 0.65); a.particles(lerp(x1, x2, t), lerp(y1, y2, t), 3, { color: "#fff", speed: 4, life: 22 }); }
    };
    b.hits = (p) => b.age >= warn && b.age < warn + strike && distSeg(p.x, p.y, x1, y1, x2, y2) < thick / 2 + p.hit * 0.4;
    b.draw = () => {
        const t = b.age, hot = t >= warn && t < warn + strike;
        ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "#fff";
        if (t < warn) { ctx.globalAlpha = 0.25 + 0.3 * ((t >> 2) % 2); ctx.lineWidth = 2; ctx.setLineDash([10, 8]); }
        else { ctx.globalAlpha = hot ? 1 : Math.max(0, 1 - (t - warn - strike) / 14); ctx.lineWidth = hot ? thick : thick * 0.4; }
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    };
    return b;
}
// a cut through (cx,cy) at angle deg, long enough to cross any box
const cutThrough = (a, cx, cy, deg, warn, strike) => {
    const c = Math.cos(deg * RAD) * 400, s = Math.sin(deg * RAD) * 400;
    return cutLine(a, cx - c, cy - s, cx + c, cy + s, warn, strike);
};
// SPINNING BONE ARM around (cx,cy): len px long, ang0 degrees, spin = degrees per frame at the start, spin2 = how much faster it gets EVERY frame
// (use spinAccel(start, end, frames) to get spin2).  The faster it spins the longer its ghost trail gets, so you can SEE it speeding up.
// This is the attack the ORANGE soul is used for (windmill): the soul has to keep moving while the arms go around.
const spinAccel = (v0, vEnd, frames) => (vEnd - v0) / frames;
function spinArm(a, cx, cy, len, ang0, spin, life, spin2 = 0, inner = 0, grace = 45) {
    const b = a.spawn({ type: "arm", x: cx, y: cy, w: 1, h: 1, damage: DMG.bone, life, clip: true });
    let ang = ang0, v = spin;
    b.update = () => { v += spin2; ang += v; };
    const at = (g, l) => [cx + Math.cos(g * RAD) * inner, cy + Math.sin(g * RAD) * inner, cx + Math.cos(g * RAD) * l, cy + Math.sin(g * RAD) * l];
    b.hits = (p) => { if (b.age < grace) return false; const e = at(ang, len); return distSeg(p.x, p.y, e[0], e[1], e[2], e[3]) < 6 + p.hit * 0.4; };
    b.draw = () => {
        ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "#fff";
        const base = b.age < grace ? 0.3 + 0.2 * ((b.age >> 2) % 2) : 1;
        if (VFX.on && v > 0.7) {                                               // ghost images behind the arm (only look - they don't hurt)
            for (let k = 3; k >= 1; k--) {
                const e = at(ang - v * k * 2.4, len);
                ctx.globalAlpha = base * 0.2 * Math.min(1, (v - 0.7) / 1.2) * (4 - k) / 3; ctx.lineWidth = 9;
                ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); ctx.stroke();
            }
        }
        const e = at(ang, len); ctx.globalAlpha = base; ctx.lineWidth = 11;
        if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 8 + Math.min(10, v * 4); }
        ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); ctx.stroke(); ctx.restore();
    };
    return b;
}
// BONE STABS: bones jut out of the floor (or ceiling) in `cols` of the box's columns after a warning, hold, then retreat
function stabCols(a, fromTop, cols, nCols = 8, frac = 0.78) {
    const r = a.box, cw = r.w / nCols, hh = r.h * frac, hold = 26;
    for (const c of cols) {
        const x = r.left + c * cw;
        a.warn({ x, y: fromTop ? r.top : r.bottom - hh, w: cw, h: hh, frames: 24, color: "#f55", then() {
            const b = a.bone({ x: x + 3, y: fromTop ? r.top - hh : r.bottom, w: cw - 6, h: hh, damage: DMG.bone, life: 8 + hold + 10 });
            b.update = () => {
                const t = b.age, k = t < 8 ? t / 8 : t < 8 + hold ? 1 : 1 - (t - 8 - hold) / 10;
                b.y = fromTop ? r.top - hh + hh * k : r.bottom - hh * k;
            };
        } });
    }
}
const pickCols = (a, n, total) => { const c = []; while (c.length < n) { const v = a.randInt(0, total - 1); if (!c.includes(v)) c.push(v); } return c; };

// a Gaster Blaster whose beam passes exactly through the middle of the box (box center = 320, 280 for a 210-high box)
function clockShot(a, deg, flip, charge) {
    const ang = deg + (flip ? 180 : 0), c = Math.cos(ang * RAD), s = Math.sin(ang * RAD), R = 175;
    a.blaster({ to: [320 - c * R, 280 - s * R], angle: ang, size: 1, arrive: 12, charge, hold: 16, damage: DMG.blaster, shake: 3 });
}

// [frame, [beam angles]] - crosses and X shapes that fire one after the other (angles in degrees)
const CLOCK_PLAN = [
    [0, [0, 60, 120]], [58, [30, 90, 150]], [116, [0, 60, 120]], [170, [30, 90, 150]], [224, [15, 75, 135]],
    [278, [45, 105, 165]], [332, [0, 60, 120]], [384, [30, 90, 150]], [436, [0, 45, 90, 135]]
];

// gravity-slam plan: which wall is the floor, when the slam happens, and the bones [delay after slam, height]
const SLAM_PLAN = [
    { wall: "down",  at: 0,   bones: [[60, 34], [110, 44], [160, 36]] },
    { wall: "right", at: 200, bones: [[60, 40], [104, 34], [132, 34]] },
    { wall: "up",    at: 400, bones: [[60, 36], [108, 46], [160, 34]] },
    { wall: "left",  at: 600, bones: [[60, 44], [96, 34], [122, 34]] }
];

// Phase 2 dialogue: every turn Sans says something NEW (lines are never repeated until all are used up).
// Priority: a milestone line (after N blocked hits) > a line that fits the coming attack > a general line.
const P2_SAY = {
    p2_whirl:     ["my hands have a mind of their own. try not to lose yours.", "pretty, isn't it? shame about the part where it hurts.", "go on. dance."],
    p2_clock:     ["tick tock. your time is up.", "i can hear your heartbeat from here. it's getting faster.", "every second you survive is a favor."],
    p2_snake:     ["follow the path. i dare you.", "see the blue ones? stop. or don't. i'm curious.", "it only gets faster from here."],
    p2_crossfire: ["two of them. one of you.", "they're aiming. you're moving. that's all there is to it.", "squeezed between two blasters. cozy, huh?"],
    p2_slam:      ["gravity's a funny thing. so is the floor.", "heads up. or rather, floors up.", "the ground is wherever i say it is."],
    p2_stopgo:    ["red light. green light. you lose either way.", "stand still. or keep moving. i won't tell you which.", "patience, kid. it's the one thing you can't dodge."],
    p2_squeeze:   ["the walls are closing in. not literally. okay, literally.", "getting a little tight in there, isn't it?", "nowhere left to run. well. a little."],
    p2_rain:      ["bad time, huh? it's raining bones.", "look up. no, wait, don't. ...actually, do.", "just a little rain. made of marrow."],
    p2_slash:     ["watch the lines. then watch your step.", "Dumb_Artist05 worked hard on this one.", "see that? that's me, cutting the distance."],
    p2_crossfan:  ["catch.", "all this and you're still dodging? how rude.", "the corners are a trap. so is the middle."],
    p2_stab:      ["the floor's a little sharp today.", "watch your step. and your ceiling.", "red means 'about to hurt'. you figured that out, right?"],
    p2_windmill:  ["round and round we go.", "keep moving. it won't stop for you.", "orange means go. stop, and it hurts.", "don't get dizzy. it'd be so embarrassing."]
};
const P2_MILESTONE = {       // after this many BLOCKED hits
    1:  ["heh. did that tickle?", "didn't feel a thing."],
    3:  "keep swinging. i've got all day.",
    6:  "you think this is working? ...that's cute.",
    9:  "...tch. the blocks are getting heavier.",
    12: "stop. stop that. ...i'm fine.",
    14: ["...ngh.", "i'm not done. not yet."],
    17: "i'm still standing. barely. so are you."
};
const P2_TAUNTS = [          // fallback when everything above has been used
    "no more tricks.", "let's see you dodge this.", "still standing?", "keep up, kid.",
    "i'm not even tired.", "this one's gonna hurt.", "come on. come ON!", "you can't stop me now."
];
// pick this turn's line (g.vars.said remembers what was already used)
function p2Say(g, atk) {
    const used = g.vars.said || (g.vars.said = []), fresh = (l) => !used.includes(JSON.stringify(l));
    const use = (l) => { used.push(JSON.stringify(l)); return l; };
    if (atk === "p2_windmill" && !g.vars.orangeTold) {         // the first windmill explains the ORANGE soul
        g.vars.orangeTold = true;
        return use(["your soul's about to turn orange.", "stand still and you'll feel it. keep moving."]);
    }
    for (const k of Object.keys(P2_MILESTONE)) if (g.vars.blocked >= +k && fresh(P2_MILESTONE[k])) return use(P2_MILESTONE[k]);
    const mine = P2_SAY[atk].filter(fresh);
    if (mine.length) return use(g.pick(mine));
    const rest = P2_TAUNTS.filter(fresh);
    if (rest.length) return use(g.pick(rest));
    used.length = 0;
    return g.pick(P2_TAUNTS);
}
const P2_ORDER = ["p2_whirl", "p2_slash", "p2_meme1", "p2_clock", "p2_stab", "p2_friend1", "p2_snake", "p2_crossfan", "p2_meme2", "p2_crossfire", "p2_windmill", "p2_slam", "p2_stopgo", "p2_friend2", "p2_meme3", "p2_slash", "p2_squeeze", "p2_rain", "p2_friend3", "p2_stab", "p2_windmill", "p2_crossfan"];

// ============================================================
// DEV-TEAM SLASH (phase 2): a screenshot of one of the engine's dev team (assets/friend profile screenshot*.png) appears BESIDE Sans.
// Sans says something, then slashes it to pieces (3 cuts, glowing cut lines, sparks, the pieces fly apart and fade).
// The slash energy carries over: the same cuts land inside the battle box (dotted warning lines first - stand off the lines).
// friendSlash(imageKey, [line when it appears, line right before the cut]) makes one attack. Add more with new images + lines.
// ============================================================
function splitPoly(poly, px, py, nx, ny) {                 // cut a polygon with a line -> [side A, side B]
    const A = [], Bp = [], d = (p) => (p[0] - px) * nx + (p[1] - py) * ny;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], dp = d(p), dq = d(q);
        (dp >= 0 ? A : Bp).push(p);
        if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq), m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; A.push(m); Bp.push(m); }
    }
    return [A, Bp].filter((s) => s.length >= 3);
}
function friendSlash(key, lines, opt = {}) {
    const CX = opt.x ?? 118, CY = opt.y ?? 122, MAXW = 150, MAXH = 112;
    return {
        box: [250, 170], duration: 480,
        start(a) { a.state.typer = null; a.state.cuts = []; a.state.shards = null; a.state.hit = 0; },
        update(a) {
            const f = a.frame, st = a.state, r = a.box, bx = (r.left + r.right) / 2, by = (r.top + r.bottom) / 2;
            if (f === 2) { a.sound("swoosh"); a.ring(CX, CY, { r1: 90, life: 22, w: 4, color: "#fff" }); a.particles(CX, CY, 14, { color: "#fff", speed: 4, life: 24 }); }
            if (f === 26) st.typer = new Typer(lines[0], { auto: 60, voice: "voice_sans" });
            if (f === 108) st.typer = new Typer(lines[1], { auto: 34, voice: "voice_sans" });
            if (st.typer) st.typer.update();
            if (f > 30 && f < 140 && f % 52 === 40) a.aim(a.rand(r.left, r.right), r.top - 16, 2.2, { damage: DMG.orb });     // something small to dodge while Sans talks
            // the real slash cuts inside the battle box (they land at f = 150 + warn)
            if (f === 150) { a.slash({ dir: -1 }); cutThrough(a, bx + a.rand(-40, 40), by, a.pick([25, 155, 60]), 34, 9); }
            if (f === 160) cutThrough(a, bx + a.rand(-40, 40), by, a.pick([100, 120, 80]), 34, 9);
            // ---- the 3 cuts through the screenshot ----
            [[158, -32], [168, 28], [178, 84]].forEach(([t, ang], i) => {
                if (f !== t) return;
                const o = { x: CX + a.rand(-18, 18), y: CY + a.rand(-12, 12), ang: ang + a.rand(-6, 6) };
                st.cuts.push({ ...o, t0: f });
                a.slash({ dir: -1 }); a.shake(5, 10); a.camKick(0.03); a.freeze(2); a.pulse(0.7); a.glitch(5, 1);
                const c = Math.cos(o.ang * RAD), s = Math.sin(o.ang * RAD);
                for (let k = 0; k < 7; k++) { const u = a.rand(-70, 70); a.particles(o.x + c * u, o.y + s * u, 3, { color: "#fff", speed: 5, life: 24, shape: "line", add: true }); }
            });
            if (f === 188) {                                                          // the screenshot falls apart
                let polys = [[[CX - st.w / 2, CY - st.h / 2], [CX + st.w / 2, CY - st.h / 2], [CX + st.w / 2, CY + st.h / 2], [CX - st.w / 2, CY + st.h / 2]]];
                for (const c of st.cuts) {
                    const nx = -Math.sin(c.ang * RAD), ny = Math.cos(c.ang * RAD), next = [];
                    for (const p of polys) next.push(...splitPoly(p, c.x, c.y, nx, ny));
                    polys = next;
                }
                st.shards = polys.map((p) => {
                    const cx = p.reduce((q, v) => q + v[0], 0) / p.length, cy = p.reduce((q, v) => q + v[1], 0) / p.length;
                    const d = Math.atan2(cy - CY + a.rand(-8, 8), cx - CX + a.rand(-8, 8)), sp = a.rand(2.5, 6);
                    return { p, cx, cy, ox: 0, oy: 0, vx: Math.cos(d) * sp - 1.5, vy: Math.sin(d) * sp - 2, rot: 0, vr: a.rand(-0.12, 0.12), t: 0 };
                });
                a.sound("hit"); a.shake(9, 18); a.flash("#fff", 8, 0.45); a.glitch(8, 1.2); a.aberrate(8, 18); a.camKick(0.04);
                a.ring(CX, CY, { r1: 120, life: 26, w: 6, color: "#fff" });
                a.particles(CX, CY, 40, { color: "#fff", speed: 8, minSpeed: 2, life: 34, shape: "line", add: true });
                a.particles(CX, CY, 20, { color: VFX.mote, speed: 5, life: 40, gravity: 0.12, shrink: true });
            }
            // second volley of slashes in the box
            if (f === 250) { a.slash({ dir: 1 }); cutThrough(a, bx + a.rand(-45, 45), by + a.rand(-20, 20), a.pick([20, 160, 45]), 30, 9); cutThrough(a, bx + a.rand(-45, 45), by, a.pick([110, 90, 135]), 42, 9); }
            if (f === 330) { a.slash({ dir: -1 }); cutThrough(a, bx + a.rand(-45, 45), by + a.rand(-20, 20), a.pick([35, 145, 0]), 26, 9); cutThrough(a, bx, by, 90, 38, 9); }
        },
        draw(c, a) {
            const f = a.frame, st = a.state, img = Assets.get(key);
            if (img) {
                const k = Math.min(MAXW / img.width, MAXH / img.height);
                st.w = img.width * k; st.h = img.height * k;
                const x = CX - st.w / 2, y = CY - st.h / 2;
                if (!st.shards && f > 1) {                                            // the screenshot, hovering next to Sans (it shakes more before the cut)
                    const appear = Math.min(1, f / 18), jit = f > 150 ? 2.5 : 0, bob = Math.sin(f / 14) * 3;
                    c.save(); c.globalAlpha = appear; c.translate(CX + a.rand(-jit, jit), CY + bob + a.rand(-jit, jit)); c.scale(0.6 + 0.4 * appear, 0.6 + 0.4 * appear); c.rotate(-0.05);
                    if (VFX.high) { c.shadowColor = "#fff"; c.shadowBlur = 12; }
                    c.fillStyle = "#fff"; c.fillRect(-st.w / 2 - 4, -st.h / 2 - 4, st.w + 8, st.h + 8);
                    c.shadowBlur = 0; c.drawImage(img, -st.w / 2, -st.h / 2, st.w, st.h);
                    c.restore();
                }
                if (st.shards) {
                    for (const s of st.shards) {
                        s.t++; s.ox += s.vx; s.oy += s.vy; s.vy += 0.16; s.rot += s.vr; s.vx *= 0.985;
                        const al = Math.max(0, 1 - Math.max(0, s.t - 30) / 55);
                        if (al <= 0) continue;
                        c.save(); c.globalAlpha = al;
                        c.translate(s.cx + s.ox, s.cy + s.oy); c.rotate(s.rot); c.translate(-s.cx, -s.cy);
                        c.beginPath(); s.p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
                        c.save(); c.clip();
                        c.fillStyle = "#fff"; c.fillRect(x - 6, y - 6, st.w + 12, st.h + 12);
                        c.drawImage(img, x, y, st.w, st.h); c.restore();
                        c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke();
                        c.restore();
                    }
                }
            }
            for (const cu of st.cuts) {                                                   // the glowing cut lines (flash, then fade)
                const t = f - cu.t0; if (t > 22) continue;
                const cs = Math.cos(cu.ang * RAD), sn = Math.sin(cu.ang * RAD), L = 110 * Math.min(1, t / 3 + 0.2);
                c.save(); c.lineCap = "round"; c.strokeStyle = "#fff";
                if (VFX.high) { c.shadowColor = "#9cf"; c.shadowBlur = 16; }
                for (const [w, al] of [[14, 0.25], [4, 1]]) {
                    c.globalAlpha = (1 - t / 22) * al; c.lineWidth = w * (1 - t / 40);
                    c.beginPath(); c.moveTo(cu.x - cs * L, cu.y - sn * L); c.lineTo(cu.x + cs * L, cu.y + sn * L); c.stroke();
                }
                c.restore();
            }
            if (st.typer && !st.typer.done) drawBubble(st.typer);                         // Sans talking
        }
    };
}
Object.assign(P2_SAY, {
    p2_friend1: ["meet a member of the dev team.", "i'm sure he'll understand.", "heh. you really are a handful."],
    p2_friend2: ["another one of the devs. he's here to watch.", "he built part of this. i'll be gentle.", "this one helped build the engine."],
    p2_friend3: ["the third member of the team.", "he thinks he's safe up there. cute.", "last one. i promise."]
});



// ============================================================
// MEME JUMP-SCARES (phase 2): three attacks that start like a normal calm pattern - then a picture POPS out of nowhere, Sans panics,
// shakes, shouts and SPAMS attacks (all with the usual telegraphs) until he calms down.   (The phase 3 memes are in P3_EVENTS.)
// memeAttack({ img, spot, at (frame it pops), calm(a, f, st, r), spam(a, t, st, r), spamLen, say: [before, during, after] })
// ============================================================
function memeAttack(c) {
    return {
        box: c.box, duration: c.duration,
        start(a) { a.state.typer = null; a.state.n = 0; },
        update(a) {
            const f = a.frame, st = a.state, r = a.box, T0 = c.at + 30, T1 = T0 + c.spamLen;
            if (st.typer) st.typer.update();
            if (f < c.at) c.calm(a, f, st, r);
            if (f === c.at) {
                a.popup({ img: c.img, ...MEME_SPOT[c.spot], h: c.h || 230, frames: c.show || 150 });
                B.enemyShake = 50; st.typer = new Typer(c.say[0], { auto: 42, voice: "voice_sans" });
            }
            if (f === c.at + 80) st.typer = new Typer(c.say[1], { auto: 40, voice: "voice_sans" });
            if (f >= T0 && f < T1) { if (f % 16 === 0) B.enemyShake = 26; c.spam(a, f - T0, st, r); }
            if (f === T1 + 20) st.typer = new Typer(c.say[2], { auto: 50, voice: "voice_sans" });
        },
        draw(ctx, a) { if (a.state.typer && !a.state.typer.done) drawBubble(a.state.typer); }
    };
}
const P2_MEMES = {
    p2_meme1: memeAttack({
        img: "meme1", spot: "right", box: [260, 190], duration: 640, at: 140, spamLen: 220, h: 220,
        say: [["...", "who is THAT?"], ["get out of my fight!"], ["...sorry.", "lost my cool."]],
        calm(a, f, st, r) { if (f % 60 === 20) a.wall(f % 120 === 20 ? "left" : "right", a.rand(0.3, 0.7), 70, 3.2, { damage: DMG.bone }); },
        spam(a, t, st, r) {
            if (t % 40 === 0) stabCols(a, ((t / 40) | 0) % 2 === 0, pickCols(a, 4, 8), 8, 0.8);
            if (t % 20 === 10) a.aim(a.rand(r.left, r.right), r.top - 14, 3.2, { damage: DMG.orb });
        }
    }),
    p2_meme2: memeAttack({
        img: "meme2", spot: "left", box: [240, 200], duration: 660, at: 130, spamLen: 240, h: 240,
        say: [["wait.", "no no no."], ["not him. ANYONE but him."], ["...i hate that guy."]],
        calm(a, f, st, r) { if (f % 34 === 14) a.aim(a.rand(r.left, r.right), r.top - 14, 2.4, { damage: DMG.orb }); },
        spam(a, t, st, r) {
            if (t % 40 === 4) { const ph = a.rand(-160, -20) * RAD; p25Pincer(a, ph); if (((t / 40) | 0) % 2) p25Pincer(a, Math.PI - ph); }
            if (t % 40 === 24) { a.aim(r.left - 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); a.aim(r.right + 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); }
        }
    }),
    p2_meme3: memeAttack({
        img: "meme3", spot: "right", box: [270, 200], duration: 700, at: 120, spamLen: 270, h: 240,
        say: [["...is that...", "...a plush of me?"], ["WHO MADE THAT?!", "it's not even accurate!"], ["...forget you saw that."]],
        calm(a, f, st, r) { if (f % 52 === 20) a.fan({ x: a.rand(r.left, r.right), y: r.top - 20, n: 3, arc: 36, angle: 90, speed: 2.6, damage: DMG.orb }); },
        spam(a, t, st, r) {
            if (t % 32 === 6) { st.gap = clamp((st.gap ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75); a.wall(p25Side(a, ["left", "right", "top", "bottom"][(st.n++) % 4]), st.gap, 56, 4.8, { damage: DMG.bone }); }
            if (t % 96 === 40) p25Pincer(a, a.rand(-160, -20) * RAD);
            if (t === 170) { a.slash({ dir: 1 }); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; cutThrough(a, cx + a.rand(-40, 40), cy, a.pick([30, 150, 60]), 30, 9); }
        }
    })
};
Object.assign(P2_SAY, {
    p2_meme1: ["huh. it's quiet.", "...too quiet."],
    p2_meme2: ["don't blink.", "something feels off."],
    p2_meme3: ["almost there.", "you're doing fine. for now."]
});

// ============================================================
// PHASE 2.5 helpers - the SURVIVAL fight (no turns, no menu, about 52 seconds = two loops of the song).
// The battle box JUMPS around and RESIZES between "segments"; every segment has its own pattern.
// Rules that keep it fair:
//   - the next box shows as a dashed outline P25_GHOST frames before it appears (stand where old + new overlap!)
//   - nothing spawns while the box is still sliding (P25_SETTLE) and leftover bullets are cleared when it jumps
//   - every segment ends with a quiet "tail" so bones / blasters finish before the box moves again
//   - blaster beams are always at least ~45 px wider than the soul's safe lane, and always show their blaster first
// ============================================================
const P25_SETTLE = 30, P25_GHOST = 24;

// walls never spawn right next to the soul: if it sits within 60 px of the edge a wall would come from, the wall comes from the opposite side
function p25Side(a, side) {
    const r = a.box, s = a.soul;
    const d = { left: s.x - r.left, right: r.right - s.x, top: s.y - r.top, bottom: r.bottom - s.y }[side];
    return d < 60 ? { left: "right", right: "left", top: "bottom", bottom: "top" }[side] : side;
}

// the squeeze pattern: bone walls from all four sides (off = where in the side rotation it starts)
const p25Squeeze = (off, speed) => (a, n, s) => {
    if (n % 36) return;
    const i = n / 36 + off;
    s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.2, 0.2), 0.25, 0.75);
    a.wall(p25Side(a, ["left", "right", "top", "bottom"][i % 4]), s.gap, 56, speed, { color: i % 5 === 4 ? "blue" : "white", damage: DMG.bone });
};

// a beam that passes through the middle of the current box. deg 0..179; steep beams always come from above (keeps blasters clear of the HP bar)
function p25Beam(a, deg, flip) {
    const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, R = 140;
    let ang = deg;
    if (Math.sin(deg * RAD) < 0.35 && flip) ang += 180;
    const c = Math.cos(ang * RAD), sn = Math.sin(ang * RAD);
    a.blaster({ to: [cx - c * R, cy - sn * R], angle: ang, size: 0.7, arrive: 12, charge: 20, hold: 14, damage: DMG.blaster, shake: 3 });
}

// two beams that sandwich the soul with a lane between them: stand still (or step out). phi in radians, pointing UP from the soul.
function p25Pincer(a, phi) {
    const s = a.soul, size = 0.8;
    const x = clamp(s.x + Math.cos(phi) * 240, 40, 600), y = clamp(s.y + Math.sin(phi) * 240, 50, 370);
    const base = a.angleTo(x, y), spread = Math.atan(54 * size / Math.hypot(s.x - x, s.y - y)) / RAD;
    for (const k of [-1, 1]) a.blaster({ to: [x, y], angle: base + k * spread, size, arrive: 10, charge: 16, hold: 16, damage: DMG.blaster });
}

// segment: f = length in frames, tail = quiet frames at the end, box = [w, h, centerX, centerY], speed = box slide speed,
//          sway = [ampX, ampY, period] (the box drifts), run(a, n, s) = pattern (n = frames since the box settled, s = scratch)
// The fight lasts TWO loops of the 26.2 s song (3138 frames = 52 s) and builds tension the whole way:
//   d (0 -> 1) = how far you got.  Speeds go up, warnings get shorter, gaps get smaller, and the patterns start to OVERLAP
//   (walls + orbs, cuts + spinning arms ...).  Loop 1 teaches the patterns, loop 2 mixes them.
const P25_LEN = 3138;
const d25 = (a) => clamp(a.frame / P25_LEN, 0, 1);
const P25 = [
    // 1 - bone walls from both sides (warm-up, slow)
    { f: 200, tail: 40, box: [240, 150, 320, 312], run(a, n, s) {
        if (n % 44) return;
        s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75);
        a.wall(p25Side(a, (n / 44) % 2 ? "right" : "left"), s.gap, 60, 3.9, { damage: DMG.bone });
    } },
    // 2 - blaster lanes: two of three lanes fire, one is safe. Rows, then columns, then rows...
    { f: 260, tail: 72, box: [210, 160, 320, 306], run(a, n, s) {
        if (n % 74) return;
        const r = a.box, k = n / 74, rows = k % 2 === 0, fromLeft = k % 4 === 0;
        let safe;
        do { safe = a.randInt(0, 2); } while (safe === s.safe);
        s.safe = safe;
        for (let i = 0; i < 3; i++) {
            if (i === safe) continue;
            const opt = { size: 0.75, arrive: 12, charge: 22, hold: 14, damage: DMG.blaster, shake: 3 };
            if (rows) a.blaster({ ...opt, to: [fromLeft ? r.left - 62 : r.right + 62, r.top + r.h * (2 * i + 1) / 6], angle: fromLeft ? 0 : 180 });
            else a.blaster({ ...opt, to: [r.left + r.w * (2 * i + 1) / 6, r.top - 58], angle: 90 });
        }
    } },
    // 3 - a small box sways while orbs rain on it (the first fans appear)
    { f: 240, tail: 44, box: [170, 150, 200, 305], sway: [58, 0, 240], run(a, n) {
        const r = a.box;
        if (n % 17 === 0) a.aim(a.rand(r.left, r.right), r.top - 16, 3, { damage: DMG.orb });
        if (n % 64 === 32) a.fan({ x: a.rand(r.left, r.right), y: r.top - 20, n: 3, arc: 36, angle: 90, speed: 2.7, damage: DMG.orb });
    } },
    // 4 - BONE STABS from the floor and the ceiling (red strips warn first)
    { f: 220, tail: 44, box: [264, 160, 320, 305], run(a, n, s) {
        if (n % 62) return;
        const k = (s.k = (s.k || 0) + 1);
        stabCols(a, k % 2 === 0, pickCols(a, 4, 8), 8, 0.8);
    } },
    // 5 - HEARTBEAT: two walls close in from both sides at once ("thump"), the safe row jumps up and down on every beat
    { f: 200, tail: 40, box: [230, 150, 320, 312], run(a, n, s) {
        const d = d25(a), v = lerpD(3.9, 4.6, d), beat = 34;
        if (n % beat) return;
        const k = n / beat, gap = k % 2 ? 0.76 : 0.24;
        for (const side of ["left", "right"]) a.wall(side, gap, 54, v, { damage: DMG.bone });
        a.shake(1.5, 4);
    } },
    // 6 - the squeeze: bone walls from all four sides while the box shrinks twice (3 segments, so every jump is telegraphed)
    { f: 150, tail: 24, box: [260, 170, 450, 300], run: p25Squeeze(0, 3.9) },
    { f: 150, tail: 24, box: [210, 150, 400, 305], run: p25Squeeze(1, 4.2) },
    { f: 150, tail: 24, box: [160, 130, 335, 312], run: p25Squeeze(2, 4.5) },
    // 7 - blaster crosses through the middle of the box (rotating by 30 degrees each volley - find the safe wedge)
    { f: 290, tail: 72, box: [180, 170, 320, 303], run(a, n) {
        if (n % 58) return;
        const k = n / 58;
        [[0, 60, 120], [30, 90, 150], [15, 75, 135], [45, 105, 165]][k % 4].forEach((d, i) => p25Beam(a, d, (k + i) % 2));
    } },
    // 8 - WINDMILL (ORANGE soul - keep moving!): two bone arms spin around the middle and keep speeding up; halfway a third arm joins exactly between them
    { f: 280, tail: 40, box: [230, 230, 320, 270], mode: "orange", run(a, n, s) {
        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, life = 280 - 30 - 40, v0 = 0.6, acc = spinAccel(v0, 1.8, life);
        if (n === 0) { spinArm(a, cx, cy, 190, 0, v0, life, acc, 0, 50); spinArm(a, cx, cy, 190, 180, v0, life, acc, 0, 50); }
        if (n === 100) {            // where the first arm is by now (start angle + speed * t + acceleration * t^2 / 2): the new arm goes 90 degrees ahead, at the same speed
            const A = v0 * 100 + 0.5 * acc * 100 * 100;
            spinArm(a, cx, cy, 190, A + 90, v0 + acc * 100, life - 100, acc, 0, 40);
        }
    } },
    // 9 - SLASH CUTS: Sans slashes and two dotted lines mark the cuts; the warning gets shorter every volley
    { f: 260, tail: 44, box: [250, 170, 320, 306], run(a, n, s) {
        if (n % 62) return;
        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, k = (s.k = (s.k || 0) + 1);
        const warn = Math.max(20, 38 - k * 3), base = a.pick([20, 40, 60, 120, 140, 160]);
        a.slash();
        cutThrough(a, cx + a.rand(-45, 45), cy + a.rand(-25, 25), base, warn, 9);
        cutThrough(a, cx + a.rand(-45, 45), cy + a.rand(-25, 25), base + a.pick([-75, 75, 90]), warn + 12, 9);
    } },
    // 10 - FAST zig-zag: a wide, low box and bones at speed 5.8
    { f: 210, tail: 28, box: [330, 120, 320, 328], speed: 0.3, run(a, n) {
        if (n % 17) return;
        const r = a.box, c = "TBTMBTBM"[(n / 17) % 8];
        const put = (y, h) => a.bone({ x: r.right, y, w: 14, h, vx: -5.8, damage: DMG.bone });
        if (c === "T") put(r.top, 62);
        else if (c === "B") put(r.bottom - 62, 62);
        else { put(r.top, 32); put(r.bottom - 32, 32); }
    } },
    // 11 - OVERLOAD: stabs + orbs together in a small box
    { f: 220, tail: 44, box: [230, 150, 320, 312], run(a, n, s) {
        const r = a.box;
        if (n % 58 === 0) stabCols(a, ((s.k = (s.k || 0) + 1) % 2) === 0, pickCols(a, 3, 7), 7, 0.78);
        if (n % 29 === 14) a.aim(a.rand(r.left, r.right), r.top - 14, 3.2, { damage: DMG.orb });
    } },
    // 12 - FINALE: aimed blaster pincers + orbs + slash cuts, then a burst of fast bone walls, the box drifts the whole time
    { f: 308, tail: 66, box: [170, 150, 320, 308], sway: [30, 0, 220], run(a, n, s) {
        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        if (n < 130) {
            if (n % 52 === 0) {
                const ph = a.rand(-160, -20) * RAD;
                p25Pincer(a, ph);
                if ((n / 52) % 2 === 1) p25Pincer(a, Math.PI - ph);
            }
            if (n % 52 === 26) {
                a.aim(r.left - 14, a.rand(r.top, r.bottom), 2.8, { damage: DMG.orb });
                a.aim(r.right + 14, a.rand(r.top, r.bottom), 2.8, { damage: DMG.orb });
            }
        } else {
            const m = n - 130;
            if (m % 72 === 0) { a.slash(); cutThrough(a, cx + a.rand(-30, 30), cy, a.pick([30, 150, 90, 0]), 22, 9); }
            if (m % 24 === 12) {
                const i = (m - 12) / 24;
                s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.25, 0.25), 0.25, 0.75);
                a.wall(p25Side(a, ["left", "top", "right", "bottom"][i % 4]), s.gap, 54, 5.4, { color: i % 6 === 5 ? "blue" : "white", damage: DMG.bone });
            }
        }
    } }
];
let P25_TOTAL = 0;
for (const sg of P25) { sg.start = P25_TOTAL; P25_TOTAL += sg.f; sg.end = P25_TOTAL; }
if (P25_TOTAL !== P25_LEN) console.warn("P25 segments add up to " + P25_TOTAL + " frames, the song loop is " + P25_LEN);
const p25At = (f) => P25.findIndex((sg) => f >= sg.start && f < sg.end);

// ============================================================
// PHASE 3 - the survival: ONE song, 2:32 (song D "the battle finally starts", 145 BPM).  When it ends the fight is over and the cinematic
// FINALE plays (song E "the battle is about to end", 47 s - see the `finale` option of phase 3 at the bottom of this file).
// Same rules as phase 2.5 (dashed outline before every box jump, quiet tail, nothing spawns while the box slides),
// but the patterns are fired ON THE BEAT and the whole fight follows the SONG'S OWN CLOCK (so it can never drift off the music).
// In phase 3 you can press Z ONCE to heal 20 - 50 HP (see P3_HEAL).
// They get harder the further you get (d = 0 .. 1).  If the attacks feel off-beat, change the OFFSET of that song (seconds of its first beat).
// ============================================================
const P3_SONG_D = "audio/music that plays when the battle finally starts.mp3", P3_D_LEN = 151.968;
const P3_SONG_E = "audio/Music that plays when the battle is about to end.mp3", P3_E_LEN = 47.184;
const P3_SONGS = { D: { bpm: 145, offset: 0.205 }, E: { bpm: 110, offset: 0.225 } };
const P3_HEAL = [20, 50];          // the one-time heal on Z: random HP between these two numbers
// the beat clock: t = seconds into the current song (updated every frame by p3_survival)
const P3_CLK = { t: 0, prev: -1, song: "D" };
const p3Idx = (t) => Math.floor((t - P3_SONGS[P3_CLK.song].offset) / (60 / P3_SONGS[P3_CLK.song].bpm));
// true on the frame a beat lands. every = only every Nth beat, shift = which one of them   (the first argument is not needed any more)
const onBeat = (_f, every = 1, shift = 0) => { const b = p3Idx(P3_CLK.t); return b !== p3Idx(P3_CLK.prev) && (((b % every) + every) % every) === shift; };
const lerpD = (lo, hi, d) => lo + (hi - lo) * d;

// ============================================================
// PHASE 3 (reworked): "THE ANIMATION".
// The whole fight is a short film that Sans plays for you - and keeps breaking: a loading bar, a missing texture, a mouse cursor that clicks
// the arena, Ctrl+C / Ctrl+V on his own attacks, a buffering spinner, a window dragged around while it is "Not Responding", stop-motion,
// a video player that PAUSES / REWINDS / FAST-FORWARDS the bullets, a bouncing-ball animation test (with onion-skin ghosts that show
// where it will go), error pop-ups, ... plus three memes that pop out of nowhere and make Sans panic (see P3_EVENTS).
// Everything follows the SONG'S clock (song D, 152 s).  A timeline at the bottom of the screen shows how far into the "video" you are.
//
// HOW TO EDIT:  P3_SEGS = the acts (at = start second inside the song, box, mode, sway, begin/run/draw).  P3_EVENTS = one-shot moments
// (captions, Sans' bubbles, meme jump-scares + the spam that follows).  Rules that keep it fair are the same as in phase 2.5:
// every box jump shows a dashed outline first, nothing spawns while the box slides, every attack has a telegraph and a safe spot.
// ============================================================
// ---- pictures made by code (so no extra files are needed): the purple/black "missing texture" and a Windows-style error window ----
function genTex(w, h, fn) { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); return c.toDataURL("image/png"); }
const TEX_MISSING = genTex(32, 32, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 32, 32); g.fillStyle = "#f0f"; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16); });
const TEX_ERROR = genTex(192, 104, (g, w, h) => {
    g.fillStyle = "#c6c6c6"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = "#404040"; g.fillRect(0, h - 3, w, 3); g.fillRect(w - 3, 0, 3, h);
    g.fillStyle = "#0a246a"; g.fillRect(5, 5, w - 10, 20);
    g.fillStyle = "#fff"; g.font = "bold 14px monospace"; g.fillText("sans.exe", 10, 20);
    g.fillStyle = "#c6c6c6"; g.fillRect(w - 24, 8, 15, 14); g.fillStyle = "#000"; g.fillText("x", w - 20, 20);
    g.fillStyle = "#d00"; g.beginPath(); g.arc(26, 56, 13, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 20px monospace"; g.fillText("x", 20, 63);
    g.fillStyle = "#000"; g.font = "13px monospace"; g.fillText("ERROR: too many", 48, 52); g.fillText("bones.", 48, 68);
    g.fillStyle = "#c6c6c6"; g.fillRect(w / 2 - 24, 82, 48, 17); g.strokeStyle = "#000"; g.lineWidth = 1; g.strokeRect(w / 2 - 24 + 0.5, 82.5, 47, 16);
    g.fillStyle = "#000"; g.fillText("OK", w / 2 - 9, 95);
});

// where the meme pictures pop up (x, y = center). They are drawn BEHIND the box and the bullets, so they never hide an attack.
const MEME_SPOT = {
    left:  { x: 104, y: 130, from: "left",  rot: -8 },
    right: { x: 536, y: 130, from: "right", rot: 8 },
    mid:   { x: 320, y: 112, from: "top",   rot: 0 }
};

// ---- small helpers used by the acts ----
const P3_BEAT = 60 / P3_SONGS.D.bpm, P3_OFF = P3_SONGS.D.offset;
const p3Snap = (t) => P3_OFF + Math.round((t - P3_OFF) / P3_BEAT) * P3_BEAT;           // acts always start exactly on a beat
const p3Cap = (st, text, frames = 170) => { st.cap = { text, t: 0, n: frames }; };      // subtitle in the top-left corner
const p3Say = (st, lines, auto = 55) => { st.typer = new Typer(lines, { auto, voice: "voice_sans" }); };       // Sans' speech bubble
const clock12 = () => { const d = new Date(); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "am" : "pm"}`; };

// a wall of "missing texture" tiles (instead of bones). Same rules as a.wall
function texWall(a, side, gap, gapSize, speed) {
    const r = a.box, T = 22, hor = side === "top" || side === "bottom", span = hor ? r.w : r.h, start = hor ? r.left : r.top;
    const g0 = gap * span - gapSize / 2, g1 = gap * span + gapSize / 2;
    for (let p = 0; p < span; p += T) {
        const mid = p + T / 2;
        if (mid > g0 && mid < g1) continue;
        const o = { img: "missing", w: T, h: T, damage: DMG.bone };
        if (side === "left") a.sprite({ ...o, x: r.left - T, y: start + p, vx: speed });
        else if (side === "right") a.sprite({ ...o, x: r.right, y: start + p, vx: -speed });
        else if (side === "top") a.sprite({ ...o, x: start + p, y: r.top - T, vy: speed });
        else a.sprite({ ...o, x: start + p, y: r.bottom, vy: -speed });
    }
}
// a classic white mouse arrow (tip at x, y)
function drawCursor(c, x, y, k = 1, press = 0) {
    c.save(); c.translate(x, y); c.scale(k * (1 - 0.12 * press), k * (1 - 0.12 * press));
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 17); c.lineTo(4.5, 13); c.lineTo(8, 21); c.lineTo(11, 19.6); c.lineTo(7.6, 12); c.lineTo(13, 12); c.closePath();
    c.fillStyle = "#fff"; c.strokeStyle = "#000"; c.lineWidth = 1.6; c.lineJoin = "round"; c.fill(); c.stroke(); c.restore();
}
// ring of orbs that SHRINKS while it turns (the "buffering" spinner). gap = degrees where the opening is
function spinRing(a, cx, cy, R0, gapDeg, vR, w) {
    const N = 16, step = 360 / N, skip = 2;
    for (let i = skip; i < N; i++) {
        const o = a.orb({ x: cx, y: cy, w: 16, damage: DMG.orb, clip: false });
        o.rr = R0; o.th = gapDeg + i * step; o.spinW = w; o.vR = vR; o.cx = cx; o.cy = cy;       // radius, angle (deg), turn per frame, shrink per frame, center
        const place = () => { o.x = o.cx + Math.cos(o.th * RAD) * o.rr - 8; o.y = o.cy + Math.sin(o.th * RAD) * o.rr - 8; };
        place();
        o.update = () => { o.th += o.spinW; o.rr -= o.vR; if (o.rr < 6) { o.dead = true; return; } place(); };
    }
}
// a bone that moves "on twos": it jumps `dx` pixels every `every` frames (stop-motion)
function stepBone(a, x, y, w, h, every, dx) {
    const b = a.bone({ x, y, w, h, damage: DMG.bone });
    b.every = every; b.dx = dx;
    b.update = () => { if (a.frame % b.every === 0) b.x -= b.dx; };
    return b;
}
// video player: every bullet made through this follows s.ts (1 = play, 0 = pause, -1.1 = rewind, 2 = fast-forward)
const tsBullet = (s) => (b) => { b.clock = s; b.update = () => { const k = b.clock.ts; if (k !== 1) { b.x += b.vx * (k - 1); b.y += b.vy * (k - 1); } }; return b; };
function drawPlayIcon(c, kind, x, y, k = 1) {      // kind: pause | rew | ff | play
    c.save(); c.translate(x, y); c.scale(k, k); c.fillStyle = "#fff";
    if (kind === "pause") { c.fillRect(-12, -14, 9, 28); c.fillRect(3, -14, 9, 28); }
    else {
        const dir = kind === "rew" ? -1 : 1, n = kind === "play" ? 1 : 2;
        for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 24 * dir; c.beginPath(); c.moveTo(o - 11 * dir, -14); c.lineTo(o + 11 * dir, 0); c.lineTo(o - 11 * dir, 14); c.closePath(); c.fill(); }
    }
    c.restore();
}
// bouncing ball physics (one step). r = box rect, b = {x, y, w, h, vx, vy}. Returns "floor" / "wall" when it bounced
function ballStep(b, r) {
    let hit = null;
    b.vy += 0.17; b.x += b.vx; b.y += b.vy;
    if (b.x < r.left) { b.x = r.left; b.vx = Math.abs(b.vx); hit = "wall"; } else if (b.x + b.w > r.right) { b.x = r.right - b.w; b.vx = -Math.abs(b.vx); hit = "wall"; }
    if (b.y + b.h > r.bottom) { b.y = r.bottom - b.h; b.vy = -Math.sqrt(2 * 0.17 * r.h * 0.84); hit = "floor"; } else if (b.y < r.top) { b.y = r.top; b.vy = Math.abs(b.vy); }
    return hit;
}

// ---- what the spam looks like after a meme popped: p3FreakRun runs INSTEAD of the act's own pattern for a few seconds ----
function p3FreakRun(a, st, fr) {
    const r = a.box, t = fr.t;
    if (t % 18 === 0) B.enemyShake = 26;                                                       // Sans is shaking with panic
    if (fr.kind === "blasters") {
        if (t % 36 === 6) { const ph = a.rand(-160, -20) * RAD; p25Pincer(a, ph); if (((t / 36) | 0) % 2) p25Pincer(a, Math.PI - ph); }
        if (t % 36 === 24) { a.aim(r.left - 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); a.aim(r.right + 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); }
    } else if (fr.kind === "stabs") {
        if (t % 40 === 4) stabCols(a, ((t / 40) | 0) % 2 === 0, pickCols(a, 4, 8), 8, 0.8);
        if (t % 22 === 11) a.aim(a.rand(r.left, r.right), r.top - 14, 3.2, { damage: DMG.orb });
    } else if (fr.kind === "orbs") {
        if (t % 15 === 3) { const side = a.pick(["left", "right", "top"]); const x = side === "left" ? r.left - 14 : side === "right" ? r.right + 14 : a.rand(r.left, r.right), y = side === "top" ? r.top - 14 : a.rand(r.top, r.bottom); a.aim(x, y, 3.1, { damage: DMG.orb }); }
        if (t % 60 === 30) a.fan({ x: a.rand(r.left, r.right), y: r.top - 20, n: 5, arc: 60, angle: 90, speed: 2.8, damage: DMG.orb });
    } else {                                                                                    // "walls"
        if (t % 28 === 4) { st.fg = clamp((st.fg ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75); a.wall(p25Side(a, ["left", "top", "right", "bottom"][((t / 28) | 0) % 4]), st.fg, 56, 5, { damage: DMG.bone }); }
        if (t % 84 === 50) p25Pincer(a, a.rand(-160, -20) * RAD);
    }
}

// ============================================================
// THE ACTS.  begin(a, s, st) once when the act starts,  run(a, n, s, d) every frame (n = frames since the box settled, s = scratch, d = 0..1 how far
// into the fight),  draw(ctx, a, s, n, st) drawn in front,  sway = [ampX, ampY, period] or a function (t, s) => [dx, dy]
// ============================================================
const P3_SEGS = [
    // 1 - the film starts: a loading bar. Gentle. (the song is in its quiet intro)
    { at: 0, name: "boot", title: "Loading...", box: [250, 150, 320, 312],
      begin(a, s, st) { p3Cap(st, "* sans presses play.", 120); },
      run(a, n, s) { if (n % 66) return; const k = (s.k = (s.k || 0) + 1); a.wall(k % 2 ? "left" : "right", k % 2 ? 0.35 : 0.65, 70, 3.6, { damage: DMG.bone }); },
      draw(c, a, s, n, st) {
          const k = clamp(st.T / 4.2, 0, 1);
          text(k >= 1 ? "LOADING 100%" : `LOADING ${Math.floor(k * 100)}%`, 14, 40, 14, "#aaa");
          c.save(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.strokeRect(15, 58, 160, 11); c.fillStyle = "#fff"; c.fillRect(18, 61, 154 * k, 5); c.restore();
      } },
    // 2 - MISSING TEXTURE: Sans deleted bone.png, the bones are purple + black squares now (they still hurt). Walls first, then falling columns.
    { at: 4.25, name: "texture", title: "bone.png (missing)", box: [260, 150, 320, 312],
      begin(a, s, st) { p3Cap(st, "* sans deleted bone.png.", 180); a.flash("#f0f", 6, 0.18); },
      run(a, n, s, d) {
          const r = a.box;
          if (onBeat(a.frame, 2)) {
              s.i = (s.i || 0) + 1; s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.32, 0.32), 0.25, 0.75);
              const sides = n < 200 ? ["left", "right"] : ["left", "right", "top", "bottom"];
              texWall(a, p25Side(a, sides[s.i % sides.length]), s.gap, lerpD(64, 56, d), lerpD(4.2, 5.0, d));
          }
          if (n > 240 && onBeat(a.frame, 4, 1)) {
              const x = a.rand(r.left + 16, r.right - 16);
              a.warn({ x: x - 11, y: r.top, w: 22, h: r.h, frames: 22, then() { for (let k = 0; k < 3; k++) a.sprite({ img: "missing", x: x - 11, y: r.top - 24 - 22 * k, w: 22, h: 22, vy: 5.2, ay: 0.2, damage: DMG.bone }); } });
          }
      } },
    // 3 - THE CURSOR: a mouse arrow hovers over a spot of the arena (the ring closes in = about to click), then CLICKS: a burst of orbs flies out of it
    { at: 14.5, name: "cursor", title: "sans is using your mouse", box: [220, 170, 320, 305],
      begin(a, s, st) { p3Cap(st, "* sans found the mouse.", 180); s.cx = 580; s.cy = 120; s.pend = []; s.press = 0; },
      run(a, n, s, d) {
          const r = a.box, sl = a.soul;
          if (n % 50 === 0 || (d > 0.3 && n % 50 === 25 && n > 100)) {
              let x, y, tries = 0;
              do { x = a.rand(r.left + 24, r.right - 24); y = a.rand(r.top + 24, r.bottom - 24); tries++; } while (tries < 20 && Math.hypot(x - sl.x, y - sl.y) < 72);
              s.pend.push({ x, y, t: 0, ang: a.rand(0, 360) });
          }
          for (const p of s.pend) if (++p.t === 30) {
              a.ring({ x: p.x, y: p.y, n: 10, speed: lerpD(2.3, 2.9, d), angle: p.ang, damage: DMG.orb });
              a.shake(2, 6); s.press = 8; Sound.beep(900, 0.03, "square", 0.04);
          }
          s.pend = s.pend.filter((p) => p.t < 40);
          const tg = s.pend.length ? s.pend[s.pend.length - 1] : null;                     // the cursor glides to the newest target
          if (tg) { s.cx += (tg.x - s.cx) * 0.2; s.cy += (tg.y - s.cy) * 0.2; }
          if (s.press > 0) s.press--;
      },
      draw(c, a, s) {
          for (const p of s.pend) if (p.t < 30) { c.save(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.globalAlpha = 0.35 + 0.4 * (p.t / 30); c.beginPath(); c.arc(p.x, p.y, 34 - 26 * (p.t / 30), 0, 7); c.stroke(); c.restore(); }
          drawCursor(c, s.cx, s.cy, 1.3, s.press > 0 ? 1 : 0);
      } },
    // 4 - CTRL+C / CTRL+V: Sans copies his own attack and pastes it again, turned around. Columns -> rows -> columns again.
    { at: 25, name: "copypaste", title: "Ctrl+C  Ctrl+V", box: [220, 160, 320, 306],
      begin(a, s, st) { p3Cap(st, "* sans copied his own attack.", 180); s.chip = null; },
      run(a, n, s, d) {
          const r = a.box, c = n % 198, opt = { size: 0.75, arrive: 12, charge: lerpD(22, 20, d), hold: 14, damage: DMG.blaster, shake: 3 };
          const cols = (safe) => { for (let i = 0; i < 3; i++) if (i !== safe) a.blaster({ ...opt, to: [r.left + r.w * (2 * i + 1) / 6, r.top - 58], angle: 90 }); };
          const rows = (safe, left) => { for (let i = 0; i < 3; i++) if (i !== safe) a.blaster({ ...opt, to: [left ? r.left - 62 : r.right + 62, r.top + r.h * (2 * i + 1) / 6], angle: left ? 0 : 180 }); };
          const other = (v) => { let k; do { k = a.randInt(0, 2); } while (k === v); return k; };
          if (c === 0) s.chip = { k: "C", t: 0 };
          if (c === 20) { s.sa = other(s.sa); cols(s.sa); }
          if (c === 72) { s.chip = { k: "V", t: 0 }; s.sb = other(s.sb); rows(s.sb, ((n / 198) | 0) % 2 === 0); }
          if (c === 124 && d > 0.2) { s.chip = { k: "V", t: 0 }; s.sa = other(s.sa); cols(s.sa); }
          if (s.chip) s.chip.t++;
      },
      draw(c, a, s, n) {
          const ch = s.chip, r = a.box;
          if (ch && ch.t < 70) {                                                           // the key caps
              c.save(); c.globalAlpha = Math.min(1, ch.t / 6) * (1 - Math.max(0, ch.t - 54) / 16);
              let x = 14; for (const [lb, w] of [["CTRL", 54], ["+", 18], [ch.k, 24]]) { if (lb !== "+") { c.fillStyle = "#222"; c.fillRect(x, 78, w, 24); c.strokeStyle = "#fff"; c.lineWidth = 2; c.strokeRect(x + 1, 79, w - 2, 22); } text(lb, x + w / 2, 82, 15, "#fff", "center"); x += w + 6; }
              c.restore();
              c.save(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.globalAlpha = 0.6 * Math.min(1, ch.t / 6) * (1 - Math.max(0, ch.t - 54) / 16); c.setLineDash([7, 5]); c.lineDashOffset = -(n >> 1); c.strokeRect(r.left - 9, r.top - 9, r.w + 18, r.h + 18); c.restore();   // "marching ants"
          }
      } },
    // 5 - BUFFERING: rings of orbs close in on the middle while they spin. Slip through the opening - it turns a little more every ring.
    { at: 35, name: "spinner", title: "Buffering...", box: [230, 230, 320, 270],
      begin(a, s, st) { p3Cap(st, "* buffering...", 170); s.g0 = a.rand(0, 360); },
      run(a, n, s, d) {
          if (n % 56) return;
          const r = a.box, k = (s.k = (s.k || 0) + 1);
          spinRing(a, (r.left + r.right) / 2, (r.top + r.bottom) / 2, 158, s.g0 + k * 50, lerpD(1.55, 1.85, d), 1.1);
      } },
    // 6 - THE WINDOW: the arena is a window ("Not Responding"). Sans drags it around with the mouse and FLINGS it every few seconds (a dashed outline shows where).
    { at: 45, name: "drag", title: "sans.exe (Not Responding)", box: [230, 150, 320, 300], speed: 0.5,
      sway(t, s) {
          s.off = (s.off || 0) + ((s.offT || 0) - (s.off || 0)) * 0.12;
          return [92 * Math.sin(t * 0.027) + 24 * Math.sin(t * 0.05) + s.off, 18 * Math.sin(t * 0.045)];
      },
      begin(a, s, st) { p3Cap(st, "* sans grabs the window.", 180); s.trail = []; s.offT = 0; s.fl = 0; },
      run(a, n, s, d) {
          const r = a.box;
          if (n % 150 === 90) { s.offT = (s.offT ? 0 : (n / 150 | 0) % 2 ? -66 : 66); s.fl = 30; }               // fling: warn for 30 frames (see draw), then the box eases over
          if (onBeat(a.frame, 2)) {
              s.i = (s.i || 0) + 1; s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75);
              a.wall(p25Side(a, ["left", "right", "top", "bottom"][s.i % 4]), s.gap, lerpD(66, 58, d), lerpD(3.8, 4.6, d), { damage: DMG.bone });
          }
          if (onBeat(a.frame, 4, 3)) a.aim(a.rand(r.left, r.right), r.top - 14, 3, { damage: DMG.orb });
          if (s.fl > 0) s.fl--;
      },
      draw(c, a, s, n) {
          const q = inner(B.box);
          if (a.frame % 3 === 0) { s.trail.push({ x: q.left, y: q.top, w: q.w, h: q.h }); if (s.trail.length > 7) s.trail.shift(); }
          c.save(); c.strokeStyle = "#fff"; c.lineWidth = 2;                              // the smeared trail a frozen window leaves behind
          s.trail.forEach((t, i) => { c.globalAlpha = 0.04 + 0.12 * (i / s.trail.length); c.strokeRect(t.x, t.y, t.w, t.h); });
          c.globalAlpha = 0.9; c.fillStyle = "#0a246a"; c.fillRect(q.left - 5, q.top - 25, q.w + 10, 20);       // the title bar
          c.globalAlpha = 1; text("sans.exe (Not Responding)", q.left, q.top - 24, 12, "#fff");
          c.fillStyle = "#c6c6c6"; c.fillRect(q.right - 15, q.top - 22, 14, 14); text("x", q.right - 8, q.top - 24, 12, "#000", "center");
          c.restore();
          drawCursor(c, q.left + 54 + Math.sin(n * 0.2), q.top - 14, 1.2, 1);
          if (s.fl > 0) {                                                                    // where the box will be flung to
              const cx = 320 + (s.offT || 0), w = 230, h = 150;
              c.save(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.setLineDash([8, 6]); c.globalAlpha = 0.45 + 0.35 * Math.sin(n * 0.7);
              c.strokeRect(cx - w / 2 - 3, 300 - h / 2 - 3, w + 6, h + 6); c.restore();
          }
      } },
    // 7 - STOP-MOTION: bones move "on twos" (they jump a few pixels, wait, jump...). Film sprockets + a frame counter frame the screen.
    { at: 55, name: "stopmotion", title: "REC", box: [320, 140, 320, 316], speed: 0.3,
      begin(a, s, st) { p3Cap(st, "* sans animates on twos.", 170); },
      run(a, n, s, d) {
          const r = a.box, v = lerpD(26, 33, d);
          if (onBeat(a.frame, 1)) {
              const ch = "TBTMBTBM"[(s.i = (s.i || 0) + 1) % 8];
              const put = (y, h) => stepBone(a, r.right, y, 14, h, 6, v);
              if (ch === "T") put(r.top, 62); else if (ch === "B") put(r.bottom - 62, 62); else { put(r.top, 32); put(r.bottom - 32, 32); }
          }
          if (onBeat(a.frame, 4, 2)) for (let k = 0; k < 3; k++) {                          // a stepped orb column
              const x = r.left + 40 + k * 110, o = a.orb({ x, y: r.top - 20, damage: DMG.orb }); o.every = 6; o.dy = 20; o.update = () => { if (a.frame % o.every === 0) o.y += o.dy; };
          }
      },
      draw(c, a, s, n, st) {
          const sc = Math.floor(a.frame / 6) * 12;
          c.save(); c.fillStyle = "#fff"; c.globalAlpha = 0.55;
          for (let y = -20 + (sc % 40); y < 480; y += 40) { c.fillRect(6, y, 12, 18); c.fillRect(622, y, 12, 18); }       // sprocket holes
          c.globalAlpha = 1; text("FRAME " + String(Math.floor(a.frame / 6)).padStart(4, "0"), 14, 40, 14, "#ddd");
          if ((a.frame >> 5) % 2) { c.fillStyle = "#f33"; c.beginPath(); c.arc(24, 72, 6, 0, 7); c.fill(); text("REC", 36, 64, 14, "#f66"); }
          c.restore();
      } },
    // 8 - THE VIDEO PLAYER: orb fans fly in... PAUSE (they freeze: plan a path between them), REWIND (they fly back the way they came), then FAST-FORWARD.
    { at: 62, name: "videoctl", title: "video player", box: [260, 150, 320, 312],
      begin(a, s, st) { p3Cap(st, "* sans found the remote.", 180); s.ts = 1; s.icon = null; },
      run(a, n, s, d) {
          const r = a.box, c = n % 184, mk = tsBullet(s), cx = (r.left + r.right) / 2;
          const icon = (kind) => { s.icon = { kind, t: 0 }; Sound.beep(kind === "pause" ? 520 : 760, 0.07, "square", 0.05); };
          if (c === 0) { s.ts = 1; a.fan({ x: cx + a.rand(-30, 30), y: r.top - 20, n: 5, arc: 80, angle: 90, speed: 3, damage: DMG.orb }).forEach(mk); }
          if (c === 14) a.fan({ x: r.left - 24, y: r.top - 22, n: 5, arc: 70, angle: 38, speed: 3, damage: DMG.orb }).forEach(mk);
          if (c === 40) { s.ts = 0; icon("pause"); }
          if (c === 96) { s.ts = -1.1; icon("rew"); }
          if (c === 132) { s.ts = 0; icon("ff"); }                                          // "fast-forward" shows for 18 frames BEFORE it happens
          if (c === 150) s.ts = 2;
          if (c === 176) s.ts = 1;
          if (s.icon) s.icon.t++;
      },
      draw(c, a, s) {
          const ic = s.icon; if (!ic || ic.t > 60) return;
          c.save(); c.globalAlpha = Math.min(1, ic.t / 4) * (1 - Math.max(0, ic.t - 44) / 16) * 0.9;
          c.fillStyle = "#000"; c.beginPath(); c.arc(70, 100, 38, 0, 7); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
          drawPlayIcon(c, ic.kind, 70, 100, 1); c.restore();
      } },
    // 9 - THE QUIET PART (the song drops to nothing). Almost nothing attacks. Sans talks. Then something pops out of nowhere (see P3_EVENTS).
    { at: 72.6, name: "breakdown", title: "...", box: [150, 120, 320, 312], tail: 60,
      run(a, n, s, d) { const r = a.box; if (onBeat(a.frame, 2)) a.aim(a.rand(r.left, r.right), r.top - 14, 2.2, { damage: DMG.orb }); } },
    // 10 - THE DROP / SPAM MODE: Sans is panicking. Blaster pincers, bone stabs, walls and orbs, one after the other.
    { at: 79.5, name: "freakout", title: "!!!", box: [230, 170, 320, 305],
      begin(a, s, st) { p3Cap(st, "* sans is panicking.", 200); a.flash("#fff", 12, 0.5); a.shake(8, 16); a.glitch(8, 1.2); B.enemyShake = 50; },
      run(a, n, s, d) {
          const r = a.box, k = Math.floor(n / 99), c = n % 99;
          if (n % 20 === 0) B.enemyShake = 22;
          if (k % 3 === 0) {
              if (c === 0) { const ph = a.rand(-160, -20) * RAD; p25Pincer(a, ph); if (k % 2) p25Pincer(a, Math.PI - ph); }
              if (c === 50) { a.aim(r.left - 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); a.aim(r.right + 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); }
          } else if (k % 3 === 1) {
              if (c === 0 || c === 50) stabCols(a, c === 0, pickCols(a, 4, 8), 8, 0.8);
              if (c === 25 || c === 75) a.aim(a.rand(r.left, r.right), r.top - 14, 3.2, { damage: DMG.orb });
          } else {
              if (c === 0 || c === 33 || c === 66) { s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75); a.wall(p25Side(a, ["left", "right", "top", "bottom"][(s.w = (s.w || 0) + 1) % 4]), s.gap, 56, 5, { damage: DMG.bone }); }
          }
      } },
    // 11 - GRAVITY: the soul is blue. A blue strip warns, then it is thrown against another wall - jump the bones along the new floor.
    { at: 90, name: "gravity", title: "gravity.exe", box: [250, 200, 320, 296], mode: "blue",
      begin(a, s, st) { p3Cap(st, "* sans turned the gravity around.", 180); },
      run(a, n, s, d) {
          const plan = [{ w: "down", at: 0, b: [[40, 30], [84, 40], [128, 32]] }, { w: "left", at: 150, b: [[44, 36], [86, 30], [118, 38]] },
                        { w: "up", at: 300, b: [[44, 34], [88, 40], [124, 30]] }, { w: "right", at: 450, b: [[44, 38], [84, 30], [114, 36]] }];
          for (const ph of plan) {
              if (ph.at > 0 && n === ph.at - 26) {
                  const r = a.box, w = ph.w, T = 26;
                  const z = w === "down" ? { x: r.left, y: r.bottom - T, w: r.w, h: T } : w === "up" ? { x: r.left, y: r.top, w: r.w, h: T }
                      : w === "left" ? { x: r.left, y: r.top, w: T, h: r.h } : { x: r.right - T, y: r.top, w: T, h: r.h };
                  a.warn({ ...z, frames: 26, color: "#2a8bff", then() { a.clear(); a.slam(w); } });
              }
              for (const [delay, size] of ph.b) if (n === ph.at + delay) wallBone(a, ph.w, size, lerpD(4.7, 5.2, d));
          }
      } },
    // 12 - ERROR SPAM: Windows error pop-ups appear (blue flash first), stay a moment, vanish. (A meme + more tabs: see P3_EVENTS.)
    { at: 100.5, name: "errors", title: "Error", box: [280, 180, 320, 300],
      begin(a, s, st) { p3Cap(st, "* sans opened too many tabs.", 190); s.wins = []; },
      run(a, n, s, d) {
          const r = a.box, st = a.state, sl = a.soul, W_ = 100, H_ = 54;
          s.wins = s.wins.filter((w) => a.frame < w.until);
          if (!onBeat(a.frame, 1)) return;
          const want = (st.boost > 0 ? 2 : 1) + ((s.k = (s.k || 0) + 1) % 4 === 3 ? 1 : 0);
          for (let i = 0; i < want && s.wins.length < 4; i++) {
              let x, y, ok = false;
              for (let tries = 0; tries < 16 && !ok; tries++) {
                  x = a.rand(r.left + 4, r.right - W_ - 4); y = a.rand(r.top + 4, r.bottom - H_ - 4);
                  ok = !(sl.x > x - 26 && sl.x < x + W_ + 26 && sl.y > y - 26 && sl.y < y + H_ + 26) && !s.wins.some((w) => x < w.x + W_ + 14 && x + W_ > w.x - 14 && y < w.y + H_ + 14 && y + H_ > w.y - 14);
              }
              if (!ok) continue;
              const px = x, py = y; s.wins.push({ x: px, y: py, until: a.frame + 70 });
              a.warn({ x: px, y: py, w: W_, h: H_, frames: 22, color: "#6af", then() { Sound.beep(740, 0.05, "square", 0.04); a.sprite({ img: "errwin", x: px, y: py, w: W_, h: H_, damage: DMG.bone, life: 46 }); } });
          }
          if (st.boost > 0) st.boost -= 25;
      } },
    // 13 - BOUNCING BALL (an animator's first test): a ball bounces around the arena. Its "onion skin" ghosts show where it is going to be.
    { at: 111, name: "bounce", title: "bounce_test.anim", box: [270, 200, 320, 296],
      begin(a, s, st) { p3Cap(st, "* sans is testing squash and stretch.", 190); s.balls = []; },
      run(a, n, s, d) {
          const r = a.box, sl = a.soul;
          const add = (fromLeft) => {
              const o = a.orb({ x: fromLeft ? r.left + 4 : r.right - 32, y: r.top + 14, w: 28, damage: DMG.orb }); 
              o.ball = { vx: (fromLeft ? 1 : -1) * lerpD(2.6, 3.2, d), vy: 0, sq: 0 }; o.vx = o.vy = 0;
              o.update = () => { const bb = { x: o.x, y: o.y, w: o.w, h: o.h, vx: o.ball.vx, vy: o.ball.vy }; const hit = ballStep(bb, a.box); o.x = bb.x; o.y = bb.y; o.ball.vx = bb.vx; o.ball.vy = bb.vy; if (hit === "floor") o.ball.sq = 1; else if (hit === "wall") o.ball.sq = 0.6; o.ball.sq *= 0.86; };
              o.draw = () => { const k = o.ball.sq, sx = 1 + 0.4 * k, sy = 1 / sx; ctx.save(); ctx.translate(o.x + 14, o.y + 14); ctx.scale(sx, sy); ctx.fillStyle = "#fff"; if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill(); ctx.restore(); };
              s.balls.push(o);
          };
          if (n === 0) add(sl.x > (r.left + r.right) / 2);
          if (n === 250 && d > 0.15) add(sl.x < (r.left + r.right) / 2);
          if (onBeat(a.frame, 6, 4)) a.wall(a.pick(["left", "right"]), a.rand(0.3, 0.7), 74, 3.4, { damage: DMG.bone });
      },
      draw(c, a, s) {
          const r = a.box;
          c.save(); c.fillStyle = "#fff";
          for (const o of s.balls) {                                                       // onion skin: where the ball will be in 10 / 20 / 30 frames
              if (o.dead) continue;
              const bb = { x: o.x, y: o.y, w: o.w, h: o.h, vx: o.ball.vx, vy: o.ball.vy };
              for (let k = 1; k <= 30; k++) { ballStep(bb, r); if (k % 10 === 0) { c.globalAlpha = 0.34 - 0.09 * (k / 10); c.beginPath(); c.arc(bb.x + 14, bb.y + 14, 14, 0, 7); c.fill(); } }
          }
          c.restore();
      } },
    // 14 - THE TIMELINE SPINS: beams cross the middle of the box (the wedge between them is safe), the camera rocks with every volley
    { at: 121.5, name: "beams", title: "timeline", box: [180, 170, 320, 303],
      begin(a, s, st) { p3Cap(st, "* sans spins the timeline.", 170); },
      run(a, n, s, d) {
          const r = a.box;
          if (onBeat(a.frame, 2)) {
              const k = (s.k = (s.k || 0) + 1);
              [[0, 60, 120], [30, 90, 150], [15, 75, 135], [45, 105, 165]][k % 4].forEach((dg, i) => p25Beam(a, dg, (k + i) % 2));
              a.cam({ rot: k % 2 ? 2.4 : -2.4 }, 14);
          }
          if (onBeat(a.frame, 2, 1) && d > 0.6) a.aim(a.rand(r.left, r.right), r.top - 14, 3, { damage: DMG.orb });
      },
      leave(a) { a.cam({ rot: 0 }, 20); } },
    // 15 - WINDMILL (ORANGE soul - keep moving!) three arms that keep speeding up. A meme pops here (see P3_EVENTS).
    { at: 131, name: "windmill", title: "loop", box: [230, 230, 320, 270], mode: "orange",
      run(a, n, s, d) {
          if (n !== 0) return;
          const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, life = a.state.curLen - 30 - 40;
          for (let i = 0; i < 3; i++) spinArm(a, cx, cy, 190, i * 120, 0.55, life, spinAccel(0.55, 2.3, life), 0, 50);
      } },
    // 16 - THE FINALE: pincers aimed at you + orbs + stabs + fast walls, the box drifts. The meme storm hits here.
    { at: 140.5, name: "final", title: "FINAL CUT", box: [200, 170, 320, 303], sway: [26, 0, 200],
      begin(a, s, st) { p3Cap(st, "* sans is out of patience.", 180); },
      run(a, n, s, d) {
          const r = a.box, c = n % 104, k = Math.floor(n / 104);
          if (k % 2 === 0) {
              if (c === 0) { const ph = a.rand(-160, -20) * RAD; p25Pincer(a, ph); if (k % 4 === 2) p25Pincer(a, Math.PI - ph); }
              if (c === 52) { a.aim(r.left - 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); a.aim(r.right + 14, a.rand(r.top, r.bottom), 3, { damage: DMG.orb }); }
          } else {
              if (c === 0) stabCols(a, true, pickCols(a, 3, 7), 7, 0.78);
              if (c === 40 || c === 80) { s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.25, 0.25), 0.25, 0.75); a.wall(p25Side(a, ["left", "top", "right", "bottom"][(s.w = (s.w || 0) + 1) % 4]), s.gap, 54, 5.2, { damage: DMG.bone }); }
          }
      } },
    // 17 - CODA: the song fades. Nothing attacks.
    { at: 149.3, name: "coda", title: "fin", box: [160, 110, 320, 312], tail: 0, run() { } }
];
const P3 = P3_SEGS.map((s, i, arr) => {
    const start = i === 0 ? 0 : Math.round(p3Snap(s.at) * 60), end = i < arr.length - 1 ? Math.round(p3Snap(arr[i + 1].at) * 60) : Math.round(P3_D_LEN * 60);
    return { ...s, d: i / (arr.length - 1), start, end, f: end - start, tail: s.tail ?? 40 };
});
const P3_TOTAL = P3[P3.length - 1].end;

// ---- one-shot moments, by second INSIDE the song:  say = Sans' bubble, cap = subtitle, meme = [pictures] (see MEME_SPOT), freak = spam kind + frames
//      kind: "blasters" | "stabs" | "orbs" | "walls",  title = browser tab title,  fn(a, st) = your own code ----
const P3_EVENTS = [
    { t: 0.7,   say: ["alright. roll the tape."], auto: 45 },
    { t: 49.5,  say: ["hey. this window's mine now."], auto: 55 },
    { t: 73.4,  say: ["...", "hear that? the song went quiet."], auto: 50 },
    { t: 75.4,  say: ["you know i can read your tab title, right?", "...'not responding'. heh."], auto: 55 },
    { t: 77.45, meme: [{ img: "meme2", spot: "right", h: 250 }], freak: { kind: "blasters", frames: 170 }, say: ["WHAT.", "WHO LET HIM IN?!"], auto: 40, cap: "* something just popped out of nowhere." },
    { t: 105.2, meme: [{ img: "meme1", spot: "left", h: 230 }], say: ["close it. CLOSE IT!"], auto: 50, fn(a, st) { st.boost = 260; } },
    { t: 114.0, say: [() => `it's ${clock12()} for you, right?`, "...go drink some water after this."], auto: 55 },
    { t: 135.0, meme: [{ img: "meme3", spot: "left", h: 250 }], freak: { kind: "orbs", frames: 190 }, say: ["...is that supposed to be me?!", "that's not even the right hoodie!"], auto: 42, cap: "* a plush appears." },
    { t: 145.4, meme: [{ img: "meme1", spot: "left", h: 210 }, { img: "meme2", spot: "right", h: 230 }, { img: "meme3", spot: "mid", h: 200 }], freak: { kind: "walls", frames: 210 }, say: ["ENOUGH!!"], auto: 45, cap: "* sans has had enough." },
    { t: 150.2, cap: "* fin.", say: ["...heh. that's the whole film."], auto: 60 }
];
function p3Event(a, st, ev) {
    if (ev.title) a.pageTitle(ev.title);
    if (ev.cap) p3Cap(st, ev.cap, 170);
    if (ev.say) p3Say(st, ev.say.map((l) => (typeof l === "function" ? l() : l)), ev.auto || 55);
    if (ev.meme) ev.meme.forEach((m, i) => a.after(i * 6, () => a.popup({ img: m.img, ...MEME_SPOT[m.spot], h: m.h || 220, frames: ev.memeFrames || 110 })));
    if (ev.meme) B.enemyShake = 50;
    if (ev.freak) st.freak = { t: 0, n: ev.freak.frames, kind: ev.freak.kind };
    if (ev.fn) ev.fn(a, st);
}


// ============================================================
// PHASE 1 - the opening attack (the "hard one", in the spirit of Sans's last attack in the original fight).
// The box STRETCHES into a long strip and the camera moves with it:
//   A  blue soul: bones from the right (jump the low ones, stay under the hanging ones), the screen rolls a little with every bone
//   B  red soul:  vertical blaster volleys. Every volley is a row of beams with a gap between every two of them - the gaps SHIFT by half a
//      step each time, so you have to slide over. (Every beam is shown 36+ frames before it fires, and the nearest gap is never further than 50 px.)
//   C  the box squeezes together, bone walls from both sides with ONE shared gap, then blaster rows, then vertical beams.
// It hurts (bones P1_DMG.bone, blasters P1_DMG.blaster) but every pattern has a telegraph and a safe spot.
// ============================================================
const P1_DMG = { bone: 5, orb: 4, blaster: 9 };      // phase 1 damage (tuned for 92 HP + the Pie / Candy items)
const p1Col = (a, xs, size = 0.75) => { const r = a.box; for (const x of xs) a.blaster({ to: [x, r.top - 58], angle: 90, size, arrive: 12, charge: 24, hold: 12, damage: P1_DMG.blaster, shake: 3 }); };
const p1Row = (a, side, ys, size = 0.6) => { const r = a.box; for (const y of ys) a.blaster({ to: [side < 0 ? r.left - 62 : r.right + 62, y], angle: side < 0 ? 0 : 180, size, arrive: 12, charge: 24, hold: 12, damage: P1_DMG.blaster, shake: 3 }); };
const P1_BONES = [[90, "low", 34], [138, "ceil", 56], [186, "low", 40], [236, "ceil", 56], [284, "low", 34]];      // [frame, kind, height]
const P1_OPENING = {
    box: [150, 116], mode: "blue", duration: 1090,
    start(a) { a.cam({ zoom: 1.1, focus: [320, 320] }, 14); },
    update(a) {
        const f = a.frame, r = a.box;
        if (f === 30) {                                                                  // the box STRETCHES into a long strip, the camera pulls back
            a.setBox(560, 116, 320, undefined, 0.09); a.shake(4, 24); a.sound("swoosh"); a.cam({ zoom: 0.97, x: 0, y: 0 }, 40); a.pulse(0.8); a.flash("#fff", 10, 0.25);
        }
        for (const [t, kind, h] of P1_BONES) if (f === t) {                              // section A
            const rr = a.box;
            if (kind === "low") a.bone({ x: rr.right, y: rr.bottom - h, w: 14, h, vx: -5, damage: P1_DMG.bone });
            else a.bone({ x: rr.right, y: rr.top, w: 14, h, vx: -5, damage: P1_DMG.bone });
            a.cam({ rot: P1_BONES.findIndex((b) => b[0] === t) % 2 ? 1.6 : -1.6 }, 22);
        }
        if (f === 340) { a.cam({ rot: 0 }, 20); a.setMode("red"); a.flash("#f00", 12, 0.35); a.sound("charge"); a.vring(a.soul.x, a.soul.y, { r1: 70, life: 24, color: "#f33" }); }
        for (let k = 0; k < 5; k++) if (f === 380 + k * 62) {                            // section B: shifting beam grids
            const off = k % 2 ? 50 : 0, xs = [];
            for (let i = 0; i < 5; i++) xs.push(r.left + 50 + off + 100 * i);
            p1Col(a, xs);
            a.cam({ x: -(a.soul.x - 320) * 0.08 }, 20);
        }
        if (f === 700) { a.setBox(340, 116, 320, undefined, 0.12); a.shake(4, 20); a.sound("swoosh"); a.cam({ zoom: 1.1, x: 0, y: 0 }, 40); a.pulse(0.8); }
        [[780, 0.5], [836, 0.25], [892, 0.72]].forEach(([t, g]) => { if (f === t) { a.wall("left", g, 56, 5, { damage: P1_DMG.bone }); a.wall("right", g, 56, 5, { damage: P1_DMG.bone }); } });
        if (f === 960) p1Row(a, -1, [r.top + r.h / 6, r.bottom - r.h / 6]);
        if (f === 1014) { p1Row(a, 1, [r.top + r.h / 6, r.bottom - r.h / 6]); }
        if (f === 1050) { a.cam("reset", 30); }
    },
    end(a) { a.cam("reset", 24); a.flash("#fff", 18, 0.4); }
};

// ============================================================
// PHASE 1 (v0.1.0 rework) - each pattern has a telegraph (flashing lane / dashed warning / long charge) and a safe spot.
// Every attack is wrapped in p1Atk(): a small title fades in at the top of the screen when it starts.
// ============================================================
const P1_COL = "#a77bd9";
const p1Atk = (name, def) => {
    const dr = def.draw;
    return {
        ...def,
        draw(c, a) {
            if (a.frame < 100) { c.save(); c.globalAlpha = Math.min(1, a.frame / 14) * Math.min(1, (100 - a.frame) / 24) * 0.85; text("~ " + name + " ~", 320, 12, 18, P1_COL, "center"); c.restore(); }
            if (dr) dr(c, a);
        }
    };
};
// a beam lane: a flashing strip where the beam WILL be, then the blaster (columns from above / rows from the side)
const p1Lane = (a, x, size = 0.6) => { const r = a.box, bw = 54 * size; a.warn({ x: x - bw / 2, y: r.top, w: bw, h: r.h, frames: 34, color: "#fff" }); p1Col(a, [x], size); };
const p1RowLane = (a, side, y, size = 0.6) => { const r = a.box, bw = 54 * size; a.warn({ x: r.left, y: y - bw / 2, w: r.w, h: bw, frames: 34, color: "#fff" }); p1Row(a, side, [y], size); };
const p1Slots = (a, n) => { const r = a.box, step = r.w / n; return Array.from({ length: n }, (_, i) => r.left + step * (i + 0.5)); };    // n evenly spaced beam positions

const P1_ATTACKS = {
    // 1) RIB CAGE - bone walls from alternating sides with wandering gaps, plus bone spikes that shoot up from the floor (lane shown first)
    p1_ribs: p1Atk("RIB CAGE", {
        box: [230, 150], duration: 470,
        start(a) { a.state.i = 0; a.cam({ zoom: 1.04, focus: [320, 300] }, 30); },
        update(a) {
            const gaps = [0.5, 0.2, 0.8, 0.35, 0.65, 0.5, 0.15, 0.85];
            if (a.every(46, 20)) {
                const i = a.state.i++;
                a.wall(i % 2 ? "right" : "left", gaps[i % gaps.length], 54, 3.2 + Math.min(i, 6) * 0.12, { damage: P1_DMG.bone });
                a.pulse(0.35);
            }
            if (a.every(92, 70)) {
                const r = a.box, x = a.rand(r.left + 18, r.right - 32);
                a.warn({ x, y: r.top, w: 14, h: r.h, frames: 28, color: "#fff", then() { a.bone({ x, y: r.bottom, w: 14, h: 78, vy: -6, damage: P1_DMG.bone }); a.shake(2, 6); } });
            }
        },
        end(a) { a.cam("reset", 20); }
    }),

    // 2) GRAVITY - blue soul. Jump the low bones, duck the hanging ones. Halfway the gravity FLIPS (blue warning strip, then slam)
    p1_hop: p1Atk("GRAVITY", {
        box: [300, 120], mode: "blue", duration: 580,
        start(a) { a.state.flip = false; },
        update(a) {
            const r = a.box, f = a.frame, fl = a.state.flip, sp = 3.6 + Math.min(f / 580, 1) * 1;
            const D = P1_DMG.bone;
            const low = (h, dx = 0) => a.bone({ x: r.right + dx, y: fl ? r.top : r.bottom - h, w: 14, h, vx: -sp, damage: D });
            const high = (h, dx = 0) => a.bone({ x: r.right + dx, y: fl ? r.bottom - h : r.top, w: 14, h, vx: -sp, damage: D });
            const A = { 30: () => low(34), 80: () => low(40), 130: () => { low(34); high(52, 110); }, 190: () => low(40), 215: () => low(34, 70) };
            const B2 = { 350: () => low(34), 400: () => high(52), 450: () => { high(52); low(34, 110); }, 510: () => low(40) };
            const ev = f < 300 ? A[f] : B2[f];
            if (ev) ev();
            if (f === 262) a.warn({ x: r.left, y: r.top, w: r.w, h: 8, frames: 36, color: "#2a8bff" });
            if (f === 300) { a.flash("#2a8bff", 12, 0.35); a.shake(5, 14); a.sound("slam"); a.setMode("blue", "up"); a.state.flip = true; a.vring(a.soul.x, a.soul.y, { r1: 80, life: 22, w: 4, color: "#2a8bff" }); a.float(320, 150, "GRAVITY FLIPPED!", { color: "#2a8bff" }); }
        }
    }),

    // 3) CROSSFIRE - two rotating orb streams (one from above, one from below) weave through each other
    p1_sweep: p1Atk("CROSSFIRE", {
        box: [220, 150], duration: 450,
        update(a) {
            const r = a.box, cx = (r.left + r.right) / 2, f = a.frame;
            if (f >= 24 && f < 390 && a.every(6)) {
                const an = (90 + Math.sin(f / 34) * 56) * RAD;
                a.orb({ x: cx - 7, y: r.top - 30, vx: Math.cos(an) * 2.3, vy: Math.sin(an) * 2.3, w: 14, damage: P1_DMG.orb });
            }
            if (f >= 170 && f < 390 && a.every(9)) {
                const an = (-90 - Math.sin(f / 28) * 56) * RAD;
                a.orb({ x: cx - 7, y: r.bottom + 30, vx: Math.cos(an) * 2.1, vy: Math.sin(an) * 2.1, w: 14, damage: P1_DMG.orb });
            }
            if (f === 170) { a.shake(2, 8); a.vring(cx, r.bottom + 20, { r1: 70, life: 20, color: P1_COL }); }
        }
    }),

    // 4) PRISM - gaster blasters. Lanes flash first; the safe gap shifts every wave, then rows, then a big aimed beam
    p1_beams: p1Atk("PRISM", {
        box: [300, 130], duration: 440,
        start(a) { a.state.safe = 2; },
        update(a) {
            const f = a.frame, r = a.box;
            if (f === 18 || f === 108) {
                const xs = p1Slots(a, 5), safe = a.state.safe;
                xs.forEach((x, i) => { if (i !== safe) p1Lane(a, x); });
                a.state.safe = clamp(safe + (safe <= 1 ? 1 : safe >= 3 ? -1 : (Math.random() < 0.5 ? -1 : 1)), 0, 4);
            }
            if (f === 200) { p1RowLane(a, -1, r.top + r.h / 6); p1RowLane(a, -1, r.bottom - r.h / 6); }
            if (f === 262) { p1RowLane(a, 1, r.top + r.h / 6); p1RowLane(a, 1, r.bottom - r.h / 6); }
            if (f === 330) {
                a.sound("charge");
                a.blaster({ to: [a.rand(110, 530), 64], size: 1, charge: 40, hold: 22, arrive: 14, damage: P1_DMG.blaster, shake: 6 });
                a.blaster({ to: [a.rand(110, 530), 64], size: 0.8, charge: 52, hold: 18, arrive: 14, damage: P1_DMG.blaster, shake: 4 });
            }
        }
    }),

    // 4b) a gentler blaster attack that also teaches beams (used as a breather)
    p1_beams_easy: p1Atk("PRISM", {
        box: [300, 130], duration: 300,
        start(a) { a.state.safe = 2; },
        update(a) {
            if (a.frame === 20 || a.frame === 120) { const xs = p1Slots(a, 4), s = a.state.safe % 4; xs.forEach((x, i) => { if (i !== s) p1Lane(a, x, 0.7); }); a.state.safe = a.randInt(0, 3); }
            if (a.frame === 210) { const r = a.box; p1RowLane(a, -1, r.top + r.h / 2, 0.5); }
        }
    }),

    // 5) COLOR CODE - BLUE bones: stand still. ORANGE bones: keep moving. (A reminder fades in at the start.)
    p1_colors: p1Atk("COLOR CODE", {
        box: [230, 140], duration: 500,
        update(a) {
            const f = a.frame, i = Math.floor(f / 60);
            if (f > 20 && f < 440 && f % 60 === 20) {
                const second = f > 240;
                a.wall(i % 2 ? "right" : "left", 0.5, 0, 3.2 + (second ? 0.6 : 0), { color: i % 2 ? "orange" : "blue", damage: P1_DMG.bone });
                if (second && i % 2 === 0) a.wall("top", 0.5, 0, 3, { color: "orange", damage: P1_DMG.bone });
            }
        },
        draw(c, a) {
            if (a.frame < 120) {
                const r = a.box; c.save(); c.globalAlpha = Math.min(1, a.frame / 10) * Math.min(1, (120 - a.frame) / 20);
                text("BLUE: don't move", 320 - 8, r.top - 40, 16, "#2a8bff", "right"); text("ORANGE: keep moving", 320 + 8, r.top - 40, 16, "#ff9a00", "left"); c.restore();
            }
        }
    }),

    // 6) PINWHEEL - an orange soul inside a spinning arm that speeds up. Stay moving, hug the centre, dodge the orbs
    p1_spin: p1Atk("PINWHEEL", {
        box: [220, 180], at: [320, 312], mode: "orange", duration: 500,
        start(a) { const life = 450, acc = spinAccel(0.5, 2.0, life); spinArm(a, 320, 312, 118, 0, 0.5, life, acc, 26, 55); spinArm(a, 320, 312, 118, 180, 0.5, life, acc, 26, 55); },
        update(a) {
            const r = a.box;
            if (a.every(80, 90)) { const s = a.randInt(0, 3); a.aim(s === 0 ? r.left - 16 : s === 1 ? r.right + 16 : a.rand(r.left, r.right), s > 1 ? (s === 2 ? r.top - 16 : r.bottom + 16) : a.rand(r.top, r.bottom), 2.2, { damage: P1_DMG.orb }); }
        }
    }),

    // 7) GAUNTLET - the finale of phase 1: columns, the box SQUEEZES, walls with one shared gap, then rows + columns together
    p1_gauntlet: p1Atk("GAUNTLET", {
        box: [280, 140], duration: 640,
        start(a) { a.state.safe = 1; },
        update(a) {
            const f = a.frame, r = a.box;
            if (f === 20) { const xs = p1Slots(a, 5); xs.forEach((x, i) => { if (i !== 1) p1Lane(a, x, 0.55); }); }
            if (f === 150) { a.setBox(170, 130, 320, undefined, 0.12); a.shake(4, 16); a.sound("swoosh"); a.pulse(0.8); a.cam({ zoom: 1.08, focus: [320, 310] }, 24); }
            [[190, 0.5], [250, 0.25], [310, 0.75]].forEach(([t, g]) => { if (f === t) { const rr = a.box; a.wall("left", g, 54, 4.6, { damage: P1_DMG.bone }); a.wall("right", g, 54, 4.6, { damage: P1_DMG.bone }); a.vring(rr.left + rr.w / 2, rr.top + rr.h / 2, { r1: 90, life: 18, color: P1_COL }); } });
            if (f === 380) { a.setBox(300, 130, 320, undefined, 0.12); a.shake(4, 16); a.sound("swoosh"); a.cam({ zoom: 1.02, focus: [320, 310] }, 30); }
            if (f === 430) { const rr = a.box; p1RowLane(a, -1, rr.top + rr.h / 5, 0.5); p1RowLane(a, -1, rr.bottom - rr.h / 5, 0.5); }
            if (f === 500) { const rr = a.box, xs = p1Slots(a, 5); xs.forEach((x, i) => { if (i !== 3) p1Lane(a, x, 0.55); }); p1RowLane(a, 1, rr.top + rr.h / 2, 0.45); }
            if (f === 600) a.cam("reset", 24);
        },
        end(a) { a.cam("reset", 20); }
    })
};

const Game = {
    title: "UT battle engine",

    music: "audio/placeholder battle music.mp3",     // your battle music (any mp3/ogg/wav)
    musicAfterFirstAttack: false,                      // (old) true = silent fight until the first attack ends. Now the music starts with Sans's first line in the opening instead
    flashAfterFirstAttack: true,                       // the screen flashes (white-out + shockwave) when the first attack of phase 1 is over
    enemyFirst: true,                                  // phase 1: Sans attacks first (the opening attack), then the menu appears
    // ============================================================
    // MENUS  (title screen + pause menu) - everything here is optional
    // ============================================================
    // menu  = title screen.   pause = pause menu.   Both take:
    //   items: [ { label, run(m), page, at, hint, show() } ]   YOUR entries. run(m) runs code, page: "name" opens a page from `pages`, at = position in the list (0 = top)
    //   pages: { name: { title, lines: [ "centered text", ["LEFT", "right"] ], items: [ rows ] } }   your own screens (credits, help, cheats...)
    //   hide:  ["options", "controls", "restart", "quit"]   remove built-in entries.      startLabel / resumeLabel / title: rename things
    // m (given to run): m.g (battle helper, pause menu only), m.close(), m.openPage(name), m.notify(text), m.sound(name), m.start(), m.restart(), m.toTitle()
    // A row inside a page can also be an option:  { label: "GORE", val: () => "ON", change(d) { ... } }  (left / right changes it)
    menu: {
        color: "#4b1a86", mote: "#a77bd9", sub: "A small UT battle engine by Dumb_Artist05",     // title screen look (set  gate: false  to skip the title screen)
        items: [{ label: "CREDITS", page: "credits", at: 1, hint: "Who made this." }],
        pages: {
            credits: { title: "CREDITS", lines: [["ENGINE", "Dumb_Artist05"], ["VERSION", "v0.1.0"], "", "Edit game.js to make your own fight!"] }
        }
    },
    pause: {
        title: "PAUSED",
        items: [
            { label: "CREDITS", page: "credits", at: 2 }
            // { label: "HEAL ME", run(m) { m.g.heal(20); m.notify("+20 HP"); m.close(); } },
        ],
        pages: {}          // (the title screen's pages are available here too)
    },
    controls: null,        // replace the CONTROLS page lines:  [["KEY", "what it does"], ...]   (null = default list)
    watermark: { show: true },     // the small "Dumb_Artist's UT Battle engine" text in the bottom-left corner of the battle (you may remove it if you like)

    // ============================================================
    // GAME OVER SCREEN (cinematic: colour drains, the soul cracks and shatters, the theme plays, GAME OVER drops in, the enemy says his last words)
    // ============================================================
    // quotes: array (one per death, loops) or  (deaths, g) => [ ... ].   Press Z while it plays to skip ahead.   music: false = silence
    gameOver: {
        title: "GAME OVER", color: "#e0143c", counter: true, titleKey: true,     // counter = "ATTEMPT #n"   titleKey = X quits to the title screen
        music: "audio/Game Over Theme Undertale.mp4", volume: 0.6, speaker: "Sans",
        quotes: (n, g) => g.phase >= 3
            ? ["...", "this isn't over.", "i can do this all day.", "get up."]
            : g.phase === 2
                ? ["heh. did that hurt?", "your turn is over.", "you can't dodge forever.", "don't blink."]
                : ["i'm not mad. just... disappointed.", "heh. that's one.", "don't give up. ...or do.", "you're gonna have to try harder than that.", "get up. we're not done yet."]
    },

    // ============================================================
    // PATTERNS - reusable pieces of attacks. Call them inside any attack with   a.pattern("name", { options })
    // ============================================================
    patterns: {
        // a row of falling bones:  a.pattern("boneRain", { n: 6, speed: 3 })
        boneRain(a, o) {
            const r = a.box, n = o.n || 6, step = r.w / n;
            for (let i = 0; i < n; i++) a.bone({ x: r.left + step * i + a.rand(0, step - 14), y: r.top - 50, w: 14, h: o.h || 40, vy: o.speed || 3, damage: o.damage ?? 5 });
        },
        // blasters on both sides of the box:  a.pattern("sideBlasters", { size: 0.7 })
        sideBlasters(a, o) {
            const r = a.box, s = o.size ?? 0.7;
            a.blaster({ to: [r.left - 62, a.rand(r.top, r.bottom)], angle: 0, size: s, damage: o.damage ?? 9 });
            a.blaster({ to: [r.right + 62, a.rand(r.top, r.bottom)], angle: 180, size: s, damage: o.damage ?? 9 });
        }
    },

    // ---------- Look ----------
    // level: "off" | "low" | "high"   (players can press V to switch)
    //   low  = soft gradient at the bottom + small sparks      high = low + motes, glow, soul trail, vignette
    // color: the bottom gradient color
    vfx: { level: "high", color: "#ffffff" },

    // ---------- Optional cinematic intro ----------
    // enabled: false  -> no intro, goes straight to the battle.   Players can hold X to skip.
    // Scene keys: wait, title+sub, text, image, fade, bg, flash, shake, sfx, music, fn  (see README)
    cinematic: {
        enabled: false,                                // (the new in-battle opening below replaces this old title-card intro)
        skippable: true,
        scenes: [
            { wait: 40 },
            { title: "UT battle engine", sub: "A small UT battle engine by Dumb_Artist05", frames: 170 },
            { text: ["* The corridor is silent.", "* But something is waiting at the end of it."], size: 30 },
            { fade: "out", frames: 40 },
            { flash: true, shake: [6, 24], sfx: "hit" },
            { wait: 30 }
        ]
    },

    // ---------- PHASE 1 OPENING (in-battle cinematic: cinema bars, camera moves, Sans fading in out of the dark) ----------
    // Same step keys as the phase cutscenes + cam: {zoom, x, y, rot, focus:[px,py], frames}, bars, uiIn, soul: [x, y], title / sub, kick, freeze, ring...
    // The music starts when Sans starts talking (step key  music: "next"). Players can hold X to skip.
    opening: {
        skippable: true,
        steps: [
            { bars: true, barsFrames: 80, cam: { zoom: 1.1, x: 0, y: 0, frames: 1 }, sfx: "thump", wait: 80 },
            { text: ["* The corridor is silent.", "* But something is waiting at the end of it."], auto: 70, speed: 3 },
            { sfx: "riser", dark: 0, fadeEnemy: 1, frames: 150, wait: 150,            // Sans fades in while the camera pulls back from a close-up
              fn(g) { g.cam({ zoom: 1.2, focus: [320, 150] }, 1); g.after(2, () => g.cam({ zoom: 1.02, focus: [320, 160] }, 230)); } },
            { sfx: "thump", music: "next", say: ["so.", "you came all this way."], auto: 50 },       // the battle music starts HERE, when the dialogue starts
            { wait: 40 },
            { say: ["heh. alright.", "let's see what you've got."], auto: 50, cam: { zoom: 1.12, focus: [320, 130], frames: 90 } },
            { sfx: "charge", soul: [320, 330], cam: { zoom: 1.2, focus: [320, 300], frames: 70 }, wait: 70 },
            { sfx: "blasterFire", flash: true, shake: [10, 20], glitch: 8, aberrate: [10, 30], freeze: 4, soul: false, uiIn: 20, kick: 0.05, pulse: 1,
              cam: { zoom: 0.95, x: 0, y: 0, frames: 6 }, ring: [320, 330, { r1: 200, life: 30, w: 6, color: "#fff" }], wait: 16 },
            { cam: { zoom: 1, frames: 24 }, bars: false, barsFrames: 40, title: "SANS", sub: "* blocks the way!", wait: 90 }
        ]
    },

    // ---------- Your own files ----------
    // images: { name: "path" }  or  { name: { src: "path", crop: [x, y, w, h] } }  (crop = 0..1 fractions)
    // sounds: { name: "path" }  then play with a.sound("name") / g.sound("name")
    // Default names you can override: soul, bone, blaster0..blaster5, and sounds blasterCharge, blasterFire, drain, dialogue, voice_sans
    images: {
        // mybullet: "assets/my_bullet.png"
        friend1: "assets/friend profile screenshot.png",      // the dev team (see friendSlash)
        friend2: "assets/friend profile screenshot2.png",
        friend3: "assets/friend profile screenshot3.png",
        meme1: "assets/meme1.png",                           // the 3 memes that pop out of nowhere (phase 2 + phase 3) - see Popups / MEME_SPOT / P3_EVENTS
        meme2: "assets/meme2.png",
        meme3: "assets/meme3.png",
        missing: TEX_MISSING,                                // pictures made by code (phase 3): the purple/black "missing texture" + the error window
        errwin: TEX_ERROR
    },
    // slash: { opacity: 0.6, frames: 56, dist: 150 }   // look of Sans's slash gif (a.slash()); see Slash in script.js for every option
    sounds: {
        drain: "sfx/health drain.wav",
        blasterFire: "sfx/Gaster blaster fire.wav",
        blasterCharge: "sfx/Gaster blaster charge.wav",
        hurt: "sfx/health drain.wav",                              // the soul takes damage
        hit: "sfx/undertale-attack-hit-sound-effect.mp3",          // your attack lands
        enemySlash: "sfx/enemy slash.mp3",                         // Sans slashes (a.slash())
        heal: "sfx/heal.mp3"                                       // items, g.heal(), the phase heal and the Z heal in phase 3
    },

    // your own variables (available as g.vars / a.vars, reset every battle)
    vars: { taunts: 0 },

    // ORANGE soul (attack option  mode: "orange"  or  a.setMode("orange")): the soul has to keep moving.
    // Standing still for `grace` frames hurts (60 = 1 second), then again every second until you move. `damage` follows the phase (DMG.orange).
    // A single attack can override both with  idleDamage / idleGrace.
    orange: { grace: 20, get damage() { return DMG.orange; } },

    player: { name: "CHARA", lv: 20, maxHp: 92, atk: 8, def: 2, gold: 0, exp: 0 },

    enemy: {
        name: "Sans",
        hp: 100,
        def: 0,
        exp: 1,
        gold: 0,
        sprite: "battle sprites/sans battle sprite.gif",   // .png or animated .gif. Remove this line for a placeholder skull
        voice: "voice_sans",                                // typing sound of the speech bubble (a name from sounds)
        dodges: 7,                                         // PHASE 1: Sans dodges your first 8 attacks, the 9th one hits and ends the phase
        intro: "* Sans rattles into view!",
        flavor: ["* Sans is rattling.", "* You smell old bones.", "* The air feels dusty."],
        check: ["* Sans - ATK 1 DEF 1", "* Just a lazy skeleton."],
        acts: [
            // spare:true -> makes the enemy sparable (Mercy > Spare then works)
            { name: "Joke",  text: ["* You told a bone-headed joke.", "* Sans seems amused."], spare: true },
            // run(g) can do anything. If it returns text, that text is shown instead of "text".
            {
                name: "Taunt",
                text: ["* You insulted Sans's femur.", "* Sans completely ignored you."],
                run(g) {
                    g.vars.taunts++;
                    g.flash("#f00", 12);
                    if (g.vars.taunts >= 3) return ["* Sans is starting to get annoyed.", "* He seems to be preparing something..."];
                }
            }
        ]
    },

    items: [
        { name: "Pie",   heal: 60, text: "* You ate the Pie.\n* HP fully restored." },
        { name: "Candy", heal: 30, text: "* You ate the Candy.\n* HP +30." },
        { name: "Dumb_Artist05", heal: 92, text: "* You ate the Dumb_Artist05.\n* Aura. Full HP restored." },
        { name: "Fried Chicken", heal: 80, text: "* You ate the Double Combo Bucket of Fried Chicken.\n* Mcdonalds SUCKS. HP +80." },
        { name: "Pepsi", heal: 15, text: "* You drank the Pepsi.\n* mmm... refreshing!. +15 HP" }
    ],

    // ---------- Hooks (all optional). g = script helper, see README ----------
    onStart(g)          { if (g.phase === 1) g.vfxColor("#4b1a86", "#a77bd9"); },     // new fight: purple gradient again
    onPhaseStart(g, n)  {
        if (n === 2) g.vfxColor("#8a1020", "#ff6a5a");                                  // phase 2: red gradient
        if (n === 3) g.vfxColor("#d01030", "#ffd0d0");                                  // phase 2.5: brighter red
        if (n === 4) g.vfxColor("#5a0818", "#ff3050");                                  // phase 3: dark blood red
        Object.assign(DMG, n === 4 ? DMG3 : DMG2);                                      // phase 3 is 4 minutes long, so it hits a bit softer
    },
    onTurnStart(g, n)   { if (n >= 4) g.setFlavor("* Sans is getting tired."); },
    onTurnEnd(g, n)     { },
    onHurt(g, dmg)      { return dmg; },          // return a number to change the damage taken
    onAct(g, act)       { },
    onItem(g, item)     { },
    onWin(g, kind)      { },                      // kind: "kill" | "spare" | "flee"
    onGameOver(g)       { },

    // ---------- Attacks ----------
    // "a" is the attack helper:
    //   a.frame  a.every(n, off)  a.box {left,top,right,bottom,w,h}  a.soul {x,y}  a.vars
    //   a.bone({x,y,w,h,vx,vy,ax,ay,color,damage,horizontal})        color: white | blue | orange
    //   a.orb({x,y,vx,vy})   a.aim(x,y,speed)   a.ring({n,speed,x,y})   a.fan({n,arc,x,y,speed})
    //   a.wall(side, gap 0..1, gapSize px, speed, {color})              side: left|right|top|bottom
    //   a.sprite({img:"key", x,y,w,h,vx,vy,rot,spin})                   your own picture as a bullet
    //   a.blaster({to:[x,y], angle, size, hold, color})                 Gaster Blaster (angle in degrees: 0 = right, 90 = down)
    //   a.setBox(w,h)  a.setMode("red"|"blue")  a.flash(color,frames)  a.shake(amt,frames)  a.sound(name)  a.after(frames, fn)
    //   a.rand(a,b)  a.randInt(a,b)  a.pick(array)
    // Optional attack fields: box [w,h], mode, duration, start(a), update(a), end(a), draw(ctx, a)
    // mode: "red" (move freely) or "blue" (gravity, UP to jump)
    attacks: {
        p1_opening: P1_OPENING,

        ...P1_ATTACKS,                                 // the 7 phase 1 attacks (see P1_ATTACKS above)

        // ---------- YOUR OWN ATTACK (not used by any turn yet: add  { say: "...", attack: "myAttack" }  to `turns` to try it) ----------
        myAttack: {
            box: [220, 150],             // box size [w, h]  (optional  at: [centerX, centerY]  moves it)
            mode: "red",                 // "red" | "blue" | "orange"
            duration: 360,               // frames (60 = 1 second)
            start(a) { a.state.n = 0; },
            update(a) {
                if (a.every(90, 20)) a.pattern("boneRain", { n: 6, speed: 3 });          // a pattern from `patterns` above
                if (a.every(120, 60)) a.pattern("sideBlasters");
            },
            end(a) { }
        },

        // Example: your own bullet picture. Add  images: { mybullet: "assets/my_bullet.png" }  above first.
        // spinningStars: {
        //     box: [220, 150], duration: 300,
        //     update(a) { if (a.every(20)) a.sprite({ img: "mybullet", x: a.box.right, y: a.rand(a.box.top, a.box.bottom), w: 24, h: 24, vx: -3, spin: 8 }); }
        // }
    },

    // Enemy turns, in order (they loop). "say" is optional speech.
    // You can also make turns a function for smarter behavior:  turns: (n, g) => ({ say: "...", attack: g.hp < 30 ? "blasters" : "boneWave" })
    turns: [
        { say: "...ready?",                                     attack: "p1_opening" },
        { say: "heh. warm-up.",                                 attack: "p1_ribs" },
        { say: "gravity's a funny thing.",                      attack: "p1_hop" },
        { say: "see the colors? blue... stand. orange... go.",  attack: "p1_colors" },
        { say: "keep your eyes up.",                            attack: "p1_sweep" },
        { say: "this one's gonna light you up.",                attack: "p1_beams" },
        { say: "you're still standing? huh.",                   attack: "p1_spin" },
        { say: "ok. no more warm-ups.",                         attack: "p1_gauntlet" },
        { say: "last one. ...i think.",                         attack: "p1_beams" }
    ],

    // ============================================================
    // PHASES  - when the enemy HP reaches 0 the next phase starts (like Undertale: Last Breath).
    // Order: HP 0  ->  "cutscene" (phase 1.5)  ->  next phase with its own HP, sprite, music, attacks and turns.
    // Everything not listed in a phase is inherited from the game above (acts, items, attacks...).
    // Add more objects to this list for phase 3, 4...      Dying inside a phase restarts that phase (checkpoints: false = restart everything).
    // ============================================================
    phases: [
        {
            hp: 1.001,                                 // Sans had 1 HP in phase 1.5 and gained 0.001 HP. Your hits don't hurt him anyway - he BLOCKS them
            heal: 10,                                  // HP the player gets back when the phase starts
            enemyFirst: true,                          // the enemy attacks right away instead of waiting for your move
            music: "audio/The Slaughter Continues - Remastered (phase 2 battle).mp3",
            tilt: { max: 6, chance: 0.4, warn: 28, hold: [150, 260] },       // the camera sometimes tilts mid-attack (OPTIONS > CAMERA can turn it off)
            mercySlash: { delay: 60 },                 // 1 second after phase 2 starts Sans SLASHES the MERCY button to pieces (3 options left)
            intro: "* The air feels heavy.",
            enemy: {
                dodges: 0,
                interrupt: { remaining: 7, damage: () => Math.round(DMG.slash * 0.6),      // from 7 blocks left: a slash every 3 s during YOUR turn, faster + random as blocks run out (table = INT_TABLE in script.js)
                            
                             say: ["too slow.", "no breaks.", "you think i'll wait?", "hey. eyes up.", "don't just stand there."] },     // near the end Sans may slash during YOUR turn (never kills)
                blocks: [15, 20],                       // phase 2: every hit is "BLOCKED". After 15 to 20 blocks (random) phase 2.5 starts
                sprite: "battle sprites/last-breath-sans-phase2.gif",
                flavor: ["* Sans is panting.", "* The air is crackling.", "* Sans's eye is glowing."],
                check: ["* Sans - ATK 1 DEF 2", "* HP 1.001. ...your attacks keep getting blocked."],
                acts: [
                    { name: "Breathe", text: ["* You steady your breathing.", "* HP +10."], run(g) { g.heal(10); } }
                ]
            },

            // ---------- Phase 1.5 cutscene ----------
            // Steps run in order. Keys can be mixed inside one step:
            //   wait / frames (duration)   say: "bubble text" or [lines]   text: "narration" or [lines]   auto: frames per line
            //   music: "path" | null | "next" (= this phase's music)   loop: false   sfx: "name"   shake: [amount, frames]
            //   flash: true | "#color"   hit: true (enemy shakes)   dark: 0..1 (dim screen)   fadeEnemy: 0..1   sprite: "next"
            //   particles: [x, y, count, {color, speed, life}]   ui: true (show the battle box + HUD)   fn(g) { your code }
            // The player can hold X to skip it.   (about 25 seconds - the length of the cutscene song)
            // The song (26.2 s) now starts right after the final hit, goes quiet while Sans talks, gets LOUD when the narration starts
            // (8.5 s in) and ends with the phase 2 sprite slamming in.  If you change a wait/auto below, re-check that timing.
            cutscene: [
                { music: null, hit: true, flash: true, shake: [8, 24], freeze: 4, bars: true, barsFrames: 60, cam: { zoom: 1.08, focus: [320, 130], frames: 150 }, wait: 150 },     // the final hit lands, silence
                { music: "audio/But He Refused To Give Up (phase 1.5 cutscene).mp3", loop: false, say: "...", auto: 50 },
                { say: ["heh.", "you actually did it."], auto: 55, cam: { zoom: 1.14, focus: [320, 128], frames: 150 } },
                { dark: 0.85, fadeEnemy: 0.4, frames: 60, cam: { zoom: 1.26, focus: [320, 125], rot: -2, frames: 280 }, wait: 296 },                              // the room goes dark (the song gets loud here)
                { text: ["* Sans slumps to the ground.", "* ...but he refuses to give up.", "* A light flickers in his eye."], auto: 70 },
                { wait: 90 },
                { say: ["...i can't stop here.", "not after everything.", "no more holding back."], auto: 60 },
                { wait: 155 },
                { dark: 0, frames: 20, flash: "#fff", shake: [12, 50], glitch: 10, sprite: "next", fadeEnemy: 1, sfx: "blasterFire", slash: { dir: 1 },
                  particles: [320, 150, 40, { color: "#fff", speed: 7, life: 50 }], wait: 200,
                  cam: { zoom: 0.93, rot: 0, x: 0, y: 0, frames: 5 }, freeze: 5, aberrate: [14, 40], kick: 0.06, pulse: 1, ring: [320, 140, { r1: 260, life: 46, w: 8, color: "#ff3050" }],
                  fn(g) { g.after(10, () => g.cam({ zoom: 1 }, 40)); g.after(150, () => g.bars(false, 50)); } },    // phase 2 sprite slams in - and slashes
                { say: ["now.", "You thought this was a normal battle? \n Heh too late to realize what you've done."], auto: 55 },
                { music: "next", wait: 40 }                                                         // phase 2 music starts
            ],

            // ---------- Phase 2 attacks (harder + faster + new patterns) ----------
            attacks: {
                // Twin hands shoot sweeping streams of orbs that cross over the box.
                p2_whirl: {
                    box: [260, 220], duration: 480,
                    update(a) {
                        // spacing between orbs is now ~38px (was 17px = a solid wall), the streams are slower and each sweep has room to slip behind it
                        if (!a.every(14)) return;
                        for (const [x, off] of [[250, 0], [390, Math.PI]]) {
                            const ang = (90 + 48 * Math.sin(a.frame * 0.026 + off)) * RAD;
                            a.orb({ x: x - 8, y: 132, vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5, damage: DMG.orb });
                        }
                    }
                },

                // the 3 meme jump-scare attacks (see memeAttack)
                ...P2_MEMES,

                // Sans slashes: dotted lines show where the cuts land. Every cut makes him slash (the gif drifts right, then left, then right...).
                p2_friend1: friendSlash("friend1", ["oh? is that the dev team?", "hold still. this won't take long."]),
                p2_friend2: friendSlash("friend2", ["another dev. he came to watch.", "hold still. this won't take long."]),
                p2_friend3: friendSlash("friend3", ["the last dev. still smiling.", "hold still. this won't take long."]),

                p2_slash: {
                    box: [250, 170], duration: 540,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        if (!a.every(78, 8)) return;
                        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, st = a.state, k = st.n++;
                        const warn = Math.max(26, 40 - k * 2);
                        a.slash();
                        const base = a.pick([20, 35, 55, 125, 145, 160]);
                        cutThrough(a, cx + a.rand(-45, 45), cy + a.rand(-25, 25), base, warn, 9);
                        if (k % 2 === 1) cutThrough(a, cx + a.rand(-45, 45), cy + a.rand(-25, 25), base + a.pick([-70, 70, 90]), warn + 14, 9);
                    }
                },

                // Bone Fans: two fans of orbs from the box corners, from opposite corners one after another.
                p2_crossfan: {
                    box: [250, 190], duration: 520,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        if (!a.every(46, 6)) return;
                        const r = a.box, st = a.state, k = st.n++, left = k % 2 === 0;
                        const x = left ? r.left - 24 : r.right + 24, y = k % 4 < 2 ? r.top - 24 : r.bottom + 24;
                        const toward = a.angleTo((r.left + r.right) / 2, (r.top + r.bottom) / 2);
                        const n = 6, spread = 90;
                        for (let i = 0; i < n; i++) {
                            const ang = toward + ((i / (n - 1)) - 0.5) * spread * RAD + (k % 3 === 2 ? (spread / (n - 1)) * 0.5 * RAD : 0);
                            a.orb({ x: x - 8, y: y - 8, vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5, damage: DMG.orb });
                        }
                    }
                },

                // Bone Stabs: red strips flash, then bones jut out of the floor / ceiling there. Find the safe columns.
                p2_stab: {
                    box: [264, 160], duration: 520,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        if (!a.every(64, 4)) return;
                        const k = a.state.n++;
                        stabCols(a, k % 2 === 1, pickCols(a, 4, 8), 8, 0.8);
                    }
                },

                // Windmill: three bone arms spin around the middle of the box, faster and faster. Circle around with them - and don't stop (orange soul).
                // ORANGE soul: you have to keep MOVING (stand still and you take damage). The arms start slow and get faster and faster.
                p2_windmill: {
                    box: [230, 230], mode: "orange", duration: 540,
                    update(a) {
                        if (a.frame !== 0) return;
                        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
                        for (let i = 0; i < 3; i++) spinArm(a, cx, cy, 190, i * 120, 0.5, 600, spinAccel(0.5, 2.1, 540), 0, 60);
                    }
                },

                // Judgement Clock: blasters surround the box and fire beams through its center - crosses, then X shapes, then in-between angles.
                p2_clock: {
                    box: [210, 210], duration: 520,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        for (const [f, degs] of CLOCK_PLAN) {
                            if (a.frame !== f) continue;
                            degs.forEach((d, i) => clockShot(a, d, (a.state.n + i) % 2, 20));
                            a.state.n++;
                        }
                    }
                },

                // Serpent Corridor: a wavy tunnel of bones that speeds up. Now and then a BLUE bar crosses it: stop for a moment!
                p2_snake: {
                    box: [300, 190], duration: 520,
                    start(a) { a.state.ph = 0; a.state.n = 0; },
                    update(a) {
                        const r = a.box, st = a.state;
                        st.ph += 0.05 + 0.016 * Math.min(1, a.frame / 520);
                        if (!a.every(13)) return;
                        const gc = (r.top + r.bottom) / 2 + 46 * Math.sin(st.ph), gap = 62;
                        const topH = gc - gap / 2 - r.top, botY = gc + gap / 2;
                        a.bone({ x: r.right, y: r.top, w: 14, h: topH, vx: -4.4, damage: DMG.bone });
                        a.bone({ x: r.right, y: botY, w: 14, h: r.bottom - botY, vx: -4.4, damage: DMG.bone });
                        if (++st.n % 8 === 0) a.bone({ x: r.right + 20, y: r.top, w: 10, h: r.h, vx: -4.4, color: "blue", damage: DMG.bone });
                    }
                },

                // Double Threat: blasters take aim at you - overlapping beams require movement. Every 2nd volley is a pincer from both sides.
                p2_crossfire: {
                    box: [220, 170], duration: 480,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        if (!a.every(56, 6)) return;
                        const s = a.soul, size = 0.8, lane = -14, st = a.state;
                        const volley = (phi) => {
                            const x = clamp(s.x + Math.cos(phi) * 250, 40, 600), y = clamp(s.y + Math.sin(phi) * 250, 50, 440);
                            const base = a.angleTo(x, y), spread = Math.atan((54 * size + lane) / Math.hypot(s.x - x, s.y - y)) / RAD;
                            for (const k of [-1, 1]) a.blaster({ to: [x, y], angle: base + k * spread, size, arrive: 10, charge: 16, hold: 16, damage: DMG.blaster });
                        };
                        const phi = a.rand(0, Math.PI * 2);
                        volley(phi);
                        if (++st.n % 2 === 0) volley(phi + Math.PI);
                    }
                },

                // Gravity Slam: the soul is thrown against every wall in turn (blue strip = warning). Jump the bones along the new floor!
                p2_slam: {
                    box: [260, 220], mode: "blue", duration: 820, noTilt: true,
                    update(a) {
                        for (const ph of SLAM_PLAN) {
                            if (ph.at > 0 && a.frame === ph.at - 26) {
                                const r = a.box, w = ph.wall, T = 26;
                                const z = w === "down" ? { x: r.left, y: r.bottom - T, w: r.w, h: T } : w === "up" ? { x: r.left, y: r.top, w: r.w, h: T }
                                    : w === "left" ? { x: r.left, y: r.top, w: T, h: r.h } : { x: r.right - T, y: r.top, w: T, h: r.h };
                                a.warn({ ...z, frames: 26, color: "#2a8bff", then() { a.clear(); a.slam(w); } });
                            }
                            for (const [delay, size] of ph.bones) if (a.frame === ph.at + delay) wallBone(a, ph.wall, size, 4.6);
                        }
                    }
                },

                // Stop & Go: full-width walls - BLUE ones from the left (stand still), ORANGE ones from the right (keep moving), plus falling orbs.
                p2_stopgo: {
                    box: [240, 170], duration: 480,
                    start(a) { a.state.n = 0; },
                    update(a) {
                        const st = a.state;
                        if (a.every(46)) { st.n++; a.wall(st.n % 2 ? "left" : "right", 0.5, 0, 3.8, { color: st.n % 2 ? "blue" : "orange", damage: DMG.bone }); }
                        if (a.every(70, 20)) a.fan({ x: a.rand(250, 390), y: 150, n: 3, arc: 30, angle: 90, speed: 2.4, damage: DMG.orb });
                        if (a.every(92, 30)) a.wall(st.n % 2 ? "top" : "bottom", a.rand(0.2, 0.8), 56, 3.2, { damage: DMG.bone });
                    }
                },

                // Squeeze: bone walls from all four sides while the box closes in on you.
                p2_squeeze: {
                    box: [290, 190], duration: 540,
                    start(a) { a.state.gap = 0.5; a.state.n = 0; },
                    update(a) {
                        const st = a.state;
                        if (a.frame === 150) { a.setBox(220, 160); a.shake(3, 10); }
                        if (a.frame === 300) { a.setBox(160, 140); a.shake(3, 10); }
                        if (!a.every(27)) return;
                        st.n++;
                        st.gap = clamp(st.gap + a.rand(-0.3, 0.3), 0.2, 0.8);
                        const side = ["left", "right", "top", "bottom"][st.n % 4];
                        a.wall(side, st.gap, 40, a.frame < 300 ? 4 : 4.8, { color: st.n % 5 === 0 ? "blue" : "white", damage: DMG.bone });
                    }
                },

                // Bad Time Rain (blue soul): bones fall from the ceiling after a red warning, and bones slide along the floor.
                p2_rain: {
                    box: [320, 190], mode: "blue", duration: 560,
                    start(a) { a.state.xs = []; },
                    update(a) {
                        const r = a.box, st = a.state;
                        if (a.every(15)) {
                            let x, tries = 0;
                            do { x = a.rand(r.left + 12, r.right - 12); tries++; } while (tries < 12 && st.xs.some((o) => a.frame - o.f < 34 && Math.abs(o.x - x) < 46));
                            st.xs.push({ x, f: a.frame });
                            a.warn({ x: x - 7, y: r.top, w: 14, h: r.h, frames: 22, then() { a.bone({ x: x - 6, y: r.top - 60, w: 12, h: 60, vy: 5, ay: 0.2, damage: DMG.bone }); } });
                        }
                        if (a.every(110, 50)) a.bone({ x: r.right, y: r.bottom - 32, w: 14, h: 32, vx: -4.6, damage: DMG.bone });
                    }
                }
            },

            // Phase 2 turns: a fixed opening order, then random attacks (never the same one twice in a row).
            turns: (n, g) => {
                const atk = n < P2_ORDER.length ? P2_ORDER[n] : g.pick(P2_ORDER.filter((x) => x !== g.vars.lastAtk && !x.includes("meme")));
                g.vars.lastAtk = atk;
                return { say: p2Say(g, atk), attack: atk };
            }
        },

        // ============================================================
        // PHASE 2.5 - SURVIVAL. No turns, no menu: just survive until the timer runs out (~41 s).
        // When phase 2's HP hits 0: 1.5 s of silence -> flash, new sprite, new music, the fight starts.
        // Survive it and: white flash -> Sans turns to dust -> the music fades -> "Thanks for playing!"
        // ============================================================
        {
            survival: "p25_survival",                  // name of the attack that IS this phase (see attacks below)
            heal: 30,                                  // you can't use items in a survival phase, so you get a little HP back
            skippable: false,                          // the 1.5 s delay can't be skipped by holding X
            tilt: { max: 9, warn: 28, first: [300, 480], every: [420, 780], hold: [170, 300] },
            music: "audio/The slaughter continues but faster (phase 2.5).mp3",
            enemy: { sprite: "battle sprites/last-breath-phase2.5.png", dodges: 0 },
            // the "Thanks for playing!" scene, then (glitchAt = frames after the ending starts; text is fully visible at 480):
            // 1 s later the screen glitches -> black -> 2 s later phase 3 appears instantly
            ending: { text: "Thanks for playing!", musicFade: 330, glitchAt: 540, glitchFor: 26, blackFor: 120 },
            cutscene: [
                { music: null, hit: true, flash: true, shake: [8, 24], freeze: 4, bars: true, barsFrames: 30, cam: { zoom: 1.12, focus: [320, 125], frames: 90 }, wait: 90 },    // the last hit lands... silence, the camera creeps in
                { sfx: "thump", dark: 0.7, frames: 24, cam: { zoom: 1.3, focus: [320, 120], rot: 2, frames: 50 }, wait: 50 },                                               // a heartbeat, the room darkens
                { sfx: "blasterFire", shake: [12, 30], dark: 0, frames: 4, glitch: 12, aberrate: [12, 40], kick: 0.06, pulse: 1,
                  cam: { zoom: 0.94, rot: 0, x: 0, y: 0, frames: 5 }, ring: [320, 140, { r1: 280, life: 50, w: 9, color: "#fff" }],
                  particles: [320, 140, 40, { color: "#fff", speed: 7, life: 50 }],
                  fn(g) { g.flash("#fff", 26, 0.9); g.freeze(5); g.after(8, () => g.cam({ zoom: 1 }, 40)); g.after(60, () => g.bars(false, 50)); } }       // new sprite + music start right after this flash
            ],
            attacks: {
                p25_survival: {
                    box: [P25[0].box[0], P25[0].box[1]], at: [P25[0].box[2], P25[0].box[3]], duration: P25_TOTAL,
                    start(a) { a.state.i = -1; a.state.seg = {}; },
                    update(a) {
                        const f = a.frame, st = a.state, i = p25At(f);
                        if (i < 0) return;
                        const sg = P25[i], t = f - sg.start;
                        if (st.i !== i) {                                 // a new segment: the box jumps, leftovers vanish
                            st.i = i; st.seg = {};
                            if (i > 0) { a.clear(); a.setBox(...sg.box, sg.speed); a.shake(3, 8); a.sound("swoosh"); }
                            if (sg.mode) a.setMode(sg.mode); else if (i > 0) a.setMode("red");      // a segment can bring its own soul mode (windmill = orange)
                        }
                        if (sg.sway) {
                            const k = Math.sin(t * 2 * Math.PI / sg.sway[2]);
                            a.setBox(sg.box[0], sg.box[1], sg.box[2] + sg.sway[0] * k, sg.box[3] + sg.sway[1] * k, sg.speed);
                        }
                        if (t >= P25_SETTLE && t < sg.f - sg.tail) sg.run(a, t - P25_SETTLE, st.seg);
                    },
                    // dashed outline of the NEXT box, shown shortly before the box jumps
                    draw(ctx, a) {
                        const i = p25At(a.frame);
                        if (i < 0 || i >= P25.length - 1 || a.frame < P25[i].end - P25_GHOST) return;
                        const nx = P25[i + 1].box, q = boxRect(nx[0], nx[1], nx[2], nx[3]);
                        ctx.save();
                        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(a.frame * 0.6);
                        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
                        ctx.strokeRect(q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3);
                        ctx.restore();
                    }
                }
            }
        },

        // ============================================================
        // PHASE 3 - the rebirth + a 4 minute survival.
        // black -> Sans (phase 3 sprite) in the normal battle scene -> box, HUD and buttons fade away -> music + dialogue ->
        // the buttons come back and BREAK one by one on the beat -> 2.5 s -> flash -> full HP, the 4 minute fight starts.
        // ============================================================
        {
            survival: "p3_survival",
            heal: 0,                                   // you get FULL HP when the fight starts (see rebirth)
            skippable: false,
            tilt: { max: 11, warn: 28, first: [700, 1000], every: [560, 900], hold: [200, 330] },
            music: null,                               // no song of its own: the rebirth plays the 3 intro songs, p3_survival plays songs D and E
            enemy: { sprite: "battle sprites/last-breath sans phase 3.jpg", dodges: 0 },
            rebirth: {
                hold: 60,                              // frames the normal battle scene is shown before it fades
                fade: 150,                             // box + buttons + HUD fade away (only Sans stays)
                musicTalk: "audio/music that plays when phase 3 dialogue starts.mp3",                    talkLen: 12.54,
                musicAfter: "audio/music that plays after phase 3 dialogue is over (after the music ends).mp3", afterLen: 11.48,
                musicBreak: "audio/music that plays when the buttons start breaking.mp3",                breakLen: 16.24,
                musicWait: 90,                         // song 1 starts, then this many frames until the dialogue (the text ends right when the song does)
                text: [                                // written at the center of the screen, just below Sans
                    "you made it all the way here.",
                    "so i'll stop pretending.",
                    "no more turns. no more menus.",
                    "no more fighting back, either.",
                    "from here on... you only survive."
                ],
                auto: 70,                              // frames each line stays after it is typed
                breakAt: [6.52, 8.18, 9.84, 11.49],    // seconds INSIDE the "buttons break" song: each one lands on a strong beat of that song
                calm: 150                              // backup timer only: the flash + the fight start when that song ENDS
            },
            // ---------- the cinematic ending (plays when song D ends, i.e. after the 2:32 fight) ----------
            // Times are SECONDS INSIDE song E (47 s): 3.5 / 7.9 = its two big drum hits (the screen cracks), 12.25 = the DROP (the boom),
            // 16.6 ... 29.7 = soft beats, 38.4 = final white-out, 40.6 = the title appears, 43 = the music fades.   Hold X = skip.
            finale: {
                music: P3_SONG_E, volume: 0.6,
                say: ["...heh.", "you made it to the end.", "i've got nothing left. ...not one more attack.", "go on. you earned it."],
                sayAt: 1.0, sayAuto: 60,
                thumps: [3.5, 7.9], boom: 12.25, pulses: [16.6, 18.8, 21.0, 23.2, 29.7, 31.9], last: 38.4, title: 40.6, fadeAt: 42,
                text: "", sub: "", restart: false,              // (no "Thanks for playing!" any more: the ending video plays instead - see  outro  below)
                outro: true, outroAt: 44,                       // second INSIDE song E when the OUTRO starts (the music is faded out by then)
                vfx: { color: "#ffb870", mote: "#fff3d6" }
            },
            attacks: {
                p3_survival: {
                    box: [P3[0].box[0], P3[0].box[1]], at: [P3[0].box[2], P3[0].box[3]], duration: P3_TOTAL + 900,
                    start(a) {
                        const st = a.state;
                        st.i = -1; st.seg = {}; st.T = 0; st.healFx = null; st.ev = 0; st.cap = null; st.typer = null; st.freak = null; st.boost = 0;
                        P3_CLK.t = 0; P3_CLK.prev = -1; P3_CLK.song = "D";
                        // the fight IS song D: when it ends (2:32) the fight is over and the finale plays
                        a.music(P3_SONG_D, { loop: false, onEnd() { a.finish(); } });
                    },
                    update(a) {
                        const st = a.state, mt = Engine.musicTime();
                        // the fight's clock = the song's clock (falls back to the frame clock if the song can't play)
                        P3_CLK.prev = P3_CLK.t; P3_CLK.song = "D";
                        if (onBeat(a.frame, 2)) a.pulse(0.28);                                  // the background breathes with the music
                        P3_CLK.t = mt >= 0 ? mt : P3_CLK.t + 1 / 60;
                        st.T = mt >= 0 ? mt : st.T + 1 / 60;
                        if (mt < 0 && st.T > P3_D_LEN + 1) { a.finish(); return; }
                        // PRESS Z: ONE heal for the whole phase, random 20 - 50 HP. (Not used up if your HP is already full.)
                        if (st.healFx) st.healFx.t++;
                        if (!a.vars.p3Healed && a.frame > 0 && Input.confirm()) {
                            if (a.hp >= a.maxHp) st.healFx = { t: 0, n: 0 };
                            else {
                                const want = a.randInt(P3_HEAL[0], P3_HEAL[1]), got = Math.min(want, a.maxHp - a.hp);
                                a.vars.p3Healed = true;
                                a.heal(want);                                              // plays the heal sound
                                st.healFx = { t: 0, n: got };
                                a.particles(a.soul.x, a.soul.y, 22, { color: "#3f3", speed: 3.2, life: 44, gravity: -0.04 });
                                a.flash("#0f0", 12, 0.18);
                            }
                        }
                        const F = st.F = Math.floor(st.T * 60);
                        let i = P3.length - 1; while (i > 0 && F < P3[i].start) i--;
                        const sg = P3[i], t = F - sg.start;
                        if (st.i !== i) {                                                   // a new act: the box jumps, leftovers vanish
                            const prev = P3[st.i];
                            if (prev && prev.leave) call("act leave", prev.leave, null, a);
                            st.i = i; st.seg = {}; st.curLen = sg.f;
                            if (i > 0) { a.clear(); a.setBox(...sg.box, sg.speed); a.shake(3, 8); a.sound("swoosh"); }
                            if (sg.mode === "blue") a.setMode("blue", "down"); else if (sg.mode) a.setMode(sg.mode); else if (i > 0) a.setMode("red");
                            if (sg.title) a.pageTitle(sg.title + " - UT battle engine");          // 4th wall: the browser tab changes with every act
                            if (sg.begin) call("act begin", sg.begin, null, a, st.seg, st);
                        }
                        if (sg.sway) {
                            const sw = typeof sg.sway === "function" ? sg.sway(t, st.seg) : (() => { const k = Math.sin(t * 2 * Math.PI / sg.sway[2]); return [sg.sway[0] * k, sg.sway[1] * k]; })();
                            a.setBox(sg.box[0], sg.box[1], sg.box[2] + sw[0], sg.box[3] + sw[1], sg.speed);
                        }
                        // one-shot moments (Sans' bubbles, subtitles, memes)
                        while (st.ev < P3_EVENTS.length && st.T >= P3_EVENTS[st.ev].t) p3Event(a, st, P3_EVENTS[st.ev++]);
                        if (st.typer) st.typer.update();
                        if (st.cap) st.cap.t++;
                        const fr = st.freak;
                        if (fr && ++fr.t > fr.n) st.freak = null;
                        if (t >= P25_SETTLE && t < sg.f - sg.tail) {
                            if (st.freak) p3FreakRun(a, st, st.freak); else sg.run(a, t - P25_SETTLE, st.seg, sg.d);
                        }
                    },
                    draw(ctx, a) {
                        const st = a.state, F = st.F || 0;
                        let i = P3.length - 1; while (i > 0 && F < P3[i].start) i--;
                        const sg = P3[i], t = F - sg.start;
                        if (i < P3.length - 1 && F >= P3[i].end - P25_GHOST) {              // dashed outline of the NEXT box
                            const nx = P3[i + 1].box, q = boxRect(nx[0], nx[1], nx[2], nx[3]);
                            ctx.save();
                            ctx.globalAlpha = 0.45 + 0.35 * Math.sin(F * 0.6);
                            ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
                            ctx.strokeRect(q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3);
                            ctx.restore();
                        }
                        if (sg.draw && st.seg) sg.draw(ctx, a, st.seg, Math.max(0, t - P25_SETTLE), st);        // the act's own drawing (cursor, title bar, key caps ...)
                        // subtitle (top-left): fades in, stays, fades out
                        const cp = st.cap;
                        if (cp && cp.t < cp.n && sg.name !== "boot") {
                            const al = Math.min(1, cp.t / 10) * Math.min(1, (cp.n - cp.t) / 14);
                            ctx.save(); ctx.globalAlpha = al * 0.9;
                            ctx.font = `15px ${FONT}`; const w = Math.min(215, ctx.measureText(cp.text).width + 12);
                            ctx.fillStyle = "#000"; ctx.fillRect(8, 8, w + 4, wrap(cp.text, 205).length * 19 + 8);
                            ctx.globalAlpha = al; ctx.fillStyle = "#fff"; wrap(cp.text, 205).forEach((ln, k) => text(ln, 14, 11 + k * 19, 15, "#fff"));
                            ctx.restore();
                        }
                        // the video timeline at the very bottom: bar, chapter ticks, playhead, time
                        if (F < P3_TOTAL - 60) {
                            const x0 = 74, x1 = 566, y = 466, k = clamp(F / P3_TOTAL, 0, 1), mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
                            ctx.save(); ctx.globalAlpha = 0.7;
                            ctx.fillStyle = "#333"; ctx.fillRect(x0, y, x1 - x0, 4);
                            ctx.fillStyle = "#bbb"; ctx.fillRect(x0, y, (x1 - x0) * k, 4);
                            ctx.fillStyle = "#000"; for (const q of P3) ctx.fillRect(Math.round(x0 + (x1 - x0) * q.start / P3_TOTAL), y, 1, 4);
                            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * k, y + 2, 5, 0, 7); ctx.fill();
                            text(mm(st.T || 0), 14, 459, 13, "#bbb"); text(mm(P3_D_LEN), 578, 459, 13, "#777");
                            ctx.restore();
                        }
                        // the Z-heal reminder next to the HP bar (flashes yellow when your HP is low), until it is used
                        if (!a.vars.p3Healed) {
                            const low = a.hp < a.maxHp * 0.4;
                            text("[Z] HEAL", 505, 401, 16, low ? ((a.frame >> 3) % 2 ? "#ff0" : "#fff") : (a.frame < 300 ? "#ff0" : "#8a8a50"));
                        }
                        const fx = st.healFx;                                               // "+34" rises from the soul (or "HP FULL" when there was nothing to heal)
                        if (fx && fx.t < 70) {
                            ctx.save(); ctx.globalAlpha = 1 - fx.t / 70;
                            text(fx.n ? "+" + fx.n : "HP FULL", a.soul.x, a.soul.y - 26 - fx.t * 0.5, 20, fx.n ? "#3f3" : "#aaa", "center");
                            ctx.restore();
                        }
                        if (st.typer && !st.typer.done) drawBubble(st.typer);                // Sans talking
                    },
                    end(a) { a.cam({ rot: 0 }, 10); Engine.resetTitle(); }
                }
            }
        }
    ],

    // ---------- THE OUTRO (after the phase 3 finale): ending video -> credits -> 2 seconds of black -> TITLE SCREEN ----------
    // order: the stages in the order they play (remove "credits" to skip them, or move them around).  Hold X skips the video / the credits.
    // video: any mp4 / webm (it is played full screen)    blackFor: frames of pure black before the title screen (120 = 2 s)
    // credits.cards: head = the small gray line, lines = the big white ones (size: bigger / smaller letters)
    outro: {
        order: ["video", "credits", "black"],
        video: "videos (MP3)/ending video.mp4",
        blackFor: 120,
        credits: {
            music: "audio/But He Refused To Give Up (phase 1.5 cutscene).mp3", volume: 0.5, loop: false, cardFrames: 270,
            cards: [
                { head: "", lines: ["UT battle engine"], size: 44 },
                { head: "ENGINE BY", lines: ["Dumb_Artist05"], size: 44 },
                { head: "PLAY TESTING, IDEAS & SCRIPTS", lines: ["MetaGG", "Insanity Sans", "Vigory"], size: 34 },
                { head: "PHASE 1 MUSIC", lines: ["Megalovania Reprise", "by Soba Noodles"], size: 34 },
                { head: "PHASE 2 MUSIC", lines: ["The Slaughter Continues:", "maximum effort.", "by Freshy's"], size: 30 },
                { head: "AND ALMOST EVERYTHING ELSE BY", lines: ["Dumb_Artist05"], size: 40 }
            ]
        }
    },

    // the ending after phase 3 is survived (phase 2.5 has its own ending with a glitch - see above)
    ending: { text: "Thanks for playing!", musicFade: 330, restart: false }
};

Engine.start(Game);
