console.log("streetbound-storyline16-police-briefing");
// ===== OPENING CUTSCENE & STORYLINE =====

// ============================================================
// FIRST-PLAY OPENING CUTSCENE
// ============================================================

let openingCutsceneActive = false;

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
// ============================================================
// STORY OPENING CUTSCENE
// Replaces the old text-only intro. Same entry points
// (startOpeningCutscene / finishOpeningCutscene), same overlay,
// same title card. The scene runs on a frame-driven timeline
// (updateOpeningCutscene is called from updateGame), so there are
// no setTimeout chains that could outlive the cutscene.
// ============================================================

const STORY_INTRO_KEY = "streetbound_story_intro_v1";
const STORY_DEBT_KEY = "streetbound_story_debt_v1";
const STORY_DEBT_AMOUNT = 5000;
const STORY_DEBT_DAYS = 10;

let storyIntro = null;          // all cutscene-only state lives here
let openingFinishTimer = null;  // the single post-title fade timer

function hasSeenStoryIntro() {
    try {
        return localStorage.getItem(STORY_INTRO_KEY) !== null;
    } catch (e) {
        return false;
    }
}

function storyWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// Persistent story data, ready for a future debt / countdown feature.
// (No HUD, countdown or payment logic exists yet.)
function storyWriteDebt(issuedAtGameHour) {
    // Never overwrite: a replayed opening or a reload must not restart the debt.
    try {
        if (localStorage.getItem(STORY_DEBT_KEY) !== null) return;
    } catch (e) {}
    storyWrite(STORY_DEBT_KEY, {
        creditor: "mafia",
        amount: STORY_DEBT_AMOUNT,
        deadlineDays: STORY_DEBT_DAYS,
        issuedAt: Date.now(),
        issuedAtGameHour: issuedAtGameHour,
        amountPaid: 0,
        status: "active"
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
function storyAt(t, fn) { storyIntro.events.push({ t: t, fn: fn }); }

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
    if (typeof storySyndicateResyncClock === "function") storySyndicateResyncClock();
    if (typeof updateDayNight === "function") updateDayNight(0);
}

// ============================================================
// START
// ============================================================
function startOpeningCutscene() {
    if (!openingCutscene) {
        gameActive = true;
        return;
    }

    // The cutscene can never start twice.
    if (openingCutsceneActive || storyIntro) return;

    if (openingFinishTimer) {
        clearTimeout(openingFinishTimer);
        openingFinishTimer = null;
    }

    // Make sure the normal world exists before it is set aside.
    if (typeof initSpawns === "function") initSpawns();

    openingCutsceneActive = true;
    gameActive = false;
    showFullMap = false;
    fullMapAnimating = false;
    playerPhoneOpen = false;
    if (typeof closePlayerPhone === "function") closePlayerPhone();

    const s = storyIntro = {
        t: 0,
        events: [],
        next: 0,
        nextId: 1,
        e: {},                 // scene entities
        blasts: [],
        scene: "road",
        cam: { x: 0, y: 0 },
        camTarget: null,
        pBase: { x: 0, y: 0 }, // player centre while in the house
        pMove: null,
        tremble: false,
        drift: null,
        taxiT0: 0,
        dayNightClock: 0,
        fireAudio: null,
        snap: {
            cars: cars,
            npcs: npcs,
            angryDrivers: angryDrivers,
            playerCar: playerCar,
            ispassenger: player.ispassenger
        }
    };

    // Marked as seen immediately, so a refresh mid-way never restarts it.
    // (gma_has_played keeps its existing meaning.)
    storyWrite(STORY_INTRO_KEY, { status: "started", startedAt: Date.now() });
    try { localStorage.setItem("gma_has_played", "true"); } catch (e) {}
    storyWriteDebt(7);

    // Cutscene-only world: normal traffic / pedestrians are set aside.
    cars = [];
    npcs = [];
    angryDrivers = [];
    playerCar = null;

    camera.angle = 0;
    camera.targetAngle = 0;
    player.ispassenger = true;      // hidden while staged outdoors
    player.isLyingDown = false;
    player.size = 20;
    player.speechText = null;

    document.getElementById("gameContainer").classList.add("opening-cutscene");
    openingCutscene.classList.add("active");
    void openingCutscene.offsetWidth;
    openingCutscene.classList.add("story-live");   // fades in from black
    storyClearText();

    storySetTime(22.5);                             // night, building lights on
    storyBuildTimeline(s);
    s.events.sort((a, b) => a.t - b.t);

    if (typeof resizeCanvas === "function") resizeCanvas();
    storyTick(s, 0);
    if (typeof drawGame === "function") drawGame();
}

// ============================================================
// TIMELINE (seconds of cutscene time)
// ============================================================
function storyBuildTimeline(s) {
    const e = s.e;

    // ---- road geometry (checked against CollisionMap2.png) ----------
    // East-west boulevard, road pixels y 540..596, clear between the
    // cross streets at x~2370 and x~2720.
    const NORTH_Y = 556, SOUTH_Y = 580;
    const BOX_X = 2575, BOX_Y = 556;
    // Taxi starts further east so the player sees it approach the box.
    const TAXI_X0 = 3450;
    const TAXI_PPS = 198;                       // taxi speed in px per second
    const HIT_X = BOX_X + 24;                   // taxi front (14) touches the box (9)
    const TAXI_SPAWN_T = 19.5;
    const HIT_T = TAXI_SPAWN_T + (TAXI_X0 - HIT_X) / TAXI_PPS;   // impact moment
    s.taxiX0 = TAXI_X0;
    s.taxiPPS = TAXI_PPS;

    // ---- SUV + crew (hidden inside via isPassenger) ------------------
    const suv = new Car(70001, 2090, SOUTH_Y, "#0b0b0d", false, "Ranger, SUV");
    suv.angle = Math.PI / 2;            // facing east
    suv.isParked = false;
    suv.hasDriver = true;
    suv.speed = 0;
    cars.push(suv);
    e.suv = suv;

    const crewLook = [
        ["#1b1b1f", "#1d1d1d", "#e0ac69"],
        ["#2c2c34", "#2d3436", "#c68642"],
        ["#1b1b1f", "#4a3728", "#ffdbac"],
        ["#3a1f1f", "#1d1d1d", "#8d5524"]
    ];
    e.crew = crewLook.map(l => {
        const n = storyNpc(s, suv.x, suv.y, l[0], l[1], l[2], Math.PI / 2);
        n.isPassenger = true;           // hidden inside the SUV (existing flag)
        return n;
    });

    // ---- rival gang (spawned later so the SUV gets a proper approach) ----
    const rivalSpots = [[2668, 550], [2656, 561], [2670, 572], [2656, 583], [2668, 591]];
    const redShirts = ["#c0392b", "#d35400", "#c0392b", "#a93226", "#d35400"];
    const skins = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
    e.rivals = [];

    e.box = { x: BOX_X, y: BOX_Y, exploded: false };

    // ---- camera: follow the SUV while it drives in --------------------
    s.cam.x = suv.x + 90;
    s.cam.y = 566;
    s.camTarget = () => ({ x: e.suv.x + 90, y: 566 });
    window.sbCutsceneZoom = 1.2;

    // Rivals materialise once the SUV is nearly on them.
    storyAt(3.6, () => {
        e.rivals = rivalSpots.map((p, i) =>
            storyNpc(s, p[0], p[1], redShirts[i], i % 2 ? "#f39c12" : "#d35400", skins[i], -Math.PI / 2)
        );
        window.sbCutsceneZoom = 1.35;
    });

    // ---- scene 1: ambush --------------------------------------------
    storyAt(4.0, () => {
        e.rivals.forEach(n => { n.aimHold = true; });
        storySay(e.rivals[2], "Hold it right there!", 1.6);
        s.camTarget = () => ({ x: 2590, y: 566 });
    });

    // rivals open fire on the SUV's tyres while it is braking
    [4.9, 5.05, 5.2, 5.35, 5.5].forEach((t, i) => {
        storyAt(t, () => {
            if (!e.rivals[i]) return;
            storyFire(e.rivals[i], e.suv.x + 10, e.suv.y + (Math.random() * 8 - 4), { hitCar: e.suv });
        });
    });

    // SUV crew bails out and returns fire
    storyAt(6.2, () => {
        const spots = [[2522, 566], [2500, 566], [2512, 594], [2538, 576]];
        e.crew.forEach((n, i) => {
            n.isPassenger = false;
            n.x = spots[i][0];
            n.y = spots[i][1];
            n.angle = Math.PI / 2;
            n.aimHold = true;
        });
        storySay(e.crew[0], "Ambush!", 1.3);
    });
    storyAt(6.7, () => storySay(e.crew[1], "Get down!", 1.2));

    // rivals keep firing (and missing) until they are down
    for (let t = 6.3; t < 10.7; t += 0.5) {
        storyAt(t, () => {
            const r = storyAlive(e.rivals), c = storyAlive(e.crew);
            if (!r.length || !c.length) return;
            const tgt = storyPick(c);
            storyFire(storyPick(r), tgt.x, tgt.y + 26, { spread: (Math.random() - 0.5) * 0.12 });
        });
    }

    // crew fires back: filler shots (aimed to miss) ...
    for (let t = 6.9; t < 10.8; t += 0.42) {
        storyAt(t, () => {
            const r = storyAlive(e.rivals), c = storyAlive(e.crew);
            if (!r.length || !c.length) return;
            const tgt = storyPick(r);
            storyFire(storyPick(c), tgt.x, tgt.y - 24, {});
        });
    }
    // ... plus the shots that bring each rival down
    [[7.4, 0, 0], [8.2, 1, 1], [9.0, 2, 2], [9.8, 3, 3], [10.6, 4, 0]].forEach(k => {
        storyAt(k[0], () => {
            const tgt = e.rivals[k[1]];
            if (!tgt) return;
            storyFire(e.crew[k[2]], tgt.x, tgt.y, { kill: tgt });
        });
    });

    storyAt(11.3, () => { e.crew.forEach(n => { n.aimHold = false; }); });
    storyAt(11.6, () => storySay(e.crew[0], "That's all of them.", 1.7));
    storyAt(13.4, () => storySay(e.crew[1], "Tyres are shot.", 1.3));
    storyAt(14.7, () => storySay(e.crew[1], "Leave the car!", 1.3));
    storyAt(16.0, () => storySay(e.crew[0], "Don't touch that box!", 1.6));
    storyAt(17.5, () => storySay(e.crew[2], "It's full of explosives!", 1.6));

    // crew walks off along the north kerb, away from the SUV
    storyAt(18.8, () => {
        e.crew.forEach((n, i) => {
            storyWalk(n, [[n.x - 12, 551], [2250 - i * 18, 551]], 1.35 + i * 0.05);
        });
    });

    // ---- scene 2: the taxi (black transition, then follow the approach) --
    // Fade to black while the crew is leaving, set the taxi up off-screen,
    // then reveal and let the camera track the taxi as it drives in.
    storyAt(19.2, () => storyBlack(true));
    storyAt(TAXI_SPAWN_T, () => {
        // Clear leftover road NPCs so only the taxi sequence is visible.
        e.crew.forEach(n => storyRemoveNpc(n));
        e.rivals.forEach(n => storyRemoveNpc(n));
        e.rivals = [];
        e.crew = [];

        const taxi = new Car(70002, TAXI_X0, NORTH_Y, "#f1c40f");
        taxi.type = "sedan";
        taxi.ownerType = "taxiDepot";
        taxi.width = 16;
        taxi.length = 28;
        taxi.isTaxi = true;
        taxi.isParked = false;
        taxi.hasDriver = true;
        taxi.angle = -Math.PI / 2;      // facing west
        taxi.speed = 3.3;
        cars.push(taxi);
        e.taxi = taxi;
        s.taxiT0 = TAXI_SPAWN_T;     // fixed, so impact time matches the geometry exactly
        window.sbCutsceneZoom = 1.3;
        // Camera will follow the taxi once the blackout lifts.
        s.camTarget = () => ({
            x: e.taxi ? e.taxi.x - 40 : 2570,
            y: 566
        });
        // Seed camera near the taxi so the lerp doesn't start from the old ambush point.
        if (e.taxi) {
            s.cam.x = e.taxi.x - 40;
            s.cam.y = 566;
        }
    });
    storyAt(20.0, () => storyBlack(false));
    storyAt(20.4, () => storySay(player, "Finally... home.", 1.6));
    storyAt(HIT_T - 1.0, () => storySay(player, "Huh? What's that box?", 0.9));

    // impact: the taxi clips the box, the box goes off, the taxi drifts away
    storyAt(HIT_T, () => {
        e.box.exploded = true;
        s.drift = { t0: s.t, turnSouth: false };
        spawnExplosionDebris(BOX_X, BOX_Y, 20);
        playSpatialSound(explosionPool, player.x, player.y, 1.0, 900);
        if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(3.4, -1, 0);
        s.blasts.push({ x: BOX_X, y: BOX_Y, age: 0, life: 40, r: 55 });
        window.sbCutsceneZoom = 1.45;
        storySay(player, "WHOOOA!!", 1.2);
    });
    // chain reaction: the SUV blows up behind the escaping taxi
    storyAt(HIT_T + 0.4, () => {
        if (e.suv) storyExplode(s, e.suv, 34, 7);
        try {
            s.fireAudio = new Audio(fireUrl);
            s.fireAudio.loop = true;
            s.fireAudio.volume = 0.45;
            s.fireAudio.play().catch(() => {});
        } catch (err) {
            s.fireAudio = null;
        }
    });
    storyAt(HIT_T + 1.2, () => {
        storySay(player, "Not stopping!", 1.3);
        window.sbCutsceneZoom = 1.3;
        s.camTarget = () => (e.taxi
            ? { x: e.taxi.x, y: Math.min(e.taxi.y + 30, 800) }
            : { x: 2570, y: 566 });
    });
    // Let the taxi drive home for a while, then a slow fade with a title.
    const BLK = HIT_T + 7.0;
    storyAt(BLK, () => storyBlackSlow(true));
    storyAt(BLK + 1.2, () => openingShowText("The next day", "subtitle"));

    // ---- scene 3: next morning, inside the real house --------------------
    const R = BLK + 4.6;                                 // reveal time of the house scene
    const H = (rel) => R + rel;
    const HW = () => (houseMapWidth > 0 ? houseMapWidth : 696);
    const HH = () => (houseMapHeight > 0 ? houseMapHeight : 696);
    const CX = () => HW() / 2;
    const BED = () => ({ x: CX() + 4, y: 284 });    // centre of the bed sprite
    const HELD = () => ({ x: CX(), y: 372 });       // where he is held
    const FLOOR = () => ({ x: CX(), y: 392 });      // where he lies afterwards
    const ENTRY_Y = () => HH() - 46;                // just below the door mat

    storyAt(BLK + 2.6, () => {
        // Everything below happens while the screen is fully black.
        cars = [];
        npcs = [];
        policeBullets.length = 0;
        debrisParticles.length = 0;
        tyreMarks.length = 0;
        if (s.fireAudio) { try { s.fireAudio.pause(); } catch (err) {} s.fireAudio = null; }
        s.blasts.length = 0;
        e.suv = null; e.taxi = null; e.box = null; s.drift = null;

        s.scene = "house";
        s.camTarget = null;
        isInsideHouse = true;
        outsideX = homeZone.x;
        outsideY = homeZone.y;
        player.size = 45;
        player.ispassenger = false;
        // Standing near the bed until the thugs arrive — not drawn laid down yet.
        player.isLyingDown = false;
        player.angle = Math.PI;        // facing the doorway
        player.speechText = null;
        player.speechTimer = 0;
        const b = BED();
        s.pBase.x = b.x;
        s.pBase.y = b.y + 28;          // just in front of the bed
        window.sbCutsceneZoom = 1.15;
        storySetTime(7);               // morning

        // The visitors. Created now, but they only join the scene on entry.
        // Match player size so they read at the same scale in the house.
        e.thugs = [
            storyNpc(s, 0, 0, "#1b1b1f", "#1d1d1d", "#e0ac69", 0),
            storyNpc(s, 0, 0, "#2c2c34", "#2d3436", "#c68642", 0),
            storyNpc(s, 0, 0, "#3a1f1f", "#4a3728", "#8d5524", 0)
        ];
        // Mafia boss — wealthy, intimidating appearance
e.boss = storyNpc(
    s, 0, 0,
    "#17191f",   // charcoal-black suit
    "#aeb4bd",   // silver-grey hair
    "#d7a078",   // skin
    0
);

e.thugs.forEach(n => { n.size = 45; });

e.boss.size = 49;
e.boss.isStoryBoss = true;
e.boss.cutsceneArmed = false;
        e.gang = e.thugs.concat([e.boss]);
        e.gang.forEach(n => storyRemoveNpc(n));
    });
    storyAt(BLK + 3.7, () => storyHideText());
    storyAt(BLK + 4.2, () => storyClearText());
    storyAt(R, () => storyBlackSlow(false));

    // gang members are created inside the house-setup event, so look them up lazily
    const enter = (get, rel, tx, ty) => storyAt(H(rel), () => {
        const n = get();
        n.x = n === e.boss ? CX() : (n === e.thugs[0] ? CX() - 22 : n === e.thugs[1] ? CX() + 22 : CX());
        n.y = ENTRY_Y();
        n.angle = 0;
        npcs.push(n);
        storyWalk(n, [[tx(), ty]], 1.6);
    });

    // Quiet beat while he stands near the bed (not drawn laid down).
    storyAt(H(0.0), () => storySay(player, "...", 1.8));

    enter(() => e.thugs[0], 2.4, () => CX() - 30, 380);
    enter(() => e.thugs[1], 2.7, () => CX() + 30, 380);
    enter(() => e.thugs[2], 3.0, () => CX() + 44, 440);
    enter(() => e.boss, 3.5, () => CX(), 430);

    const faceAll = () => e.gang.forEach(n => storyFace(n, s.pBase.x, s.pBase.y));

    // he notices the intruders
    storyAt(H(4.6), () => {
        player.isLyingDown = false;
        player.angle = Math.PI;
        s.pBase.x = CX();
        s.pBase.y = 318;
        storySay(player, "Huh...?!", 1.3);
        faceAll();
    });

    // they grab him and point a gun at his head
    storyAt(H(5.4), () => {
        const h = HELD();
        s.pMove = { fx: s.pBase.x, fy: s.pBase.y, tx: h.x, ty: h.y, t0: s.t, dur: 0.7 };
        s.tremble = true;
        e.thugs[0].aimHold = true;
        e.thugs[0].policeFiringTimer = 5;
        faceAll();
    });
    storyAt(H(6.2), () => faceAll());

    // ---- scene 4: the conversation -------------------------------------
    const say = (rel, who, text, sec) => storyAt(H(rel), () => storySay(who(), text, sec));
    const boss = () => e.boss;
    const me = () => player;

    say(6.6, boss, "What were you doing last night?", 2.4);
    say(9.1, me, "I... I was--", 1.1);
    say(10.4, boss, "Were you born without eyes?!", 2.0);
    say(12.5, boss, "Do you even know  you pig", 1.9);
    say(14.5, boss, " can't buy the car you blew up last night,", 2.2);
    say(16.8, boss, "even if you drive that junk taxi", 2.2);
    say(19.1, boss, "for your entire life!", 1.8);
    say(21.0, boss, "I bought it brand new for my wife!", 2.6);
    say(23.8, me, "Uhh... umm... I'm really sorry.", 2.3);
    say(26.2, me, "I couldn't control the taxi.", 2.0);
    say(28.3, me, "I couldn't see it, car suddenly came into my way...", 2.6);

    storyAt(H(31.0), () => storyFace(e.boss, e.thugs[0].x, e.thugs[0].y));
    say(31.1, boss, "Beat him up so badly", 1.8);
    say(33.0, boss, "that he sees everything in 4K", 2.2);
    say(35.3, boss, "for the rest of his lifetime!", 2.2);

    // the beating starts on screen, then cuts to black
    [37.7, 38.0, 38.3, 38.6, 38.9].forEach((rel, i) => {
        storyAt(H(rel), () => {
            storyPunch(e.thugs[i % 3]);
            if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(3, i % 2 ? 1 : -1, 0.4);
        });
    });
    storyAt(H(38.7), () => { s.tremble = false; storyBlack(true); });

    // black screen: impacts only
    [39.2, 39.5, 39.9, 40.3, 40.8, 41.2, 41.8, 42.1, 42.7].forEach((rel, i) => {
        storyAt(H(rel), () => storyThud(i % 3 === 0 ? 1.0 : 0.7));
    });
    storyAt(H(40.5), () => openingShowText("One minute later...", "subtitle"));
    storyAt(H(42.8), () => storyHideText());
    storyAt(H(43.3), () => storyClearText());

    // set up the aftermath while still black
    storyAt(H(43.0), () => {
        const f = FLOOR();
        s.pBase.x = f.x;
        s.pBase.y = f.y;
        s.pMove = null;
        player.isLyingDown = true;      // existing injured pose, via Player.draw
        player.speechText = null;
        player.speechTimer = 0;
        const spots = [[CX() - 52, 410], [CX() + 52, 410], [CX() + 40, 462]];
        e.thugs.forEach((n, i) => {
            n.x = spots[i][0];
            n.y = spots[i][1];
            n.aimHold = false;
            n.policeFiringTimer = 0;
            n.punchTimer = 0;
            n.path = null;
        });
        e.boss.x = CX();
        e.boss.y = 436;
        faceAll();
    });
    storyAt(H(43.4), () => storyBlack(false));

    say(43.6, boss, "Hey! Now stop.", 1.6);
    say(45.4, boss, "You don't have to kill him.", 2.4);

    // ---- scene 5: the debt -----------------------------------------------
    storyAt(H(48.2), () => storyFace(e.boss, s.pBase.x, s.pBase.y));
    say(48.3, boss, "Five thousand dollars!", 2.0);
    say(50.5, boss, "You have to pay me in 10 days!", 2.4);
    say(53.1, boss, "I don't care what you do.", 2.0);
    say(55.3, boss, "Do a job, become a thief,", 2.0);
    say(57.5, boss, "or start smuggling!", 1.8);
    say(59.5, boss, "Otherwise, you won't be able to", 2.2);
    say(61.9, boss, "drive, walk, or even move again!", 2.5);

    const leave = (get, rel, isLast) => storyAt(H(rel), () => {
        const n = get();
        n.aimHold = false;
        n.policeFiringTimer = 0;
        storyWalk(n, [[CX(), ENTRY_Y()]], 1.7, () => {
            storyRemoveNpc(n);
            if (isLast) {
                if (typeof carCrashPool !== "undefined") carCrashPool.play(0.8);   // door slam
                if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(4.5, 0, 1);
            }
        });
    });
    leave(() => e.boss, 64.8, false);
    leave(() => e.thugs[0], 65.3, false);
    leave(() => e.thugs[1], 65.7, false);
    leave(() => e.thugs[2], 66.2, true);

    // he stays on the floor for a moment, then speaks
    storyAt(H(70.0), () => storySay(player, "I have to do something...", 2.8));

    // ---- scene 6: title card (existing overlay / blackout / title style) ----
    storyAt(H(73.0), () => storyBlack(true));
    storyAt(H(74.0), () => openingShowText("STREETBOUND", "title"));
    storyAt(H(77.6), () => finishOpeningCutscene());

    // ---- cinematic introduction cards (see INTRODUCTION CARDS below) ----
    storyRegisterIntroductions(s, H);
}

// ============================================================
// INTRODUCTION CARDS
// Cinematic name cards (left side of the screen) for the Jackals, the
// Marino Syndicate, Victor Marino and Jake Miller.
//
//  * Triggers are real story states (watched every frame), not timers.
//    The only timer is a safety net for the fourth card (see below).
//  * While a card is active the cutscene is completely paused:
//    updateOpeningCutscene() returns before it advances s.t, fires events
//    or runs storyTick (NPCs, cars, bullets, debris, blasts, speech timers
//    and the clock all live there), so nothing can be skipped or repeated.
//  * The card's own animation and camera blend are driven from here.
//  * Zoom reuses the existing window.sbCutsceneZoom -> sbUpdateCameraFeedback
//    path. Pan: road scene = the existing "player parked on s.cam" trick;
//    house scene = a temporary window.sbCutsceneCamFocus (used in main.js).
//    Both are restored to exactly their original state afterwards.
// ============================================================
const STORY_CARD_ZOOM_FACTOR = 1.12;   // "slight" zoom-in while a card is up
const STORY_CARD_T_CAM_IN = 1.1;       // seconds: camera eases onto the focus
const STORY_CARD_T_FADE_IN0 = 0.3;     // card fade-in start
const STORY_CARD_T_FADE_IN1 = 1.0;     // card fully visible
const STORY_CARD_T_OUT0 = 5.5;         // extended: card fade-out + camera return start (was 3.5)
const STORY_CARD_T_FADE_OUT1 = 6.2;    // extended: card fully gone (was 4.2)
const STORY_CARD_T_CAM_OUT1 = 6.6;     // extended: camera back at its original place (was 4.6)
const STORY_CARD_T_MAX = 8.5; //hard cap

const STORY_CARD_DEFS = {
    jackals:   { name: "The Jackals", sub: "Rivals of the Syndicate" },
    syndicate: { name: "The Marino Syndicate", sub: "" },              // no subtitle given
    vic:       { name: "Victor Marino aka Vic", sub: "leader of The Syndicate" },
    jake:      { name: "Jake Miller", sub: "The protagonist, an ordinary man" }
};

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

// ---- registration (once per opening storyline) ---------------------
function storyRegisterIntroductions(s, H) {
    const e = s.e;
    const c = s.cards = {
        queue: [],
        seen: {},          // each card plays at most once
        active: null,
        watchers: [],
        jakeLineArmed: false
    };

    // 1) The Jackals: the first cutscene bullet fired by a rival at the SUV.
    c.watchers.push({
        key: "jackals",
        test: () => e.rivals && e.rivals.length > 0 &&
            policeBullets.some(b => b.cs && e.rivals.indexOf(b.owner) >= 0),
        focus: () => storyCentroid(e.rivals)
    });

    // 2) The Marino Syndicate: every rival is down (isInjured is set by the
    //    crew's kill bullets, the same flag the existing scene uses).
    c.watchers.push({
        key: "syndicate",
        test: () => e.rivals && e.rivals.length > 0 && e.rivals.every(n => n.isInjured),
        focus: () => storyCentroid(e.crew)
    });

    // 3) Victor Marino: the boss is in the house (in npcs) and his walk has
    //    finished (storyUpdateNpcs clears n.path on arrival).
    c.watchers.push({
        key: "vic",
        test: () => s.scene === "house" && e.boss && npcs.indexOf(e.boss) >= 0 && !e.boss.path,
        focus: () => e.boss ? { x: e.boss.x, y: e.boss.y } : null
    });

    // 4) Jake Miller: the protagonist's "I have to do something..." bubble is gone.
    //    Armed just after the line starts (H(70.0)).
    storyAt(H(70.05), () => { c.jakeLineArmed = true; });
    c.watchers.push({
        key: "jake",
        test: () => c.jakeLineArmed && !player.speechText,
        focus: () => ({ x: player.x + player.size / 2, y: player.y + player.size / 2 })
    });
    // Safety net only: if the bubble state never clears, still show the card
    // before the existing blackout at H(73.0). No-op when already triggered.
    storyAt(H(72.95), () => storyQueueIntro(s, "jake"));
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
        player.x = s.cam.x - player.size / 2;        // same parking storyTick uses
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
// PER-FRAME
// ============================================================
function updateOpeningCutscene(dt) {
    const s = storyIntro;
    if (!s || !openingCutsceneActive) return;

    try {
        // Introduction cards: while one is showing (or queued) the whole cutscene
        // world is frozen. Nothing below runs, so the timeline cannot advance.
        if (storyIntroCardsUpdate(s, dt)) return;

        s.t += dt / 60;

        while (storyIntro === s && s.next < s.events.length && s.events[s.next].t <= s.t) {
            s.events[s.next++].fn();
            // An event queued a card: leave any other due events for after the pause.
            if (storyIntroCardsPending(s)) break;
        }

        if (storyIntro === s) storyTick(s, dt);

        // Watch for the story states that trigger an introduction card.
        if (storyIntro === s) storyIntroCardsWatch(s);
    } catch (err) {
        // Never leave the player stuck in a broken cinematic.
        console.error("[Story intro] aborted:", err);
        finishOpeningCutscene();
    }
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

function storyTickTaxi(s, dt) {
    const t = s.e.taxi;
    if (!t) return;

    // Initial approach towards the explosive box.
    if (!s.drift) {
        const k = s.t - s.taxiT0;

        t.x = s.taxiX0 - s.taxiPPS * k;
        t.y = 556;
        t.angle = -Math.PI / 2;
        t.speed = 3.3;

        return;
    }

    const d = s.drift;
    const k = s.t - d.t0;

    // Preserve the existing handbrake drift away from the explosion.
    if (!d.turnSouth) {
        const u = Math.min(1, k / 0.7);
        const ease = u * u * (3 - 2 * u);

        t.angle = -Math.PI / 2 + Math.PI * ease;
        t.x += (1.0 + 2.0 * ease) * dt;
        t.y = Math.max(549, t.y - 0.5 * (1 - ease) * dt);
        t.speed = 3.2;

        if (u >= 1) {
            d.turnSouth = true;

            // Initialize the route after the drift is complete.
            d.homePath = null;
            d.homePathIndex = 0;
            d.pathRetry = 0;
        }

        addTyreMarks(t);
        return;
    }

    // -------------------------------------------------
    // A* ROUTE FROM THE EXPLOSION SCENE TO THE PLAYER'S
    // HOME. Prefer roads instead of driving through
    // buildings and obstacles.
    // -------------------------------------------------

    if (d.pathRetry === undefined) {
        d.pathRetry = 0;
    }

    if (d.pathRetry > 0) {
        d.pathRetry -= dt;
    }

    // Generate a route only when one is needed.
    if (!d.homePath && d.pathRetry <= 0) {
        if (
            typeof navigationSystem !== "undefined"
        ) {
            if (
                !navigationSystem.ready &&
                typeof navigationSystem.buildGrid === "function"
            ) {
                navigationSystem.buildGrid();
            }

            if (
                navigationSystem.ready &&
                typeof homeZone !== "undefined"
            ) {
                d.homePath = navigationSystem.findPath(
                    t.x,
                    t.y,
                    homeZone.x,
                    homeZone.y,
                    true
                );
            }
        }

        if (d.homePath && d.homePath.length > 0) {
            // Skip the starting waypoint if the route contains one.
            d.homePathIndex =
                d.homePath.length > 1 ? 1 : 0;
        } else {
            // Retry later if the navigation grid cannot find a route.
            d.homePath = null;
            d.pathRetry = 60;
        }
    }

    // -------------------------------------------------
    // FOLLOW THE A* WAYPOINTS
    // -------------------------------------------------

    // Safety net: never spend more than ~5 s chasing one waypoint.
    if (d.homePath) {
        if (d.wpSeen !== d.homePathIndex) {
            d.wpSeen = d.homePathIndex;
            d.wpFrames = 0;
        }
        d.wpFrames += dt;
        if (d.wpFrames > 300) {
            d.homePathIndex++;
            d.wpFrames = 0;
        }
    }

    if (
        d.homePath &&
        d.homePathIndex < d.homePath.length
    ) {
        const wp = d.homePath[d.homePathIndex];

        const dx = wp.x - t.x;
        const dy = wp.y - t.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 42) {
            d.homePathIndex++;
        } else {
            // Convert waypoint direction to the car's angle convention.
            const desiredAngle =
                Math.atan2(dy, dx) + Math.PI / 2;

            // Rotate smoothly instead of snapping the car's direction.
            let angleDifference = Math.atan2(
                Math.sin(desiredAngle - t.angle),
                Math.cos(desiredAngle - t.angle)
            );

            const maxTurn = 0.1 * dt;

            t.angle += Math.max(
                -maxTurn,
                Math.min(maxTurn, angleDifference)
            );

            // brake into sharp turns so the car never orbits a waypoint
            const speed = Math.abs(angleDifference) > 0.9 ? 1.6 : 3.0;
            t.speed = speed;

            // Move using the same angle convention as the existing taxi.
            t.x += Math.sin(t.angle) * speed * dt;
            t.y -= Math.cos(t.angle) * speed * dt;
        }
    } else {
        // The taxi has reached the end of its route.
        t.speed = 0;
    }

    addTyreMarks(t);
}

function storyTick(s, dt) {
    const e = s.e;

    camera.angle = 0;
    camera.targetAngle = 0;

    // scripted SUV: longer cruise, then brake into the ambush
    // SUV cruises for a few seconds, then brakes and stops
// safely before the explosive box.
if (e.suv && !e.suv.exploded) {
    let sp = 0;

    if (s.t < 3.4) {
        sp = 1.6;
    } else if (s.t < 5.6) {
        sp = 1.6 * (1 - (s.t - 3.4) / 2.2);
    }

    e.suv.speed = sp;
    e.suv.x += sp * dt;

    if (s.t > 4.8 && sp > 0.15) {
        addTyreMarks(e.suv);
    }
}

    if (e.taxi) storyTickTaxi(s, dt);

    // cutscene NPCs must be updated explicitly: the world is frozen
    storyUpdateNpcs(dt);
    storyUpdateBullets(s, dt);
    updateDebrisParticles(dt);
    updateTyreMarks(dt);
    player.updateSpeech(dt);

    for (let i = s.blasts.length - 1; i >= 0; i--) {
        s.blasts[i].age += dt;
        if (s.blasts[i].age > s.blasts[i].life) s.blasts.splice(i, 1);
    }

    if (s.scene === "road") {
        // the camera follows the player object, so park it on the focus point
        if (s.camTarget) {
            const tg = s.camTarget();
            const k = 1 - Math.exp(-0.07 * dt);
            s.cam.x += (tg.x - s.cam.x) * (dt === 0 ? 1 : k);
            s.cam.y += (tg.y - s.cam.y) * (dt === 0 ? 1 : k);
        }
        player.x = s.cam.x - player.size / 2;
        player.y = s.cam.y - player.size / 2;
        if (e.taxi) player.angle = e.taxi.angle;   // keeps the driver's bubble upright
    } else {
        if (s.pMove) {
            const m = s.pMove;
            const u = Math.min(1, (s.t - m.t0) / m.dur);
            s.pBase.x = m.fx + (m.tx - m.fx) * u;
            s.pBase.y = m.fy + (m.ty - m.fy) * u;
            if (u >= 1) s.pMove = null;
        }
        const jx = s.tremble ? Math.sin(s.t * 47) * 1.1 : 0;
        const jy = s.tremble ? Math.cos(s.t * 39) * 0.6 : 0;
        player.x = s.pBase.x - player.size / 2 + jx;
        player.y = s.pBase.y - player.size / 2 + jy;
    }

    // keep lights / ambience of the current hour up to date (no saving)
    s.dayNightClock += dt;
    if (s.dayNightClock > 30) {
        s.dayNightClock = 0;
        lastTimeSave = gameSeconds;
        updateDayNight(0);
    }
}

// ============================================================
// DRAW HOOKS (called from drawGame in main.js, world space)
// ============================================================
function drawOpeningCutsceneProps(ctx) {
    const s = storyIntro;
    if (!s) return;

    // Draw the explosive box.
    const b = s.e.box;

    if (b && !b.exploded) {
        ctx.save();
        ctx.translate(b.x, b.y);

        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(-7, -6, 18, 18);

        ctx.fillStyle = "#8e2b1f";
        ctx.fillRect(-9, -9, 18, 18);

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(-9, -2.5, 18, 5);

        ctx.fillStyle = "#111111";

        for (let i = 0; i < 4; i++) {
            ctx.fillRect(-8 + i * 4.5, -2.5, 2.2, 5);
        }

        ctx.strokeStyle = "#2b0f0b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -9, 18, 18);

        ctx.restore();
    }

}
     
// Cutscene speech bubbles, drawn once in the topmost world layer
// (called from main.js after the night overlay, camera transform active).
function drawOpeningCutsceneSpeech(ctx) {
    const s = storyIntro;
    if (!s) return;

    for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (!n || !n.speechText || n.isInjured) continue;
        if (n.isPassenger && !n.isTaxiWaiting) continue;   // hidden inside a car

        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.angle);            // drawSpeechBubble counter-rotates it
        n.drawSpeechBubble(ctx);
        ctx.restore();
    }

    // The player is represented by the taxi on the road: keep his bubble on it.
    const t = s.e.taxi;
    if (t && !t.exploded && player.speechText) {
        ctx.save();
        ctx.translate(t.x, t.y);
        player.drawSpeechBubble(ctx);
        ctx.restore();
    }
}

// Drawn above the night overlay (same place as bullets / headlights).
function drawOpeningCutsceneGlow(ctx) {
    const s = storyIntro;
    if (!s) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const b = s.e.box;
    if (b && !b.exploded && Math.floor(Date.now() / 350) % 2 === 0) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 16);
        g.addColorStop(0, "rgba(255, 60, 40, 0.9)");
        g.addColorStop(1, "rgba(255, 60, 40, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 16, 0, Math.PI * 2);
        ctx.fill();
    }

    s.blasts.forEach(bl => {
        const p = bl.age / bl.life;
        const a = Math.max(0, 1 - p);
        const r = bl.r * (0.4 + 0.8 * Math.min(1, p * 2.2));
        const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, r);
        g.addColorStop(0, "rgba(255, 240, 170, " + a + ")");
        g.addColorStop(0.35, "rgba(255, 150, 40, " + (0.7 * a) + ")");
        g.addColorStop(1, "rgba(255, 60, 0, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bl.x, bl.y, r, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

// ============================================================
// RACE SCHEDULE RESYNC
// The intro moves the clock to 07:00. raceManager keeps its own
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
        console.warn("[Story intro] race resync skipped:", err);
    }
}

// ============================================================
// FINISH (runs exactly once)
// ============================================================
function finishOpeningCutscene() {
    if (!openingCutsceneActive) return;

    storyIntroCardsAbort();             // hide any card, restore zoom / camera focus

    const s = storyIntro;
    storyIntro = null;                  // stops the timeline immediately
    openingCutsceneActive = false;
    gameActive = false;                 // frozen until the fade / chooser finishes

    // ---- remove every cutscene entity and effect ----
    for (let i = policeBullets.length - 1; i >= 0; i--) {
        if (policeBullets[i].cs) policeBullets.splice(i, 1);
    }
    debrisParticles.length = 0;
    tyreMarks.length = 0;

    if (s) {
        if (s.fireAudio) { try { s.fireAudio.pause(); } catch (err) {} s.fireAudio = null; }
        cars = s.snap.cars;             // the normal world comes back untouched
        npcs = s.snap.npcs;
        angryDrivers = s.snap.angryDrivers;
        playerCar = s.snap.playerCar;
    }
    delete window.sbCutsceneZoom;
    camera.angle = 0;
    camera.targetAngle = 0;

    // ---- player starts the game in his house ----
    const hw = houseMapWidth > 0 ? houseMapWidth : 696;
    isInsideHouse = true;
    outsideX = homeZone.x;              // leaving the house puts him at his front door
    outsideY = homeZone.y;
    player.size = 45;
    player.ispassenger = false;
    player.isLyingDown = false;
    player.speechText = null;
    player.speechTimer = 0;
    player.punchTimer = 0;
    player.speed = 0;
    player.angle = 0;
    player.isInvulnerable = false;
    player.x = hw / 2 - player.size / 2;
    player.y = 392 - player.size / 2;
    // Beaten up, but never left helpless. Money / hunger / saved data untouched.
    player.health = Math.max(35, Math.min(player.health, 60));

    // ---- sensible morning start; the intro never advanced saved time ----
    gameSeconds = (7 / 24) * DAY_LENGTH;
    lastTimeSave = gameSeconds;
    try { localStorage.setItem("gameTime", gameSeconds); } catch (err) {}
    if (typeof updateDayNight === "function") updateDayNight(0);
    storyResyncRaceSchedule(7);

    storyWrite(STORY_INTRO_KEY, { status: "completed", completedAt: Date.now() });
    storyWriteDebt(7);
    storySyndicateStartDebt();          // 10-day countdown starts now (idempotent)

    // ---- UI ----
    hidePhoneCutsceneMessage();
    if (typeof closePlayerPhone === "function") closePlayerPhone();

    const gameContainer = document.getElementById("gameContainer");
    if (gameContainer) gameContainer.classList.remove("opening-cutscene");

    storyHideText();
    if (openingCutscene) {
        openingCutscene.classList.remove("slow-black");
        openingCutscene.classList.remove("title-screen");   // fade out the title blackout
    }

    // Gameplay tips are delivered as scheduled phone messages.
    scheduleGameplayTips();

    if (typeof drawGame === "function") drawGame();

    // Single fade-out timer; it can only run once.
    if (openingFinishTimer) clearTimeout(openingFinishTimer);
    openingFinishTimer = setTimeout(() => {
        openingFinishTimer = null;

        if (openingCutscene) {
            openingCutscene.classList.remove("active");
            openingCutscene.classList.remove("story-live");
            openingCutscene.setAttribute("aria-hidden", "true");
        }
        storyClearText();

        // Only players who never picked a control mode see the chooser.
        if (!hasConfiguredControls() && typeof openFirstTimeControlsPanel === "function") {
            openFirstTimeControlsPanel();
        } else {
            gameActive = true;
            if (typeof taxiManager !== "undefined") {
                taxiManager.setMessage("Tap SPACE for desktop controls", 300);
            }
        }
    }, 800);
}

// ============================================================
// CHAPTER 2 - THE DEBT, MICKEY AND THE SYNDICATE'S VISIT
// ------------------------------------------------------------
//  * 10-day debt countdown (HUD under the clock), driven by the existing
//    in-game clock (gameSeconds / DAY_LENGTH). No second clock or timer:
//    in-game midnights are detected from the clock's own wrap-around.
//  * "Mickey (gang member)" contact, added to the EXISTING phone Contacts
//    screen (cloned from the ambulance contact, same call-screen elements).
//  * Repeated HUD reminder (real time, 3 min) while the player has $5,000
//    and has not scheduled the meeting.
//  * Automatic meeting when the deadline expires.
//  * The Syndicate drives to the player's CURRENT position with the existing
//    NavigationSystem (A*), the world is frozen like the opening cutscene,
//    the dialogue branch is chosen from the player's money, the Syndicate
//    drives off and the game resumes.
//
// All progress lives in ONE new localStorage key (STORY_SYN_KEY). Existing
// keys are never touched. main.js only calls three entry points:
//   updateSyndicateStory(dt)   - once per normal frame (after updateDayNight)
//   updateSyndicateMeeting(dt) - while syndicateMeetingActive (world frozen)
//   drawSyndicateDebtHUD(ctx)  - HUD, right after drawClock()
// ============================================================

const STORY_SYN_KEY = "streetbound_story_syndicate_v1";
const SYN_MONEY_NEEDED = STORY_DEBT_AMOUNT;          // $5,000
const SYN_MICKEY_NAME = "Mickey";
const SYN_MICKEY_LABEL = "Mickey (gang member)";
const SYN_REMINDER_MS = 3 * 60 * 1000;               // real time
const SYN_CALL_RING_MS = 4500;
const SYN_CALL_ARRIVAL_DELAY = 8 * 60;               // frames of gameplay after a connected call
const SYN_RETRY_FRAMES = 60;                         // suitability re-check cadence (~1 s)
const SYN_STABLE_CHECKS = 2;                         // consecutive suitable checks required
const SYN_MAX_ATTEMPTS = 4;                          // scripted-sequence failures before it is resolved silently
const SYN_CRUISE_SPEED = 2.4;                        // px per frame (same unit as Car.speed)

let syndicateMeetingActive = false;                  // world-freeze flag read by main.js
let syndicateMeeting = null;                         // runtime state of the scripted visit
let storySyn = null;                                 // persisted chapter state (see synDefaults)

const synRt = {
    arrivalDelay: 0,
    retry: 0,
    stable: 0,
    planFail: 0,
    scan: 0,
    callBusy: false,
    callTimers: [],
    phoneReady: false,
    mickeyBtn: null,
    ambBtn: null
};

// ------------------------------------------------------------
// Persistent state
// ------------------------------------------------------------
function synDefaults() {
    return {
        v: 1,
        debtStarted: false,          // debt countdown started
        debtBase: 0,                 // clock reference: elapsed = dayCount + frac - debtBase
        dayCount: 0,                 // in-game midnights since the countdown began
        lastFrac: 0,                 // last observed time of day (0..1), for midnight detection
        debtDeadlineReached: false,
        mickeyAvailable: false,      // Mickey contact usable
        hasFiveThousand: false,      // player has the $5,000 (last observed)
        mickeyCallAttempted: false,
        meetingScheduled: false,
        scheduledBy: null,           // "call" | "deadline"
        arrivalInProgress: false,    // Syndicate arrival running (never persisted as running across reloads)
        meetingCompleted: false,
        branch: null,                // "paid" | "short", fixed when the meeting begins
        recruitmentAccepted: false,
        dangerousMissionPending: false,
        debtHudHidden: false,
        lastReminderAt: 0,           // Date.now() of the last "call Mickey" reminder
        attempts: 0
    };
}

function synLoad() {
    if (storySyn) return storySyn;

    const d = synDefaults();
    try {
        const raw = localStorage.getItem(STORY_SYN_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === "object") {
                Object.keys(d).forEach(k => { if (p[k] !== undefined) d[k] = p[k]; });
            }
        }
    } catch (e) { /* corrupted save: fall back to defaults */ }

    ["debtBase", "dayCount", "lastFrac", "lastReminderAt", "attempts"].forEach(k => {
        if (typeof d[k] !== "number" || !isFinite(d[k])) d[k] = 0;
    });

    // The scripted arrival cannot be resumed mid-way: after a reload it is
    // simply pending again (same branch, never duplicated, never skipped).
    if (d.arrivalInProgress && !d.meetingCompleted) {
        d.arrivalInProgress = false;
        d.meetingScheduled = true;
        if (!d.scheduledBy) d.scheduledBy = "deadline";
    }
    if (d.meetingScheduled && !d.meetingCompleted) {
        synRt.arrivalDelay = d.scheduledBy === "call" ? 4 * 60 : 0;
    }
    if (d.meetingCompleted) {
        d.mickeyAvailable = false;
        d.debtHudHidden = true;
        d.arrivalInProgress = false;
    }

    storySyn = d;
    return d;
}

