console.log("StreetBound city montage loaded (sandbox start)");

// ============================================================
// DAYTIME CITY MONTAGE (about 110 s)
// ------------------------------------------------------------
// The first cinematic of every new game session:
//   START GAME -> startCityMontage() -> beginSandboxGameplay() (important.js)
// It never depends on saved flags, so it plays on every page load.
//
// It is a stand-alone, fully scripted state, modelled on the way the opening
// cutscene system worked:
//
//   * updateGame() calls updateCityMontage() and returns, so no normal gameplay
//     system (jobs, rent, hunger, wanted level, races, debt clock ...) advances.
//   * The ordinary world arrays (cars / npcs / angryDrivers / playerCar) are set
//     aside and replaced by montage-only arrays. They are put back untouched
//     before sandbox gameplay starts.
//   * Cars are the real Car class and pedestrians the real NPC class, drawn by
//     the normal drawGame loop. Their movement is scripted here (kinematic, along
//     road polylines that were checked against CollisionMap2.png), never by the
//     random AI, so the sequence is identical on every playthrough.
//   * Camera: the existing window.sbCutsceneCamFocus / window.sbCutsceneZoom hooks. The hidden player is parked on the
//     camera focus every frame, because several draw passes use the player as the
//     camera target; its real position is restored afterwards.
//   * Speech: NPC.say() / NPC.drawSpeechBubble(); bubbles are drawn in a top layer.
//   * Music: a single <audio> element, stopped on completion, skip or error.
//
// The player never gets control of anything: gameActive stays false, keys and
// canvas taps are swallowed (cityMontageKey / cityMontagePointer), the normal HUD
// is hidden, and the taxi is an ordinary scripted Car.
// ============================================================

const CM_MUSIC_URL = "https://raw.githubusercontent.com/divanshu911/My-game-assets/main/Theme.mp3";
const CM_DURATION = 110;          // seconds, matches the length of the track
const CM_FADE_IN = 1.6;
const CM_FADE_OUT = 4.5;
const CM_MUSIC_VOL = 0.5;
const CM_DAY_HOUR = 12;           // noon
const CM_SKIP_FADE = 0.45;

let cityMontageActive = false;    // read by main.js
let cityMontage = null;           // all montage-only state lives here
let cityMontagePlayed = false;    // can only ever start once per page load

// ------------------------------------------------------------
// ROAD GEOMETRY (CollisionMap2.png, 4096 x 2284)
// Every coordinate below was sampled against the collision map with the full
// car footprint (see the test notes in the report):
//   boulevard  y 538..596   eastbound lane y=580, westbound lane y=556
//   avenue     x 2015..2077 southbound x=2030, northbound x=2062
//   side street x 2705..2739 single lane x=2717
//   lower road y 1112..1165 westbound y=1125, eastbound y=1150
// ------------------------------------------------------------
const CM_CORNER_R = 46;
const CM_ROUTES = {
    E:    { pts: [[1340, 580], [3095, 580]] },
    W:    { pts: [[3095, 556], [1340, 556]] },
    S1:   { pts: [[2030, 340], [2030, 1080]] },
    N1:   { pts: [[2062, 1080], [2062, 340]] },
    E_S1: { pts: [[1340, 580], [2030, 580], [2030, 1080]] },     // right turn at the junction
    N1_E: { pts: [[2062, 1080], [2062, 580], [3095, 580]] },     // right turn at the junction
    W_S1: { pts: [[3095, 556], [2030, 556], [2030, 1080]] },     // left turn at the junction
    H2E:  { pts: [[2700, 1150], [3600, 1150]] },
    H2W:  { pts: [[3600, 1125], [2700, 1125]] },
    TAXI: { pts: [[1350, 580], [2717, 580], [2717, 1150], [3600, 1150]] }
};

const CM_SHIRTS = ["#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e84393"];
const CM_HAIR = ["#2d3436", "#4a3728", "#d35400", "#f39c12"];
const CM_SKIN = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];

// Ambient traffic: [lane, spawn time (negative = already driving at t=0), type, colour, speed px/s]
const CM_TRAFFIC = [
    ["E",    -16, "Commuter, Sedan",   "#3498db", 78],
    ["E",     -5, "Ranger, SUV",       "#34495e", 78],
    ["E",      8, "Porter, Van",       "#ecf0f1", 78],
    ["E",     27, "Sprint, Hatchback", "#2ecc71", 78],
    ["E",     44, "Commuter, Sedan",   "#9b59b6", 78],
    ["E",     84, "Ranger, SUV",       "#e74c3c", 78],
    ["E",    102, "Commuter, Sedan",   "#ecf0f1", 78],
    ["W",    -14, "Commuter, Sedan",   "#e67e22", 80],
    ["W",     -4, "Hauler, Truck",     "#ecf0f1", 70],
    ["W",      5, "Sprint, Hatchback", "#f1c40f", 80],
    ["W",     76, "Porter, Van",       "#34495e", 80],
    ["W",     90, "Commuter, Sedan",   "#2ecc71", 80],
    ["S1",    -9, "Commuter, Sedan",   "#e74c3c", 75],
    ["S1",     6, "Ranger, SUV",       "#ecf0f1", 75],
    ["S1",    30, "Sprint, Hatchback", "#3498db", 75],
    ["S1",    56, "Commuter, Sedan",   "#f1c40f", 75],
    ["N1",    -1, "Porter, Van",       "#ecf0f1", 75],
    ["N1",    14, "Commuter, Sedan",   "#9b59b6", 75],
    ["N1",    40, "Ranger, SUV",       "#34495e", 75],
    ["E_S1",   2, "Commuter, Sedan",   "#1abc9c", 72],
    ["N1_E",  18, "Sprint, Hatchback", "#e74c3c", 72],
    ["W_S1",   9, "Ranger, SUV",       "#e67e22", 74],
    ["H2W",   86, "Commuter, Sedan",   "#e74c3c", 80],
    ["H2W",   96, "Porter, Van",       "#ecf0f1", 80],
    ["H2E",   78, "Sprint, Hatchback", "#3498db", 82],
    ["H2E",  103, "Commuter, Sedan",   "#34495e", 90]
];

