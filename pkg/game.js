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
    p2_slash:     ["watch the lines. then watch your step.", "i don't swing twice at the same spot. ...okay, i do.", "see that? that's me, cutting the distance."],
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
const P2_ORDER = ["p2_whirl", "p2_slash", "p2_clock", "p2_stab", "p2_snake", "p2_crossfan", "p2_crossfire", "p2_windmill", "p2_slam", "p2_stopgo", "p2_slash", "p2_squeeze", "p2_rain", "p2_stab", "p2_windmill", "p2_crossfan"];


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

const P3_PATTERNS = {
    // bone walls (two sides first, all four sides when it gets harder)
    walls: (d) => ({ box: [250, 150, 320, 312], run(a, n, s) {
        if (!onBeat(a.frame, d > 0.65 ? 1 : 2)) return;
        const sides = d < 0.4 ? ["left", "right"] : ["left", "right", "top", "bottom"];
        s.i = (s.i || 0) + 1;
        s.gap = clamp((s.gap ?? 0.5) + a.rand(-0.3, 0.3), 0.25, 0.75);
        a.wall(p25Side(a, sides[s.i % sides.length]), s.gap, lerpD(64, 50, d), lerpD(3.8, 5.4, d), { color: s.i % 6 === 5 ? "blue" : "white", damage: DMG.bone });
    } }),
    // blaster lanes: two of three lanes fire, one is safe (rows, then columns)
    lanes: (d) => ({ box: [210, 160, 320, 306], run(a, n, s) {
        if (!onBeat(a.frame, 3)) return;
        const r = a.box, k = (s.k = (s.k || 0) + 1), rows = k % 2 === 0, fromLeft = k % 4 === 0;
        let safe; do { safe = a.randInt(0, 2); } while (safe === s.safe);
        s.safe = safe;
        for (let i = 0; i < 3; i++) {
            if (i === safe) continue;
            const o = { size: 0.75, arrive: 12, charge: 22, hold: 14, damage: DMG.blaster, shake: 3 };
            if (rows) a.blaster({ ...o, to: [fromLeft ? r.left - 62 : r.right + 62, r.top + r.h * (2 * i + 1) / 6], angle: fromLeft ? 0 : 180 });
            else a.blaster({ ...o, to: [r.left + r.w * (2 * i + 1) / 6, r.top - 58], angle: 90 });
        }
    } }),
    // fast zig-zag in a low, wide box
    zigzag: (d) => ({ box: [330, 120, 320, 328], speed: 0.3, run(a, n, s) {
        if (!onBeat(a.frame)) return;
        const r = a.box, c = "TBTMBTBM"[(s.i = (s.i || 0) + 1) % 8], v = -lerpD(4.8, 6.4, d);
        const put = (y, h) => a.bone({ x: r.right, y, w: 14, h, vx: v, damage: DMG.bone });
        if (c === "T") put(r.top, 62); else if (c === "B") put(r.bottom - 62, 62); else { put(r.top, 32); put(r.bottom - 32, 32); }
    } }),
    // a small box sways while orbs rain down
    rain: (d) => ({ box: [170, 150, 200, 305], sway: [58, 0, 240], run(a, n, s) {
        const r = a.box;
        if (onBeat(a.frame)) for (let i = 0; i < (d > 0.5 ? 2 : 1); i++) a.aim(a.rand(r.left, r.right), r.top - 16, lerpD(2.8, 3.8, d), { damage: DMG.orb });
        if (onBeat(a.frame, 4, 2)) a.fan({ x: a.rand(r.left, r.right), y: r.top - 20, n: 3 + (d > 0.5 ? 2 : 0), arc: 40, angle: 90, speed: 2.8, damage: DMG.orb });
    } }),
    // blaster crosses through the middle (rotating wedge is safe)
    beams: (d) => ({ box: [180, 170, 320, 303], run(a, n, s) {
        if (!onBeat(a.frame, 2)) return;
        const k = (s.k = (s.k || 0) + 1);
        [[0, 60, 120], [30, 90, 150], [15, 75, 135], [45, 105, 165]][k % 4].forEach((dg, i) => p25Beam(a, dg, (k + i) % 2));
    } }),
    // blue walls from the left (stand still), orange from the right (keep moving)
    stopgo: (d) => ({ box: [250, 140, 320, 316], run(a, n, s) {
        const r = a.box, v = lerpD(4, 5, d);
        if (onBeat(a.frame, 4, 0)) a.wall("left", 0.5, 0, v, { color: "blue", damage: DMG.bone });
        if (onBeat(a.frame, 4, 2)) a.wall("right", 0.5, 0, v, { color: "orange", damage: DMG.bone });
        if (onBeat(a.frame, 4, 3) && d > 0.3) a.aim(a.rand(r.left, r.right), r.top - 14, 2.8, { damage: DMG.orb });
    } }),
    // blaster pincers aimed at you + orbs on the off-beats
    pincer: (d) => ({ box: [160, 150, 320, 308], sway: [30, 0, 220], run(a, n, s) {
        const r = a.box;
        if (onBeat(a.frame, 2, 0)) {
            const ph = a.rand(-160, -20) * RAD;
            p25Pincer(a, ph);
            if ((s.c = (s.c || 0) + 1) % 2 === 0 && d > 0.4) p25Pincer(a, Math.PI - ph);
        }
        if (onBeat(a.frame, 2, 1)) {
            a.aim(r.left - 14, a.rand(r.top, r.bottom), 2.7, { damage: DMG.orb });
            a.aim(r.right + 14, a.rand(r.top, r.bottom), 2.7, { damage: DMG.orb });
        }
    } }),
    // bone stabs out of the floor / ceiling, on the beat
    stab: (d) => ({ box: [264, 160, 320, 305], run(a, n, s) {
        if (!onBeat(a.frame, d > 0.7 ? 3 : 4)) return;
        const k = (s.k = (s.k || 0) + 1);
        stabCols(a, k % 2 === 0, pickCols(a, d > 0.6 ? 4 : 3, 8), 8, 0.8);
    } }),
    // spinning bone arms (2, then 3 when it gets harder) - ORANGE soul: keep moving. They start calm and are spinning fast by the end of the segment.
    windmill: (d) => ({ box: [230, 230, 320, 270], mode: "orange", run(a, n, s) {
        if (n !== 0) return;
        const r = a.box, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, life = P3_SEG - 30 - 40, v0 = lerpD(0.45, 0.65, d), vEnd = lerpD(1.9, 2.3, d), arms = d > 0.45 ? 3 : 2;
        for (let i = 0; i < arms; i++) spinArm(a, cx, cy, 190, i * 360 / arms, v0, life, spinAccel(v0, vEnd, life), 0, 50);
    } }),
    // orb fans from the corners of the box, on the beat (no slashes in phase 3)
    crossfan: (d) => ({ box: [250, 190, 320, 300], run(a, n, s) {
        if (!onBeat(a.frame, 2)) return;
        const r = a.box, k = (s.k = (s.k || 0) + 1), left = k % 2 === 0, x = left ? r.left - 24 : r.right + 24, y = k % 4 < 2 ? r.top - 24 : r.bottom + 24;
        const toward = a.angleTo((r.left + r.right) / 2, (r.top + r.bottom) / 2), cnt = 6, spread = 90, sp = lerpD(2.4, 3.1, d);
        for (let i = 0; i < cnt; i++) {
            const ang = toward + ((i / (cnt - 1)) - 0.5) * spread * RAD + (k % 3 === 2 ? (spread / (cnt - 1)) * 0.5 * RAD : 0);
            a.orb({ x: x - 8, y: y - 8, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, damage: DMG.orb });
        }
    } }),
    // bones fall from the ceiling after a warning strip (red soul: just step aside)
    hail: (d) => ({ box: [300, 150, 320, 310], run(a, n, s) {
        if (!onBeat(a.frame, d > 0.6 ? 1 : 2)) return;
        const r = a.box, xs = s.xs || (s.xs = []);
        let x, tries = 0;
        do { x = a.rand(r.left + 12, r.right - 12); tries++; } while (tries < 14 && xs.some((o) => a.frame - o.f < 40 && Math.abs(o.x - x) < 56));
        xs.push({ x, f: a.frame }); if (xs.length > 6) xs.shift();
        a.warn({ x: x - 7, y: r.top, w: 14, h: r.h, frames: 22, then() { a.bone({ x: x - 6, y: r.top - 60, w: 12, h: 60, vy: 5.2, ay: 0.2, damage: DMG.bone }); } });
    } }),
    // blue soul: jump the floor bones (and duck the hanging ones when it gets harder)
    bluejump: (d) => ({ box: [300, 150, 320, 310], mode: "blue", run(a, n, s) {
        const r = a.box, v = -lerpD(3.8, 5.2, d);
        if (onBeat(a.frame, 2, 0)) { const h = a.pick([26, 38, 52]); a.bone({ x: r.right, y: r.bottom - h, w: 14, h, vx: v, damage: DMG.bone }); }
        if (d > 0.45 && onBeat(a.frame, 8, 5)) a.bone({ x: r.right, y: r.top, w: 14, h: 60, vx: v, damage: DMG.bone });
    } })
};
// 15 segments of ~10.1 s = the 152 s song. The song goes quiet at 1:13 - 1:19, which is segment 7 (a calm one: rain).
// The fight ends with the song: the last segment is the fastest ORANGE windmill. (Phase 3 has NO slash attacks: segments 9 and 13 are orb fans and falling bones.)
const P3_ORDER = [
    "walls", "lanes", "zigzag", "beams", "stopgo", "bluejump", "stab", "rain",
    "crossfan", "windmill", "zigzag", "pincer", "hail", "lanes", "windmill"
];
const P3_SEG = Math.round(P3_D_LEN * 60 / P3_ORDER.length), P3_TOTAL = P3_ORDER.length * P3_SEG;       // 15 x 608 frames = 152 s
const P3 = P3_ORDER.map((name, i) => ({ ...P3_PATTERNS[name](i / (P3_ORDER.length - 1)), name, f: P3_SEG, tail: 40, start: i * P3_SEG, end: (i + 1) * P3_SEG }));

