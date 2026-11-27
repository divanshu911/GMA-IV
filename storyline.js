console.log("streetbound-storyline20-player-history");
// ===== REUSABLE CINEMATIC HELPERS =====
//
// The mandatory storyline (police briefing, SUV ambush, Victor's home meeting,
// the $5,000 debt and the Mickey contact) has been removed. What remains is the
// reusable cinematic toolbox: overlay text helpers, the phone message layer,
// scripted NPC / bullet / explosion helpers, a clock setter and the character
// introduction-card engine. Nothing in this file starts automatically; the
// startup sequence (city montage -> sandbox) lives in citymontage.js and important.js.

const openingCutscene = document.getElementById("openingCutscene");
const openingText = document.getElementById("openingText");

function openingShowText(text, className = "") {
    if (!openingText) return;

    openingText.className = "";
    openingText.textContent = text;

    if (className) {
        openingText.classList.add(className);
    }

    void openingText.offsetWidth;
    openingText.classList.add("show");
}

function openingClearText(callback) {
    if (!openingText) {
        if (callback) callback();
        return;
    }

    openingText.classList.remove("show");
    openingText.classList.add("fade");

    setTimeout(() => {
        openingText.className = "";
        openingText.textContent = "";

        if (callback) callback();
    }, 450);
}

// Function helpers to control the on-phone message overlay
// Function helpers to control the on-phone message overlay
function showPhoneCutsceneMessage(text) {
    const msgLayer = document.getElementById("phoneCutsceneMessage");
    const msgText = document.getElementById("phoneCutsceneMessageText");
    if (msgLayer && msgText) {
        const msgHeader = msgLayer.querySelector(".msg-header");
        if (msgHeader) msgHeader.textContent = "NEW MESSAGE";
        msgText.textContent = text;
        msgLayer.style.display = "flex";
    }
}

function hidePhoneCutsceneMessage() {
    const msgLayer = document.getElementById("phoneCutsceneMessage");
    if (msgLayer) {
        msgLayer.style.display = "none";
    }
}

// ------------------------------------------------------------
// Obsolete story persistence
// The removed storyline wrote these three keys. Nothing reads them any more;
// they are deleted key by key (never localStorage.clear()) so stale data
// cannot linger or trigger an old scene.
// ------------------------------------------------------------
const OBSOLETE_STORY_STORAGE_KEYS = [
    "streetbound_story_intro_v1",
    "streetbound_story_debt_v1",
    "streetbound_story_syndicate_v1"
];

function purgeObsoleteStoryStorage() {
    OBSOLETE_STORY_STORAGE_KEYS.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
    });
}

function hasConfiguredControls() {
    try {
        const v = localStorage.getItem(CONTROL_MODE_STORAGE_KEY);
        return v === CONTROL_MODE_SCREEN || v === CONTROL_MODE_OBJECT;
    } catch (e) {
        return false;
    }
}

// ---- small helpers -------------------------------------------------
function storyBlack(on) {
    if (openingCutscene) openingCutscene.classList.toggle("title-screen", !!on);
}

// Slow cinematic fade (2.2 s in, normal speed out) for scene changes.
function storyBlackSlow(on) {
    if (!openingCutscene) return;
    openingCutscene.classList.toggle("slow-black", !!on);
    openingCutscene.classList.toggle("title-screen", !!on);
}

function storyHideText() {
    if (!openingText) return;
    openingText.classList.remove("show");
    openingText.classList.add("fade");
}

function storyClearText() {
    if (!openingText) return;
    openingText.className = "";
    openingText.textContent = "";
}

function storyNpc(s, x, y, shirt, hair, skin, angle) {
    const n = new NPC(60000 + (s.nextId++), x, y, shirt, hair, skin, false);
    n.speed = 0;
    n.canFightBack = false;
    n.isFightingBack = false;
    n.cutsceneArmed = true;     // lets NPC.draw show the raised gun
    n.angle = angle || 0;
    n.punchTimer = 0;
    n.policeFiringTimer = 0;
    n.aimHold = false;
    n.path = null;
    n.moveSpeed = 1.4;
    npcs.push(n);
    return n;
}

function storyFace(n, x, y) {
    n.angle = Math.atan2(y - n.y, x - n.x) + Math.PI / 2;
}

function storySay(who, text, sec) {
    who.say(text, Math.round(sec * 60));
}

function storyWalk(n, pts, speed, done) {
    n.path = pts.slice();
    n.moveSpeed = speed;
    n.pathDone = done || null;
}

function storyRemoveNpc(n) {
    const i = npcs.indexOf(n);
    if (i >= 0) npcs.splice(i, 1);
}

function storyThud(vol) {
    if (typeof playSpatialSound === "function" && typeof npcHitPool !== "undefined") {
        playSpatialSound(npcHitPool, player.x, player.y, vol || 0.9, 900);
    }
}

function storyPunch(puncher) {
    puncher.punchTimer = 12;      // same 12-frame punch animation the player uses
    storyThud(0.9);
}

function storyAlive(list) { return list.filter(n => !n.isInjured); }
function storyPick(list) { return list[Math.floor(Math.random() * list.length)]; }

// ---- shooting (cutscene-only; police bullet logic is untouched) ----
// ---- shooting (cutscene-only; police bullet logic is untouched) ----
function storyFire(shooter, tx, ty, opts) {
    opts = opts || {};
    storyFace(shooter, tx, ty);

    const fx = Math.sin(shooter.angle), fy = -Math.cos(shooter.angle);
    const rx = Math.cos(shooter.angle), ry = Math.sin(shooter.angle);
    const mx = shooter.x + fx * shooter.size * 0.84 + rx * shooter.size * 0.28;
    const my = shooter.y + fy * shooter.size * 0.84 + ry * shooter.size * 0.28;
    const a = Math.atan2(ty - my, tx - mx) + (opts.spread || 0);

    policeBullets.push({
        x: mx, y: my,
        vx: Math.cos(a) * POLICE_BULLET_SPEED,
        vy: Math.sin(a) * POLICE_BULLET_SPEED,
        life: 70,
        owner: shooter,
        cs: true,                       // marks it as a cutscene bullet
        kill: opts.kill || null,
        hitCar: opts.hitCar || null
    });

    shooter.policeFiringTimer = 10;
    shooter.aimHold = true;
    if (typeof playPoliceBulletSound === "function") playPoliceBulletSound();
}