function synSave() {
    if (storySyn) storyWrite(STORY_SYN_KEY, storySyn);
}

// ------------------------------------------------------------
// Debt countdown (existing in-game clock only)
// ------------------------------------------------------------
function synFrac() {
    return gameSeconds / DAY_LENGTH;
}

function synElapsedDays(s) {
    return s.dayCount + synFrac() - s.debtBase;
}

function synDebtRemainingDays(s) {
    return Math.max(0, Math.ceil(STORY_DEBT_DAYS - synElapsedDays(s) - 1e-9));
}

// Called by the opening storyline once the debt has been spoken (see
// finishOpeningCutscene). Idempotent: a replay or reload never restarts it.
function storySyndicateStartDebt() {
    const s = synLoad();
    if (s.debtStarted || s.meetingCompleted) return;

    s.debtStarted = true;
    s.debtBase = synFrac();
    s.dayCount = 0;
    s.lastFrac = synFrac();
    s.mickeyAvailable = true;
    s.debtHudHidden = false;
    synSave();
}

// The opening storyline moves the clock (storySetTime). Keep the elapsed
// debt time continuous across such a jump instead of counting it.
function storySyndicateResyncClock() {
    const s = synLoad();
    if (!s.debtStarted) return;

    const f = synFrac();
    const elapsed = s.dayCount + s.lastFrac - s.debtBase;
    s.debtBase = s.dayCount + f - elapsed;
    s.lastFrac = f;
    synSave();
}

