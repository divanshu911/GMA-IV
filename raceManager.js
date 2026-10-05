console.log("parrot");
// ============================================================
// STREETBOUND RACE EVENTS MANAGER
// ============================================================
// Phase 1:
// - Random race time
// - Random safe road start / finish
// - Random road checkpoints
// - Route validation through existing A*
// - 2-hour-before notification
// - Phone race message
// - Start marker
// - Join button
// - Player-owned-car validation
// - Race transition / car orientation
// - Race markers
// - Automatic race ending (3h player / 1h NPC)
// - Finish message
//
// Race opponents (4 cars, own A* driving AI) are handled by
// RaceOpponentManager; there is no ranking / prize system yet.
// Checkpoint progression is tracked in order; the race
// finishes when the finish is reached with all checkpoints done.
// ============================================================

// ============================================================
// RACE OPPONENTS
// ============================================================
// Opponent cars live in the shared `cars` array (so they draw,
// collide and make sound like any other car), but their
// movement is driven ONLY by RaceOpponentManager below.
// Their instance `updateAI` is replaced with a no-op, so the
// normal NPC-car AI never touches them.
//
// To change which car opponents use for a race type, edit
// RACE_OPPONENT_CAR_BY_RACE_TYPE / RACE_OPPONENT_CAR_PRESETS.
// ============================================================

const RACE_OPPONENT_COUNT = 4;

// Preset key used when a race type has no entry of its own.
const RACE_OPPONENT_DEFAULT_CAR = "Commuter Sedan";

// raceType -> preset key. The race manager sets `this.raceType`
// ("street" for now); add entries here when new race types exist.
const RACE_OPPONENT_CAR_BY_RACE_TYPE = {
    street: "Commuter Sedan"
};

// Preset key -> stats applied to the created Car.
// `type` is the exact string the game uses for that car.
// NOTE: width/length/baseSpeed mirror the values the existing
// "Commuter, Sedan" police car in main.js uses. Adjust them if
// your Commuter Sedan definition differs.
const RACE_OPPONENT_CAR_PRESETS = {
    "Commuter Sedan": {
        type: "Commuter, Sedan",
        width: 16,
        length: 28,
        baseSpeed: 3.2
    }
};

// AI tuning. Time values are in frames (dt is ~1 per frame).
const RACE_OPPONENT_AI = {
    startDelay: 60,            // wait after the fade before driving off

    topSpeedFactorMin: 0.40,   // top speed = baseSpeed * 3 * factor
    topSpeedFactorMax: 0.50,   // (the player's cap is baseSpeed * 3)
    acceleration: 0.08,
    braking: 0.25,
    turnRate: 0.06,

    waypointReach: 36,         // px to count a path waypoint as reached
    checkpointReach: 50,       // px to count a checkpoint as reached
    finishReach: 50,           // px to count the finish as reached

    repathMinInterval: 90,     // never repath more often than this
    offPathDistance: 150,      // repath if pushed this far off the path
    stuckCheckInterval: 60,
    stuckDistance: 10,         // moved less than this = stuck
    recoverFrames: 45,         // beeline/side-step time after being stuck

    separationRadius: 48,      // keep this far from other racers/player
    separationWeight: 1.0,
    frontSlowDistance: 46,     // ease off if a racer is right ahead

    buildingProbeRadius: 18,   // small building avoidance radius
    buildingAvoidWeight: 0.5
};

// Pre-race staging: opponents spawn on roads when the race
// notification is sent and drive to the start with the same
// A* navigation / AI the arrest transport car uses.
const RACE_OPPONENT_STAGING = {
    travelSpeed: 3.2,          // same speed the arrest transport drives at
    arriveRadius: 60,          // px from the start that counts as "arrived"
    minDistFromStart: 250,     // preferred spawn distance from the start
    minDistFromPlayer: 500,    // preferred spawn distance from the player
    minDistBetween: 200,       // preferred spacing between opponents
    spawnAttempts: 40
};

function raceHslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const toHex = v =>
        Math.round(v * 255).toString(16).padStart(2, "0");

    return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

class RaceOpponent {
    constructor(car, index) {
        const cfg = RACE_OPPONENT_AI;

        this.car = car;
        this.index = index;

        this.topSpeedFactor =
            cfg.topSpeedFactorMin +
            Math.random() *
            (cfg.topSpeedFactorMax - cfg.topSpeedFactorMin);

        this.targetIndex = 0;      // index into checkpoints + finish
        this.path = null;
        this.pathIndex = 0;
        this.repathCooldown = index * 4;   // staggers first A* calls
        this.forceRepath = false;

        this.startDelay = cfg.startDelay;
        this.finished = false;
        this.place = null;         // 1 = first to finish, 2 = second...

        // "TRAVELING" -> "ARRIVED" (before the race), "RACING"
        // (lined up / driving the race). `eliminated` is set if the
        // car breaks down / explodes before the race starts.
        this.phase = "RACING";
        this.eliminated = false;

        this.stuckTimer = 0;
        this.stuckX = car.x;
        this.stuckY = car.y;
        this.recoverTimer = 0;
        this.recoverSide = 1;
    }
}

class RaceOpponentManager {
    constructor(race) {
        this.race = race;
        this.opponents = [];
        this.pathBudget = 1;
    }

    hasOpponents() {
        return this.opponents.length > 0;
    }
    allFinished() {
        return (
            this.opponents.length === RACE_OPPONENT_COUNT &&
            this.opponents.every(
                opp => opp.finished || opp.eliminated
            )
        );
    }

    // ----------------------------------------------------
    // SPAWN / CLEAR
    // ----------------------------------------------------

    createCar(id, slot, angle, color, preset) {
        const car = new Car(id, slot.x, slot.y, color, false, preset.type);

        car.type = preset.type;

        if (preset.width !== undefined) car.width = preset.width;
        if (preset.length !== undefined) car.length = preset.length;
        if (preset.baseSpeed !== undefined) car.baseSpeed = preset.baseSpeed;

        car.ownerType = "raceOpponent";
        car.isRaceOpponent = true;

        car.isParked = false;
        car.hasDriver = true;

        car.angle = angle;
        car.speed = 0;

        // Opponents never use the NPC car AI.
        car.updateAI = function () {};

        return car;
    }

    spawn(slots, routeAngle, carKey) {
        this.clear();

        if (
            typeof Car !== "function" ||
            typeof cars === "undefined"
        ) {
            
            return;
        }

        const preset =
            RACE_OPPONENT_CAR_PRESETS[carKey] ||
            RACE_OPPONENT_CAR_PRESETS[RACE_OPPONENT_DEFAULT_CAR];

        const carAngle = routeAngle + Math.PI / 2;
        const baseHue = Math.random() * 360;
        const baseId = Date.now() + 920000;

        for (let i = 0; i < slots.length; i++) {
            // Spread hues so opponents look different from each other.
            const hue =
                baseHue +
                i * (360 / slots.length) +
                (Math.random() - 0.5) * 30;

            const color = raceHslToHex(hue, 70 + Math.random() * 20, 45 + Math.random() * 15);

            const car = this.createCar(
                baseId + i * 137 + Math.floor(Math.random() * 100),
                slots[i],
                carAngle,
                color,
                preset
            );

            cars.push(car);
            this.opponents.push(new RaceOpponent(car, i));
        }
    }

    // ----------------------------------------------------
    // PRE-RACE STAGING
    // ----------------------------------------------------

    pickStagingSpawn(taken) {
        const cfg = RACE_OPPONENT_STAGING;
        const start = this.race.start;
        const hasPlayer =
            typeof player !== "undefined" && player;

        let fallback = null;

        for (let attempt = 0; attempt < cfg.spawnAttempts; attempt++) {
            const candidate = getRandomStrictRoadPosition();

            if (
                !candidate ||
                !Number.isFinite(candidate.x) ||
                !Number.isFinite(candidate.y)
            ) {
                continue;
            }

            if (!fallback) {
                fallback = candidate;
            }

            if (
                start &&
                Math.hypot(candidate.x - start.x, candidate.y - start.y) < cfg.minDistFromStart
            ) {
                continue;
            }

            if (
                hasPlayer &&
                Math.hypot(candidate.x - player.x, candidate.y - player.y) < cfg.minDistFromPlayer
            ) {
                continue;
            }

            if (
                taken.some(
                    t => Math.hypot(candidate.x - t.x, candidate.y - t.y) < cfg.minDistBetween
                )
            ) {
                continue;
            }

            return candidate;
        }

        return fallback || getRandomStrictRoadPosition();
    }