// Ambient pedestrians that walk back and forth inside the open grass block
// north-west of the junction (x 1720..1985, y 200..500 are all walkable).
const CM_WALKERS = [
    { pts: [[1745, 230], [1745, 470]], v: 0.65, pause: 1.5 },
    { pts: [[1800, 300], [1960, 300]], v: 0.70, pause: 2.0 },
    { pts: [[1850, 215], [1850, 380]], v: 0.60, pause: 1.0 },
    { pts: [[1925, 230], [1925, 420]], v: 0.55, pause: 2.5 },
    { pts: [[1730, 350], [1830, 350]], v: 0.75, pause: 1.2 },
    { pts: [[1960, 250], [1780, 250]], v: 0.62, pause: 1.8 },
    { pts: [[1830, 495], [1985, 495]], v: 0.80, pause: 1.0 },
    { pts: [[1990, 400], [1990, 500]], v: 0.58, pause: 2.2 }
];

// ============================================================
// SMALL HELPERS
// ============================================================
function cmWrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function cmBuildRoute(pts, r) {
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const d = Math.min(r, d1 / 2, d2 / 2);
        const a = [p1[0] + (p0[0] - p1[0]) / d1 * d, p1[1] + (p0[1] - p1[1]) / d1 * d];
        const b = [p1[0] + (p2[0] - p1[0]) / d2 * d, p1[1] + (p2[1] - p1[1]) / d2 * d];
        for (let k = 0; k <= 10; k++) {
            const u = k / 10, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
            out.push([w0 * a[0] + w1 * p1[0] + w2 * b[0], w0 * a[1] + w1 * p1[1] + w2 * b[1]]);
        }
    }
    out.push(pts[pts.length - 1].slice());
    const cum = [0];
    for (let i = 1; i < out.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    }
    return { p: out, cum: cum, len: cum[cum.length - 1] };
}

function cmRoute(m, name) {
    if (!m.routes[name]) m.routes[name] = cmBuildRoute(CM_ROUTES[name].pts, CM_CORNER_R);
    return m.routes[name];
}

function cmPathAt(rt, s) {
    s = Math.max(0, Math.min(rt.len, s));
    let lo = 0, hi = rt.cum.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (rt.cum[mid] <= s) lo = mid; else hi = mid;
    }
    const a = rt.p[lo], b = rt.p[hi];
    const seg = rt.cum[hi] - rt.cum[lo] || 1;
    const u = (s - rt.cum[lo]) / seg;
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, ang: Math.atan2(b[0] - a[0], -(b[1] - a[1])) };
}

// arc length of the route point closest to (x, y)
function cmRouteS(rt, x, y) {
    let best = 1e18, bs = 0;
    for (let i = 1; i < rt.p.length; i++) {
        const a = rt.p[i - 1], b = rt.p[i];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1;
        let u = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
        u = Math.max(0, Math.min(1, u));
        const d = Math.hypot(a[0] + dx * u - x, a[1] + dy * u - y);
        if (d < best) { best = d; bs = rt.cum[i - 1] + u * Math.sqrt(L2); }
    }
    return bs;
}

// ============================================================
// ENTITY FACTORIES (real Car / NPC classes)
// ============================================================
function cmNpc(m, x, y, look, angle, police) {
    const i = look % 8;
    const n = new NPC(70000 + (m.nextId++), x, y,
        police ? "#0b1d3a" : CM_SHIRTS[i],
        police ? "#1b1b1b" : CM_HAIR[i % CM_HAIR.length],
        CM_SKIN[(i + 2) % CM_SKIN.length],
        !!police);
    n.speed = 0;
    n.canFightBack = false;
    n.isFightingBack = false;
    n.punchTimer = 0;
    n.policeFiringTimer = 0;
    n.walkTimer = 0;
    n.path = null;
    n.moveSpeed = 0.8;
    n.angle = angle || 0;
    n.topLayerSpeech = true;          // bubbles are drawn in the montage top layer
    n.cmFollow = null;                // car the (hidden) driver sits in
    n.cmPatrol = null;
    m.npcs.push(n);
    return n;
}

function cmCar(m, o) {
    const rt = cmRoute(m, o.route);
    const c = new Car(80000 + (m.nextId++), 0, 0, o.color, !!o.police, o.type || "Commuter, Sedan");
    if (o.taxi) {
        c.isTaxi = true;
        c.ownerType = "taxiDepot";
    }
    c.isParked = false;
    c.hasDriver = true;
    c.health = c.maxHealth;
    c.exploded = false;
    c.isStolen = false;
    c.sirenState = 0;
    const s0 = o.s0 || 0;
    const p = cmPathAt(rt, s0);
    c.x = p.x; c.y = p.y; c.angle = p.ang;
    c.cm = {
        rt: rt, route: o.route, s: s0, v: o.v0 === undefined ? (o.speed || 0) : o.v0, vT: o.speed || 0,
        acc: o.acc || 70, dec: o.dec || 95, stopS: null, atStop: false,
        dead: false, frozen: false, remove: o.remove !== false, pax: null
    };
    c.speed = c.cm.v / 60;
    m.cars.push(c);
    return c;
}

function cmDriver(m, car, look) {
    const d = cmNpc(m, car.x, car.y, look, car.angle, false);
    d.isPassenger = true;             // existing flag: NPC.draw skips it while inside
    d.cmFollow = car;
    return d;
}

function cmFace(n, x, y) { n.angle = Math.atan2(y - n.y, x - n.x) + Math.PI / 2; }