function synTickClock(s) {
    const f = synFrac();
    let dirty = false;

    // gameSeconds wraps to 0 at midnight: that is the only "new day" signal.
    if (s.lastFrac > 0.75 && f < 0.25) {
        s.dayCount++;
        dirty = true;
    }
    if (dirty || Math.abs(f - s.lastFrac) >= 0.01) {
        s.lastFrac = f;
        dirty = true;
    }
    if (dirty) synSave();
}

function drawSyndicateDebtHUD(c) {
    const s = storySyn;
    if (!s || !s.debtStarted || s.debtHudHidden || s.meetingCompleted) return;
    if (openingCutsceneActive || syndicateMeetingActive) return;

    const left = synDebtRemainingDays(s);
    const label = left <= 0 ? "DEBT: DUE" : "DEBT: " + left + (left === 1 ? " DAY" : " DAYS");

    const x = 20, w = 150, h = 28, r = 8;
    const baseY = (typeof clockHudY === "number") ? clockHudY : 65;   // follows the clock panel
    const y = baseY + 36 + 6;

    let color = "#f2f4f5";
    if (left <= 2) color = "#e74c3c";
    else if (left <= 5) color = "#f5b041";
    if (left <= 0 && Math.floor(Date.now() / 500) % 2 === 0) color = "#ff8f80";

    c.save();
    c.shadowColor = "rgba(0,0,0,0.45)";
    c.shadowBlur = 8;
    c.shadowOffsetY = 2;

    const body = c.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#33373d");
    body.addColorStop(1, "#202327");
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();

    c.shadowColor = "transparent";
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;

    c.fillStyle = "#c0392b";
    c.fillRect(x + 8, y + 7, 3, h - 14);

    c.fillStyle = color;
    c.font = "bold 15px Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, x + w / 2 + 4, y + h / 2 + 1);
    c.restore();
}

// ------------------------------------------------------------
// Phone: "Mickey (gang member)" in the existing Contacts screen
// ------------------------------------------------------------
function synRelabelContact(btn) {
    let renamed = false;
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
        if (/ambulance/i.test(n.nodeValue)) {
            n.nodeValue = SYN_MICKEY_NAME;
            renamed = true;
        } else if (n.nodeValue.indexOf("\uD83D\uDE91") >= 0) {      // ambulance emoji
            n.nodeValue = n.nodeValue.replace("\uD83D\uDE91", "\uD83D\uDCDE");
        }
    }
    if (!renamed) btn.textContent = "\uD83D\uDCDE " + SYN_MICKEY_NAME;
    btn.setAttribute("aria-label", SYN_MICKEY_LABEL);
    if (btn.title) btn.title = SYN_MICKEY_LABEL;
    // Match Ambulance contact footprint: short label, no stretch.
    btn.style.minWidth = "";
    btn.style.width = "auto";
    btn.style.maxWidth = "160px";
    btn.style.whiteSpace = "nowrap";
    btn.style.boxSizing = "border-box";
}

function synPhoneEnsure() {
    if (synRt.phoneReady) return;

    const amb = document.getElementById("ambulanceContactButton");
    if (!amb || !amb.parentNode) return;

    const btn = amb.cloneNode(true);
    btn.id = "mickeyContactButton";
    synRelabelContact(btn);

    // The ambulance button may be styled by its id: copy the visual styling
    // so the clone looks like a sibling contact.
    try {
        const cs = getComputedStyle(amb);
        ["background", "backgroundColor", "color", "border", "borderRadius", "padding",
         "font", "boxShadow", "gap", "alignItems", "justifyContent", "flexDirection",
         "width", "height", "minHeight", "cursor"].forEach(p => {
            if (cs[p]) btn.style[p] = cs[p];
        });
        const mt = parseFloat(cs.marginTop) || 0;
        btn.style.marginTop = mt > 0 ? cs.marginTop : "10px";
    } catch (e) { /* styling is cosmetic only */ }

    amb.parentNode.insertBefore(btn, amb.nextSibling);
    synRt.ambBtn = amb;
    synRt.mickeyBtn = btn;
    synRt.phoneReady = true;

    btn.addEventListener("pointerdown", e => {
        e.preventDefault();
        if (!playerPhoneOpen) return;
        syndicateCallMickey();
    });

    // Back button (existing handler resets the screens): cancel a ringing call.
    const back = document.getElementById("phoneBackButton");
    if (back) back.addEventListener("pointerdown", () => synCancelMickeyCall());

    // The existing phone code shows/hides the ambulance contact; mirror it.
    if (typeof MutationObserver === "function") {
        new MutationObserver(synPhoneRefresh).observe(amb, { attributes: true, attributeFilter: ["style"] });
    }
    synPhoneRefresh();
}

function synMickeyEnabled() {
    const s = synLoad();
    return !!(s.mickeyAvailable && !s.meetingCompleted && !s.arrivalInProgress && !syndicateMeetingActive);
}