    // Called once, when the race notification is sent to the player.
    // Spawns the opponents at road positions around the map; they then
    // drive to the start location (see updateStagingOpponent).
    spawnRoadOpponents(carKey) {
        if (
            this.opponents.length > 0 ||
            !this.race.start ||
            typeof Car !== "function" ||
            typeof cars === "undefined" ||
            typeof getRandomStrictRoadPosition !== "function"
        ) {
            return;
        }

        const preset =
            RACE_OPPONENT_CAR_PRESETS[carKey] ||
            RACE_OPPONENT_CAR_PRESETS[RACE_OPPONENT_DEFAULT_CAR];

        const baseHue = Math.random() * 360;
        const baseId = Date.now() + 920000;
        const taken = [];

        for (let i = 0; i < RACE_OPPONENT_COUNT; i++) {
            const pos = this.pickStagingSpawn(taken);

            taken.push(pos);

            const hue =
                baseHue +
                i * (360 / RACE_OPPONENT_COUNT) +
                (Math.random() - 0.5) * 30;

            const color = raceHslToHex(hue, 70 + Math.random() * 20, 45 + Math.random() * 15);

            // Car sprites use angle - PI/2 as their forward direction.
            const angle =
                Math.atan2(
                    this.race.start.y - pos.y,
                    this.race.start.x - pos.x
                ) + Math.PI / 2;

            const car = this.createCar(
                baseId + i * 137 + Math.floor(Math.random() * 100),
                pos,
                angle,
                color,
                preset
            );

            car.arrestTransportPath = null;
            car.arrestTransportPathIndex = 1;
            car.arrestTransportRepathTimer = 0;

            const opp = new RaceOpponent(car, i);

            opp.phase = "TRAVELING";

            cars.push(car);
            this.opponents.push(opp);
        }
    }

    isCarDestroyed(car) {
        return (
            car.health <= 0 ||
            car.exploded ||
            (typeof cars !== "undefined" && cars.indexOf(car) < 0)
        );
    }

    // Marks pre-race opponents that broke down / exploded.
    refreshEliminations() {
        for (const opp of this.opponents) {
            if (
                !opp.eliminated &&
                opp.phase !== "RACING" &&
                this.isCarDestroyed(opp.car)
            ) {
                opp.eliminated = true;
                opp.phase = "ELIMINATED";
                opp.car.speed = 0;
            }
        }
    }

    // Number of opponents that will be on the grid.
    getLineUpCount() {
        if (this.opponents.length === 0) {
            return RACE_OPPONENT_COUNT;
        }

        this.refreshEliminations();

        return this.opponents.filter(opp => !opp.eliminated).length;
    }

    despawnOpponent(opp) {
        const car = opp.car;

        if (car.humAudio) {
            car.humAudio.pause();
            car.humAudio = null;
        }

        if (typeof cars !== "undefined") {
            const idx = cars.indexOf(car);

            if (idx >= 0) {
                cars.splice(idx, 1);
            }
        }
    }

    // Race start: puts the already-existing opponents on the grid
    // (wherever they are, even if still driving to the start) and
    // removes eliminated ones. Never creates duplicates; only falls
    // back to a fresh spawn if nothing was staged.
    lineUp(slots, routeAngle, carKey) {
        if (this.opponents.length === 0) {
            this.spawn(slots, routeAngle, carKey);
            return;
        }

        this.refreshEliminations();

        const cfg = RACE_OPPONENT_AI;
        const carAngle = routeAngle + Math.PI / 2;
        const start = this.race.start;
        let slotIndex = 0;

        for (const opp of this.opponents) {
            if (opp.eliminated) {
                this.despawnOpponent(opp);
                continue;
            }

            const slot =
                slots[slotIndex++] ||
                { x: start.x, y: start.y };

            const car = opp.car;

            car.x = slot.x;
            car.y = slot.y;
            car.angle = carAngle;
            car.speed = 0;
            car.velocityX = 0;
            car.velocityY = 0;

            car.arrestTransportPath = null;
            car.arrestTransportPathIndex = 1;
            car.arrestTransportRepathTimer = 0;

            opp.phase = "RACING";
            opp.targetIndex = 0;
            opp.path = null;
            opp.pathIndex = 0;
            opp.repathCooldown = opp.index * 4;
            opp.forceRepath = false;
            opp.startDelay = cfg.startDelay;
            opp.finished = false;
            opp.place = null;
            opp.stuckTimer = 0;
            opp.stuckX = car.x;
            opp.stuckY = car.y;
            opp.recoverTimer = 0;
        }
    }

    // Drives a pre-race opponent to the start with the arrest
    // transport car's navigation (A*, AI, non-road avoidance).
    // The transport's stuck-recovery watchdog is deliberately not used.
    updateStagingOpponent(opp, dt) {
        const car = opp.car;
        const start = this.race.start;

        if (opp.eliminated) {
            return;
        }

        if (this.isCarDestroyed(car)) {
            this.refreshEliminations();
            return;
        }

        if (!start) {
            return;
        }

        if (opp.phase === "ARRIVED") {
            car.speed = 0;
            return;
        }

        const dist = Math.hypot(start.x - car.x, start.y - car.y);

        if (dist <= RACE_OPPONENT_STAGING.arriveRadius) {
            opp.phase = "ARRIVED";
            car.speed = 0;
            car.arrestTransportPath = null;
            return;
        }

        if (
            typeof moveArrestPoliceCar !== "function" ||
            typeof navigationSystem === "undefined" ||
            !navigationSystem.ready
        ) {
            return;
        }

        // At most one fresh A* search per frame across opponents.
        if (!car.arrestTransportPath) {
            if (this.pathBudget <= 0) {
                return;
            }

            this.pathBudget--;
        }

        moveArrestPoliceCar(
            car,
            start.x,
            start.y,
            dt,
            RACE_OPPONENT_STAGING.travelSpeed
        );
    }

    clear() {
        if (
            this.opponents.length > 0 &&
            typeof cars !== "undefined"
        ) {
            for (const opp of this.opponents) {
                const car = opp.car;

                if (car.humAudio) {
                    car.humAudio.pause();
                    car.humAudio = null;
                }

                const idx = cars.indexOf(car);

                if (idx >= 0) {
                    cars.splice(idx, 1);
                }
            }
        }

        this.opponents = [];
    }

    // ----------------------------------------------------
    // UPDATE
    // ----------------------------------------------------

    update(dt) {
        if (this.opponents.length === 0) {
            return;
        }

        // NPC cars are frozen indoors; do the same here.
        if (
            (typeof isInsideHouse !== "undefined" && isInsideHouse) ||
            (typeof isInsideDealership !== "undefined" && isInsideDealership)
        ) {
            return;
        }

        const targets = this.race.getOpponentTargets();

        this.pathBudget = 1;   // at most one A* search per frame

        for (const opp of this.opponents) {
            if (opp.eliminated) {
                continue;
            }

            if (opp.phase === "RACING") {
                // An opponent that explodes mid-race is eliminated
                // (one that already finished keeps its place).
                if (
                    !opp.finished &&
                    (opp.car.health <= 0 || opp.car.exploded)
                ) {
                    opp.eliminated = true;
                    opp.phase = "ELIMINATED";
                    opp.car.speed = 0;
                    continue;
                }

                if (targets.length > 0) {
                    this.updateOpponent(opp, dt, targets);
                }
            } else {
                // Not on the grid yet: still driving to / parked at the start.
                this.updateStagingOpponent(opp, dt);
            }
        }
    }