function cmWalk(n, pts, speed, done) {
    n.path = pts.map(p => p.slice());
    n.moveSpeed = speed;
    n.pathDone = done || null;
}

// ============================================================
// PER-FRAME STEPPERS
// ============================================================
function cmStepCar(c, sec) {
    const k = c.cm;
    if (!k || k.dead) return;
    if (k.frozen) { c.speed = 0; k.v = 0; return; }

    let vT = k.vT;
    if (k.stopS !== null && !k.atStop) {
        const rem = k.stopS - k.s;
        if (rem <= 0.35) {
            k.s = k.stopS; k.v = 0; k.atStop = true; vT = 0;
        } else {
            vT = Math.min(vT, Math.sqrt(2 * k.dec * 0.85 * rem) + 3);
        }
    }
    if (k.atStop) {
        k.v = 0;
    } else if (k.v < vT) {
        k.v = Math.min(vT, k.v + k.acc * sec);
    } else {
        k.v = Math.max(vT, k.v - k.dec * sec);
    }
    k.s += k.v * sec;

    if (k.s >= k.rt.len) {
        k.s = k.rt.len;
        if (k.remove) { k.dead = true; return; }
        k.v = 0; k.vT = 0;
    }

    const p = cmPathAt(k.rt, k.s);
    c.x = p.x; c.y = p.y;
    c.angle += cmWrap(p.ang - c.angle) * Math.min(1, 14 * sec);
    c.speed = k.v / 60;               // the Car class counts speed in px per frame
}

function cmGo(c, v, dec) {
    const k = c.cm;
    k.stopS = null; k.atStop = false; k.frozen = false; k.vT = v;
    if (dec) k.dec = dec;
}

function cmStopAt(c, x, y) {
    const k = c.cm;
    k.stopS = cmRouteS(k.rt, x, y);
    k.atStop = false;
}

function cmStepNpc(n, dt) {
    n.updateSpeech(dt);                         // dt is in frames, as everywhere else
    if (n.cmFollow) { n.x = n.cmFollow.x; n.y = n.cmFollow.y; n.angle = n.cmFollow.angle; return; }
    if (n.path && n.path.length) {
        const p = n.path[0];
        const dx = p[0] - n.x, dy = p[1] - n.y;
        const d = Math.hypot(dx, dy);
        const step = n.moveSpeed * dt;
        if (d <= step) {
            n.x = p[0]; n.y = p[1];
            n.path.shift();
            if (!n.path.length) {
                n.path = null;
                if (n.pathDone) { const cb = n.pathDone; n.pathDone = null; cb(n); }
            }
        } else {
            n.x += dx / d * step;
            n.y += dy / d * step;
            n.angle = Math.atan2(dy, dx) + Math.PI / 2;
            n.walkTimer += n.moveSpeed * dt * 0.25;
        }
    }
}

function cmStepPatrol(n, sec) {
    const P = n.cmPatrol;
    if (!P || n.cmBusy) return;
    if (n.path) { P.moving = true; return; }
    if (P.moving) { P.moving = false; P.wait = P.pause; }       // the leg just finished: pause
    if (P.wait > 0) { P.wait -= sec; return; }
    P.i += P.dir;
    if (P.i >= P.pts.length) { P.dir = -1; P.i = P.pts.length - 2; }
    else if (P.i < 0) { P.dir = 1; P.i = 1; }
    cmWalk(n, [P.pts[P.i]], P.v, null);
    P.moving = true;
}

// ============================================================
// TIMELINE HELPERS
// ============================================================
function cmAt(m, t, fn) {
    m.events.push({ t: t, fn: fn });
    m.events.sort((a, b) => a.t - b.t);        // stable; executed events keep their place
}

function cmWhen(m, cond, fn) { m.watch.push({ cond: cond, fn: fn }); }

function cmBubbleSecs(text) { return Math.max(1.5, Math.min(3.6, 0.7 + text.length * 0.042)); }

// who says each line in turn, starting at t. Returns the time the last bubble ends.
function cmTalk(m, t, who, lines, gap) {
    if (typeof lines === "string") lines = [lines];
    let cur = t;
    lines.forEach(text => {
        const dur = cmBubbleSecs(text);
        const at = cur;
        cmAt(m, at, () => { if (!m.skipping) who.say(text, Math.round(dur * 60)); });
        cur += dur + (gap === undefined ? 0.3 : gap);
    });
    return cur;
}

function cmCam(m, x, y, zoom, tau) {
    const c = m.cam;
    c.follow = null;
    c.tx = x; c.ty = y; c.tz = zoom; c.tau = tau || 1;
}

function cmCamJump(m, x, y, zoom) {
    const c = m.cam;
    c.follow = null;
    c.x = c.tx = x; c.y = c.ty = y; c.zoom = c.tz = zoom;
}

function cmFollow(m, car, lead, zoom, tau) {
    const c = m.cam;
    c.follow = { car: car, lead: lead };
    c.tz = zoom; c.tau = tau || 1;
}

function cmCamStep(m, sec) {
    const c = m.cam;
    if (c.follow) {
        const f = c.follow;
        c.tx = f.car.x + Math.sin(f.car.angle) * f.lead;
        c.ty = f.car.y - Math.cos(f.car.angle) * f.lead;
    }
    const k = sec > 0 && c.tau > 0 ? 1 - Math.exp(-sec / c.tau) : 0;
    c.x += (c.tx - c.x) * k;
    c.y += (c.ty - c.y) * k;
    c.zoom += (c.tz - c.zoom) * k;
    cmApplyCamera(c);
}

function cmApplyCamera(c) {
    window.sbCutsceneCamFocus = { x: c.x - 1, y: c.y - 1, size: 2 };   // main.js centres on this
    window.sbCutsceneZoom = c.zoom;                                    // smoothed by sbUpdateCameraFeedback
    // Several draw passes use the player as the camera target: park the (hidden) player on the focus.
    player.x = c.x - (player.size || 20) / 2;
    player.y = c.y - (player.size || 20) / 2;
}

