# Dark Byte SoulForge Engine v0.7.0

Open `index.html` in a browser (Chrome/Edge/Firefox). Edit **game.js** to make your game. `script.js` is the engine - you rarely touch it.
A red banner at the bottom of the screen shows script mistakes and missing files (details in the browser console, F12).

Controls: Z/Enter confirm, X/Shift cancel (and slow the soul), Arrows/WASD move, P/Esc pause, M mute, **V switch VFX**, F3 debug (then **F4** = defeat the current phase, to test cutscenes).

## Folders
| folder | what goes in it |
|---|---|
| `assets/` | images (soul, bone, `blaster/` frames, your bullets) |
| `battle sprites/` | enemy sprites (`.png` or animated `.gif`) |
| `audio/` | music |
| `sfx/` | sound effects + voices |
| `fonts/` | `DeterminationMono.ttf` (used for all text) |

`assets/gaster blaster animation sprites/` is your original art. The engine uses the cleaned copies in `assets/blaster/` (transparent background).

## Your own sprites, music and sounds
```js
music: "audio/my theme.mp3",
enemy: { sprite: "battle sprites/boss.gif", voice: "myVoice" },   // png or animated gif
images: { star: "assets/star.png", bone: { src: "assets/mybone.png", crop: [0.3, 0.03, 0.4, 0.94] } },
sounds: { myVoice: "sfx/voice.mp3", ding: "sfx/ding.wav" },
```
`crop` = [x, y, w, h] as 0..1 fractions of the picture (cuts away empty space). Naming an image/sound `soul`, `bone`, `hurt`, `heal`, `hit`, `dialogue`... replaces the default.
Use sounds with `a.sound("ding")` / `g.sound("ding")`, images as bullets with `a.sprite({img: "star", ...})`.
Change music while playing: `g.music("audio/phase2.mp3")`, `g.stopMusic()`.

## Attacks
```js
attacks: {
  myAttack: {
    box: [220, 140],          // box size [w, h]
    mode: "red",              // "red" (free) or "blue" (gravity, UP jumps)
    duration: 400,            // frames (60 = 1 second)
    start(a)  {},             // once, at the start
    update(a) {},             // every frame
    end(a)    {},             // once, at the end
    draw(ctx, a) {}           // optional: draw anything on the canvas
  }
}
```
Then add `{ say: "text", attack: "myAttack" }` to `turns` (or put an attack object directly in `attack:`).

`a` (attack helper):

| call | does |
|---|---|
| `a.frame`, `a.every(n, offset)` | frame counter / true every n frames |
| `a.box` `{left,top,right,bottom,w,h}`, `a.soul` `{x,y}`, `a.vars` | state |
| `a.bone({x,y,w,h,vx,vy,ax,ay,color,damage,horizontal})` | a bone. color: `white`, `blue` (stand still), `orange` (keep moving) |
| `a.orb({x,y,vx,vy})`, `a.aim(x,y,speed)` | orb / orb shot at the soul |
| `a.ring({n,speed,x,y,angle,radius})` | circle of orbs |
| `a.fan({n,arc,x,y,speed,angle})` | fan of orbs (aimed at the soul by default) |
| `a.wall(side, gap, gapSize, speed, {color})` | sweeping wall of bones with a gap |
| `a.sprite({img,x,y,w,h,vx,vy,rot,spin,color,damage})` | your own picture as a bullet |
| `a.blaster({to:[x,y], from:[x,y], angle, size, hold, charge, beamW, color, damage})` | Gaster Blaster. angle in degrees (0 = right, 90 = down), default aims at the soul |
| `a.setBox(w,h,cx,cy,speed)`, `a.setMode("blue", "left")` | resize the box - and optionally MOVE it (`cx`,`cy` = new center, `speed` = slide speed, 0.22 default) - or change soul mode (gravity: `down` `left` `up` `right`) |
| `a.slam("right", speed)` | turn the soul blue and throw it against that wall (shake + spark) |
| `a.warn({x,y,w,h,frames,color,then})` | flashing harmless zone; `then()` runs when it ends (spawn the real bullet there) |
| `a.clear()` | remove all bullets (blasters stay unless `a.clear(true)`) |
| `a.angleTo(x,y)`, `a.state` | angle (degrees) from a point to the soul / your own scratch object, fresh per attack |