    requestPath(opp, target) {
        const car = opp.car;

        this.pathBudget--;

        let path = null;

        if (
            typeof navigationSystem !== "undefined" &&
            navigationSystem.ready
        ) {
            // preferRoads = true -> A* strongly favours road cells,
            // but can still cross grass/transition cells.
            path = navigationSystem.findPath(
                car.x, car.y,
                target.x, target.y,
                true
            );
        }

        // No path: head straight for the target over any surface.
        opp.path =
            path && path.length > 0
                ? path
                : [{ x: target.x, y: target.y }];

        opp.pathIndex = 0;
        opp.repathCooldown = RACE_OPPONENT_AI.repathMinInterval;
        opp.forceRepath = false;
    }

    updateOpponent(opp, dt, targets) {
        const cfg = RACE_OPPONENT_AI;
        const car = opp.car;

        if (opp.finished || car.health <= 0 || car.exploded) {
            car.speed = 0;
            return;
        }

        // ---- Target (next checkpoint, then finish) ----
        const target = targets[opp.targetIndex];
        const isFinish = opp.targetIndex >= targets.length - 1;

        const targetDist = Math.hypot(
            target.x - car.x,
            target.y - car.y
        );

        if (targetDist <= (isFinish ? cfg.finishReach : cfg.checkpointReach)) {
            if (isFinish) {
                opp.finished = true;
                opp.place = this.race.claimFinishPlace();
                car.speed = 0;
                return;
            }

            opp.targetIndex++;
            opp.path = null;
            opp.pathIndex = 0;
            opp.repathCooldown = 0;

            return;
        }

        // ---- Path (only recomputed when needed) ----
        opp.repathCooldown -= dt;

        if (
            opp.path &&
            opp.repathCooldown <= 0 &&
            Math.hypot(
                opp.path[opp.pathIndex].x - car.x,
                opp.path[opp.pathIndex].y - car.y
            ) > cfg.offPathDistance
        ) {
            opp.forceRepath = true;
        }

        if (
            (!opp.path || opp.forceRepath) &&
            this.pathBudget > 0 &&
            (opp.repathCooldown <= 0 || opp.forceRepath)
        ) {
            this.requestPath(opp, target);
        }

        // Wait at the line until the start delay is over.
        if (opp.startDelay > 0) {
            opp.startDelay -= dt;
            car.speed = 0;
            return;
        }

        // ---- Aim point ----
        let aim;

        if (opp.path) {
            const path = opp.path;

            while (
                opp.pathIndex < path.length - 1 &&
                Math.hypot(
                    path[opp.pathIndex].x - car.x,
                    path[opp.pathIndex].y - car.y
                ) < cfg.waypointReach
            ) {
                opp.pathIndex++;
            }

            aim = path[Math.min(opp.pathIndex + 1, path.length - 1)];
        } else {
            aim = target;   // waiting for a path slot
        }

        // ---- Stuck detection ----
        opp.stuckTimer += dt;

        if (opp.stuckTimer >= cfg.stuckCheckInterval) {
            const moved = Math.hypot(
                car.x - opp.stuckX,
                car.y - opp.stuckY
            );

            if (moved < cfg.stuckDistance) {
                opp.recoverTimer = cfg.recoverFrames;
                opp.recoverSide = -opp.recoverSide;
                opp.forceRepath = true;
            }

            opp.stuckTimer = 0;
            opp.stuckX = car.x;
            opp.stuckY = car.y;
        }

        // ---- Steering ----
        const heading = car.angle - Math.PI / 2;
        const hx = Math.cos(heading);
        const hy = Math.sin(heading);

        let ax = aim.x - car.x;
        let ay = aim.y - car.y;
        const aLen = Math.hypot(ax, ay) || 1;
        ax /= aLen;
        ay /= aLen;

        // After being stuck, veer off to one side for a moment.
        if (opp.recoverTimer > 0) {
            opp.recoverTimer -= dt;

            const turn = 0.9 * opp.recoverSide;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const rx = ax * cos - ay * sin;
            const ry = ax * sin + ay * cos;

            ax = rx;
            ay = ry;
        }

        // Keep distance from the other racers and the player.
        let sx = 0;
        let sy = 0;
        let frontFactor = 1;

        const others = this.getOtherRacers(opp);

        for (const other of others) {
            const ox = car.x - other.x;
            const oy = car.y - other.y;
            const d = Math.hypot(ox, oy);

            if (d < 0.001 || d > cfg.separationRadius) {
                continue;
            }

            const push = 1 - d / cfg.separationRadius;

            sx += (ox / d) * push;
            sy += (oy / d) * push;

            // Racer roughly ahead: ease off and pick a side to pass on.
            const fx = -ox;
            const fy = -oy;
            const ahead = (fx * hx + fy * hy) / d;

            if (ahead > 0.5 && d < cfg.frontSlowDistance) {
                frontFactor = Math.min(
                    frontFactor,
                    Math.max(
                        0.25,
                        Math.min(1, (d - 24) / (cfg.frontSlowDistance - 24))
                    )
                );

                const side = (hx * fy - hy * fx) >= 0 ? -1 : 1;

                sx += -hy * side * 0.6 * push;
                sy += hx * side * 0.6 * push;
            }
        }

        // Small-radius building avoidance.
        let bx = 0;
        let by = 0;

        if (typeof isPlayerCarWalkable === "function") {
            for (let k = 0; k < 8; k++) {
                const a = k * (Math.PI / 4);
                const c = Math.cos(a);
                const s = Math.sin(a);

                if (
                    !isPlayerCarWalkable(
                        car.x + c * cfg.buildingProbeRadius,
                        car.y + s * cfg.buildingProbeRadius
                    )
                ) {
                    bx -= c;
                    by -= s;
                }
            }
        }

        let dx =
            ax +
            sx * cfg.separationWeight +
            bx * cfg.buildingAvoidWeight;

        let dy =
            ay +
            sy * cfg.separationWeight +
            by * cfg.buildingAvoidWeight;

        if (Math.hypot(dx, dy) < 0.001) {
            dx = ax;
            dy = ay;
        }

        const desiredHeading = Math.atan2(dy, dx);

        let diff = desiredHeading - heading;

        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        car.angle += diff * (cfg.turnRate * dt);

        // ---- Speed ----
        const healthFactor =
            car.maxHealth > 0
                ? Math.max(0.2, car.health / car.maxHealth)
                : 1;

        const maxSpeed =
            car.baseSpeed * 3 * opp.topSpeedFactor * healthFactor;

        const cornerFactor =
            1 - Math.min(1, Math.abs(diff) / 1.2) * 0.65;

        let targetSpeed = maxSpeed * cornerFactor * frontFactor;

        if (opp.recoverTimer > 0) {
            targetSpeed *= 0.5;
        }

        if (car.speed < targetSpeed) {
            car.speed = Math.min(targetSpeed, car.speed + cfg.acceleration * dt);
        } else {
            car.speed = Math.max(targetSpeed, car.speed - cfg.braking * dt);
        }

        // ---- Move (any drivable surface; buildings/water block) ----
        const newHeading = car.angle - Math.PI / 2;
        const nextX = car.x + Math.cos(newHeading) * (car.speed * dt);
        const nextY = car.y + Math.sin(newHeading) * (car.speed * dt);
        if (typeof isPlayerCarWalkable === "function") {
                let hitWall = false;

                if (isPlayerCarWalkable(nextX, car.y)) car.x = nextX; else hitWall = true;
                if (isPlayerCarWalkable(car.x, nextY)) car.y = nextY; else hitWall = true;

                if (hitWall) {
                    car.speed *= 0.4;
                }
            } else {
                car.x = nextX;
                car.y = nextY;
            }
        }

        

    // Other racers to keep away from: the other opponents
    // (including finished ones) and the player. Normal NPC cars
    // and pedestrians are deliberately ignored.
    getOtherRacers(self) {
        const list = [];

        for (const opp of this.opponents) {
            if (opp !== self && !opp.eliminated) {
                list.push(opp.car);
            }
        }

        if (typeof playerCar !== "undefined" && playerCar) {
            list.push(playerCar);
        } else if (typeof player !== "undefined" && player) {
            list.push(player);
        }

        return list;
    }
}