function cmTween(m, obj, key, to, dur) {
    m.tweens = m.tweens.filter(t => !(t.obj === obj && t.key === key));
    m.tweens.push({ obj: obj, key: key, from: obj[key], to: to, dur: Math.max(0.001, dur), t: 0 });
}

function cmStepTweens(m, sec) {
    for (let i = m.tweens.length - 1; i >= 0; i--) {
        const tw = m.tweens[i];
        tw.t += sec;
        const u = Math.min(1, tw.t / tw.dur);
        tw.obj[tw.key] = tw.from + (tw.to - tw.from) * (u * u * (3 - 2 * u));
        if (u >= 1) m.tweens.splice(i, 1);
    }
}

// ============================================================
// MUSIC
// ============================================================
function cmAudioStop() {
    // only one montage track may ever exist, even across repeated playthroughs
    const a = window.__cityMontageAudio;
    window.__cityMontageAudio = null;
    if (a) {
        try { a.pause(); } catch (e) { }
        try { a.removeAttribute("src"); a.load(); } catch (e) { }
    }
}

function cmAudioStart(m) {
    cmAudioStop();
    const au = m.audio = { el: null, failed: false, synced: false, retry: null };
    try {
        const el = new Audio();
        el.preload = "auto";
        el.loop = false;
        el.volume = 0;
        el.src = CM_MUSIC_URL;        // raw.githubusercontent.com, not the github.com/blob page
        au.el = el;
        window.__cityMontageAudio = el;

        el.addEventListener("error", () => { au.failed = true; });
        el.addEventListener("loadedmetadata", () => {
            // Adjust only the last shot to the real length of the track.
            if (isFinite(el.duration) && el.duration > 60 && m && !m.done) {
                m.endT = Math.max(106, Math.min(118, el.duration));
            }
        });

        const attempt = () => {
            if (!au.el || m.done) return;
            const p = au.el.play();
            if (p && typeof p.catch === "function") {
                p.catch(() => {
                    // Autoplay blocked or the file is still loading: retry on the first tap / key.
                    if (!au.retry && !m.done) {
                        au.retry = () => { au.failed = false; attempt(); };
                        document.addEventListener("pointerdown", au.retry, { passive: true });
                        document.addEventListener("keydown", au.retry, { passive: true });
                    }
                });
            }
        };
        el.addEventListener("canplay", () => { if (el.paused && !au.failed) attempt(); });
        attempt();
    } catch (e) {
        au.failed = true;
        console.warn("[City montage] music could not start:", e);
    }
}

function cmAudioStep(m, sec) {
    const au = m.audio;
    if (!au || !au.el) return;
    const el = au.el;
    let vol;
    if (m.skipping) vol = CM_MUSIC_VOL * Math.max(0, 1 - m.skipT / CM_SKIP_FADE);
    else {
        const fin = Math.min(1, m.t / 1.5);
        const fout = Math.min(1, Math.max(0, (m.endT - m.t) / 3.5));
        vol = CM_MUSIC_VOL * fin * fout;
    }
    try { el.volume = Math.max(0, Math.min(1, vol)); } catch (e) { }

    // Late start (slow network): jump to where the cinematic already is, once.
    if (!au.synced && !m.skipping && !el.paused && el.readyState >= 2 && m.t > 1.0) {
        au.synced = true;
        if (m.t < m.endT - 6 && isFinite(el.duration) && el.duration > m.t) {
            try { el.currentTime = m.t; } catch (e) { }
        }
    }
    // Large drift (stalls while buffering): re-align, rarely.
    m.audioCheck = (m.audioCheck || 0) + sec;
    if (m.audioCheck > 4 && !el.paused && !m.skipping) {
        m.audioCheck = 0;
        if (Math.abs(el.currentTime - m.t) > 1.5 && m.t < m.endT - 6) {
            try { el.currentTime = m.t; } catch (e) { }
        }
    }
}

// ============================================================
// SKIP BUTTON (DOM, touch + mouse, removed on cleanup)
// ============================================================
function cmCreateSkip(m) {
    const host = document.getElementById("gameContainer") || document.body;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cityMontageSkip";
    b.textContent = "SKIP \u25B8\u25B8";
    b.setAttribute("aria-label", "Skip the city montage");
    b.style.cssText = [
        "position:fixed",
        "top:calc(10px + env(safe-area-inset-top, 0px))",
        "right:calc(12px + env(safe-area-inset-right, 0px))",
        "z-index:2147483000",
        "min-width:84px", "min-height:44px", "padding:0 16px",
        "font:bold 14px Arial,sans-serif", "letter-spacing:1px",
        "color:#fff", "background:rgba(0,0,0,0.45)",
        "border:1px solid rgba(255,255,255,0.55)", "border-radius:22px",
        "opacity:0.75", "cursor:pointer", "touch-action:manipulation",
        "-webkit-tap-highlight-color:transparent", "user-select:none"
    ].join(";");
    const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cmSkip(m);
    };
    b.addEventListener("pointerdown", fire);
    b.addEventListener("click", fire);          // keyboard activation; a second call is a no-op
    host.appendChild(b);
    m.ui.skip = b;
}

function cmSkip(m) {
    if (!m || m.done || m.skipping || cityMontage !== m) return;
    m.skipping = true;
    m.skipT = 0;
    m.fadeFrom = m.black;
    // stop every scripted movement and bubble right now
    m.cars.forEach(c => { if (c.cm) c.cm.frozen = true; c.speed = 0; });
    m.npcs.forEach(n => { n.path = null; n.speechText = null; n.speechTimer = 0; });
    if (m.ui.skip) m.ui.skip.disabled = true;
}

