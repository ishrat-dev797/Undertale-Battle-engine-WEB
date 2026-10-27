// ============================================================
// Dark Byte SoulForge Engine  -  v0.7.0
// You normally DON'T need to edit this file. Make your game in game.js.
// ============================================================
"use strict";

const W = 640, H = 480, STEP = 1000 / 60;      // fixed 60 updates/second on any monitor
const RAD = Math.PI / 180;
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const gifEl = document.getElementById("enemyGif");    // animated enemy sprites (.gif) are shown with this
const stageEl = document.getElementById("stage");     // slash pictures are added to it
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;                    // keeps pixel art crisp

const FONT = '"DeterminationMono", "Courier New", Courier, monospace';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const url = (s) => (String(s).includes("%") ? String(s) : encodeURI(String(s)));   // file names with spaces are fine
function rgba(hex, a) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Runs YOUR code (game.js) safely: a typo in a script shows a red banner instead of freezing the engine.
function call(where, fn, self, ...args) {
    if (typeof fn !== "function") return undefined;
    try { return fn.apply(self, args); } catch (e) { Engine.error(where, e); return undefined; }
}

function text(str, x, y, px = 22, color = "#fff", align = "left") {
    ctx.font = `${px}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
}

function wrap(str, maxW) {
    const out = [];
    for (const para of String(str).split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
            const test = line ? line + " " + word : word;
            if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
            else line = test;
        }
        out.push(line);
    }
    return out;
}

// ============================================================
// Input
// ============================================================
const Input = {
    down: {}, pressed: {},
    init() {
        addEventListener("keydown", (e) => {
            const k = e.key.toLowerCase();
            if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "f3", "f4"].includes(k)) e.preventDefault();
            if (!this.down[k]) this.pressed[k] = true;
            this.down[k] = true;
            Sound.unlock();
        });
        addEventListener("keyup", (e) => { this.down[e.key.toLowerCase()] = false; });
        addEventListener("blur", () => { this.down = {}; });
    },
    // virtual keys (the on-screen mobile buttons): same as pressing / releasing a keyboard key
    pad: {},
    setKey(k, on) {
        this.pad[k] = on;
        if (on) { if (!this.down[k]) this.pressed[k] = true; this.down[k] = true; Sound.unlock(); }
        else this.down[k] = false;
    },
    held(...k) { return k.some((x) => this.down[x]); },
    hit(...k) { return k.some((x) => this.pressed[x]); },
    confirm() { return this.hit("z", "enter"); },
    cancel() { return this.hit("x", "shift"); },
    dir() {
        return {
            dx: (this.held("d", "arrowright") ? 1 : 0) - (this.held("a", "arrowleft") ? 1 : 0),
            dy: (this.held("s", "arrowdown") ? 1 : 0) - (this.held("w", "arrowup") ? 1 : 0)
        };
    },
    endStep() { this.pressed = {}; }
};

// ============================================================
// Mobile controls: a button in the top-left corner switches them on / off.
// ON: 4 big transparent arrow buttons (left side) + X and Z buttons (right side). They press the same keys as the keyboard.
// In BLUE soul mode the Z button also makes the soul jump (Input.pad.z, see updateSoul).
// ============================================================
const MobileCtl = {
    on: false, KEY: "dbsf_mobile",
    init() {
        const root = document.getElementById("mobileCtl"), tog = document.getElementById("mobileToggle");
        if (!root || !tog) return;
        this.root = root;
        // SLIDING FINGERS: every finger (pointer) is tracked on its own. While it stays on the screen the button under it is the one that is
        // pressed - slide from one arrow to another WITHOUT lifting and the first one is released and the new one is pressed at once.
        // Several fingers work together (e.g. an arrow + Z).  A finger sliding off every button simply releases.
        const btns = [...root.querySelectorAll("[data-key]")];
        this.fingers = new Map();                                   // pointerId -> button element it is on (or null)
        const hitTest = (x, y) => {
            let best = null, bd = 1e9;
            for (const el of btns) {
                const r = el.getBoundingClientRect(), pad = 7;       // a few pixels of slack so the gaps between arrows do not drop the key
                if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
                const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
                if (d < bd) { bd = d; best = el; }
            }
            return best;
        };
        const sync = () => {                                        // press what is under any finger, release the rest
            const held = new Set(this.fingers.values());
            for (const el of btns) {
                const on = held.has(el);
                if (on !== el.classList.contains("on")) { el.classList.toggle("on", on); Input.setKey(el.dataset.key, on); }
            }
        };
        const move = (e) => { if (!this.fingers.has(e.pointerId)) return; e.preventDefault(); this.fingers.set(e.pointerId, hitTest(e.clientX, e.clientY)); sync(); };
        const end = (e) => { if (!this.fingers.has(e.pointerId)) return; e.preventDefault(); this.fingers.delete(e.pointerId); sync(); };
        for (const el of btns) {
            el.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                try { el.releasePointerCapture(e.pointerId); } catch (x) { /* touch pointers are captured implicitly: let go so the finger can slide over other buttons */ }
                this.fingers.set(e.pointerId, hitTest(e.clientX, e.clientY) || el); sync();
            });
            el.addEventListener("contextmenu", (e) => e.preventDefault());
        }
        // move / up are listened to on the whole window, so a finger that left its first button is still followed
        window.addEventListener("pointermove", move, { passive: false });
        for (const ev of ["pointerup", "pointercancel"]) window.addEventListener(ev, end, { passive: false });
        window.addEventListener("blur", () => { this.fingers.clear(); sync(); });
        tog.addEventListener("click", () => this.set(!this.on));
        tog.addEventListener("pointerdown", () => Sound.unlock());
        let saved = false; try { saved = localStorage.getItem(this.KEY) === "1"; } catch (e) { /* ignore */ }
        this.set(saved, true);
    },
    set(on, quiet) {
        this.on = on;
        document.body.classList.toggle("mobileOn", on);
        const tog = document.getElementById("mobileToggle");
        if (tog) { tog.classList.toggle("active", on); tog.title = on ? "Mobile controls: ON (click to turn off)" : "Mobile controls: OFF (click to turn on)"; }
        if (!on) { if (this.fingers) this.fingers.clear(); for (const k of Object.keys(Input.pad)) Input.setKey(k, false); root_release(); }
        try { localStorage.setItem(this.KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
        if (!quiet && Engine && Engine.notify) Engine.notify(on ? "MOBILE CONTROLS ON" : "MOBILE CONTROLS OFF");
    }
};
function root_release() { if (MobileCtl.root) MobileCtl.root.querySelectorAll(".on").forEach((e) => e.classList.remove("on")); }

// ============================================================
// Sound: your own files (game.js -> sounds: {...}) + built-in synth beeps as fallback
// ============================================================
const Sound = {
    ctx: null, muted: false, volume: 1, files: {},
    unlock() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    // map: { name: "path" }  or  { name: { src, volume, maxDur (seconds, cuts long clips), poly (max overlapping copies), gap (ms) } }
    load(map) {
        for (const [name, spec] of Object.entries(map)) {
            try {
                const o = typeof spec === "string" ? { src: spec } : spec;
                const f = { src: url(o.src), pool: [], vol: o.volume ?? 1, voiceVol: o.voiceVol, maxDur: o.maxDur || 0, poly: o.poly ?? 6, gap: o.gap ?? 40, last: -1e9, err: false };
                const a = new Audio();
                a.preload = "auto";
                a.addEventListener("error", () => { f.err = true; Engine.error("Missing sound: " + o.src); });
                a.src = f.src;
                f.pool.push(a);
                this.files[name] = f;
            } catch (e) { Engine.error("sound " + name, e); }
        }
    },
    has(name) { return !!this.files[name]; },
    // Sounds are played from a small pool of reusable <audio> elements (no new element per play, no leaks).
    // Identical sounds started within `gap` ms are merged, so 3 blasters firing on the same frame no longer play 3x as loud.
    playFile(name, vol = 0.6) {
        const f = this.files[name];
        if (this.muted || !f || f.err) return;
        const now = performance.now();
        if (now - f.last < f.gap) return;
        f.last = now;
        let a = f.pool.find((x) => x.paused || x.ended);
        if (!a) {
            if (f.pool.length < f.poly) { a = new Audio(f.src); f.pool.push(a); }
            else a = f.pool.reduce((o, x) => (x._t < o._t ? x : o), f.pool[0]);      // all busy: restart the oldest
        }
        try {
            clearTimeout(a._cut);
            a.pause();
            try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
            a._t = now; a._held = false;
            a.volume = clamp(vol * f.vol * this.volume, 0, 1);
            a.muted = this.muted;
            if (f.maxDur) a._cut = setTimeout(() => { try { a.pause(); } catch (e) { /* ignore */ } }, f.maxDur * 1000);
            const p = a.play();
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* audio hiccups never stop the game */ }
    },
    each(fn) { for (const f of Object.values(this.files)) for (const a of f.pool) fn(a); },
    pauseAll() { this.each((a) => { if (!a.paused) { a._held = true; try { a.pause(); } catch (e) { /* ignore */ } } }); },
    resumeAll() { this.each((a) => { if (a._held) { a._held = false; const p = a.play(); if (p && p.catch) p.catch(() => {}); } }); },
    stopAll() { this.each((a) => { clearTimeout(a._cut); a._held = false; try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ } }); },
    setMuted(m) { this.muted = m; this.each((a) => { a.muted = m; }); },
    voice(name) {
        const f = this.files[name];
        if (f) this.playFile(name, f.voiceVol ?? 0.45); else this.synth("text");
    },
    beep(freq, dur = 0.08, type = "square", vol = 0.05, slideTo = 0) {
        if (this.muted || !this.ctx || this.volume <= 0) return;
        vol *= this.volume;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(this.ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
    },
    synth(name) {
        switch (name) {
            case "move":   this.beep(520, 0.04); break;
            case "select": this.beep(880, 0.07); break;
            case "text":   this.beep(rand(260, 330), 0.04, "square", 0.025); break;
            case "hurt":   this.beep(180, 0.25, "sawtooth", 0.09, 50); break;
            case "heal":   this.beep(500, 0.25, "triangle", 0.08, 1100); break;
            case "slash":  this.beep(1000, 0.18, "sawtooth", 0.06, 120); break;
            case "hit":    this.beep(220, 0.2, "square", 0.08, 60); break;
            case "slam":   this.beep(160, 0.16, "square", 0.08, 50); break;
            case "dodge":  this.beep(1400, 0.16, "triangle", 0.05, 260); break;      // Sans slips away
            case "swoosh": this.beep(420, 0.14, "triangle", 0.035, 110); break;      // the battle box jumps
            case "break":  this.beep(300, 0.6, "sawtooth", 0.09, 40); break;
            case "win":    this.beep(523, 0.15, "square", 0.06, 784); break;
            case "thump":  this.beep(62, 0.22, "sine", 0.16, 36); setTimeout(() => this.beep(54, 0.28, "sine", 0.14, 30), 170); break;     // heartbeat
            case "riser":  this.beep(70, 1.6, "sawtooth", 0.035, 520); break;                                                          // slow rising tension
            case "tilt":   this.beep(340, 0.34, "triangle", 0.06, 150); break;                                                        // the camera is about to tilt
            case "tick":   this.beep(1800, 0.03, "square", 0.03); break;
            case "charge": this.beep(120, 0.5, "sawtooth", 0.05, 900); break;
        }
    },
    // play(name): a loaded sound file with that name wins, otherwise the built-in beep
    play(name, vol) { if (this.has(name)) this.playFile(name, vol); else this.synth(name); }
};

// ============================================================
// Assets (a missing file never freezes the engine; you get a red banner instead)
// ============================================================
const Assets = {
    images: {}, specs: {}, cache: {},
    load(map) {
        for (const k of Object.keys(map)) this.specs[k] = typeof map[k] === "string" ? { src: map[k] } : map[k];
        return Promise.all(Object.keys(map).map((key) => new Promise((res) => {
            const img = new Image();
            img.onload = () => { this.images[key] = img; res(); };
            img.onerror = () => { Engine.error("Missing image: " + this.specs[key].src); res(); };
            img.src = url(this.specs[key].src);
        })));
    },
    get(key) { return this.images[key] || null; },
    isGif(key) { const s = this.specs[key]; return !!s && /\.gif(\?|#|$)/i.test(s.src); }
};

// Cropped / tinted sprite cache. solid=true fills the whole shape with one color.
function sprite(key, color, solid) {
    const id = key + "|" + (color || "") + (solid ? "s" : "");
    if (Assets.cache[id]) return Assets.cache[id];
    const img = Assets.get(key);
    if (!img) return null;
    const cr = (Assets.specs[key] && Assets.specs[key].crop) || [0, 0, 1, 1];
    const sx = cr[0] * img.width, sy = cr[1] * img.height, sw = cr[2] * img.width, sh = cr[3] * img.height;
    const sc = Math.min(1, 256 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * sc));
    c.height = Math.max(1, Math.round(sh * sc));
    const g = c.getContext("2d");
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (color) {
        g.globalCompositeOperation = solid ? "source-in" : "multiply";
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        if (!solid) {   // multiply paints transparent areas too, so re-mask with the original shape
            g.globalCompositeOperation = "destination-in";
            g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        }
    }
    Assets.cache[id] = c;
    return c;
}

// ============================================================
// Settings (saved in the browser). The OPTIONS menu changes these.
//   cam: 2 = full camera (zoom, roll AND tilt)   1 = no tilt (cinematic moves only)   0 = no camera effects at all
//   flash: false = no glitch / colour split and white flashes are dimmed (for players sensitive to flashing)
// ============================================================
const Settings = {
    KEY: "dbsf.settings.v1", vfx: null, music: 10, sfx: 10, shake: true, cam: 2, flash: true,
    load() {
        try {
            const o = JSON.parse(localStorage.getItem(this.KEY) || "{}");
            for (const k of ["vfx", "music", "sfx", "shake", "cam", "flash"]) if (o[k] !== undefined) this[k] = o[k];
        } catch (e) { /* private mode / file access: defaults are fine */ }
    },
    save() {
        try { localStorage.setItem(this.KEY, JSON.stringify({ vfx: this.vfx, music: this.music, sfx: this.sfx, shake: this.shake, cam: this.cam, flash: this.flash })); } catch (e) { /* ignore */ }
    },
    apply() {
        Sound.volume = this.sfx / 10;
        const m = Engine.music;
        if (m && !Engine.fade) m.volume = clamp((m._base ?? 0.5) * this.music / 10, 0, 1);
    },
    get flashK() { return this.flash ? 1 : 0.35; }
};

// ============================================================
// Camera: the whole stage (canvas + gif sprites) is zoomed / moved / rolled with CSS, so everything follows.
//   Cam.to({ zoom, x, y, rot, focus: [px, py] }, frames)   smooth move (focus = a point of the 640x480 screen to put in the middle)
//   Cam.kick(0.03)  quick zoom punch that settles by itself          Cam.rkick(deg)  quick roll punch
//   Cam.tiltTo(deg, frames)  the TILT channel (used by the difficulty tilt)        Cam.reset(frames)  back to normal
// ============================================================
const Cam = {
    z: 1, x: 0, y: 0, r: 0, tz: 1, tx: 0, ty: 0, tr: 0, k: 0.1,
    tilt: 0, tt: 0, kt: 0.08, punch: 0, rpunch: 0, fade: 1,
    to(o = {}, frames = 40) {
        const k = 1 - Math.pow(0.03, 1 / Math.max(1, frames));
        this.k = k;
        if (o.focus) { const z = o.zoom ?? this.tz; this.tz = z; this.tx = (W / 2 - o.focus[0]) * z; this.ty = (H / 2 - o.focus[1]) * z; }
        else {
            if (o.zoom !== undefined) this.tz = o.zoom;
            if (o.x !== undefined) this.tx = o.x;
            if (o.y !== undefined) this.ty = o.y;
        }
        if (o.rot !== undefined) this.tr = o.rot;
        if (frames <= 1) { this.z = this.tz; this.x = this.tx; this.y = this.ty; this.r = this.tr; }
    },
    tiltTo(deg, frames = 36) { this.tt = deg; this.kt = 1 - Math.pow(0.03, 1 / Math.max(1, frames)); },
    kick(a = 0.03) { this.punch = Math.max(this.punch, a); },
    rkick(deg = 1) { this.rpunch += deg; },
    reset(frames = 30) { this.to({ zoom: 1, x: 0, y: 0, rot: 0 }, frames); this.tiltTo(0, frames); },
    snap() { Object.assign(this, { z: 1, x: 0, y: 0, r: 0, tz: 1, tx: 0, ty: 0, tr: 0, tilt: 0, tt: 0, punch: 0, rpunch: 0 }); },
    update() {
        const k = this.k;
        this.z += (this.tz - this.z) * k; this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k; this.r += (this.tr - this.r) * k;
        this.tilt += (this.tt - this.tilt) * this.kt;
        this.punch *= 0.86; this.rpunch *= 0.9;
        if (this.punch < 0.0004) this.punch = 0;
        if (Math.abs(this.rpunch) < 0.01) this.rpunch = 0;
    },
    css() {
        const lvl = Settings.cam, f = this.fade;
        if (lvl <= 0 || f < 0.01) return "";
        const rot = (this.r + (lvl >= 2 ? this.tilt + this.rpunch : 0)) * f;
        const z = 1 + ((this.z * (1 + this.punch) * (1 - (lvl >= 2 ? Math.abs(this.tilt) * 0.003 : 0))) - 1) * f;
        const x = this.x * f, y = this.y * f;
        if (Math.abs(z - 1) < 0.0005 && Math.abs(x) < 0.05 && Math.abs(y) < 0.05 && Math.abs(rot) < 0.01) return "";
        return `translate(${(x / W * 100).toFixed(3)}%, ${(y / H * 100).toFixed(3)}%) rotate(${rot.toFixed(3)}deg) scale(${z.toFixed(4)})`;
    }
};

// ---------- cinema bars (black strips at the top and bottom of the screen) ----------
const Bars = {
    a: 0, t: 0, spd: 0.025, size: 54,
    to(v, frames = 40) { this.t = v === true ? 1 : v === false ? 0 : clamp(+v || 0, 0, 1); this.spd = 1 / Math.max(1, frames); },
    snap() { this.a = this.t = 0; },
    update() { this.a = this.a < this.t ? Math.min(this.t, this.a + this.spd) : Math.max(this.t, this.a - this.spd); },
    draw() {
        if (this.a <= 0.001) return;
        const e = this.a * this.a * (3 - 2 * this.a), h = Math.round(this.size * e);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
        if (VFX.on && h > 4) { ctx.fillStyle = rgba(VFX.mote, 0.35 * e); ctx.fillRect(0, h - 1, W, 1); ctx.fillRect(0, H - h, W, 1); }
    }
};

// ============================================================
// VFX  ("off" | "low" | "high", press V in game to switch)
//   low  = bottom gradient + small sparks + hit flashes + shockwave rings
//   high = low + stars, light shafts, floating motes, enemy aura, glow, bullet trails, soul trail, vignette, low-HP pulse
// ============================================================
const VFX = {
    level: "high", color: "#4b1a86", mote: "#a77bd9", parts: [], rings: [], floats: [], flashA: 0, flashC: "#fff", flashDecay: 0.05,
    t: 0, vig: null, vigRed: null, glow: 0, stars: null,
    init(cfg) {
        if (typeof cfg === "string") cfg = { level: cfg };
        cfg = cfg || {};
        if (["off", "low", "high"].includes(cfg.level)) this.level = cfg.level;
        if (Settings.vfx) this.level = Settings.vfx;           // the player's own choice wins
        if (cfg.color) this.color = cfg.color;
        if (cfg.mote) this.mote = cfg.mote;
    },
    get on() { return this.level !== "off"; },
    get high() { return this.level === "high"; },
    cycle() {
        const L = ["off", "low", "high"];
        this.level = L[(L.indexOf(this.level) + 1) % 3];
        this.parts.length = 0; this.rings.length = 0;
        Settings.vfx = this.level; Settings.save();
        return this.level;
    },
    flash(color = "#fff", frames = 10, alpha = 0.5) {
        if (!this.on) return;
        alpha *= Settings.flashK;
        this.flashC = color; this.flashA = alpha; this.flashDecay = alpha / Math.max(1, frames);
    },
    // the background lights up for a moment (use it on beats / big hits)
    pulse(a = 0.5) { if (this.on) this.glow = Math.max(this.glow, a * (this.high ? 1 : 0.6)); },
    // spawn(x, y, count, {color, speed, minSpeed, life, size, gravity, angle, spread, shape: "square"|"circle"|"line", shrink, add})
    spawn(x, y, n = 8, o = {}) {
        if (!this.on) return;
        n = Math.ceil(n * (this.high ? 1 : 0.4));
        for (let i = 0; i < n && this.parts.length < 420; i++) {
            const sp = rand(o.minSpeed ?? 0.5, o.speed ?? 3);
            const ang = o.angle != null ? (o.angle + rand(-1, 1) * (o.spread ?? 30)) * RAD : rand(0, Math.PI * 2);
            this.parts.push({
                x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: o.gravity ?? 0, drag: o.drag ?? 1,
                life: o.life ?? randInt(18, 38), age: 0, size: o.size ?? randInt(2, 4), color: o.color || "#fff",
                shape: o.shape || "square", shrink: !!o.shrink, add: !!o.add
            });
        }
    },
    // an expanding ring (shockwave): VFX.ring(x, y, { r0, r1, life, w, color })
    ring(x, y, o = {}) {
        if (!this.on) return;
        if (this.rings.length > 26) this.rings.shift();
        this.rings.push({ x, y, r0: o.r0 ?? 6, r1: o.r1 ?? 80, life: o.life ?? 26, age: 0, w: o.w ?? 4, color: o.color || "#fff" });
    },
    // floating text (damage numbers...): VFX.float(x, y, "-9", { color, size, life })   (shown even when VFX is off: it is information)
    float(x, y, str, o = {}) {
        if (this.floats.length > 12) this.floats.shift();
        this.floats.push({ x, y, str: String(str), age: 0, life: o.life ?? 54, color: o.color || "#fff", size: o.size ?? 22, vy: o.vy ?? -0.7 });
    },
    update() {
        this.t++;
        if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - this.flashDecay);
        if (this.glow > 0) this.glow = Math.max(0, this.glow - 0.022);
        if (this.high && this.t % 7 === 0 && this.parts.length < 160) {
            this.parts.push({ x: rand(0, W), y: H + 4, vx: rand(-0.2, 0.2), vy: -rand(0.25, 0.7), g: 0, drag: 1, life: 230, age: 0, size: 2, color: this.mote, amb: true, alpha: 0.55, shape: "square" });
        }
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const p = this.parts[i];
            p.x += p.vx; p.y += p.vy; p.vy += p.g;
            if (p.drag !== 1) { p.vx *= p.drag; p.vy *= p.drag; }
            if (++p.age >= p.life) this.parts.splice(i, 1);
        }
        for (let i = this.rings.length - 1; i >= 0; i--) if (++this.rings[i].age >= this.rings[i].life) this.rings.splice(i, 1);
        for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.y += f.vy; f.vy *= 0.96; if (++f.age >= f.life) this.floats.splice(i, 1); }
    },
    drawParts(amb) {
        for (const p of this.parts) {
            if (!!p.amb !== amb) continue;
            const k = p.age / p.life, sz = Math.max(1, p.size * (p.shrink ? 1 - k : 1));
            ctx.globalAlpha = (p.alpha ?? 1) * (1 - k);
            ctx.fillStyle = ctx.strokeStyle = p.color;
            if (p.add) ctx.globalCompositeOperation = "lighter";
            if (p.shape === "circle") { ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.7, 0, Math.PI * 2); ctx.fill(); }
            else if (p.shape === "line") {
                ctx.lineWidth = Math.max(1, sz * 0.6);
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
            } else ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
            if (p.add) ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = 1;
    },
    starField() {
        if (this.stars) return this.stars;
        this.stars = [];
        for (let i = 0; i < 70; i++) this.stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() < 0.2 ? 2 : 1, sp: 0.05 + Math.random() * 0.22, ph: Math.random() * 6.28 });
        return this.stars;
    },
    drawBack() {          // the soft gradient at the bottom + stars + light shafts + floating motes
        if (!this.on) return;
        const pulse = this.high ? 0.5 + 0.5 * Math.sin(this.t / 70) : 0.5, g0 = this.glow;
        if (this.high) {                                                         // slow drifting stars (parallax: bigger ones move faster)
            ctx.fillStyle = this.mote;
            for (const s of this.starField()) {
                s.y -= s.sp; if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
                ctx.globalAlpha = (0.12 + 0.2 * (0.5 + 0.5 * Math.sin(this.t / 30 + s.ph))) * (1 + g0);
                ctx.fillRect(s.x | 0, s.y | 0, s.s, s.s);
            }
            ctx.globalAlpha = 1;
            for (let i = 0; i < 3; i++) {                                         // soft light shafts
                ctx.save();
                ctx.translate(W * (0.18 + 0.32 * i) + Math.sin(this.t / 230 + i * 2) * 46, -40);
                ctx.rotate(0.2);
                const lg = ctx.createLinearGradient(-34, 0, 34, 0);
                lg.addColorStop(0, rgba(this.color, 0)); lg.addColorStop(0.5, rgba(this.color, 0.075 + 0.05 * pulse + 0.1 * g0)); lg.addColorStop(1, rgba(this.color, 0));
                ctx.fillStyle = lg; ctx.fillRect(-34, 0, 68, H + 160);
                ctx.restore();
            }
        }
        const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
        g.addColorStop(0, rgba(this.color, 0));
        g.addColorStop(1, rgba(this.color, Math.min(0.95, 0.4 + 0.2 * pulse + 0.35 * g0)));
        ctx.fillStyle = g;
        ctx.fillRect(0, H * 0.5, W, H * 0.5);
        if (g0 > 0.02) {                                                         // beat / hit pulse: the top edge glows too
            const tg = ctx.createLinearGradient(0, 0, 0, H * 0.35);
            tg.addColorStop(0, rgba(this.color, 0.4 * g0)); tg.addColorStop(1, rgba(this.color, 0));
            ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H * 0.35);
        }
        this.drawParts(true);
    },
    drawFront() {
        if (!this.on) return;
        this.drawParts(false);
        if (this.high) {
            if (!this.vig) {
                const mk = (rgb) => {
                    const c = document.createElement("canvas");
                    c.width = W; c.height = H;
                    const g = c.getContext("2d");
                    const rg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
                    rg.addColorStop(0, `rgba(${rgb},0)`);
                    rg.addColorStop(1, `rgba(${rgb},0.55)`);
                    g.fillStyle = rg;
                    g.fillRect(0, 0, W, H);
                    return c;
                };
                this.vig = mk("0,0,0"); this.vigRed = mk("255,0,30");
            }
            ctx.drawImage(this.vig, 0, 0);
            if (typeof B !== "undefined" && B && G && B.state === "attack" && B.hp / G.player.maxHp < 0.3) {          // low HP: the screen edges throb red
                const beat = Math.pow(0.5 + 0.5 * Math.sin(this.t / 9), 3);
                ctx.globalAlpha = (0.25 + 0.55 * beat) * (1 - B.hp / (G.player.maxHp * 0.3) * 0.5);
                ctx.drawImage(this.vigRed, 0, 0);
                ctx.globalAlpha = 1;
            }
        }
        for (const r of this.rings) {
            const k = r.age / r.life, e = 1 - Math.pow(1 - k, 3);
            ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(0.5, r.w * (1 - k));
            ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (const f of this.floats) {
            ctx.save();
            const k = f.age / f.life;
            ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
            ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
            text(f.str, f.x, f.y, f.size * (k < 0.12 ? 0.7 + 2.5 * k : 1), f.color, "center");
            ctx.restore();
        }
        if (this.flashA > 0) {
            ctx.globalAlpha = this.flashA;
            ctx.fillStyle = this.flashC;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
    }
};

// ============================================================
// Typewriter text
// ============================================================
class Typer {
    constructor(lines, o = {}) {
        this.lines = (Array.isArray(lines) ? lines : [lines]).map(String);
        this.i = 0; this.n = 0; this.t = 0; this.wait = 0;
        this.speed = o.speed ?? 2;
        this.auto = o.auto || 0;       // auto-advance after N frames (speech bubbles)
        this.hold = !!o.hold;          // true = just show text, never advance
        this.voice = o.voice || "dialogue";
        this.onDone = o.onDone || null;
        this.done = false;
    }
    get current() { return this.lines[this.i] || ""; }
    get complete() { return this.n >= this.current.length; }
    advance() {
        this.i++; this.n = 0; this.wait = 0;
        if (this.i >= this.lines.length) {
            this.done = true;
            this.i = this.lines.length - 1;
            this.n = this.current.length;
            if (this.onDone) this.onDone();
        }
    }
    update() {
        if (this.done) return;
        if (!this.complete) {
            if (++this.t >= this.speed) {
                this.t = 0; this.n++;
                const c = this.current[this.n - 1];
                if (c && c !== " " && c !== "\n" && this.n % 2 === 0) Sound.voice(this.voice);
            }
            if (Input.cancel()) this.n = this.current.length;   // X skips typing
            return;
        }
        if (this.hold) return;
        if (this.auto) { if (++this.wait >= this.auto) this.advance(); }
        else if (Input.confirm()) this.advance();
    }
}

function drawTyped(t, x, y, maxW, px, lh, color = "#fff", align = "left") {
    ctx.font = `${px}px ${FONT}`;
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top";
    let rem = t.n;
    for (const line of wrap(t.current, maxW)) {
        if (rem <= 0) break;
        const ox = align === "center" ? (maxW - ctx.measureText(line).width) / 2 : 0;
        ctx.fillText(line.slice(0, rem), x + ox, y);
        rem -= line.length + 1;
        y += lh;
    }
}

// ============================================================
// Battle
// ============================================================
let G = null;   // the game config (game.js)
let B = null;   // runtime battle state

const WATERMARK = "Dumb_Artist's UT Battle engine  v0.1.0";
const MENU = ["FIGHT", "ACT", "ITEM", "MERCY"];
const BOX_MENU = { x: 32, y: 250, w: 576, h: 135 };
const BOX_BOTTOM = 385, BORDER = 5;
const ATK_WAIT = 18;                         // frames to let the box finish resizing
const GRAVITY = 0.28, JUMP = 6.6, MAX_FALL = 7;
// ORANGE soul: the player has to keep moving. Standing still for ORANGE_GRACE frames hurts (then again every second until you move).
// ORANGE_START = head start (negative = extra frames of peace) when the soul turns orange, so the player can react.
const ORANGE_GRACE = 20, ORANGE_START = -60, ORANGE_DMG = 3, ORANGE_COL = "#ff8a1a";
const TEXT_PX = 28, TEXT_LH = 34;

const DEFAULTS = {
    title: "My Game",
    player: { name: "CHARA", lv: 1, maxHp: 20, atk: 10 },
    enemy: { name: "Enemy", hp: 60, def: 0, exp: 10, gold: 5, flavor: ["* It's here."], acts: [] },
    items: [], attacks: {}, turns: [{ attack: null }], phases: []
};

// "Check" + the enemy's own acts (rebuilt whenever a new phase starts)
function buildActs(en) {
    return [{ name: "Check", text: en.check || [`* ${en.name.toUpperCase()} - ATK 5 DEF ${en.def}`, "* A mysterious fellow."] }, ...(en.acts || [])];
}

function newBattle() {
    return {
        state: "", frame: 0, hp: G.player.maxHp, enemyHp: G.enemy.hp, enemyMax: G.enemy.hp, turn: 0, totalTurns: 0,
        phase: 0, enemy: G.enemy, attacks: G.attacks || {}, turnsDef: G.turns, cs: null, defeating: false, menuFlavor: null,
        dodged: 0, blocked: 0, blockGoal: 0, ui: { box: 1, hud: 1 }, btn: [null, null, null, null], gone: [false, false, false, false], rb: null,
        survival: false, end: null, dust: null, boxLerp: 0.22, hpLag: G.player.maxHp, boxPulse: 0, _sig: "", menuSoul: null,
        tiltCfg: null, tilt: null, int: [], sb: null, turnInt: 0, idleT: 0, slashT: -1, pendingMusic: false,
        menuIdx: 0, spareable: false, items: G.items.map((i) => ({ ...i })),
        acts: buildActs(G.enemy),
        typer: null, list: null, fight: null, pop: null, cur: null, api: null,
        box: { ...BOX_MENU }, boxT: { ...BOX_MENU },
        soul: { x: 320, y: 300, w: 20, h: 20, hit: 10, speed: 3, mode: "red", vy: 0, grounded: false, jumping: false, moving: false, walked: false, idle: 0, gdir: 0, slamming: false },
        bullets: [], atk: null, atkFrame: 0, invuln: 0, trail: [], orangeHint: 0, fin: null,
        enemyShake: 0, enemyAlpha: 1, fade: false, enemyKey: G.enemy.sprite ? "enemy" : null,
        vars: { ...(G.vars || {}) }, timers: [], flavor: null, go: null
    };
}

const inner = (r) => ({ left: r.x + BORDER, top: r.y + BORDER, right: r.x + r.w - BORDER, bottom: r.y + r.h - BORDER, w: r.w - 2 * BORDER, h: r.h - 2 * BORDER });
// the outer rectangle of a battle box. cx/cy = where its center should be (omit = centered, sitting on the bottom line).
// Explicit positions are kept on screen and above the HP bar.
function boxRect(w, h, cx, cy) {
    let x = (cx == null ? W / 2 : cx) - w / 2;
    let y = cy == null ? BOX_BOTTOM - h : cy - h / 2;
    x = clamp(x, 8, W - 8 - w);
    if (cy != null) y = clamp(y, 40, 388 - h);
    return { x, y, w, h };
}
const setBoxMenu = () => { B.boxT = { ...BOX_MENU }; B.boxLerp = 0.22; };
// spd = how fast the box slides to its new place (0.22 default, 0.3+ = snappy)
const setBoxSize = (w, h, cx, cy, spd) => { B.boxT = boxRect(w, h, cx, cy); B.boxLerp = spd || 0.22; };
const flavor = () => {
    const f = B.flavor || B.enemy.flavor;
    return Array.isArray(f) ? pick(f) : f;
};
const hook = (name, ...args) => call("hook " + name, G && G[name], G, GameApi, ...args);

function enter(state, data) {
    if (B.state === "gameover" && state !== "gameover") return;     // e.g. g.damage() killing the soul inside an act
    B.state = state;
    const s = States[state];
    if (s && s.enter) s.enter(data);
}

function say(lines, next) { enter("text", { lines, next }); }

function openList(kind) {
    let items;
    if (kind === "act") items = B.acts.map((a) => ({ label: a.name }));
    else if (kind === "item") items = B.items.map((i) => ({ label: i.name, sub: i.heal ? "+" + i.heal + " HP" : "" }));
    else items = [{ label: "Spare", color: B.spareable ? "#ff0" : "#fff" }, { label: "Flee" }];
    B.list = { kind, items, idx: 0 };
    enter("list");
}

function enemyTurn() {
    B.fight = null; B.int = []; B.sb = null; B.turnInt = 0; B.idleT = 0; B.slashT = -1;
    const turns = B.turnsDef;
    const t = typeof turns === "function" ? call("turns()", turns, G, B.turn, GameApi) : (turns && turns.length ? turns[B.turn % turns.length] : null);
    B.cur = t && typeof t === "object" ? t : { attack: null };
    hook("onTurnStart", B.turn);
    if (B.cur.say) enter("speech"); else startAttack();
}

function endTurn() {
    hook("onTurnEnd", B.turn);
    B.turn++; B.totalTurns++;
    if (B.pendingMusic) { B.pendingMusic = false; startFightMusic(); }
    else if (G.flashAfterFirstAttack && B.phase === 0 && B.totalTurns === 1) firstAttackFlash();
    enter("menu");
}

// game.js -> musicAfterFirstAttack: true  = the battle music stays silent until the first attack is over, then it kicks in with a flash + shockwave
function startFightMusic() {
    Engine.startMusic();
    VFX.flash("#fff", 22, 0.5); VFX.pulse(1); Engine.shake(4, 10); Cam.kick(0.045);
    VFX.ring(320, 140, { r1: 230, life: 44, w: 7, color: VFX.mote });
    VFX.ring(320, 140, { r1: 150, life: 30, w: 4, color: "#fff" });
    VFX.spawn(320, 140, 40, { color: VFX.mote, speed: 7, minSpeed: 2, life: 40, shape: "line", add: true });
}

// game.js -> flashAfterFirstAttack: true  = the screen flashes (white-out + shockwave) the moment the first attack of phase 1 is over (the music is already playing)
function firstAttackFlash() {
    VFX.flash("#fff", 34, 0.9); VFX.pulse(1); Engine.shake(6, 14); Cam.kick(0.05);
    VFX.ring(320, 300, { r1: 260, life: 46, w: 8, color: "#fff" });
    VFX.ring(320, 300, { r1: 150, life: 30, w: 4, color: VFX.mote });
    VFX.spawn(320, 300, 40, { color: "#fff", speed: 7, minSpeed: 2, life: 40, shape: "line", add: true });
}

function startAttack() {
    const at = B.cur.attack;
    const a = at && typeof at === "object" ? at : B.attacks[at];
    if (!a) {
        if (at) Engine.error("Unknown attack: " + at);
        endTurn(); return;
    }
    enter("attack", a);
}

function hurt(dmg, force) {
    if (B.state === "gameover" || (B.invuln > 0 && !force)) return;
    const r = hook("onHurt", dmg);
    if (typeof r === "number") dmg = r;
    dmg = Math.max(0, Math.round(dmg));
    B.hp -= dmg;
    B.invuln = 60;
    Sound.play("hurt");
    Engine.shake(4 + Math.min(6, dmg * 0.25), 10);
    VFX.flash("#f00", 10, 0.28);
    VFX.spawn(B.soul.x, B.soul.y, 10, { color: "#f33", speed: 4 });
    if (dmg > 0) {
        VFX.float(B.soul.x, B.soul.y - 22, "-" + dmg, { color: "#ff5a5a", size: 20 });
        VFX.ring(B.soul.x, B.soul.y, { r1: 30 + dmg * 1.6, life: 22, w: 4, color: "#f33" });
        VFX.pulse(0.25);
    }
    if (dmg >= 8) { Engine.aberrate(3 + dmg * 0.25, 14); Cam.kick(0.01 + dmg * 0.001); }
    if (dmg >= 6) Engine.freeze(dmg >= 12 ? 3 : 2);                 // hit-stop: the game holds its breath for a moment
    if (B.hp <= 0) { B.hp = 0; enter("gameover"); }
}

// ---------- Phases: when the enemy HP hits 0 the next phase (game.js -> phases: [...]) starts ----------
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

function enemyDefeated() {
    if (B.defeating || ["gameover", "win", "cutscene", "ending", "finale", "rebirth"].includes(B.state)) return;
    if (B.survival) { if (B.state === "attack") survivalOver(); return; }       // (F4 debug) skip the survival fight
    B.defeating = true;
    if (G.phases[B.phase]) startCutscene(B.phase + 1);
    else enter("win", "kill");
}

// idx = 1 for the first extra phase (phase 2), 2 for phase 3...
function startCutscene(idx) {
    const p = G.phases[idx - 1];
    B.bullets = []; B.atk = null; B.invuln = 0; B.fight = null;
    if (!p.cutscene || !p.cutscene.length) { beginPhase(idx, false); return; }
    B.cs = newCs(idx, p, p.cutscene);
    enter("cutscene");
}

function newCs(idx, p, steps) {
    return {
        idx, p, steps, i: -1, s: null, typer: null, t: 0, skip: 0, ui: false, phaseMusic: false,
        dark: 0, darkT: 0, darkSpd: 0, fadeT: B.enemyAlpha, fadeSpd: 0, flashA: 0, flashC: "#fff",
        uiT: 1, uiSpd: 0, soulA: 0, soulT: 0, soulAt: [320, 330]
    };
}

// ---------- the OPENING (game.js -> opening: { skippable, steps: [...] }): a cutscene before the very first turn of phase 1 ----------
// It uses the same step keys as the phase cutscenes (see README), starting in the dark with the box + HUD hidden.
function startOpening() {
    const o = G.opening;
    B.bullets = []; B.atk = null; B.enemyAlpha = 0; B.ui = { box: 0, hud: 0 };
    B.cs = newCs(0, { skippable: o.skippable !== false }, o.steps || []);
    B.cs.dark = B.cs.darkT = 1;
    enter("cutscene");
}
function openingDone() {
    Bars.to(0, 40); Cam.reset(36);
    B.cs = null; B.enemyAlpha = 1; B.ui = { box: 1, hud: 1 }; B.enemyShake = 0;
    if (!G.musicAfterFirstAttack && (!Engine.music || Engine.musicSrc !== G.music)) Engine.startMusic();     // (skipped the opening before the music step)
    if (G.enemyFirst) enemyTurn(); else enter("intro");
}

function csBegin(def) {
    const c = B.cs, s = { ...def, t: 0 };
    c.s = s; c.typer = null;
    if (s.ui !== undefined) c.ui = !!s.ui;
    if (s.dark !== undefined) { c.darkT = s.dark; c.darkSpd = Math.abs(s.dark - c.dark) / Math.max(1, s.frames ?? 30); }
    if (s.fadeEnemy !== undefined) { c.fadeT = s.fadeEnemy; c.fadeSpd = Math.abs(s.fadeEnemy - B.enemyAlpha) / Math.max(1, s.frames ?? 30); }
    if (s.sprite) B.enemyKey = s.sprite === "next" ? (c.p.enemy && c.p.enemy.sprite ? "enemyP" + c.idx : B.enemyKey) : s.sprite;
    if (s.music !== undefined) {
        if (s.music === "next") { c.phaseMusic = true; Engine.playMusic(c.p.music !== undefined ? c.p.music : G.music); }
        else Engine.playMusic(s.music, { loop: s.loop, volume: s.volume });
    }
    if (s.sfx) Sound.play(s.sfx, s.sfxVolume);
    if (s.slash) Slash.spawn(typeof s.slash === "object" ? s.slash : {});
    // ---- cinematic keys: cam / bars / camera punches / title card / the soul ----
    if (s.uiIn !== undefined) { c.ui = true; c.uiT = 1; c.uiSpd = 1 / Math.max(1, s.uiIn); }      // the box + HUD fade in over uiIn frames
    if (s.bars !== undefined) Bars.to(s.bars, s.barsFrames ?? 40);                               // bars: true | false | 0..1
    if (s.cam) { if (s.cam === "reset") Cam.reset(s.camFrames ?? 30); else Cam.to(s.cam, s.cam.frames ?? 40); }   // cam: { zoom, x, y, rot, focus: [px, py], frames }
    if (s.kick) Cam.kick(s.kick);
    if (s.rkick) Cam.rkick(s.rkick);
    if (s.aberrate) Engine.aberrate(...(Array.isArray(s.aberrate) ? s.aberrate : [8, 30]));
    if (s.freeze) Engine.freeze(s.freeze);
    if (s.pulse) VFX.pulse(s.pulse);
    if (s.ring) VFX.ring(...s.ring);
    if (s.soul !== undefined) { if (s.soul) c.soulAt = s.soul === true ? c.soulAt : s.soul; c.soulT = s.soul ? 1 : 0; }
    if (s.shake) Engine.shake(...(Array.isArray(s.shake) ? s.shake : [6, 20]));
    if (s.glitch) Engine.glitch(typeof s.glitch === "number" ? s.glitch : 10, 1.2);          // glitch: frames
    if (s.flash) { c.flashA = 1; c.flashC = typeof s.flash === "string" ? s.flash : "#fff"; }
    if (s.hit) { B.enemyShake = typeof s.hit === "number" ? s.hit : 40; Sound.play("hit"); VFX.spawn(320, 130, 18, { color: "#fff", speed: 5 }); }
    if (s.particles) VFX.spawn(...s.particles);
    call("cutscene fn", s.fn, s, GameApi, c);
    if (s.say !== undefined) c.typer = new Typer(s.say, { auto: s.auto ?? 70, voice: s.voice || B.enemy.voice });
    else if (s.text !== undefined) c.typer = new Typer(s.text, { auto: s.auto ?? 0, speed: s.speed ?? 3, voice: s.voice });
    s.dur = s.wait ?? s.frames ?? 0;
}

function csAdvance() {
    const c = B.cs;
    for (let guard = 0; guard < 300; guard++) {
        c.i++;
        if (c.i >= c.steps.length) break;
        csBegin(c.steps[c.i]);
        if (c.typer || c.s.dur > 0) return;        // steps with nothing to wait for (only sfx, shake...) fall through
    }
    csFinish();
}

function csFinish() {
    const c = B.cs;
    if (!c) return;
    if (c.idx === 0) { openingDone(); return; }               // idx 0 = the phase 1 opening
    B.cs = null;
    beginPhase(c.idx, c.phaseMusic);
}

function beginPhase(idx, musicStarted, retry) {
    const p = G.phases[idx - 1];
    B.phase = idx;
    Slash.reset();                                  // every phase starts with a slash that drifts RIGHT
    B.enemy = { ...G.enemy, ...(p.enemy || {}) };
    B.enemyMax = Math.max(1, p.hp ?? G.enemy.hp);
    B.enemyHp = B.enemyMax;
    B.attacks = { ...(G.attacks || {}), ...(p.attacks || {}) };
    B.turnsDef = p.turns || G.turns;
    B.turn = 0; B.flavor = null; B.menuFlavor = null; B.spareable = false; B.defeating = false;
    B.dodged = 0; B.survival = false; B.dust = null; B.end = null;
    const bl = B.enemy.blocks;                       // enemy.blocks: N or [min, max] = Sans BLOCKS your attacks, after that many the phase ends
    B.blocked = 0; B.blockGoal = Array.isArray(bl) ? randInt(bl[0], bl[1]) : (bl | 0); B.vars.blocked = 0;
    B.ui = { box: 1, hud: 1 }; B.btn = B.gone.map((g) => (g ? { t: 999, slash: true } : null)); B.rb = null;
    B.fade = false; B.enemyAlpha = 1; B.enemyShake = 0; B.fight = null; B.pop = null; B.cs = null;
    B.tiltCfg = p.tilt ? { ...TILT_DEF, ...p.tilt } : null; B.tilt = null; B.int = []; B.sb = null; B.slashT = -1;       // phase option tilt: { max, chance, every, first, hold, warn }
    B.bullets = []; B.invuln = 0;
    B.acts = buildActs(B.enemy);
    if (p.items) B.items = p.items.map((i) => ({ ...i }));
    if (p.enemy && p.enemy.sprite) B.enemyKey = "enemyP" + idx;
    if (p.heal) { B.hp = clamp(B.hp + p.heal, 0, G.player.maxHp); Sound.play("heal"); }
    if (p.rebirth && !retry) { Engine.stopMusic(); hook("onPhaseStart", idx + 1); enter("rebirth"); return; }      // (no music yet: the rebirth scene starts it)
    if (p.rebirth) { B.btn = B.btn.map(() => ({ t: 999 })); B.hp = G.player.maxHp; }                            // retry after Game Over: skip the long intro
    if (!musicStarted) Engine.playMusic(p.music !== undefined ? p.music : G.music);
    hook("onPhaseStart", idx + 1);
    if (p.survival) { startSurvival(p); return; }
    const go = () => {
        if (p.intro) say(p.intro, p.enemyFirst ? enemyTurn : () => enter("menu"));
        else if (p.enemyFirst) enemyTurn();
        else enter("menu");
    };
    if (p.mercySlash) enter("mercyslash", { delay: p.mercySlash.delay ?? 60, next: go });      // phase option mercySlash: { delay }
    else go();
}

// A survival phase (game.js -> phases[n].survival = "attackName"): no menu, no turns - one long attack, then the ending.
function startSurvival(p) {
    const at = typeof p.survival === "object" ? p.survival : B.attacks[p.survival];
    if (!at) { Engine.error("Unknown survival attack: " + p.survival); enter("win", "kill"); return; }
    B.survival = true;
    B.cur = { attack: at };
    enter("attack", at);
}

// ---------- Script API: "g" in hooks / acts / items / turns, and the base of "a" in attacks ----------
const GameApi = {
    get vars() { return B.vars; },                 // your own variables, reset every new battle (start values: Game.vars)
    get turn() { return B.turn; },
    get hp() { return B.hp; },
    get maxHp() { return G.player.maxHp; },
    get enemyHp() { return B.enemyHp; },
    get enemyMaxHp() { return B.enemyMax; },
    get phase() { return B.phase + 1; },           // 1 = first phase, 2 = next phase...
    get phaseCount() { return G.phases.length + 1; },
    get totalTurns() { return B.totalTurns; },
    get spareable() { return B.spareable; },
    heal(n = 0) {
        B.hp = clamp(B.hp + n, 0, G.player.maxHp); Sound.play("heal");
        VFX.spawn(262 + Math.min(G.player.maxHp * 1.25, 200) * 0.5, 409, 14, { color: "#ff0", speed: 2.4, life: 36, gravity: -0.03, shape: "circle", add: true });
    },
    damage(n = 1) { hurt(n, true); },              // hurt the player (ignores i-frames)
    hurtEnemy(n = 1) {
        B.enemyHp = Math.max(0, B.enemyHp - n);
        B.pop = { text: String(n), t: 0, hp: true };
        B.enemyShake = 30;
        if (B.enemyHp <= 0) B.timers.push({ t: 1, fn: enemyDefeated });
    },
    setSpareable(v = true) { B.spareable = !!v; },
    setFlavor(v) { B.flavor = v; },                // string or array of menu flavor texts
    setEnemySprite(key) { B.enemyKey = key; },     // key from Game.images
    flash(color, frames, alpha) { VFX.flash(color, frames, alpha); },
    shake(amt, frames) { Engine.shake(amt, frames); },
    // g.glitch(frames, power): the whole screen tears / flickers for a split second (needs VFX on).  g.aberrate(px, frames): red/cyan colour split
    glitch(frames, power) { Engine.glitch(frames, power); },
    aberrate(px, frames) { Engine.aberrate(px, frames); },
    // camera: g.cam({ zoom: 1.2, x, y, rot, focus: [px, py] }, frames) or g.cam("reset", frames) / g.camKick(0.03) quick zoom punch / g.tilt(deg, frames)
    // g.bars(true | false, frames) cinema bars / g.freeze(frames) hit-stop / g.pulse(0..1) background pulse / g.ring(x, y, {r1, life, w, color}) / g.float(x, y, "text", {color})
    cam(o, frames) { if (!o || o === "reset") Cam.reset(frames ?? 30); else Cam.to(o, frames ?? o.frames ?? 40); },
    camKick(a) { Cam.kick(a); },
    tilt(deg, frames) { Cam.tiltTo(deg, frames); },
    bars(v, frames) { Bars.to(v, frames); },
    freeze(n) { Engine.freeze(n); },
    pulse(a) { VFX.pulse(a); },
    ring(x, y, o) { VFX.ring(x, y, o); },
    float(x, y, str, o) { VFX.float(x, y, str, o); },
    pageTitle(str) { document.title = str; },        // change the browser tab's title (4th wall!). It is restored on restart / title screen
    popup(o) { return Popups.spawn(o); },            // jump-scare picture, see Popups
    sound(name, vol) { Sound.play(name, vol); },
    music(src, o) { Engine.playMusic(src, o); },
    stopMusic() { Engine.stopMusic(); },
    after(frames, fn) { B.timers.push({ t: Math.max(1, frames), fn }); },
    particles(x, y, n, o) { VFX.spawn(x, y, n, o); },
    // g.slash() / a.slash(): Sans slashes - sound + the slash gif on him (60% opacity, drifts right, then left, then right...). Options: { dir: 1 | -1, frames, dist, opacity, volume }
    slash(o) { return Slash.spawn(o); },
    vfx(level) { if (["off", "low", "high"].includes(level)) VFX.level = level; return VFX.level; },
    vfxColor(color, mote) { if (color) VFX.color = color; if (mote) VFX.mote = mote; },     // change the bottom-gradient / mote colors (e.g. per phase)
    rand, randInt, pick
};

function spawnBullet(o) {
    const b = { type: "bone", x: 0, y: 0, w: 14, h: 60, vx: 0, vy: 0, ax: 0, ay: 0, color: "white", damage: 3, horizontal: false, life: Infinity, age: 0, clip: true, ...o };
    B.bullets.push(b);
    return b;
}

// ---------- Gaster Blaster ----------
function makeBlaster(o) {
    const s = B.soul, size = o.size ?? 1;
    const to = o.to || [o.x ?? 320, o.y ?? 90];
    let from = o.from;
    if (!from) {          // slide in from the nearest screen edge
        const dx = to[0] - W / 2, dy = to[1] - H / 2;
        from = Math.abs(dx) * 0.75 > Math.abs(dy) ? [dx < 0 ? -90 : W + 90, to[1]] : [to[0], dy < 0 ? -90 : H + 90];
    }
    const ang = (o.angle != null ? o.angle : Math.atan2(s.y - to[1], s.x - to[0]) / RAD) * RAD;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const arrive = Math.max(1, o.arrive ?? 20), charge = o.charge ?? 28, hold = o.hold ?? 28;
    const fireAt = arrive + charge, rampEnd = fireAt + 6, holdEnd = rampEnd + hold, shrinkEnd = holdEnd + 10, leaveEnd = shrinkEnd + 22;
    const bw = (o.beamW ?? 54) * size, sw = 92 * size;
    const b = spawnBullet({ type: "blaster", x: from[0], y: from[1], w: 0, h: 0, clip: false, damage: o.damage ?? 5, color: o.color || "white", life: leaveEnd + 5 });
    b.ang = ang; b.frame = 0; b.beam = 0; b.fireAt = fireAt; b.holdEnd = holdEnd; b.shrinkEnd = shrinkEnd; b.bw = bw; b.sw = sw;
    b.update = () => {
        const t = b.age;
        if (t === 1 && !o.silent) Sound.play("blasterCharge");
        if (t <= arrive) {
            const k = 1 - Math.pow(1 - t / arrive, 3);
            b.x = lerp(from[0], to[0], k); b.y = lerp(from[1], to[1], k);
        } else {
            let rec = 0;
            if (t >= fireAt && t < shrinkEnd) rec = Math.min(1, (t - fireAt) / 6) * 14 * size;
            else if (t >= shrinkEnd) rec = 14 * size + (t - shrinkEnd) * (t - shrinkEnd) * 0.7;
            b.x = to[0] - cos * rec; b.y = to[1] - sin * rec;
        }
        b.beam = t < fireAt ? 0 : t < rampEnd ? (t - fireAt) / 6 : t < holdEnd ? 1 : t < shrinkEnd ? 1 - (t - holdEnd) / 10 : 0;
        b.frame = t < fireAt ? (t < arrive + charge * 0.4 ? 0 : t < arrive + charge * 0.75 ? 1 : 2) : (t < shrinkEnd ? 3 + (Math.floor(t / 3) % 3) : 2);
        if (t === fireAt) {
            if (!o.silent) Sound.play("blasterFire");
            Engine.shake(o.shake ?? 5, 14);
            VFX.flash("#fff", 8, 0.25);
            VFX.spawn(b.x + cos * sw * 0.45, b.y + sin * sw * 0.45, 14, { color: "#fff", speed: 5, angle: ang / RAD, spread: 35 });
            Cam.kick(0.006 + 0.01 * size); VFX.pulse(0.3);
            VFX.ring(b.x + cos * sw * 0.5, b.y + sin * sw * 0.5, { r1: 28 + 30 * size, life: 16, w: 4, color: "#fff" });
        }
        if (VFX.high && t > fireAt && t < holdEnd && t % 2 === 0) {            // sparks fly off the beam
            const d = rand(70, 560);
            VFX.spawn(b.x + cos * d, b.y + sin * d, 1, { color: "#fff", speed: 2.6, minSpeed: 0.8, life: 18, size: 2, angle: ang / RAD + (Math.random() < 0.5 ? 90 : -90), spread: 25, shape: "line", add: true });
        }
        if (t >= leaveEnd) b.dead = true;
    };
    b.hits = (p) => {
        if (b.beam < 0.25) return false;
        const mx = b.x + cos * sw * 0.42, my = b.y + sin * sw * 0.42;
        const dx = p.x - mx, dy = p.y - my;
        const along = dx * cos + dy * sin, across = -dx * sin + dy * cos;
        return along > 0 && Math.abs(across) < (bw * b.beam) / 2 + p.hit * 0.3;
    };
    b.draw = () => {
        const col = b.color === "blue" ? "#2a8bff" : b.color === "orange" ? "#ff9a00" : "#fff";
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        if (VFX.on && b.age > arrive && b.age < fireAt) {                          // charging: a glow grows in the blaster's mouth
            const k = (b.age - arrive) / charge, mm = sw * 0.42, rr = (6 + 26 * k) * size;
            const gg = ctx.createRadialGradient(mm, 0, 0, mm, 0, rr * 2);
            gg.addColorStop(0, rgba("#ffffff", 0.75 * k)); gg.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = gg; ctx.fillRect(mm - rr * 2, -rr * 2, rr * 4, rr * 4);
        }
        if (b.beam > 0) {
            const m = sw * 0.42, now = bw * b.beam;
            if (VFX.high) { ctx.fillStyle = rgba(col, 0.12); ctx.fillRect(m, -now * 1.3, 1600, now * 2.6); ctx.fillStyle = rgba(col, 0.22); ctx.fillRect(m, -now * 0.85, 1600, now * 1.7); }
            ctx.globalAlpha = 0.85 + 0.15 * Math.sin(b.age * 2.2);
            ctx.fillStyle = col;
            ctx.fillRect(m, -now / 2, 1600, now);
            if (col !== "#fff") { ctx.globalAlpha = 0.75; ctx.fillStyle = "#fff"; ctx.fillRect(m, -now * 0.2, 1600, now * 0.4); }       // white-hot core for coloured beams
            ctx.globalAlpha = 1;
        }
        const img = Assets.get("blaster" + b.frame);
        if (img) { const sh = sw * img.height / img.width; ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh); }
        else { ctx.fillStyle = "#fff"; ctx.fillRect(-sw / 2, -sw * 0.3, sw, sw * 0.6); }
        ctx.restore();
    };
    return b;
}

// ---------- Attack API (what attacks in game.js receive as "a") ----------
function makeApi() {
    const api = Object.create(GameApi);
    Object.defineProperties(api, {
        frame: { get: () => B.atkFrame },
        box: { get: () => inner(B.boxT) },
        soul: { get: () => B.soul }
    });
    Object.assign(api, {
        every(n, offset = 0) { return B.atkFrame >= offset && (B.atkFrame - offset) % n === 0; },
        spawn: spawnBullet,
        bone(o) { return spawnBullet({ type: "bone", ...o }); },
        orb(o) { return spawnBullet({ type: "orb", w: 16, h: o.w || 16, ...o }); },
        // your own picture as a bullet: a.sprite({img:"key", x, y, w, h, vx, vy, rot, spin, color, damage})
        sprite(o) { return spawnBullet({ type: "sprite", w: 24, h: 24, rot: 0, spin: 0, ...o }); },
        // shoot an orb from (x,y) straight at the soul
        aim(x, y, speed = 2.5, o = {}) {
            const sz = o.w || 16, ang = Math.atan2(B.soul.y - y, B.soul.x - x);
            return api.orb({ x: x - sz / 2, y: y - sz / 2, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ...o });
        },
        // a wall of bones sweeping across the box with a gap. side: left|right|top|bottom
        // gap = 0..1 position of the gap along the wall, gapSize in pixels (0 = solid wall)
        wall(side, gap = 0.5, gapSize = 50, speed = 3, o = {}) {
            const r = api.box, th = o.thickness || 14;
            const hor = side === "top" || side === "bottom";
            const span = hor ? r.w : r.h, start = hor ? r.left : r.top;
            const g0 = clamp(gap * span - gapSize / 2, 0, span), g1 = clamp(gap * span + gapSize / 2, 0, span);
            for (const [a, b] of [[0, g0], [g1, span]]) {
                const len = b - a;
                if (len <= 0) continue;
                if (side === "left")   api.bone({ x: r.left - th, y: start + a, w: th, h: len, vx: speed, ...o });
                if (side === "right")  api.bone({ x: r.right, y: start + a, w: th, h: len, vx: -speed, ...o });
                if (side === "top")    api.bone({ x: start + a, y: r.top - th, w: len, h: th, vy: speed, horizontal: true, ...o });
                if (side === "bottom") api.bone({ x: start + a, y: r.bottom, w: len, h: th, vy: -speed, horizontal: true, ...o });
            }
        },
        // a circle of orbs: a.ring({x, y, n, speed, angle, radius, color})   (default: from the box center)
        ring(o = {}) {
            const r = api.box, n = o.n || 12, sp = o.speed || 2, a0 = (o.angle || 0) * RAD, sz = o.w || 16;
            const cx = o.x ?? (r.left + r.right) / 2, cy = o.y ?? (r.top + r.bottom) / 2, out = [];
            for (let i = 0; i < n; i++) {
                const an = a0 + i * 2 * Math.PI / n, c = Math.cos(an), s = Math.sin(an);
                out.push(api.orb({ ...o, x: cx - sz / 2 + c * (o.radius || 0), y: cy - sz / 2 + s * (o.radius || 0), vx: c * sp, vy: s * sp }));
            }
            return out;
        },
        // a fan of orbs: a.fan({x, y, n, arc, angle, speed})   (default: aimed at the soul)
        fan(o = {}) {
            const n = o.n || 5, arc = o.arc ?? 60, sp = o.speed || 2.5, x = o.x ?? W / 2, y = o.y ?? 80, sz = o.w || 16, out = [];
            const base = o.angle != null ? o.angle : Math.atan2(B.soul.y - y, B.soul.x - x) / RAD;
            for (let i = 0; i < n; i++) {
                const an = (base + (n === 1 ? 0 : -arc / 2 + arc * i / (n - 1))) * RAD;
                out.push(api.orb({ ...o, x: x - sz / 2, y: y - sz / 2, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp }));
            }
            return out;
        },
        // Gaster Blaster: a.blaster({to:[x,y], from:[x,y], angle (deg, 0 = right, 90 = down), size, hold, charge, beamW, damage, color})
        blaster: makeBlaster,
        // a.setBox(w, h, cx, cy, speed): resize the box, optionally MOVE it (cx, cy = new center) and set how fast it slides
        setBox(w, h, cx, cy, spd) { setBoxSize(w, h, cx, cy, spd); },
        // a.setMode("blue", "left"): soul mode "red" | "blue" | "orange", gravity direction "down" | "left" | "up" | "right" (blue only)
        // "orange" = the soul must keep MOVING: standing still hurts (see ORANGE_* above, attack options idleDamage / idleGrace)
        setMode(m, dir) {
            const s = B.soul;
            s.mode = m; s.vy = 0; s.jumping = false; s.slamming = false;
            s.idle = m === "orange" ? ORANGE_START : 0;
            if (m === "orange") B.orangeHint = 100;
            if (dir && GDIR[dir] !== undefined) s.gdir = GDIR[dir];
        },
        // a.slam("right", speed): turns the soul blue and throws it against that wall (shake + spark on impact)
        slam(dir = "down", speed = 9) {
            const s = B.soul;
            s.mode = "blue"; s.gdir = GDIR[dir] ?? 0; s.vy = speed; s.grounded = false; s.jumping = false; s.slamming = true;
            VFX.flash("#2a8bff", 8, 0.25);
        },
        // a.warn({x, y, w, h, frames, color, then}): flashing harmless rectangle; when it ends then() runs (spawn the real bullet there)
        warn(o = {}) {
            const frames = Math.max(1, o.frames ?? 24), col = o.color || "#f33";
            const b = spawnBullet({ type: "warn", w: 20, h: 20, damage: 0, ...o, color: col, life: frames + 2 });
            b.hits = () => false;
            b.update = () => { if (b.age >= frames) { b.dead = true; call("warn then", o.then, o, api); } };
            b.draw = () => {
                const k = Math.min(1, b.age / frames);
                ctx.globalAlpha = ((b.age >> 1) % 2 ? 0.5 : 0.22) * (0.5 + 0.5 * k);
                ctx.fillStyle = col;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = col; ctx.lineWidth = 1;
                ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            };
            return b;
        },
        // a.vring(x, y, {r1, life, w, color}): a purely visual shockwave ring (a.ring() makes a circle of ORBS)
        vring(x, y, o) { VFX.ring(x, y, o); },
        // a.at(frame, fn): runs fn(a) once, on exactly that attack frame.  a.at(30, () => a.shake(4, 10))
        at(f, fn) { if (B.atkFrame === f) call("a.at()", fn, null, api); },
        // a.pattern("name", options): runs a reusable pattern from game.js -> patterns: { name(a, o) { ... } }
        pattern(name, o) { const pt = G.patterns && G.patterns[name]; if (!pt) { Engine.error("Unknown pattern: " + name); return; } return call("pattern " + name, pt, null, api, o || {}); },
        // a.finish(): ends this attack at the end of the current frame (e.g. when a song ends)
        finish() { B.atkEnd = B.atkFrame + 1; },
        // a.clear(): removes every bullet (blasters keep firing unless you pass true)
        clear(all) {
            const keep = all ? [] : B.bullets.filter((b) => b.type === "blaster");
            B.bullets.length = 0;
            B.bullets.push(...keep);
        },
        // a.angleTo(x, y): angle in degrees from (x,y) to the soul (use it for blaster angles)
        angleTo(x, y) { return Math.atan2(B.soul.y - y, B.soul.x - x) / RAD; },
        state: {}        // your own per-attack scratch space, fresh every time the attack starts
    });
    return api;
}

// ---------- Soul / bullets ----------
const GDIR = { down: 0, left: 1, up: 2, right: 3 };      // gravity direction of the blue soul

function updateSoul() {
    const s = B.soul, { dx, dy } = Input.dir();
    const slow = Input.held("x", "shift") ? 0.5 : 1;
    const r = inner(B.box), half = s.hit / 2, g = s.gdir || 0, x0 = s.x, y0 = s.y;
    s.moving = dx !== 0 || dy !== 0;
    if (s.mode === "blue") {
        // s.vy = speed along the gravity direction (positive = falling toward the "floor")
        const vert = g === 0 || g === 2;                                              // gravity pulls up/down
        const walk = vert ? dx : dy;                                                  // arrow axis that walks along the floor
        const jump = (g === 0 ? dy < 0 : g === 2 ? dy > 0 : g === 1 ? dx > 0 : dx < 0) || !!Input.pad.z;   // arrow pointing away from the floor (or the on-screen Z button)
        const pull = g === 0 || g === 3 ? 1 : -1;                                     // +1 = gravity points to +x / +y
        if (vert) s.x += walk * s.speed * slow; else s.y += walk * s.speed * slow;
        if (jump && s.grounded) { s.vy = -JUMP; s.grounded = false; s.jumping = true; s.slamming = false; }
        if (s.jumping && !jump && s.vy < -2) s.vy = -2;                               // let go early = shorter jump
        if (s.vy <= MAX_FALL) s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);              // (a slam is faster than MAX_FALL and keeps its speed)
        if (vert) s.y += s.vy * pull; else s.x += s.vy * pull;
        if (s.vy >= 0) s.jumping = false;
    } else {
        const k = dx && dy ? 0.7071 : 1;
        s.x += dx * s.speed * slow * k;
        s.y += dy * s.speed * slow * k;
    }
    s.x = clamp(s.x, r.left + half, r.right - half);
    s.y = clamp(s.y, r.top + half, r.bottom - half);
    s.walked = s.moving && Math.abs(s.x - x0) + Math.abs(s.y - y0) > 0.05;      // held a key AND actually changed place (pushing into a wall does not count)
    if (s.mode === "blue") {
        const onFloor = g === 0 ? s.y >= r.bottom - half : g === 2 ? s.y <= r.top + half : g === 1 ? s.x <= r.left + half : s.x >= r.right - half;
        const onCeil = g === 0 ? s.y <= r.top + half : g === 2 ? s.y >= r.bottom - half : g === 1 ? s.x >= r.right - half : s.x <= r.left + half;
        if (onFloor) {
            if (s.slamming) { s.slamming = false; Engine.shake(5, 10); Sound.play("slam"); VFX.spawn(s.x, s.y, 10, { color: "#2a8bff", speed: 3.5 }); }
            s.vy = 0; s.grounded = true;
        } else s.grounded = false;
        if (onCeil && s.vy < 0) s.vy = 0;
    } else s.grounded = false;
}

// ORANGE soul: every frame spent standing still fills the counter, moving drains it faster. A full counter = damage (then once per second while you stay still)
function orangeTick() {
    const s = B.soul;
    if (s.mode !== "orange") { s.idle = 0; return; }
    const grace = B.atk.idleGrace ?? (G.orange && G.orange.grace) ?? ORANGE_GRACE;
    if (s.walked) s.idle = Math.max(0, s.idle - 4);                              // moving drains the counter (4x faster than standing fills it)
    else s.idle++;
    if (s.idle >= grace) {
        s.idle = grace;                                                          // stays "full" until the i-frames are over
        if (B.invuln <= 0) {
            const dmg = B.atk.idleDamage ?? (G.orange && G.orange.damage) ?? ORANGE_DMG;
            VFX.spawn(s.x, s.y, 8, { color: ORANGE_COL, speed: 3 });
            hurt(dmg);
        }
    }
}

function updateBullets() {
    const s = B.soul, hw = s.hit / 2;
    for (let i = B.bullets.length - 1; i >= 0; i--) {
        const b = B.bullets[i];
        if (!b) continue;
        b.vx += b.ax; b.vy += b.ay;
        b.x += b.vx; b.y += b.vy;
        b.age++;
        if (b.spin) b.rot = (b.rot || 0) + b.spin;
        if (b.update) call("bullet update", b.update, b, b);
        if (b.dead || b.age > b.life || b.x < -300 || b.x > W + 300 || b.y < -300 || b.y > H + 300) {
            B.bullets.splice(i, 1);
            continue;
        }
        if (b.color === "blue" && !s.moving) continue;       // blue: safe when standing still
        if (b.color === "orange" && s.moving) continue;      // orange: safe when moving
        const hit = b.hits ? b.hits(s) : (b.x < s.x + hw && b.x + b.w > s.x - hw && b.y < s.y + hw && b.y + b.h > s.y - hw);
        if (hit) {
            hurt(b.damage);
            if (B.state !== "attack") return;     // died: bullets were cleared
        }
    }
}

function paintBone(spr, x, y, w, h) {
    const cap = spr.height * 0.125;                           // knob size in the source image
    const capD = Math.min(h / 2, w * cap / spr.width);        // knob size on screen (keeps aspect)
    ctx.drawImage(spr, 0, 0, spr.width, cap, x, y, w, capD);
    ctx.drawImage(spr, 0, spr.height - cap, spr.width, cap, x, y + h - capD, w, capD);
    if (h - 2 * capD > 0) ctx.drawImage(spr, 0, cap, spr.width, spr.height - 2 * cap, x, y + capD, w, h - 2 * capD);
}

function drawBullet(b) {
    if (b.draw) { call("bullet draw", b.draw, b, b); return; }
    if (VFX.high && (b.type === "bone" || b.type === "orb") && b.age > 2 && Math.abs(b.vx) + Math.abs(b.vy) > 2.6) {     // fast bullets leave a faint trail
        for (const [k, a] of [[4.4, 0.08], [2.2, 0.17]]) {
            ctx.save(); ctx.globalAlpha = a; ctx.translate(-b.vx * k, -b.vy * k); drawBulletBody(b, false); ctx.restore();
        }
    }
    drawBulletBody(b, true);
}
function drawBulletBody(b, glow) {
    const col = b.color === "blue" ? "#2a8bff" : b.color === "orange" ? "#ff9a00" : null;
    if (VFX.high && glow) { ctx.shadowColor = col || "#fff"; ctx.shadowBlur = 8; }
    if (b.type === "orb") {
        ctx.fillStyle = col || "#fff";
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    if (b.type === "sprite") {
        const spr = sprite(b.img, col);
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate((b.rot || 0) * RAD);
        if (spr) ctx.drawImage(spr, -b.w / 2, -b.h / 2, b.w, b.h);
        else { ctx.fillStyle = col || "#fff"; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); }
        return;
    }
    const spr = sprite("bone", col);
    if (!spr) { ctx.fillStyle = col || "#fff"; ctx.fillRect(b.x, b.y, b.w, b.h); return; }
    if (b.horizontal) {
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate(Math.PI / 2);
        paintBone(spr, -b.h / 2, -b.w / 2, b.h, b.w);
    } else paintBone(spr, b.x, b.y, b.w, b.h);
}

function drawSoul(x, y, w, h, mode, alpha = 1) {
    const spr = mode === "blue" ? sprite("soul", "#1f3cff", true) : mode === "orange" ? sprite("soul", ORANGE_COL, true) : sprite("soul");
    ctx.save();
    ctx.globalAlpha = alpha;
    if (spr) ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
    else { ctx.fillStyle = mode === "blue" ? "#1f3cff" : mode === "orange" ? ORANGE_COL : "#f00"; ctx.fillRect(x - w / 2, y - h / 2, w, h); }
    ctx.restore();
}

// ---------- Sans slash (game.js -> slash: {...}, a.slash() / g.slash(), cutscene step { slash: true }) ----------
// A copy of the slash gif appears ON the enemy at 60% opacity, drifts sideways while it fades out. The first slash drifts RIGHT,
// the second LEFT, the third RIGHT again... (the direction alternates by itself, or pass { dir: 1 | -1 }).
// Defaults can be changed in game.js:  slash: { src, opacity, frames, dist, sound, scale, ax, ay, sx, sy, flip, blend }
const Slash = {
    list: [], count: 0,
    cfg() {
        return Object.assign({
            src: "battle sprites/last-breath phase 2 slash animation clean.gif",
            opacity: 0.6,          // starting opacity (fades to 0)
            frames: 56,            // how long it lives (60 = 1 second)
            dist: 150,             // how far it drifts (pixels of the 640x480 screen)
            sound: "enemySlash",   // sound played on every slash (name from sounds)
            scale: 1.12,           // slash picture height / enemy sprite height
            ax: 0.523, ay: 0.959,  // where Sans stands inside the enemy sprite (fractions of its width / height)...
            sx: 0.5375, sy: 0.9907,// ...and inside the slash picture, so the two Sans line up
            flip: false,           // true = mirror the picture when it drifts left
            blend: "screen"        // "screen" hides the picture's black background on any backdrop ("normal" = no blending)
        }, G && G.slash || {});
    },
    reset() { this.clear(); this.count = 0; },
    clear() { for (const f of this.list) f.el.remove(); this.list.length = 0; },
    spawn(o = {}) {
        if (!B || !stageEl) return null;
        const c = { ...this.cfg(), ...o };
        const dir = o.dir === -1 || o.dir === 1 ? o.dir : (this.count % 2 === 0 ? 1 : -1);
        const n = this.count++;
        const el = document.createElement("img");
        el.alt = ""; el.className = "slashFx";
        const u = url(c.src);
        el.src = u + (u.includes("?") ? "&" : "?") + "s=" + (n % 3);      // 3 different addresses: overlapping slashes never share one animation clock
        el.style.mixBlendMode = c.blend;
        const f = { el, c, dir, t: 0 };
        stageEl.insertBefore(el, canvas);
        this.list.push(f);
        if (c.sound) Sound.play(c.sound, o.volume);
        return { dir, frames: c.frames };
    },
    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const f = this.list[i];
            if (++f.t > f.c.frames) { f.el.remove(); this.list.splice(i, 1); }
        }
    },
    // positions every slash picture on the enemy (called every frame from Battle.draw, after drawEnemy)
    draw() {
        const r = B && B.eRect;
        for (const f of this.list) {
            const st = f.el.style;
            if (!r) { st.display = "none"; continue; }
            const c = f.c, p = clamp(f.t / c.frames, 0, 1);
            const h = r.h * c.scale, nat = f.el.naturalWidth ? f.el.naturalHeight / f.el.naturalWidth : 432 / 400, w = h / nat;
            const x = r.x + c.ax * r.w - c.sx * w + f.dir * c.dist * (1 - Math.pow(1 - p, 2)) + Engine.off.x;
            const y = r.y + c.ay * r.h - c.sy * h + Engine.off.y;
            st.display = "block";
            st.left = (x / W * 100) + "%"; st.top = (y / H * 100) + "%";
            st.width = (w / W * 100) + "%"; st.height = (h / H * 100) + "%";
            st.opacity = String(c.opacity * (1 - p));
            st.transform = c.flip && f.dir < 0 ? "scaleX(-1)" : "none";
        }
    }
};

// ---------- Drawing pieces ----------
function hideGif() { if (gifEl && gifEl.style.display !== "none") gifEl.style.display = "none"; }
let gifSrc = "";
function showGif(key, x, y, w, h, alpha) {
    if (!gifEl) return;
    const src = url(Assets.specs[key].src);
    if (gifSrc !== src) { gifSrc = src; gifEl.src = src; }
    const st = gifEl.style;
    st.display = "block";
    st.left = (x / W * 100) + "%"; st.top = (y / H * 100) + "%";
    st.width = (w / W * 100) + "%"; st.height = (h / H * 100) + "%";
    st.opacity = String(alpha);
}

function drawEnemy() {
    const cx = 320;
    let ox = 0;
    if (B.enemyShake > 0) ox += Math.sin(B.enemyShake * 1.5) * (B.enemyShake / 3);
    if (B.fight && B.fight.phase === "miss") ox += Math.sin(Math.min(B.fight.t / 30, 1) * Math.PI) * 70;
    if (B.fight && B.fight.dodge) ox += Math.sin(clamp((B.fight.t - 12) / 40, 0, 1) * Math.PI) * 90 * B.fight.dir;     // Sans sidesteps the slash
    const bob = Math.sin(B.frame / 25) * 4;
    const key = B.enemyKey, img = key ? Assets.get(key) : null;
    const isGif = !!img && Assets.isGif(key);
    if (!isGif) hideGif();
    if (img) {
        const sc = Math.min(170 / img.height, 300 / img.width) * (B.enemy.scale ?? 1), w = img.width * sc, h = img.height * sc;
        const x = cx - w / 2 + ox, y = 215 - h + bob;
        B.eRect = { x, y, w, h };                                     // used by the slash effect
        if (isGif) showGif(key, x + Engine.off.x, y + Engine.off.y, w, h, B.dust ? 1 - clamp(B.dust.t / 90, 0, 1) : B.enemyAlpha);
        else if (B.dust) {              // death: the sprite crumbles to dust, strip by strip, blowing away to the right
            const N = 90, sw = img.width / N, t = B.dust.t;
            ctx.save();
            for (let i = 0; i < N; i++) {
                const hs = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
                const p = clamp((t - (i / N) * 55 - hs * 18) / 60, 0, 1);
                if (p >= 1) continue;
                ctx.globalAlpha = 1 - p;
                ctx.drawImage(img, i * sw, 0, sw, img.height, x + i * sw * sc + p * (30 + 70 * hs), y - p * (20 + 55 * hs) - p * p * 25 * hs, sw * sc + 0.7, h);
            }
            ctx.restore();
        }
        else { ctx.save(); ctx.globalAlpha = B.enemyAlpha; ctx.drawImage(img, x, y, w, h); ctx.restore(); }
        return;
    }
    ctx.save();             // placeholder skull until you set enemy.sprite
    ctx.globalAlpha = B.enemyAlpha;
    const x = cx + ox, y = 75 + bob;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x, y + 60, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 36, y + 100, 72, 40);
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(x - 22, y + 58, 13, 0, Math.PI * 2); ctx.arc(x + 22, y + 58, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + 72); ctx.lineTo(x - 7, y + 90); ctx.lineTo(x + 7, y + 90); ctx.fill();
    for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * 10 - 1, y + 112, 2, 28);
    ctx.restore();
}

function drawPop() {
    const p = B.pop;
    if (!p) return;
    const bounce = -Math.abs(Math.sin(Math.min(p.t, 20) / 20 * Math.PI * 2)) * 12;
    text(p.text, 320, 14 + bounce, 32, p.hp ? "#f33" : "#aaa", "center");
    if (p.hp) {
        ctx.fillStyle = "#7a0000"; ctx.fillRect(270, 56, 100, 12);
        ctx.fillStyle = "#0f0"; ctx.fillRect(270, 56, 100 * B.enemyHp / B.enemyMax, 12);
    }
}

// a soft ring of light around the enemy, in the phase colour (pulses on beats / hits)
function drawAura() {
    if (!VFX.on || !B || B.dust || B.enemyAlpha < 0.05) return;
    const k = B.enemyAlpha * (VFX.high ? 1 : 0.5), pul = 0.5 + 0.5 * Math.sin(B.frame / 40), boost = VFX.glow;
    const r0 = 66 + pul * 4, r1 = 200 + pul * 14 + boost * 30;
    const g = ctx.createRadialGradient(320, 135, r0, 320, 135, r1);
    g.addColorStop(0, rgba(VFX.mote, 0)); g.addColorStop(0.35, rgba(VFX.mote, (0.1 + 0.05 * pul + 0.16 * boost) * k)); g.addColorStop(1, rgba(VFX.mote, 0));
    ctx.fillStyle = g; ctx.fillRect(80, -30, 480, 340);
}

function drawBox() {
    const b = B.box;
    if (B.ui.box <= 0) return;
    ctx.save(); ctx.globalAlpha = B.ui.box;
    ctx.fillStyle = "#000"; ctx.fillRect(b.x, b.y, b.w, b.h);
    if (VFX.high && B.state === "attack") {                      // a faint light sweeps through the box
        ctx.save(); ctx.beginPath(); ctx.rect(b.x + BORDER, b.y + BORDER, b.w - 2 * BORDER, b.h - 2 * BORDER); ctx.clip();
        const sx = ((B.frame * 1.3) % (b.w + 120)) - 60, lg = ctx.createLinearGradient(b.x + sx - 40, 0, b.x + sx + 40, 0);
        lg.addColorStop(0, rgba(VFX.mote, 0)); lg.addColorStop(0.5, rgba(VFX.mote, 0.07)); lg.addColorStop(1, rgba(VFX.mote, 0));
        ctx.fillStyle = lg; ctx.fillRect(b.x + sx - 40, b.y, 80, b.h);
        ctx.restore();
    }
    ctx.save();
    if (VFX.high) { ctx.shadowColor = B.state === "attack" ? VFX.mote : "#fff"; ctx.shadowBlur = 10 + 5 * Math.sin(B.frame / 18); }
    ctx.strokeStyle = "#fff"; ctx.lineWidth = BORDER;
    ctx.strokeRect(b.x + BORDER / 2, b.y + BORDER / 2, b.w - BORDER, b.h - BORDER);
    ctx.restore();
    if (B.boxPulse > 0 && VFX.on) {                              // the box was resized / moved: an outline ripples outwards
        const k = 1 - B.boxPulse, e = 1 - Math.pow(1 - k, 3), g = 4 + 26 * e;
        ctx.globalAlpha = B.ui.box * B.boxPulse * 0.7; ctx.strokeStyle = VFX.mote; ctx.lineWidth = 3;
        ctx.strokeRect(b.x - g, b.y - g, b.w + 2 * g, b.h + 2 * g);
    }
    ctx.restore();
}

function drawHUD() {
    if (B.ui.hud <= 0) return;
    ctx.save(); ctx.globalAlpha = B.ui.hud;
    const p = G.player, bw = Math.min(p.maxHp * 1.25, 200), low = B.hp / p.maxHp < 0.3;
    text(`${p.name}   LV ${p.lv}`, 32, 396, 22);
    text("HP", 232, 403, 14);
    ctx.fillStyle = "#c00"; ctx.fillRect(262, 398, bw, 22);
    if (B.hpLag > B.hp) { ctx.fillStyle = "#ff9a9a"; ctx.fillRect(262, 398, bw * B.hpLag / p.maxHp, 22); }      // the chunk you just lost drains away
    ctx.fillStyle = "#ff0"; ctx.fillRect(262, 398, bw * B.hp / p.maxHp, 22);
    if (low && VFX.on) { ctx.strokeStyle = "#f33"; ctx.lineWidth = 2; ctx.globalAlpha = B.ui.hud * (0.35 + 0.35 * Math.sin(B.frame / 6)); ctx.strokeRect(260, 396, bw + 4, 26); ctx.globalAlpha = B.ui.hud; }
    text(`${Math.ceil(B.hp)} / ${p.maxHp}`, 262 + bw + 14, 396, 22, low ? ((B.frame >> 3) % 2 ? "#f55" : "#fff") : "#fff");
    ctx.restore();
}

// little vector icons for the four menu buttons
const BTN_ICONS = [
    (x, y) => { ctx.beginPath(); ctx.moveTo(x - 7, y + 7); ctx.lineTo(x + 6, y - 6); ctx.moveTo(x + 2, y - 6); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 6, y - 2); ctx.moveTo(x - 7, y + 2); ctx.lineTo(x - 2, y + 7); ctx.stroke(); },     // FIGHT: a sword
    (x, y) => { ctx.beginPath(); ctx.rect(x - 7, y - 6, 14, 10); ctx.moveTo(x - 3, y + 4); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x + 2, y + 4); ctx.stroke(); ctx.fillRect(x - 4, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2); },       // ACT: a speech bubble
    (x, y) => { ctx.beginPath(); ctx.rect(x - 7, y - 2, 14, 10); ctx.moveTo(x - 4, y - 2); ctx.quadraticCurveTo(x, y - 9, x + 4, y - 2); ctx.stroke(); },                                                                 // ITEM: a bag
    (x, y) => { ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); }                                                                  // MERCY: an X
];

const BREAK_F = 70;                      // frames a menu button takes to crack and fall apart (rebirth scene)
function drawButtons() {
    if (B.ui.hud <= 0) return;
    const lit = ["menu", "list", "fight", "rebirth"].includes(B.state), canPick = ["menu", "list", "fight"].includes(B.state);
    for (let i = 0; i < 4; i++) {
        const x = 32 + i * 152, sel = canPick && i === B.menuIdx, br = B.btn[i], col = sel ? "#ff0" : "#ff7f27";
        ctx.save();
        ctx.globalAlpha = (lit ? 1 : 0.55) * B.ui.hud;
        const draw = () => {
            ctx.save();
            if (sel) { ctx.fillStyle = "rgba(255,255,0,0.13)"; ctx.fillRect(x, 432, 120, 40); if (VFX.high) { ctx.shadowColor = "#ff0"; ctx.shadowBlur = 14; } }
            ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x, 432, 120, 40);
            ctx.restore();
            ctx.save(); ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 2; BTN_ICONS[i](x + 24, 452); ctx.restore();
            text(MENU[i], x + 80, 440, 20, col, "center");
        };
        if (!br) draw();
        else if (br.slash) {                                // SLASHED to pieces: a bright cut, then 12 shards fly apart, spinning and falling
            const t = br.t;
            if (t < 90) {
                if (t < 5) { draw(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 12, 476); ctx.lineTo(x + 132, 428); ctx.stroke(); }
                else for (let i = 0; i < 12; i++) {
                    const c = i % 6, rw = i / 6 | 0, hs = hash2(i, 7), hs2 = hash2(i, 13), k = t - 5;
                    const fx = x + c * 20 + 10, fy = 432 + rw * 20 + 10;
                    const ox = (c - 2.5) * 2.4 * Math.sqrt(k) + (hs - 0.5) * 3 * k * 0.3, oy = -6 * Math.sqrt(k) * (0.4 + hs2) + 0.09 * k * k * (0.6 + hs);
                    ctx.save(); ctx.globalAlpha *= 1 - clamp((k - 40) / 45, 0, 1);
                    ctx.translate(fx + ox, fy + oy); ctx.rotate((hs - 0.5) * 0.12 * k); ctx.translate(-fx, -fy);
                    ctx.beginPath(); ctx.rect(x + c * 20 - 1, 432 + rw * 20 - 1, 22, 22); ctx.clip();
                    draw(); ctx.restore();
                }
            }
        }
        else if (br.t < BREAK_F) {
            const t = br.t, k = clamp((t - 22) / (BREAK_F - 22), 0, 1);
            if (t < 22) {                                   // shaking, a crack grows across it
                ctx.translate(rand(-2, 2) * (t / 22), rand(-1, 1)); draw();
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath();
                const n = Math.ceil(t / 3);
                ctx.moveTo(x + 60, 432);
                for (let c = 1; c <= n; c++) ctx.lineTo(x + 60 + (c % 2 ? 10 : -10), 432 + c * 5);
                ctx.stroke();
            } else {                                        // two halves fall away, spinning
                ctx.globalAlpha *= 1 - k;
                for (const d of [-1, 1]) {
                    ctx.save();
                    ctx.translate(x + 60 + d * 30, 452 + k * k * 120); ctx.rotate(d * k * 0.9); ctx.translate(-(x + 60 + d * 30), -452);
                    ctx.beginPath(); ctx.rect(d < 0 ? x - 4 : x + 60, 420, 64, 60); ctx.clip();
                    draw(); ctx.restore();
                }
            }
        }
        ctx.restore();
    }
}

// ============================================================
// Battle states
// ============================================================
function drawBubble(t) {
    const bx = 395, by = 70, bw = 225;
    ctx.font = `18px ${FONT}`;
    const lines = wrap(t.current, bw - 30), bh = lines.length * 22 + 24;
    ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, bw, bh);
    ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.lineTo(bx - 16, by + 28); ctx.lineTo(bx, by + 38); ctx.fill();
    drawTyped(t, bx + 14, by + 12, bw - 30, 18, 22, "#000");
}

// ORANGE soul feedback: "KEEP MOVING!" when it turns orange, and a ring that closes in on the soul while it stands still
function drawOrangeHud(s) {
    const grace = B.atk.idleGrace ?? (G.orange && G.orange.grace) ?? ORANGE_GRACE;
    if (s.idle > grace * 0.3) {
        const k = clamp(s.idle / grace, 0, 1);
        ctx.save();
        ctx.strokeStyle = k > 0.8 ? "#f33" : ORANGE_COL; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.beginPath(); ctx.arc(s.x, s.y, 24 - 14 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        if (k > 0.55 && (B.frame >> 2) % 2) text("MOVE!", s.x, s.y - 40, 16, ORANGE_COL, "center");
    }
    if (B.orangeHint > 0 && B.box.y > 30) {
        const a = Math.min(1, B.orangeHint / 20) * ((B.orangeHint >> 3) % 2 ? 1 : 0.65);
        ctx.save(); ctx.globalAlpha = a;
        text("KEEP MOVING!", B.box.x + B.box.w / 2, B.box.y - 28, 22, ORANGE_COL, "center");
        ctx.restore();
    }
}

// the survival attack is over: phases with a `finale` get the cinematic ending, the others the normal "ending"
function survivalOver() {
    const p = G.phases[B.phase - 1];
    B.tilt = null; Cam.reset(24); Bars.to(0, 24);
    enter(p && p.finale ? "finale" : "ending");
}

// ---------- Tilt director: in later phases the whole camera sometimes TILTS for a few seconds (harder to read the box) ----------
// phase option  tilt: { max: 8, chance: 0.4, warn: 26, hold: [150, 260], every: [420, 760], first: [200, 360] }
//   max     = biggest angle in degrees          warn  = frames of warning (creaking sound + the screen shudders) before the tilt starts
//   hold    = how long it stays tilted          chance = turn-based phases: chance that an attack tilts (once)
//   first / every = survival phases: frames until the first tilt / between tilts       attack option  noTilt: true  = never tilt this attack
// Players can turn it off in OPTIONS > CAMERA.
const TILT_DEF = { max: 8, chance: 0.4, warn: 26, hold: [150, 260], every: [420, 760], first: [200, 360] };

function tiltEnter(a) {
    B.tilt = null;
    const c = B.tiltCfg;
    if (!c || a.noTilt || Settings.cam < 2) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (B.survival) B.tilt = { st: "idle", next: randInt(c.first[0], c.first[1]), dir, t: 0 };
    else if (Math.random() < c.chance) B.tilt = { st: "idle", next: randInt(70, Math.max(110, Math.round((a.duration || 300) * 0.45))), dir, t: 0, once: true };
}
function tiltTick() {
    const T = B.tilt, c = B.tiltCfg;
    if (!T || !c) return;
    const f = B.atkFrame, dur = B.atk.duration || 300, endsSoon = !B.survival && f > dur - 80;
    if (T.st === "idle") {
        if (endsSoon) { B.tilt = null; return; }
        if (f < T.next) return;
        T.st = "warn"; T.t = 0; T.deg = T.dir * rand(c.max * 0.6, c.max);
        Sound.play("tilt"); Engine.aberrate(3, 16); Engine.shake(2, 10); Cam.rkick(-T.dir * 1.6);         // the warning: the screen shudders the other way first
    } else if (T.st === "warn") {
        if (++T.t >= c.warn) { Cam.tiltTo(T.deg, 42); T.st = "hold"; T.t = 0; T.len = randInt(c.hold[0], c.hold[1]); }
    } else if (T.st === "hold") {
        if (++T.t >= T.len || endsSoon) {
            Cam.tiltTo(0, 46); T.st = "idle"; T.dir = -T.dir;
            if (T.once) B.tilt = null; else T.next = f + randInt(c.every[0], c.every[1]);
        }
    }
}

// ---------- Interrupt slashes (phase option enemy.interrupt): while the enemy is nearly out of BLOCKS he slashes during YOUR turn ----------
// enemy: { interrupt: { remaining: 7, table: { 7: [180, 0, 44, 0.6, 1], ... }, say: [...] } }
//   remaining = the slashes start when the enemy has at most this many blocks left.
//   table[blocksLeft] = [frames between slashes (60 = 1 s), randomness 0..1, warn frames (dotted line -> hit), damage multiplier, cuts per slash]
//   (every extra block you land makes the slashes faster, and the timing more random). The slash never kills: it leaves you with 1 HP.
//   Your turn = menu / lists / attack bar / act + item text. When the enemy's attack starts, all pending slashes are cancelled.
const INT_TABLE = {            // blocks left : [every, jitter, warn, dmgMul, cuts]
    7: [180, 0,    44, 0.60, 1],      // 6 or 7 left: exactly one slash every 3 seconds
    6: [180, 0,    44, 0.60, 1],
    5: [140, 0.12, 40, 0.55, 1],
    4: [110, 0.20, 36, 0.50, 1],
    3: [ 86, 0.30, 32, 0.45, 1],
    2: [ 62, 0.40, 28, 0.40, 1],
    1: [ 38, 0.55, 22, 0.30, 2],      // 1 or 0 left: very fast and very unpredictable, sometimes double cuts
    0: [ 26, 0.65, 18, 0.25, 3]
};
const intRow = (o, rem) => (o.table || INT_TABLE)[clamp(rem, 0, 7)] || INT_TABLE[clamp(rem, 0, 7)];
function intNextDelay(row) {
    const [every, jit] = row;
    return Math.max(14, Math.round(every * (1 + rand(-jit, jit))));
}
function interruptTick() {
    const o = B.enemy && B.enemy.interrupt;
    if (!o || B.blockGoal <= 0 || !B.soul) return;
    if (!B.int) B.int = [];
    // slashes that are already in flight keep running
    if (["attack", "speech", "gameover", "win", "cutscene", "ending", "finale", "rebirth"].includes(B.state)) { B.int = []; B.sb = null; B.slashT = -1; return; }
    interruptRun(o);
    const myTurn = B.state === "menu" || B.state === "list" || B.state === "text" || (B.state === "fight" && B.fight && B.fight.phase === "aim");
    const rem = B.blockGoal - B.blocked, lim = o.remaining ?? 7;
    if (!myTurn || rem > lim || B.blocked < 1) { B.slashT = -1; return; }
    const row = intRow(o, rem);
    if (B.slashT < 0) B.slashT = row[0];                       // first slash comes one full interval after your turn starts
    if (--B.slashT > 0) return;
    B.slashT = intNextDelay(row);                              // the NEXT interval is picked right now (random when the enemy is nearly dead)
    intSpawn(o, row, rem);
}
function intSpawn(o, row, rem) {
    const [, , warn, mul, cutsMax] = row;
    let n = 1;
    if (cutsMax > 1) n = rem <= 0 ? randInt(2, cutsMax) : (Math.random() < 0.5 ? 2 : 1);
    const cuts = [];
    for (let i = 0; i < n; i++) cuts.push({ x1: 320 + rand(-110, 110), y1: 118, x2: 150 + rand(0, 340), y2: 409 });
    B.int.push({ t: 0, warn: Math.round(warn + (n > 1 ? 6 : 0)), cuts, mul, hit: false });
    if (!B.sb && Math.random() < (rem >= 6 ? 0.8 : 0.35)) {         // Sans only speaks now and then
        const lines = o.say || ["too slow.", "no breaks.", "you think i'll wait?", "hey. eyes up."];
        B.sb = { typer: new Typer(pick(lines), { auto: 40, voice: B.enemy.voice }) };
    }
    Slash.spawn({});                                                       // Sans swings (sound + slash gif)
    Sound.play("tilt");
}
function interruptRun(o) {
    if (B.sb) { B.sb.typer.update(); if (B.sb.typer.done) B.sb = null; }
    for (const I of B.int) {
        I.t++;
        if (I.t === I.warn) {                                              // the slash LANDS
            const want = typeof o.damage === "function" ? o.damage() : (o.damage ?? Math.round(10 * 0.6));
            const d = Math.max(0, Math.min(Math.round(want * I.mul / 0.6), Math.ceil(B.hp) - 1));
            I.hit = true; B.hp -= d;
            Sound.play("hurt"); Sound.play("slam");
            Engine.shake(9, 14); Engine.glitch(9, 1.2); Engine.aberrate(8, 20); Engine.freeze(3); Cam.kick(0.035); Cam.rkick(rand(-1, 1) < 0 ? -1.3 : 1.3);
            VFX.flash("#fff", 8, 0.5); VFX.pulse(0.8);
            if (d > 0) VFX.float(362, 376, "-" + d, { color: "#ff5a5a", size: 24 });
            for (const c of I.cuts) {
                VFX.spawn(c.x2, c.y2, 20, { color: "#fff", speed: 7, minSpeed: 2, life: 28, shape: "line", add: true });
                VFX.ring(c.x2, c.y2, { r1: 70, life: 22, w: 5, color: "#fff" });
            }
        }
    }
    B.int = B.int.filter((I) => I.t <= I.warn + 34);
}
function drawInterrupt() {
    if (B.sb && B.state !== "speech") drawBubble(B.sb.typer);
    if (!B.int || !B.int.length) return;
    let blink = false;
    for (const I of B.int) {
        const t = I.t;
        ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "#fff";
        if (t < I.warn) {                                                   // warning: dotted lines from Sans down to the HP bar + a blinking "!"
            ctx.globalAlpha = 0.25 + 0.4 * ((t >> 2) % 2); ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
            for (const c of I.cuts) { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke(); }
            ctx.setLineDash([]);
            if ((t >> 2) % 2) blink = true;
        } else {                                                            // the cut itself, fading
            const k = (t - I.warn) / 34;
            for (const [lw, a] of [[18, 0.25], [6, 1]]) {
                ctx.globalAlpha = (1 - k) * a; ctx.lineWidth = lw * (1 - k * 0.7);
                if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 14; }
                for (const c of I.cuts) { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke(); }
            }
        }
        ctx.restore();
    }
    if (blink) text("!", 320, 58, 38, "#f33", "center");
}

const States = {
    intro: {
        enter() { setBoxMenu(); B.typer = new Typer(B.enemy.intro || `* ${B.enemy.name} appears.`, { onDone: () => (G.enemyFirst ? enemyTurn() : enter("menu")) }); },
        update() { B.typer.update(); },
        draw() { drawTyped(B.typer, B.box.x + 24, B.box.y + 20, B.box.w - 48, TEXT_PX, TEXT_LH); }
    },

    text: {      // generic "show these lines, then run next()"
        enter(d) { setBoxMenu(); B.typer = new Typer(d.lines, { onDone: d.next }); },
        update() { B.typer.update(); },
        draw() { drawTyped(B.typer, B.box.x + 24, B.box.y + 20, B.box.w - 48, TEXT_PX, TEXT_LH); }
    },

    menu: {
        enter(keep) { setBoxMenu(); if (!keep || B.menuFlavor == null) B.menuFlavor = flavor(); B.typer = new Typer(B.menuFlavor, { hold: true }); },
        update() {
            B.typer.update();
            const tx = 32 + B.menuIdx * 152 + 18;
            B.menuSoul = B.menuSoul == null ? tx : lerp(B.menuSoul, tx, 0.4);
            const step = (k) => { let i = B.menuIdx; for (let n = 0; n < 4; n++) { i = (i + k + 4) % 4; if (!B.gone[i]) { B.menuIdx = i; break; } } Sound.play("move"); };
            if (B.gone[B.menuIdx]) step(1);
            if (Input.hit("arrowleft", "a")) step(-1);
            if (Input.hit("arrowright", "d")) step(1);
            if (!Input.confirm()) return;
            Sound.play("select");
            if (B.menuIdx === 0) enter("fight");
            else if (B.menuIdx === 1) openList("act");
            else if (B.menuIdx === 2) {
                if (B.items.length) openList("item");
                else B.typer = new Typer("* You have no items.", { hold: true });
            } else openList("mercy");
        },
        draw() {
            drawTyped(B.typer, B.box.x + 24, B.box.y + 20, B.box.w - 48, TEXT_PX, TEXT_LH);
            drawSoul(B.menuSoul ?? (32 + B.menuIdx * 152 + 18), 452, 18, 18, "red");
        }
    },

    list: {
        update() {
            const L = B.list, n = L.items.length;
            const lx = B.box.x + 70 + (L.idx % 2) * 260 - 28, ly = B.box.y + 20 + (L.idx >> 1) * 36 + 14;
            L.sx = L.sx == null ? lx : lerp(L.sx, lx, 0.4); L.sy = L.sy == null ? ly : lerp(L.sy, ly, 0.4);
            if (Input.hit("arrowleft", "a") && L.idx > 0) { L.idx--; Sound.play("move"); }
            if (Input.hit("arrowright", "d") && L.idx < n - 1) { L.idx++; Sound.play("move"); }
            if (Input.hit("arrowup", "w") && L.idx >= 2) { L.idx -= 2; Sound.play("move"); }
            if (Input.hit("arrowdown", "s") && L.idx + 2 < n) { L.idx += 2; Sound.play("move"); }
            if (Input.cancel()) { Sound.play("move"); enter("menu", true); return; }
            if (!Input.confirm()) return;
            Sound.play("select");
            if (L.kind === "act") {
                const a = B.acts[L.idx];
                if (a.spare) B.spareable = true;
                // a.run(g) can do anything; if it returns text, that text is shown instead of a.text
                const out = call("act run", a.run, a, GameApi);
                hook("onAct", a);
                const txt = out !== undefined ? out : (typeof a.text === "function" ? call("act text", a.text, a, GameApi) : a.text);
                say(txt || `* You used ${a.name}.`, enemyTurn);
            } else if (L.kind === "item") {
                const it = B.items.splice(L.idx, 1)[0];
                B.hp = Math.min(G.player.maxHp, B.hp + (it.heal || 0));
                Sound.play("heal");
                const out = call("item use", it.use, it, GameApi);
                hook("onItem", it);
                const txt = out !== undefined ? out : (typeof it.text === "function" ? call("item text", it.text, it, GameApi) : it.text);
                say(txt || [`* You used the ${it.name}.\n* HP +${it.heal || 0}.`], enemyTurn);
            } else if (L.idx === 0) {
                if (B.spareable) enter("win", "spare");
                else say(`* You offered mercy, but ${B.enemy.name} isn't ready to accept it.`, enemyTurn);
            } else enter("win", "flee");
        },
        draw() {
            const L = B.list;
            L.items.forEach((it, i) => {
                const x = B.box.x + 70 + (i % 2) * 260, y = B.box.y + 20 + (i >> 1) * 36, sel = i === L.idx;
                if (sel) { ctx.fillStyle = "rgba(255,255,0,0.08)"; ctx.fillRect(x - 36, y - 3, 244, 34); }
                text("* " + it.label, x, y, 26, it.color || (sel ? "#ff0" : "#fff"));
                if (it.sub) text(it.sub, x + 200, y + 9, 14, sel ? "#aaa060" : "#666", "right");
            });
            if (L.sx != null) drawSoul(L.sx, L.sy, 18, 18, "red");
            text("[X] BACK", B.box.x + B.box.w - 18, B.box.y + B.box.h - 28, 14, "#555", "right");
        }
    },

    fight: {
        enter() { setBoxMenu(); B.fight = { phase: "aim", x: BOX_MENU.x + BORDER + 6, t: 0, dmg: 0, applied: false }; },
        update() {
            const f = B.fight, c = BOX_MENU.x + BOX_MENU.w / 2, half = BOX_MENU.w / 2 - BORDER - 6;
            if (f.phase === "aim") {
                f.x += 9;
                if (Input.confirm()) {
                    const mult = 2.5 - 1.5 * clamp(Math.abs(f.x - c) / half, 0, 1);
                    f.dmg = Math.max(1, Math.round(G.player.atk * mult) - B.enemy.def);
                    f.dodge = B.dodged < (B.enemy.dodges || 0);       // enemy.dodges = N: the enemy dodges the first N attacks
                    f.block = !f.dodge && B.blockGoal > 0;            // enemy.blocks: the attack lands but does nothing ("BLOCKED")
                    f.dir = B.dodged % 2 ? 1 : -1;
                    f.phase = "slash"; f.t = 0;
                    Sound.play("slash");
                } else if (f.x > BOX_MENU.x + BOX_MENU.w - BORDER - 6) {
                    f.phase = "miss"; f.t = 0;
                    B.pop = { text: "MISS", t: 0 };
                }
            } else if (f.phase === "slash") {
                f.t++;
                if (f.dodge) {
                    if (f.t === 12) { Sound.play("dodge"); VFX.spawn(320, 140, 8, { color: "#9cf", speed: 2.5 }); }
                    if (f.t > 12 && f.t < 36 && f.t % 3 === 0) VFX.spawn(320 + Math.sin(clamp((f.t - 12) / 40, 0, 1) * Math.PI) * 90 * f.dir, 150, 3, { color: "#9cf", speed: 1.2, life: 18 });
                    if (f.t === 22 && !f.applied) { f.applied = true; B.dodged++; B.pop = { text: "MISS", t: 0 }; }       // swish... nothing there
                } else if (f.block) {
                    if (f.t === 22 && !f.applied) {
                        f.applied = true; B.blocked++; B.vars.blocked = B.blocked;
                        B.pop = { text: "BLOCKED", t: 0 };
                        B.enemyShake = 8;
                        Sound.play("slam"); Engine.shake(3, 8);
                        VFX.spawn(320, 140, 14, { color: "#9cf", speed: 3.5 });
                        // REPELLED: the screen zooms in a little and glitches, as if the attack bounced off an invisible wall
                        Cam.to({ zoom: 1.07, x: 0, y: 8 }, 5); Cam.rkick(Math.random() < 0.5 ? -1.4 : 1.4);
                        Engine.glitch(10, 1); Engine.aberrate(10, 26); Engine.freeze(3);
                        VFX.ring(320, 140, { r1: 170, life: 24, w: 7, color: "#9cf" }); VFX.ring(320, 140, { r1: 110, life: 18, w: 4, color: "#fff" });
                        VFX.spawn(320, 140, 30, { color: "#cfe8ff", speed: 8, minSpeed: 3, life: 26, shape: "line", add: true });
                        VFX.pulse(0.8); VFX.flash("#9cf", 10, 0.3);
                    }
                    if (f.t === 29) Engine.glitch(5, 0.8);
                    if (f.t === 50) Cam.to({ zoom: 1, x: 0, y: 0 }, 16);
                } else if (f.t === 22 && !f.applied) {
                    f.applied = true;
                    if (B.enemy.dodges > 0) f.dmg = Math.max(f.dmg, B.enemyHp);          // the hit that finally lands finishes this phase
                    B.enemyHp = Math.max(0, B.enemyHp - f.dmg);
                    B.pop = { text: String(f.dmg), t: 0, hp: true };
                    B.enemyShake = 30;
                    Sound.play("hit");
                    Engine.shake(3, 8);
                    VFX.spawn(320, 130, 16, { color: "#fff", speed: 4.5 });
                    Cam.kick(0.035); Engine.freeze(3); VFX.pulse(0.6); VFX.ring(320, 135, { r1: 120, life: 20, w: 5, color: "#fff" });
                }
                if (f.t > 75) { if (f.block && B.blocked >= B.blockGoal) { B.enemyHp = 0; enemyDefeated(); } else if (B.enemyHp <= 0) enemyDefeated(); else enemyTurn(); }
            } else if (++f.t > 45) enemyTurn();
        },
        draw() {
            const f = B.fight, r = BOX_MENU;
            if (f.phase === "aim") {
                const bx = r.x + 18, by = r.y + 28, bw = r.w - 36, bh = r.h - 56;
                const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);                       // the target: red edges -> orange -> green centre
                gr.addColorStop(0, "#400"); gr.addColorStop(0.25, "#a50"); gr.addColorStop(0.5, "#1c1"); gr.addColorStop(0.75, "#a50"); gr.addColorStop(1, "#400");
                ctx.globalAlpha = 0.6; ctx.fillStyle = gr; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
                ctx.strokeStyle = "#3c3"; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
                ctx.save(); if (VFX.high) { ctx.shadowColor = "#0f0"; ctx.shadowBlur = 12; }
                ctx.fillStyle = "#0f0"; ctx.fillRect(r.x + r.w / 2 - 3, r.y + 22, 6, r.h - 44); ctx.restore();
                for (let k = 4; k >= 1; k--) { ctx.globalAlpha = 0.12 * (5 - k) / 4; ctx.fillStyle = "#fff"; ctx.fillRect(f.x - 4 - 9 * k, r.y + 16, 8, r.h - 32); }      // afterimages
                ctx.globalAlpha = 1;
                ctx.save(); if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 10; }
                ctx.fillStyle = (B.frame >> 2) & 1 ? "#fff" : "#999";
                ctx.fillRect(f.x - 4, r.y + 16, 8, r.h - 32); ctx.restore();
            } else if (f.phase === "slash" && f.block && f.t >= 20 && f.t < 56) {      // a pale shield flashes around Sans
                const k = (f.t - 20) / 36;
                ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = "#9cf"; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(320, 135, 80 + k * 24, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            } else if (f.phase === "slash" && f.t < 22) {
                const p = f.t / 20;
                ctx.strokeStyle = "#f33"; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.moveTo(260, 70); ctx.lineTo(260 + 120 * p, 70 + 120 * p); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(380, 80); ctx.lineTo(380 - 100 * p, 80 + 110 * p); ctx.stroke();
            }
        }
    },

    speech: {
        enter() { setBoxMenu(); B.typer = new Typer(B.cur.say, { auto: B.cur.sayFrames || 40, voice: B.enemy.voice, onDone: startAttack }); },
        update() { B.typer.update(); },
        draw() { drawBubble(B.typer); }
    },

    // phase cutscene (game.js -> phases[n].cutscene), plays when the previous phase's HP reaches 0
    cutscene: {
        enter() { setBoxMenu(); csAdvance(); },
        update() {
            const c = B.cs;
            if (!c) return;
            if (c.p.skippable === false) c.skip = 0;                                       // phase option skippable:false (e.g. the 1.5 s delay)
            else if (Input.held("x", "shift")) { if (++c.skip > 50) { csFinish(); return; } }      // hold X to skip
            else c.skip = Math.max(0, c.skip - 2);
            c.t++;
            c.dark = approach(c.dark, c.darkT, c.darkSpd);
            B.enemyAlpha = approach(B.enemyAlpha, c.fadeT, c.fadeSpd);
            if (c.ui && c.uiSpd) { B.ui.box = approach(B.ui.box, c.uiT, c.uiSpd); B.ui.hud = approach(B.ui.hud, c.uiT, c.uiSpd); }
            c.soulA = approach(c.soulA, c.soulT, 0.04);
            if (c.flashA > 0) c.flashA = Math.max(0, c.flashA - 0.04);
            const s = c.s;
            if (!s) return;
            s.t++;
            if (c.typer) { c.typer.update(); if (c.typer.done) csAdvance(); }
            else if (s.t >= s.dur) csAdvance();
        },
        draw() {
            const c = B.cs;
            if (!c || !c.s) return;
            if (c.dark > 0) { ctx.globalAlpha = c.dark; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
            if (c.soulA > 0) {                                                       // cutscene key  soul: [x, y]  = the soul appears (glow + heartbeat)
                const [sx, sy] = c.soulAt, pul = Math.pow(0.5 + 0.5 * Math.sin(c.t / 7), 3), sc = 1 + 0.14 * pul;
                ctx.save(); ctx.globalAlpha = c.soulA;
                if (VFX.on) { const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 50); rg.addColorStop(0, "rgba(255,40,60," + (0.35 + 0.25 * pul) + ")"); rg.addColorStop(1, "rgba(255,40,60,0)"); ctx.fillStyle = rg; ctx.fillRect(sx - 50, sy - 50, 100, 100); }
                drawSoul(sx, sy, 20 * sc, 20 * sc, "red");
                ctx.restore();
            }
            if (c.s.title) {                                                         // cutscene keys  title / sub  = a title card (fades in and out over the step)
                const s = c.s, a = clamp(Math.min(s.t / 24, (s.dur - s.t) / 24), 0, 1);
                ctx.save(); ctx.globalAlpha = a;
                if (VFX.on) { ctx.shadowColor = s.glow || VFX.mote; ctx.shadowBlur = 24; }
                text(s.title, W / 2, s.sub ? 188 : 210, s.size ?? 64, s.color || "#fff", "center");
                ctx.restore();
                if (s.sub) { ctx.save(); ctx.globalAlpha = a * 0.9; text(s.sub, W / 2, 266, 22, s.subColor || "#aaa", "center"); ctx.restore(); }
            }
            if (c.typer) {
                if (c.s.say !== undefined) drawBubble(c.typer);
                else if (c.ui) drawTyped(c.typer, B.box.x + 24, B.box.y + 20, B.box.w - 48, TEXT_PX, TEXT_LH);
                else drawTyped(c.typer, 80, c.s.y ?? 290, 480, c.s.size ?? 28, 36, c.s.color || "#fff", "center");
            }
            if (c.flashA > 0) { ctx.globalAlpha = c.flashA * Settings.flashK; ctx.fillStyle = c.flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        }
    },

    attack: {
        enter(a) {
            B.atk = a; B.bullets = []; B.api = makeApi(); B.trail = [];
            B.atkFrame = -ATK_WAIT; B.atkEnd = null;
            const [w, h] = a.box || [200, 150];
            setBoxSize(w, h, a.at && a.at[0], a.at && a.at[1]);       // optional  at: [cx, cy]  = where the box sits
            const r = inner(B.boxT), s = B.soul;
            s.mode = a.mode || "red"; s.vy = 0; s.grounded = false; s.jumping = false; s.slamming = false;
            s.idle = s.mode === "orange" ? ORANGE_START : 0; B.orangeHint = s.mode === "orange" ? 100 : 0;
            tiltEnter(a);
            s.gdir = GDIR[a.gravity] ?? 0;                      // attack option gravity: "down" | "left" | "up" | "right"
            s.x = (r.left + r.right) / 2;
            s.y = (r.top + r.bottom) / 2;
            if (s.mode === "blue") {                            // start standing on the "floor"
                const hh = s.hit / 2;
                if (s.gdir === 0) s.y = r.bottom - hh; else if (s.gdir === 2) s.y = r.top + hh;
                else if (s.gdir === 1) s.x = r.left + hh; else s.x = r.right - hh;
            }
            call("attack start", a.start, a, B.api);
        },
        update() {
            if (B.invuln > 0) B.invuln--;
            if (B.orangeHint > 0) B.orangeHint--;
            updateSoul();
            orangeTick();
            if (B.state !== "attack") return;        // the orange soul can die from standing still
            const s = B.soul;
            B.trail.push({ x: s.x, y: s.y });
            if (B.trail.length > 6) B.trail.shift();
            tiltTick();
            if (B.atkFrame >= 0) call("attack update", B.atk.update, B.atk, B.api);
            updateBullets();
            if (B.state !== "attack") return;        // died this frame
            B.atkFrame++;
            if (B.atkFrame >= (B.atkEnd ?? (B.atk.duration || 300))) {
                call("attack end", B.atk.end, B.atk, B.api);
                B.bullets = []; B.invuln = 0;
                if (B.survival) survivalOver(); else endTurn();
            }
        },
        draw() {
            const r = inner(B.box), s = B.soul;
            for (const b of B.bullets) {
                ctx.save();
                if (b.clip) { ctx.beginPath(); ctx.rect(r.left, r.top, r.w, r.h); ctx.clip(); }
                drawBullet(b);
                ctx.restore();
            }
            if (VFX.high && s.moving) B.trail.forEach((p, i) => drawSoul(p.x, p.y, s.w, s.h, s.mode, 0.07 * (i + 1)));
            drawSoul(s.x, s.y, s.w, s.h, s.mode, B.invuln > 0 && (B.invuln >> 2) % 2 ? 0.3 : 1);
            if (s.mode === "orange") drawOrangeHud(s);
            if (B.atk.draw) call("attack draw", B.atk.draw, B.atk, ctx, B.api);     // your own drawing code
            if (Engine.debug) { ctx.strokeStyle = "#0f0"; ctx.lineWidth = 1; ctx.strokeRect(s.x - s.hit / 2, s.y - s.hit / 2, s.hit, s.hit); }
        }
    },

    // the end of a survival phase: white flash, the enemy turns to dust, the music fades, "Thanks for playing!"  (game.js -> ending: {...})
    ending: {
        enter() {
            const o = endCfg();
            B.bullets = []; B.atk = null; B.invuln = 0; B.pop = null; B.fight = null;
            B.end = { t: 0 };
            Sound.stopAll();
            Sound.play("hit"); Sound.play("break");
            Engine.shake(12, 40);
            Engine.fadeMusic(o.musicFade ?? 330);
            B.enemyShake = 40;
        },
        update() {
            const e = B.end, o = endCfg();
            e.t++;
            if (e.t < 30) B.enemyShake = 24;
            if (e.t === 30) {
                B.dust = { t: 0 };
                Sound.play("break");
                Engine.shake(5, 24);
                VFX.spawn(320, 140, 60, { color: "#fff", speed: 4, life: 80, gravity: -0.03 });
            }
            if (B.dust) B.dust.t++;
            if (e.t > 30 && e.t < 130 && e.t % 4 === 0) VFX.spawn(300 + (e.t - 30), 130, 4, { color: "#ddd", speed: 2, life: 60, gravity: -0.02 });
            if (o.glitchAt != null && G.phases[B.phase]) {            // ending.glitchAt: this ending is followed by the next phase (phase 3)
                if (e.t === o.glitchAt) { e.gl = 0; Engine.shake(10, 30); }
                if (e.gl !== undefined) {
                    e.gl++;
                    if (e.gl < 26 && e.gl % 2 === 0) Sound.beep(rand(60, 900), 0.07, "sawtooth", 0.06, rand(40, 1200));
                    if (e.gl === (o.glitchFor ?? 26) + (o.blackFor ?? 120)) { beginPhase(B.phase + 1, false); }   // 2 seconds of black, then the new phase appears instantly
                }
            }
            if (o.restart && e.t > 700 && Input.confirm()) restart();
        },
        draw() {}
    },

    // phase 3 intro (game.js -> phases[n].rebirth): the box + HUD fade away, a song + dialogue, a second song while the HUD returns,
    // a third song while the 4 buttons break, then flash -> full HP -> the fight.  Every stage waits for its song to END (so the songs
    // follow each other exactly); if a song can't play (blocked / missing) a timer moves on instead.
    //   musicTalk / musicAfter / musicBreak : the three intro songs      talkLen / afterLen / breakLen : their length in seconds (backup timers)
    //   breakAt: [s1, s2, s3, s4] : seconds INSIDE musicBreak at which the buttons break  (or bpm + beatOffset + every = break on the beat)
    rebirth: {
        enter() {
            const p = G.phases[B.phase - 1];
            setBoxMenu(); B.box = { ...BOX_MENU };                      // the normal battle box, instantly (no sliding in)
            B.rb = { o: p.rebirth, p, stage: "hold", t: 0, typer: null, beat: -1, beats: 0, broke: 0, clock: 0, ended: false, len: 15 };
        },
        update() {
            const r = B.rb, o = r.o, ui = B.ui;
            r.t++;
            if (r.typer) r.typer.update();
            // start one song of the intro (null = silence). r.ended turns true when it finishes by itself
            const song = (src, len) => {
                r.ended = !src; r.len = len ?? 15; r.t = 0; r.clock = 0;
                Engine.playMusic(src, { loop: false, onEnd() { r.ended = true; } });
            };
            const songLen = () => { const m = Engine.music; return m && isFinite(m.duration) && m.duration > 0 ? m.duration : r.len; };
            const songOver = () => r.ended || r.t > (songLen() + 3) * 60;             // finished (or the backup timer ran out)
            const clk = () => { const t = Engine.musicTime(); return t >= 0 ? t : r.t / 60; };      // the song's own clock (frame clock if it can't play)
            if (r.stage === "hold") { if (r.t >= (o.hold ?? 60)) { r.stage = "fade"; r.t = 0; } }
            else if (r.stage === "fade") {
                ui.box = ui.hud = Math.max(0, 1 - r.t / (o.fade ?? 150));
                if (r.t >= (o.fade ?? 150)) { r.stage = "talkwait"; song(o.musicTalk ?? r.p.music, o.talkLen); }
            } else if (r.stage === "talkwait") {
                if (r.t >= (o.musicWait ?? 90)) { r.stage = "talk"; r.typer = new Typer(o.text, { auto: o.auto ?? 80, speed: o.speed ?? 2, voice: B.enemy.voice }); }
            } else if (r.stage === "talk") {
                if (r.typer.done) { r.stage = "talkend"; B.hp = Math.max(B.hp, 1); }
            } else if (r.stage === "talkend") {                                        // dialogue over: wait for its song, then the "after" song
                if (songOver() || !o.musicTalk) { r.stage = "after"; song(o.musicAfter ?? null, o.afterLen); }
            } else if (r.stage === "after") {
                ui.hud = Math.min(1, r.t / 60);                                        // the HUD + the 4 buttons come back
                if (ui.hud >= 1 && songOver()) { r.stage = "buttons"; song(o.musicBreak ?? null, o.breakLen); r.keep = !o.musicBreak; }
            } else if (r.stage === "buttons") {
                if (r.keep && r.t < 40) { r.beat = -1; return; }
                const ct = clk();
                let due = false;
                if (o.breakAt) due = r.broke < 4 && ct >= o.breakAt[Math.min(r.broke, o.breakAt.length - 1)];
                else {
                    const bi = Math.floor((ct - (o.beatOffset || 0)) / (60 / o.bpm));
                    if (r.beat < 0) r.beat = bi;
                    if (bi > r.beat) { r.beat = bi; r.beats++; due = r.beats % (o.every ?? 4) === 0 && r.broke < 4; }
                }
                if (due) {
                    const i = r.broke++;
                    if (!B.gone[i]) B.btn[i] = { t: 0 };                         // (a button Sans already slashed stays gone)
                    Sound.play("break"); Engine.shake(4, 8);
                    VFX.spawn(32 + i * 152 + 60, 452, 14, { color: "#ff7f27", speed: 4, gravity: 0.15 });
                    VFX.flash("#fff", 8, 0.18);
                }
                if (r.broke === 4 && B.btn[3].t >= BREAK_F) { r.stage = "calm"; r.cal = 0; }
            } else if (r.stage === "calm") {
                r.cal++;
                const playing = Engine.musicTime() >= 0;
                if (r.keep ? r.cal >= (o.calm ?? 150) : (songOver() || (!playing && r.cal >= (o.calm ?? 150) + 300))) {   // the break song is over: flash, full HP, the fight begins
                    VFX.flash("#fff", 40, 1); Engine.shake(10, 24); Sound.play("blasterFire");
                    B.hp = G.player.maxHp; Sound.play("heal");
                    B.ui = { box: 1, hud: 1 }; B.rb = null;
                    if (r.keep) {                                                          // old style (one song for the whole intro): restart it for the fight
                        const m = Engine.music;
                        if (m && o.restartMusic !== false) { try { m.currentTime = 0; Engine.kickMusic(m); } catch (e) { Engine.playMusic(r.p.music); } }
                        else if (!m) Engine.playMusic(r.p.music);
                    }
                    startSurvival(r.p);
                }
            }
        },
        draw() {
            const r = B.rb;
            if (r && r.typer && r.stage === "talk") drawTyped(r.typer, 80, r.o.y ?? 252, 480, 28, 36, "#fff", "center");
        }
    },

    // phase 2 start (game.js -> phases[n].mercySlash = { delay }): after the delay Sans slashes the MERCY button to pieces. 3 options are left.
    mercyslash: {
        enter(d) { setBoxMenu(); B.ms = { t: 0, delay: d.delay, next: d.next }; B.typer = null; B.menuIdx = Math.min(B.menuIdx, 2); },
        update() {
            const m = B.ms, T = m.t++ - m.delay;
            if (T === 0) { Slash.spawn({ dir: 1 }); Engine.shake(3, 8); }                       // Sans swings
            if (T === 8) { Sound.play("blasterFire"); Engine.shake(5, 6); VFX.flash("#fff", 6, 0.35); }   // the cut streaks across the screen
            if (T === 14) {                                                                      // ...and lands on MERCY
                B.btn[3] = { t: 0, slash: true }; B.gone[3] = true; B.enemyShake = 20;
                Sound.play("hit"); Sound.play("break"); Sound.play("slam");
                Engine.shake(14, 36); Engine.glitch(14, 1.7); Engine.aberrate(12, 40); VFX.flash("#fff", 22, 0.7);
                VFX.spawn(548, 452, 60, { color: "#fff", speed: 8, life: 50 });
                VFX.spawn(548, 452, 40, { color: ORANGE_COL, speed: 5, life: 60, gravity: 0.12 });
                VFX.spawn(548, 452, 30, { color: "#ff3050", speed: 6, life: 40 });
            }
            if (T === 20) { Engine.glitch(8, 1.2); Engine.shake(6, 14); }
            if (T > 20 && T < 60 && T % 6 === 0) VFX.spawn(548 + rand(-40, 40), 452, 4, { color: "#ff9a00", speed: 2, life: 40, gravity: 0.1 });
            if (T >= 95) { const n = m.next; B.ms = null; n(); }
        },
        draw() {
            const m = B.ms, T = m.t - m.delay;
            if (T >= 8 && T < 30) {                                                              // the slash itself: a long white line from Sans to the button
                const p = clamp((T - 8) / 6, 0, 1), fade = 1 - clamp((T - 14) / 16, 0, 1);
                const x0 = 330, y0 = 150, x1 = 556, y1 = 458;
                ctx.save(); ctx.lineCap = "round"; ctx.globalAlpha = fade;
                for (const [lw, col] of [[16, "rgba(255,255,255,0.25)"], [5, "#fff"]]) {
                    ctx.strokeStyle = col; ctx.lineWidth = lw * (0.4 + 0.6 * fade);
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); ctx.stroke();
                }
                ctx.restore();
            }
            if (T >= 14 && T < 40) {                                                             // shockwave ring on the button
                const k = (T - 14) / 26;
                ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = "#fff"; ctx.lineWidth = 6 * (1 - k) + 1;
                ctx.beginPath(); ctx.arc(548, 452, 10 + k * 90, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            }
        }
    },

    // the cinematic ending of a phase (game.js -> phases[n].finale): see FIN_DEF / finUpdate / finDraw
    finale: {
        enter() {
            const p = G.phases[B.phase - 1], o = { ...FIN_DEF, ...((p && p.finale) || {}) }, s = B.soul, sr = finRect();
            B.bullets = []; B.atk = null; B.invuln = 0; B.pop = null; B.fight = null;
            Sound.stopAll(); Engine.stopMusic();
            s.mode = "red"; s.idle = 0;
            B.fin = {
                o, t: 0, tc: -o.lead / 60, lastTc: null, started: false, fixed: null, fixedAt: 0, done: {}, silent: false,
                sr, O: { x: 320, y: sr ? sr.y + sr.h * 0.5 : 130 }, soul: { x: s.x, y: s.y }, sp: 0, bobNow: 0,
                parts: [], rings: [], tiles: null, cracks: finCracks(o), punch: 0, glow: 0, roll: 0, typer: null, skip: 0
            };
            Engine.shake(6, 14); VFX.flash("#fff", 24, 0.6);          // the last hit lands
            finHeart(1);
        },
        update() { finUpdate(); },
        draw() {}
    },

    win: {
        enter(kind) {
            const e = B.enemy;
            B.fade = kind !== "flee";
            Sound.play("win");
            const msg = kind === "kill" ? `* YOU WON!\n* You earned ${e.exp} EXP and ${e.gold} gold.`
                : kind === "spare" ? `* YOU WON!\n* You spared ${e.name}.\n* You earned 0 EXP and ${e.gold} gold.`
                : "* Ran away...";
            setBoxMenu();
            B.typer = new Typer([msg, "* (Press Z to play again)"], { onDone: restart });
            hook("onWin", kind);
        },
        update() { B.typer.update(); },
        draw() { drawTyped(B.typer, B.box.x + 24, B.box.y + 20, B.box.w - 48, TEXT_PX, TEXT_LH); }
    },

    gameover: {
        enter() {
            const c = goCfg();
            Engine.deaths = (Engine.deaths || 0) + 1;
            B.go = { x: B.soul.x, y: B.soul.y, t: 0, shards: [], embers: [], quote: pickQuote(c), qn: 0, flash: 0, cracks: [], leave: -1, skipped: false, music: false };
            B.bullets = []; Sound.stopAll(); Engine.stopMusic();
            Cam.snap(); Bars.snap(); B.tilt = null; B.int = []; B.sb = null; B.slashT = -1; Slash.clear(); Engine.freezeT = 0;
            for (let i = 0; i < 7; i++) { const an = rand(0, 6.28), l = rand(10, 24); B.go.cracks.push({ an, l, w: rand(0.6, 1.4) }); }
            hook("onGameOver");
        },
        update() {
            const g = B.go, c = goCfg(); g.t++;
            const T = GO_T;
            if (g.t === T.crack) { Sound.play("break"); Engine.shake(3, 8); VFX.flash("#f00", 8, 0.25); }
            if (g.t === T.shatter) {                                                              // the heart shatters
                Sound.play("break"); Engine.shake(9, 20); Engine.aberrate(10, 26); Engine.glitch(8, 1);
                g.flash = 1; VFX.ring(g.x, g.y, { r1: 140, life: 36, w: 7, color: "#f22" });
                for (let i = 0; i < 26; i++) {
                    const an = rand(0, 6.28), sp = rand(1.2, 7);
                    g.shards.push({ x: g.x, y: g.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1.2, r: rand(3, 8), rot: rand(0, 6.28), vr: rand(-0.2, 0.2), a: 1, drag: rand(0.965, 0.985) });
                }
            }
            if (g.t === T.music && c.music && !g.music) { g.music = true; Engine.playMusic(c.music, { loop: true, volume: c.volume ?? 0.6 }); }
            if (g.t > T.shatter) {                                                                // shards: heavy slow-mo drift, then fade
                for (const sh of g.shards) { sh.x += sh.vx; sh.y += sh.vy; sh.vx *= sh.drag; sh.vy = sh.vy * sh.drag + 0.035; sh.rot += sh.vr; if (g.t > T.shatter + 90) sh.a = Math.max(0, sh.a - 0.012); }
                if (g.t % 3 === 0 && g.t < T.prompt && VFX.on) g.embers.push({ x: rand(0, W), y: H + 8, vy: -rand(0.3, 1.1), vx: rand(-0.2, 0.2), r: rand(1, 2.6), a: rand(0.3, 0.8), ph: rand(0, 6) });
                for (const e of g.embers) { e.y += e.vy; e.x += e.vx + Math.sin(g.t / 25 + e.ph) * 0.25; if (e.y < -10) e.a = 0; }
                g.embers = g.embers.filter((e) => e.a > 0);
            }
            if (g.flash > 0) g.flash = Math.max(0, g.flash - 0.035);
            if (g.t >= T.quote && g.qn < g.quote.length && g.t % 2 === 0) {                      // the enemy's last words are typed out
                g.qn++;
                const ch = g.quote[g.qn - 1];
                if (ch !== " " && ch !== "\n" && g.qn % 2 === 0) { try { Sound.play(c.voice || (G.enemy && G.enemy.voice) || "dialogue"); } catch (e) { /* ignore */ } }
            }
            // Z before the prompt appears = skip ahead (so repeated deaths don't drag)
            if (g.t > 30 && g.t < T.prompt && !g.skipped && Input.confirm()) {
                g.skipped = true;
                if (g.t < T.shatter) g.t = T.shatter - 1;
                g.t = Math.max(g.t, T.shatter + 1);
                g.qn = g.quote.length;
                g.t = Math.max(g.t, T.prompt);
                if (c.music && !g.music) { g.music = true; Engine.playMusic(c.music, { loop: true, volume: c.volume ?? 0.6 }); }
                return;
            }
            if (g.leave >= 0) {
                if (++g.leave > 22) { const act = g.act; g.leave = -1; Engine.stopMusic(); if (act === "title") Engine.toTitle(); else restart(G.checkpoints === false ? 0 : B.phase, true); }
                return;
            }
            if (g.t > T.prompt + 6) {
                if (Input.confirm()) { g.leave = 0; g.act = "retry"; Sound.play("select"); }
                else if (c.titleKey !== false && Input.cancel()) { g.leave = 0; g.act = "title"; Sound.play("select"); }
            }
        },
        draw() {}
    }
};