class RaceEventsManager {
    constructor() {
        this.state = "WAITING";

        this.raceStartHour = null;
        this.raceStartMinute = 0;

        this.start = null;
        this.finish = null;
        this.checkpoints = [];
        this.route = [];

        this.joinRadius = 90;

        // Checkpoint progression
        this.checkpointRadius = 70;
        this.finishRadius = 70;
        this.checkpointsDone = [];
        this.zonesWarned = {};

        this.phoneMessageActive = false;
        this.phoneMessageDismissed = false;
        this.phoneMessageSoundPlayed = false;

        this.startMarkerVisible = false;
        this.startMarkerEnabled = false;
        this.raceMarkersVisible = false;

        this.raceStarted = false;
        this.raceClockStarted = false;
        this.raceEndHour = null;
        this.raceStartedAtHour = null;
        this.playerJoined = false;
        this.playerLeftRace = false;

        // Finish order / results
        this.finishPlaceCounter = 0;
        this.playerPlace = null;
        this.finishResultsEl = null;
        this.finishResultsHtml = "";
        this.finishLive = false;

        this.joinButton = null;

        this.lastObservedHour = -1;

        // Persistent source of truth for today's race time.
        this.raceTimeStorageKey = "streetbound_race_time";

        // True when a scheduling check is due for a NEW in-game day.
        // (The first check at load is made by waitForWorldAndGenerate.)
        // The check itself only generates a time when the
        // LocalStorage key does not exist.
        this.scheduleCheckPending = false;

        this.generateAttempts = 0;

        // Race type decides which car the opponents use.
        this.raceType = "street";
        this.opponentManager = new RaceOpponentManager(this);

        this.createJoinButton();
        const messageClose =
            document.getElementById(
                "phoneCutsceneMessageClose"
            );

        if (messageClose) {
            messageClose.addEventListener(
                "pointerdown",
                e => {
                    e.preventDefault();

                    if (
                        this.state === "SCHEDULED"
                    ) {
                        this.dismissPhoneRaceMessage();
                    }
                }
            );
        }

        const raceInfoAccept =
            document.getElementById(
                "phoneRaceInfoAccept"
            );

        if (raceInfoAccept) {
            raceInfoAccept.addEventListener(
                "pointerdown",
                e => {
                    e.preventDefault();

                    if (
                        this.state === "SCHEDULED" &&
                        this.phoneMessageDismissed
                    ) {
                        this.acceptRaceInfo();
                    }
                }
            );
        }

        // Collision map is already loaded before this is called.
        this.waitForWorldAndGenerate();
    }

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------

    waitForWorldAndGenerate() {
        if (
            typeof collisionData === "undefined" ||
            !collisionData ||
            typeof mapWidth === "undefined" ||
            mapWidth <= 0 ||
            typeof mapHeight === "undefined" ||
            mapHeight <= 0
        ) {
            setTimeout(() => {
                this.waitForWorldAndGenerate();
            }, 250);

            return;
        }

        this.scheduleNextRace();
    }

    // --------------------------------------------------------
    // RANDOM RACE TIME
    // --------------------------------------------------------

    // --------------------------------------------------------
    // PERSISTED RACE TIME (LocalStorage)
    // --------------------------------------------------------

    loadSavedRaceTime() {
        try {
            const raw =
                localStorage.getItem(
                    this.raceTimeStorageKey
                );

            if (raw === null) {
                return null;
            }

            const data = JSON.parse(raw);

            if (
                data &&
                Number.isInteger(data.hour) &&
                Number.isInteger(data.minute) &&
                data.hour >= 0 && data.hour <= 23 &&
                data.minute >= 0 && data.minute <= 59
            ) {
                return data;
            }
        } catch (e) {
            // Unreadable value: treated like a missing key.
        }

        return null;
    }

    saveRaceTime(hour, minute) {
        try {
            localStorage.setItem(
                this.raceTimeStorageKey,
                JSON.stringify({
                    hour: hour,
                    minute: minute
                })
            );
        } catch (e) {}
    }

    clearSavedRaceTime() {
        try {
            localStorage.removeItem(
                this.raceTimeStorageKey
            );
        } catch (e) {}
    }

    // --------------------------------------------------------
    // RANDOM RACE TIME
    // --------------------------------------------------------

    // Rule:
    //   key missing            -> generate a new time and save it
    //   key present, upcoming  -> reuse the saved time
    //   key present, passed    -> today's race already happened,
    //                             do nothing
    // The key is only removed at in-game midnight (see update()).
    scheduleNextRace() {
        this.clearRaceState();
        this.phoneMessageSoundPlayed = false;
        this.scheduleCheckPending = false;
        this.state = "WAITING";

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const currentMinutes =
            Math.floor(currentHour * 60);

        const saved = this.loadSavedRaceTime();

        if (saved) {
            const scheduledMinutes =
                saved.hour * 60 + saved.minute;

            if (scheduledMinutes <= currentMinutes) {
                // Today's race time has already passed.
                // Do NOT schedule another race today.
                console.log(
                    "[RACE] Saved race time " +
                    this.formatHourMinute(
                        saved.hour,
                        saved.minute
                    ) +
                    " has already passed. No race until tomorrow."
                );

                return;
            }

            // Reuse the saved time, never re-roll it.
            this.raceStartHour = saved.hour;
            this.raceStartMinute = saved.minute;
        } else {
            // No key: generate a new future time (existing
            // whole-hour random logic) and persist it.
            const firstFutureHour =
                Math.max(
                    1,
                    Math.floor(currentHour) + 1
                );

            if (firstFutureHour > 23) {
                // No whole hour left today. Nothing to save.
                return;
            }

            this.raceStartHour =
                firstFutureHour +
                Math.floor(
                    Math.random() *
                    (23 - firstFutureHour + 1)
                );

            this.raceStartMinute = 0;

            this.saveRaceTime(
                this.raceStartHour,
                this.raceStartMinute
            );
        }

        // Generate the actual race immediately.
        const generated =
            this.generateRaceRoute();

        if (!generated) {
            console.warn(
                "[RACE] Could not generate a valid race. Retrying."
            );

            setTimeout(() => {
                this.scheduleNextRace();
            }, 500);

            return;
        }

        this.state = "SCHEDULED";

        console.log(
            `[RACE] Race scheduled for ${this.formatHourMinute(
                this.raceStartHour,
                this.raceStartMinute
            )}`
        );

        
    }

    // --------------------------------------------------------
    // RACE GENERATION
    // --------------------------------------------------------

    generateRaceRoute() {
        const MAX_ATTEMPTS = 80;

        for (
            let attempt = 0;
            attempt < MAX_ATTEMPTS;
            attempt++
        ) {
            this.generateAttempts++;

            const leftToRight =
                Math.random() < 0.5;

            const startRegion = leftToRight
                ? "left"
                : "right";

            const finishRegion = leftToRight
                ? "right"
                : "left";

            const start =
                this.getSafeRoadPositionInRegion(
                    startRegion
                );

            const finish =
                this.getSafeRoadPositionInRegion(
                    finishRegion
                );

            if (!start || !finish) {
                continue;
            }

            // Ensure the two points really are far apart.
            const directDistance =
                Math.hypot(
                    finish.x - start.x,
                    finish.y - start.y
                );

            // Because the regions already guarantee separation,
            // this is mostly an additional sanity check.
            if (directDistance < mapWidth * 0.35) {
                continue;
            }

            if (
                typeof navigationSystem === "undefined" ||
                !navigationSystem.ready ||
                typeof navigationSystem.findPath !== "function"
            ) {
                continue;
            }

            const route =
                navigationSystem.findPath(
                    start.x,
                    start.y,
                    finish.x,
                    finish.y
                );

            if (
                !route ||
                route.length < 3
            ) {
                continue;
            }

            const checkpoints =
                this.generateCheckpoints(
                    route,
                    start,
                    finish
                );

            if (
                !checkpoints ||
                checkpoints.length === 0
            ) {
                continue;
            }

            this.start = start;
            this.finish = finish;
            this.route = route;
            this.checkpoints = checkpoints;

            return true;
        }

        return false;
    }

    // --------------------------------------------------------
    // START / FINISH REGION
    // --------------------------------------------------------