function synPhoneRefresh() {
    const b = synRt.mickeyBtn, a = synRt.ambBtn;
    if (!b || !a) return;
    b.style.display = (!synMickeyEnabled() || a.style.display === "none") ? "none" : a.style.display;
}

function synCallEls() {
    return {
        home: document.getElementById("phoneHomeScreen"),
        call: document.getElementById("phoneCallScreen"),
        icon: document.querySelector(".phone-call-icon"),
        name: document.querySelector(".phone-call-name"),
        status: document.getElementById("phoneCallStatus")
    };
}

function synShowCallScreen(status) {
    const e = synCallEls();
    if (!e.home || !e.call) return;
    e.home.style.display = "none";
    e.call.style.display = "flex";
    if (e.icon) e.icon.textContent = "\uD83D\uDCDE";
    if (e.name) e.name.textContent = SYN_MICKEY_NAME;
    if (synRt.ambBtn) synRt.ambBtn.style.display = "none";
    if (synRt.mickeyBtn) synRt.mickeyBtn.style.display = "none";
    if (e.status) e.status.textContent = status;
}

function synSetCallStatus(text) {
    const el = document.getElementById("phoneCallStatus");
    if (el) el.textContent = text;
}

// Back to the Contacts list (existing function), never a stuck call screen.
function synBackToContacts() {
    if (typeof openAmbulanceCallScreen === "function") openAmbulanceCallScreen();
    synPhoneRefresh();
}

function synClearCallTimers() {
    synRt.callTimers.forEach(t => clearTimeout(t));
    synRt.callTimers.length = 0;
}

function synCancelMickeyCall() {
    synClearCallTimers();
    synRt.callBusy = false;
}

function syndicateCallMickey() {
    const s = synLoad();
    if (!synMickeyEnabled() || synRt.callBusy) return false;

    synRt.callBusy = true;
    s.mickeyCallAttempted = true;
    synSave();

    synShowCallScreen("Calling " + SYN_MICKEY_NAME + "...");
    synRt.callTimers.push(setTimeout(() => synSetCallStatus("Ringing..."), 1500));
    synRt.callTimers.push(setTimeout(synFinishMickeyCall, SYN_CALL_RING_MS));
    return true;
}

function synFinishMickeyCall() {
    synClearCallTimers();
    synRt.callBusy = false;

    const s = synLoad();

    // The Syndicate may have arrived while the phone was ringing.
    if (!synMickeyEnabled()) {
        synBackToContacts();
        return;
    }

    if (player.money >= SYN_MONEY_NEEDED) {
        // Connected. A second call never creates a second arrival.
        if (!s.meetingScheduled) {
            s.meetingScheduled = true;
            s.scheduledBy = "call";
            synRt.arrivalDelay = SYN_CALL_ARRIVAL_DELAY;
            synRt.retry = 0;
            synRt.stable = 0;
            synSave();
        }
        synSetCallStatus("Call connected");
    } else {
        synSetCallStatus("Call disconnected");
    }

    synRt.callTimers.push(setTimeout(synBackToContacts, 1600));
}

// ------------------------------------------------------------
// Suitable-state check (the meeting never interrupts important play)
// ------------------------------------------------------------
function synIsSuitable() {
    if (typeof gameActive !== "undefined" && !gameActive) return false;

    // other cutscenes / overlays
    if (openingCutsceneActive || storyIntro || syndicateMeetingActive) return false;
    if (typeof storyCardLive !== "undefined" && storyCardLive) return false;
    if (typeof firstTimeControlsOpen !== "undefined" && firstTimeControlsOpen) return false;
    if (typeof desktopControlsOpen !== "undefined" && desktopControlsOpen) return false;
    if (typeof showFullMap !== "undefined" && (showFullMap || fullMapAnimating)) return false;

    // the Syndicate drives up to the player in the open world
    if (isInsideHouse || (typeof isInsideDealership !== "undefined" && isInsideDealership)) return false;

    // police / arrest / death / incapacitated
    if (player.wanted || player.beingChased) return false;
    if (player.isBeingArrested || player.isArrestPassenger) return false;
    if (player.health <= 0 || player.isDead || player.isLyingDown) return false;
    if (player.ispassenger) return false;
    if (typeof window.streetBoundTimeScale === "number" && window.streetBoundTimeScale < 0.999) return false;

    // fighting
    if (player.punchTimer > 0 || player.punchCooldown > 0) return false;
    if (npcs.some(n => n && n.isFightingBack && !n.isInjured)) return false;
    if (angryDrivers && angryDrivers.length > 0) return false;

    // jobs / events that cannot be paused cleanly
    if (typeof taxiManager !== "undefined" && taxiManager && taxiManager.isJobActive && taxiManager.hasPassenger) return false;
    if (typeof raceEventManager !== "undefined" && raceEventManager &&
        raceEventManager.state === "RACING" && raceEventManager.playerJoined) return false;

    return true;
}

// ------------------------------------------------------------
// Per-frame story tick (called from updateGame, normal gameplay only)
// ------------------------------------------------------------
function updateSyndicateStory(dt) {
    const s = synLoad();
    synPhoneEnsure();

    if (openingCutsceneActive || syndicateMeetingActive) return;
    if (s.meetingCompleted) return;

    // Existing saves (opening already seen before this chapter existed), or a
    // reload during the opening: start the countdown once, never restart it.
    if (!s.debtStarted) {
        synRt.scan -= dt;
        if (synRt.scan > 0) return;
        synRt.scan = 120;
        let hasDebtRecord = false;
        try { hasDebtRecord = localStorage.getItem(STORY_DEBT_KEY) !== null; } catch (e) {}
        if (hasDebtRecord && hasSeenStoryIntro()) storySyndicateStartDebt();
        else return;
    }

    synTickClock(s);

    const has = player.money >= SYN_MONEY_NEEDED;
    if (has !== s.hasFiveThousand) {
        s.hasFiveThousand = has;
        synSave();
    }

    // Day 10: the Syndicate comes whether or not the player has the money.
    if (!s.debtDeadlineReached && synElapsedDays(s) >= STORY_DEBT_DAYS) {
        s.debtDeadlineReached = true;
        if (!s.meetingScheduled) {
            s.meetingScheduled = true;
            s.scheduledBy = "deadline";
            synRt.arrivalDelay = 0;
            synRt.retry = 0;
            synRt.stable = 0;
        }
        synSave();
    }

    // HUD reminder: real-time comparison, one message at most, no backlog.
    if (s.mickeyAvailable && has && !s.meetingScheduled && !s.arrivalInProgress &&
        typeof taxiManager !== "undefined" && taxiManager) {
        const now = Date.now();
        if (s.lastReminderAt > now) s.lastReminderAt = now;       // system clock moved back
        if (!s.lastReminderAt || now - s.lastReminderAt >= SYN_REMINDER_MS) {
            s.lastReminderAt = now;
            synSave();
            taxiManager.setMessage("You have $5,000. Call Mickey (Phone > Contacts).", 300);
        }
    }

    synPhoneRefresh();

    // Pending meeting: wait for a suitable moment, start exactly once.
    if (s.meetingScheduled && !s.arrivalInProgress) {
        if (synRt.arrivalDelay > 0) {
            synRt.arrivalDelay -= dt;
            return;
        }
        synRt.retry -= dt;
        if (synRt.retry <= 0) {
            synRt.retry = SYN_RETRY_FRAMES;
            if (synIsSuitable()) {
                synRt.stable++;
                if (synRt.stable >= SYN_STABLE_CHECKS) {
                    synRt.stable = 0;
                    syndicateBeginMeeting();
                }
            } else {
                synRt.stable = 0;
            }
        }
    }
}

// ------------------------------------------------------------
// Arrival planning (existing NavigationSystem A*, road spawn points)
// ------------------------------------------------------------
function synInMap(x, y, margin) {
    return x >= margin && y >= margin && x <= mapWidth - margin && y <= mapHeight - margin;
}

function synRoadSpot(x, y) {
    if (!isRoadColor(x, y)) return false;
    const r = 11;
    return isRoadColor(x - r, y) && isRoadColor(x + r, y) && isRoadColor(x, y - r) && isRoadColor(x, y + r);
}

function synNearestRoadSpot(px, py, maxR) {
    if (synRoadSpot(px, py)) return { x: px, y: py };
    for (let r = 12; r <= maxR; r += 12) {
        const n = Math.max(8, Math.round(r / 6));
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
            if (synRoadSpot(x, y)) return { x: x, y: y };
        }
    }
    return null;
}

function synPathLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return len;
}

function synFindPath(x0, y0, x1, y1) {
    if (typeof navigationSystem === "undefined") return null;
    if (!navigationSystem.ready && typeof navigationSystem.buildGrid === "function") navigationSystem.buildGrid();
    if (!navigationSystem.ready) return null;
    const p = navigationSystem.findPath(x0, y0, x1, y1, true);
    return (p && p.length > 0) ? p : null;
}

// A parking position for a vehicle near the player: car-sized footprint on
// walkable ground, clear of the player, other vehicles and pedestrians.
function synStopSpotOk(m, x, y, a, taken) {
    if (!synInMap(x, y, 50)) return false;
    if (Math.hypot(x - m.C.x, y - m.C.y) < 76) return false;

    const probeA = { angle: a + Math.PI / 2, length: 38, width: 22 };
    const probeB = { angle: a, length: 38, width: 22 };
    if (!isPlayerCarWalkable(x, y, probeA) || !isPlayerCarWalkable(x, y, probeB)) return false;

    for (let i = 0; i < taken.length; i++) {
        if (Math.hypot(x - taken[i].x, y - taken[i].y) < 62) return false;
    }
    for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c && !c.exploded && Math.hypot(x - c.x, y - c.y) < 54) return false;
    }
    for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (n && !n.isPassenger && Math.hypot(x - n.x, y - n.y) < 26) return false;
    }
    return true;
}

function synPickStopSpots(m, a0, n) {
    const out = [];
    const offsets = [0, 0.85, -0.85];
    for (let i = 0; i < n; i++) {
        let best = null, bestCost = Infinity;
        for (const da of [0, 0.18, -0.18, 0.36, -0.36, 0.55, -0.55]) {
            for (const r of [100, 118, 84, 138, 160]) {
                const a = a0 + offsets[i] + da;
                const x = m.C.x + Math.cos(a) * r, y = m.C.y + Math.sin(a) * r;
                if (!synStopSpotOk(m, x, y, a, out)) continue;
                const cost = Math.abs(da) * 70 + Math.abs(r - 100) * 0.5 + (isRoadColor(x, y) ? 0 : 30);
                if (cost < bestCost) { bestCost = cost; best = { x: x, y: y }; }
            }
        }
        if (best) out.push(best);
    }
    return out;
}

// Returns { cars: [{def, spawn, angle, spot, path}], offR } or null.
function synPlanArrival(m) {
    const C = m.C;
    const zoom = Math.min(1, (window.sbFrameCamera && window.sbFrameCamera.zoom) || 1);
    const offR = Math.hypot(canvas.width, canvas.height) / 2 / zoom + 140;   // outside the visible screen
    m.offR = offR;

    // 1. candidate road spawn points on rings outside the screen, all directions
    const cands = [];
    const jitter = Math.random() * 0.26;
    for (let k = 0; k < 24; k++) {
        const a = jitter + k * Math.PI * 2 / 24;
        for (const extra of [30, 140, 260]) {
            const r = offR + extra;
            const px = C.x + Math.cos(a) * r, py = C.y + Math.sin(a) * r;
            if (!synInMap(px, py, 70)) continue;                       // map boundary
            const spot = synNearestRoadSpot(px, py, 96);
            if (!spot || !synInMap(spot.x, spot.y, 60)) continue;
            const d = Math.hypot(spot.x - C.x, spot.y - C.y);
            if (d < offR) continue;                                    // must be off-screen
            if (cands.some(c => Math.hypot(c.x - spot.x, c.y - spot.y) < 90)) continue;
            let crowded = false;
            for (let i = 0; i < cars.length; i++) {
                if (cars[i] && Math.hypot(cars[i].x - spot.x, cars[i].y - spot.y) < 70) { crowded = true; break; }
            }
            if (crowded) continue;
            cands.push({ x: spot.x, y: spot.y, d: d });
        }
    }
    cands.sort((p, q) => p.d - q.d);

    // 2. rank by real A* route length to the lead stop spot
    let best = null;
    for (let i = 0; i < Math.min(cands.length, 16); i++) {
        const c = cands[i];
        const a0 = Math.atan2(c.y - C.y, c.x - C.x);
        const spots = synPickStopSpots(m, a0, 1);
        if (!spots.length) continue;
        const path = synFindPath(c.x, c.y, spots[0].x, spots[0].y);
        if (!path) continue;
        const len = synPathLength(path);
        if (len > c.d * 2.6 + 400) continue;                           // absurd detour
        if (!best || len < best.len) best = { c: c, a0: a0, len: len };
    }
    if (!best) return null;

    // 3. stop spots for the whole convoy + their routes
    const spots = synPickStopSpots(m, best.a0, 3);
    if (!spots.length) return null;

    const leadPath = synFindPath(best.c.x, best.c.y, spots[0].x, spots[0].y);
    if (!leadPath) return null;
    const j = Math.min(2, leadPath.length - 1);
    let dx = leadPath[j].x - leadPath[0].x, dy = leadPath[j].y - leadPath[0].y;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;                                                // lead's initial travel direction

    const defs = [
        { type: "Commuter, Sedan", color: "#0b0b0d" },                 // Victor's car
        { type: "Ranger, SUV", color: "#0b0b0d" },                     // same black SUV as the opening
        { type: "Ranger, SUV", color: "#15151a" }
    ];
    const plan = { cars: [], offR: offR };

    for (let i = 0; i < spots.length && i < 3; i++) {
        // followers queue up behind the lead on the same road
        let spawn = null;
        if (i === 0) {
            spawn = { x: best.c.x, y: best.c.y };
        } else {
            for (const lat of [0, 14, -14]) {
                const x = best.c.x - dx * 74 * i - dy * lat;
                const y = best.c.y - dy * 74 * i + dx * lat;
                if (synInMap(x, y, 50) && synRoadSpot(x, y)) { spawn = { x: x, y: y }; break; }
            }
        }
        if (!spawn) continue;

        const path = i === 0 ? leadPath : synFindPath(spawn.x, spawn.y, spots[i].x, spots[i].y);
        if (!path) continue;

        const k = Math.min(2, path.length - 1);
        const ang = Math.atan2(path[k].y - path[0].y, path[k].x - path[0].x) + Math.PI / 2;
        plan.cars.push({ def: defs[i], spawn: spawn, angle: ang, spot: spots[i], path: path, slot: i });
    }

    // the lead (Victor's car) is mandatory, at least two vehicles are wanted
    if (!plan.cars.length || plan.cars[0].slot !== 0 || plan.cars.length < 2) return null;
    return plan;
}

// ------------------------------------------------------------
// Scripted vehicle driving (same A* waypoint following the opening taxi uses)
// ------------------------------------------------------------
function synAngleDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function synSpawnPlan(m, plan) {
    plan.cars.forEach(pc => {
        const car = new Car(71001 + pc.slot, pc.spawn.x, pc.spawn.y, pc.def.color, false, pc.def.type);
        car.angle = pc.angle;
        car.speed = 0;
        car.isParked = false;
        car.hasDriver = true;
        car.health = car.maxHealth;
        // Syndicate identification (same ownerType idea as "taxiDepot" / "police")
        car.ownerType = "syndicate";
        car.isSyndicate = true;
        car.team = "syndicate";
        cars.push(car);

        // finish exactly on the stop spot
        const path = pc.path.slice();
        if (path.length > 1 &&
            Math.hypot(path[path.length - 1].x - pc.spot.x, path[path.length - 1].y - pc.spot.y) < 26) {
            path.pop();
        }
        path.push({ x: pc.spot.x, y: pc.spot.y });

        m.cars.push({
            car: car,
            slot: pc.slot,
            state: "approach",          // approach -> parked -> depart -> gone
            path: path,
            idx: path.length > 1 ? 1 : 0,
            spot: pc.spot,
            home: pc.spawn,
            origPath: pc.path.slice(),
            wpFrames: 0, wpSeen: -1,
            progX: car.x, progY: car.y, progT: 0,
            reroutes: 0
        });
    });
}

function synSnapToPath(d) {
    // last resort against a stuck car: continue from the next cell centre
    // (always a walkable navigation cell).
    if (d.idx < d.path.length - 1) d.idx++;
    const w = d.path[d.idx];
    d.car.x = w.x;
    d.car.y = w.y;
    d.progX = w.x; d.progY = w.y; d.progT = 0;
}