const endCfg = () => (B.phase > 0 && G.phases[B.phase - 1] && G.phases[B.phase - 1].ending) || G.ending || {};

// phase 0 = new fight.  phase >= 1 = retry from the start of that phase (after a Game Over)
function restart(phase = 0, retry = false) {
    B = newBattle();
    Slash.reset(); Cam.snap(); Bars.snap(); Popups.clear(); Engine.resetTitle();
    if (phase > 0 && G.phases[phase - 1]) beginPhase(phase, false, true);
    else {
        // musicAfterFirstAttack: the fight starts in silence, the music kicks in when the first attack is over (see startFightMusic)
        const hasOpening = G.opening && G.opening.steps && !retry;
        if (G.musicAfterFirstAttack) { Engine.stopMusic(); B.pendingMusic = true; }
        else if (hasOpening) Engine.stopMusic();                  // the opening starts the music itself (step key  music: "next"  = when Sans starts talking)
        else if (!Engine.music || Engine.musicSrc !== G.music) Engine.startMusic();
        if (G.opening && G.opening.steps && !retry) startOpening();      // game.js -> opening: the cinematic before phase 1 (not repeated after a Game Over)
        else enter("intro");
    }
    hook("onStart");
}

// ---------- GAME OVER (cinematic) ----------
// timeline in frames: 0..crack = the world drains of colour and the soul pulses, crack = a crack appears, shatter = it breaks,
// music = theme starts, title = GAME OVER fades in, quote = last words, prompt = "Z try again"
const GO_T = { crack: 50, shatter: 108, music: 118, title: 150, quote: 235, prompt: 330 };
const GO_QUOTES = ["i'm not mad. just... disappointed.", "heh. that's one.", "don't give up. ...or do.", "you're gonna have to try harder than that.", "get up. we're not done yet."];
const goCfg = () => G.gameOver || {};
function pickQuote(c) {
    let q = typeof c.quotes === "function" ? call("gameOver.quotes", c.quotes, G, Engine.deaths, GameApi) : c.quotes;
    if (!Array.isArray(q)) q = q ? [q] : GO_QUOTES;
    return String(q[(Engine.deaths - 1) % q.length] || "");
}
function drawGameOver() {
    const g = B.go, t = g.t, s = B.soul, c = goCfg(), T = GO_T;
    const accent = c.color || "#e0143c", titleTxt = c.title || "GAME OVER";
    const beat = Math.sin(t / (t < T.crack ? 6 : 3.5));
    if (t < T.shatter) {
        // 1) the battle freezes, colour drains, a red vignette closes in, the soul beats faster and faster
        drawEnemy(); drawBox(); drawHUD(); drawButtons();
        const k = clamp(t / T.crack, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = "saturation"; ctx.globalAlpha = k; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        const vg = ctx.createRadialGradient(g.x, g.y, 40 + (1 - k) * 360, g.x, g.y, 460);
        vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(20,0,4,${0.55 + 0.35 * k})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(120,0,16,${0.12 * k})`; ctx.fillRect(0, 0, W, H);
        const sc = 1 + (t < T.crack ? 0.07 * Math.max(0, beat) : 0.05 * Math.max(0, beat));
        ctx.save();
        ctx.translate(g.x + (t >= T.crack ? rand(-1.2, 1.2) : 0), g.y);
        ctx.scale(sc, sc);
        if (VFX.on) { ctx.shadowColor = "#f22"; ctx.shadowBlur = 12 + 14 * k; }
        drawSoul(0, 0, s.w, s.h, "red");
        if (t >= T.crack) {                                                                  // cracks spread over the soul
            const grow = clamp((t - T.crack) / (T.shatter - T.crack), 0, 1);
            ctx.shadowBlur = 0; ctx.strokeStyle = "#000"; ctx.lineCap = "round";
            for (const cr of g.cracks) {
                ctx.lineWidth = cr.w * 1.6; ctx.beginPath(); ctx.moveTo(0, 0);
                let x = 0, y = 0;
                for (let i = 1; i <= 4; i++) { const d = (cr.l * grow * i) / 4; x = Math.cos(cr.an + Math.sin(i * 3 + cr.l) * 0.5) * d; y = Math.sin(cr.an + Math.sin(i * 3 + cr.l) * 0.5) * d; ctx.lineTo(x, y); }
                ctx.stroke();
            }
        }
        ctx.restore();
        // letterbox bars slide in
        const bh = 52 * clamp(t / 40, 0, 1) ** 0.5; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
        if (t >= T.shatter - 3) { ctx.globalAlpha = (t - (T.shatter - 3)) / 3; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        return;
    }
    hideGif();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const since = t - T.shatter;
    // a deep red glow rises behind the title
    const ga = clamp((t - T.title + 30) / 90, 0, 1);
    if (ga > 0) {
        const gr = ctx.createRadialGradient(320, 150, 10, 320, 150, 330);
        gr.addColorStop(0, rgba(accent, 0.30 * ga)); gr.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    for (const e of g.embers) { ctx.globalAlpha = e.a * 0.7; ctx.fillStyle = accent; ctx.fillRect(e.x, e.y, e.r, e.r); }
    ctx.globalAlpha = 1;
    // shards (little red triangles that spin as they drift)
    for (const sh of g.shards) {
        if (sh.a <= 0) continue;
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.rot); ctx.globalAlpha = sh.a;
        if (VFX.on) { ctx.shadowColor = "#f22"; ctx.shadowBlur = 8; }
        ctx.fillStyle = "#f22"; ctx.beginPath(); ctx.moveTo(0, -sh.r); ctx.lineTo(sh.r * 0.9, sh.r * 0.8); ctx.lineTo(-sh.r * 0.9, sh.r * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    ctx.globalAlpha = 1;
    VFX.drawFront();
    // title: letters drop in one by one, spacing eases open, colour-split glitch for a moment
    if (t >= T.title) {
        const k = t - T.title, n = titleTxt.length;
        ctx.save(); ctx.font = `76px ${FONT}`; ctx.textBaseline = "top";
        const spread = 1 + 0.35 * Math.max(0, 1 - k / 120), widths = [...titleTxt].map((ch) => ctx.measureText(ch).width * spread);
        const total = widths.reduce((q, w) => q + w, 0); let x = 320 - total / 2;
        for (let i = 0; i < n; i++) {
            const la = clamp((k - i * 5) / 22, 0, 1), ease = 1 - (1 - la) ** 3, jy = (1 - ease) * -26;
            if (la > 0 && titleTxt[i] !== " ") {
                ctx.textAlign = "left";
                if (VFX.on && k < 70) { ctx.globalAlpha = la * 0.6; ctx.fillStyle = "#2df"; ctx.fillText(titleTxt[i], x + 4, 108 + jy); ctx.fillStyle = "#f2a"; ctx.fillText(titleTxt[i], x - 4, 108 + jy); }
                ctx.globalAlpha = la; ctx.fillStyle = "#fff";
                if (VFX.on) { ctx.shadowColor = accent; ctx.shadowBlur = 24 + 10 * Math.sin(t / 14); }
                ctx.fillText(titleTxt[i], x + (k < 40 && VFX.on ? rand(-1.5, 1.5) : 0), 108 + jy);
            }
            x += widths[i];
        }
        ctx.restore(); ctx.globalAlpha = 1;
        const ln = clamp((k - 30) / 50, 0, 1);
        ctx.fillStyle = rgba(accent, 0.85); ctx.fillRect(320 - 210 * ln, 198, 420 * ln, 2);
        if (c.counter !== false && k > 40) { ctx.globalAlpha = clamp((k - 40) / 40, 0, 1); text(`ATTEMPT  #${Engine.deaths}`, 320, 208, 16, "#8a8a9a", "center"); ctx.globalAlpha = 1; }
    }
    // the enemy's last words
    if (t >= T.quote && g.quote) {
        const shown = g.quote.slice(0, g.qn), lines = wrap(shown, 460);
        ctx.font = `22px ${FONT}`;
        lines.forEach((l, i) => text(l, 320, 262 + i * 28, 22, "#cfcfe0", "center"));
        const who = c.speaker !== undefined ? c.speaker : ((G.enemy && G.enemy.name) || "");
        if (who) text("- " + who, 320, 246, 14, "#6a6a80", "center");
    }
    if (t > T.prompt && g.leave < 0 && (t >> 5) % 2 === 0) {
        text("[Z]  TRY AGAIN", 320, 400, 24, "#ff0", "center");
        if (c.titleKey !== false) text("[X]  QUIT TO TITLE", 320, 430, 16, "#777", "center");
    }
    if (g.flash > 0) { ctx.globalAlpha = g.flash; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (g.leave >= 0) { ctx.globalAlpha = clamp(g.leave / 20, 0, 1); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

function drawEnding() {
    const e = B.end, t = e.t, o = endCfg();
    if (e.gl !== undefined && e.gl >= (o.glitchFor ?? 26)) { hideGif(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }       // glitch is over: pure black
    VFX.drawBack();
    drawEnemy();
    drawBox(); drawHUD(); drawButtons();
    const dark = clamp((t - 150) / 100, 0, 1);                                   // everything fades to black...
    if (dark > 0) { ctx.globalAlpha = dark; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    VFX.drawFront();
    const fl = clamp(1 - t / 60, 0, 1);                                          // ...after the big white flash
    if (fl > 0) { ctx.globalAlpha = fl; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    const k = clamp((t - (o.textAt ?? 330)) / 150, 0, 1);                        // ...and the message slowly appears
    if (k > 0) {
        const sc = 0.94 + 0.06 * k;
        ctx.save();
        ctx.globalAlpha = k;
        if (VFX.on) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 20 * k; }
        ctx.translate(W / 2, H / 2);
        ctx.scale(sc, sc);
        text(o.text || "Thanks for playing!", 0, -24, o.size || 46, o.color || "#fff", "center");
        ctx.restore();
    }
    if (e.gl !== undefined) {                     // THE GLITCH: torn slices, colour splits, static, flickers
        const g = e.gl, k = g / (o.glitchFor ?? 26);
        if (g % 5 === 4) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
        for (let i = 0; i < 6 + k * 14; i++) {
            const y = rand(0, H), h = rand(4, 30 + k * 60), dx = rand(-80, 80) * (0.4 + k);
            ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
        }
        for (let i = 0; i < 10 + k * 30; i++) {
            ctx.globalAlpha = rand(0.3, 0.9);
            ctx.fillStyle = pick(["#f00", "#0ff", "#fff", "#000", "#00f"]);
            ctx.fillRect(rand(0, W), rand(0, H), rand(10, 200), rand(2, 14));
        }
        ctx.globalAlpha = k * k; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
}

// ============================================================
// FINALE: the cinematic ending of a phase (game.js -> phases[n].finale = {...}), played after its survival attack is over.
// Black bars slide in, the camera slowly zooms into the enemy while it says its last words, the screen cracks on every heartbeat of the
// song, then the DROP: white flash, camera punch, shockwaves, the sprite shatters into glowing shards. The camera tilts down to the lone
// SOUL, soft pulses on the beats, and a final white-out fades to the title text.
// Everything is timed on the FINALE SONG'S OWN CLOCK (seconds into that song), exactly like phase 3's attacks, so it can't drift off the music.
// Options (all optional, times are SONG SECONDS - the defaults fit "Music that plays when the battle is about to end.mp3"):
//   music, volume, lead (frames of silence before the song)   say: ["last words", ...], sayAt, sayAuto
//   thumps: [..]  heartbeat hits before the boom (cracks grow)   boom   pulses: [..]  soft beats after it   last  (final white-out)   title  (text appears)   fadeAt (music fades)
//   text, sub, size  (the title)   vfx: { color, mote } (gradient colours after the boom)   restart: true (Z = play again)   skippable: false (no hold-X skip)
// ============================================================
const FIN_DEF = {
    music: null, volume: 0.6, lead: 90,
    say: [], sayAt: 1.0, sayAuto: 60,
    thumps: [3.5, 7.9], boom: 12.25, pulses: [16.6, 18.8, 21.0, 23.2, 29.7], last: 38.4, title: 40.6, fadeAt: 43,
    text: "Thanks for playing!", sub: "", size: 46, vfx: null, restart: false, skippable: true
};
const FIN_BAR = 54;                                       // height of the black cinema bars
const sm01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hash2 = (i, j) => Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;

function finRect() {                                      // where the enemy sprite sits (same size as in the normal battle scene)
    const img = B.enemyKey ? Assets.get(B.enemyKey) : null;
    if (!img) return null;
    const sc = Math.min(170 / img.height, 300 / img.width) * (B.enemy.scale ?? 1), w = img.width * sc, h = img.height * sc;
    return { img, sc, w, h, x: 320 - w / 2, y: 215 - h };
}

// the cracks that run across the screen: 9 jagged lines from the middle, each with small side cracks
function finCracks(o) {
    const out = [], n = 9, ox = W / 2, oy = H / 2 - 30, th = o.thumps || [];
    for (let i = 0; i < n; i++) {
        let a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25), x = ox, y = oy, L = 0;
        const pts = [[x, y]], kids = [];
        for (let k = 0, segs = randInt(9, 13); k < segs; k++) {
            a += rand(-0.45, 0.45);
            const l = rand(30, 62); x += Math.cos(a) * l; y += Math.sin(a) * l; L += l; pts.push([x, y]);
            if (k > 1 && k % 3 === 0) {                   // a side crack
                let ba = a + (kids.length % 2 ? 1 : -1) * rand(0.5, 1.1), bx = x, by = y, BL = 0;
                const bp = [[bx, by]];
                for (let q = 0; q < 4; q++) { ba += rand(-0.4, 0.4); const bl = rand(16, 34); bx += Math.cos(ba) * bl; by += Math.sin(ba) * bl; BL += bl; bp.push([bx, by]); }
                kids.push({ pts: bp, L: BL, from: L });
            }
        }
        // which moment this crack appears: 3 on the first heartbeat, 3 on the second, the last 3 shortly before the boom
        const at = i < 3 ? (th[0] ?? 3) : i < 6 ? (th[1] ?? th[0] ?? 6) : o.boom - (9 - i);
        out.push({ pts, L, kids, at });
    }
    return out;
}
function finStroke(pts, L, g) {                           // draws the first g (0..1) of a polyline
    let left = L * g;
    if (left <= 0) return;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], d = Math.hypot(dx, dy);
        if (d <= left) { ctx.lineTo(pts[i][0], pts[i][1]); left -= d; }
        else { ctx.lineTo(pts[i - 1][0] + dx * left / d, pts[i - 1][1] + dy * left / d); left = 0; }
    }
    ctx.stroke();
}

function finPart(r, x, y, vx, vy, life, size, col, o = {}) {
    if (r.parts.length < 700) r.parts.push({ x, y, vx, vy, life, age: 0, size, col, g: o.g || 0, drag: o.drag ?? 1, line: !!o.line });
}
function finBurst(r, x, y, n, sp0, sp1, life, cols) {      // streaks of light flying out in every direction
    for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(sp0, sp1);
        finPart(r, x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rand(0.6, 1.2), rand(1, 2.6), pick(cols), { line: true, drag: 0.955 });
    }
}
const finRing = (r, x, y, sp, life, w, col) => r.rings.push({ x, y, t0: r.tc, sp, life, w, col });
const finHeart = (v = 1) => {                                // a low double heartbeat
    Sound.beep(62, 0.16, "sine", 0.16 * v, 36);
    B.timers.push({ t: 9, fn: () => Sound.beep(54, 0.2, "sine", 0.12 * v, 32) });
};

// the sprite breaks into a grid of tiles; each one flies away (nearest to the crack first), spinning, growing toward the camera, fading
function finTiles(r) {
    const S = r.sr;
    if (!S) return [];
    const cols = 13, rows = 18, tw = S.img.width / cols, th = S.img.height / rows, out = [], y0 = S.y + (r.bobNow || 0);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = S.x + i * tw * S.sc, y = y0 + j * th * S.sc, dx = x + tw * S.sc / 2 - r.O.x, dy = y + th * S.sc / 2 - r.O.y, dist = Math.hypot(dx, dy) || 1, hs = hash2(i, j);
        out.push({ sx: i * tw, sy: j * th, tw, th, x, y, w: tw * S.sc, h: th * S.sc, vx: dx / dist, vy: dy / dist, delay: dist / 120 * 0.9 + hs * 0.35,
                   life: 2.4 + hs * 2.2, travel: 60 + hs * 260, up: 30 + hs * 90, spin: (hs - 0.5) * 5, grow: 0.7 + hs * 2.2 });
    }
    return out;
}

// the camera for song-time tc: slow push-in on the face, a punch on the boom that relaxes, a tilt down to the soul, a last push-in
function finCam(r, tc) {
    const o = r.o, bm = o.boom, lead = -o.lead / 60;
    let z, fx, fy;
    if (tc < bm) {
        const u = clamp((tc - lead) / (bm - lead), 0, 1), e = sm01(u);
        z = 1 + (0.3 * u + 0.7 * u * u * u);
        fx = lerp(320, r.O.x - 2, e); fy = lerp(240, r.O.y - 22, e);
    } else {
        const d = tc - bm;
        z = lerp(1.2, 0.96, sm01(d / 26)) + 1.5 * Math.exp(-d * 2.2);
        fx = 320; fy = lerp(r.O.y - 22, 262, sm01((d - 4) / 9));
    }
    z *= (1 + 0.45 * sm01((tc - (o.last - 6)) / 6)) * (1 + 0.05 * r.punch);
    return { z, fx, fy, rot: 0.012 * Math.sin(tc * 0.9) * (tc < bm ? 1 : 0.5) + r.roll };
}

function finUpdate() {
    const r = B.fin, o = r.o, ui = B.ui, s = r.soul;
    r.t++;
    ui.box = ui.hud = Math.max(0, ui.box - 0.02);                                   // the battle box + HUD fade away
    // ---- the clock: the song's own, a frame clock before it starts / if it can't play ----
    if (!r.started && r.t >= o.lead) {
        r.started = true;
        if (o.music) Engine.playMusic(o.music, { loop: false, volume: o.volume });
    }
    const mt = r.started && r.fixed == null ? Engine.musicTime() : -1;
    let tc;
    if (r.fixed != null) tc = r.fixed + (r.t - r.fixedAt) / 60;
    else if (mt >= 0) tc = mt;
    else if (r.started && r.lastTc != null) tc = r.lastTc + 1 / 60;
    else tc = (r.t - o.lead) / 60;
    r.lastTc = r.tc = tc;
    // ---- hold X: skip to the white-out ----
    if (o.skippable && tc < o.last - 0.6) {
        if (Input.held("x", "shift")) { if (++r.skip > 50) { finSkip(r); tc = r.tc; } }
        else r.skip = Math.max(0, r.skip - 2);
    }
    const once = (key, at, fn) => { if (r.done[key] || tc < at) return; r.done[key] = true; if (!r.silent) fn(); };
    const S = r.sr, u = clamp((tc + o.lead / 60) / (o.boom + o.lead / 60), 0, 1);
    r.punch *= 0.9; r.glow *= 0.9; r.roll *= 0.94; r.sp *= 0.93;
    // ---- the soul drifts to the middle under the enemy ----
    s.x += (320 - s.x) * 0.035; s.y += (282 - s.y) * 0.035;
    // ---- last words (subtitles in the bottom bar) ----
    once("say", o.sayAt, () => { if (o.say && o.say.length) r.typer = new Typer(o.say, { auto: o.sayAuto, speed: 2, voice: B.enemy.voice }); });
    if (r.typer) r.typer.update();
    // ---- the heartbeats: the screen cracks, everything pulses ----
    (o.thumps || []).forEach((tt, i) => once("thump" + i, tt, () => {
        r.punch = 1; r.glow = 1; r.sp = 1; finHeart(1);
        Engine.shake(5 + 3 * i, 12); Engine.aberrate(5 + 3 * i, 16); VFX.flash("#fff", 14, 0.22 + 0.1 * i);
        finRing(r, s.x, s.y, 240, 1.4, 6, "#f33");
        if (i > 0) Engine.glitch(5, 0.7);
    }));
    if (tc > 4 && tc < o.boom && Engine.shakeFrames < 3) Engine.shake(0.8 + 3.2 * u * u, 2);       // the rumble grows (never overrides a bigger shake)
    // ---- THE BOOM ----
    once("boom", o.boom, () => {
        r.tiles = finTiles(r); r.boomAt = tc; r.punch = 2; r.roll = 0.06;
        VFX.flash("#fff", 90, 1); Engine.shake(18, 46); Engine.glitch(12, 1.6); Engine.aberrate(14, 60);
        Sound.play("blasterFire"); Sound.play("hit"); Sound.play("break");
        for (const [sp, w] of [[560, 10], [400, 7], [270, 5]]) finRing(r, r.O.x, r.O.y, sp, 1.8, w, "#fff");
        finBurst(r, r.O.x, r.O.y, 150, 6, 20, 70, ["#fff", "#ffe9b8", "#ff7a6a"]);
        if (o.vfx) { VFX.color = o.vfx.color || VFX.color; VFX.mote = o.vfx.mote || VFX.mote; }
    });
    if (tc >= o.boom && !r.tiles) r.tiles = finTiles(r);                              // (after a skip)
    // ---- soft beats after it ----
    (o.pulses || []).forEach((tt, i) => once("pulse" + i, tt, () => {
        r.punch = 0.7; r.sp = 1; finHeart(0.8);
        finRing(r, s.x, s.y, 170, 1.6, 4, "#fff"); VFX.flash("#fff", 12, 0.12); Engine.shake(2, 8); Engine.aberrate(3, 12);
    }));
    // ---- the last white-out: the soul bursts ----
    once("last", o.last, () => {
        Engine.shake(14, 40); Engine.glitch(10, 1.4); Engine.aberrate(12, 50);
        Sound.play("blasterFire"); Sound.play("break");
        for (const sp of [420, 300, 190]) finRing(r, s.x, s.y, sp, 1.6, 6, "#fff");
        finBurst(r, s.x, s.y, 140, 5, 18, 80, ["#fff", "#ffd0d0", "#ff3050"]);
    });
    once("fade", o.fadeAt, () => Engine.fadeMusic(150));
    // ---- embers drift up from what is left of the enemy, later from the dark below ----
    if (tc >= o.boom + 0.3 && tc < o.last && r.t % 2 === 0) {
        for (let i = 0; i < 2; i++) {
            const lone = tc > o.boom + 8;
            finPart(r, lone ? rand(60, 580) : rand(S ? S.x : 250, S ? S.x + S.w : 390), lone ? rand(300, 420) : rand(S ? S.y : 60, S ? S.y + S.h : 210),
                rand(-0.3, 0.3), -rand(0.3, 1.4), rand(90, 200), rand(1, 3), pick(["#fff", "#ffd9a0", "#ff8a5a", "#ff3050"]), { g: -0.002 });
        }
    }
    for (let i = r.parts.length - 1; i >= 0; i--) {
        const p = r.parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
        if (++p.age >= p.life) r.parts.splice(i, 1);
    }
    for (let i = r.rings.length - 1; i >= 0; i--) if (tc - r.rings[i].t0 > r.rings[i].life) r.rings.splice(i, 1);
    // ---- the end ----
    if (o.restart && tc > o.title + 3 && Input.confirm()) restart();
    // ---- after the finale: the OUTRO (video -> credits -> black -> title screen), see Outro / game.js -> outro ----
    if (o.outro && !r.outroStarted && tc >= (o.outroAt ?? o.fadeAt + 2.5)) { r.outroStarted = true; Outro.start(G.outro); }
}

// skip: jump to just before the white-out (the song is moved along with it)
function finSkip(r) {
    const o = r.o, to = o.last - 0.4, m = Engine.music;
    r.skip = 0; r.silent = true;
    if (m && r.fixed == null) { try { m.currentTime = to; } catch (e) { r.fixed = to; r.fixedAt = r.t; } }
    else { r.fixed = to; r.fixedAt = r.t; }
    r.lastTc = r.tc = to;
    r.typer = null; r.done.say = true; r.done.skipped = true;
    B.timers.push({ t: 1, fn: () => { if (B.fin) B.fin.silent = false; } });
}

function finDraw() {
    const r = B.fin, o = r.o, tc = r.tc, S = r.sr, s = r.soul;
    hideGif();
    const u = clamp((tc + o.lead / 60) / (o.boom + o.lead / 60), 0, 1), after = tc >= o.boom, d = tc - o.boom;
    const cam = finCam(r, tc);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    VFX.drawBack();
    // a glow behind the enemy that grows with the tension and floods the screen on the boom
    {
        const gl = after ? Math.max(0, 1 - d / 5) : 0.08 + 0.5 * u * u + 0.4 * r.glow;
        if (gl > 0.01) {
            const gx = W / 2 + (r.O.x - cam.fx) * cam.z, gy = H / 2 + (r.O.y - cam.fy) * cam.z, R = (260 + 300 * (after ? Math.min(1, d) : 0)) * Math.max(1, cam.z * 0.7);
            const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
            g.addColorStop(0, rgba("#ffe9b8", 0.55 * gl)); g.addColorStop(0.45, rgba("#ff5a4a", 0.18 * gl)); g.addColorStop(1, rgba("#ff3050", 0));
            ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
        }
    }
    // ---------------- the world, seen through the camera ----------------
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.scale(cam.z, cam.z); ctx.translate(-cam.fx, -cam.fy);
    ctx.globalCompositeOperation = "lighter";
    if (after && d < 16) {                                                           // god rays
        const a = sm01(d / 0.4) * (1 - sm01((d - 6) / 10)), ang0 = tc * 0.1, R = 1100;
        if (a > 0.01) {
            const g = ctx.createRadialGradient(r.O.x, r.O.y, 0, r.O.x, r.O.y, 760);
            g.addColorStop(0, rgba("#fff3d6", 0.34 * a)); g.addColorStop(1, rgba("#ffb870", 0));
            ctx.fillStyle = g; ctx.beginPath();
            for (let i = 0; i < 14; i++) {
                const a1 = ang0 + i * Math.PI / 7, w = 0.05 + 0.025 * Math.sin(tc * 1.7 + i * 2.1);
                ctx.moveTo(r.O.x, r.O.y);
                ctx.lineTo(r.O.x + Math.cos(a1 - w) * R, r.O.y + Math.sin(a1 - w) * R);
                ctx.lineTo(r.O.x + Math.cos(a1 + w) * R, r.O.y + Math.sin(a1 + w) * R);
            }
            ctx.fill();
        }
    }
    ctx.globalCompositeOperation = "source-over";
    if (S && !after) {                                                               // the enemy: calm, then trembling harder and harder
        r.bobNow = Math.sin(B.frame / 25) * 4 * (1 - sm01(u * 2));
        const tr = 0.3 + 2.4 * u * u, ox = rand(-1, 1) * tr, oy = r.bobNow + rand(-1, 1) * tr;
        ctx.save(); ctx.globalCompositeOperation = "lighter";                         // (additive: the sprite's black JPG background stays invisible over the glow)
        ctx.drawImage(S.img, S.x + ox, S.y + oy, S.w, S.h); ctx.restore();
        const gl = r.glow * 0.6 + 0.1 * u * u * (0.6 + 0.4 * Math.sin(tc * 9));      // white-hot flashes on each heartbeat
        if (gl > 0.02) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, gl); ctx.drawImage(S.img, S.x + ox, S.y + oy, S.w, S.h); ctx.restore(); }
    } else if (!S && !after) drawEnemy();
    if (S && after && r.tiles) {                                                     // the shards
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (const t of r.tiles) {
            const dd = d - t.delay, p = clamp(dd / t.life, 0, 1);
            if (p >= 1) continue;
            const e = 1 - (1 - p) * (1 - p), sc = 1 + t.grow * p;
            ctx.save();
            ctx.translate(t.x + t.w / 2 + t.vx * t.travel * e, t.y + t.h / 2 + t.vy * t.travel * e - t.up * p * p);
            ctx.rotate(t.spin * p); ctx.scale(sc, sc); ctx.globalAlpha = Math.pow(1 - p, 1.4);
            ctx.drawImage(S.img, t.sx, t.sy, t.tw, t.th, -t.w / 2, -t.h / 2, t.w + 0.6, t.h + 0.6);
            ctx.restore();
        }
        ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter";                            // shockwaves
    for (const q of r.rings) {
        const k = (tc - q.t0) / q.life;
        ctx.globalAlpha = Math.pow(1 - k, 1.3); ctx.strokeStyle = q.col; ctx.lineWidth = Math.max(1, q.w * (1 - k));
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, (tc - q.t0) * q.sp), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (tc < o.last) {                                                               // the SOUL, with a halo that beats
        const beat = 1 + 0.35 * r.sp + 0.06 * Math.sin(tc * 5), sz = 20 * beat;
        const lit = after ? sm01((d - 1) / 6) : 0;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 46 * beat);
        g.addColorStop(0, rgba("#ff4a4a", 0.5 + 0.3 * r.sp + 0.2 * lit)); g.addColorStop(1, rgba("#ff0030", 0));
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(s.x - 60, s.y - 60, 120, 120); ctx.restore();
        drawSoul(s.x, s.y, sz, sz, "red");
        if (lit > 0.01) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = lit * 0.45; drawSoul(s.x, s.y, sz, sz, "red"); ctx.restore(); }
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter";                            // sparks, streaks, embers
    for (const p of r.parts) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        if (p.line) { ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke(); }
        else { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
    }
    ctx.restore();
    ctx.restore();
    // ---------------- on top of the picture (screen space) ----------------
    const crackA = after ? Math.max(0, 1 - d / 0.45) : 1;                            // the cracks in the "glass"
    if (crackA > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const c of r.cracks) {
            if (tc < c.at) continue;
            const g = sm01((tc - c.at) / 0.7), pulse = 0.5 + 0.5 * Math.sin(tc * 6 + c.L), lit = 0.25 + 0.55 * u * u + 0.4 * r.glow;
            for (const [lw, al] of [[7, 0.10 + 0.25 * lit * pulse], [1.6, 0.55 + 0.4 * lit]]) {
                ctx.lineWidth = lw; ctx.strokeStyle = rgba("#ffffff", Math.min(1, al * crackA));
                finStroke(c.pts, c.L, g);
                for (const k of c.kids) finStroke(k.pts, k.L, clamp((g * c.L - k.from) / k.L, 0, 1));
            }
        }
        ctx.restore();
    }
    VFX.drawFront();
    const wa = clamp((tc - (o.last - 0.12)) / 0.18, 0, 1), ba = sm01((tc - (o.last + 0.6)) / 1.6);       // the last white-out, then black
    if (wa > 0) { ctx.globalAlpha = wa; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); }
    if (ba > 0) { ctx.globalAlpha = ba; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
    const bar = FIN_BAR * sm01(r.t / 70);                                            // cinema bars + subtitles
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    if (r.typer && tc < o.boom) {
        ctx.save(); ctx.globalAlpha = 1 - sm01((tc - (o.boom - 0.6)) / 0.5);
        drawTyped(r.typer, 60, H - bar + 13, 520, 24, 28, "#fff", "center");
        ctx.restore();
    }
    if (o.skippable && (r.skip > 0 || (tc > -1 && tc < 5))) {
        text("Hold X to skip", 10, 17, 14, "#666");
        if (r.skip > 0) { ctx.fillStyle = "#999"; ctx.fillRect(10, 36, 120 * Math.min(1, r.skip / 50), 3); }
    }
    const tk = sm01((tc - o.title) / 1.8);                                           // the title
    if (tk > 0) {
        ctx.save(); ctx.globalAlpha = tk;
        if (VFX.on) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 22 * tk; }
        ctx.translate(W / 2, H / 2); ctx.scale(0.94 + 0.06 * tk, 0.94 + 0.06 * tk);
        text(o.text, 0, -24, o.size, "#fff", "center");
        if (o.sub) text(o.sub, 0, 40, 20, "#aaa", "center");
        ctx.restore();
        if (o.restart && tc > o.title + 3 && (B.frame >> 5) % 2) text("Press Z to play again", W / 2, H - bar - 34, 18, "#888", "center");
    }
}

