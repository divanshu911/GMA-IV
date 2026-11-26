console.log("streetbound-storyline19-sandbox-reusable-cinematics");
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