function synDrive(m, d, dt, departing) {
    const car = d.car;
    const path = d.path;
    if (!path || !path.length) { d.state = departing ? "gone" : "parked"; return; }

    // never chase one waypoint for more than ~4 s
    if (d.wpSeen !== d.idx) { d.wpSeen = d.idx; d.wpFrames = 0; }
    d.wpFrames += dt;
    if (d.wpFrames > 240 && d.idx < path.length - 1) { d.idx++; d.wpFrames = 0; }

    const wp = path[Math.min(d.idx, path.length - 1)];
    const isLast = d.idx >= path.length - 1;
    const dx = wp.x - car.x, dy = wp.y - car.y;
    const dist = Math.hypot(dx, dy);

    // reached a waypoint / the end of the route
    if (dist < (isLast ? 9 : 42)) {
        if (!isLast) { d.idx++; return; }
        if (!departing) {
            car.speed = 0;
            d.state = "parked";
            car.isParked = true;
            if (typeof playSpatialSound === "function" && typeof carStopPool !== "undefined") {
                playSpatialSound(carStopPool, car.x, car.y, 0.8);
            }
        }
        return;
    }

    // steering toward the waypoint (tight pivot when it is behind the car)
    const desired = Math.atan2(dy, dx) + Math.PI / 2;
    const diff = synAngleDiff(desired, car.angle);
    const sharp = Math.abs(diff) > 1.0;
    const maxTurn = (sharp ? 0.14 : 0.075) * dt;
    car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // target speed: cruise, brake into the stop spot, slow in sharp turns
    let target = SYN_CRUISE_SPEED;
    if (!departing && isLast) target = Math.max(0.5, SYN_CRUISE_SPEED * Math.min(1, dist / 90));
    if (sharp) target = Math.min(target, 0.8);

    // keep a gap to another Syndicate car directly ahead
    const hx = Math.sin(car.angle), hy = -Math.cos(car.angle);
    for (let i = 0; i < m.cars.length; i++) {
        const o = m.cars[i];
        if (o === d || o.state === "gone") continue;
        const ox = o.car.x - car.x, oy = o.car.y - car.y;
        const ahead = ox * hx + oy * hy;
        const side = Math.abs(ox * -hy + oy * hx);
        if (ahead > 0 && ahead < 52 && side < 20) {
            target = ahead < 34 ? 0 : Math.min(target, Math.max(0, (o.car.speed || 0) * 0.9));
        }
    }

    // accelerate gently, brake faster
    car.speed += (target > car.speed ? 0.06 : -0.12) * dt;
    if (Math.abs(target - car.speed) < 0.08) car.speed = target;
    car.speed = Math.max(0, car.speed);

    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const ny = car.y - Math.cos(car.angle) * car.speed * dt;
    if (isPlayerCarWalkable(nx, ny, car)) {
        car.x = nx;
        car.y = ny;
    } else {
        car.speed = 0;                  // never drive through buildings
        d.progT += dt * 2;              // counts toward the unstick logic
    }

    // stuck detection: almost no progress for ~1.5 s
    d.progT += dt;
    if (d.progT >= 90) {
        const moved = Math.hypot(car.x - d.progX, car.y - d.progY);
        d.progX = car.x; d.progY = car.y; d.progT = 0;
        if (moved < 6 && target > 0) {
            d.reroutes++;
            const goal = departing ? d.home : d.spot;
            const np = d.reroutes <= 2 ? synFindPath(car.x, car.y, goal.x, goal.y) : null;
            if (np && np.length > 1) {
                if (!departing) np.push({ x: d.spot.x, y: d.spot.y });
                d.path = np;
                d.idx = 1;
            } else {
                synSnapToPath(d);
            }
        }
    }
}

function synEngineAudio(car) {
    if (typeof engineHumUrl === "undefined") return;
    const dist = Math.hypot(player.x - car.x, player.y - car.y);
    const moving = car.speed > 0.15 && !car.isParked;
    if (!moving || dist >= 400) {
        if (car.humAudio) { try { car.humAudio.pause(); } catch (e) {} car.humAudio = null; }
        return;
    }
    if (!car.humAudio) {
        car.humAudio = new Audio(engineHumUrl);
        car.humAudio.loop = true;
        car.humAudio.play().catch(() => {});
    }
    car.humAudio.volume = Math.max(0, Math.min(1, 0.9 * (1 - dist / 400)));
}

// ------------------------------------------------------------
// Dialogue (exact lines from the brief; long lines are split across
// consecutive speech bubbles, wording unchanged)
// ------------------------------------------------------------
const SYN_DIALOGUE = {
    paid: [
        ["V", "Well, look at that. You actually managed to get the money."],
        ["V", "I underestimated you."],
        ["P", "Here's your money. Now we're done, right?"],
        ["V", "Money isn't everything, kid. I need a man like you."],
        ["P", "I'm not interested in working for you."],
        ["V", "Listen. You can spend your life driving that taxi, making a few bucks every day... or you can make real money."],
        ["P", "And what exactly do you want me to do?"],
        ["V", "Nothing complicated. Just a few jobs. You'll be paid well."],
        ["P", "..."],
        ["V", "Think about it. You've already proven you can get things done."]
    ],
    short: [
        ["V", "Where's my money?"],
        ["P", "I... couldn't get all of it."],
        ["V", "You had ten days."],
        ["P", "I've been trying. Just give me some more time."],
        ["V", "I'm getting tired of hearing excuses."],
        ["P", "Please. I'll get it."],
        ["V", "You want more time? Fine. But you're going to earn it."],
        ["P", "What do you mean?"],
        ["V", "I've got a job for you. A dangerous one. Complete it, and we'll consider your debt settled."],
        ["P", "What kind of job?"],
        ["V", "You'll find out."]
    ]
};

// Split a line into bubble-sized chunks at clause boundaries.
function synChunk(text, max) {
    max = max || 50;
    if (text.length <= max) return [text];
    const clauses = text.match(/.*?(?:\.\.\.|[.!?,])(?:\s+|$)|.+$/g) || [text];
    const out = [];
    let cur = "";
    clauses.forEach(c => {
        c = c.trim();
        if (!c) return;
        if (!cur) cur = c;
        else if ((cur + " " + c).length <= max) cur += " " + c;
        else { out.push(cur); cur = c; }
    });
    if (cur) out.push(cur);
    return out;
}

function synBuildLines(branch) {
    const lines = [];
    (SYN_DIALOGUE[branch] || SYN_DIALOGUE.short).forEach(l => {
        synChunk(l[1]).forEach(chunk => {
            lines.push({
                who: l[0],
                text: chunk,
                dur: Math.max(1.5, Math.min(4.2, 1.0 + chunk.length * 0.045))
            });
        });
    });
    return lines;
}

// ------------------------------------------------------------
// The visit
// ------------------------------------------------------------
function synHideActionButtons() {
    ["jackBtn", "exitBtn", "punchBtn", "sirenBtn"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";    // main.js re-evaluates them every normal frame
    });
}

function synReleaseInput() {
    if (typeof activeMoves !== "undefined" && activeMoves) {
        Object.keys(activeMoves).forEach(k => { activeMoves[k] = false; });
    }
    if (typeof joystickInputX !== "undefined") joystickInputX = 0;
    if (typeof joystickInputY !== "undefined") joystickInputY = 0;
}

// If the player is driving, he steps out through the existing exit-car code.
function synPlayerStepOut() {
    if (!playerCar) return;
    try { playerCar.speed = 0; } catch (e) {}

    const eb = document.getElementById("exitBtn");
    if (eb) {
        try { eb.dispatchEvent(new Event("pointerdown", { cancelable: true })); } catch (e) {}
    }
    if (playerCar) {                       // fallback if the handler was unavailable
        const pc = playerCar;
        const side = pc.angle - Math.PI / 2;
        player.x = pc.x + Math.cos(side) * 35;
        player.y = pc.y + Math.sin(side) * 35;
        pc.isParked = true;
        pc.hasDriver = false;
        pc.recentlyJackedTimer = 90;
        if (pc.humAudio) { try { pc.humAudio.pause(); } catch (e) {} pc.humAudio = null; }
        playerCar = null;
    }
    if (eb) eb.style.display = "none";
}

function syndicateBeginMeeting() {
    const s = synLoad();

    // exactly once
    if (syndicateMeetingActive || syndicateMeeting || s.arrivalInProgress || s.meetingCompleted) return false;

    const m = {
        t: 0,
        phase: "approach",
        nextId: 1000,
        cars: [],
        actors: [],
        C: { x: player.x + player.size / 2, y: player.y + player.size / 2 },   // snapshot of the player's position
        offR: 900,
        approachT: 0,
        settle: 0,
        exitT: 0,
        lines: [],
        lineIdx: 0,
        lineWait: 0,
        afterT: 0,
        leaveT: 0,
        departT: 0,
        goneWait: 0,
        zoomBefore: (typeof window.sbCutsceneZoom === "number") ? window.sbCutsceneZoom : null
    };

    // Plan first: if no valid route exists the meeting simply stays pending.
    const plan = synPlanArrival(m);
    if (!plan) {
        synRt.planFail++;
        synRt.retry = 300;                  // try again in ~5 s, from the player's new position
        console.warn("[Syndicate] no valid approach found (attempt " + synRt.planFail + ")");
        return false;
    }
    synRt.planFail = 0;

    // ---- commit: from here on the countdown / Mickey are gone for good ----
    s.arrivalInProgress = true;
    s.debtHudHidden = true;
    s.mickeyAvailable = false;
    if (!s.branch) s.branch = player.money >= SYN_MONEY_NEEDED ? "paid" : "short";
    synSave();
    m.branch = s.branch;

    synCancelMickeyCall();
    if (typeof cancelAmbulanceCall === "function") cancelAmbulanceCall();   // reset call screen to home
    synPhoneRefresh();

    syndicateMeeting = m;
    syndicateMeetingActive = true;
    gameActive = false;

    // Same UI-hide path as the first-play opening cutscene (CSS + canvas HUD gates).
    const gc = document.getElementById("gameContainer");
    if (gc) gc.classList.add("opening-cutscene");

    playerPhoneOpen = false;
    if (typeof closePlayerPhone === "function") closePlayerPhone();
    synReleaseInput();
    synHideActionButtons();
    synPlayerStepOut();
    player.speed = 0;
    player.speechText = null;
    player.speechTimer = 0;
    m.C.x = player.x + player.size / 2;
    m.C.y = player.y + player.size / 2;

    window.sbCutsceneZoom = 1.18;          // slight cinematic zoom for the approach

    synSpawnPlan(m, plan);
    return true;
}

function synDoorPoint(car, toward) {
    const h = car.angle - Math.PI / 2;
    const sx = -Math.sin(h), sy = Math.cos(h);           // perpendicular to the heading
    const off = (car.width || 18) / 2 + 12;
    const p1 = { x: car.x + sx * off, y: car.y + sy * off };
    const p2 = { x: car.x - sx * off, y: car.y - sy * off };
    const d1 = Math.hypot(p1.x - toward.x, p1.y - toward.y);
    const d2 = Math.hypot(p2.x - toward.x, p2.y - toward.y);
    return d1 <= d2 ? p1 : p2;
}

function synStandSpot(m, ang, r0, taken) {
    for (let r = r0; r >= 30; r -= 6) {
        for (const da of [0, 0.25, -0.25, 0.5, -0.5]) {
            const a = ang + da;
            const x = m.C.x + Math.cos(a) * r, y = m.C.y + Math.sin(a) * r;
            if (!isWalkableColor(x, y, 16)) continue;
            if (taken.some(t => Math.hypot(t.x - x, t.y - y) < 26)) continue;
            return { x: x, y: y };
        }
    }
    return { x: m.C.x + Math.cos(ang) * 40, y: m.C.y + Math.sin(ang) * 40 };
}

function synStartExit(m) {
    const lead = m.cars.find(d => d.slot === 0) || m.cars[0];
    const aV = Math.atan2(lead.car.y - m.C.y, lead.car.x - m.C.x);

    const looks = [
        ["#1b1b1f", "#1d1d1d", "#e0ac69"],
        ["#2c2c34", "#2d3436", "#c68642"],
        ["#3a1f1f", "#4a3728", "#8d5524"]
    ];
    const taken = [];

    // Victor: the same boss appearance as the opening scene
    const vs = synStandSpot(m, aV, 56, taken);
    taken.push(vs);
    const victor = storyNpc(m, lead.car.x, lead.car.y, "#17191f", "#aeb4bd", "#d7a078", 0);
    victor.isStoryBoss = true;
    victor.cutsceneArmed = false;
    victor.isSyndicate = true;
    victor.carRef = lead;
    victor.stand = vs;
    m.victor = victor;
    m.actors.push(victor);

    // goons: one from the lead car, then one per escort vehicle
    const goonCars = [lead].concat(m.cars.filter(d => d !== lead));
    const goonAngles = [0.95, -0.95, 1.7];
    goonCars.forEach((d, i) => {
        const gs = synStandSpot(m, aV + goonAngles[i], 66, taken);
        taken.push(gs);
        const lk = looks[i % looks.length];
        const g = storyNpc(m, d.car.x, d.car.y, lk[0], lk[1], lk[2], 0);
        g.isSyndicate = true;
        g.carRef = d;
        g.stand = gs;
        m.actors.push(g);
    });

    // step out on the side facing the player and walk to the conversation spots
    m.actors.forEach((n, i) => {
        const door = synDoorPoint(n.carRef.car, m.C);
        n.x = door.x;
        n.y = door.y;
        storyFace(n, n.stand.x, n.stand.y);
        n.boardPoint = door;
        // Slower, more deliberate walk-out (was ~1.45–1.55).
        storyWalk(n, [[n.stand.x, n.stand.y]], 0.95 + (i % 3) * 0.04);
    });

    window.sbCutsceneZoom = 1.35;
    m.phase = "exit";
    m.exitT = 0;
}

function synFacePlayer(n, m) {
    n.angle = Math.atan2(m.C.y - n.y, m.C.x - n.x) + Math.PI / 2;
}

function synPlayerFace(m, who) {
    player.angle = Math.atan2(who.y - m.C.y, who.x - m.C.x) + Math.PI / 2;
}

function synStartLeave(m) {
    m.phase = "leave";
    m.leaveT = 0;
    m.actors.forEach(n => {
        n.aimHold = false;
        const door = synDoorPoint(n.carRef.car, n);       // side the actor is standing on
        // Slower return to the cars (was 1.7).
        storyWalk(n, [[door.x, door.y]], 1.15, () => {
            storyRemoveNpc(n);
            n.boarded = true;
        });
    });
    window.sbCutsceneZoom = 1.2;
}

function synStartDepart(m) {
    m.phase = "depart";
    m.departT = 0;
    m.cars.forEach((d, i) => {
        const car = d.car;
        d.state = "depart";
        d.startDelay = i * 0.6;                           // lead leaves first
        let path = synFindPath(car.x, car.y, d.home.x, d.home.y);
        if (!path) path = d.origPath.slice().reverse();   // the way it came is known to exist
        d.path = path;
        d.idx = path.length > 1 ? 1 : 0;
        d.reroutes = 0;
        d.wpFrames = 0; d.wpSeen = -1;
        d.progX = car.x; d.progY = car.y; d.progT = 0;
        car.isParked = false;
        if (typeof playSpatialSound === "function" && typeof carStartPool !== "undefined") {
            playSpatialSound(carStartPool, car.x, car.y, 0.8);
        }
    });
    window.sbCutsceneZoom = 1.0;
}

function synRemoveCar(d) {
    const car = d.car;
    if (car.humAudio) { try { car.humAudio.pause(); } catch (e) {} car.humAudio = null; }
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    d.state = "gone";
}

function updateSyndicateMeeting(dt) {
    const m = syndicateMeeting;
    if (!m || !syndicateMeetingActive) { syndicateMeetingActive = false; return; }

    try {
        // The world stays frozen: a map / controls panel can never hand control back mid-scene.
        gameActive = false;
        if (showFullMap || fullMapAnimating) {
            showFullMap = false;
            fullMapAnimating = false;
            fullMapAnimationProgress = 0;
        }
        playerPhoneOpen = false;

        const sec = dt / 60;
        m.t += sec;
        player.speed = 0;
        player.updateSpeech(dt);
        storyUpdateNpcs(dt);                                   // speech timers + scripted walking
        if (typeof taxiManager !== "undefined" && taxiManager.updateMessage) taxiManager.updateMessage(dt);
        if (typeof updateTyreMarks === "function") updateTyreMarks(dt);

        if (m.phase === "approach") {
            m.approachT += sec;
            let allParked = true;
            m.cars.forEach(d => {
                if (d.state === "approach") synDrive(m, d, dt, false);
                if (d.state !== "parked") allParked = false;
            });

            // safety nets: a car that is still on its way after 45 s and already
            // close is parked where it is; after 80 s the visit is abandoned.
            if (m.approachT > 45 && !allParked) {
                m.cars.forEach(d => {
                    if (d.state === "approach" &&
                        Math.hypot(d.car.x - d.spot.x, d.car.y - d.spot.y) < 240) {
                        d.car.x = d.spot.x; d.car.y = d.spot.y; d.car.speed = 0;
                        d.car.isParked = true; d.state = "parked";
                    }
                });
            }
            if (m.approachT > 80) throw new Error("approach timed out");

            if (allParked) {
                m.settle += sec;
                if (m.settle > 0.6) synStartExit(m);
            }
        } else if (m.phase === "exit") {
            m.exitT += sec;
            const walking = m.actors.some(n => n.path && n.path.length);
            // Longer allowance: walk-out speed is slower (~0.95–1.03).
            if (!walking || m.exitT > 14) {
                m.actors.forEach(n => { n.path = null; synFacePlayer(n, m); });
                synPlayerFace(m, m.victor);
                m.lines = synBuildLines(m.branch);
                m.lineIdx = 0;
                m.lineWait = 0.8;
                m.phase = "dialogue";
            }
        } else if (m.phase === "dialogue") {
            m.lineWait -= sec;
            if (m.lineWait <= 0) {
                if (m.lineIdx >= m.lines.length) {
                    m.phase = "afterDialogue";
                    m.afterT = (m.branch === "paid") ? 1.8 : 1.0;   // a beat before they leave
                } else {
                    const L = m.lines[m.lineIdx++];
                    const speaker = L.who === "V" ? m.victor : player;
                    if (L.who === "V") { synFacePlayer(m.victor, m); synPlayerFace(m, m.victor); }
                    storySay(speaker, L.text, L.dur);
                    m.lineWait = L.dur + 0.25;
                }
            }
        } else if (m.phase === "afterDialogue") {
            m.afterT -= sec;
            if (m.afterT <= 0) synStartLeave(m);
        } else if (m.phase === "leave") {
            m.leaveT += sec;
            const all = m.actors.every(n => n.boarded);
            // Match slower board-walk speed (~1.15).
            if (all || m.leaveT > 14) {
                m.actors.forEach(n => { storyRemoveNpc(n); n.boarded = true; });
                synStartDepart(m);
            }
        } else if (m.phase === "depart") {
            m.departT += sec;
            let remaining = 0;
            m.cars.forEach(d => {
                if (d.state === "gone") return;
                if (d.startDelay > 0) { d.startDelay -= sec; remaining++; return; }
                synDrive(m, d, dt, true);
                const far = Math.hypot(d.car.x - m.C.x, d.car.y - m.C.y) > m.offR;
                const arrivedHome = d.idx >= d.path.length - 1 &&
                    Math.hypot(d.car.x - d.path[d.path.length - 1].x, d.car.y - d.path[d.path.length - 1].y) < 12;
                if (far || arrivedHome || m.departT > 90) synRemoveCar(d);
                else remaining++;
            });
            if (!remaining) {
                m.goneWait += sec;
                if (m.goneWait > 0.5) { synFinishMeeting(m, true); return; }
            }
        }

        m.cars.forEach(d => { if (d.state !== "gone") synEngineAudio(d.car); });
    } catch (err) {
        console.error("[Syndicate] scene aborted:", err);
        synAbortMeeting(m);
    }
}