// ============================================================
// POPUPS (the "meme jump-scares"): a picture that POPS out of nowhere BEHIND the box / bullets (so it never hides an attack).
// g.popup({ img: "meme1", x: 480, y: 120, h: 230, frames: 70, from: "right", rot: -8, jit: 2, sound: true, flash: true, shake: 6, glitch: 6, border: true })
//   img = key from game.js `images`   x, y = center   h = height (width keeps the picture's shape)   frames = how long it stays
//   from = "left" | "right" | "top" | "bottom": slides in from that edge instead of popping   rot = tilt in degrees   alpha = opacity
// ============================================================
const Popups = {
    list: [],
    clear() { this.list.length = 0; },
    spawn(o = {}) {
        const p = { x: 320, y: 120, h: 220, frames: 70, inF: 6, outF: 12, rot: 0, jit: 2, alpha: 1, border: true, ...o, t: 0 };
        this.list.push(p);
        if (o.sound !== false) {
            if (typeof o.sound === "string") Sound.play(o.sound);
            else { Sound.beep(190, 0.3, "sawtooth", 0.16, 45); Sound.beep(1500, 0.12, "square", 0.07, 600); }       // a loud, cheap jump-scare sting
        }
        if (o.flash !== false) VFX.flash("#fff", 7, 0.45);
        Engine.shake(o.shake ?? 6, 14);
        if (o.glitch !== 0) Engine.glitch(o.glitch ?? 6, 1.1);
        Cam.kick(0.03);
        return p;
    },
    update() { for (let i = this.list.length - 1; i >= 0; i--) if (++this.list[i].t >= this.list[i].frames) this.list.splice(i, 1); },
    draw() {
        for (const p of this.list) {
            const img = Assets.get(p.img);
            if (!img) continue;
            const w = img.width * p.h / img.height, t = p.t, outAt = p.frames - p.outF;
            let sc = 1, x = p.x, y = p.y, al = p.alpha;
            const kin = clamp(t / p.inF, 0, 1);
            if (p.from) {                                                              // slide in from the edge
                const e = 1 - Math.pow(1 - kin, 3), off = (p.from === "left" || p.from === "right") ? w + 40 : p.h + 40;
                if (p.from === "left") x -= off * (1 - e); else if (p.from === "right") x += off * (1 - e);
                else if (p.from === "top") y -= off * (1 - e); else y += off * (1 - e);
            } else sc = Math.max(0.01, kin < 1 ? (kin * kin * (3 - 2 * kin)) * 1.18 : 1);      // pop: 0 -> a little too big -> 1
            if (t >= outAt) { const k = (t - outAt) / p.outF; sc *= 1 - 0.85 * k * k; al *= 1 - k; }                      // sucked away
            if (p.from && t >= outAt) { const k = (t - outAt) / p.outF; const off = (p.from === "left" || p.from === "right") ? w + 40 : p.h + 40; if (p.from === "left") x -= off * k * k; else if (p.from === "right") x += off * k * k; }
            const j = p.jit * (t < p.inF + 6 ? 2 : 1);
            ctx.save();
            ctx.globalAlpha = clamp(al, 0, 1);
            ctx.translate(x + rand(-j, j), y + rand(-j, j));
            ctx.rotate((p.rot + Math.sin(t * 0.7) * 1.5 + (p.spin || 0) * t) * RAD);
            ctx.scale(sc, sc);
            if (p.border) { ctx.fillStyle = "#fff"; ctx.fillRect(-w / 2 - 5, -p.h / 2 - 5, w + 10, p.h + 10); }
            if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 18; }
            ctx.drawImage(img, -w / 2, -p.h / 2, w, p.h);
            ctx.restore();
        }
    }
};