// ============================================================
// PHASE 1 - the opening attack (the "hard one", in the spirit of Sans's last attack in the original fight).
// The box STRETCHES into a long strip and the camera moves with it:
//   A  blue soul: bones from the right (jump the low ones, stay under the hanging ones), the screen rolls a little with every bone
//   B  red soul:  vertical blaster volleys. Every volley is a row of beams with a gap between every two of them - the gaps SHIFT by half a
//      step each time, so you have to slide over. (Every beam is shown 36+ frames before it fires, and the nearest gap is never further than 50 px.)
//   C  the box squeezes together, bone walls from both sides with ONE shared gap, then blaster rows, then vertical beams.
// It hurts (bones P1_DMG.bone, blasters P1_DMG.blaster) but every pattern has a telegraph and a safe spot.
// ============================================================
const P1_DMG = { bone: 9, blaster: 15 };
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
        if (f === 340) { a.cam({ rot: 0 }, 20); a.setMode("red"); a.flash("#f00", 12, 0.35); a.sound("charge"); a.ring(a.soul.x, a.soul.y, { r1: 70, life: 24, color: "#f33" }); }
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

const Game = {
    title: "UT battle engine",

    music: "audio/placeholder battle music.mp3",     // your battle music (any mp3/ogg/wav)
    musicAfterFirstAttack: true,                       // the fight starts in SILENCE: the music kicks in (flash + shockwave) when the first attack is over
    enemyFirst: true,                                  // phase 1: Sans attacks first (the opening attack), then the menu appears
    menu: { color: "#4b1a86", mote: "#a77bd9", sub: "a Dark Byte SoulForge battle" },     // title screen look (set  gate: false  to skip the title screen)

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
            { title: "UT battle engine", sub: "a simple UT battle battle engine", frames: 170 },
            { text: ["* The corridor is silent.", "* But something is waiting at the end of it."], size: 30 },
            { fade: "out", frames: 40 },
            { flash: true, shake: [6, 24], sfx: "hit" },
            { wait: 30 }
        ]
    },

    // ---------- PHASE 1 OPENING (in-battle cinematic: cinema bars, camera moves, Sans fading in out of the dark) ----------
    // Same step keys as the phase cutscenes + cam: {zoom, x, y, rot, focus:[px,py], frames}, bars, uiIn, soul: [x, y], title / sub, kick, freeze, ring...
    // The music does NOT play during it: it starts after the first attack (musicAfterFirstAttack). Players can hold X to skip.
    opening: {
        skippable: true,
        steps: [
            { bars: true, barsFrames: 80, cam: { zoom: 1.1, x: 0, y: 0, frames: 1 }, sfx: "thump", wait: 80 },
            { text: ["* The corridor is silent.", "* But something is waiting at the end of it."], auto: 70, speed: 3 },
            { sfx: "riser", dark: 0, fadeEnemy: 1, frames: 150, wait: 150,            // Sans fades in while the camera pulls back from a close-up
              fn(g) { g.cam({ zoom: 1.2, focus: [320, 150] }, 1); g.after(2, () => g.cam({ zoom: 1.02, focus: [320, 160] }, 230)); } },
            { sfx: "thump", say: ["so.", "you came all this way."], auto: 50 },
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

        boneWave: {
            box: [220, 140], duration: 420,
            update(a) {
                if (a.every(55)) a.wall(Math.round(a.frame / 55) % 2 ? "right" : "left", a.rand(0.25, 0.75), 56, 3);
            }
        },

        blueJump: {
            box: [280, 150], mode: "blue", duration: 480,
            update(a) {
                const r = a.box;
                if (a.every(60)) {
                    const h = a.pick([28, 44]);
                    a.bone({ x: r.right, y: r.bottom - h, w: 14, h, vx: -3.4 });
                }
            }
        },

        orbBarrage: {
            box: [200, 150], duration: 400,
            update(a) {
                if (!a.every(22)) return;
                const r = a.box, e = a.randInt(0, 2);
                if (e === 0) a.aim(a.rand(r.left, r.right), r.top - 20, 2.6);
                else if (e === 1) a.aim(r.left - 20, a.rand(r.top, r.bottom), 2.6);
                else a.aim(r.right + 20, a.rand(r.top, r.bottom), 2.6);
            }
        },

        // blue walls: stand still. orange walls: keep moving.
        stillOrMove: {
            box: [200, 130], duration: 480,
            update(a) {
                if (a.every(80)) a.wall("left", 0.5, 0, 3.2, { color: "blue" });
                if (a.every(80, 40)) a.wall("right", 0.5, 0, 3.2, { color: "orange" });
            }
        },

        // Gaster Blasters appear around the screen and fire at the soul
        blasters: {
            box: [240, 160], duration: 380,
            update(a) {
                if (a.every(85, 5)) a.blaster({ to: [a.rand(90, 550), a.pick([60, 90])], size: 1 });
                if (a.every(85, 45)) a.blaster({ to: [a.pick([50, 590]), a.rand(150, 330)], size: 0.8 });
            }
        },

        // rings and fans of orbs, plus a box that shrinks mid-attack
        ringBurst: {
            box: [240, 160], duration: 420,
            update(a) {
                if (a.every(70)) a.ring({ n: 10, speed: 2, angle: a.rand(0, 36), color: "white" });
                if (a.every(70, 35)) a.fan({ x: a.rand(150, 490), y: 80, n: 5, arc: 50, speed: 2.4 });
                if (a.frame === 200) { a.setBox(160, 130); a.shake(3, 10); }
            }
        }

        // Example: your own bullet picture. Add  images: { mybullet: "assets/my_bullet.png" }  above first.
        // spinningStars: {
        //     box: [220, 150], duration: 300,
        //     update(a) { if (a.every(20)) a.sprite({ img: "mybullet", x: a.box.right, y: a.rand(a.box.top, a.box.bottom), w: 24, h: 24, vx: -3, spin: 8 }); }
        // }
    },

    // Enemy turns, in order (they loop). "say" is optional speech.
    // You can also make turns a function for smarter behavior:  turns: (n, g) => ({ say: "...", attack: g.hp < 30 ? "blasters" : "boneWave" })
    turns: [
        { say: "...ready?",            attack: "p1_opening" },
        { say: "heh. watch this.",     attack: "boneWave" },
        { say: "i am not supposed to say this but... you should jump over these bones when you are *blue*.",                attack: "blueJump" },
        { say: "dodge these.",         attack: "orbBarrage" },
        { say: "don't move. or do.",   attack: "stillOrMove" },
        { say: "get dunked on.",       attack: "blasters" },
        { say: "Watch out kid.",     attack: "ringBurst" },
        { say: "I think i am cooked...",     attack: "blasters" }
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
                interrupt: { remaining: 5, after: 110, chance: 0.4, perTurn: 1, warn: 44, damage: () => Math.round(DMG.slash * 0.6),
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

                // Sans slashes: dotted lines show where the cuts land. Every cut makes him slash (the gif drifts right, then left, then right...).
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
                const atk = n < P2_ORDER.length ? P2_ORDER[n] : g.pick(P2_ORDER.filter((x) => x !== g.vars.lastAtk));
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
                thumps: [3.5, 7.9], boom: 12.25, pulses: [16.6, 18.8, 21.0, 23.2, 29.7, 31.9], last: 38.4, title: 40.6, fadeAt: 43,
                text: "Thanks for playing!", sub: "", restart: false,
                vfx: { color: "#ffb870", mote: "#fff3d6" }
            },
            attacks: {
                p3_survival: {
                    box: [P3[0].box[0], P3[0].box[1]], at: [P3[0].box[2], P3[0].box[3]], duration: P3_TOTAL + 900,
                    start(a) {
                        const st = a.state;
                        st.i = -1; st.seg = {}; st.T = 0; st.healFx = null;
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
                        const F = st.F = Math.floor(st.T * 60), i = Math.min(P3.length - 1, Math.floor(F / P3_SEG));
                        const sg = P3[i], t = F - sg.start;
                        if (st.i !== i) {                                                   // a new segment: the box jumps, leftovers vanish
                            st.i = i; st.seg = {};
                            if (i > 0) { a.clear(); a.setBox(...sg.box, sg.speed); a.shake(3, 8); a.sound("swoosh"); }
                            if (sg.mode === "blue") a.setMode("blue", "down"); else if (sg.mode) a.setMode(sg.mode); else if (i > 0) a.setMode("red");
                        }
                        if (sg.sway) {
                            const k = Math.sin(t * 2 * Math.PI / sg.sway[2]);
                            a.setBox(sg.box[0], sg.box[1], sg.box[2] + sg.sway[0] * k, sg.box[3] + sg.sway[1] * k, sg.speed);
                        }
                        if (t >= P25_SETTLE && t < sg.f - sg.tail) sg.run(a, t - P25_SETTLE, st.seg);
                    },
                    draw(ctx, a) {
                        const st = a.state, F = st.F || 0, i = Math.max(0, Math.floor(F / P3_SEG));
                        if (i < P3.length - 1 && F >= P3[i].end - P25_GHOST) {              // dashed outline of the NEXT box
                            const nx = P3[i + 1].box, q = boxRect(nx[0], nx[1], nx[2], nx[3]);
                            ctx.save();
                            ctx.globalAlpha = 0.45 + 0.35 * Math.sin(F * 0.6);
                            ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
                            ctx.strokeRect(q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3);
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
                    }
                }
            }
        }
    ],

    // the ending after phase 3 is survived (phase 2.5 has its own ending with a glitch - see above)
    ending: { text: "Thanks for playing!", musicFade: 330, restart: false }
};

Engine.start(Game);