function synCleanupScene(m) {
    m.actors.forEach(n => storyRemoveNpc(n));
    m.cars.forEach(d => { if (d.state !== "gone") synRemoveCar(d); });
    m.actors.length = 0;

    if (m.zoomBefore !== null) window.sbCutsceneZoom = m.zoomBefore;
    else delete window.sbCutsceneZoom;

    const gc = document.getElementById("gameContainer");
    if (gc) gc.classList.remove("opening-cutscene");

    player.speechText = null;
    player.speechTimer = 0;
    player.speed = 0;
    synReleaseInput();

    syndicateMeeting = null;
    syndicateMeetingActive = false;
    gameActive = true;                    // camera follow / zoom, controls, AI, physics resume
    synPhoneRefresh();
}

function synFinishMeeting(m, withMessage) {
    const s = synLoad();
    const branch = m.branch || s.branch;

    synCleanupScene(m);

    s.meetingCompleted = true;
    s.arrivalInProgress = false;
    s.meetingScheduled = true;
    s.mickeyAvailable = false;
    s.debtHudHidden = true;
    s.branch = branch;
    if (branch === "paid") {
        s.recruitmentAccepted = true;      // the player takes the Syndicate's offer
        s.dangerousMissionPending = false;
    } else {
        s.recruitmentAccepted = false;
        s.dangerousMissionPending = true;  // next chapter: the dangerous job (not implemented here)
    }
    synSave();

    if (withMessage && typeof taxiManager !== "undefined" && taxiManager) {
        taxiManager.setMessage(
            branch === "paid" ? "You accepted the Syndicate's offer." : "Your debt is still unpaid.", 240);
    }
}

// Scene failed: restore the game, stay pending, and give up gracefully after
// repeated failures so the player can never be soft-locked.
function synAbortMeeting(m) {
    const s = synLoad();
    synCleanupScene(m);
    s.attempts++;
    if (s.attempts >= SYN_MAX_ATTEMPTS) {
        console.warn("[Syndicate] scene failed repeatedly; resolving the meeting without it.");
        synFinishMeeting(m, true);
        return;
    }
    s.arrivalInProgress = false;
    s.meetingScheduled = true;
    synSave();
    synRt.arrivalDelay = 0;
    synRt.retry = 600;                     // try again in ~10 s
    synRt.stable = 0;
}

// ------------------------------------------------------------
// Test helpers (console): StreetBoundSyndicate.status() etc.
// ------------------------------------------------------------
window.StreetBoundSyndicate = {
    status: function () {
        const s = synLoad();
        return Object.assign({}, s, {
            elapsedDays: s.debtStarted ? +synElapsedDays(s).toFixed(3) : null,
            remainingDays: s.debtStarted ? synDebtRemainingDays(s) : null,
            meetingActive: syndicateMeetingActive,
            phase: syndicateMeeting ? syndicateMeeting.phase : null
        });
    },
    // Fast-forward the debt clock by whole in-game days (testing only).
    advanceDays: function (n) {
        const s = synLoad();
        s.dayCount += Math.max(0, Math.floor(n || 0));
        synSave();
        return this.status();
    },
    scheduleNow: function () {
        const s = synLoad();
        if (!s.meetingCompleted && !s.meetingScheduled) {
            s.meetingScheduled = true;
            s.scheduledBy = "call";
            synRt.arrivalDelay = 0;
            synSave();
        }
        return this.status();
    },
    reset: function () {
        try { localStorage.removeItem(STORY_SYN_KEY); } catch (e) {}
        storySyn = null;
        return "Syndicate chapter state cleared; reload the page.";
    }
};


// ============================================================
// CHAPTER 0 - POLICE INTELLIGENCE BRIEFING
// ------------------------------------------------------------
// Plays immediately BEFORE the existing opening cutscene and then calls
// startOpeningCutscene() itself (the cutscene is not touched).
//
// This is NOT a second game: it reuses
//   * NPC (entities.js)           the five officials are real NPC instances, drawn
//                                 with NPC.draw / drawBaseBody; speech uses
//                                 say() + drawSpeechBubble()
//   * drawGame (main.js)          the room, officials, briefcase and bubbles are
//                                 drawn INSIDE the normal camera transform; the
//                                 only additions are small hooks that call the
//                                 draw functions below
//   * the existing camera         window.sbCutsceneCamFocus / sbCutsceneZoom
//                                 (smoothed by sbUpdateCameraFeedback), the same
//                                 mechanism the introduction cards use
//   * isInsideHouse               the existing "indoors" flag: it already switches
//                                 off every outdoor layer (night, river, boards)
//   * important.js input          policeBriefingKey / policeBriefingPointer are
//                                 called from the EXISTING keydown / pointerdown
//                                 listeners; no listener is added here
//
// The officials never enter npcs[], so no ordinary NPC AI can touch them and
// nothing has to be removed from the normal world afterwards. The world arrays,
// the player and every saved value are left exactly as they were.
// ============================================================

const PB_PASSWORD = "05071947";                        // kept as a string: leading zero
const PB_NOTE_TEXT = "I was born on 5 july in the year india gained independence: don't forget dd-mm-yyyy";
const PB_MAX_DIGITS = 8;
const PB_ROOM = { w: 720, h: 440 };
const PB_TABLE = { x: 200, y: 190, w: 320, h: 120 };   // centre (360, 250)
const PB_SIZE = 32;                                    // NPC size used for the officials
const PB_CASE_W = 52;
const PB_CASE_H = 36;

// Seats around the table. face = NPC.angle that looks at the table.
const PB_SEATS = [
    { x: 185, y: 250, face: Math.PI / 2 },   // 1  head of the table (west end)
    { x: 290, y: 175, face: Math.PI },       // 2  north side
    { x: 290, y: 325, face: 0 },             // 3  south side, opposite 2
    { x: 430, y: 175, face: Math.PI },       // 4  north side
    { x: 430, y: 325, face: 0 }              // 5  south side
];

// Suit colour is NPC.shirtColor (existing property); formalWear adds the details.
const PB_LOOKS = [
    { shirt: "#23262d", hair: "#b9bcc2", skin: "#d7a078", accent: "#8e2b3a" },
    { shirt: "#1f3a5f", hair: "#1b1b1b", skin: "#c68642", accent: "#d6ad55" },
    { shirt: "#4b4f58", hair: "#5a3b22", skin: "#e0ac69", accent: "#2e8b84" },
    { shirt: "#3a2c27", hair: "#8a8f98", skin: "#8d5524", accent: "#e6e6e0" },
    { shirt: "#2b3342", hair: "#c9a45c", skin: "#f0c8a0", accent: "#2f6fc0" }
];

// Lock puzzle layout, in the game's logical 640x360 screen space.
const PB_LAYOUT = (function () {
    const keys = [];
    const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["remove", "0", "clear"]];
    rows.forEach((row, r) => row.forEach((id, c) => {
        keys.push({ id: id, x: 190 + c * 90, y: 104 + r * 38, w: 80, h: 32 });
    }));
    keys.push({ id: "submit", x: 190, y: 258, w: 260, h: 34 });
    return {
        panel: { x: 170, y: 24, w: 300, h: 312 },
        bar: { x: 190, y: 60, w: 260, h: 34 },
        note: { x: 456, y: 116, w: 164, h: 112 },
        keys: keys
    };
})();

let policeBriefingActive = false;       // read by main.js
let policeBriefing = null;              // all briefing-only state lives here
let policeBriefingPlayed = false;       // the briefing can only ever start once per page load

// ---- small helpers -------------------------------------------------
function pbRR(c, x, y, w, h, r) {
    c.beginPath();
    if (typeof c.roundRect === "function") c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
}

function pbTween(pb, obj, key, to, dur) {
    pb.tweens = pb.tweens.filter(t => !(t.obj === obj && t.key === key));
    pb.tweens.push({ obj: obj, key: key, from: obj[key], to: to, dur: Math.max(0.001, dur), t: 0 });
}

function pbStepTweens(pb, sec) {
    for (let i = pb.tweens.length - 1; i >= 0; i--) {
        const tw = pb.tweens[i];
        tw.t += sec;
        const u = Math.min(1, tw.t / tw.dur);
        const e = u * u * (3 - 2 * u);
        tw.obj[tw.key] = tw.from + (tw.to - tw.from) * e;
        if (u >= 1) pb.tweens.splice(i, 1);
    }
}

// ---- camera: feeds the EXISTING camera focus / zoom hooks ----------
function pbCam(pb, x, y, zoom, tau) {
    const c = pb.cam;
    c.tx = x; c.ty = y; c.tz = zoom; c.tau = tau || 1;
}

function pbCamStep(pb, sec) {
    const c = pb.cam;
    const k = c.tau > 0 ? 1 - Math.exp(-sec / c.tau) : 1;
    c.x += (c.tx - c.x) * k;
    c.y += (c.ty - c.y) * k;
    c.zoom += (c.tz - c.zoom) * k;
    window.sbCutsceneCamFocus = { x: c.x - 1, y: c.y - 1, size: 2 };   // main.js centres on this
    window.sbCutsceneZoom = c.zoom;                                    // smoothed by sbUpdateCameraFeedback
}

function pbFrameSpeaker(pb, id) {
    const s = PB_SEATS[id - 1];
    pbCam(pb, 360 + (s.x - 360) * 0.6, 250 + (s.y - 250) * 0.5, 1.3, 0.8);
}

// ============================================================
// START / FINISH
// ============================================================
function startPoliceBriefing() {
    // Can never start twice, and never while / after the opening cutscene runs.
    if (policeBriefingActive || policeBriefing || policeBriefingPlayed) return;
    if (openingCutsceneActive || storyIntro) return;
    if (hasSeenStoryIntro()) return;
    policeBriefingPlayed = true;

    const gc = document.getElementById("gameContainer");
    const joy = document.getElementById("joystickZone");

    const pb = policeBriefing = {
        t: 0,
        gen: null, waitSec: 0, until: null, finished: false,
        tweens: [],
        black: 1,                 // full-screen black (canvas overlay)
        titleAlpha: 0,
        officials: [], drawOrder: [], rt: [],
        speaker: 0, addr: 0, lookAt: null,
        act: {},                  // active gestures by official id
        shake: 0,                 // table jolt when a hand slams on it
        cam: { x: 360, y: 222, zoom: 0.8, tx: 360, ty: 222, tz: 0.8, tau: 1 },
        briefcase: { x: 430, y: 284, a: 0.12, lid: 0, paper: 0, alpha: 1, visible: true },
        puz: null,
        snap: {
            isInsideHouse: isInsideHouse,
            ispassenger: player.ispassenger,
            camAngle: camera.angle,
            camTargetAngle: camera.targetAngle,
            joyDisplay: joy ? joy.style.display : "",
            zoom: sbCameraZoom
        }
    };

    // The five officials: ordinary NPC instances (not added to npcs[]).
    for (let i = 0; i < 5; i++) {
        const L = PB_LOOKS[i], S = PB_SEATS[i];
        const n = new NPC(61001 + i, S.x, S.y, L.shirt, L.hair, L.skin, false);
        n.size = PB_SIZE;
        n.speed = 0;
        n.canFightBack = false;
        n.isFightingBack = false;
        n.punchTimer = 0;
        n.walkTimer = 0;
        n.angle = S.face;
        n.formalWear = { accent: L.accent };      // new, opt-in clothing detail (entities.js)
        n.topLayerSpeech = true;                  // bubbles are drawn in the top layer
        n.briefingPose = { l: { x: -0.36, y: -0.74 }, r: { x: 0.36, y: -0.74 } };
        n.briefingLean = 0;
        n.briefingHeadTurn = 0;
        pb.officials.push(n);
        pb.rt.push({ look: 0, sway: 0 });
    }
    pb.drawOrder = pb.officials.slice().sort((a, b) => a.y - b.y);

    // Same entry housekeeping startOpeningCutscene performs.
    showFullMap = false;
    fullMapAnimating = false;
    playerPhoneOpen = false;
    if (typeof closePlayerPhone === "function") closePlayerPhone();
    gameActive = false;

    camera.angle = 0;
    camera.targetAngle = 0;
    player.ispassenger = true;            // the player is not part of this scene
    isInsideHouse = true;                 // existing indoor mode (outdoor layers off)
    sbCameraZoom = 0.8;

    if (gc) gc.classList.add("opening-cutscene");     // existing class: hides gameplay controls
    if (joy) joy.style.display = "none";              // so it cannot sit on top of the keypad

    pb.gen = pbScript(pb);
    policeBriefingActive = true;

    if (typeof resizeCanvas === "function") resizeCanvas();
    updatePoliceBriefing(0);
    if (typeof drawGame === "function") drawGame();
}

function finishPoliceBriefing() {
    const pb = policeBriefing;
    if (!pb) return;

    // Drop every reference first: nothing can run or draw after this point.
    policeBriefing = null;
    policeBriefingActive = false;
    pb.gen = null;
    pb.tweens.length = 0;
    pb.officials.length = 0;
    pb.drawOrder.length = 0;

    window.sbCutsceneCamFocus = null;
    delete window.sbCutsceneZoom;
    sbCameraZoom = 1;                      // the opening cutscene starts from the normal zoom

    isInsideHouse = pb.snap.isInsideHouse;
    player.ispassenger = pb.snap.ispassenger;
    camera.angle = pb.snap.camAngle;
    camera.targetAngle = pb.snap.camTargetAngle;

    const joy = document.getElementById("joystickZone");
    if (joy) joy.style.display = pb.snap.joyDisplay;

    // Handoff: Police Briefing -> daytime city montage (citymontage.js) -> untouched
    // opening cutscene. The montage calls startOpeningCutscene() itself when it ends
    // or is skipped. If citymontage.js is missing or fails to start, go straight to it.
    let montageRunning = false;
    try {
        if (typeof startCityMontage === "function") montageRunning = startCityMontage();
    } catch (err) {
        console.error("[Police briefing] city montage failed:", err);
    }
    if (!montageRunning) startOpeningCutscene();

    // If it could not start (no overlay element) it already resumed the game.
    if (!montageRunning && !openingCutsceneActive) {
        const gc = document.getElementById("gameContainer");
        if (gc) gc.classList.remove("opening-cutscene");
    }
}

// ============================================================
// PER-FRAME (called from updateGame while policeBriefingActive)
// ============================================================
function updatePoliceBriefing(dt) {
    const pb = policeBriefing;
    if (!pb || !policeBriefingActive) return;

    try {
        const sec = dt / 60;
        pb.t += sec;

        // Script runner: the script yields seconds to wait, or a function to wait on.
        pb.waitSec -= sec;
        if (pb.until && pb.until()) pb.until = null;
        let guard = 0;
        while (!pb.finished && pb.waitSec <= 0 && !pb.until && guard++ < 40) {
            const r = pb.gen.next();
            if (r.done) { pb.finished = true; break; }
            if (typeof r.value === "number") pb.waitSec = r.value;
            else if (typeof r.value === "function") pb.until = r.value;
        }

        pbStepTweens(pb, sec);
        pbStepPuzzle(pb, sec);
        for (let i = 0; i < 5; i++) pbAnimOfficial(pb, i, sec);
        pb.shake *= Math.exp(-sec / 0.22);
        pbCamStep(pb, sec);

        if (pb.finished) finishPoliceBriefing();
    } catch (err) {
        // Never leave the player stuck in a broken cinematic.
        console.error("[Police briefing] aborted:", err);
        finishPoliceBriefing();
    }
}

// ============================================================
// SCRIPT
// ============================================================
function* pbSay(pb, id, text, opt) {
    opt = opt || {};
    const n = pb.officials[id - 1];
    const chunks = (typeof synChunk === "function") ? synChunk(text, 46) : [text];
    const durs = chunks.map(c => Math.max(1.5, Math.min(4.2, 1.0 + c.length * 0.045)));
    const total = durs.reduce((a, b) => a + b, 0);

    pb.speaker = id;
    pb.addr = opt.to || 0;
    if (opt.cam) pbCam(pb, opt.cam[0], opt.cam[1], opt.cam[2], opt.cam[3]);
    else pbFrameSpeaker(pb, id);
    if (opt.kind) pbGesture(pb, id, opt.kind, total + 0.4);

    for (let k = 0; k < chunks.length; k++) {
        n.say(chunks[k], Math.ceil(durs[k] * 60) + 60);
        yield durs[k];
    }
    n.speechText = null;
    n.speechTimer = 0;
    pb.speaker = 0;
    pb.addr = 0;
    yield (opt.gap === undefined ? 0.35 : opt.gap);
}