// ============================================================
// OUTRO: what happens after the last fight. game.js -> outro: { order, video, credits: {...}, blackFor }
//   order = ["video", "credits", "black"]  (any order / any subset: the scene is played stage by stage, then the game goes back to the TITLE SCREEN)
//   video = "videos (MP3)/ending video.mp4"   plays full screen (hold X to skip)      blackFor = frames of pure black at the end (120 = 2 seconds)
//   credits = { title, music, volume, cardFrames, cards: [{ head: "small gray line", lines: ["big", "white", "lines"] }] }
// ============================================================
const Outro = {
    active: false, o: null, stage: -1, st: null, order: [], t: 0, skip: 0, vid: null, parts: [],
    start(o) {
        this.o = { order: ["video", "credits", "black"], blackFor: 120, ...(o || {}) };
        this.order = this.o.order.slice(); this.stage = -1; this.active = true; this.skip = 0;
        Sound.stopAll(); Engine.stopMusic(); Engine.resetTitle(); Popups.clear();
        VFX.parts.length = 0; VFX.rings.length = 0; VFX.floats.length = 0;
        Cam.snap(); Bars.snap(); Slash.clear(); hideGif(); Engine.freezeT = 0; Engine.paused = false;
        B = null; Engine.scene = "outro";
        this.parts = []; for (let i = 0; i < 70; i++) this.parts.push({ x: rand(0, W), y: rand(0, H), v: rand(0.12, 0.5), s: rand(1, 2.6), a: rand(0.15, 0.6), ph: rand(0, 6.28) });
        this.next();
    },
    stop() {
        this.active = false;
        if (this.vid) { try { this.vid.pause(); } catch (e) { /* ignore */ } this.vid.remove(); this.vid = null; }
        document.body.classList.remove("outroVideo");
        const sk = document.getElementById("outroSkip"); if (sk) sk.remove();
        if (this.o && this.o.credits) Engine.stopMusic();
    },
    next() {
        this.stage++; this.t = 0; this.skip = 0;
        if (this.stage >= this.order.length) { this.finishAll(); return; }
        const kind = this.order[this.stage];
        if (kind === "video") this.beginVideo();
        else if (kind === "credits") this.beginCredits();
        else this.st = { kind: "black" };
    },
    finishAll() { this.stop(); Engine.toTitle(); },
    // ---------- video ----------
    beginVideo() {
        const src = this.o.video;
        this.st = { kind: "video", ended: false, fade: 0, started: false };
        if (!src) { this.st.ended = true; return; }
        const v = document.createElement("video");
        v.id = "outroVideo"; v.playsInline = true; v.preload = "auto"; v.src = url(src);
        v.volume = clamp(Settings.music / 10, 0, 1); v.muted = Sound.muted;
        v.addEventListener("ended", () => { this.st.ended = true; });
        v.addEventListener("error", () => { Engine.error("Missing / unplayable video: " + src); this.st.ended = true; });
        v.addEventListener("playing", () => { this.st.started = true; v.classList.add("show"); });
        document.body.appendChild(v); document.body.classList.add("outroVideo");
        this.vid = v;
        const tryPlay = (muted) => { v.muted = muted || Sound.muted; const p = v.play(); if (p && p.catch) p.catch(() => { if (!muted) tryPlay(true); else this.st.ended = true; }); };
        tryPlay(false);
        const h = document.createElement("div"); h.id = "outroSkip"; h.textContent = "Hold X to skip"; document.body.appendChild(h);
    },
    endVideo() {
        const v = this.vid; if (v) { v.classList.remove("show"); }
        const h = document.getElementById("outroSkip"); if (h) h.remove();
        this.st.fade = 1;
    },
    // ---------- credits ----------
    beginCredits() {
        const c = { title: (G && G.title) || "", music: null, volume: 0.5, cardFrames: 330, cards: [], ...(this.o.credits || {}) };
        const cards = c.cards.slice();
        this.st = { kind: "credits", c, cards, total: cards.length * c.cardFrames + 120, beat: 0 };
        if (c.music) Engine.playMusic(c.music, { loop: c.loop === true, volume: c.volume });
    },
    update() {
        this.t++;
        const st = this.st;
        if (!st) return;
        for (const p of this.parts) { p.y -= p.v; if (p.y < -4) { p.y = H + 4; p.x = rand(0, W); } }
        if (st.kind === "video") {
            if (Input.held("x", "shift")) { if (++this.skip > 50) st.ended = true; } else this.skip = Math.max(0, this.skip - 2);
            if (this.vid && Input.confirm() && this.vid.paused && !st.started) { try { this.vid.play(); } catch (e) { /* ignore */ } }
            if (!st.started && this.t > 600) st.ended = true;                      // the video never started: do not get stuck
            if (st.ended && !st.fade) this.endVideo();
            if (st.fade) { if (++st.fade > 36) { if (this.vid) { this.vid.remove(); this.vid = null; } document.body.classList.remove("outroVideo"); this.next(); } }
        } else if (st.kind === "credits") {
            if (this.t > 0 && Input.held("x", "shift")) { if (++this.skip > 50) { Engine.fadeMusic(20); this.next(); return; } } else this.skip = Math.max(0, this.skip - 2);
            if (this.t === st.total - 150) Engine.fadeMusic(150);
            if (this.t >= st.total) { Engine.stopMusic(); this.next(); }
        } else if (st.kind === "black") {
            if (this.t >= this.o.blackFor) this.finishAll();
        }
    },
    draw() {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        const st = this.st;
        if (!st) return;
        if (st.kind === "credits") this.drawCredits();
        else if (st.kind === "video" && !st.started) { ctx.globalAlpha = 0.5; text("...", W / 2, H / 2 - 10, 24, "#888", "center"); ctx.globalAlpha = 1; }
    },
    drawCredits() {
        const st = this.st, c = st.c, t = this.t, F = c.cardFrames, bars = 44 * sm01(t / 60);
        // background: a slow warm glow + embers floating up
        const gl = 0.5 + 0.5 * Math.sin(t / 90), g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, 340);
        g.addColorStop(0, rgba("#ffb870", 0.10 + 0.05 * gl)); g.addColorStop(1, rgba("#ff3050", 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (const p of this.parts) { ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t / 30 + p.ph)) * sm01(t / 90); ctx.fillStyle = "#ffd9a0"; ctx.fillRect(Math.round(p.x + Math.sin(t / 70 + p.ph) * 8), Math.round(p.y), p.s, p.s); }
        ctx.restore();
        // the cards: small gray heading, a thin line that grows, then the big white lines
        const i = Math.floor((t - 40) / F), lt = (t - 40) - i * F;
        if (i >= 0 && i < st.cards.length) {
            const cd = st.cards[i], inK = sm01(lt / 55), outK = sm01((F - lt) / 55), a = Math.min(inK, outK), last = i === st.cards.length - 1;
            const lines = cd.lines || [], bigPx = cd.size || (lines.length > 2 ? 30 : 40), lh = bigPx + 14, y0 = H / 2 - (lines.length * lh) / 2 - 12;
            ctx.save(); ctx.globalAlpha = a;
            if (VFX.on) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 14 * a; }
            const rise = (1 - inK) * 14 - (1 - outK) * 10;
            text(cd.head || "", W / 2, y0 - 34 + rise, 18, "#8a8a98", "center");
            ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; const lw = 130 * Math.min(inK, outK); ctx.fillRect(W / 2 - lw / 2, y0 - 8 + rise, lw, 2);
            if (VFX.on) { ctx.shadowColor = "#ffe9b8"; ctx.shadowBlur = 16 * a; }
            lines.forEach((ln, k) => { const ka = clamp((lt - 18 - k * 12) / 40, 0, 1), kb = Math.min(ka, outK); ctx.globalAlpha = kb; text(ln, W / 2, y0 + 8 + k * lh + rise * 0.6 + (1 - ka) * 10, last && k === 0 ? bigPx + 6 : bigPx, last && k === 0 ? "#ffe9b8" : "#fff", "center"); });
            ctx.restore();
        }
        // a little soul that beats in the corner of the picture
        const bt = (t % 50) / 50, beat = 1 + 0.25 * Math.exp(-bt * 6), a2 = 0.75 * sm01(t / 80) * (1 - sm01((t - (st.total - 70)) / 60)), sz = 16 * beat;
        drawSoul(W / 2, 404, sz, sz, "red", a2);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bars); ctx.fillRect(0, H - bars, W, bars);
        const fo = sm01((t - (st.total - 60)) / 50); if (fo > 0) { ctx.globalAlpha = fo; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (t < 200 || this.skip > 0) { text("Hold X to skip", 10, 452, 14, "#555"); if (this.skip > 0) { ctx.fillStyle = "#999"; ctx.fillRect(10, 472, 120 * Math.min(1, this.skip / 50), 3); } }
    }
};