    getSafeRoadPositionInRegion(region) {
        const maxAttempts = 40;

        const minX =
            region === "left"
                ? 0
                : mapWidth * 0.70;

        const maxX =
            region === "left"
                ? mapWidth * 0.30
                : mapWidth;

        for (
            let attempt = 0;
            attempt < maxAttempts;
            attempt++
        ) {
            // IMPORTANT:
            // Use the game's existing safe road-position function.
            const candidate =
                getRandomStrictRoadPosition();

            if (
                !candidate ||
                !Number.isFinite(candidate.x) ||
                !Number.isFinite(candidate.y)
            ) {
                continue;
            }

            if (
                candidate.x >= minX &&
                candidate.x <= maxX
            ) {
                return candidate;
            }
        }

        return null;
    }

    // --------------------------------------------------------
    // CHECKPOINT GENERATION
    // --------------------------------------------------------
    //
    // Checkpoints are chosen from the generated A* route,
    // but each checkpoint is still validated through the
    // existing safe-road-position function.
    //
    // This keeps them on the actual race route instead of
    // randomly placing checkpoints somewhere disconnected.
    // --------------------------------------------------------

    generateCheckpoints(
        route,
        start,
        finish
    ) {
        if (!route || route.length < 4) {
            return [];
        }

        const checkpointCount = Math.min(
            5,
            Math.max(
                3,
                Math.floor(route.length / 12)
            )
        );

        const checkpoints = [];

        // Find the nearest point that is STRICTLY a road pixel.
        // We deliberately do not use getRandomRoadPosition() here,
        // because a random nearby road point can place a checkpoint
        // away from the actual route.
        const findStrictRoadPointNear = (routePoint) => {
            if (
                !routePoint ||
                typeof isStrictRoadColor !== "function"
            ) {
                return null;
            }

            const baseX = Math.round(routePoint.x);
            const baseY = Math.round(routePoint.y);

            // First check the actual A* route point.
            if (
                isStrictRoadColor(baseX, baseY)
            ) {
                return {
                    x: baseX,
                    y: baseY
                };
            }

            // Search outward from the route point for the nearest
            // strictly-road pixel.
            const maxRadius = 180;
            const step = 4;

            let best = null;
            let bestDistance = Infinity;

            for (
                let radius = step;
                radius <= maxRadius;
                radius += step
            ) {
                for (
                    let angle = 0;
                    angle < Math.PI * 2;
                    angle += Math.PI / 16
                ) {
                    const x = Math.round(
                        baseX + Math.cos(angle) * radius
                    );

                    const y = Math.round(
                        baseY + Math.sin(angle) * radius
                    );

                    if (
                        x < 0 ||
                        y < 0 ||
                        x >= mapWidth ||
                        y >= mapHeight
                    ) {
                        continue;
                    }

                    if (
                        !isStrictRoadColor(x, y)
                    ) {
                        continue;
                    }

                    const distance =
                        Math.hypot(
                            x - baseX,
                            y - baseY
                        );

                    if (distance < bestDistance) {
                        bestDistance = distance;
                        best = {
                            x,
                            y
                        };
                    }
                }

                // Once we found a road point in this ring,
                // it is the closest ring available.
                if (best) {
                    break;
                }
            }

            return best;
        };

        for (
            let i = 1;
            i <= checkpointCount;
            i++
        ) {
            const progress =
                i /
                (checkpointCount + 1);

            const routeIndex =
                Math.floor(
                    progress *
                    (route.length - 1)
                );

            const routePoint =
                route[
                    Math.max(
                        1,
                        Math.min(
                            route.length - 2,
                            routeIndex
                        )
                    )
                ];

            if (!routePoint) {
                continue;
            }

            const selected =
                findStrictRoadPointNear(routePoint);

            // NEVER use routePoint as a fallback unless it has
            // already been confirmed to be strictly road.
            if (!selected) {
                continue;
            }

            // Avoid checkpoints becoming too close together.
            if (checkpoints.length > 0) {
                const previous =
                    checkpoints[
                        checkpoints.length - 1
                    ];

                if (
                    Math.hypot(
                        selected.x - previous.x,
                        selected.y - previous.y
                    ) < 180
                ) {
                    continue;
                }
            }

            checkpoints.push(selected);
        }

        // If we couldn't create any valid road checkpoints,
        // reject this race route so generateRaceRoute() can
        // generate another one.
        return checkpoints;
    }
    // ------------
    // UPDATE