function pbGesture(pb, id, kind, dur) {
    pb.act[id] = { kind: kind, t: 0, dur: dur, hit: false };
}

function* pbScript(pb) {
    const B = pb.briefcase;

    // ---- opening: black screen + title card --------------------------
    yield 0.7;
    pbTween(pb, pb, "titleAlpha", 1, 1.3);
    yield 3.3;
    pbTween(pb, pb, "titleAlpha", 0, 1.0);
    yield 1.6;

    // ---- fade into the room: establishing shot, then towards the table
    pbTween(pb, pb, "black", 0, 1.8);
    yield 2.4;
    pbCam(pb, 360, 244, 1.02, 2.6);
    yield 2.8;

    // ---- first discussion ---------------------------------------------
    yield* pbSay(pb, 1, "Three months. Victor's Syndicate is still growing.");
    yield* pbSay(pb, 2, "We've arrested twelve of his men. It changes nothing.", { to: 3 });
    yield* pbSay(pb, 3, "Because you keep catching his soldiers, not their commander.", { to: 2 });
    yield* pbSay(pb, 2, "And what's your brilliant plan?", { to: 3 });
    yield* pbSay(pb, 3, "Maybe stop letting Victor know about our raids before we do.", { to: 2, kind: "sarcasm" });
    yield* pbSay(pb, 4, "Enough. His network controls weapons, stolen cars and black-market operations. He's practically running a second government.");

    // the briefcase is presented: it slides to the middle of the table
    pbTween(pb, B, "x", 378, 1.6);
    pbTween(pb, B, "y", 252, 1.6);
    pbTween(pb, B, "a", 0, 1.6);
    yield* pbSay(pb, 5, "Then perhaps this will help. We recovered a briefcase from one of Victor's couriers.");

    pb.lookAt = B;                                   // everybody looks at the case
    yield* pbSay(pb, 1, "Open it. Now.", { cam: [330, 250, 1.45, 1.0] });

    // ---- puzzle (dialogue is paused until it is solved) ---------------
    pbCam(pb, B.x, B.y, 1.9, 1.2);
    pb.puz = {
        open: true, openT: 0, alpha: 0, closeT: 0,
        digits: "", locked: false, solved: false, done: false,
        wrongT: 0, okT: 0, pressed: null, pressT: 0
    };
    yield () => pb.puz.done;

    // ---- briefcase reveal ---------------------------------------------
    pbCam(pb, B.x, B.y, 3.3, 1.1);
    yield 1.5;
    pbCam(pb, B.x, B.y - 16, 3.3, 1.3);              // the camera drifts to the interior
    pbTween(pb, B, "lid", 1, 1.9);
    yield 2.3;
    pbTween(pb, B, "paper", 1, 0.9);
    yield 3.6;                                       // hold on the paper
    pbTween(pb, B, "alpha", 0, 0.8);
    yield 0.9;
    B.visible = false;
    pb.lookAt = null;
    pbCam(pb, 360, 244, 1.02, 1.3);
    yield 1.7;

    // ---- remaining dialogue --------------------------------------------
    pbGesture(pb, 2, "angry", 2.6);
    yield* pbSay(pb, 2, "You've got to be kidding me.");
    yield* pbSay(pb, 3, "Three months of work... for a laughing face.", { kind: "sarcasm" });
    yield* pbSay(pb, 4, "He's laughing at us.", { kind: "frustrated" });
    yield* pbSay(pb, 2, "I'M GOING TO\u2014", { kind: "slam", gap: 0.1 });
    for (let id = 2; id <= 5; id++) pbGesture(pb, id, "flinch", 2.2);
    yield* pbSay(pb, 1, "SILENCE!", { kind: "order", gap: 0.2 });
    yield 1.2;                                       // a brief, tense pause
    yield* pbSay(pb, 1, "Victor thinks this is a joke. Let's see how he laughs when we come knocking.");

    // ---- ending: slow pull-away, fade to black, then the SUV cutscene ----
    yield 0.9;
    pbCam(pb, 360, 236, 0.78, 2.6);
    yield 0.8;
    pbTween(pb, pb, "black", 1, 2.4);
    yield 2.9;
}

// ============================================================
// OFFICIALS: gestures, reactions, small idle movements
// (uses the existing NPC drawing; only hand pose / head turn / lean are driven)
// ============================================================
function pbSlam(pb) {
    pb.shake = 1;
    if (typeof storyThud === "function") storyThud(1.0);
    if (typeof sbTriggerCameraShake === "function") sbTriggerCameraShake(3.4, 0, 1);
}

function pbAnimOfficial(pb, i, sec) {
    const n = pb.officials[i];
    const id = i + 1;
    const T = pb.t;
    const seat = PB_SEATS[i];
    const rt = pb.rt[i];

    // target pose (hands in units of the NPC size, relative to the seated body)
    const br = Math.sin(T * 1.6 + i * 2.1);
    const w = {
        lx: -0.36, ly: -0.74 + br * 0.012,
        rx: 0.36, ry: -0.74 + br * 0.012,
        lean: 0.01 * br, sway: 0, head: 0
    };

    // speaking: a free hand gestures, small nods
    if (pb.speaker === id) {
        const s = T * 4.4 + i * 1.3;
        w.rx = 0.40 + 0.12 * Math.sin(s * 0.8);
        w.ry = -0.55 + 0.16 * Math.sin(s * 0.55 + 1.2);
        w.lean += 0.03 + 0.015 * Math.sin(s);
        w.head += 0.07 * Math.sin(s * 1.1);
    }

    const A = pb.act[id];
    let fast = false;
    if (A) {
        A.t += sec;
        const env = Math.max(0, Math.min(1, A.t / 0.25, (A.dur - A.t) / 0.4));
        const mx = (a, b) => a + (b - a) * env;

        switch (A.kind) {
            case "sarcasm":        // open palms, tilting head: "oh, really?"
                w.lx = mx(w.lx, -0.84); w.ly = mx(w.ly, -0.44 + 0.05 * Math.sin(A.t * 3));
                w.rx = mx(w.rx, 0.84);  w.ry = mx(w.ry, -0.44 + 0.05 * Math.sin(A.t * 3 + 1));
                w.sway += env * 0.13 * Math.sin(A.t * 3.0);
                w.head += env * 0.20 * Math.sin(A.t * 2.4);
                w.lean = mx(w.lean, -0.02);
                break;
            case "frustrated":     // rubbing the forehead, shaking the head
                w.rx = mx(w.rx, 0.27 + 0.04 * Math.sin(A.t * 9));
                w.ry = mx(w.ry, -0.14 + 0.03 * Math.cos(A.t * 9));
                w.lx = mx(w.lx, -0.40); w.ly = mx(w.ly, -0.80);
                w.lean = mx(w.lean, 0.06);
                w.head += env * 0.22 * Math.sin(A.t * 5.0);
                break;
            case "angry":          // fists on the table, leaning in
                w.lx = mx(w.lx, -0.42); w.ly = mx(w.ly, -0.86);
                w.rx = mx(w.rx, 0.42);  w.ry = mx(w.ry, -0.86);
                w.lean = mx(w.lean, 0.10);
                w.head += env * 0.10 * Math.sin(A.t * 13);
                break;
            case "order":          // leans forward, hand up: restoring order
                w.rx = mx(w.rx, 0.34); w.ry = mx(w.ry, -1.04);
                w.lx = mx(w.lx, -0.40); w.ly = mx(w.ly, -0.88);
                w.lean = mx(w.lean, 0.17);
                break;
            case "flinch":         // everyone else pulls back a little
                w.lx = mx(w.lx, -0.30); w.ly = mx(w.ly, -0.60);
                w.rx = mx(w.rx, 0.30);  w.ry = mx(w.ry, -0.60);
                w.lean = mx(w.lean, -0.06);
                break;
            case "slam": {         // wind up, then both hands hit the table
                const t = A.t;
                const r = Math.max(0, Math.min(1, (A.dur - t) / 0.5));   // release
                let sl;
                if (t < 0.5) {
                    const e = Math.min(1, t / 0.45);
                    sl = { lx: -0.36 - 0.26 * e, ly: -0.74 + 0.44 * e, rx: 0.36 + 0.26 * e, ry: -0.74 + 0.44 * e, lean: 0.05 * e };
                } else {
                    const rattle = t > 0.58 ? 0.015 * Math.sin(t * 38) * Math.exp(-(t - 0.58) * 3) : 0;
                    sl = { lx: -0.54, ly: -1.0, rx: 0.54, ry: -1.0, lean: 0.20 + rattle };
                    fast = true;
                }
                w.lx += (sl.lx - w.lx) * r; w.ly += (sl.ly - w.ly) * r;
                w.rx += (sl.rx - w.rx) * r; w.ry += (sl.ry - w.ry) * r;
                w.lean += (sl.lean - w.lean) * r;
                if (t >= 0.58 && !A.hit) { A.hit = true; pbSlam(pb); }
                break;
            }
        }
        if (A.t >= A.dur) delete pb.act[id];
    }

    // smooth towards the target pose
    const kArm = 1 - Math.exp(-sec / (fast ? 0.045 : 0.09));
    const kBody = 1 - Math.exp(-sec / 0.18);
    const P = n.briefingPose;
    P.l.x += (w.lx - P.l.x) * kArm; P.l.y += (w.ly - P.l.y) * kArm;
    P.r.x += (w.rx - P.r.x) * kArm; P.r.y += (w.ry - P.r.y) * kArm;
    n.briefingLean += (w.lean - n.briefingLean) * kBody;

    // who this official is looking at: the person they address, the speaker,
    // or the briefcase while it is on the table
    let target = null;
    if (pb.speaker === id) { if (pb.addr) target = pb.officials[pb.addr - 1]; }
    else if (pb.speaker) target = pb.officials[pb.speaker - 1];
    else if (pb.lookAt) target = pb.lookAt;

    let want = 0;
    if (target) {
        const ang = Math.atan2(target.y - n.y, target.x - n.x) + Math.PI / 2;
        want = Math.max(-1.25, Math.min(1.25, synAngleDiff(ang, seat.face)));
    }
    rt.look += (want - rt.look) * (1 - Math.exp(-sec / 0.30));
    rt.sway += (w.sway - rt.sway) * kBody;

    n.angle = seat.face + rt.look * 0.3 + rt.sway;                       // torso turns a little
    n.briefingHeadTurn = rt.look * 0.7 + 0.06 * Math.sin(T * 0.8 + i * 1.9) + w.head;   // head more
}

// ============================================================
// DRAWING - everything below draws into the existing ctx, inside the
// existing camera transform set up by drawGame().
// ============================================================

// ---- scene props: documents ----------------------------------------
function pbPaper(c, x, y, w, h, r) {
    c.save();
    c.translate(x, y); c.rotate(r);
    c.fillStyle = "rgba(0,0,0,0.22)"; c.fillRect(-w / 2 + 1, -h / 2 + 2, w, h);
    c.fillStyle = "#f3f1ea"; c.fillRect(-w / 2, -h / 2, w, h);
    c.strokeStyle = "rgba(60,60,70,0.35)"; c.lineWidth = 0.8;
    for (let ly = -h / 2 + 4; ly < h / 2 - 2; ly += 3.6) {
        c.beginPath(); c.moveTo(-w / 2 + 3, ly); c.lineTo(w / 2 - 3 - ((ly * 7) % 6 + 6) % 6, ly); c.stroke();
    }
    c.restore();
}