const Battle = {
    init(game) { G = game; restart(); },
    update() {
        B.frame++;
        if (B.enemyShake > 0) B.enemyShake--;
        if (B.pop && ++B.pop.t > 80) B.pop = null;
        for (const b of B.btn) if (b && b.t < 999) b.t++;
        Slash.update(); Popups.update();
        if (B.fade && B.enemyAlpha > 0) B.enemyAlpha = Math.max(0, B.enemyAlpha - 0.02);
        for (const k of ["x", "y", "w", "h"]) {
            B.box[k] = lerp(B.box[k], B.boxT[k], B.boxLerp || 0.22);
            if (Math.abs(B.box[k] - B.boxT[k]) < 0.4) B.box[k] = B.boxT[k];
        }
        B.hpLag = B.hpLag > B.hp ? Math.max(B.hp, B.hpLag - 0.3) : B.hp;
        if (B.boxPulse > 0) B.boxPulse = Math.max(0, B.boxPulse - 0.045);
        const sig = `${B.boxT.x}|${B.boxT.y}|${B.boxT.w}|${B.boxT.h}`;
        if (sig !== B._sig) { if (B._sig && B.state === "attack" && VFX.on) B.boxPulse = 1; B._sig = sig; }
        if (B.state !== "attack" && (B.tilt || Cam.tt !== 0)) { B.tilt = null; Cam.tiltTo(0, 30); }
        interruptTick();
        const timers = B.timers;
        for (let i = timers.length - 1; i >= 0; i--) {
            const tm = timers[i];
            if (tm && --tm.t <= 0) { timers.splice(i, 1); call("after()", tm.fn, null); }
        }
        const s = States[B.state];
        if (s && s.update) s.update();
    },
    draw() {
        if (B.state === "gameover" || B.state === "ending" || B.state === "finale") Slash.clear();
        if (B.state === "gameover") { drawGameOver(); return; }
        if (B.state === "ending") { drawEnding(); return; }
        if (B.state === "finale") { finDraw(); return; }
        const bare = B.state === "cutscene" && B.cs && !B.cs.ui;      // cutscenes hide the box + HUD
        VFX.drawBack();
        drawAura();
        drawEnemy(); Slash.draw(); drawPop();
        Popups.draw();                                          // meme jump-scares (behind the box + bullets)
        if (!bare) drawBox();
        const s = States[B.state];
        if (s && s.draw) s.draw();
        if (!bare) { drawHUD(); drawButtons(); }
        drawInterrupt();
        VFX.drawFront();
        Bars.draw();
        if (B.state === "cutscene" && B.cs && B.cs.p.skippable !== false && (B.cs.t < 150 || B.cs.skip > 0)) {        // "Hold X to skip" (above the cinema bars)
            text("Hold X to skip", 10, 456, 16, "#777");
            if (B.cs.skip > 0) { ctx.fillStyle = "#aaa"; ctx.fillRect(10, 476, 120 * Math.min(1, B.cs.skip / 50), 3); }
        }
    }
};