    update(dt) {
        if (
            typeof gameSeconds === "undefined" ||
            typeof DAY_LENGTH === "undefined"
        ) {
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        // Midnight detection: the in-game clock wrapped back to 0.
        // Fires once per day (lastObservedHour is updated below).
        if (
            this.lastObservedHour >= 0 &&
            currentHour < this.lastObservedHour
        ) {
            this.clearSavedRaceTime();

            // A race still SCHEDULED from yesterday is stale.
            if (this.state === "SCHEDULED") {
                this.clearRaceState();
                this.state = "WAITING";
            }

            this.scheduleCheckPending = true;
        }

        // Scheduling check for a new day. Never interrupts a
        // race in progress or the results screen; it runs once
        // the manager is idle again.
        if (
            this.scheduleCheckPending &&
            this.state === "WAITING"
        ) {
            this.scheduleNextRace();
        }

        this.lastObservedHour =
            currentHour;

        // ----------------------------------------------------
        // TWO-HOUR WARNING
        // ----------------------------------------------------

        if (
            this.state === "SCHEDULED" &&
            !this.raceStarted
        ) {
            const hoursUntilRace =
                this.getHoursUntilRace(
                    currentHour
                );

            if (
                hoursUntilRace <= 2 &&
                hoursUntilRace > 0
            ) {
                if (
                    !this.startMarkerVisible
                ) {
                    this.startMarkerVisible = true;

                    // Play the phone message sound once when the race invitation arrives.
                    if (!this.phoneMessageSoundPlayed) {
                        const messageSound = new Audio(
                            "https://raw.githubusercontent.com/divanshu911/My-game-assets/e8ed68b9d44fbea3886c7a39773340219bac8517/message.mp3"
                        );

                        messageSound.volume = 1.0;
                        messageSound.play().catch(() => {});

                        this.phoneMessageSoundPlayed = true;
                    }

                    // Opponents appear on roads now and drive to the start.
                    this.opponentManager.spawnRoadOpponents(
                        this.getOpponentCarKey()
                    );

                    if (
                        typeof taxiManager !== "undefined" &&
                        taxiManager.setMessage
                    ) {
                        taxiManager.setMessage(
                            "Check phone for race event",
                            180
                        );
                    }
                }
            }

            // Race time reached.
            if (
                currentHour >=
                this.raceStartHour
            ) {
                this.handleRaceStartTime();
            }
        }

        // ----------------------------------------------------
        // ACTIVE PLAYER / NPC RACE
        // ----------------------------------------------------

        if (
            this.state === "RACING" &&
            this.raceStarted &&
            this.raceClockStarted
        ) {
            const maxDurationHours = this.playerJoined ? 3 : 1;

            if (
                this.getRaceElapsedHours(currentHour) >= maxDurationHours
            ) {
                if (this.playerJoined) {
                    // Player is still participating, so their 3-hour race ends normally.
                    this.finishRace(true);
                } else {
                    // Player left OR never joined.
                    // NPC race continues/ends independently.
                    this.finishNpcRace();
                }
            } else {
                if (this.playerJoined) {
                    this.updateCheckpointProgress();
                }

                if (
                    !this.playerJoined &&
                    this.opponentManager.allFinished()
                ) {
                    this.finishNpcRace();
                }
            }
        }

        // Opponent AI keeps running (opponents that finished stay
        // parked at 0 speed) until the race state is cleared.
        this.opponentManager.update(dt);

        // Finish message positions update live until "continue".
        this.updateFinishResults();

        // Join button proximity.
        this.updateJoinButton();
    }

    // --------------------------------------------------------
    // RACE TIME
    // --------------------------------------------------------

    getRaceElapsedHours(currentHour) {
        const startHour =
            this.raceStartedAtHour ?? this.raceStartHour;

        if (startHour === null || startHour === undefined) {
            return 0;
        }

        let elapsed =
            currentHour - startHour;

        if (elapsed < 0) {
            elapsed += 24;
        }

        return elapsed;
    }
    getHoursUntilRace(currentHour) {
        let difference =
            this.raceStartHour -
            currentHour;

        if (difference < 0) {
            difference += 24;
        }

        return difference;
    }

    handleRaceStartTime() {
        if (
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        // The race happens whether or not the player joined.
        // If the player joined, startPlayerRace() already changed
        // the state to RACING, so this function won't run.
        this.startNpcRace();

        // Do NOT generate another race immediately.
        // Wait until midnight.
    }

    // --------------------------------------------------------
    // PHONE MESSAGE
    // --------------------------------------------------------

    showPhoneRaceMessage() {
        if (
            this.phoneMessageDismissed ||
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        if (
            hoursUntilRace <= 0 ||
            hoursUntilRace > 2
        ) {
            return;
        }

        const layer =
            document.getElementById(
                "phoneCutsceneMessage"
            );

        const text =
            document.getElementById(
                "phoneCutsceneMessageText"
            );

        if (!layer || !text) {
            return;
        }

        text.textContent =
            `Race at ${this.formatHourMinute(
                this.raceStartHour,
                this.raceStartMinute
            )}, tap cross to view information`;

        layer.style.display = "flex";

        this.phoneMessageActive = true;
    }

    hidePhoneRaceMessage() {
        const layer =
            document.getElementById(
                "phoneCutsceneMessage"
            );

        if (layer) {
            layer.style.display = "none";
        }

        this.phoneMessageActive = false;
    }

    dismissPhoneRaceMessage() {
        this.phoneMessageDismissed = true;
        this.hidePhoneRaceMessage();

        // Show the Race Info screen. The start marker stays
        // hidden until ACCEPT is pressed.
        const home =
            document.getElementById("phoneHomeScreen");
        const info =
            document.getElementById("phoneRaceInfoScreen");

        if (home) {
            home.style.display = "none";
        }

        if (info) {
            info.style.display = "flex";
        }
    }

    acceptRaceInfo() {
        this.startMarkerEnabled = true;

        const home =
            document.getElementById("phoneHomeScreen");
        const info =
            document.getElementById("phoneRaceInfoScreen");

        if (info) {
            info.style.display = "none";
        }

        if (home) {
            home.style.display = "flex";
        }
    }

    shouldShowPhoneMessage() {
        if (
            this.phoneMessageDismissed ||
            this.state !== "SCHEDULED"
        ) {
            return false;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        return (
            hoursUntilRace > 0 &&
            hoursUntilRace <= 2
        );
    }

    // --------------------------------------------------------
    // JOIN BUTTON
    // --------------------------------------------------------

    createJoinButton() {
        const button =
            document.createElement("button");

        button.id =
            "raceJoinButton";

        button.textContent =
            "JOIN RACE";

        button.style.display =
            "none";

        button.style.position =
            "absolute";

        button.style.left =
            "50%";

        button.style.bottom =
            "18%";

        button.style.transform =
            "translateX(-50%)";

        button.style.zIndex =
            "300";

        button.style.padding =
            "12px 24px";

        button.style.fontWeight =
            "bold";

        button.style.fontSize =
            "16px";

        button.style.borderRadius =
            "8px";

        button.style.border =
            "2px solid white";

        button.style.background =
            "#e74c3c";

        button.style.color =
            "white";

        document.body.appendChild(button);

        this.joinButton = button;

        button.addEventListener(
            "pointerdown",
            e => {
                e.preventDefault();
                this.tryJoinRace();
            }
        );
    }

    updateJoinButton() {
        if (
            !this.joinButton ||
            this.state !== "SCHEDULED" ||
            !this.start
        ) {
            this.hideJoinButton();
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        if (
            hoursUntilRace <= 0 ||
            hoursUntilRace > 2
        ) {
            this.hideJoinButton();
            return;
        }

        if (
            typeof player === "undefined" ||
            !player
        ) {
            this.hideJoinButton();
            return;
        }

        const distance =
            Math.hypot(
                player.x - this.start.x,
                player.y - this.start.y
            );

        if (
            distance <= this.joinRadius
        ) {
            this.joinButton.style.display =
                "block";
        } else {
            this.hideJoinButton();
        }
    }

    hideJoinButton() {
        if (this.joinButton) {
            this.joinButton.style.display =
                "none";
        }
    }

    // --------------------------------------------------------
    // JOIN VALIDATION
    // --------------------------------------------------------

    tryJoinRace() {
        if (
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        if (
            typeof playerCar === "undefined" ||
            !playerCar
        ) {
            this.showJoinDenied(
                "You must be in your own car to join the race"
            );
            return;
        }

        // Owned cars created by gameplay.js use this flag.
        const isOwned =
            playerCar.ownerType ===
                "playerOwned";

        // Taxi / truck-job cars are explicitly rejected.
        const isJobVehicle =
            Boolean(
                playerCar.isTaxi ||
                playerCar ===
                    (typeof truckManager !== "undefined"
                        ? truckManager.truck
                        : null)
            );

        const isStolen =
            Boolean(playerCar.isStolen);

        if (
            !isOwned ||
            isStolen ||
            isJobVehicle
        ) {
            this.showJoinDenied(
                "You can only join in your own car"
            );
            return;
        }

        this.startPlayerRace();
    }

    showJoinDenied(message) {
        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                message,
                180
            );
        }
    }

    // --------------------------------------------------------
    // START PLAYER RACE
    // --------------------------------------------------------

    startPlayerRace() {
        if (
            !playerCar ||
            !this.route ||
            this.route.length < 2
        ) {
            return;
        }

        this.hideJoinButton();
        this.hidePhoneRaceMessage();

        this.raceStarted = true;
        this.state = "RACING";
        this.playerJoined = true;
        this.playerLeftRace = false;
        this.raceClockStarted = false;
        this.raceStartedAtHour = null;

        this.finishPlaceCounter = 0;
        this.playerPlace = null;

        this.checkpointsDone =
            this.checkpoints.map(() => false);
        this.zonesWarned = {};

        this.startMarkerVisible = false;
        this.raceMarkersVisible = true;
        this.updateRaceButton();

        // The race timer starts after the transition advances the
        // in-game clock to the scheduled event time.
        this.raceEndHour = null;

        // First path segment determines the starting direction.
        const nextPoint =
            this.route[1];

        const routeAngle =
            Math.atan2(
                nextPoint.y - this.start.y,
                nextPoint.x - this.start.x
            );

        this.beginRaceTransition(
            routeAngle
        );
    }
    leavePlayerRace() {
        if (
            this.state !== "RACING" ||
            !this.playerJoined ||
            this.playerLeftRace
        ) {
            return;
        }

        // Player leaves only. The NPC race continues normally.
        this.playerLeftRace = true;
        this.playerJoined = false;

        // Stop tracking the player's race progress.
        this.checkpointsDone = [];
        this.zonesWarned = {};

        // Remove all race markers from the player's view.
        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        // Remove the Leave Race button and restore Tow.
        this.updateRaceButton();

        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                "You left the race.",
                180
            );
        }

        console.log("[RACE] Player left the race. NPC race continues.");
    }
    updateRaceButton() {
    if (
        typeof towTruckBtn === "undefined" ||
        !towTruckBtn
    ) {
        return;
    }

    if (
        this.state === "RACING" &&
        this.playerJoined &&
        !this.playerLeftRace
    ) {
        towTruckBtn.innerText = "LEAVE RACE";
        towTruckBtn.style.display = "flex";
    } else {
        towTruckBtn.innerText = "TOW ($250)";

        if (
            typeof playerCar !== "undefined" &&
            playerCar
        ) {
            towTruckBtn.style.display = "flex";
        } else {
            towTruckBtn.style.display = "none";
        }
    }
    }

    // --------------------------------------------------------
    // START NPC RACE (player did not join)
    // --------------------------------------------------------

    startNpcRace() {
        if (
            this.state !== "SCHEDULED" ||
            !this.start ||
            !this.route ||
            this.route.length < 2
        ) {
            return;
        }

        this.hideJoinButton();
        this.hidePhoneRaceMessage();

        this.raceStarted = true;
        this.state = "RACING";
        this.playerJoined = false;
        this.raceStartedAtHour =
            (gameSeconds / DAY_LENGTH) * 24;
        this.raceClockStarted = true;

        this.checkpointsDone =
            this.checkpoints.map(() => false);
        this.zonesWarned = {};

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        // NPC race starts at the scheduled event time (lasts 1 hour).
        this.raceEndHour =
            this.raceStartedAtHour + 1;

        if (this.raceEndHour >= 24) {
            this.raceEndHour -= 24;
        }

        const nextPoint =
            this.route[1];

        const routeAngle =
            Math.atan2(
                nextPoint.y - this.start.y,
                nextPoint.x - this.start.x
            );

        // Only opponents line up on the grid; the player's car
        // is left exactly where it is.
        const slots =
            this.getStartingGridSlots(
                routeAngle,
                this.opponentManager.getLineUpCount()
            );

        this.opponentManager.lineUp(
            slots,
            routeAngle,
            this.getOpponentCarKey()
        );

    }

    beginRaceTransition(routeAngle) {
        const transition =
            document.createElement("div");

        transition.id =
            "raceBlackTransition";

        transition.style.position =
            "fixed";

        transition.style.inset =
            "0";

        transition.style.background =
            "black";

        transition.style.zIndex =
            "9999";

        transition.style.opacity =
            "0";

        transition.style.transition =
            "opacity 250ms ease";

        document.body.appendChild(
            transition
        );

        requestAnimationFrame(() => {
            transition.style.opacity =
                "1";
        });

        setTimeout(() => {

        // Advance the in-game clock to the scheduled race time
        // while the screen is completely black.
        if (
            typeof gameSeconds !== "undefined" &&
            typeof DAY_LENGTH !== "undefined"
        ) {
            gameSeconds =
                (
                    (
                        this.raceStartHour * 60 +
                        this.raceStartMinute
                    ) /
                    (24 * 60)
                ) *
                DAY_LENGTH;

            localStorage.setItem(
                "gameTime",
                gameSeconds
            );

            this.raceStartedAtHour =
                (gameSeconds / DAY_LENGTH) * 24;

            // Player race lasts 3 hours.
            this.raceEndHour =
                this.raceStartedAtHour + 3;

            if (this.raceEndHour >= 24) {
                this.raceEndHour -= 24;
            }

            this.raceClockStarted = true;
        }

        // Line up the player and all opponents along the route
        // direction (spawns the opponent cars while screen is black).
        this.setupRaceParticipants(routeAngle);

        if (playerCar) {
            // Car sprites use angle - PI/2
            // as their forward direction.
            playerCar.angle =
                routeAngle +
                Math.PI / 2;

                player.angle =
                    playerCar.angle;

                playerCar.speed = 0;

                player.x =
                    playerCar.x;

                player.y =
                    playerCar.y;
            }

            transition.style.opacity =
                "0";

            setTimeout(() => {
                transition.remove();
            }, 300);
        }, 300);
    }

    // --------------------------------------------------------
    // RACE OPPONENTS: STARTING GRID
    // --------------------------------------------------------

    getOpponentCarKey() {
        return (
            RACE_OPPONENT_CAR_BY_RACE_TYPE[this.raceType] ||
            RACE_OPPONENT_DEFAULT_CAR
        );
    }

    // Opponents drive to each checkpoint in order, then the finish.
    getOpponentTargets() {
        return [
            ...this.checkpoints,
            this.finish
        ].filter(Boolean);
    }

    isGridSpotUsable(x, y, strict) {
        if (
            typeof isPlayerCarWalkable === "function" &&
            !isPlayerCarWalkable(x, y)
        ) {
            return false;
        }

        if (!strict || typeof isRoadColor !== "function") {
            return true;
        }

        const r = 10;

        return (
            isRoadColor(x, y) &&
            isRoadColor(x + r, y) &&
            isRoadColor(x - r, y) &&
            isRoadColor(x, y + r) &&
            isRoadColor(x, y - r)
        );
    }

    // Two cars per row, rows going BACKWARDS from the start point,
    // so everyone faces the direction of the calculated route.
    // Returned slots are ordered front to back.
    getStartingGridSlots(routeAngle, count) {
        const laneOffset = 14;
        const rowSpacing = 36;
        const maxRows = 12;

        const fx = Math.cos(routeAngle);
        const fy = Math.sin(routeAngle);
        const rx = -fy;
        const ry = fx;

        const strictSpots = [];
        const looseSpots = [];

        for (let row = 0; row < maxRows; row++) {
            for (const lane of [-1, 1]) {
                const x =
                    this.start.x -
                    fx * row * rowSpacing +
                    rx * lane * laneOffset;

                const y =
                    this.start.y -
                    fy * row * rowSpacing +
                    ry * lane * laneOffset;

                const spot = { x, y, row, lane };

                if (this.isGridSpotUsable(x, y, true)) {
                    strictSpots.push(spot);
                } else if (this.isGridSpotUsable(x, y, false)) {
                    looseSpots.push(spot);
                }
            }
        }

        // Prefer spots fully on the road; fill up with drivable ones.
        const slots =
            strictSpots
                .concat(looseSpots)
                .slice(0, count);

        // Last resort: stack on the start point (collisions push apart).
        while (slots.length < count) {
            slots.push({
                x: this.start.x,
                y: this.start.y,
                row: maxRows,
                lane: 0
            });
        }

        slots.sort((a, b) => a.row - b.row || a.lane - b.lane);

        return slots;
    }

    setupRaceParticipants(routeAngle) {
        if (!this.start) {
            return;
        }

        const slots = this.getStartingGridSlots(
            routeAngle,
            this.opponentManager.getLineUpCount() + 1
        );

        // Random grid position for the player.
        const playerSlotIndex =
            Math.floor(Math.random() * slots.length);

        const playerSlot = slots.splice(playerSlotIndex, 1)[0];

        if (playerCar) {
            playerCar.x = playerSlot.x;
            playerCar.y = playerSlot.y;
        }

        this.opponentManager.lineUp(
            slots,
            routeAngle,
            this.getOpponentCarKey()
        );
    }

    // --------------------------------------------------------
    // CHECKPOINT PROGRESSION
    // --------------------------------------------------------

    updateCheckpointProgress() {
        if (
            this.state !== "RACING" ||
            typeof player === "undefined" ||
            !player
        ) {
            return;
        }

        // Checkpoints, in order.
        for (
            let i = 0;
            i < this.checkpoints.length;
            i++
        ) {
            if (this.checkpointsDone[i]) {
                continue;
            }

            const checkpoint =
                this.checkpoints[i];

            const inside =
                Math.hypot(
                    player.x - checkpoint.x,
                    player.y - checkpoint.y
                ) <= this.checkpointRadius;

            const key = "cp" + i;

            if (!inside) {
                this.zonesWarned[key] = false;
                continue;
            }

            let previousDone = true;

            for (let j = 0; j < i; j++) {
                if (!this.checkpointsDone[j]) {
                    previousDone = false;
                    break;
                }
            }

            if (previousDone) {
                this.checkpointsDone[i] = true;

            } else if (!this.zonesWarned[key]) {
                // Warn once per visit to the zone,
                // not every frame.
                this.zonesWarned[key] = true;
                this.showIncompleteWarning();
            }
        }

        // Finish.
        if (this.finish) {
            const insideFinish =
                Math.hypot(
                    player.x - this.finish.x,
                    player.y - this.finish.y
                ) <= this.finishRadius;

            if (!insideFinish) {
                this.zonesWarned.finish = false;
            } else if (this.allCheckpointsDone()) {
                this.finishRace();
            } else if (!this.zonesWarned.finish) {
                this.zonesWarned.finish = true;
                this.showIncompleteWarning();
            }
        }
    }

    allCheckpointsDone() {
        for (
            let i = 0;
            i < this.checkpoints.length;
            i++
        ) {
            if (!this.checkpointsDone[i]) {
                return false;
            }
        }

        return true;
    }

    showIncompleteWarning() {
        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                "complete previous checkpoints!",
                180
            );
        }
    }