function pbPhoto(c, x, y, r) {
    c.save();
    c.translate(x, y); c.rotate(r);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(-9, -6.5, 20, 15);
    c.fillStyle = "#f4f4f0"; c.fillRect(-10, -7.5, 20, 15);
    c.fillStyle = "#2a3440"; c.fillRect(-8.5, -6, 17, 12);
    c.fillStyle = "#8896a6";
    c.beginPath(); c.arc(0, -1.5, 2.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(0, 4.2, 4.6, 2.6, 0, Math.PI, 0); c.fill();
    c.restore();
}

function pbFolder(c, x, y, w, h, r) {
    c.save();
    c.translate(x, y); c.rotate(r);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(-w / 2 + 1.5, -h / 2 + 2, w, h);
    c.fillStyle = "#c9a35b"; c.fillRect(-w / 2, -h / 2 - 3, w * 0.38, 4);   // tab
    c.fillStyle = "#d9b36c"; c.fillRect(-w / 2, -h / 2, w, h);
    c.strokeStyle = "#a8823f"; c.lineWidth = 1; c.strokeRect(-w / 2, -h / 2, w, h);
    c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(-w / 2 + 4, -h / 2 + 5, w * 0.5, 2);
    c.restore();
}

function pbMug(c, x, y) {
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.arc(x + 1.5, y + 2, 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#f2f2f2"; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#4b2e1a"; c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#f2f2f2"; c.lineWidth = 1.6;
    c.beginPath(); c.arc(x + 6, y, 2.4, -1.2, 1.2); c.stroke();
}

function pbDrawDocs(c, j) {
    pbFolder(c, 224, 250 + j, 34, 24, -0.12);          // in front of 1
    pbPaper(c, 262, 214 + j, 26, 20, 0.15);            // 2
    pbPaper(c, 316, 222 + j, 24, 18, -0.10);
    pbPhoto(c, 288, 234 + j, 0.2);
    pbMug(c, 402, 206 + j);                            // 4
    pbFolder(c, 446, 216 + j, 30, 22, 0.08);
    pbPhoto(c, 482, 228 + j, 0.35);
    pbPaper(c, 268, 290 + j, 26, 20, -0.12);           // 3
    pbPhoto(c, 318, 284 + j, -0.25);
    c.fillStyle = "#101114"; c.save(); c.translate(300, 298 + j); c.rotate(0.5); c.fillRect(-7, -1, 14, 2); c.restore();
    pbMug(c, 484, 292 + j);                            // 5
    pbPaper(c, 398, 296 + j, 24, 18, 0.1);
    pbPhoto(c, 326, 246 + j, -0.2);                    // centre of the table
    pbPhoto(c, 332, 270 + j, 0.28);
    pbPhoto(c, 418, 262 + j, 0.1);
}

function pbWindow(c, x, y, w, h) {
    c.fillStyle = "#8d99a6"; c.fillRect(x - 4, y - 4, w + 8, h + 8);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#0b1830"); g.addColorStop(1, "#1d3557");
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = "rgba(255,214,130,0.85)";
    for (let k = 0; k < 10; k++) {
        c.fillRect(x + 6 + ((k * 37) % (w - 14)), y + h - 8 - ((k * 11) % 20), 3, 3);
    }
    c.fillStyle = "#8d99a6";
    c.fillRect(x + w / 2 - 1.5, y, 3, h); c.fillRect(x, y + h / 2 - 1.5, w, 3);
    c.fillStyle = "rgba(255,255,255,0.06)";
    c.beginPath(); c.moveTo(x + 8, y + h); c.lineTo(x + 30, y); c.lineTo(x + 44, y); c.lineTo(x + 22, y + h); c.fill();
    c.fillStyle = "#b4bcc6"; c.fillRect(x - 6, y + h + 4, w + 12, 5);
}

function pbCabinet(c, x, y) {
    c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(x + 3, y + 4, 56, 40);
    c.fillStyle = "#6b7785"; c.fillRect(x, y, 56, 40);
    c.fillStyle = "#8795a3"; c.fillRect(x, y, 56, 5);
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { c.strokeRect(x + 3, y + 8 + k * 10, 50, 9); }
    c.fillStyle = "#c9d1d9";
    for (let k = 0; k < 3; k++) { c.fillRect(x + 23, y + 11 + k * 10, 10, 2.5); }
}

function pbDrawChair(c, s) {
    c.save();
    c.translate(s.x, s.y); c.rotate(s.face);
    c.fillStyle = "rgba(0,0,0,0.28)"; pbRR(c, -17, -12, 36, 36, 8); c.fill();
    c.fillStyle = "#1b232c"; pbRR(c, -18, -16, 36, 34, 9); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = "#141a21"; pbRR(c, -20, 13, 40, 9, 4); c.fill();          // backrest (behind the person)
    c.fillStyle = "#10151b";
    pbRR(c, -23, -8, 5, 22, 2); c.fill();                                   // armrests
    pbRR(c, 18, -8, 5, 22, 2); c.fill();
    c.restore();
}

// ---- the office: floor, walls, furniture, table, documents --------------
function drawPoliceBriefingRoom(ctx) {
    const pb = policeBriefing;
    const W = PB_ROOM.w, H = PB_ROOM.h, T = PB_TABLE;

    // beyond the room
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(-900, -700, W + 1800, H + 1400);

    // floor (same tile language as the dealership floor)
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // rug under the table
    ctx.fillStyle = "#223140"; pbRR(ctx, 150, 140, 420, 220, 14); ctx.fill();
    ctx.strokeStyle = "rgba(0, 188, 212, 0.35)"; ctx.lineWidth = 2; pbRR(ctx, 158, 148, 404, 204, 10); ctx.stroke();

    // north wall
    ctx.fillStyle = "#3d4b5c"; ctx.fillRect(0, 0, W, 78);
    ctx.fillStyle = "#2a3542"; ctx.fillRect(0, 70, W, 8);
    const sh = ctx.createLinearGradient(0, 78, 0, 104);
    sh.addColorStop(0, "rgba(0,0,0,0.35)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh; ctx.fillRect(0, 78, W, 26);
    pbWindow(ctx, 150, 14, 100, 48);
    pbWindow(ctx, 470, 14, 100, 48);

    // investigation board (photos + red string)
    ctx.fillStyle = "#5a3d24"; ctx.fillRect(306, 8, 108, 58);
    ctx.fillStyle = "#b5895a"; ctx.fillRect(310, 12, 100, 50);
    const pins = [[322, 26], [352, 22], [384, 28], [334, 46], [372, 48], [398, 44]];
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1;
    ctx.beginPath();
    pins.forEach((p, k) => { if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    pins.forEach(p => {
        ctx.fillStyle = "#f4f4f0"; ctx.fillRect(p[0] - 7, p[1] - 6, 14, 11);
        ctx.fillStyle = "#2a3440"; ctx.fillRect(p[0] - 5.5, p[1] - 4.5, 11, 8);
        ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(p[0], p[1] - 6, 1.6, 0, Math.PI * 2); ctx.fill();
    });

    // furniture along the walls
    pbCabinet(ctx, 30, 92);
    pbCabinet(ctx, 634, 92);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(27, 372, 62, 44);
    ctx.fillStyle = "#4a3a2a"; ctx.fillRect(24, 368, 62, 44);                // side table
    ctx.fillStyle = "#1c1f25"; ctx.fillRect(32, 374, 16, 14);                // coffee machine
    ctx.fillStyle = "#c0392b"; ctx.fillRect(36, 378, 4, 3);
    pbMug(ctx, 62, 384); pbMug(ctx, 62, 398);
    ctx.fillStyle = "#6b4a2f"; ctx.fillRect(330, H - 16, 60, 16);            // door
    ctx.fillStyle = "#c9a227"; ctx.fillRect(378, H - 10, 6, 3);
    ctx.fillStyle = "#7a4a2a"; ctx.beginPath(); ctx.arc(690, 402, 14, 0, Math.PI * 2); ctx.fill();   // plant
    ctx.fillStyle = "#2e8b57";
    for (let k = 0; k < 7; k++) {
        const a = k * 0.9;
        ctx.beginPath(); ctx.arc(690 + Math.cos(a) * 8, 402 + Math.sin(a) * 8, 8, 0, Math.PI * 2); ctx.fill();
    }

    // room outline (dealership convention)
    ctx.strokeStyle = "#111111"; ctx.lineWidth = 12; ctx.strokeRect(0, 0, W, H);

    // chairs, then the table
    for (let i = 0; i < PB_SEATS.length; i++) pbDrawChair(ctx, PB_SEATS[i]);

    ctx.fillStyle = "rgba(0,0,0,0.35)"; pbRR(ctx, T.x + 5, T.y + 8, T.w, T.h, 10); ctx.fill();
    ctx.fillStyle = "#3b2616"; pbRR(ctx, T.x, T.y, T.w, T.h, 10); ctx.fill();
    ctx.fillStyle = "#6e4b2e"; pbRR(ctx, T.x + 4, T.y + 4, T.w - 8, T.h - 8, 8); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
        const gy = T.y + 14 + k * 11;
        ctx.beginPath(); ctx.moveTo(T.x + 12, gy); ctx.lineTo(T.x + T.w - 12 - (k % 3) * 20, gy + (k % 2 ? 1.5 : -1.5)); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 235, 200, 0.14)"; ctx.lineWidth = 1.5;
    pbRR(ctx, T.x + 7, T.y + 7, T.w - 14, T.h - 14, 6); ctx.stroke();

    // papers, photographs, folders (they jump when a hand slams the table)
    const jolt = pb ? pb.shake * Math.sin(pb.t * 55) * 1.6 : 0;
    pbDrawDocs(ctx, jolt);

    // warm light pool from the lamp above the table
    const lg = ctx.createRadialGradient(360, 250, 20, 360, 250, 330);
    lg.addColorStop(0, "rgba(255, 238, 200, 0.14)");
    lg.addColorStop(1, "rgba(255, 238, 200, 0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
}

// ---- the officials: the normal NPC.draw --------------------------------
function drawPoliceBriefingActors(ctx) {
    const pb = policeBriefing;
    if (!pb) return;
    for (let i = 0; i < pb.drawOrder.length; i++) pb.drawOrder[i].draw(ctx);
}

// ---- briefcase -----------------------------------------------------------
function pbDrawCasePaper(c, p) {
    c.save();
    c.globalAlpha *= p;
    c.translate(0, 4 * (1 - p));
    c.rotate(-0.04);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(-17, -11, 36, 25);
    c.fillStyle = "#fbfaf5"; c.fillRect(-18, -12.5, 36, 25);
    c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 0.7; c.strokeRect(-18, -12.5, 36, 25);
    c.font = "21px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#000000";
    c.fillText("\uD83D\uDE02", 0, 1);
    c.restore();
}

function pbDrawCase(c, b) {
    const W = PB_CASE_W, H = PB_CASE_H;
    const th = b.lid * Math.PI * 0.93;           // lid angle, hinged on the north edge
    const cosT = Math.cos(th);

    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, b.alpha));
    c.translate(b.x, b.y);
    c.rotate(b.a);

    c.fillStyle = "rgba(0,0,0,0.32)"; pbRR(c, -W / 2 + 2, -H / 2 + 3, W, H, 4); c.fill();
    c.fillStyle = "#0b0c0e"; pbRR(c, -9, H / 2 - 1, 18, 4, 2); c.fill();      // carry handle

    c.fillStyle = "#15171b"; pbRR(c, -W / 2, -H / 2, W, H, 4); c.fill();       // base shell

    if (b.lid > 0.02) {                                                         // interior lining
        c.fillStyle = "#3b1a22"; pbRR(c, -W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 2); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 0.8;
        if (c.setLineDash) c.setLineDash([2, 2]);
        pbRR(c, -W / 2 + 5, -H / 2 + 5, W - 10, H - 10, 2); c.stroke();
        if (c.setLineDash) c.setLineDash([]);
        if (b.paper > 0.01) pbDrawCasePaper(c, Math.min(1, b.paper));           // the only content
    }

    if (cosT >= 0) {
        const h = Math.max(0.5, H * cosT);                                      // lid, outer face
        c.fillStyle = "#1c1f25"; pbRR(c, -W / 2, -H / 2, W, h, 4); c.fill();
        if (h > 8) {
            c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 1;
            pbRR(c, -W / 2 + 2, -H / 2 + 2, W - 4, h - 4, 3); c.stroke();
            c.fillStyle = "rgba(255,255,255,0.05)"; c.fillRect(-W / 2 + 3, -H / 2 + 3, W - 6, Math.min(5, h * 0.2));
        }
        if (cosT > 0.3) {                                                       // clasps + dials on the front edge
            c.fillStyle = "#c9a227";
            c.fillRect(-W * 0.30 - 4, -H / 2 + h - 6, 8, 5);
            c.fillRect(W * 0.30 - 4, -H / 2 + h - 6, 8, 5);
            c.fillStyle = "#b0b6bd";
            for (let k = -1; k <= 1; k++) { c.beginPath(); c.arc(k * 6, -H / 2 + h - 4, 1.7, 0, Math.PI * 2); c.fill(); }
        }
    } else {
        const h = H * -cosT;                                                    // lid, inner face (beyond the hinge)
        c.fillStyle = "#2a1218"; pbRR(c, -W / 2, -H / 2 - h, W, h, 4); c.fill();
        if (h > 8) {
            c.strokeStyle = "rgba(255,255,255,0.08)"; c.lineWidth = 0.8;
            pbRR(c, -W / 2 + 3, -H / 2 - h + 3, W - 6, h - 6, 2); c.stroke();
        }
        c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(-W / 2, -H / 2 - 1.5, W, 3);   // hinge shadow
    }
    c.restore();
}

// ---- top layer inside the camera transform: briefcase + speech bubbles ----
function drawPoliceBriefingTopLayer(ctx) {
    const pb = policeBriefing;
    if (!pb) return;

    if (pb.briefcase.visible) pbDrawCase(ctx, pb.briefcase);

    for (let i = 0; i < pb.officials.length; i++) {
        const n = pb.officials[i];
        if (!n.speechText) continue;
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.angle);              // drawSpeechBubble counter-rotates it upright
        n.drawSpeechBubble(ctx);
        ctx.restore();
    }
}

// ============================================================
// LOCK PUZZLE
// ============================================================
function pbStepPuzzle(pb, sec) {
    const z = pb.puz;
    if (!z) return;
    if (z.open) z.openT = Math.min(1, z.openT + sec / 0.35);
    if (z.pressT > 0) z.pressT -= sec;
    if (z.wrongT > 0) z.wrongT = Math.max(0, z.wrongT - sec);
    if (z.solved) {
        z.okT += sec;
        z.closeT = Math.max(0, Math.min(1, (z.okT - 1.0) / 0.4));
        if (z.okT >= 1.45 && !z.done) { z.done = true; z.open = false; }
    }
    z.alpha = z.openT * (1 - z.closeT);
}

function pbPuzzleAction(pb, id) {
    const z = pb.puz;
    if (!z || !z.open || z.locked || z.openT < 0.85) return;

    z.pressed = id;
    z.pressT = 0.14;

    if (id === "submit") {
        if (z.digits === PB_PASSWORD) {
            z.locked = true;               // disables every further input
            z.solved = true;
            z.okT = 0;
            z.wrongT = 0;
        } else {
            z.wrongT = 0.8;                // digits flash red, puzzle stays open, input kept
        }
        return;
    }

    z.wrongT = 0;
    if (id === "remove") z.digits = z.digits.slice(0, -1);
    else if (id === "clear") z.digits = "";
    else if (/^[0-9]$/.test(id) && z.digits.length < PB_MAX_DIGITS) z.digits += id;
}

// Called from the existing window keydown listener (important.js).
// Returns true when the briefing consumed the key.
function policeBriefingKey(e) {
    if (!policeBriefingActive || !policeBriefing) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return true;         // never reaches the game; browser shortcuts still work

    const pb = policeBriefing, z = pb.puz;
    const live = z && z.open && !z.locked && z.openT >= 0.85;

    if (live) {
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            if (!e.repeat) pbPuzzleAction(pb, e.key);
            return true;
        }
        if (e.key === "Backspace") { e.preventDefault(); pbPuzzleAction(pb, "remove"); return true; }
        if (e.key === "Escape") { e.preventDefault(); if (!e.repeat) pbPuzzleAction(pb, "clear"); return true; }
        if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) pbPuzzleAction(pb, "submit"); return true; }
    }

    // keep Space / arrows / H etc. from scrolling the page or reaching the game
    if (e.code === "Space" || (e.key && e.key.indexOf("Arrow") === 0)) e.preventDefault();
    return true;
}

// Called from the existing canvas pointerdown listener (mouse + touch).
function policeBriefingPointer(x, y) {
    if (!policeBriefingActive || !policeBriefing) return false;
    const pb = policeBriefing, z = pb.puz;
    if (z && z.open && !z.locked && z.openT >= 0.85) {
        for (let i = 0; i < PB_LAYOUT.keys.length; i++) {
            const k = PB_LAYOUT.keys[i];
            if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) {
                pbPuzzleAction(pb, k.id);
                break;
            }
        }
    }
    return true;                                   // taps never reach the game underneath
}

function pbWrapText(c, text, maxW) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach(w => {
        const t = line ? line + " " + w : w;
        if (line && c.measureText(t).width > maxW) { lines.push(line); line = w; }
        else line = t;
    });
    if (line) lines.push(line);
    return lines;
}

function pbDrawNote(c, n) {
    c.save();
    c.translate(n.x + n.w / 2, n.y + n.h / 2);
    c.rotate(0.07);

    c.fillStyle = "rgba(0,0,0,0.38)"; c.fillRect(-n.w / 2 + 3, -n.h / 2 + 4, n.w, n.h);
    c.fillStyle = "#f4ecc6"; c.fillRect(-n.w / 2, -n.h / 2, n.w, n.h);
    c.fillStyle = "#dcd29f";                                                    // folded corner
    c.beginPath(); c.moveTo(n.w / 2, n.h / 2 - 14); c.lineTo(n.w / 2 - 14, n.h / 2); c.lineTo(n.w / 2, n.h / 2); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 1; c.strokeRect(-n.w / 2, -n.h / 2, n.w, n.h);

    c.fillStyle = "#2b3a7a";
    c.font = "italic bold 11.5px 'Segoe Print','Bradley Hand','Comic Sans MS',Arial,sans-serif";
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    const lines = pbWrapText(c, PB_NOTE_TEXT, n.w - 24);
    lines.forEach((ln, k) => c.fillText(ln, -n.w / 2 + 12, -n.h / 2 + 30 + k * 15));

    c.fillStyle = "#c0392b"; c.beginPath(); c.arc(0, -n.h / 2 + 8, 5, 0, Math.PI * 2); c.fill();   // pin
    c.fillStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.arc(-1.5, -n.h / 2 + 6.5, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
}

function pbDrawPuzzle(c, pb) {
    const z = pb.puz;
    const L = PB_LAYOUT, P = L.panel;
    const a = Math.max(0, Math.min(1, z.alpha));
    if (a <= 0.001) return;

    // dim the room behind the lock
    c.fillStyle = "rgba(5, 8, 12, " + (0.55 * a) + ")";
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.save();
    c.globalAlpha = a;
    const sc = 0.92 + 0.08 * z.openT;
    c.translate(canvas.width / 2, canvas.height / 2);
    c.scale(sc, sc);
    c.translate(-canvas.width / 2, -canvas.height / 2);

    // panel
    c.fillStyle = "rgba(18, 22, 28, 0.97)"; pbRR(c, P.x, P.y, P.w, P.h, 12); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 3; c.stroke();
    c.save();
    pbRR(c, P.x, P.y, P.w, P.h, 12); c.clip();
    c.fillStyle = "#f1c40f"; c.fillRect(P.x, P.y, P.w, 26);
    c.restore();
    c.fillStyle = "#111111"; c.font = "bold 13px Arial"; c.textBaseline = "middle"; c.textAlign = "left";
    c.fillText("SECURE CASE LOCK", P.x + 12, P.y + 14);
    c.textAlign = "right"; c.font = "bold 9px Arial";
    c.fillText("CLASSIFIED", P.x + P.w - 12, P.y + 14);

    // input bar
    const B = L.bar;
    const wrongE = 0.8 - z.wrongT;
    const wrongOn = z.wrongT > 0 && Math.floor(wrongE / 0.12) % 2 === 0;
    const okOn = z.solved && z.okT < 1.0 && (z.okT % 0.5) < 0.25;      // two green flashes
    const shakeX = z.wrongT > 0 ? Math.sin(wrongE * 60) * 4 * (z.wrongT / 0.8) : 0;

    c.save();
    c.translate(shakeX, 0);
    c.fillStyle = okOn ? "#27ae60" : "#07090c"; pbRR(c, B.x, B.y, B.w, B.h, 5); c.fill();
    c.strokeStyle = wrongOn ? "#e74c3c" : (okOn ? "#2ecc71" : "#ffffff"); c.lineWidth = 2; c.stroke();
    c.font = "bold 20px 'Courier New', monospace";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = wrongOn ? "#e74c3c" : "#ffffff";                     // digits are shown, never masked
    for (let k = 0; k < z.digits.length; k++) {
        c.fillText(z.digits[k], B.x + 20 + k * 27, B.y + B.h / 2 + 1);
    }
    if (!z.locked && z.digits.length < PB_MAX_DIGITS && Math.floor(performance.now() / 450) % 2 === 0) {
        c.fillStyle = "rgba(255,255,255,0.7)";
        c.fillRect(B.x + 13 + z.digits.length * 27 + 7, B.y + 8, 2, B.h - 16);
    }
    c.restore();

    // keys
    c.font = "bold 15px Arial";
    for (let i = 0; i < L.keys.length; i++) {
        const k = L.keys[i];
        const pressed = z.pressed === k.id && z.pressT > 0;
        let fill = "#2c3e50", txt = "#ffffff", label = k.id;
        if (k.id === "remove") { fill = "#8a5a12"; label = "REMOVE"; }
        else if (k.id === "clear") { fill = "#7b241c"; label = "CLEAR"; }
        else if (k.id === "submit") { fill = "#2ecc71"; txt = "#0b1f12"; label = "SUBMIT"; }

        c.globalAlpha = a * (z.locked && !z.solved ? 0.5 : (z.solved ? 0.55 : 1));
        const oy = pressed ? 1 : 0;
        c.fillStyle = fill; pbRR(c, k.x, k.y + oy, k.w, k.h, 6); c.fill();
        if (pressed) { c.fillStyle = "rgba(255,255,255,0.28)"; pbRR(c, k.x, k.y + oy, k.w, k.h, 6); c.fill(); }
        c.strokeStyle = "#ffffff"; c.lineWidth = 1.5; pbRR(c, k.x, k.y + oy, k.w, k.h, 6); c.stroke();
        c.fillStyle = txt;
        c.font = (k.id.length > 1 ? "bold 12px Arial" : "bold 16px Arial");
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(label, k.x + k.w / 2, k.y + k.h / 2 + 1 + oy);
    }
    c.globalAlpha = a;

    // footer
    c.fillStyle = "rgba(255,255,255,0.45)"; c.font = "9px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("8-DIGIT ACCESS CODE", P.x + P.w / 2, P.y + P.h - 26);
    c.fillText("ENTER \u2022 BACKSPACE \u2022 ESC", P.x + P.w / 2, P.y + P.h - 13);

    // the clue, pinned to the side of the interface
    pbDrawNote(c, L.note);

    c.restore();
}

// ============================================================
// SCREEN-SPACE OVERLAY (end of drawGame): lock puzzle, black fade, title card
// ============================================================
function drawPoliceBriefingOverlay(ctx) {
    const pb = policeBriefing;
    if (!pb) return;

    if (pb.puz && pb.puz.open) pbDrawPuzzle(ctx, pb);

    if (pb.black > 0.001) {
        ctx.fillStyle = "rgba(0, 0, 0, " + Math.min(1, pb.black) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (pb.titleAlpha > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, pb.titleAlpha);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("At the intelligence office...", canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }
}