// ============================================================
// START / FINISH
// ============================================================
function startCityMontage() {
    // Never twice. Returns true when the caller must NOT start the cutscene itself.
    if (cityMontageActive || cityMontage || cityMontagePlayed) return true;
    if (typeof Car !== "function" || typeof NPC !== "function") return false;
    cityMontagePlayed = true;

    const joy = document.getElementById("joystickZone");
    const m = cityMontage = {
        t: 0, endT: CM_DURATION,
        events: [], evNext: 0, watch: [], tweens: [], routes: {},
        spawns: [], spNext: 0,
        cars: [], npcs: [], nextId: 1, e: {},
        black: 1, skipping: false, skipT: 0, fadeFrom: 1, done: false,
        cam: { x: 2560, y: 540, zoom: 0.72, tx: 2560, ty: 540, tz: 0.72, tau: 1, follow: null },
        audio: null, ui: {},
        snap: {
            cars: cars, npcs: npcs, angryDrivers: angryDrivers, playerCar: playerCar,
            px: player.x, py: player.y, ispassenger: player.ispassenger,
            isInsideHouse: isInsideHouse, camAngle: camera.angle, camTargetAngle: camera.targetAngle,
            zoom: sbCameraZoom, gameSeconds: gameSeconds, lastTimeSave: lastTimeSave,
            joyDisplay: joy ? joy.style.display : ""
        }
    };

    try {
        // ---- gameplay isolation: same entry housekeeping as the other cutscenes ----
        showFullMap = false;
        fullMapAnimating = false;
        playerPhoneOpen = false;
        if (typeof closePlayerPhone === "function") closePlayerPhone();
        gameActive = false;
        camera.angle = 0;
        camera.targetAngle = 0;
        player.ispassenger = true;            // the player is not part of this sequence
        isInsideHouse = false;

        // montage-only world; the real arrays are restored in cmFinish
        cars = m.cars;
        npcs = m.npcs;
        angryDrivers = [];
        playerCar = null;

        // daytime, without saving the clock (restored when the montage ends)
        if (typeof storySetTime === "function") storySetTime(CM_DAY_HOUR);
        else { gameSeconds = (CM_DAY_HOUR / 24) * DAY_LENGTH; lastTimeSave = gameSeconds; }

        const gc = document.getElementById("gameContainer");
        if (gc) gc.classList.add("opening-cutscene");     // existing class: hides gameplay controls
        if (joy) joy.style.display = "none";

        sbCameraZoom = 0.72;
        cmBuildTimeline(m);
        cmCreateSkip(m);
        cmAudioStart(m);

        cityMontageActive = true;
        if (typeof resizeCanvas === "function") resizeCanvas();
        cmCamJump(m, m.cam.x, m.cam.y, m.cam.zoom);
        updateCityMontage(0);
        if (typeof drawGame === "function") drawGame();
        return true;
    } catch (err) {
        console.error("[City montage] could not start, going straight to sandbox gameplay:", err);
        cmFinish(m, "error", true);        // restores everything; the caller (false return) starts gameplay
        return false;
    }
}

// reason: "end" | "skip" | "error". noHandoff: restore state only (start failed).
function cmFinish(m, reason, noHandoff) {
    if (!m || m.done) return;
    m.done = true;

    // 1. nothing can run or draw after this point
    cityMontageActive = false;
    if (cityMontage === m) cityMontage = null;

    // 2. music: stop and release
    if (m.audio && m.audio.retry) {
        document.removeEventListener("pointerdown", m.audio.retry);
        document.removeEventListener("keydown", m.audio.retry);
        m.audio.retry = null;
    }
    cmAudioStop();
    m.audio = null;

    // 3. UI
    if (m.ui.skip && m.ui.skip.parentNode) m.ui.skip.parentNode.removeChild(m.ui.skip);
    m.ui.skip = null;

    // 4. temporary entities, timers, camera
    m.cars.length = 0; m.npcs.length = 0;
    m.events.length = 0; m.watch.length = 0; m.tweens.length = 0; m.spawns.length = 0;
    window.sbCutsceneCamFocus = null;
    delete window.sbCutsceneZoom;
    sbCameraZoom = 1;

    // 5. the real world, exactly as it was
    const S = m.snap;
    cars = S.cars; npcs = S.npcs; angryDrivers = S.angryDrivers; playerCar = S.playerCar;
    player.x = S.px; player.y = S.py;
    player.ispassenger = S.ispassenger;
    isInsideHouse = S.isInsideHouse;
    camera.angle = S.camAngle; camera.targetAngle = S.camTargetAngle;
    gameSeconds = S.gameSeconds; lastTimeSave = S.lastTimeSave;      // saved time was never touched
    const joy = document.getElementById("joystickZone");
    if (joy) joy.style.display = S.joyDisplay;

    if (noHandoff) {
        const gc0 = document.getElementById("gameContainer");
        if (gc0) gc0.classList.remove("opening-cutscene");
        return;
    }

    // 6. normal sandbox gameplay. cmFinish runs once per montage (m.done guard) and
    //    beginSandboxGameplay() has its own once-only guard, so skip and natural
    //    completion can never start gameplay twice.
    if (typeof beginSandboxGameplay === "function") {
        beginSandboxGameplay();
    } else {
        const gc = document.getElementById("gameContainer");
        if (gc) gc.classList.remove("opening-cutscene");
        gameActive = true;
    }
}