function storyUpdateBullets(s, dt) {
    for (let i = policeBullets.length - 1; i >= 0; i--) {
        const b = policeBullets[i];
        if (!b.cs) continue;

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        let remove = b.life <= 0;

        if (!remove && b.kill && !b.kill.isInjured &&
            Math.hypot(b.x - b.kill.x, b.y - b.kill.y) < 10) {
            b.kill.isInjured = true;      // existing lying-down rendering
            b.kill.aimHold = false;
            b.kill.policeFiringTimer = 0;
            remove = true;
        }

        if (!remove && b.hitCar && !b.hitCar.exploded &&
            Math.hypot(b.x - b.hitCar.x, b.y - b.hitCar.y) < 15) {
            b.hitCar.tirePunctured = true;   // existing spark animation
            b.hitCar.health = Math.max(150, b.hitCar.health - 20);
            if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(2.4, 1, 0);
            remove = true;
        }

        if (remove) policeBullets.splice(i, 1);
    }
}

function storyExplode(s, car, count, shake) {
    car.health = 0;
    car.exploded = true;
    car.speed = 0;
    car.isParked = true;
    car.hasDriver = false;
    spawnExplosionDebris(car.x, car.y, count);
    playSpatialSound(explosionPool, player.x, player.y, 1.0, 900);
    if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(shake, -1, 0.3);
    s.blasts.push({ x: car.x, y: car.y, age: 0, life: 70, r: 95 });
}

// Set the in-game clock without touching saved world time.
function storySetTime(hour) {
    gameSeconds = (hour / 24) * DAY_LENGTH;
    lastTimeSave = gameSeconds;          // suppresses the localStorage write
    if (typeof updateDayNight === "function") updateDayNight(0);
}

function storyUpdateNpcs(dt) {
    for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        n.updateSpeech(dt);
        if (n.isInjured) continue;

        if (n.punchTimer > 0) n.punchTimer = Math.max(0, n.punchTimer - dt);

        if (n.aimHold) {
            // gun stays raised; the muzzle flash only shows while firing (> 5)
            n.policeFiringTimer = n.policeFiringTimer > 5
                ? Math.max(5, n.policeFiringTimer - dt)
                : 5;
        } else if (n.policeFiringTimer > 0) {
            n.policeFiringTimer = Math.max(0, n.policeFiringTimer - dt);
        }

        if (n.path && n.path.length) {
            const p = n.path[0];
            const dx = p[0] - n.x, dy = p[1] - n.y;
            const d = Math.hypot(dx, dy);
            const step = n.moveSpeed * dt;

            if (d <= step) {
                n.x = p[0];
                n.y = p[1];
                n.path.shift();
                if (!n.path.length) {
                    n.path = null;
                    if (n.pathDone) {
                        const cb = n.pathDone;
                        n.pathDone = null;
                        cb(n);
                    }
                }
            } else {
                n.x += dx / d * step;
                n.y += dy / d * step;
                n.angle = Math.atan2(dy, dx) + Math.PI / 2;
                n.walkTimer += n.moveSpeed * dt * 0.25;
            }
        }
    }
}

// ============================================================
// RACE SCHEDULE RESYNC
// A scene that jumps the in-game clock should call this afterwards. raceManager keeps its own
// "last observed hour"; without this a clock jump could be mistaken
// for midnight or leave a stale schedule behind.
// ============================================================
function storyResyncRaceSchedule(hour) {
    const rm = window.raceEventManager;
    if (!rm) return;

    try {
        const nowMinutes = Math.floor(hour * 60);
        const upcoming =
            rm.state === "SCHEDULED" &&
            !rm.raceStarted &&
            rm.raceStartHour !== null &&
            rm.raceStartHour !== undefined &&
            (rm.raceStartHour * 60 + (rm.raceStartMinute || 0)) > nowMinutes;

        if (!upcoming && rm.state !== "RACING") {
            rm.clearSavedRaceTime();
            rm.clearRaceState();
            rm.state = "WAITING";
            rm.scheduleCheckPending = true;     // update() schedules a fresh race
        }

        rm.lastObservedHour = hour;
    } catch (err) {
        console.warn("[Cinematic] race resync skipped:", err);
    }
}

// ============================================================
// INTRODUCTION CARDS (engine only)
// Cinematic name cards on the left of the screen: slight camera zoom onto a
// focus point, fade-in / fade-out, camera restored afterwards.
//
// No cards are registered any more (STORY_CARD_DEFS is empty). A future
// scene registers its own cards:
//   STORY_CARD_DEFS.myKey = { name: "...", sub: "..." };
//   s.cards = { queue: [], seen: {}, active: null, watchers: [] };
//   s.cards.watchers.push({ key: "myKey", test: () => ..., focus: () => ({x, y}) });
// and calls storyIntroCardsUpdate(s, dt) every frame (a true result means
// "the scene must stay frozen"), storyIntroCardsWatch(s) to fire watchers and
// storyIntroCardsAbort() when the scene ends. The scene object `s` needs
// s.scene ("road" | "house") and, for "road", s.cam = { x, y }.
// Zoom reuses window.sbCutsceneZoom; the pan reuses window.sbCutsceneCamFocus.
// ============================================================
const STORY_CARD_ZOOM_FACTOR = 1.12;   // "slight" zoom-in while a card is up
const STORY_CARD_T_CAM_IN = 1.1;       // seconds: camera eases onto the focus
const STORY_CARD_T_FADE_IN0 = 0.3;     // card fade-in start
const STORY_CARD_T_FADE_IN1 = 1.0;     // card fully visible
const STORY_CARD_T_OUT0 = 5.5;         // extended: card fade-out + camera return start (was 3.5)
const STORY_CARD_T_FADE_OUT1 = 6.2;    // extended: card fully gone (was 4.2)
const STORY_CARD_T_CAM_OUT1 = 6.6;     // extended: camera back at its original place (was 4.6)
const STORY_CARD_T_MAX = 8.5; //hard cap

const STORY_CARD_DEFS = {};   // key -> { name, sub }  (story cards removed)

let storyCardEl = null;       // lazily created DOM card
let storyCardLive = null;     // { s, a } while a card is active (for abort)