// ============================================================
// Cinematic intro (optional, set in game.js -> cinematic: { enabled: true, scenes: [...] })
// Scene keys (mix them freely in one scene):
//   wait: frames            title: "BIG TEXT", sub: "small text", frames: 150
//   text: "line" | [lines]  (Z advances; auto: frames to auto-advance; size, color, align, y)
//   image: "imageKey", frames, fadeIn, fadeOut, zoom (0.1 = slowly grows 10%), scale, x, y
//   fade: "out" | "in", frames      bg: "#000"      flash: true | "#color"
//   shake: [amount, frames]         sfx: "soundName"     music: "path.mp3" | null (stop)
//   fn: (c) => { ... }   custom code, c has shake / flash / sound
// ============================================================
const Cinematic = {
    active: false, cfg: null, scenes: [], i: -1, s: null, fadeA: 0, fadeTo: 0, fadeSpd: 0, flashA: 0,
    skip: 0, bg: "#000", total: 0, musicOn: false, done: null,
    start(cfg, done) {
        Object.assign(this, { active: true, cfg, scenes: cfg.scenes || [], i: -1, s: null, fadeA: 0, fadeTo: 0, flashA: 0, skip: 0, bg: "#000", total: 0, musicOn: false, done });
    },
    finish() {
        if (!this.active) return;
        this.active = false;
        if (this.musicOn) Engine.stopMusic();
        if (this.done) this.done();
    },
    begin(def) {
        const s = { ...def, t: 0, typer: null };
        if (s.bg) this.bg = s.bg;
        if (s.flash) this.flashA = 1;
        if (s.shake) Engine.shake(...(Array.isArray(s.shake) ? s.shake : [6, 20]));
        if (s.sfx) Sound.play(s.sfx);
        if (s.music !== undefined) { Engine.playMusic(s.music); this.musicOn = !!s.music; }
        call("cinematic fn", s.fn, s, { shake: (a, f) => Engine.shake(a, f), flash: () => { this.flashA = 1; }, sound: (n) => Sound.play(n) });
        if (s.fade) { this.fadeTo = s.fade === "out" ? 1 : 0; this.fadeSpd = 1 / Math.max(1, s.frames ?? 40); }
        if (s.text !== undefined) s.typer = new Typer(s.text, { speed: s.speed ?? 3, auto: s.auto || 0, voice: s.voice });
        s.dur = s.wait ?? ((s.image || s.title) ? (s.frames ?? 150) : (s.fade ? (s.frames ?? 40) : 0));
        return s;
    },
    advance() {
        for (let guard = 0; guard < 100 && this.active; guard++) {
            this.i++;
            if (this.i >= this.scenes.length) { this.finish(); return; }
            this.s = this.begin(this.scenes[this.i]);
            if (this.s.typer || this.s.dur > 0) return;       // instant scenes (only sfx, shake...) fall through
        }
    },
    update() {
        if (!this.active) return;
        if (this.cfg.skippable !== false) {                    // hold X / Shift to skip
            if (Input.held("x", "shift")) { if (++this.skip > 50) { this.finish(); return; } }
            else this.skip = Math.max(0, this.skip - 2);
        }
        this.total++;
        if (this.fadeA < this.fadeTo) this.fadeA = Math.min(this.fadeTo, this.fadeA + this.fadeSpd);
        else if (this.fadeA > this.fadeTo) this.fadeA = Math.max(this.fadeTo, this.fadeA - this.fadeSpd);
        if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.05);
        if (!this.s) this.advance();
        const s = this.s;
        if (!this.active || !s) return;
        s.t++;
        if (s.typer) { s.typer.update(); if (s.typer.done) this.advance(); }
        else if (s.t >= s.dur) this.advance();
    },
    alpha(s) {
        const fi = s.fadeIn ?? 30, fo = s.fadeOut ?? 30;
        return clamp(Math.min(s.t / Math.max(1, fi), (s.dur - s.t) / Math.max(1, fo)), 0, 1);
    },
    draw() {
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, W, H);
        const s = this.s;
        if (s) {
            if (s.image) {
                const img = Assets.get(s.image);
                if (img) {
                    const k = s.t / Math.max(1, s.dur);
                    const sc = Math.min(560 / img.width, 400 / img.height) * (s.scale ?? 1) * (1 + (s.zoom ?? 0) * k);
                    ctx.save();
                    ctx.globalAlpha = this.alpha(s);
                    ctx.drawImage(img, (s.x ?? W / 2) - img.width * sc / 2, (s.y ?? H / 2) - img.height * sc / 2, img.width * sc, img.height * sc);
                    ctx.restore();
                }
            }
            if (s.title) {
                ctx.save();
                ctx.globalAlpha = this.alpha(s);
                text(s.title, W / 2, s.sub ? 180 : 210, s.size ?? 64, s.color || "#fff", "center");
                if (s.sub) text(s.sub, W / 2, 270, 26, s.subColor || "#aaa", "center");
                ctx.restore();
            }
            if (s.typer) {
                const px = s.size ?? 30;
                drawTyped(s.typer, 80, s.y ?? 190, 480, px, px + 8, s.color || "#fff", s.align || "center");
                if (s.typer.complete && !s.typer.done && !s.auto && (this.total >> 4) % 2) text("Z", 600, 436, 22, "#888", "center");
            }
        }
        if (this.fadeA > 0) { ctx.globalAlpha = this.fadeA; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (this.flashA > 0) { ctx.globalAlpha = this.flashA * Settings.flashK; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (this.cfg.skippable !== false && (this.total < 150 || this.skip > 0)) {
            text("Hold X to skip", 10, 456, 16, "#555");
            if (this.skip > 0) { ctx.fillStyle = "#888"; ctx.fillRect(10, 476, 120 * Math.min(1, this.skip / 50), 3); }
        }
    }
};