// ============================================================
// PER-FRAME (called from updateGame while cityMontageActive)
// ============================================================
function updateCityMontage(dt) {
    const m = cityMontage;
    if (!m || !cityMontageActive || m.done) return;

    try {
        const sec = Math.min(dt, 4) / 60;

        if (m.skipping) {
            m.skipT += sec;
            m.black = Math.min(1, m.fadeFrom + (1 - m.fadeFrom) * (m.skipT / CM_SKIP_FADE));
            cmAudioStep(m, sec);
            if (m.skipT >= CM_SKIP_FADE) cmFinish(m, "skip");
            return;
        }

        m.t += sec;

        // timeline events
        while (m.evNext < m.events.length && m.events[m.evNext].t <= m.t) {
            m.events[m.evNext++].fn();
            if (m.skipping || m.done) return;
        }
        // scheduled traffic
        while (m.spNext < m.spawns.length && m.spawns[m.spNext].t <= m.t) {
            const sp = m.spawns[m.spNext++];
            const rt = cmRoute(m, sp.lane);
            cmCar(m, { route: sp.lane, type: sp.type, color: sp.color, speed: sp.v,
                s0: Math.min(rt.len, Math.max(0, (m.t - sp.t) * sp.v)) });
        }

        cmStepTweens(m, sec);
        for (let i = 0; i < m.cars.length; i++) cmStepCar(m.cars[i], sec);
        for (let i = m.cars.length - 1; i >= 0; i--) if (m.cars[i].cm.dead) m.cars.splice(i, 1);
        for (let i = 0; i < m.npcs.length; i++) {
            cmStepPatrol(m.npcs[i], sec);
            cmStepNpc(m.npcs[i], dt);
        }
        for (let i = m.watch.length - 1; i >= 0; i--) {
            const w = m.watch[i];
            if (w.cond()) { m.watch.splice(i, 1); w.fn(); }
        }

        // fade in at the start, fade out at the end
        if (m.t < CM_FADE_IN && !m.fadedIn) { m.fadedIn = true; m.black = 1; cmTween(m, m, "black", 0, CM_FADE_IN); }
        if (!m.fadingOut && m.t >= m.endT - CM_FADE_OUT) { m.fadingOut = true; cmTween(m, m, "black", 1, CM_FADE_OUT - 0.3); }

        cmCamStep(m, sec);
        cmAudioStep(m, sec);

        if (m.t >= m.endT) cmFinish(m, "end");
    } catch (err) {
        // Never leave the player stuck in a broken cinematic.
        console.error("[City montage] aborted:", err);
        cmFinish(m, "error");
    }
}