    // --------------------------------------------------------
    // FINISH
    // --------------------------------------------------------

    finishNpcRace() {
        if (
            this.state !== "RACING" ||
            this.playerJoined
        ) {
            return;
        }

        console.log(
            "[RACE] Autonomous race finished."
        );

        // Despawn NPC cars and clear markers/route
        this.clearRaceState();
        this.updateRaceButton();

        // Idle until the next in-game day's scheduling check
        this.state = "WAITING";
    }

    // Next finishing position (1 = first across the line).
    claimFinishPlace() {
        this.finishPlaceCounter++;

        return this.finishPlaceCounter;
    }

    // timedOut = true when the 3 hour timer ended the race
    // (the player did not reach the finish).
    finishRace(timedOut = false) {
        if (
            this.state !== "RACING"
        ) {
            return;
        }

        if (!timedOut) {
            this.playerPlace = this.claimFinishPlace();
        }

        this.state = "FINISHED";
        this.raceStarted = false;
        this.raceClockStarted = false;

        this.hideJoinButton();
        this.updateRaceButton();
        this.hidePhoneRaceMessage();

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        this.showFinishMessage(timedOut);

        console.log(
            "[RACE] Player race ended at scheduled finish time."
        );
    }

    // --------------------------------------------------------
    // FINISH RESULTS
    // --------------------------------------------------------