// ============================================================
// Menus: the TITLE screen and the PAUSE menu (both have OPTIONS + CONTROLS pages).
// game.js -> menu: { color, mote, sub }   restyles the title screen.   gate: false skips the title screen.
// ============================================================
const UI = {
    mode: "title", page: "main", idx: 0, mainIdx: 0, t: 0, go: 0,
    open(mode) {
        this.mode = mode; this.page = "main"; this.idx = 0; this.mainIdx = 0; this.t = 0; this.go = 0;
        if (mode === "title") {
            const m = (Engine.game && Engine.game.menu) || {};
            VFX.color = m.color || "#4b1a86"; VFX.mote = m.mote || "#a77bd9";
        }
    },
    items() {
        if (this.page === "options") {
            const cyc = (v, d, n) => (v + d + n) % n;
            return [
                { id: "o", label: "VISUAL FX", val: () => VFX.level.toUpperCase(), hint: "OFF / LOW / HIGH. You can also press V at any time.",
                  change(d) { const L = ["off", "low", "high"]; VFX.level = L[cyc(L.indexOf(VFX.level), d, 3)]; Settings.vfx = VFX.level; VFX.parts.length = 0; VFX.rings.length = 0; } },
                { id: "o", label: "MUSIC", bar: () => Settings.music, hint: "Music volume.", change(d) { Settings.music = clamp(Settings.music + d, 0, 10); } },
                { id: "o", label: "SOUND FX", bar: () => Settings.sfx, hint: "Sound effect volume.", change(d) { Settings.sfx = clamp(Settings.sfx + d, 0, 10); } },
                { id: "o", label: "SCREEN SHAKE", val: () => (Settings.shake ? "ON" : "OFF"), hint: "Turn it off if the shaking makes you dizzy.", change() { Settings.shake = !Settings.shake; } },
                { id: "o", label: "CAMERA", val: () => ["OFF", "NO TILT", "FULL"][Settings.cam], hint: "FULL: zoom, roll and the tilt that makes later phases harder. NO TILT: cinematics only. OFF: a still camera.", change(d) { Settings.cam = cyc(Settings.cam, d, 3); } },
                { id: "o", label: "FLASH & GLITCH", val: () => (Settings.flash ? "ON" : "OFF"), hint: "OFF: no screen glitch / colour split, and white flashes are dimmed.", change() { Settings.flash = !Settings.flash; } },
                { id: "back", label: "BACK" }
            ];
        }
        const cfg = this.cfg(), pg = this.customPage();
        if (pg) return [...this.custom(pg.items), { id: "back", label: "BACK" }];
        if (this.page === "controls") return [{ id: "back", label: "BACK" }];
        const hide = cfg.hide || [];
        let base = this.mode === "pause"
            ? [{ id: "resume", label: cfg.resumeLabel || "RESUME" }, { id: "options", label: "OPTIONS" }, { id: "controls", label: "CONTROLS" }, { id: "restart", label: "RESTART FIGHT" }, { id: "quit", label: "QUIT TO TITLE" }]
            : [{ id: "start", label: cfg.startLabel || "START" }, { id: "options", label: "OPTIONS" }, { id: "controls", label: "CONTROLS" }];
        base = base.filter((it) => it.id === "resume" || it.id === "start" || !hide.includes(it.id));
        // game.js -> menu.items / pause.items: your own entries. { label, run(m), page: "name", at: position, hint }
        const extra = this.custom(cfg.items);
        for (const it of extra) { const at = it.at === undefined ? base.length : clamp(it.at, 0, base.length); base.splice(at, 0, it); }
        return base;
    },
    // the menu config of the current mode:  Game.menu (title)  /  Game.pause (pause menu)
    cfg() { const g = Engine.game || {}; return (this.mode === "pause" ? g.pause : g.menu) || {}; },
    // custom page "name" from  menu.pages / pause.pages  (the title menu pages are also available from the pause menu if the pause config has none)
    customPage() {
        if (!String(this.page).startsWith("page:")) return null;
        const g = Engine.game || {}, name = this.page.slice(5), c = this.cfg();
        return (c.pages && c.pages[name]) || (g.menu && g.menu.pages && g.menu.pages[name]) || null;
    },
    // turns user entries into menu rows. Row keys: label (or label(): text), run(m), page, val() + change(d) (an option row), bar(), hint
    custom(list) {
        const out = [];
        for (const it of list || []) {
            if (!it || it.hidden === true || (typeof it.show === "function" && !call("menu show()", it.show, it))) continue;
            out.push({ id: "custom", ...it, label: typeof it.label === "function" ? String(call("menu label()", it.label, it)) : it.label });
        }
        return out;
    },
    // what a run(m) gets: m.g (the battle helper, only in the pause menu), m.close(), m.openPage(name), m.notify(text), m.sound(name), m.start(), m.restart(), m.toTitle(), m.settings
    api() {
        return {
            g: B ? makeApi() : null, ui: UI, settings: Settings,
            close: () => { if (Engine.paused) Engine.setPaused(false); },
            openPage: (n) => { UI.mainIdx = UI.idx; UI.page = "page:" + n; UI.idx = 0; },
            notify: (t) => Engine.notify(t), sound: (n, v) => Sound.play(n, v),
            start: () => UI.pick({ id: "start" }), restart: () => Engine.restartFight(), toTitle: () => Engine.toTitle()
        };
    },
    back() { this.page = "main"; this.idx = this.mainIdx; Sound.play("move"); },
    pick(it) {
        if (it.id === "start") { this.go = 1; Sound.unlock(); Sound.play("break"); VFX.flash("#fff", 14, 0.5); Engine.shake(4, 10); }
        else if (it.id === "options" || it.id === "controls") { this.mainIdx = this.idx; this.page = it.id; this.idx = 0; }
        else if (it.id === "back") this.back();
        else if (it.id === "custom") {
            if (it.page) { this.mainIdx = this.idx; this.page = "page:" + it.page; this.idx = 0; }
            else if (it.run) call("menu run()", it.run, it, this.api());
            else if (it.change) { it.change(1); this.applySettings(); }
        }
        else if (it.id === "resume") Engine.setPaused(false);
        else if (it.id === "restart") Engine.restartFight();
        else if (it.id === "quit") Engine.toTitle();
        else if (it.change) { it.change(1); this.applySettings(); }
    },
    applySettings() { Settings.apply(); Settings.save(); },
    update() {
        this.t++;
        if (this.go > 0) { if (++this.go > 40) { this.go = 0; Engine.beginGame(); } return; }
        const items = this.items(), n = items.length;
        if (this.idx >= n) this.idx = 0;
        if (Input.hit("arrowup", "w")) { this.idx = (this.idx + n - 1) % n; Sound.play("move"); }
        if (Input.hit("arrowdown", "s")) { this.idx = (this.idx + 1) % n; Sound.play("move"); }
        const it = items[this.idx];
        if (it.change) {
            const d = (Input.hit("arrowright", "d") ? 1 : 0) - (Input.hit("arrowleft", "a") ? 1 : 0);
            if (d) { it.change(d); this.applySettings(); Sound.play("move"); }
        }
        if (Input.confirm()) { if (it.id !== "start" && it.id !== "resume" && it.id !== "restart" && it.id !== "quit") Sound.play("select"); this.pick(it); return; }
        if (this.page !== "main" && (Input.cancel() || Input.hit("escape"))) this.back();
        else if (this.mode === "pause" && this.page === "main" && Input.cancel()) Engine.setPaused(false);
    },
    // a row of menu text with the soul next to the selected one
    row(it, x, y, sel, w, px = 26) {
        const col = sel ? "#ff0" : "#d8d8d8";
        ctx.save();
        if (sel) {
            ctx.fillStyle = "rgba(255,255,0,0.10)"; ctx.fillRect(x - 40, y - 4, w + 60, px + 8);
            ctx.fillStyle = "#ff0"; ctx.fillRect(x - 40, y - 4, 3, px + 8);
            if (VFX.high) { ctx.shadowColor = "#ff0"; ctx.shadowBlur = 10; }
            drawSoul(x - 16 + Math.sin(this.t / 8) * 2, y + px / 2 + 2, 16, 16, "red");
        }
        text(it.label, x, y, px, col);
        ctx.restore();
        if (it.val || it.bar) {
            const vx = x + w;
            if (it.bar) {
                const v = it.bar();
                for (let i = 0; i < 10; i++) { ctx.fillStyle = i < v ? (sel ? "#ff0" : "#bbb") : "#333"; ctx.fillRect(vx - 130 + i * 13, y + 5, 10, px - 8); }
            } else text(sel ? "< " + it.val() + " >" : it.val(), vx, y, px, col, "right");
        }
    },
    draw() {
        const pause = this.mode === "pause", items = this.items(), t = this.t;
        const m = (Engine.game && Engine.game.menu) || {};
        if (pause) { ctx.fillStyle = "rgba(0,0,0,0.74)"; ctx.fillRect(0, 0, W, H); }
        else {
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
            VFX.drawBack();
            const img = Assets.get("enemy");                                              // the enemy, dim and floating on the right
            if (img) {
                const sc = Math.min(330 / img.height, 330 / img.width), w = img.width * sc, h = img.height * sc;
                ctx.save(); ctx.globalAlpha = 0.2 + 0.05 * Math.sin(t / 40);
                ctx.drawImage(img, 468 - w / 2, 250 - h / 2 + Math.sin(t / 30) * 6, w, h);
                ctx.restore();
            }
            // title with a colour split and a wave
            const title = (Engine.game && Engine.game.title) || "UT battle engine", glitchy = t % 240 < 8;
            ctx.font = `56px ${FONT}`; ctx.textBaseline = "top";
            const tw = ctx.measureText(title).width, x0 = 320 - tw / 2;
            ctx.save();
            for (const [dx, col, a] of [[-2.5, "#ff2a55", 0.55], [2.5, "#22d8ff", 0.55], [0, "#fff", 1]]) {
                ctx.globalAlpha = a; ctx.fillStyle = col; ctx.textAlign = "left";
                if (dx === 0 && VFX.on) { ctx.shadowColor = VFX.mote; ctx.shadowBlur = 22; }
                let cx = x0;
                for (let i = 0; i < title.length; i++) {
                    const ch = title[i], jit = glitchy ? rand(-3, 3) : 0;
                    ctx.fillText(ch, cx + dx * (glitchy ? 2.2 : 1) + jit, 52 + Math.sin(t / 22 + i * 0.55) * 4 + (glitchy ? rand(-2, 2) : 0));
                    cx += ctx.measureText(ch).width;
                }
            }
            ctx.restore();
            if (this.page === "main") { text(m.sub || "a Dark Byte SoulForge battle", 320, 128, 18, "#8a8a9a", "center"); ctx.fillStyle = rgba(VFX.mote, 0.5); ctx.fillRect(320 - 120, 156, 240, 2); }
        }
        const pg = this.customPage();
        let px = 260, y0 = pause ? 180 : 214, gap = items.length > 7 ? 28 : items.length > 5 ? 32 : items.length > 4 ? 36 : 40, w = 220;
        if (!pause && this.page === "main" && items.length > 4) y0 = 200;
        if (this.page === "options") { px = 150; w = 340; y0 = pause ? 118 : 158; gap = 32; }
        if (pause) {                                                                      // the panel
            const ph = this.page === "options" ? 360 : this.page === "controls" ? 330 : pg ? 400 : 36 + items.length * gap + 90, py = Math.max(30, 240 - ph / 2);
            const pw = this.page === "options" || pg ? 480 : 380;
            ctx.fillStyle = "#000"; ctx.fillRect(320 - pw / 2, py, pw, ph);
            ctx.save(); if (VFX.high) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 10; }
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.strokeRect(320 - pw / 2 + 2.5, py + 2.5, pw - 5, ph - 5); ctx.restore();
            text(this.page === "options" ? "OPTIONS" : this.page === "controls" ? "CONTROLS" : pg ? (pg.title || "") : (this.cfg().title || "PAUSED"), 320, py + 18, 34, "#fff", "center");
            y0 = py + 78; px = 320 - pw / 2 + 70; w = pw - 140;
            if (this.page === "options") { gap = 34; }
        } else if (this.page !== "main") text(this.page === "options" ? "OPTIONS" : pg ? (pg.title || "") : "CONTROLS", 320, 118, 26, "#aaa", "center");
        if (this.page === "controls") {
            const L = (Engine.game && Engine.game.controls) || [["Z / ENTER", "confirm"], ["X / SHIFT", "cancel, hold to slow the soul"], ["ARROWS / WASD", "move the soul"], ["UP  (blue soul)", "jump"], ["P / ESC", "pause"], ["M", "mute"], ["V", "switch visual fx"], ["F3", "debug (then F4 skips a phase)"]];
            const top = pause ? y0 - 6 : 190;
            L.forEach((r, i) => { text(r[0], pause ? px - 20 : 130, top + i * 25, 18, "#ff0"); text(r[1], pause ? px + 130 : 300, top + i * 25, 18, "#ccc"); });
            this.row(items[0], 320 - 40, (pause ? y0 : 190) + L.length * 25 + 8, true, 80, 24);
        } else {
            if (pg) {                                                                     // a custom page: lines of text (a string, or [left, right]) above its rows
                const lines = pg.lines || [], top = pause ? y0 - 8 : 160;
                lines.forEach((ln, i) => {
                    if (Array.isArray(ln)) { text(ln[0], pause ? px - 20 : 130, top + i * 24, 18, "#ff0"); text(ln[1], pause ? px + 130 : 300, top + i * 24, 18, "#ccc"); }
                    else text(String(ln), 320, top + i * 24, 18, "#ccc", "center");
                });
                y0 = top + lines.length * 24 + 14; gap = Math.min(gap, 32);
            }
            items.forEach((it, i) => this.row(it, px, y0 + i * gap, i === this.idx, w, pause && this.page === "main" ? 24 : 26));
            const hint = items[this.idx] && items[this.idx].hint;
            if (hint) { ctx.font = `15px ${FONT}`; const ls = wrap(hint, 460); ls.forEach((l, i) => text(l, 320, (pause ? 384 : 404) + i * 18, 15, "#8a8a9a", "center")); }
        }
        if (!pause) {
            text("Z / ENTER  confirm      X  back      ARROWS  move", 320, 452, 15, "#555", "center");
            text("v" + Engine.version, W - 8, H - 20, 14, "#444", "right");
        }
        if (!pause) VFX.drawFront();
        if (this.go > 0) {                                                                // START: fade to black
            ctx.globalAlpha = clamp(this.go / 34, 0, 1); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
        }
    }
};