function storyCardEnsureDom() {
    if (storyCardEl && storyCardEl.isConnected) return storyCardEl;

    if (!document.getElementById("storyIntroCardStyle")) {
        const st = document.createElement("style");
        st.id = "storyIntroCardStyle";
        st.textContent =
            "#storyIntroCard{position:absolute;left:max(calc(env(safe-area-inset-left,0px) + 16px),5vw);" +
            "top:50%;z-index:2147483000;display:none;opacity:0;pointer-events:none;box-sizing:border-box;" +
            "max-width:min(42vw,620px);align-items:stretch;gap:clamp(10px,1.7vmin,20px);" +
            "padding:clamp(8px,1.8vmin,22px) clamp(18px,3.2vmin,40px) clamp(8px,1.8vmin,22px) 0;" +
            "background:linear-gradient(90deg,rgba(0,0,0,.66) 0%,rgba(0,0,0,.46) 62%,rgba(0,0,0,0) 100%);" +
            "will-change:opacity,transform;}" +
            "#storyIntroCard .sic-bar{flex:0 0 auto;width:clamp(3px,.55vmin,6px);" +
            "background:linear-gradient(180deg,#ffd166 0%,#e4572e 100%);box-shadow:0 0 12px rgba(255,150,60,.55);}" +
            "#storyIntroCard .sic-name{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:800;" +
            "font-size:clamp(24px,5.4vmin,56px);line-height:1.05;letter-spacing:.02em;color:#f6f2e8;" +
            "text-shadow:0 2px 12px rgba(0,0,0,.85);overflow-wrap:break-word;}" +
            "#storyIntroCard .sic-sub{margin-top:.4em;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;" +
            "font-weight:500;font-size:clamp(13px,2.4vmin,24px);line-height:1.2;letter-spacing:.06em;color:#e9c987;" +
            "text-shadow:0 1px 8px rgba(0,0,0,.85);overflow-wrap:break-word;}";
        document.head.appendChild(st);
    }

    const el = document.createElement("div");
    el.id = "storyIntroCard";
    el.setAttribute("aria-hidden", "true");

    const bar = document.createElement("div");
    bar.className = "sic-bar";
    const box = document.createElement("div");
    const name = document.createElement("div");
    name.className = "sic-name";
    const sub = document.createElement("div");
    sub.className = "sic-sub";
    box.appendChild(name);
    box.appendChild(sub);
    el.appendChild(bar);
    el.appendChild(box);

    (document.getElementById("gameContainer") || document.body).appendChild(el);
    storyCardEl = el;
    return el;
}

function storyCardHide() {
    if (!storyCardEl) return;
    storyCardEl.style.opacity = "0";
    storyCardEl.style.display = "none";
}

function storyCentroid(list) {
    const pts = (list || []).filter(n => n);
    if (!pts.length) return null;
    let x = 0, y = 0;
    pts.forEach(n => { x += n.x; y += n.y; });
    return { x: x / pts.length, y: y / pts.length };
}

function storySmooth(u) {
    u = Math.max(0, Math.min(1, u));
    return u * u * (3 - 2 * u);
}

function storyQueueIntro(s, key) {
    const c = s.cards;
    if (!c || c.seen[key]) return;          // never twice
    c.seen[key] = true;
    const w = c.watchers.find(x => x.key === key);
    c.queue.push({ key: key, def: STORY_CARD_DEFS[key], focus: w ? w.focus : () => null });
}

function storyIntroCardsWatch(s) {
    const c = s.cards;
    if (!c) return;
    for (let i = 0; i < c.watchers.length; i++) {
        const w = c.watchers[i];
        if (c.seen[w.key]) continue;
        if (w.test()) storyQueueIntro(s, w.key);
    }
}

function storyIntroCardsPending(s) {
    const c = s.cards;
    return !!c && (!!c.active || c.queue.length > 0);
}

// ---- per-frame (returns true while the cutscene must stay frozen) ----
function storyIntroCardsUpdate(s, dt) {
    const c = s.cards;
    if (!c) return false;

    if (!c.active) {
        if (!c.queue.length) return false;
        storyIntroCardBegin(s, c, c.queue.shift());
    }

    const a = c.active;
    a.t += dt / 60;

    // camera blend: 0 = original view, 1 = on the focus
    let b;
    if (a.t < STORY_CARD_T_OUT0) {
        b = storySmooth(a.t / STORY_CARD_T_CAM_IN);
    } else {
        b = storySmooth(1 - (a.t - STORY_CARD_T_OUT0) / (STORY_CARD_T_CAM_OUT1 - STORY_CARD_T_OUT0));
    }

    // zoom back to the original target when the card starts leaving
    if (!a.zoomReleased && a.t >= STORY_CARD_T_OUT0) {
        a.zoomReleased = true;
        storyCardRestoreZoom(a);
    }

    // card opacity / slide
    let o;
    if (a.t < STORY_CARD_T_FADE_IN1) {
        o = storySmooth((a.t - STORY_CARD_T_FADE_IN0) / (STORY_CARD_T_FADE_IN1 - STORY_CARD_T_FADE_IN0));
    } else if (a.t < STORY_CARD_T_OUT0) {
        o = 1;
    } else {
        o = 1 - storySmooth((a.t - STORY_CARD_T_OUT0) / (STORY_CARD_T_FADE_OUT1 - STORY_CARD_T_OUT0));
    }
    if (storyCardEl) {
        storyCardEl.style.opacity = String(o);
        storyCardEl.style.transform = "translateY(-50%) translateX(" + ((1 - o) * -28).toFixed(1) + "px)";
    }

    storyIntroCardCamera(s, a, b);

    // finished: card gone, camera back, zoom settled (or hard cap reached)
    const zoomSettled = a.base === null || typeof sbCameraZoom !== "number" ||
        Math.abs(sbCameraZoom - a.base) < 0.004;
    if (a.t >= STORY_CARD_T_CAM_OUT1 && (zoomSettled || a.t >= STORY_CARD_T_MAX)) {
        storyIntroCardEnd(s, c, a);
        return c.queue.length > 0;     // queued card: stay frozen; otherwise resume now
    }
    return true;
}

function storyIntroCardBegin(s, c, item) {
    const a = {
        key: item.key,
        def: item.def,
        focus: item.focus,
        t: 0,
        base: (typeof window.sbCutsceneZoom === "number") ? window.sbCutsceneZoom : null,
        zoomReleased: false,
        lastF: null
    };
    c.active = a;
    storyCardLive = { s: s, a: a };

    const el = storyCardEnsureDom();
    el.querySelector(".sic-name").textContent = a.def.name;
    const sub = el.querySelector(".sic-sub");
    sub.textContent = a.def.sub || "";
    sub.style.display = a.def.sub ? "" : "none";       // no empty subtitle line
    el.style.opacity = "0";
    el.style.transform = "translateY(-50%) translateX(-28px)";
    el.style.display = "flex";

    // slight zoom-in, using the existing smoothed cutscene zoom
    window.sbCutsceneZoom = (a.base || 1) * STORY_CARD_ZOOM_FACTOR;
}

function storyCardRestoreZoom(a) {
    if (a.base !== null) window.sbCutsceneZoom = a.base;
    else delete window.sbCutsceneZoom;
}