Any bullet can have its own `update(b)` and `life`, e.g. `a.bone({..., update(b) { b.vy += 0.1; }})`.

## Script functions (`g`)
Available in hooks, acts, items, turns and also as part of `a` in attacks:

`g.vars` (your variables), `g.turn`, `g.hp`, `g.maxHp`, `g.enemyHp`, `g.spareable`,
`g.heal(n)`, `g.damage(n)`, `g.hurtEnemy(n)`, `g.setSpareable(bool)`, `g.setFlavor(text)`, `g.setEnemySprite(imageKey)`,
`g.flash(color, frames)`, `g.shake(amt, frames)`, `g.particles(x, y, n, {color, speed, life, size, gravity})`, `g.vfx("off"|"low"|"high")`,
`g.sound(name)`, `g.music(path)`, `g.stopMusic()`, `g.after(frames, fn)`, `g.rand(a,b)`, `g.randInt(a,b)`, `g.pick(list)`

Hooks (all optional, in `Game`): `onStart(g)`, `onTurnStart(g, n)`, `onTurnEnd(g, n)`, `onHurt(g, dmg)` (return a number to change damage), `onAct(g, act)`, `onItem(g, item)`, `onWin(g, kind)`, `onGameOver(g)`.

Acts and items can run code: `{ name: "Pet", run(g) { g.heal(5); return "* You petted it."; } }`. Text can also be a function: `text(g) { return "* HP: " + g.hp; }`.
`turns` can be a function for smarter enemies: `turns: (n, g) => ({ say: "...", attack: g.hp < 30 ? "blasters" : "boneWave" })`.

## Cinematic intro (optional)
`cinematic: { enabled: false }` = no intro. Players hold X to skip. Scenes play in order, keys can be mixed in one scene:

| key | does |
|---|---|
| `wait: 60` | pause (frames) |
| `title: "NAME", sub: "small"`, `frames` | big fading title card |
| `text: "line"` or `["page 1","page 2"]` | typed text (Z = next, `auto: 90` = auto-advance, `size`, `color`, `y`) |
| `image: "key"`, `frames`, `fadeIn`, `fadeOut`, `zoom`, `scale`, `x`, `y` | picture (register it in `images`) |
| `fade: "out"`/`"in"`, `frames` | fade to / from black |
| `bg: "#001"`, `flash: true`, `shake: [6, 20]`, `sfx: "hit"` | quick effects |
| `music: "audio/intro.mp3"` / `null` | start / stop intro music (stops when the intro ends) |
| `fn(c) {}` | your code (`c.shake`, `c.flash()`, `c.sound`) |

## VFX
`vfx: { level: "high", color: "#4b1a86" }` - `"off"`, `"low"` (soft bottom gradient, sparks, hit flashes) or `"high"` (adds floating motes, glow, soul trail, vignette). Players press **V** to switch.

## Phases + cutscene (like Undertale: Last Breath)
When the enemy HP hits 0 the next entry of `phases: [...]` starts: first the optional **cutscene** (phase 1.5), then the new phase.
```js
phases: [{
  hp: 100, heal: 10, enemyFirst: true, intro: "* The air feels heavy.",
  music: "audio/phase2.mp3",
  enemy: { sprite: "battle sprites/p2.gif", flavor: [...], check: [...], acts: [...] },   // overrides, rest is inherited
  attacks: { ... },  turns: [...]  /  (n, g) => ({ say, attack }),
  cutscene: [ { music: null, hit: true, flash: true, wait: 90 }, { say: "..." }, ... ]
}]
```
Cutscene step keys (mix freely): `wait`/`frames`, `say` (bubble), `text` (narration), `auto` (frames per line), `music` (path / `null` / `"next"`), `loop`, `sfx`, `shake: [amt, frames]`, `flash`, `hit`, `dark: 0..1`, `fadeEnemy: 0..1`, `sprite: "next"`, `particles: [x,y,n,{...}]`, `ui: true`, `fn(g)`. Hold X to skip.
Dying inside a phase restarts that phase (`checkpoints: false` = restart everything). New hooks/API: `onPhaseStart(g, n)`, `g.phase`, `g.phaseCount`, `g.vfxColor(color, mote)`. Attack option `gravity: "left"` starts the blue soul on another wall. Attack option `at: [cx, cy]` puts the box somewhere other than the bottom-center.