// ============================================================
// Engine (main loop, scenes, pause, debug, shake, music)
// ============================================================
const Engine = {
    version: "0.1.0", scene: "load", paused: false, debug: false, fps: 60,
    glitchT: 0, glitchN: 1, glitchP: 1, abT: 0, abN: 1, abAmt: 0,
    shakeAmt: 0, shakeFrames: 0, freezeT: 0, off: { x: 0, y: 0 }, game: null, music: null, musicSrc: null, blocked: null, blockedT: 0,
    errMsg: "", errT: 0, toast: "", toastT: 0,
    shake(amt = 4, frames = 10) { if (!Settings.shake) return; this.shakeAmt = amt; this.shakeFrames = frames; },
    // Engine.freeze(frames): hit-stop - the game holds still for a few frames on a big impact (the picture keeps shaking)
    freeze(frames = 3) { if (this.scene === "battle") this.freezeT = Math.max(this.freezeT, Math.min(8, frames)); },
    // Engine.glitch(frames, power): the WHOLE screen tears into sliding strips with colour bars for a split second (Sans's slash uses 7 frames).
    // Needs VFX "low" or "high" (V key): with VFX off there is no glitch, which keeps the game comfortable for players sensitive to flashing.
    glitch(frames = 8, power = 1) {
        if (!VFX.on || !Settings.flash) return;
        this.glitchT = this.glitchN = Math.max(1, frames); this.glitchP = power;
        Sound.beep(rand(90, 260), 0.07, "sawtooth", 0.05, rand(500, 1400));
    },
    // Engine.aberrate(px, frames): red / cyan colour split on everything drawn on the canvas, fading out
    aberrate(px = 5, frames = 20) { if (VFX.on && Settings.flash) { this.abAmt = px; this.abT = this.abN = Math.max(1, frames); } },
    drawGlitch() {                                       // called after the frame is drawn (see draw)
        let st = "", fl = "", cf = "";
        if (this.glitchT > 0 && VFX.on) {
            const k = this.glitchT / this.glitchN, p = this.glitchP;
            for (let i = 0, n = Math.round((4 + 10 * k) * p); i < n; i++) {         // torn strips of the picture slide sideways
                const y = rand(0, H), h = rand(4, 18 + 40 * k), dx = rand(-1, 1) * (14 + 60 * k) * p;
                ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
            }
            ctx.save();
            for (let i = 0, n = 3 + 6 * k; i < n; i++) {                              // colour bars
                ctx.globalAlpha = rand(0.25, 0.7); ctx.fillStyle = pick(["#f00", "#0ff", "#fff", "#f0f", "#00f"]);
                ctx.fillRect(rand(0, W), rand(0, H), rand(30, 240), rand(2, 9));
            }
            if (this.glitchT % 3) { ctx.globalCompositeOperation = "difference"; ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.fillRect(0, rand(0, H), W, rand(8, 40) * p); }   // an inverted band
            ctx.restore();
            if (VFX.high) {                                                           // gifs sit under the canvas, so the whole stage jitters + shifts colour too
                st = `translate(${(rand(-1, 1) * 6 * k * p).toFixed(1)}px,0) skewX(${(rand(-1, 1) * 2 * k * p).toFixed(2)}deg)`;
                fl = `hue-rotate(${Math.round(rand(-40, 40) * p)}deg) saturate(${(1 + 0.8 * k).toFixed(2)})`;
            }
        }
        const ab = this.abT > 0 && VFX.on ? this.abAmt * this.abT / this.abN : 0;
        if (ab >= 0.5) cf = `drop-shadow(${ab.toFixed(1)}px 0 0 rgba(255,30,80,0.75)) drop-shadow(${(-ab).toFixed(1)}px 0 0 rgba(0,220,255,0.75))`;
        const cam = Cam.css(), full = cam && st ? cam + " " + st : cam || st;          // camera first, then the glitch jitter
        if (full !== this._st) { stageEl.style.transform = full; this._st = full; }          // (only touched when it changes)
        if (fl !== this._fl) { stageEl.style.filter = fl; this._fl = fl; }
        if (cf !== this._cf) { canvas.style.filter = cf; this._cf = cf; }
    },
    error(where, e) {
        const msg = e && e.message ? e.message : (e ? String(e) : "");
        console.error("[SoulForge] " + where, e || "");
        this.errMsg = ("! " + where + (msg && !where.includes(msg) ? ": " + msg : "")).slice(0, 80);
        this.errT = 420;
    },
    notify(msg) { this.toast = msg; this.toastT = 90; },
    // playMusic(src, { loop, volume, onEnd }): onEnd() runs when a non-looping song finishes by itself
    playMusic(src, o = {}) {
        this.stopMusic();
        if (!src) return;
        this.musicSrc = src;
        try {
            const m = new Audio(url(src));
            m.preload = "auto";
            m.loop = o.loop !== false; m._base = clamp(o.volume ?? 0.5, 0, 1); m.volume = clamp(m._base * Settings.music / 10, 0, 1); m.muted = Sound.muted;
            m.addEventListener("error", () => { m._bad = true; this.error("Missing music: " + src); });
            if (o.onEnd) m.addEventListener("ended", () => { if (this.music === m) call("music onEnd", o.onEnd, null, m); });
            this.music = m;
            this.kickMusic(m);
        } catch (e) { this.error("music", e); }
    },
    // starts a song; if the browser blocks it (autoplay policy) it is retried on the next key press / click / frame
    kickMusic(m) {
        try {
            const p = m.play();
            if (p && p.catch) p.catch(() => { this.blocked = m; });
        } catch (e) { this.blocked = m; }
    },
    retryMusic() {
        const m = this.blocked;
        if (!m) return;
        if (this.music !== m) { this.blocked = null; return; }
        if (this.paused || m._bad) return;
        this.blocked = null;
        if (m.paused && !m.ended) this.kickMusic(m);
    },
    // seconds into the current song, or -1 when nothing is playing (use this to sync attacks to the beat)
    musicTime() { const m = this.music; return m && !m.paused && !m.ended && m.currentTime > 0 ? m.currentTime : -1; },
    // slowly lowers the music volume to 0 over `frames` (60 = 1 second), then stops it
    fadeMusic(frames = 180) { if (this.music) this.fade = { t: 0, n: Math.max(1, frames), v: this.music.volume }; },
    stopMusic() {
        this.fade = null;
        if (this.music) { try { this.music.pause(); } catch (e) { /* ignore */ } this.music = null; }
        this.musicSrc = null;
    },
    startMusic() { if (this.game && this.game.music) this.playMusic(this.game.music); },
    async start(game) {
        const g = { ...DEFAULTS, ...game };
        g.player = { ...DEFAULTS.player, ...game.player };
        g.enemy = { ...DEFAULTS.enemy, ...game.enemy };
        g.phases = Array.isArray(game.phases) ? game.phases : [];
        g.checkpoints = game.checkpoints !== false;
        this.game = g;
        document.title = this.baseTitle = `${g.title} - DBSF engine v${this.version}`;
        const imgs = {
            soul: { src: "assets/soul.png", crop: [0.162, 0.059, 0.676, 0.883] },
            bone: { src: "assets/bone.png", crop: [0.32, 0.03, 0.34, 0.94] }
        };
        for (let i = 0; i < 6; i++) imgs["blaster" + i] = "assets/blaster/blaster" + i + ".png";
        const snds = {
            blasterCharge: "sfx/Gaster blaster charge.wav", blasterFire: "sfx/Gaster blaster fire.wav",
            hurt: "sfx/health drain.wav",                                        // the soul takes damage
            hit: "sfx/undertale-attack-hit-sound-effect.mp3",                    // your attack lands
            drain: "sfx/health drain.wav",
            // the dialogue clip is 1.75 s of mostly silence - cut it to a short blip and play it louder
            dialogue: { src: "sfx/normal dialogue sfx.mp3", maxDur: 0.14, voiceVol: 1 },
            voice_sans: { src: "sfx/voice_sans.mp3", gap: 0 }
        };
        if (g.enemy.sprite) imgs.enemy = g.enemy.sprite;
        g.phases.forEach((p, i) => {            // each phase can bring its own sprite / images / sounds
            if (p.enemy && p.enemy.sprite) imgs["enemyP" + (i + 1)] = p.enemy.sprite;
            Object.assign(imgs, p.images || {});
            Object.assign(snds, p.sounds || {});
        });
        Object.assign(imgs, g.images || {});
        Object.assign(snds, g.sounds || {});
        Settings.load();
        Input.init();
        MobileCtl.init();
        for (const ev of ["keydown", "pointerdown", "touchstart"]) window.addEventListener(ev, () => Engine.retryMusic(), { passive: true });
        VFX.init(g.vfx);
        Sound.load(snds);
        Settings.apply();
        this.last = performance.now(); this.acc = 0;
        requestAnimationFrame((t) => this.loop(t));
        await Assets.load(imgs);
        try { if (document.fonts && document.fonts.load) await document.fonts.load(`28px "DeterminationMono"`); } catch (e) { /* fallback font is fine */ }
        console.log(`%cDark Byte SoulForge Engine v${this.version}`, "color:red;font-weight:bold;font-size:16px;");
        if (g.gate === false) this.beginGame(); else { this.scene = "title"; UI.open("title"); }
    },
    beginGame() {
        const c = this.game.cinematic;
        if (c && c.enabled) { this.scene = "cinematic"; Cinematic.start(c, () => this.beginBattle()); }
        else this.beginBattle();
    },
    beginBattle() { this.scene = "battle"; Battle.init(this.game); },
    loop(now) {
        requestAnimationFrame((t) => this.loop(t));
        let dt = now - this.last;
        this.last = now;
        if (dt > 250) dt = 250;                       // tab was hidden: don't fast-forward
        if (dt > 0) this.fps = lerp(this.fps, 1000 / dt, 0.1);
        this.acc += dt;
        while (this.acc >= STEP) { this.update(); this.acc -= STEP; }
        this.draw();
    },
    setPaused(v) {
        if (v === this.paused || this.scene === "load") return;
        this.paused = v;
        if (v) UI.open("pause");
        if (this.music) { try { if (v) this.music.pause(); else { const p = this.music.play(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ } }
        if (v) Sound.pauseAll(); else Sound.resumeAll();        // sound effects pause with the game too
    },
    // pause menu > RESTART FIGHT
    restartFight() {
        this.setPaused(false);
        Sound.stopAll(); this.stopMusic(); Cinematic.active = false; Cinematic.musicOn = false;
        Cam.snap(); Bars.snap(); Slash.clear(); this.freezeT = 0;
        this.beginBattle();
    },
    // pause menu > QUIT TO TITLE
    resetTitle() { if (this.baseTitle) document.title = this.baseTitle; },          // g.pageTitle() changes the tab title; this puts it back
    toTitle() {
        this.setPaused(false);
        Sound.stopAll(); this.stopMusic(); Cinematic.active = false; Cinematic.musicOn = false;
        Cam.snap(); Bars.snap(); Slash.clear(); hideGif(); this.freezeT = 0;
        VFX.parts.length = 0; VFX.rings.length = 0; VFX.floats.length = 0;
        Outro.stop(); Popups.clear(); this.resetTitle();
        B = null; this.deaths = 0; this.scene = "title"; UI.open("title");
    },
    update() {
        const inGame = this.scene !== "load" && this.scene !== "title" && this.scene !== "outro";
        if (inGame && Input.hit("p", "escape")) {
            if (!this.paused) this.setPaused(true);
            else if (Input.hit("p") || UI.page === "main") this.setPaused(false);       // (Esc inside OPTIONS / CONTROLS only goes back)
        }
        if (this.blocked && ++this.blockedT % 30 === 0) this.retryMusic();          // music blocked by the browser: try again twice a second
        if (Input.hit("f3")) this.debug = !this.debug;
        if (this.debug && this.scene === "battle" && B && Input.hit("f4")) { B.enemyHp = 0; enemyDefeated(); }     // debug: F3 then F4 = instantly defeat this phase
        if (Input.hit("v")) this.notify("VFX: " + VFX.cycle().toUpperCase());
        if (Input.hit("m")) { Sound.setMuted(!Sound.muted); if (this.music) this.music.muted = Sound.muted; this.notify(Sound.muted ? "MUTED" : "SOUND ON"); }
        if (this.paused) UI.update();
        else {
            VFX.update(); Cam.update(); Bars.update();
            if (this.fade && this.music) {
                const f = this.fade;
                if (++f.t >= f.n) this.stopMusic();
                else this.music.volume = clamp(f.v * (1 - f.t / f.n), 0, 1);
            }
            if (this.freezeT > 0 && this.scene === "battle") this.freezeT--;           // hit-stop: this frame is skipped
            else if (this.scene === "title") UI.update();
            else if (this.scene === "cinematic") Cinematic.update();
            else if (this.scene === "outro") Outro.update();
            else if (this.scene === "battle") Battle.update();
            if (this.shakeFrames > 0) this.shakeFrames--;
            if (this.glitchT > 0) this.glitchT--;
            if (this.abT > 0) this.abT--;
            if (this.errT > 0) this.errT--;
            if (this.toastT > 0) this.toastT--;
        }
        Input.endStep();
    },
    draw() {
        ctx.clearRect(0, 0, W, H);
        this.off = this.shakeFrames > 0 ? { x: rand(-this.shakeAmt, this.shakeAmt), y: rand(-this.shakeAmt, this.shakeAmt) } : { x: 0, y: 0 };
        Cam.fade += ((this.paused || this.scene === "title" ? 0 : 1) - Cam.fade) * 0.2;       // the camera eases back to normal while paused / on the title screen
        ctx.save();
        ctx.translate(this.off.x, this.off.y);
        if (this.scene !== "battle") { hideGif(); Slash.clear(); }
        if (this.scene === "load") text("Loading...", W / 2, 220, 28, "#888", "center");
        else if (this.scene === "title") UI.draw();
        else if (this.scene === "cinematic") Cinematic.draw();
        else if (this.scene === "outro") Outro.draw();
        else if (this.scene === "battle") Battle.draw();
        ctx.restore();
        this.drawGlitch();
        if (this.paused) UI.draw();
        if (this.scene === "battle" && (!Engine.game || !Engine.game.watermark || Engine.game.watermark.show !== false)) {     // small engine watermark, bottom-left
            ctx.save(); ctx.globalAlpha = 0.5; text(WATERMARK, 6, H - 17, 12, "#bbb"); ctx.restore();
        }
        if (this.toastT > 0) text(this.toast, W - 10, 8, 18, "#ff0", "right");
        if (this.errT > 0) {
            ctx.fillStyle = "rgba(140,0,0,0.9)"; ctx.fillRect(0, H - 26, W, 26);
            text(this.errMsg, 8, H - 23, 16, "#fff");
        }
        if (this.debug && B) {
            text(`FPS ${this.fps.toFixed(0)}  ${this.scene}/${B.state}  phase:${B.phase + 1}  bullets:${B.bullets.length}  dodged:${B.dodged}  frame:${B.atkFrame}  turn:${B.turn}  vfx:${VFX.level}  cam:${Cam.z.toFixed(2)}/${(Cam.r + Cam.tilt).toFixed(1)}`, 6, 4, 14, "#0f0");
        }
    }
};