function storyIntroCardCamera(s, a, b) {
    const f = a.focus();
    if (f) a.lastF = f;
    const F = a.lastF;
    if (!F) return;

    if (s.scene === "road") {
        // The camera follows the player object, parked on s.cam. s.cam itself
        // is never modified, so b = 0 gives exactly the original view.
        const cx = s.cam.x + (F.x - s.cam.x) * b;
        const cy = s.cam.y + (F.y - s.cam.y) * b;
        player.x = cx - player.size / 2;
        player.y = cy - player.size / 2;
    } else {
        // House: the player really stands at pBase; main.js looks at this
        // focus instead of the player while it is set.
        const px = player.x + player.size / 2;
        const py = player.y + player.size / 2;
        window.sbCutsceneCamFocus = {
            x: px + (F.x - px) * b - player.size / 2,
            y: py + (F.y - py) * b - player.size / 2,
            size: player.size
        };
    }
}

function storyIntroCardEnd(s, c, a) {
    if (!a.zoomReleased) storyCardRestoreZoom(a);
    window.sbCutsceneCamFocus = null;
    if (s.scene === "road" && s.cam) {
        player.x = s.cam.x - player.size / 2;        // parks the player on the scene camera
        player.y = s.cam.y - player.size / 2;
    }
    storyCardHide();
    c.active = null;
    storyCardLive = null;
}

// Called when the whole cutscene ends: never leave a card or camera override behind.
function storyIntroCardsAbort() {
    if (storyCardLive) {
        const a = storyCardLive.a;
        if (!a.zoomReleased) storyCardRestoreZoom(a);
        storyCardLive.s.cards.active = null;
        storyCardLive = null;
    }
    window.sbCutsceneCamFocus = null;
    storyCardHide();
}