    getOrdinal(n) {
        const mod100 = n % 100;

        if (mod100 >= 11 && mod100 <= 13) {
            return n + "th";
        }

        switch (n % 10) {
            case 1: return n + "st";
            case 2: return n + "nd";
            case 3: return n + "rd";
            default: return n + "th";
        }
    }

    // Order: finishers by position, then eliminated, then DNF.
    buildFinishResultsHtml() {
        const rows = [];

        rows.push({
            label: "You",
            place: this.playerPlace,
            eliminated: false,
            isPlayer: true
        });

        for (const opp of this.opponentManager.opponents) {
            rows.push({
                label: "Racer " + (opp.index + 1),
                place: opp.finished ? opp.place : null,
                eliminated: Boolean(opp.eliminated && !opp.finished),
                isPlayer: false
            });
        }

        const rank = r =>
            r.place !== null ? 0 : (r.eliminated ? 1 : 2);

        rows.sort((a, b) =>
            rank(a) - rank(b) ||
            (a.place || 0) - (b.place || 0)
        );

        return rows.map(r => {
            const status =
                r.place !== null
                    ? this.getOrdinal(r.place)
                    : (r.eliminated ? "Eliminated" : "DNF");

            return `
                <div style="
                    display:flex;
                    justify-content:space-between;
                    padding:6px 12px;
                    margin:4px 0;
                    border-radius:6px;
                    background:${r.isPlayer ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"};
                    font-weight:${r.isPlayer ? "bold" : "normal"};
                ">
                    <span>${r.label}</span>
                    <span>${status}</span>
                </div>
            `;
        }).join("");
    }

    updateFinishResults() {
        if (!this.finishLive) {
            return;
        }

        // Stop once the message is gone, the state moved on, or the
        // 3 hour race window is over.
        if (
            this.state !== "FINISHED" ||
            !this.finishResultsEl ||
            !this.finishResultsEl.isConnected ||
            this.getRaceElapsedHours(
                (gameSeconds / DAY_LENGTH) * 24
            ) >= 3
        ) {
            this.finishLive = false;
            return;
        }

        const html = this.buildFinishResultsHtml();

        if (html !== this.finishResultsHtml) {
            this.finishResultsHtml = html;
            this.finishResultsEl.innerHTML = html;
        }
    }

    showFinishMessage(timedOut = false) {
        // Timer ended the race and nobody reached the finish.
        const noResults =
            timedOut &&
            !this.opponentManager.opponents.some(
                opp => opp.finished
            );

        const overlay =
            document.createElement("div");

        overlay.id =
            "raceFinishMessage";

        overlay.style.position =
            "fixed";

        overlay.style.inset =
            "0";

        overlay.style.display =
            "flex";

        overlay.style.alignItems =
            "center";

        overlay.style.justifyContent =
            "center";

        overlay.style.background =
            "rgba(0,0,0,0.72)";

        overlay.style.zIndex =
            "10000";

        const box =
            document.createElement("div");

        box.style.width =
            "min(520px, 80vw)";

        box.style.padding =
            "28px";

        box.style.background =
            "rgba(15,15,15,0.96)";

        box.style.border =
            "2px solid white";

        box.style.borderRadius =
            "12px";

        box.style.color =
            "white";

        box.style.textAlign =
            "center";

        box.innerHTML = `
            <h2 style="margin-top:0;">
                RACE FINISHED
            </h2>

            <div id="raceFinishResults" style="margin:16px 0;"></div>

            <button
                id="raceFinishContinue"
                style="
                    padding:10px 24px;
                    font-weight:bold;
                    cursor:pointer;
                "
            >
                CONTINUE
            </button>
        `;

        overlay.appendChild(box);

        document.body.appendChild(
            overlay
        );

        this.finishResultsEl =
            document.getElementById(
                "raceFinishResults"
            );

        if (noResults) {
            this.finishLive = false;

            if (this.finishResultsEl) {
                this.finishResultsEl.textContent =
                    "Race ended, no results";
            }
        } else {
            this.finishResultsHtml =
                this.buildFinishResultsHtml();

            if (this.finishResultsEl) {
                this.finishResultsEl.innerHTML =
                    this.finishResultsHtml;
            }

            // Positions keep updating live only when the player
            // crossed the line; after a timer end they are final.
            this.finishLive = !timedOut;
        }

        const continueButton =
            document.getElementById(
                "raceFinishContinue"
            );

        if (continueButton) {
            continueButton.addEventListener(
                "pointerdown",
                e => {
                    e.preventDefault();

                    this.finishLive = false;
                    this.finishResultsEl = null;

                    overlay.remove();

                    this.clearRaceState();

                    // No new race today: the saved race time
                    // key stays until midnight.
                    this.state = "WAITING";
                }
            );
        }
    }

    // --------------------------------------------------------
    // MARKER DATA
    // --------------------------------------------------------

    getStartMarker() {
        if (
            !this.startMarkerVisible ||
            !this.startMarkerEnabled ||
            !this.start
        ) {
            return null;
        }

        return this.start;
    }

    getRaceMarkers() {
        if (
            !this.raceMarkersVisible
        ) {
            return [];
        }

        // Completed checkpoints are removed; the finish
        // always stays last so the maps still draw it
        // as the finish marker.
        return [
            ...this.checkpoints.filter(
                (cp, i) => !this.checkpointsDone[i]
            ),
            this.finish
        ].filter(Boolean);
    }

    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    clearRaceState() {
        this.start = null;
        this.finish = null;
        this.checkpoints = [];
        this.checkpointsDone = [];
        this.zonesWarned = {};
        this.route = [];

        this.startMarkerVisible = false;
        this.startMarkerEnabled = false;
        this.raceMarkersVisible = false;

        this.raceStarted = false;
        this.raceClockStarted = false;

        this.playerJoined = false;
        this.playerLeftRace = false;

        this.finishPlaceCounter = 0;
        this.playerPlace = null;

        this.raceStartHour = null;
        this.raceStartMinute = 0;
        this.raceEndHour = null;
        this.raceStartedAtHour = null;

        this.phoneMessageActive = false;
        this.phoneMessageDismissed = false;

        if (this.opponentManager) {
            this.opponentManager.clear();
        }

        this.hidePhoneRaceMessage();
        this.hideJoinButton();
    }

    // --------------------------------------------------------
    // TIME FORMAT
    // --------------------------------------------------------

    formatHourMinute(hour, minute) {
        const suffix =
            hour >= 12
                ? "PM"
                : "AM";

        let displayHour =
            hour % 12;

        if (displayHour === 0) {
            displayHour = 12;
        }

        return (
            `${displayHour}:` +
            `${String(minute).padStart(2, "0")} ` +
            suffix
        );
    }

    formatTime(hourFloat) {
        const hour =
            Math.floor(hourFloat);

        const minute =
            Math.floor(
                (hourFloat - hour) * 60
            );

        return this.formatHourMinute(
            hour,
            minute
        );
    }
}


// ============================================================
// CREATE GLOBAL MANAGER
// ============================================================

window.raceEventManager =
    new RaceEventsManager();