// ============================================================
// DRAW HOOKS (main.js)
// ============================================================
// World space, same camera transform as the cars: taxi sign, passenger, speech bubbles.
function drawCityMontageTopLayer(ctx) {
    const m = cityMontage;
    if (!m) return;

    for (let i = 0; i < m.cars.length; i++) {
        const c = m.cars[i];
        if (!c.isTaxi) continue;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);
        ctx.fillStyle = "#fff6b0";                       // roof sign
        ctx.fillRect(-4.5, -2.5, 9, 4);
        ctx.strokeStyle = "#222222"; ctx.lineWidth = 0.8;
        ctx.strokeRect(-4.5, -2.5, 9, 4);
        const px = c.cm && c.cm.pax;
        if (px && px.alpha > 0.01) {                     // passenger riding on the rear seat
            ctx.globalAlpha = Math.min(1, px.alpha);
            ctx.fillStyle = px.shirt;
            ctx.fillRect(-4.5, 4.5, 9, 4.5);
            ctx.fillStyle = px.skin;
            ctx.beginPath(); ctx.arc(0, 6.4, 3.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = px.hair;
            ctx.beginPath(); ctx.arc(0, 6.1, 3.1, Math.PI, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    for (let i = 0; i < m.npcs.length; i++) {
        const n = m.npcs[i];
        if (!n || !n.speechText || n.isInjured) continue;
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.angle);
        n.drawSpeechBubble(ctx);
        ctx.restore();
    }
}

// Screen space (end of drawGame): fades.
function drawCityMontageOverlay(ctx) {
    const m = cityMontage;
    if (!m) return;
    if (m.black > 0.001) {
        ctx.fillStyle = "rgba(0, 0, 0, " + Math.min(1, m.black) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Called from the existing keydown listener: nothing reaches the game.
function cityMontageKey(e) {
    if (!cityMontageActive || !cityMontage) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return true;       // browser shortcuts still work
    if (e.code === "Space" || (e.key && e.key.indexOf("Arrow") === 0)) e.preventDefault();
    return true;
}

// Called from the existing canvas pointerdown listener: taps never reach the game.
function cityMontagePointer(x, y) {
    return !!(cityMontageActive && cityMontage);
}

// ============================================================
// THE SEQUENCE
// ============================================================
function cmBuildTimeline(m) {
    const E = m.e;

    // ---- ambient traffic (initial cars are created at t=0 already part-way along) ----
    CM_TRAFFIC.forEach(r => m.spawns.push({ lane: r[0], t: r[1], type: r[2], color: r[3], v: r[4] }));
    m.spawns.sort((a, b) => a.t - b.t);

    // ---- ambient pedestrians ----
    CM_WALKERS.forEach((w, i) => {
        const n = cmNpc(m, w.pts[0][0], w.pts[0][1], i + 1, 0, false);
        n.cmPatrol = { pts: w.pts, i: 0, dir: 1, v: w.v, pause: w.pause, wait: i * 0.9 };
        cmFace(n, w.pts[1][0], w.pts[1][1]);
    });

    // ================= SCENE 1 (0-10): the city wakes up =================
    cmCamJump(m, 2560, 540, 0.72);
    cmAt(m, 0.05, () => cmCam(m, 2250, 552, 0.8, 6.5));       // slow, wide drift west

    // ================= SCENE 2 (10-25): morning traffic =================
    cmAt(m, 8.5, () => cmCam(m, 2046, 562, 0.95, 3.0));
    const w1 = cmNpc(m, 1760, 505, 5, Math.PI / 2, false);
    const w2 = cmNpc(m, 1990, 250, 3, Math.PI, false);
    cmAt(m, 5.5, () => {
        cmWalk(w1, [[1972, 506]], 0.8, n => cmFace(n, 1994, 508));
        cmWalk(w2, [[1994, 508]], 0.8, n => cmFace(n, 1972, 506));
    });
    cmTalk(m, 12.0, w1, "Looks like everyone's in a hurry today.");
    cmTalk(m, 14.3, w2, "It's always busy around this time.");
    cmAt(m, 18.5, () => {
        cmWalk(w1, [[1850, 505]], 0.8, null);
        cmWalk(w2, [[1990, 385]], 0.8, null);
    });

    // ================= SCENE 3 (25-39): everyday pedestrian life =================
    const p3a = cmNpc(m, 1730, 300, 6, Math.PI, false);
    const p3b = cmNpc(m, 1990, 300, 7, Math.PI, false);
    cmAt(m, 20.0, () => {
        cmWalk(p3a, [[1892, 468]], 0.8, n => cmFace(n, 1932, 468));
        cmWalk(p3b, [[1932, 468]], 0.8, n => cmFace(n, 1892, 468));
    });
    cmAt(m, 24.2, () => cmCam(m, 1915, 452, 1.4, 2.4));
    cmTalk(m, 27.8, p3a, "Did you hear? The market's getting crowded again.");
    cmTalk(m, 31.6, p3b, "Then we'd better get there early.");
    cmAt(m, 35.5, () => {
        cmWalk(p3a, [[1990, 330]], 0.8, null);
        cmWalk(p3b, [[1760, 300]], 0.8, null);
    });

    // ================= SCENE 4 (39-54): a small traffic incident =================
    // Car B brakes for a jaywalker; car A, following too closely, bumps it. Deterministic.
    const carB = cmCar(m, { route: "W", type: "Sprint, Hatchback", color: "#2980b9", speed: 62, s0: 0, v0: 62, remove: false });
    const carA = cmCar(m, { route: "W", type: "Commuter, Sedan", color: "#c0392b", speed: 88, s0: 0, v0: 88, remove: false });
    E.carB = carB; E.carA = carA;
    // they start hidden far off the road end and are placed by their spawn events
    [carB, carA].forEach(c => { c.cm.frozen = true; c.cm.dead = false; c.x = -500; c.y = -500; });
    const drvB = cmDriver(m, carB, 2);
    const drvA = cmDriver(m, carA, 4);

    cmAt(m, 29.0, () => {                                   // B enters the westbound lane
        const rt = carB.cm.rt;
        carB.cm.s = 3095 - 3000; carB.cm.v = 62; carB.cm.frozen = false;
        carB.cm.stopS = null;
        cmStopAt(carB, 2575, 556);
        const p = cmPathAt(rt, carB.cm.s); carB.x = p.x; carB.y = p.y; carB.angle = p.ang;
    });
    cmAt(m, 35.0, () => {                                   // A follows, faster and unaware
        const p = cmPathAt(carA.cm.rt, 0); carA.x = p.x; carA.y = p.y; carA.angle = p.ang;
        carA.cm.s = 0; carA.cm.v = 88; carA.cm.vT = 88; carA.cm.frozen = false;
    });

    // pedestrian who steps off the kerb in front of car B
    const jay = cmNpc(m, 2540, 599, 1, 0, false);
    const by1 = cmNpc(m, 2650, 531, 0, Math.PI, false);
    cmAt(m, 35.0, () => cmWalk(jay, [[2540, 531]], 0.62, n => cmFace(n, 2590, 548)));
    cmAt(m, 36.8, () => cmCam(m, 2560, 552, 1.35, 2.0));

    E.bumped = false;
    cmWhen(m, () => carA.cm.s > 5 && Math.hypot(carA.x - carB.x, carA.y - carB.y) <= 27.3, () => {
        E.bumped = true;
        const T0 = m.t;
        // A stops dead, B is shoved a few pixels and stops
        carA.cm.v = 0; carA.cm.vT = 0; carA.cm.frozen = true; carA.speed = 0;
        carB.cm.stopS = null; carB.cm.atStop = false; carB.cm.vT = 0; carB.cm.v = 42; carB.cm.dec = 150;
        if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(1.4, 1, 0);
        if (typeof carCrashPool !== "undefined" && carCrashPool.play) { try { carCrashPool.play(0.55); } catch (e) { } }

        cmAt(m, T0 + 0.5, () => { cmFace(jay, 2590, 548); cmFace(by1, 2590, 548); });
        cmTalk(m, T0 + 0.7, drvB, "Hey! Watch where you're going!");
        cmAt(m, T0 + 2.2, () => {                           // drivers get out on the kerb side
            drvB.cmFollow = null; drvB.isPassenger = false; drvB.x = carB.x; drvB.y = carB.y - 17;
            cmWalk(drvB, [[carB.x - 6, 541]], 0.7, n => cmFace(n, carA.x, 541));
        });
        cmTalk(m, T0 + 3.2, drvA, "Easy! It was an accident.");
        cmAt(m, T0 + 3.6, () => {
            drvA.cmFollow = null; drvA.isPassenger = false; drvA.x = carA.x; drvA.y = carA.y - 17;
            cmWalk(drvA, [[carA.x + 4, 541]], 0.7, n => cmFace(n, carB.x, 541));
        });
        cmTalk(m, T0 + 6.0, jay, "You two should move those cars off the road.");
    });

    // ================= SCENE 5 (54-69): police arrive =================
    const cop = cmCar(m, { route: "W", type: "Commuter, Sedan", color: "#111111", police: true, speed: 105, s0: 0, v0: 105, remove: false });
    cop.cm.frozen = true; cop.x = -500; cop.y = -500;
    const officer = cmNpc(m, 0, 0, 0, 0, true);
    officer.cmFollow = cop; officer.isPassenger = true;
    E.cop = cop; E.officer = officer;
    cmAt(m, 49.0, () => {
        const p = cmPathAt(cop.cm.rt, 0); cop.x = p.x; cop.y = p.y; cop.angle = p.ang;
        cop.cm.s = 0; cop.cm.v = 105; cop.cm.vT = 105; cop.cm.frozen = false;
        cop.sirenState = 1;                                 // flashing light bar only (no siren sound)
        cmStopAt(cop, 2634, 556);
    });
    cmAt(m, 50.5, () => cmCam(m, 2640, 556, 1.2, 1.6));
    cmAt(m, 55.3, () => cmCam(m, 2590, 548, 1.4, 1.8));

    cmWhen(m, () => E.bumped && cop.cm.atStop, () => {
        const T1 = m.t;
        cmAt(m, T1 + 0.5, () => {                           // officer steps out on the kerb side
            officer.cmFollow = null; officer.isPassenger = false;
            officer.x = cop.x; officer.y = cop.y - 17;
            cmWalk(officer, [[cop.x - 14, 531], [carB.x + 14, 524]], 0.8, n => cmFace(n, carB.x + 14, 541));
            cop.sirenState = 0;
        });
        const a = cmTalk(m, T1 + 2.2, officer, ["All right, both of you.", "Move your vehicles to the side."]);
        const b = cmTalk(m, a + 0.1, drvA, "He came out of nowhere!");
        const c = cmTalk(m, b + 0.1, officer, ["Save it for later.", "Let's clear the road first."]);
        E.cleared = c + 0.5;
        // everybody gets back in; the road is cleared
        cmAt(m, E.cleared, () => {
            cmWalk(drvB, [[carB.x, carB.y - 12]], 0.9, n => { n.cmFollow = carB; n.isPassenger = true; });
            cmWalk(drvA, [[carA.x, carA.y - 12]], 0.9, n => { n.cmFollow = carA; n.isPassenger = true; });
            cmWalk(officer, [[cop.x, cop.y - 12]], 0.9, n => { n.cmFollow = cop; n.isPassenger = true; });
            cmWalk(jay, [[2540, 531]], 0.6, null);
        });
        cmAt(m, E.cleared + 1.3, () => { carB.cm.remove = true; carB.cm.dec = 95; cmGo(carB, 85); });
        cmAt(m, E.cleared + 2.4, () => { carA.cm.remove = true; cmGo(carA, 85); });
        cmAt(m, E.cleared + 3.5, () => { cop.cm.remove = true; cmGo(cop, 75); });
    });

    // ================= SCENE 6 (69-88): the taxi and its passenger =================
    const pax = cmNpc(m, 2250, 602, 4, 0, false);           // waits on the south kerb
    pax.cmBusy = true;
    const taxi = cmCar(m, { route: "TAXI", type: "Commuter, Sedan", color: "#f1c40f", taxi: true, speed: 100, s0: 0, v0: 100, remove: false });
    taxi.cm.frozen = true; taxi.x = -500; taxi.y = -500;
    const taxiDrv = cmDriver(m, taxi, 6);
    E.taxi = taxi; E.pax = pax;

    cmAt(m, 58.5, () => {
        const p = cmPathAt(taxi.cm.rt, 0); taxi.x = p.x; taxi.y = p.y; taxi.angle = p.ang;
        taxi.cm.s = 0; taxi.cm.v = 100; taxi.cm.vT = 100; taxi.cm.frozen = false;
        cmStopAt(taxi, 2250, 580);
    });
    cmAt(m, 66.8, () => cmCam(m, 2235, 588, 1.5, 2.2));

    cmWhen(m, () => taxi.cm.atStop && m.t > 66, () => {
        const T2 = m.t;
        cmFace(pax, 2250, 580);
        const a = cmTalk(m, T2 + 0.8, pax, "Taxi! Are you available?");
        const b = cmTalk(m, a + 0.1, taxiDrv, "Sure. Where to?");
        const c = cmTalk(m, b + 0.1, pax, "Near the market, please.");
        // door interaction: the passenger steps to the door, then sits on the rear seat
        cmAt(m, c + 0.1, () => cmWalk(pax, [[2250, 592]], 0.55, n => {
            n.isPassenger = true;                           // existing flag: hidden while inside
            taxi.cm.pax = { shirt: n.shirtColor, skin: n.skinColor, hair: n.hairColor, alpha: 0 };
            cmTween(m, taxi.cm.pax, "alpha", 1, 0.35);
            cmAt(m, m.t + 0.6, () => {
                cmGo(taxi, 76);                              // drives away with the passenger
                cmFollow(m, taxi, 70, 1.15, 1.0);
            });
        }));
    });

    // ================= SCENE 7 (88-101): taxi journey =================
    // The taxi follows TAXI: east on the boulevard, south down the side street,
    // east along the lower road. It cruises at 76 px/s.
    // ================= SCENE 8 (101-110): drop-off and closing shot =================
    cmWhen(m, () => taxi.cm.pax && taxi.cm.s > cmRouteS(taxi.cm.rt, 2717, 1150) + 90 && taxi.cm.v > 1, () => {
        cmStopAt(taxi, 3000, 1150);
        taxi.cm.dec = 70;
    });
    cmWhen(m, () => taxi.cm.pax && taxi.cm.atStop && taxi.cm.s > 1500, () => {
        const T3 = m.t;
        cmTween(m, taxi.cm.pax, "alpha", 0, 0.3);
        cmAt(m, T3 + 0.8, () => {                           // passenger steps out on the kerb side
            pax.isPassenger = false; pax.cmFollow = null;
            pax.x = taxi.x; pax.y = taxi.y + 14;
            cmWalk(pax, [[3000, 1171], [2950, 1171]], 0.6, n => cmFace(n, 2940, 1171));
        });
        cmAt(m, T3 + 2.2, () => {
            taxi.cm.pax = null;
            taxi.cm.remove = true;
            cmGo(taxi, 80);                                 // the taxi drives on along the road
            cmFollow(m, taxi, 60, 1.0, 1.6);
        });
        cmAt(m, T3 + 4.0, () => cmCam(m, 3050, 1140, 0.8, 3.2));   // slow pull-back
    });
}