// ============================================================
// PLAYER HISTORY & BEHAVIOUR RECOGNITION
// Foundation for the future Dynamic Story Director.
//
// 1. READ     - builds one profile from statistics the game already saves
//               (taxi jobs, money, owned cars, crime cases) plus a few
//               lifetime counters that did not exist before.
// 2. REMEMBER - a bounded (50) list of recent meaningful events.
// 3. ANALYSE  - behaviour scores (0..1) + a short natural-language summary,
//               printed to the console once, after the game has loaded.
//
// Nothing here edits another system. Events are detected by watching
// existing game state a few times per second (never per frame) and the
// only thing written to localStorage is ONE new key:
//     streetbound_player_history_v1
// Existing saves (gma_*) are only ever READ.
//
// Existing data reused (not duplicated):
//   gma_taxi_missions_completed / player.taxiMissionsCompleted  -> taxi jobs
//   gma_player_money / player.money                             -> current money
//   gma_player_cars / playerCars + carPrices                    -> owned vehicles
//   playerHitRunCases / playerCarStealCases / playerAssaultCases-> ACTIVE crime cases
//
// Note: the three crime-case counters are reset to 0 on every arrest, so
// they are not lifetime totals. Lifetime crimes are therefore counted here
// (new key) by watching those counters go up.
// ============================================================
(function () {
    "use strict";

    if (window.StreetBoundHistory) return;

    const HISTORY_KEY = "streetbound_player_history_v1";
    const HISTORY_VERSION = 1;
    const MAX_EVENTS = 50;

    const POLL_MS = 250;                  // state watcher interval (not per frame)
    const DEFAULT_DEDUPE_MS = 4000;       // same event + same detail inside this window = ignored
    const ESCAPE_MIN_CHASE_MS = 3000;     // a chase must last this long to count as an escape
    const ESCAPE_MIN_GAP_MS = 10000;      // at most one escape per 10 s

    const MIN_ACTIVITY = 5;               // below this: "undetermined"
    const MIXED_ACTIVITY = 8;             // enough activity to call someone "mixed"
    const TENDENCY_MIN = 0.4;             // score needed to be reported as a tendency
    const LIFETIME_WEIGHT = 0.8;          // lifetime totals vs. recent events
    const RECENT_WEIGHT = 0.2;

    const BEHAVIOURS = [
        "law_abiding", "criminal", "aggressive", "competitive",
        "professional_driver", "wealthy", "reckless_driver"
    ];

    // Behaviours of the same family describe the same kind of player, so they
    // never make someone "mixed" on their own.
    const FAMILY = {
        criminal: "crime", aggressive: "crime", reckless_driver: "crime",
        professional_driver: "work", law_abiding: "work",
        competitive: "racing", wealthy: "wealth"
    };

    // ---------------- small safe helpers ----------------
    function num(v) {
        const n = Number(v);
        return (Number.isFinite(n) && n > 0) ? n : 0;
    }

    function lsGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function lsSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    function sat(x, k) {                  // 0..1, linear up to k
        return x <= 0 ? 0 : Math.min(1, x / k);
    }

    function plural(n, one, many) {
        return n + " " + (n === 1 ? one : (many || one + "s"));
    }

    function listJoin(parts) {
        if (parts.length <= 1) return parts.join("");
        return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
    }

    function money(n) {
        return "$" + Math.round(n).toLocaleString("en-US");
    }

    function hash(str) {                  // stable seed: same data -> same wording
        let h = 7;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        return h;
    }

    function pick(list, seed, salt) {
        return list[(seed + (salt || 0) * 7) % list.length];
    }

    // ---------------- readers for EXISTING game data ----------------
    function readTaxiJobs() {
        let best = num(parseInt(lsGet("gma_taxi_missions_completed") || "0", 10));
        if (typeof player !== "undefined" && player) {
            best = Math.max(best, num(player.taxiMissionsCompleted));
        }
        return Math.floor(best);
    }

    function readMoney() {
        if (typeof player !== "undefined" && player && Number.isFinite(Number(player.money))) {
            return Number(player.money);
        }
        const saved = Number(lsGet("gma_player_money"));
        return Number.isFinite(saved) ? saved : null;
    }

    function readCrimeCounts() {          // null = counter not available
        return {
            hitRun: (typeof playerHitRunCases !== "undefined") ? num(playerHitRunCases) : null,
            carSteal: (typeof playerCarStealCases !== "undefined") ? num(playerCarStealCases) : null,
            assault: (typeof playerAssaultCases !== "undefined") ? num(playerAssaultCases) : null
        };
    }

    function readOwnedCars() {
        return (typeof playerCars !== "undefined" && Array.isArray(playerCars))
            ? playerCars.filter(c => c && c.type)
            : [];
    }

    function carValue(type) {
        return (typeof carPrices !== "undefined" && carPrices && Number.isFinite(carPrices[type]))
            ? carPrices[type]
            : 0;
    }

    function inGameHour() {
        if (typeof gameSeconds !== "undefined" && typeof DAY_LENGTH !== "undefined" &&
            Number.isFinite(gameSeconds) && DAY_LENGTH > 0) {
            return Math.round((((gameSeconds / DAY_LENGTH) * 24) % 24) * 10) / 10;
        }
        return null;
    }

    // ---------------- persistent store (new key only) ----------------
    function emptyStore() {
        return {
            v: HISTORY_VERSION,
            sessions: 0,
            counters: {
                truckJobs: 0, arrests: 0, escapes: 0,
                racesWon: 0, racesLost: 0, raceEarnings: 0,
                hitRun: 0, carSteal: 0, assault: 0,
                carsPurchased: 0, carSpend: 0, blackMarketSales: 0
            },
            events: []
        };
    }

    function sanitizeStore(raw) {
        const out = emptyStore();
        if (!raw || typeof raw !== "object") return out;

        out.sessions = Math.floor(num(raw.sessions));

        const rc = (raw.counters && typeof raw.counters === "object") ? raw.counters : {};
        Object.keys(out.counters).forEach(k => { out.counters[k] = num(rc[k]); });

        if (Array.isArray(raw.events)) {
            raw.events.forEach(e => {
                if (!e || typeof e.type !== "string" || !Number.isFinite(Number(e.t))) return;
                out.events.push({
                    type: e.type.slice(0, 40),
                    t: Number(e.t),
                    h: Number.isFinite(Number(e.h)) ? Number(e.h) : null,
                    s: Math.floor(num(e.s)),
                    d: (e.d && typeof e.d === "object") ? e.d : null
                });
            });
            out.events = out.events.slice(-MAX_EVENTS);
        }
        return out;
    }

    let store = emptyStore();

    // returns true when the stored data was missing or unreadable (needs seeding)
    function loadStore() {
        const raw = lsGet(HISTORY_KEY);

        if (raw === null) {
            store = emptyStore();
            return true;
        }

        try {
            store = sanitizeStore(JSON.parse(raw));
            return false;
        } catch (e) {
            console.warn("[History] Stored history was unreadable; starting a fresh history.");
            if (lsGet(HISTORY_KEY + "_corrupt_backup") === null) {
                lsSet(HISTORY_KEY + "_corrupt_backup", String(raw).slice(0, 20000));
            }
            store = emptyStore();
            return true;
        }
    }

    function saveStore() {
        lsSet(HISTORY_KEY, JSON.stringify(store));
    }

    // First ever run (old saves): crimes that are already on record count as committed.
    function seedFromExistingSave() {
        const cc = readCrimeCounts();
        store.counters.hitRun = Math.max(store.counters.hitRun, cc.hitRun || 0);
        store.counters.carSteal = Math.max(store.counters.carSteal, cc.carSteal || 0);
        store.counters.assault = Math.max(store.counters.assault, cc.assault || 0);
    }

    // ---------------- A. unified profile ----------------
    function recentStats() {
        const r = { jobs: 0, crimes: 0, assault: 0, hitRun: 0, races: 0, arrests: 0, purchases: 0 };
        store.events.forEach(e => {
            switch (e.type) {
                case "taxi_job": case "truck_job": r.jobs++; break;
                case "crime_hit_run": r.hitRun++; r.crimes++; break;
                case "crime_car_steal": r.crimes++; break;
                case "crime_assault": r.assault++; r.crimes++; break;
                case "black_market_sale": r.crimes++; break;
                case "arrest": r.arrests++; r.crimes++; break;
                case "race_won": case "race_lost": r.races++; break;
                case "vehicle_purchase": r.purchases++; break;
            }
        });
        return r;
    }

    function getProfile() {
        const c = store.counters;
        const owned = readOwnedCars();
        let ownedValue = 0;
        owned.forEach(car => { ownedValue += carValue(car.type); });

        const taxiJobs = readTaxiJobs();
        const crimesTotal = c.hitRun + c.carSteal + c.assault;
        const racesEntered = c.racesWon + c.racesLost;

        return {
            sessions: store.sessions,
            taxiJobs: taxiJobs,
            truckJobs: c.truckJobs,
            jobs: taxiJobs + c.truckJobs,
            crimes: { hitRun: c.hitRun, carSteal: c.carSteal, assault: c.assault, total: crimesTotal },
            arrests: c.arrests,
            escapes: c.escapes,
            racesWon: c.racesWon,
            racesLost: c.racesLost,
            racesEntered: racesEntered,
            raceEarnings: c.raceEarnings,
            carsOwned: owned.length,
            carsPurchased: Math.max(c.carsPurchased, owned.length),
            vehicleValue: Math.max(c.carSpend, ownedValue),
            blackMarketSales: c.blackMarketSales,
            money: Math.max(0, readMoney() || 0),
            recent: recentStats(),
            recentEventCount: store.events.length
        };
    }

    // ---------------- C. behaviour analysis ----------------
    function activityOf(p) {
        return p.jobs + p.crimes.total + p.arrests + p.escapes +
            p.racesEntered + p.carsPurchased + p.blackMarketSales;
    }

    function analyse(p) {
        const r = p.recent;
        const crimeUnits = p.crimes.total + p.arrests + p.blackMarketSales;
        const legit = p.jobs + p.racesEntered;
        const netWorth = p.money + p.vehicleValue;

        const lifetime = {
            professional_driver: sat(p.jobs, 20),
            criminal: sat(crimeUnits, 12),
            aggressive: sat(p.crimes.assault, 6),
            competitive: 0.5 * sat(p.racesEntered, 6) + 0.5 * sat(p.racesWon, 4),
            reckless_driver: sat(p.crimes.hitRun, 6),
            wealthy: sat(netWorth, 20000),
            law_abiding: (legit >= MIXED_ACTIVITY) ? sat(legit, 15) * (1 - sat(crimeUnits, 6)) : 0
        };

        const recent = {
            professional_driver: sat(r.jobs, 8),
            criminal: sat(r.crimes, 6),
            aggressive: sat(r.assault, 3),
            competitive: sat(r.races, 4),
            reckless_driver: sat(r.hitRun, 3),
            wealthy: sat(r.purchases, 2),
            law_abiding: (r.crimes === 0) ? sat(r.jobs + r.races, 6) : 0
        };

        const scores = {};
        BEHAVIOURS.forEach(b => {
            scores[b] = Math.round(Math.min(1, LIFETIME_WEIGHT * lifetime[b] + RECENT_WEIGHT * recent[b]) * 100) / 100;
        });

        const activity = activityOf(p);
        const tendencies = BEHAVIOURS
            .filter(b => scores[b] >= TENDENCY_MIN)
            .map(b => ({ name: b, score: scores[b] }))
            .sort((a, b) => b.score - a.score);

        const activeFamilies = (p.jobs > 0 ? 1 : 0) + (p.racesEntered > 0 ? 1 : 0) + (crimeUnits > 0 ? 1 : 0);
        // "law_abiding" only describes a clean record, so it never competes with an activity.
        const activeT = tendencies.filter(t => t.name !== "law_abiding");
        const tendencyFamilies = new Set(activeT.map(t => FAMILY[t.name])).size;
        const rival = activeT.length ? activeT.find(t => FAMILY[t.name] !== FAMILY[activeT[0].name]) : null;
        const noClearLeader = !!rival && (activeT[0].score - rival.score) <= 0.1;

        let state = "undetermined";
        if (tendencyFamilies >= 3 || noClearLeader ||
            (tendencies.length === 0 && activity >= MIXED_ACTIVITY && activeFamilies >= 2)) {
            state = "mixed";
        } else if (tendencies.length >= 1) {
            state = "determined";
        }
        // Too little data: no clear tendency and not enough activity yet.
        if (activity < MIN_ACTIVITY && tendencies.length === 0) state = "undetermined";

        return {
            state: state,
            activity: activity,
            scores: scores,
            tendencies: tendencies,
            dominant: tendencies.length ? tendencies[0].name : null,
            secondary: tendencies.length > 1 ? tendencies[1].name : null
        };
    }

    // ---------------- personality summary ----------------
    const OPENERS = {
        professional_driver: ["a hardworking driver", "a dependable wheelman for hire", "a tireless professional driver"],
        criminal: ["a notorious troublemaker", "a one-person crime wave", "a career criminal in the making"],
        aggressive: ["a hothead with quick fists", "a walking bar fight"],
        competitive: ["a competitive street racer", "a street racer with something to prove"],
        wealthy: ["a high roller", "a player with deep pockets"],
        reckless_driver: ["a reckless driver", "a driver who treated traffic laws as optional suggestions"],
        law_abiding: ["a model citizen", "a suspiciously well-behaved resident"],
        mixed: ["a mixed character", "a hard-to-pin-down character"]
    };

    const TAGS = {
        professional_driver: ["Honest work: a bold strategy in this city.", "Your meter was always running."],
        criminal: ["Crime may not pay, but you kept collecting.", "The city's insurance companies know your name."],
        aggressive: ["Conflict resolution is clearly not your strong suit.", "Your fists did most of the talking."],
        competitive: ["Second place is just the first loser, right?", "The tyres never stood a chance."],
        wealthy: ["Money looks good on you.", "Somebody is clearly doing something right."],
        reckless_driver: ["The brake pedal was apparently decorative.", "Bumpers everywhere remember you."],
        law_abiding: ["Boring? Maybe. Employable? Absolutely.", "A rare breed in this city."],
        mixed: ["A little of everything, a master of... well, we'll see.", "Hard to pin down, even harder to predict."]
    };

    function jobsPhrase(p) {
        const parts = [];
        if (p.taxiJobs > 0) parts.push(plural(p.taxiJobs, "taxi job"));
        if (p.truckJobs > 0) parts.push(plural(p.truckJobs, "truck job"));
        return listJoin(parts);
    }

    function crimeParts(p) {
        const parts = [];
        if (p.crimes.carSteal > 0) parts.push(plural(p.crimes.carSteal, "car theft"));
        if (p.crimes.hitRun > 0) parts.push(plural(p.crimes.hitRun, "hit-and-run"));
        if (p.crimes.assault > 0) parts.push(plural(p.crimes.assault, "assault"));
        return parts;
    }

    function arrestPhrase(p) {
        return p.arrests === 1 ? "once" : p.arrests + " times";
    }

    // One factual sentence for a given behaviour, built only from real data.
    function factsFor(b, p) {
        switch (b) {
            case "professional_driver": {
                return "You completed " + jobsPhrase(p) + ".";
            }
            case "criminal": {
                const parts = crimeParts(p);
                if (parts.length && p.arrests > 0) return "You racked up " + listJoin(parts) + " and got arrested " + arrestPhrase(p) + ".";
                if (parts.length) return "You racked up " + listJoin(parts) + ".";
                if (p.arrests > 0) return "You got arrested " + arrestPhrase(p) + ".";
                return "You made a habit of dodgy dealings.";
            }
            case "aggressive":
                return "You were reported for " + plural(p.crimes.assault, "assault") + ".";
            case "competitive": {
                if (p.racesWon > 0) {
                    return "You won " + plural(p.racesWon, "race") +
                        (p.racesLost > 0 ? " and lost " + p.racesLost : "") +
                        (p.raceEarnings > 0 ? ", pocketing " + money(p.raceEarnings) + " in prize money" : "") + ".";
                }
                return "You entered " + plural(p.racesEntered, "race") + " without a win yet.";
            }
            case "wealthy":
                return "You were holding " + money(p.money) +
                    (p.carsOwned > 0 ? " and owned " + plural(p.carsOwned, "vehicle") +
                        (p.vehicleValue > 0 ? " worth about " + money(p.vehicleValue) : "") : "") + ".";
            case "reckless_driver":
                return "You left " + plural(p.crimes.hitRun, "hit-and-run scene") + " behind you.";
            case "law_abiding": {
                const parts = [];
                if (p.jobs > 0) parts.push(jobsPhrase(p));
                if (p.racesEntered > 0) parts.push(plural(p.racesEntered, "race"));
                return "You put in " + listJoin(parts) + " and kept things legal.";
            }
        }
        return "";
    }

    function mixedFacts(p) {
        const parts = [];
        if (p.taxiJobs > 0 && p.truckJobs > 0) parts.push("worked as a taxi and truck driver");
        else if (p.taxiJobs > 0) parts.push("worked as a taxi driver");
        else if (p.truckJobs > 0) parts.push("hauled cargo");
        if (p.racesEntered > 0) parts.push("took part in street races");
        const trouble = p.crimes.total + p.arrests + p.blackMarketSales;
        if (trouble > 0) parts.push(trouble >= 6 ? "got into plenty of trouble" : "occasionally got into trouble");
        return parts.length ? "You " + listJoin(parts) + "." : "";
    }

    function closerFor(p, activity, mixed) {
        const trouble = p.crimes.total + p.arrests + p.blackMarketSales;
        if (p.arrests >= 3) return "The police certainly know your face.";
        if (p.arrests >= 1) return "The police have your photo on file.";
        if (p.escapes >= 3) return "You outran the cops " + p.escapes + " times and they're still bitter about it.";
        if (!mixed && trouble <= 2 && activity >= MIXED_ACTIVITY) return "You rarely got into trouble with the police.";
        return "";
    }

    function generateSummary(p, a) {
        const seed = hash([p.taxiJobs, p.truckJobs, p.crimes.total, p.arrests, p.escapes,
            p.racesWon, p.racesLost, p.carsPurchased, p.blackMarketSales].join("|"));

        if (a.state === "undetermined") {
            const bits = [];
            if (p.jobs > 0) bits.push(jobsPhrase(p));
            if (p.racesEntered > 0) bits.push(plural(p.racesEntered, "race"));
            if (p.crimes.total > 0) bits.push(plural(p.crimes.total, "crime"));
            if (p.arrests > 0) bits.push(plural(p.arrests, "arrest"));

            if (!bits.length) {
                return "You're a blank slate. There isn't enough history yet to say whether you're a saint or a menace. " +
                    "Go drive somewhere and let the city decide.";
            }
            return "Early days. So far you've logged " + listJoin(bits) +
                ", which isn't enough to say what kind of player you are. Keep going and the city will make up its mind.";
        }

        let text;
        let lead = "mixed";
        if (a.state === "mixed") {
            text = "You were " + pick(OPENERS.mixed, seed) + ". " + mixedFacts(p);
        } else {
            // "law_abiding" only describes a clean record, so it leads only when nothing
            // else applies; otherwise the closing police line already says it.
            const names = a.tendencies.map(t => t.name);
            const active = names.filter(n => n !== "law_abiding");
            const pool = active.length ? active : names;
            lead = pool[0];
            text = "You were " + pick(OPENERS[lead], seed) + ". " + factsFor(lead, p);
            // a second sentence only for a DIFFERENT kind of behaviour (same family = already covered)
            const other = pool.find(n => FAMILY[n] !== FAMILY[lead]);
            if (other) {
                const extra = factsFor(other, p);
                if (extra) text += " " + extra;
            }
        }

        const closer = closerFor(p, a.activity, a.state === "mixed");
        if (closer) text += " " + closer;

        if (TAGS[lead] && seed % 3 !== 0) text += " " + pick(TAGS[lead], seed, 1);

        return text.replace(/\s+/g, " ").trim();
    }

    // ---------------- console report ----------------
    function printHistory(p, a, summary) {
        console.log("=== YOUR STREETBOUND HISTORY ===");
        console.log("Previous sessions recorded: " + p.sessions);
        console.log("--- Statistics ---");
        console.log("Taxi jobs completed: " + p.taxiJobs);
        console.log("Truck jobs completed: " + p.truckJobs);
        console.log("Crimes: " + p.crimes.total + " (hit-and-run " + p.crimes.hitRun +
            ", car theft " + p.crimes.carSteal + ", assault " + p.crimes.assault + ")");
        console.log("Arrests: " + p.arrests + " | Police escapes: " + p.escapes);
        console.log("Races: " + p.racesWon + " won, " + p.racesLost + " lost" +
            (p.raceEarnings > 0 ? " | Prize money: " + money(p.raceEarnings) : ""));
        console.log("Vehicles owned: " + p.carsOwned + " (purchased " + p.carsPurchased +
            ", value " + money(p.vehicleValue) + ") | Black-market sales: " + p.blackMarketSales);
        console.log("Current money: " + money(p.money));
        console.log("Recent events remembered: " + p.recentEventCount + "/" + MAX_EVENTS);
        if (p.sessions === 0) {
            console.log("(Counters for truck jobs, lifetime crimes, arrests, escapes, races, purchases and " +
                "black-market sales start from the first launch with this history system.)");
        }

        console.log("--- Behavioural tendencies ---");
        if (a.state === "undetermined") {
            console.log("undetermined (not enough data yet, activity " + a.activity + "/" + MIN_ACTIVITY + ")");
        } else if (!a.tendencies.length) {
            console.log("mixed (no single dominant behaviour)");
        } else {
            a.tendencies.forEach(t => {
                console.log(t.name + ": " + Math.round(t.score * 100) + "%");
            });
            if (a.state === "mixed") console.log("overall: mixed");
        }
        console.log("All scores: " + BEHAVIOURS.map(b => b + " " + Math.round(a.scores[b] * 100) + "%").join(", "));

        console.log("--- Summary ---");
        console.log(summary);

        if (store.events.length) {
            console.log("--- Latest events ---");
            store.events.slice(-5).forEach(e => {
                console.log(new Date(e.t).toISOString() + "  " + e.type + (e.d ? " " + JSON.stringify(e.d) : ""));
            });
        }
        console.log("================================");
    }

    // ---------------- B. recent event memory ----------------
    const lastEventAt = {};
    let dirty = false;                    // set when the store changed and needs saving

    // Returns true if the event was recorded. Dedupe: same type+detail inside the window is ignored.
    function recordEvent(type, detail, opts) {
        opts = opts || {};
        const now = Date.now();

        if (!opts.noDedupe) {
            const key = type + "|" + (detail ? JSON.stringify(detail) : "");
            const gap = opts.minGapMs || DEFAULT_DEDUPE_MS;
            if (lastEventAt[key] && now - lastEventAt[key] < gap) return false;
            lastEventAt[key] = now;
        }

        store.events.push({ type: type, t: now, h: inGameHour(), s: store.sessions, d: detail || null });
        if (store.events.length > MAX_EVENTS) store.events = store.events.slice(-MAX_EVENTS);
        dirty = true;
        return true;
    }

    // ---------------- state watcher (every POLL_MS, never per frame) ----------------
    const last = {
        ready: false,
        taxi: 0, money: null, truckStage: 0,
        crimes: { hitRun: null, carSteal: null, assault: null },
        arrested: false, chasing: false, chaseStart: 0, lastArrestAt: 0,
        raceState: null, carIds: null, bmReady: false, bmKey: null
    };

    function establishBaseline() {
        last.taxi = (typeof player !== "undefined" && player) ? num(player.taxiMissionsCompleted) : 0;
        last.money = readMoney();
        last.truckStage = (typeof truckManager !== "undefined" && truckManager && truckManager.isJobActive) ? truckManager.stage : 0;
        last.crimes = readCrimeCounts();
        last.arrested = !!(typeof player !== "undefined" && player && player.isBeingArrested);
        last.chasing = !!(typeof player !== "undefined" && player && player.beingChased);
        last.chaseStart = Date.now();
        last.raceState = (window.raceEventManager && window.raceEventManager.state) || null;
        last.carIds = new Set(readOwnedCars().map(c => String(c.id)));
        const bm = (typeof blackMarketZone !== "undefined" && blackMarketZone && Array.isArray(blackMarketZone.soldTimes)) ? blackMarketZone : null;
        last.bmReady = !!bm;
        last.bmKey = (bm && bm.soldTimes.length) ? bm.soldTimes[bm.soldTimes.length - 1] : null;
        last.ready = true;
    }

    function watchTaxi() {
        if (typeof player === "undefined" || !player) return;
        const cur = num(player.taxiMissionsCompleted);
        for (let i = 0; i < Math.min(3, cur - last.taxi); i++) {
            recordEvent("taxi_job", null, { noDedupe: true });
        }
        last.taxi = cur;
    }

    function watchTruck() {
        if (typeof truckManager === "undefined" || !truckManager) return;
        const stage = truckManager.isJobActive ? truckManager.stage : 0;
        const now = readMoney();

        // Finished from the return stage with a pay-out (a failed job pays a penalty instead).
        if (last.truckStage === 3 && stage === 0 && now !== null && last.money !== null && now > last.money) {
            if (recordEvent("truck_job", null)) store.counters.truckJobs++;
        }
        last.truckStage = stage;
    }

    function watchCrimes() {
        const cur = readCrimeCounts();
        const map = [
            ["hitRun", "crime_hit_run"],
            ["carSteal", "crime_car_steal"],
            ["assault", "crime_assault"]
        ];
        map.forEach(([key, type]) => {
            if (cur[key] === null) return;
            if (last.crimes[key] !== null && cur[key] > last.crimes[key]) {
                const delta = Math.min(10, cur[key] - last.crimes[key]);
                for (let i = 0; i < delta; i++) {
                    if (recordEvent(type, null, { noDedupe: true })) store.counters[key]++;
                }
            }
            last.crimes[key] = cur[key];     // also follows the reset to 0 after an arrest
        });
    }

    function watchArrestAndChase() {
        if (typeof player === "undefined" || !player) return;
        const now = Date.now();
        const arrested = !!player.isBeingArrested;
        const chasing = !!player.beingChased;

        if (arrested && !last.arrested) {
            const cc = readCrimeCounts();
            const charges = (cc.hitRun || 0) + (cc.carSteal || 0) + (cc.assault || 0);
            if (recordEvent("arrest", { charges: charges })) store.counters.arrests++;
            last.lastArrestAt = now;
        }
        last.arrested = arrested;

        if (chasing && !last.chasing) last.chaseStart = now;

        if (!chasing && last.chasing) {
            const surrendered = (typeof isPlayerSurrendered !== "undefined") && !!isPlayerSurrendered;
            const wasChaseLongEnough = now - last.chaseStart >= ESCAPE_MIN_CHASE_MS;
            const justArrested = arrested || (now - last.lastArrestAt < 5000);

            if (wasChaseLongEnough && player.wanted === true && !surrendered && !justArrested) {
                if (recordEvent("police_escape", null, { minGapMs: ESCAPE_MIN_GAP_MS })) store.counters.escapes++;
            }
        }
        last.chasing = chasing;
    }

    function watchRace() {
        const rm = window.raceEventManager;
        if (!rm) return;
        const st = rm.state || null;

        if (last.raceState === null) { last.raceState = st; return; }

        if (st === "FINISHED" && last.raceState !== "FINISHED") {
            const place = Number(rm.playerPlace);
            const prize = num(rm.playerPrize);
            const won = Number.isFinite(place) && place === 1;
            const d = { place: Number.isFinite(place) && place >= 1 ? place : null, prize: prize };

            if (recordEvent(won ? "race_won" : "race_lost", d)) {
                if (won) store.counters.racesWon++; else store.counters.racesLost++;
                store.counters.raceEarnings += prize;
            }
        }
        last.raceState = st;
    }

    function watchPurchases() {
        if (!last.carIds) return;
        readOwnedCars().forEach(car => {
            const id = String(car.id);
            if (last.carIds.has(id)) return;
            last.carIds.add(id);
            const price = carValue(car.type);
            if (recordEvent("vehicle_purchase", { type: car.type, price: price }, { noDedupe: true })) {
                store.counters.carsPurchased++;
                store.counters.carSpend += price;
            }
        });
    }

    function watchBlackMarket() {
        const bm = (typeof blackMarketZone !== "undefined" && blackMarketZone && Array.isArray(blackMarketZone.soldTimes)) ? blackMarketZone : null;
        if (!bm) return;
        const key = bm.soldTimes.length ? bm.soldTimes[bm.soldTimes.length - 1] : null;

        // A sale pushes a new newest timestamp; pruning only removes old ones.
        if (last.bmReady && key !== null && key !== last.bmKey) {
            if (recordEvent("black_market_sale", null)) store.counters.blackMarketSales++;
        }
        last.bmReady = true;
        last.bmKey = key;
    }

    let watcherWarned = false;

    function poll() {
        if (!last.ready) {
            try { establishBaseline(); } catch (e) { return; }
        }

        [watchTaxi, watchTruck, watchCrimes, watchArrestAndChase,
         watchRace, watchPurchases, watchBlackMarket].forEach(fn => {
            try {
                fn();
            } catch (e) {
                if (!watcherWarned) { watcherWarned = true; console.warn("[History] watcher skipped:", e); }
            }
        });

        last.money = readMoney();

        if (dirty) { dirty = false; saveStore(); }
    }

    // ---------------- start-up ----------------
    let started = false;

    function start() {
        if (started) return;
        started = true;

        try {
            // 1. saved data is loaded by now (window "load" has fired and all scripts ran)
            if (loadStore()) seedFromExistingSave();

            // 2-4. read previous history, analyse it, print it
            const profile = getProfile();
            const analysis = analyse(profile);
            const summary = generateSummary(profile, analysis);
            printHistory(profile, analysis, summary);

            // this launch is now part of history
            store.sessions += 1;
            saveStore();
        } catch (e) {
            console.warn("[History] could not build the history summary:", e);
        }

        setInterval(poll, POLL_MS);
    }

    if (document.readyState === "complete") {
        setTimeout(start, 0);
    } else {
        window.addEventListener("load", () => setTimeout(start, 0));
    }

    // Read-only API for the future Story Director.
    window.StreetBoundHistory = {
        KEY: HISTORY_KEY,
        getProfile: getProfile,
        analyse: analyse,
        generateSummary: generateSummary,
        getRecentEvents: () => store.events.slice(),
        recordEvent: (type, detail) => { const ok = recordEvent(String(type), detail || null); if (ok) saveStore(); return ok; },
        printSummary: () => {
            const p = getProfile();
            const a = analyse(p);
            printHistory(p, a, generateSummary(p, a));
        }
    };
})();