## Dodging enemy (phase 1 of this game)
`enemy: { dodges: 10 }` - the enemy sidesteps your first 10 attacks ("MISS"), the 11th one lands and defeats that phase. A phase can turn it off with `enemy: { dodges: 0 }` (phase 2 does). Missing the bar does not count as a dodge.

## Survival phase (phase 2.5 of this game)
```js
{ survival: "myAttack",            // no menu, no turns: this one long attack IS the phase
  heal: 30, skippable: false,      // skippable:false = holding X can't skip this phase's cutscene
  music: "audio/fast.mp3",
  enemy: { sprite: "battle sprites/p25.png" },
  cutscene: [ { music: null, hit: true, wait: 90 } ],      // wait: 90 = the 1.5 second delay before it starts
  attacks: { myAttack: { box: [240, 150], at: [320, 312], duration: 2460, update(a) { ... } } } }
```
When the attack's `duration` is over the **ending** plays: white flash, the enemy crumbles to dust, the music fades, then your message. Set it in `game.js`:
`ending: { text: "Thanks for playing!", musicFade: 330, restart: false }` (`musicFade` in frames, `restart: true` lets players press Z to play again).
Dying in a survival phase restarts the survival. F3 then F4 skips straight to the ending.

Phase 2.5 in `game.js` is built from a list of **segments** (`P25`): each one has a box `[w, h, centerX, centerY]`, a length and a `run(a, n, s)` pattern. Edit / reorder / add segments to change the fight. Fairness rules built in: the next box shows as a dashed outline before it jumps, nothing spawns while the box slides, bullets are cleared on every jump, walls never spawn next to the soul, and every segment ends with a quiet tail.

## Sound notes
`sounds: { name: "path" }` or `{ name: { src, volume, maxDur, poly, gap } }` - `maxDur` (seconds) cuts a long clip short, `poly` = how many copies may overlap, `gap` = identical sounds starting within this many ms are merged (so 3 blasters firing together are not 3x louder).
Default names: `hurt` (soul takes damage), `hit` (your attack lands), `dialogue`, `voice_sans`, `blasterCharge`, `blasterFire`. Built-in beeps exist for `dodge`, `swoosh` (box jump), `slam`, `break` if you don't supply files. Sounds pause with P, stop on Game Over and obey M (mute).

## Notes
- Soul mode `"blue"`: blue/orange rules work for bones, orbs, sprites and blaster beams.
- Blaster/sprite hitboxes: sprites use their `w`/`h` rectangle (rotation is only visual); beams are exact.
- `.gif` enemies are animated by the browser (they sit under the canvas, so the box and bubbles draw over them).
- Open `index.html` directly or host the folder anywhere. No installs, no build.

## Added: BLOCKED, glitch ending, rebirth phase (phase 3)
- `enemy: { blocks: [15, 20] }` - your attacks land but show **BLOCKED** (no damage). After that many blocks (random between the two numbers, or one number) the phase ends. `g.vars.blocked` = blocks so far (used by the phase 2 dialogue).
- Phase ending option `ending: { text, musicFade, glitchAt, glitchFor, blackFor }` - if the phase after it exists and `glitchAt` is set, the "Thanks for playing!" scene glitches at that frame, goes black, then the next phase starts instantly.
- Phase option `rebirth: { hold, fade, musicWait, text, auto, bpm, beatOffset, every, calm, restartMusic }` - box/HUD/buttons fade, music, centered dialogue, buttons break on the beat (`every` beats apart), `calm` frames later: flash, full HP, `survival` attack starts. Dying in that phase restarts the fight directly (no long intro again).
- Phase 3 in `game.js` = `P3_PATTERNS` (8 beat-synced patterns) arranged by `P3_ORDER` (24 x 600 frames = 4:00). Tune `P3_BPM` / `P3_OFFSET` if the attacks feel off-beat, `DMG3` for damage.


