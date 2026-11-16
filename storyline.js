// streetbound-storyline12
// ===== OPENING CUTSCENE & STORYLINE (extracted from important.js) =====

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
const STORY_DEBT_DAYS = 14;

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
    say(50.5, boss, "You have to pay me in two weeks!", 2.4);
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
const STORY_CARD_T_OUT0 = 3.5;         // card fade-out + camera return start
const STORY_CARD_T_FADE_OUT1 = 4.2;    // card fully gone
const STORY_CARD_T_CAM_OUT1 = 4.6;     // camera back at its original place
const STORY_CARD_T_MAX = 6.5;          // hard cap so a pause can never hang

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