---

## Update notes

### Sans slash (`a.slash()` / `g.slash()` / cutscene step `{ slash: true }`)
Plays `enemySlash` (`sfx/enemy slash.mp3`) and puts the slash gif on Sans at 60% opacity; it drifts right while fading out.
The next slash drifts LEFT, the next right again, and so on (every phase starts with right). Options: `a.slash({ dir: 1 | -1, frames, dist, opacity })`.
Defaults can be changed with `slash: { ... }` in game.js (see `Slash` in script.js). The gif used is `battle sprites/last-breath phase 2 slash animation clean.gif`
(your gif with the gray ground strip removed; the original is still in the folder).

### Songs that follow each other
`Engine.playMusic(src, { loop: false, onEnd() { ... } })` runs `onEnd` when the song finishes. `Engine.musicTime()` = seconds into the song (-1 = not playing).
If the browser blocks a song (autoplay policy) the engine retries on the next key press / click.
`a.finish()` ends the current attack. Phase 3's intro (`rebirth`) now plays three songs in a row (`musicTalk`, `musicAfter`, `musicBreak`) and breaks the
buttons at `breakAt` seconds inside the third song; the fight itself plays song D then song E and follows THEIR clock.

### New attack helpers in game.js
`cutLine / cutThrough` (slash cuts), `spinArm` (spinning bone arm), `stabCols` (bone stabs). New phase 2 attacks: `p2_slash`, `p2_crossfan`, `p2_stab`, `p2_windmill`.


---

## v0.5.0 changes

- **Slash hits hard + glitch**: when a slash cut lands the whole screen glitches for a split second, shakes and sparks, and it does `DMG.slash` (10 / 8) instead of bone damage. Tune `SLASH_FX` in game.js (`glitch: 0` = off). New API: `g.glitch(frames, power)`, `g.aberrate(px, frames)`, cutscene step `glitch: 10`. Glitch needs VFX on (V key), so players sensitive to flashing can turn it off.
- **Orange soul**: attack option `mode: "orange"` or `a.setMode("orange")`. The soul must keep moving: standing still for `Game.orange.grace` frames hurts, then once per second. A ring closes in on the soul as a warning, and "KEEP MOVING!" shows when it turns orange. Phase segments (2.5 / 3) can have `mode: "orange"` too. All spinning-arm (windmill) attacks use it.
- **spinArm** now speeds up gradually from slow to fast (`spinAccel(start, end, frames)`), with ghost trails that grow with speed.
- **Phase 3 is the 2:32 song only**; 15 segments. Press **Z once** for a random 20-50 HP heal (`P3_HEAL`; not used up if HP is full).
- **Heal sfx** connected (`sounds.heal`).
- **Phase 3 finale** (`phases[n].finale`, see game.js): cinematic ending on song E with cinema bars, camera zoom, cracks, boom, shattering sprite, god rays, shockwaves, soul pulses, white-out and title. Hold X to skip.
- **Mercy slash** (`phases[n].mercySlash = { delay }`): after the delay Sans slashes the MERCY button to pieces; the menu then has 3 options and the button stays gone in later phases.


## v0.6.0 changes

**Camera** (`Cam`, whole stage incl. gif sprites): `g.cam({ zoom, x, y, rot, focus: [px, py] }, frames)`, `g.cam("reset", frames)`, `g.camKick(0.03)` (quick zoom punch), `g.tilt(deg, frames)`. Also `g.bars(true|false, frames)` (cinema bars), `g.freeze(frames)` (hit-stop), `g.pulse(0..1)` (background pulse), `g.ring(x, y, {r1, life, w, color})`, `g.float(x, y, "text", {color})`.

**Cutscene step keys (new)**: `cam: { zoom, x, y, rot, focus, frames }` | `"reset"`, `bars`, `barsFrames`, `kick`, `rkick`, `aberrate: [px, frames]`, `freeze`, `pulse`, `ring: [x, y, {...}]`, `soul: [x, y] | false`, `uiIn: frames` (box + HUD fade in), `title` / `sub` (title card).

**Phase 1 opening**: `opening: { skippable, steps: [...] }` is a cinematic in the battle scene before the first turn (not repeated after a Game Over). `enemyFirst: true` makes Sans attack before the menu; `musicAfterFirstAttack: true` keeps the fight silent until that first attack ends (then the music kicks in with a flash + shockwave). The first attack is `p1_opening` (long stretched box, camera moves, bones + shifting blaster grids + squeeze; damage in `P1_DMG`). The old title-card `cinematic` is switched off (`enabled: false`).

**Tilt** (phase option): `tilt: { max, chance, warn, hold, every, first }` - the camera sometimes tilts mid-attack (creak + shudder as warning, then it eases in and back). Used by phases 2, 2.5 and 3. An attack can opt out with `noTilt: true`.

**Interrupt slashes** (phase 2, `enemy.interrupt: { remaining, after, chance, perTurn, warn, damage, say }`): when Sans has at most `remaining` blocks left he may slash during YOUR turn (menu / lists / attack bar): a dotted line + "!" warns you, then it lands for chip damage (never kills). Choosing an action quickly enough to start his next attack cancels it.

**Phase 2 repel**: blocked hits zoom the screen in a little, glitch and send out shockwaves. **Phase 3** no longer has slash attacks (new orb fans `crossfan` and falling bones `hail` replace them).

**Menus**: new title screen (START / OPTIONS / CONTROLS), pause menu (RESUME / OPTIONS / CONTROLS / RESTART FIGHT / QUIT TO TITLE), OPTIONS (visual fx, music, sound fx, screen shake, camera FULL / NO TILT / OFF, flash & glitch) saved in the browser. `menu: { color, mote, sub }` restyles the title screen. The battle buttons, lists and attack bar were redrawn.

**VFX**: stars + light shafts, enemy aura, shockwave rings, floating damage numbers, bullet trails, blaster charge glow / sparks, box ripple, HP "lag" bar, low-HP pulse, hit-stop and a heart-shatter game over. `VFX.spawn` accepts `shape: "square" | "circle" | "line"`, `shrink`, `add`.


## v0.6.1 changes
- **Interrupt slashes reworked** (`enemy.interrupt`, table `INT_TABLE` in script.js): from **7 blocks left** Sans slashes during YOUR turn (menu, lists, attack bar, act/item text) **every 3 seconds**. Every block lost makes it faster and more random (5 left ~2.3 s, 3 left ~1.4 s, 2 left ~1 s), and at **1 or 0 left** it is very fast, random, with double / triple cuts and shorter warnings. Chip damage per slash gets smaller as they get faster and never kills (leaves 1 HP). Starting Sans's attack cancels pending slashes. Edit `INT_TABLE` rows `[frames between slashes, randomness, warn frames, damage multiplier, cuts]`.
- **Mobile controls**: the phone button (top-left) toggles them (remembered in the browser). 4 large transparent arrow buttons on the left, **X** and **Z** on the right. In **blue soul mode Z also jumps**.
- **Phase 1 music** now starts when Sans's first line starts (opening step key `music: "next"`), and the screen **flashes** when the first attack ends (`flashAfterFirstAttack`). `musicAfterFirstAttack: true` still works if you want the old behaviour.
- **Dev-team slash** (phase 2): `friendSlash(imageKey, [line1, line2])` in game.js. A screenshot appears beside Sans, he talks, slashes it into pieces (3 glowing cuts, sparks, shards), and the slash lands in the box. Attacks `p2_friend1..3` use the 3 screenshots in `assets/`; images are registered in `images`.

## v0.7.0 changes

### Mobile controls
- **Sliding fingers**: every finger is tracked separately. Slide from one arrow to another *without lifting* and the first arrow is released and the new one pressed at once (a few pixels of slack between buttons). Several fingers still work together (arrow + Z).
- New small **B** button (above X) = PAUSE (it presses `P`; press again to resume).

### Memes (`g.popup`, `Popups` in script.js)
`g.popup({ img, x, y, h, frames, from, rot, ... })` makes a picture POP out of nowhere *behind the box and bullets* (it never hides an attack) with a jump-scare sting, flash and shake.
The three memes are `meme1/2/3` in `images`.
- **Phase 2**: attacks `p2_meme1/2/3` (inserted in `P2_ORDER`, built with `memeAttack({...})`). They start as a calm pattern, the meme pops, Sans panics (shakes, talks) and spams telegraphed attacks.
- **Phase 3**: `P3_EVENTS` (bottom of the phase 3 section): `{ t: seconds-in-song, meme: [{img, spot, h}], freak: {kind, frames}, say: [...], cap: "...", fn }`. `MEME_SPOT` = where the pictures pop up.

### Phase 3 reworked ("the animation")
The fight is a film Sans plays and keeps breaking (all synced to the song, with a timeline at the bottom of the screen and subtitles in the top-left corner). Acts live in `P3_SEGS`: loading bar, missing texture (bones become purple/black squares), mouse cursor clicking the arena, Ctrl+C / Ctrl+V, buffering spinner, a draggable "Not Responding" window, stop-motion, a video player that pauses / rewinds / fast-forwards the bullets, the quiet part (+ meme), spam mode, gravity, error pop-ups (+ meme), a bouncing ball with onion-skin ghosts, spinning timeline, orange windmill (+ meme), the final cut (+ all three memes). The browser tab title changes with every act (`g.pageTitle("...")`).
Same fairness rules as before (dashed outline before every box jump, telegraphs, safe spots). Damage numbers are unchanged; the patterns are denser and overlap more.

### Ending (`Outro`, game.js -> `outro`)
After the finale (no more "Thanks for playing!"): **ending video** (`videos (MP3)/ending video.mp4`, hold X to skip) -> **credits** (`outro.credits.cards`) -> **2 seconds of black** -> **title screen**. Change the order or drop a stage with `outro.order` (e.g. `["video", "black"]` for no credits).


---

## v0.1.0 (Dumb_Artist's UT Battle engine) changes

- **Phase 1 reworked**: 7 new attacks (`P1_ATTACKS` in game.js): RIB CAGE, GRAVITY (gravity flips mid-attack), CROSSFIRE, PRISM (telegraphed blaster lanes), COLOR CODE, PINWHEEL, GAUNTLET. Each fades in its name at the top and has a telegraph + safe spot. Damage: `P1_DMG`. The turn list (`turns`) has new dialogue.
- **Game over is cinematic**: colour drains, the soul beats and cracks, shatters, `GAME OVER` drops in letter by letter, the enemy says a last line, then `[Z] TRY AGAIN` / `[X] QUIT TO TITLE`. Press Z while it plays to skip ahead. Configure in game.js -> `gameOver: { title, color, music, volume, speaker, quotes, counter, titleKey }`.
- **Custom menu + pause**: game.js -> `menu` (title screen) and `pause` take `items` (your entries: `{ label, run(m), page, at }`), `pages` (your own screens), `hide`, `title`, `startLabel`, `resumeLabel`. `controls` replaces the CONTROLS page lines.
- **Custom patterns**: game.js -> `patterns: { name(a, o) { ... } }`, used in any attack with `a.pattern("name", { ... })`. See `myAttack` for a template.
- **New attack helpers**: `a.at(frame, fn)` (run once on a frame), `a.vring(x, y, {...})` (visual shockwave; note `a.ring(...)` in attacks makes a circle of ORBS).
- **Watermark**: small "Dumb_Artist's UT Battle engine  v0.1.0" text, bottom-left of the battle (`watermark: { show: false }` hides it).
