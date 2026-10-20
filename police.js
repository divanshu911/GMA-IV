console.log("police.js v2 - surrender-visibility update");
// ============================================================
// HIT & RUN / CRIME CASE SYSTEM
// ============================================================

// --- POLICE BULLET SYSTEM INITIALIZATION ---
const policeBullets = [];
const POLICE_BULLET_SPEED = 7.5;
const POLICE_BULLET_LIFETIME = 55;
const POLICE_BULLET_RADIUS = 3;
const POLICE_OFFICER_FIRE_COOLDOWN = 28;
const POLICE_OFFICER_SHOOT_RANGE = 300;
const POLICE_OFFICER_MIN_CAR_SPEED = 0.35;
const POLICE_BULLET_SOUND_URL = "https://raw.githubusercontent.com/divanshu911/My-game-assets/ed8f60817772b47df611091dd6f73b2f58435b46/gunshot.wav";

let policeBulletSound = null;

const HIT_RUN_ESCAPE_DISTANCE = 450;

let pendingHitRunIncidents = [];

let playerHitRunCases = parseInt(
    localStorage.getItem("gma_hit_run_cases") || "0",
    10
);

let playerCarStealCases = parseInt(
    localStorage.getItem("gma_car_steal_cases") || "0",
    10
);

// ASSAULT IS A SEPARATE CRIME TYPE.
let playerAssaultCases = parseInt(
    localStorage.getItem("gma_assault_cases") || "0",
    10
);

function saveCrimeCaseCounts() {
    localStorage.setItem(
        "gma_hit_run_cases",
        String(playerHitRunCases)
    );

    localStorage.setItem(
        "gma_car_steal_cases",
        String(playerCarStealCases)
    );

    localStorage.setItem(
        "gma_assault_cases",
        String(playerAssaultCases)
    );
}

function hasActiveCrimeCases() {
    const hasStolenCarCrime =
        typeof cars !== "undefined" &&
        Array.isArray(cars) &&
        cars.some(car => car && car.isStolen);

    const hasCarStealCrime =
        playerCarStealCases > 0;

    const hasHitRunCrime =
        playerHitRunCases > 0;

    const hasAssaultCrime =
        playerAssaultCases > 0;

    return (
        hasStolenCarCrime ||
        hasCarStealCrime ||
        hasHitRunCrime ||
        hasAssaultCrime
    );
}

/* ============================================================
   WANTED SCORE
   Crime score is rebuilt from existing saved crime counters.
   Chase points and the total score are runtime-only.
   ============================================================ */

const CRIME_WANTED_SCORE_CAP = 60;

let crimeWantedScore = 0;
let chaseWantedScore = 0;
let wantedScore = 0;
let chaseScoreTimer = 0;

// Keep the total between 0 and 100.
function refreshWantedScore() {
    wantedScore = Math.max(
        0,
        Math.min(100, crimeWantedScore + chaseWantedScore)
    );

    return wantedScore;
}

// Add crime points with diminishing returns.
// The current TOTAL score affects the gain, but only the
// crime component is subject to the crime-only ceiling.

function addWantedCrimeScore(baseScore) {
    const currentScore = refreshWantedScore();

    // Crimes stop adding points once the TOTAL score reaches 60.
    if (currentScore >= 60) {
        return;
    }

    const gain = Math.max(
        0,
        baseScore * (1 - currentScore / 100)
    );

    crimeWantedScore = Math.min(
        CRIME_WANTED_SCORE_CAP,
        crimeWantedScore + gain
    );

    refreshWantedScore();
}
// Reconstruct crime score from existing persisted counters.
// The counters do not record the chronological order of crimes,
// so use a consistent order when rebuilding.
function rebuildCrimeWantedScore() {
    crimeWantedScore = 0;
    chaseWantedScore = 0;
    wantedScore = 0;
    chaseScoreTimer = 0;

    const savedCrimeTypes = [
        { count: Math.max(0, playerHitRunCases || 0), base: 15 },
        { count: Math.max(0, playerCarStealCases || 0), base: 10 },
        { count: Math.max(0, playerAssaultCases || 0), base: 5 }
    ];

    for (const crime of savedCrimeTypes) {
        for (
            let i = 0;
            i < crime.count &&
            crimeWantedScore < CRIME_WANTED_SCORE_CAP;
            i++
        ) {
            const gain =
                crime.base * (1 - crimeWantedScore / 100);

            crimeWantedScore = Math.min(
                CRIME_WANTED_SCORE_CAP,
                crimeWantedScore + gain
            );
        }
    }

    refreshWantedScore();
}

// Clear both components after arrest and release.
function clearWantedScore() {
    crimeWantedScore = 0;
    chaseWantedScore = 0;
    wantedScore = 0;
    chaseScoreTimer = 0;
}

// Initialise from the saved crime counters on game startup.
rebuildCrimeWantedScore();

// ------------------------------------------------------------
// ASSAULT CRIME
// Generic combat never calls this directly.
// Witness/reporting logic decides when an assault becomes a crime.
// ------------------------------------------------------------
function registerAssaultCrime(target = null) {
    if (!player) return false;

    // One punched NPC can only create one assault case.
    if (
        target &&
        target.assaultCrimeRegistered
    ) {
        return false;
    }

    if (target) {
        target.assaultCrimeRegistered = true;
    }

    playerAssaultCases++;
    addWantedCrimeScore(4);
    saveCrimeCaseCounts();

    player.wanted = true;

    localStorage.setItem(
        "gma_player_wanted",
        "true"
    );

    if (
        typeof taxiManager !== "undefined" &&
        taxiManager.setMessage
    ) {
        taxiManager.setMessage(
            "Assault reported to police!",
            180
        );
    }

    return true;
}

function clearWantedIfNoCrimeCases() {
    if (!player || player.beingChased || hasActiveCrimeCases()) {
        return false;
    }

    if (player.wanted) {
        player.wanted = false;
        localStorage.setItem("gma_player_wanted", "false");
    }

    return true;
}

function registerHitRunIncident(type, x, y, entityId = null) {
    // Prevent the same victim/car from being registered twice.
    const alreadyRegistered = pendingHitRunIncidents.some(
        incident =>
            incident.entityId !== null &&
            entityId !== null &&
            incident.entityId === entityId
    );

    if (alreadyRegistered) return;

    pendingHitRunIncidents.push({
        type,
        x,
        y,
        entityId,
        reported: false
    });

    // Persist the pending incident locations.
    localStorage.setItem(
        "gma_pending_hit_run_incidents",
        JSON.stringify(
            pendingHitRunIncidents.map(incident => ({
                type: incident.type,
                x: incident.x,
                y: incident.y,
                entityId: incident.entityId,
                reported: incident.reported
            }))
        )
    );
}

function savePendingHitRunIncidents() {
    localStorage.setItem(
        "gma_pending_hit_run_incidents",
        JSON.stringify(
            pendingHitRunIncidents.map(incident => ({
                type: incident.type,
                x: incident.x,
                y: incident.y,
                entityId: incident.entityId,
                reported: incident.reported
            }))
        )
    );
}

function resolveNearbyHitRunIncidents() {
    let resolvedAny = false;

    pendingHitRunIncidents = pendingHitRunIncidents.filter(incident => {
        const distance = Math.hypot(
            player.x - incident.x,
            player.y - incident.y
        );

        if (distance <= HIT_RUN_ESCAPE_DISTANCE) {
            incident.reported = true;
            resolvedAny = true;
            return false;
        }

        return true;
    });

    savePendingHitRunIncidents();

    if (resolvedAny && typeof taxiManager !== 'undefined') {
        taxiManager.setMessage(
            "Ambulance called. Hit & run avoided.",
            180
        );
    }

    return resolvedAny;
}

function updateHitRunIncidents() {
    if (!player || pendingHitRunIncidents.length === 0) return;

    for (let i = pendingHitRunIncidents.length - 1; i >= 0; i--) {
        const incident = pendingHitRunIncidents[i];

        const distance = Math.hypot(
            player.x - incident.x,
            player.y - incident.y
        );

        // Once the player reaches 450 units, the opportunity to
        // report the accident is gone permanently.
        if (distance >= HIT_RUN_ESCAPE_DISTANCE) {
            pendingHitRunIncidents.splice(i, 1);

            playerHitRunCases++;
            addWantedCrimeScore(10);
            
            saveCrimeCaseCounts();

            player.wanted = true;
            localStorage.setItem(
                "gma_player_wanted",
                "true"
            );

            if (typeof taxiManager !== 'undefined') {
                taxiManager.setMessage(
                    "HIT & RUN! You left the scene.",
                    240
                );
            }
        }
    }

    savePendingHitRunIncidents();
}

// Load pending incidents from the previous session.
try {
    const savedIncidents = localStorage.getItem(
        "gma_pending_hit_run_incidents"
    );

    if (savedIncidents) {
        const parsedIncidents = JSON.parse(savedIncidents);

        if (Array.isArray(parsedIncidents)) {
            pendingHitRunIncidents = parsedIncidents.filter(
                incident =>
                    incident &&
                    Number.isFinite(Number(incident.x)) &&
                    Number.isFinite(Number(incident.y))
            );
        }
    }
} catch (error) {
    console.warn(
        "Could not load pending hit-run incidents.",
        error
    );
}

// Dynamic positioning helper
function repositionSirenButton() {
    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) {
        const exitRect = exitBtn.getBoundingClientRect();
        sirenBtn.style.right = (window.innerWidth - exitRect.right) + 'px';
        sirenBtn.style.bottom = (window.innerHeight - exitRect.top + 10) + 'px'; // 10px spacing above exitBtn
    }
}

// --- DYNAMIC SIREN BUTTON CREATION & EVENT LISTENERS ---
let sirenBtn = document.getElementById('sirenBtn');

if (!sirenBtn) {
    sirenBtn = document.createElement('button');
    sirenBtn.id = 'sirenBtn';
    sirenBtn.innerText = '🚨 SIREN: OFF';
    sirenBtn.style.position = 'fixed';

    // Position directly on the right side of the screen
    sirenBtn.style.right = '30px';
    sirenBtn.style.bottom = '120px'; // Adjust bottom distance as needed to sit neatly near your controls

    sirenBtn.style.padding = '10px 16px';
    sirenBtn.style.fontSize = '12px';
    sirenBtn.style.fontWeight = 'bold';
    sirenBtn.style.backgroundColor = '#111';
    sirenBtn.style.color = '#fff';
    sirenBtn.style.border = '2px solid #e74c3c';
    sirenBtn.style.borderRadius = '6px';
    sirenBtn.style.zIndex = '1000';
    sirenBtn.style.display = 'none';

    // UI alignment setup
    sirenBtn.style.alignItems = 'center';
    sirenBtn.style.justifyContent = 'center';

    document.body.appendChild(sirenBtn);
}

// Siren Button Tap Handler: OFF -> WAIL -> YELP -> OFF
sirenBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!playerCar || !playerCar.isPolice) return;

    let nextState = (playerCar.sirenState + 1) % 3;
    playerCar.setSirenState(nextState);

    updateSirenButtonLabel();
});

function updateSirenButtonLabel() {
    // Hide button if not in a car or if the current car is NOT a police car
    if (!playerCar || !playerCar.isPolice) {
        sirenBtn.style.display = 'none';
        return;
    }

    // Show button when inside a police car
    sirenBtn.style.display = 'flex';

    if (playerCar.sirenState === 1) {
        sirenBtn.innerText = '🚨 SIREN: WAIL';
        sirenBtn.style.borderColor = '#e74c3c';
    } else if (playerCar.sirenState === 2) {
        sirenBtn.innerText = '🚨 SIREN: YELP';
        sirenBtn.style.borderColor = '#3498db';
    } else {
        sirenBtn.innerText = '🚨 SIREN: OFF';
        sirenBtn.style.borderColor = '#ffffff';
    }
}
let beingchased = false;
let isPlayerSurrendered = false;

// Create Surrender Button UI
const surrenderBtn = document.createElement('button');
surrenderBtn.id = 'surrenderBtn';
surrenderBtn.innerText = 'SURRENDER';
surrenderBtn.style.position = 'fixed';
surrenderBtn.style.bottom = '20px';
surrenderBtn.style.left = '50%';
surrenderBtn.style.transform = 'translateX(-50%)';
surrenderBtn.style.padding = '12px 24px';
surrenderBtn.style.backgroundColor = '#e74c3c';
surrenderBtn.style.color = '#ffffff';
surrenderBtn.style.fontFamily = 'Arial';
surrenderBtn.style.fontSize = '16px';
surrenderBtn.style.fontWeight = 'bold';
surrenderBtn.style.border = '2px solid #ffffff';
surrenderBtn.style.borderRadius = '8px';
surrenderBtn.style.cursor = 'pointer';
surrenderBtn.style.zIndex = '2000';
surrenderBtn.style.display = 'none';

(document.getElementById('gameContainer') || document.body).appendChild(surrenderBtn);

function executeArrestProcess() {
    if (player.isBeingArrested) return;

    player.isBeingArrested = true;
    player.isArrestPassenger = false;
    player.ispassenger = false;
    player.arrestTransportCar = null;
    player.beingChased = false;

    // Stop player input immediately.
    player.speed = 0;

    // Hide all interaction controls immediately.
    if (typeof exitBtn !== 'undefined' && exitBtn) {
        exitBtn.style.display = 'none';
    }

    if (typeof jackBtn !== 'undefined' && jackBtn) {
        jackBtn.style.display = 'none';
    }

    if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
        surrenderBtn.style.display = 'none';
    }

    // If player was driving, force them out immediately.
    if (playerCar) {
        if (playerCar.humAudio) {
            playerCar.humAudio.pause();
            playerCar.humAudio = null;
        }

        const arrestedCar = playerCar;
        arrestedCar.speed = 0;
        arrestedCar.isParked = true;
        arrestedCar.hasDriver = false;

        const sideAngle = arrestedCar.angle - Math.PI / 2;

        player.x =
            arrestedCar.x +
            Math.cos(sideAngle) * 35;

        player.y =
            arrestedCar.y +
            Math.sin(sideAngle) * 35;

        player.angle = arrestedCar.angle;

        playerCar = null;
    }

    // Capture police cars that were ACTUALLY chasing at the instant of arrest.
    arrestEscortCars = cars.filter(c =>
        c &&
        c.isPolice &&
        (c.policeState === "CHASE" || c.policeState === "WARNING") &&
        c !== playerCar &&
        !c.exploded &&
        c.health > 0
    );
    arrestEscortCars.forEach((escort, index) => {
        escort.policeState = "ARREST_ESCORT";
        escort.isParked = false;
        escort.hasDriver = true;
        escort.arrestEscortIndex = index;
        escort.arrestEscortPath = null;
        escort.arrestEscortRepathTimer = 0;

        if (typeof escort.playSiren === 'function') {
            escort.playSiren(2);
        } else {
            escort.sirenState = 2;
        }
    });

    // The arresting police car is a NEW vehicle.
    arrestTransportCar = null;
    arrestTransportState = "SPAWNING";
    arrestTransportPath = null;
    arrestTransportRepathTimer = 0;
    arrestTransitionStarted = false;

    player.wanted = true;
    localStorage.setItem("gma_player_wanted", "true");

    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
        taxiManager.setMessage("Police are taking you in...", 180);
    }

    spawnArrestTransportCar();
}

// ============================================================
// ARREST TRANSPORT SYSTEM
// ============================================================

const ARREST_STATION_X = 3692;
const ARREST_STATION_Y = 421;

let arrestTransportCar = null;
let arrestEscortCars = [];
let arrestTransportState = "NONE";
let arrestTransportPath = null;
let arrestTransportRepathTimer = 0;
let arrestTransitionStarted = false;
let arrestFadeOverlay = null;

function getArrestFadeOverlay() {
    if (arrestFadeOverlay) return arrestFadeOverlay;

    arrestFadeOverlay = document.createElement("div");
    arrestFadeOverlay.id = "arrestFadeOverlay";

    arrestFadeOverlay.style.position = "fixed";
    arrestFadeOverlay.style.left = "0";
    arrestFadeOverlay.style.top = "0";
    arrestFadeOverlay.style.width = "100vw";
    arrestFadeOverlay.style.height = "100vh";
    arrestFadeOverlay.style.background = "#000";
    arrestFadeOverlay.style.opacity = "0";
    arrestFadeOverlay.style.pointerEvents = "none";
    arrestFadeOverlay.style.zIndex = "99999";
    arrestFadeOverlay.style.transition = "opacity 0.45s ease";

    document.body.appendChild(arrestFadeOverlay);

    return arrestFadeOverlay;
}

function getArrestSpawnPosition() {
    const SPAWN_DISTANCE = 500;

    const angles = [
        0,
        Math.PI * 0.25,
        Math.PI * 0.5,
        Math.PI * 0.75,
        Math.PI,
        Math.PI * 1.25,
        Math.PI * 1.5,
        Math.PI * 1.75
    ];

    for (const angle of angles) {
        const x = player.x + Math.cos(angle) * SPAWN_DISTANCE;
        const y = player.y + Math.sin(angle) * SPAWN_DISTANCE;

        if (
            x > 30 &&
            y > 30 &&
            x < mapWidth - 30 &&
            y < mapHeight - 30 &&
            isAICarWalkable(x, y)
        ) {
            return { x, y };
        }
    }

    for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance =
            SPAWN_DISTANCE - 40 + Math.random() * 80;

        const x = player.x + Math.cos(angle) * distance;
        const y = player.y + Math.sin(angle) * distance;

        if (
            x > 30 &&
            y > 30 &&
            x < mapWidth - 30 &&
            y < mapHeight - 30 &&
            isAICarWalkable(x, y)
        ) {
            return { x, y };
        }
    }

    return getRandomStrictRoadPosition();
}        

function spawnArrestTransportCar() {
    const spawn = getArrestSpawnPosition();

    const id =
        Date.now() +
        700000 +
        Math.floor(Math.random() * 10000);

    const policeCar =
        new Car(
            id,
            spawn.x,
            spawn.y,
            "#111111",
            true
        );

    policeCar.isPolice = true;
    policeCar.ownerType = "police";
    policeCar.type = "Commuter, Sedan";

    policeCar.width = 16;
    policeCar.length = 28;
    policeCar.baseSpeed = 3.2;
    policeCar.speed = 3.2;

    policeCar.isParked = false;
    policeCar.hasDriver = true;
    policeCar.policeState = "ARREST_TRANSPORT";

    policeCar.angle =
        Math.atan2(
            player.y - policeCar.y,
            player.x - policeCar.x
        ) + Math.PI / 2;

    policeCar.arrestTransportRepathTimer = 0;
    policeCar.arrestTransportPath = null;

    if (typeof policeCar.playSiren === 'function') {
        policeCar.playSiren(2);
    } else {
        policeCar.sirenState = 2;
    }

    cars.push(policeCar);

    arrestTransportCar = policeCar;
    arrestTransportState = "APPROACHING";
}

function getPoliceObstacleAvoidance(car, moveAngle, cars) {
    if (!car) {
        return {
            angle: moveAngle,
            blocked: false
        };
    }

    const forwardX = Math.cos(moveAngle);
    const forwardY = Math.sin(moveAngle);

    const rightX = -forwardY;
    const rightY = forwardX;

    const sensorLength = Math.max(
        45,
        (car.sensorLength || 35) + 20
    );

    const sideOffset = 22;
    const sampleDistances = [
        sensorLength * 0.45,
        sensorLength * 0.70,
        sensorLength
    ];

    function isBlockedByCollisionPixel(x, y) {
        if (
            typeof collisionData === "undefined" ||
            !collisionData ||
            typeof collisionMapImage === "undefined" ||
            !collisionMapImage.width ||
            !collisionMapImage.height
        ) {
            return false;
        }

        const px = Math.floor(x);
        const py = Math.floor(y);

        if (
            px < 0 ||
            py < 0 ||
            px >= collisionMapImage.width ||
            py >= collisionMapImage.height
        ) {
            return true;
        }

        const index =
            (py * collisionMapImage.width + px) * 4;

        const r = collisionData[index];
        const g = collisionData[index + 1];
        const b = collisionData[index + 2];

        const yellow =
            r >= 220 &&
            g >= 175 &&
            b <= 85 &&
            r - b >= 135 &&
            g - b >= 90;

        const blue =
            b >= 120 &&
            b > r * 1.15 &&
            b > g * 1.05;

        return yellow || blue;
    }

    function isBlockedByCar(x, y) {
        if (!Array.isArray(cars)) return false;

        for (const otherCar of cars) {
            if (
                !otherCar ||
                otherCar === car ||
                otherCar.exploded
            ) {
                continue;
            }

            const distance = Math.hypot(
                otherCar.x - x,
                otherCar.y - y
            );

            if (distance < 28) {
                return true;
            }
        }

        return false;
    }

    function checkDirection(side) {
        let blockedCount = 0;

        for (const distance of sampleDistances) {
            const centerX =
                car.x +
                forwardX * distance;

            const centerY =
                car.y +
                forwardY * distance;

            const sideX =
                centerX +
                rightX * side * sideOffset;

            const sideY =
                centerY +
                rightY * side * sideOffset;

            if (
                isBlockedByCollisionPixel(
                    centerX,
                    centerY
                )
            ) {
                blockedCount += 2;
            }

            if (
                isBlockedByCollisionPixel(
                    sideX,
                    sideY
                )
            ) {
                blockedCount += 1;
            }

            if (
                isBlockedByCar(
                    sideX,
                    sideY
                )
            ) {
                blockedCount += 2;
            }
        }

        return blockedCount;
    }

    const centerBlocked =
        isBlockedByCollisionPixel(
            car.x + forwardX * 35,
            car.y + forwardY * 35
        ) ||
        isBlockedByCar(
            car.x + forwardX * 35,
            car.y + forwardY * 35
        );

    if (!centerBlocked) {
        return {
            angle: moveAngle,
            blocked: false
        };
    }

    const leftScore = checkDirection(-1);
    const rightScore = checkDirection(1);

    const turnAmount = Math.PI * 0.55;

    if (leftScore < rightScore) {
        return {
            angle: moveAngle - turnAmount,
            blocked: true
        };
    }

    if (rightScore < leftScore) {
        return {
            angle: moveAngle + turnAmount,
            blocked: true
        };
    }

    return {
        angle: moveAngle + Math.PI * 0.35,
        blocked: true
    };
}

function moveArrestPoliceCar(
    car,
    targetX,
    targetY,
    dt,
    speed
) {
    if (!car) return;

    if (car.arrestTransportRepathTimer === undefined) {
        car.arrestTransportRepathTimer = 0;
    }

    if (car.arrestTransportPathIndex === undefined) {
        car.arrestTransportPathIndex = 1;
    }

    // Cached staging sensors.
    // These do not need to be recalculated every frame.
    if (car.arrestObstacleProbeTimer === undefined) {
        car.arrestObstacleProbeTimer = 0;
    }

    if (car.arrestPathBlockedByCar === undefined) {
        car.arrestPathBlockedByCar = false;
    }

    if (car.arrestTerrainProbeTimer === undefined) {
        car.arrestTerrainProbeTimer = 0;
    }

    if (car.arrestEdgePushX === undefined) {
        car.arrestEdgePushX = 0;
        car.arrestEdgePushY = 0;
    }
    car.arrestTransportRepathTimer -= dt;

    const checkSensorDist = (car.sensorLength || 35) + 10;
    const forwardAngle = car.angle - Math.PI / 2;

    car.arrestObstacleProbeTimer -= dt;

    if (car.arrestObstacleProbeTimer <= 0) {
        const frontCheckX =
            car.x +
            Math.cos(forwardAngle) * checkSensorDist;

        const frontCheckY =
            car.y +
            Math.sin(forwardAngle) * checkSensorDist;

        let pathBlockedByCar = false;

        if (typeof cars !== 'undefined') {
            const BLOCK_DISTANCE_SQ = 400; // 20 * 20

            for (let i = 0; i < cars.length; i++) {
                const otherCar = cars[i];

                if (
                    otherCar !== car &&
                    otherCar !== playerCar &&
                    !otherCar.exploded
                ) {
                    const dx = otherCar.x - frontCheckX;
                    const dy = otherCar.y - frontCheckY;

                    if (dx * dx + dy * dy < BLOCK_DISTANCE_SQ) {
                        pathBlockedByCar = true;
                        break;
                    }
                }
            }
        }

        car.arrestPathBlockedByCar = pathBlockedByCar;

        // Recheck roughly 8 times per second.
        car.arrestObstacleProbeTimer = 0.12;
    }

    const pathBlockedByCar =
        car.arrestPathBlockedByCar;

 if (!car.arrestTransportPath || (pathBlockedByCar && car.arrestTransportRepathTimer <= 0)) {
        const newPath = navigationSystem.findPath(
            car.x,
            car.y,
            targetX,
            targetY,
            true
        );

        if (newPath && newPath.length > 1) {
            car.arrestTransportPath = newPath;

            let closestIndex = 1;
            let closestDistance = Infinity;

            for (let i = 1; i < newPath.length; i++) {
                const waypoint = newPath[i];
                if (!waypoint) continue;

                const distance = Math.hypot(
                    waypoint.x - car.x,
                    waypoint.y - car.y
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = i;
                }
            }

            car.arrestTransportPathIndex = closestIndex;
        }

        car.arrestTransportRepathTimer = 0.33;
    }

    const path = car.arrestTransportPath;
    let moveAngle = Math.atan2(
        targetY - car.y,
        targetX - car.x
    );

    if (path && path.length > 1 && car.arrestTransportPathIndex < path.length) {
        let waypoint = path[car.arrestTransportPathIndex];

        if (waypoint) {
            const waypointDistance = Math.hypot(
                waypoint.x - car.x,
                waypoint.y - car.y
            );

            if (waypointDistance < 18) {
                car.arrestTransportPathIndex++;
                waypoint = path[car.arrestTransportPathIndex];
            }

            if (waypoint) {
                moveAngle = Math.atan2(
                    waypoint.y - car.y,
                    waypoint.x - car.x
                );
            }
        }
    }

    let avoidX = 0;
    let avoidY = 0;
    const avoidanceRadius = 43;

    if (typeof cars !== 'undefined') {
        cars.forEach(otherCar => {
            if (otherCar !== car && otherCar !== playerCar && otherCar.isPolice) {
                const dx = otherCar.x - car.x;
                const dy = otherCar.y - car.y;
                const d = Math.hypot(dx, dy);

                if (d < avoidanceRadius && d > 0.01) {
                    const strength = (avoidanceRadius - d) / avoidanceRadius;
                    avoidX -= (dx / d) * strength;
                    avoidY -= (dy / d) * strength;
                }
            }
        });
    }

    if (avoidX !== 0 || avoidY !== 0) {
        const avoidAngle = Math.atan2(avoidY, avoidX);
        const separationStrength = Math.min(0.35, Math.hypot(avoidX, avoidY) * 0.35);

        const chaseX = Math.cos(moveAngle);
        const chaseY = Math.sin(moveAngle);
        const avoidDirX = Math.cos(avoidAngle);
        const avoidDirY = Math.sin(avoidAngle);

        const finalX = chaseX * (1 - separationStrength) + avoidDirX * separationStrength;
        const finalY = chaseY * (1 - separationStrength) + avoidDirY * separationStrength;

        if (Math.hypot(finalX, finalY) > 0.001) {
            moveAngle = Math.atan2(finalY, finalX);
        }
    }

    // --- SMALL NON-ROAD AVOIDANCE (keeps transport near road center) ---
    // Samples a small ring around the car and nudges it away from
    // non-road pixels (buildings, river, trees, grass). Grass is only
    // avoided while the A* route is still on road; if the car or its
    // current waypoint is already on grass, grass is ignored (solid
    // obstacles like buildings/river/trees are still avoided).
    if (
        typeof collisionData !== "undefined" &&
        collisionData &&
        typeof mapWidth !== "undefined" &&
        mapWidth > 0 &&
        typeof getTerrainType === "function"
    ) {
        const terrainAt = (x, y) => {
            const px = Math.floor(x);
            const py = Math.floor(y);
            if (px < 0 || py < 0 || px >= mapWidth || py >= mapHeight) return "BLOCKED";
            const i = (py * mapWidth + px) * 4;
            return getTerrainType(collisionData[i], collisionData[i + 1], collisionData[i + 2]);
        };

        const pathWaypoint =
            car.arrestTransportPath &&
            car.arrestTransportPath[car.arrestTransportPathIndex];

        const routeOnGrass =
            terrainAt(car.x, car.y) === "GRASS" ||
            (pathWaypoint && terrainAt(pathWaypoint.x, pathWaypoint.y) === "GRASS");
        car.arrestTerrainProbeTimer -= dt;

        if (car.arrestTerrainProbeTimer <= 0) {
            const edgeRadius = 15;
            const edgeSamples = 8;

            let edgePushX = 0;
            let edgePushY = 0;

            for (let i = 0; i < edgeSamples; i++) {
                const a =
                    (i / edgeSamples) *
                    Math.PI *
                    2;

                const dirX = Math.cos(a);
                const dirY = Math.sin(a);

                const t = terrainAt(
                    car.x + dirX * edgeRadius,
                    car.y + dirY * edgeRadius
                );

                const isBad =
                    t === "BLOCKED" ||
                    (t === "GRASS" && !routeOnGrass);

                if (isBad) {
                    edgePushX -= dirX;
                    edgePushY -= dirY;
                }
            }

            car.arrestEdgePushX = edgePushX;
            car.arrestEdgePushY = edgePushY;

            car.arrestTerrainProbeTimer = 0.12;
        }

        const edgePushX = car.arrestEdgePushX;
        const edgePushY = car.arrestEdgePushY;

        const edgePushLen =
            Math.sqrt(
                edgePushX * edgePushX +
                edgePushY * edgePushY
            );

        if (edgePushLen > 0.001) {
            const edgeStrength =
                Math.min(
                    0.3,
                    edgePushLen * 0.1
                );

            const fx =
                Math.cos(moveAngle) *
                    (1 - edgeStrength) +
                (edgePushX / edgePushLen) *
                    edgeStrength;

            const fy =
                Math.sin(moveAngle) *
                    (1 - edgeStrength) +
                (edgePushY / edgePushLen) *
                    edgeStrength;

            if (Math.sqrt(fx * fx + fy * fy) > 0.001) {
                moveAngle = Math.atan2(fy, fx);
            }
        }
    }

    const localAvoidance = getPoliceObstacleAvoidance(
        car,
        moveAngle,
        cars
    );

    if (localAvoidance.blocked) {
        car.speed = 0;
        return;
    }

    smoothlyTurnAIMovement(car, moveAngle, dt, true);
    car.speed = speed;

    const nextX = car.x + Math.cos(moveAngle) * speed * dt;
    const nextY = car.y + Math.sin(moveAngle) * speed * dt;

    if (isGrassOrRoad(nextX, nextY)) {
        car.x = nextX;
        car.y = nextY;
    } else {
        const xWalkable = isGrassOrRoad(nextX, car.y);
        const yWalkable = isGrassOrRoad(car.x, nextY);

        if (xWalkable && yWalkable) {
            const xDist = Math.hypot(targetX - nextX, targetY - car.y);
            const yDist = Math.hypot(targetX - car.x, targetY - nextY);
            if (xDist <= yDist) car.x = nextX;
            else car.y = nextY;
        } else if (xWalkable) {
            car.x = nextX;
        } else if (yWalkable) {
            car.y = nextY;
        } else {
            car.speed = 0;
        }
    }
}

function startArrestTransition() {
    if (arrestTransitionStarted) return;

    arrestTransitionStarted = true;
    arrestTransportState = "TRANSITION";

    const overlay = getArrestFadeOverlay();
    overlay.style.opacity = "1";

    setTimeout(() => {
        if (arrestTransportCar) {
            if (typeof arrestTransportCar.stopSiren === 'function') {
                arrestTransportCar.stopSiren();
            }

            if (arrestTransportCar.humAudio) {
                arrestTransportCar.humAudio.pause();
                arrestTransportCar.humAudio = null;
            }

            const index = cars.indexOf(arrestTransportCar);

            if (index > -1) {
                cars.splice(index, 1);
            }
        }

        arrestTransportCar = null;

        arrestEscortCars.forEach(escort => {
            if (!escort) return;

            if (typeof escort.stopSiren === 'function') {
                escort.stopSiren();
            }

            if (escort.humAudio) {
                escort.humAudio.pause();
                escort.humAudio = null;
            }

            const index = cars.indexOf(escort);

            if (index > -1) {
                cars.splice(index, 1);
            }
        });

        arrestEscortCars = [];

        cars = cars.filter(car => {
            if (!car || !car.isStolen) {
                return true;
            }

            if (typeof car.stopSiren === 'function') {
                car.stopSiren();
            }

            if (car.humAudio) {
                car.humAudio.pause();
                car.humAudio = null;
            }

            return false;
        });

        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car");

        player.wanted = false;
        player.beingChased = false;

        localStorage.setItem(
            "gma_player_wanted",
            "false"
        );

        player.x = ARREST_STATION_X;
        player.y = ARREST_STATION_Y;
        player.speed = 0;
        clearWantedScore();

        setTimeout(() => {
            overlay.style.opacity = "0";

            setTimeout(() => {
                player.isBeingArrested = false;
                player.isArrestPassenger = false;
                player.ispassenger = false;
                camera.passengerFollowAngle = null;  
                player.arrestTransportCar = null; 
                arrestTransportState = "NONE";                       
                arrestTransitionStarted = false;                 
                arrestTransportPath = null;
                arrestTransportRepathTimer = 0;

                if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
                    surrenderBtn.style.display = 'none';
                }

                if (typeof exitBtn !== 'undefined' && exitBtn) {
                    exitBtn.style.display = 'none';
                }

                if (typeof jackBtn !== 'undefined' && jackBtn) {
                    jackBtn.style.display = 'none';
                }

                if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    const hitRunCharges = playerHitRunCases;
                    const carStealCharges = playerCarStealCases;
                    const assaultCharges = playerAssaultCases;

                    taxiManager.setMessage(
                        `Charged with ${hitRunCharges} hit-run, ${carStealCharges} car steal & ${assaultCharges} assault cases.`,
                        300
                    );

                    playerHitRunCases = 0;
                    playerCarStealCases = 0;
                    playerAssaultCases = 0;

                    saveCrimeCaseCounts();               
                    pendingHitRunIncidents = [];
                    savePendingHitRunIncidents();
                }
            }, 450);

        }, 2000);

    }, 450);
}

function updateArrestTransport(dt) {
    if (!player.isBeingArrested) return false;

    player.speed = 0;

    if (arrestTransportCar) {
        if (arrestTransportCar.stuckX === undefined) {
            arrestTransportCar.stuckX = arrestTransportCar.x;
            arrestTransportCar.stuckY = arrestTransportCar.y;
            arrestTransportCar.stuckTimer = 0;
        }

        const transportMoved = Math.hypot(
            arrestTransportCar.x - arrestTransportCar.stuckX,
            arrestTransportCar.y - arrestTransportCar.stuckY
        );

        if (transportMoved > 1) {
            arrestTransportCar.stuckX = arrestTransportCar.x;
            arrestTransportCar.stuckY = arrestTransportCar.y;
            arrestTransportCar.stuckTimer = 0;
        } else {
            arrestTransportCar.stuckTimer += dt;
        }

        if (arrestTransportCar.stuckTimer >= 300) {
            const safeRoadPosition = getRandomStrictRoadPosition();

            arrestTransportCar.x = safeRoadPosition.x;
            arrestTransportCar.y = safeRoadPosition.y;

            arrestTransportCar.speed = 0;
            arrestTransportCar.velocityX = 0;
            arrestTransportCar.velocityY = 0;

            arrestTransportCar.stuckX = arrestTransportCar.x;
            arrestTransportCar.stuckY = arrestTransportCar.y;
            arrestTransportCar.stuckTimer = 0;

            arrestTransportCar.arrestTransportPath = null;
            arrestTransportCar.arrestTransportRepathTimer = 0;

            if (player.isArrestPassenger) {
                player.x = arrestTransportCar.x;
                player.y = arrestTransportCar.y;
                player.angle = arrestTransportCar.angle;
            }

            console.log(
                "Arrest transport stuck for 5 seconds — respawned on road."
            );
        }
    }

    if (typeof exitBtn !== 'undefined' && exitBtn) {
        exitBtn.style.display = 'none';
    }

    if (typeof jackBtn !== 'undefined' && jackBtn) {
        jackBtn.style.display = 'none';
    }

    if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
        surrenderBtn.style.display = 'none';
    }

    if (
        arrestTransportState === "APPROACHING" &&
        arrestTransportCar
    ) {
        const distance = Math.hypot(
            player.x - arrestTransportCar.x,
            player.y - arrestTransportCar.y
        );

        if (distance <= 71) {
            arrestTransportState = "CARRYING";

            player.isArrestPassenger = true;
            player.ispassenger = true;
            player.arrestTransportCar = arrestTransportCar;

            arrestTransportCar.speed = 0;
            arrestTransportCar.hasArrestPassenger = true;       

            arrestTransportCar.arrestTransportPath = null;
            arrestTransportCar.arrestTransportRepathTimer = 0;

        } else {
            moveArrestPoliceCar(
                arrestTransportCar,
                player.x,
                player.y,
                dt,
                3.2
            );
        }
    }

    if (
        arrestTransportState === "CARRYING" &&
        arrestTransportCar
    ) {
        player.x = arrestTransportCar.x;
        player.y = arrestTransportCar.y;
        player.angle = arrestTransportCar.angle;
        player.speed = 0;

        const stationDistance = Math.hypot(
            ARREST_STATION_X - arrestTransportCar.x,
            ARREST_STATION_Y - arrestTransportCar.y
        );

        if (stationDistance <= 55) {
            arrestTransportCar.x = ARREST_STATION_X;
            arrestTransportCar.y = ARREST_STATION_Y;
            arrestTransportCar.speed = 0;

            player.x = ARREST_STATION_X;
            player.y = ARREST_STATION_Y;

            startArrestTransition();
        } else {
            moveArrestPoliceCar(
                arrestTransportCar,
                ARREST_STATION_X,
                ARREST_STATION_Y,
                dt,
                3.2
            );

            player.x = arrestTransportCar.x;
            player.y = arrestTransportCar.y;
            player.angle = arrestTransportCar.angle;
        }
    }

    if (
        arrestTransportCar &&
        arrestTransportState !== "TRANSITION"
    ) {
        arrestEscortCars.forEach((escort, index) => {
            if (!player.isArrestPassenger) {
                escort.speed = 0;
                escort.velocityX = 0;
                escort.velocityY = 0;
                return;
            }

            if (!escort) return;
            if (!cars.includes(escort)) return;

            const forwardAngle = arrestTransportCar.angle - Math.PI / 2;

            const side = index % 2 === 0 ? -1 : 1;
            const row = Math.floor(index / 2);

            const targetX =
                arrestTransportCar.x -
                Math.cos(forwardAngle) * (65 + row * 45) +
                Math.cos(forwardAngle + Math.PI / 2) * side * 45;

            const targetY =
                arrestTransportCar.y -
                Math.sin(forwardAngle) * (65 + row * 45) +
                Math.sin(forwardAngle + Math.PI / 2) * side * 45;

            moveArrestPoliceCar(
                escort,
                targetX,
                targetY,
                dt,
                3.2
            );

            if (typeof escort.playSiren === 'function') {
                escort.playSiren(2);
            } else {
                escort.sirenState = 2;
            }
        });
    }

    return true;
}    

surrenderBtn.addEventListener('click', () => {
    if (player.isBeingArrested) return;

    isPlayerSurrendered = true;
    executeArrestProcess();
});

function isPlayerNearPoliceUnit(maxDistance = 120, specificUnit = null) {
    if (!player) return false;

    const distanceTo = unit =>
        Math.hypot(player.x - unit.x, player.y - unit.y);

    if (specificUnit) {
        return (
            specificUnit.isPolice &&
            specificUnit.policeState === "CHASE" &&
            !specificUnit.exploded &&
            (specificUnit.health === undefined || specificUnit.health > 0) &&
            !specificUnit.isInjured &&
            distanceTo(specificUnit) <= maxDistance
        );
    }

    const eligible = unit =>
        unit &&
        unit.isPolice &&
        unit !== playerCar &&
        (unit.policeState === "CHASE" ||
         unit.policeState === "WARNING") &&
        !unit.exploded &&
        (unit.health === undefined || unit.health > 0) &&
        !unit.isInjured &&
        distanceTo(unit) <= maxDistance;

    return cars.some(eligible) || npcs.some(eligible);
}

function updateSurrenderButtonVisibility() {
    if (!surrenderBtn) return;

    const shouldShow =
        !!player &&
        !!player.wanted &&
        !player.isBeingArrested &&
        !isPlayerSurrendered &&
        isPlayerNearPoliceUnit(120);

    surrenderBtn.style.display = shouldShow ? 'block' : 'none';
}

// --- STAGE 4A: POLICE RECOGNITION, WARNING & ARREST SYSTEM ---

function playPoliceBulletSound() {
    if (!POLICE_BULLET_SOUND_URL) return;

    if (!policeBulletSound) {
        policeBulletSound = new Audio(POLICE_BULLET_SOUND_URL);
        policeBulletSound.volume = 0.70;
    }

    policeBulletSound.currentTime = 0;
    policeBulletSound.play().catch(() => {});
}

function fireOfficerBullet(officer, targetCar) {
    if (!officer || !targetCar) return;

    const dx = targetCar.x - officer.x;
    const dy = targetCar.y - officer.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 0 || distance > POLICE_OFFICER_SHOOT_RANGE) return;

    const angle = Math.atan2(dy, dx);

    policeBullets.push({
        x: officer.x,
        y: officer.y,
        vx: Math.cos(angle) * POLICE_BULLET_SPEED,
        vy: Math.sin(angle) * POLICE_BULLET_SPEED,
        life: POLICE_BULLET_LIFETIME,
        owner: officer,
        targetCar: targetCar
    });

    officer.policeFiringTimer = 10;
    playPoliceBulletSound();   
}

function updatePoliceBullets(dt) {
    for (let i = policeBullets.length - 1; i >= 0; i--) {
        const bullet = policeBullets[i];

        if (!bullet || !bullet.targetCar) {
            policeBullets.splice(i, 1);
            continue;
        }

        const car = bullet.targetCar;

        if (
            car.exploded ||
            car.health <= 0 ||
            playerCar !== car
        ) {
            policeBullets.splice(i, 1);
            continue;
        }

        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;

        const hitDistance = Math.hypot(
            bullet.x - car.x,
            bullet.y - car.y
        );

        const hitRadius = Math.max(
            16,
            (car.width || 18) * 0.75,
            (car.length || 28) * 0.22
        );

        if (hitDistance <= hitRadius) {
            if (!car.tirePunctured) {
                car.tirePunctured = true;
                taxiManager.setMessage("Car's tyre is punctured!", 240);

                if (Math.abs(car.speed) > car.baseSpeed * 1.15) {
                    car.speed = Math.sign(car.speed) * car.baseSpeed * 1.15;
                }
            }

            policeBullets.splice(i, 1);
            continue;
        }

        if (bullet.life <= 0) {
            policeBullets.splice(i, 1);
        }
    }
}

function drawPoliceBullets(ctx) {
    if (!policeBullets.length) return;

    ctx.save();

    policeBullets.forEach(bullet => {
        const bulletAngle = Math.atan2(
            bullet.vy,
            bullet.vx
        );

        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(bulletAngle);

        ctx.shadowColor = "#ffd84a";
        ctx.shadowBlur = 6;
        ctx.fillStyle = "#ffd84a";

        ctx.fillRect(-6, -1.5, 12, 3);  
        ctx.restore();
    });

    ctx.restore();
}                                                             

function smoothlyTurnAIMovement(unit, moveAngle, dt, isCar) {
    const targetAngle = moveAngle + Math.PI / 2;

    const baseTurnSpeed = isCar
        ? Math.max(unit.turnSpeed || 0.05, 0.085)
        : 0.12;

    let angleDiff = targetAngle - unit.angle;

    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    const turnAmount = Math.abs(angleDiff);

    const directionScale = 0.5 + (turnAmount / Math.PI) * 1.5;
    const turnSpeed = baseTurnSpeed * directionScale;
    const maxTurn = turnSpeed * dt;

    unit.angle += Math.sign(angleDiff) * Math.min(turnAmount, maxTurn);
}

function updateSinglePoliceChase(unit, dt, player, cars, npcs) {
    const isCar = unit.length !== undefined;

    if (!isCar && unit.isInjured) {
        unit.speed = 0;
        unit.policeState = "PATROL";
        unit.policeFiringTimer = 0;
        return;
    }
    if (!isCar && unit.policeFiringTimer > 0) {
        unit.policeFiringTimer -= dt;
    }

    if (isCar) {
        if (unit.repathTimer === undefined) {
            unit.repathTimer = 0;
        }

        if (unit.policeChaseTimerState === undefined) {
            unit.policeChaseTimerState = "CHASING";
            unit.policeStopTimer = 0;
            unit.policeStartTimer = 0;
            unit.policeCoastAngle = unit.angle - Math.PI / 2;
            unit.policeCoastSpeed = 3.2;
        }
    }

    if (isCar && (unit.health <= 0 || unit.exploded)) {
        unit.speed = 0;

        if (typeof unit.stopSiren === 'function') {
            unit.stopSiren();
        } else {
            unit.sirenState = 0;
        }
        unit.policeState = "PATROL";
        unit.isParked = true;
        return;
    }

    if (isCar) {
        unit.isParked = false;
        if (typeof unit.playSiren === 'function') {
            unit.playSiren(2);
        } else {
            unit.sirenState = 2;
        }
    }

    if (!isCar && playerCar) {
        const playerCarSpeed = Math.abs(playerCar.speed);
        if (playerCarSpeed > POLICE_OFFICER_MIN_CAR_SPEED) {
            unit.speed = 0;
            const dx = playerCar.x - unit.x;
            const dy = playerCar.y - unit.y;
            const carDistance = Math.hypot(dx, dy);

            if (carDistance > 0) {
                unit.angle = Math.atan2(dy, dx) + Math.PI / 2;
            }

            if (unit.policeFireCooldown === undefined) unit.policeFireCooldown = 0;
            unit.policeFireCooldown -= dt;

            if (carDistance <= POLICE_OFFICER_SHOOT_RANGE && unit.policeFireCooldown <= 0) {
                fireOfficerBullet(unit, playerCar);
                unit.policeFireCooldown = POLICE_OFFICER_FIRE_COOLDOWN;
            }
            return;
        }
    }

 if (isCar) {
        const playerIsMoving = Math.abs(player.speed || 0) > 0.05;
        const policeCarIsNearPlayer = isPlayerNearPoliceUnit(120, unit);

        if (!playerIsMoving && policeCarIsNearPlayer) {

            if (unit.policeChaseTimerState === "CHASING") {
                unit.policeChaseTimerState = "STOPPING";
                unit.policeStopTimer = 0.6 * 60;
                unit.policeCoastAngle = unit.angle - Math.PI / 2;
                unit.policeCoastSpeed =
                    Math.abs(unit.speed) > 0.05
                        ? Math.abs(unit.speed)
                        : 3.2;
            }

            if (unit.policeChaseTimerState === "STARTING") {
                unit.policeChaseTimerState = "STARTING_PAUSED";
                unit.speed = 0;
                return;
            }

            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.speed = 0;
                return;
            }

            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer -= dt;

                const coastSpeed = unit.policeCoastSpeed;
                const coastAngle = unit.policeCoastAngle;
                // Don't let fake inertia force the car into an obstacle.
                const coastAvoidance = getPoliceObstacleAvoidance(
                    unit,
                    coastAngle,
                    cars
                );

                if (coastAvoidance.blocked) {
                    // Cancel the fixed-angle coast and resume normal
                    // pursuit steering immediately.
                    unit.policeStopTimer = 0;
                    unit.policeChaseTimerState = "CHASING";
                } else {

                unit.speed = coastSpeed;
                unit.angle = coastAngle + Math.PI / 2;

                const nextX = unit.x + Math.cos(coastAngle) * coastSpeed * dt;
                const nextY = unit.y + Math.sin(coastAngle) * coastSpeed * dt;

                if (isGrassOrRoad(nextX, nextY)) {
                    unit.x = nextX;
                    unit.y = nextY;
                } else {
                    const xWalkable = isGrassOrRoad(nextX, unit.y);
                    const yWalkable = isGrassOrRoad(unit.x, nextY);

                    if (xWalkable && yWalkable) {
                        unit.x = nextX;
                        unit.y = nextY;
                    } else if (xWalkable) {
                        unit.x = nextX;
                    } else if (yWalkable) {
                        unit.y = nextY;
                    }
                }

                if (unit.policeStopTimer <= 0) {
                    unit.policeStopTimer = 0;
                    unit.speed = 0;
                    unit.policeChaseTimerState = "STOPPED";
                }

                }        return;
            }

            if (unit.policeChaseTimerState === "STOPPED") {
                unit.speed = 0;
                return;
            }
        } else {
            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer = 0;
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }

            if (unit.policeChaseTimerState === "STOPPED") {
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }

            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.policeChaseTimerState = "STARTING";
            }

            if (unit.policeChaseTimerState === "STARTING") {
                unit.speed = 0;
                unit.policeStartTimer -= dt;

                if (unit.policeStartTimer > 0) {
                    return;
                }

                unit.policeStartTimer = 0;
                unit.policeChaseTimerState = "CHASING";
            }
        }
    }

    const chaseTarget =
        playerCar && !playerCar.exploded
            ? playerCar
            : player;

    const chaseDistance = Math.hypot(
        chaseTarget.x - unit.x,
        chaseTarget.y - unit.y
    );

    if (chaseDistance > 35) {
        if (unit.repathTimer === undefined) {
            unit.repathTimer = 0;
        }

        unit.repathTimer -= dt;

        if (
            unit.repathTimer <= 0 ||
            !unit.policePath ||
            unit.policePath.length === 0
        ) {
            unit.policePath = navigationSystem.findPath(
                unit.x,
                unit.y,
                chaseTarget.x,
                chaseTarget.y
            );

            unit.repathTimer = 0.33;
        }
    }

    const path = unit.policePath;
    let moveAngle = unit.angle;

    if (path && path.length > 1) {
        const nextWaypoint = path[1];
        moveAngle = Math.atan2(nextWaypoint.y - unit.y, nextWaypoint.x - unit.x);
    } else {
        moveAngle = Math.atan2(
            chaseTarget.y - unit.y,
            chaseTarget.x - unit.x
        ); 
    }

 let avoidX = 0;
    let avoidY = 0;
    const avoidanceRadius = isCar ? 55 : 42;

    cars.forEach(otherCar => {
        if (otherCar !== unit && otherCar !== playerCar && otherCar.isPolice) {
            const dx = otherCar.x - unit.x;
            const dy = otherCar.y - unit.y;
            const d = Math.hypot(dx, dy);

            if (d < avoidanceRadius && d > 0.01) {
                const strength = (avoidanceRadius - d) / avoidanceRadius;
                avoidX -= (dx / d) * strength;
                avoidY -= (dy / d) * strength;
            }
        }
    });

    npcs.forEach(npc => {
        if (npc !== unit && npc.isPolice) {
            const dx = npc.x - unit.x;
            const dy = npc.y - unit.y;
            const d = Math.hypot(dx, dy);

            if (d < avoidanceRadius && d > 0.01) {
                const strength = (avoidanceRadius - d) / avoidanceRadius;
                avoidX -= (dx / d) * strength;
                avoidY -= (dy / d) * strength;
            }
        }
    });

    if (avoidX !== 0 || avoidY !== 0) {
        const avoidAngle = Math.atan2(avoidY, avoidX);
        const separationStrength = Math.min(0.35, Math.hypot(avoidX, avoidY) * 0.35);

        const chaseX = Math.cos(moveAngle);
        const chaseY = Math.sin(moveAngle);
        const avoidDirX = Math.cos(avoidAngle);
        const avoidDirY = Math.sin(avoidAngle);

        const finalX = chaseX * (1 - separationStrength) + avoidDirX * separationStrength;
        const finalY = chaseY * (1 - separationStrength) + avoidDirY * separationStrength;

        if (Math.hypot(finalX, finalY) > 0.001) {
            moveAngle = Math.atan2(finalY, finalX);
        }
    }

    // Pass unit to local avoidance check and stop unit if blocked
    const localAvoidance = getPoliceObstacleAvoidance(
        unit,
        moveAngle,
        cars
    );

    // Use the escape angle returned by obstacle avoidance.
    // Don't freeze directly in front of an obstruction.
    moveAngle = localAvoidance.angle;
    smoothlyTurnAIMovement(unit, moveAngle, dt, isCar);

    if (isCar) {
        const policeChaseSpeed = 3.2;
        unit.speed = policeChaseSpeed;
        const nextX = unit.x + Math.cos(moveAngle) * policeChaseSpeed * dt;
        const nextY = unit.y + Math.sin(moveAngle) * policeChaseSpeed * dt; 

        if (isGrassOrRoad(nextX, nextY)) {
            unit.x = nextX;
            unit.y = nextY;
        } else {
            const xWalkable = isGrassOrRoad(nextX, unit.y);
            const yWalkable = isGrassOrRoad(unit.x, nextY);
            if (xWalkable && yWalkable) {
                const xDist = Math.hypot(player.x - nextX, player.y - unit.y);
                const yDist = Math.hypot(player.x - unit.x, player.y - nextY);
                if (xDist <= yDist) unit.x = nextX;
                else unit.y = nextY;
            } else if (xWalkable) unit.x = nextX;
            else if (yWalkable) unit.y = nextY;
        }
    } else {
        const chaseSpeed = 1.6;
        const oldX = unit.x;
        const oldY = unit.y;
        const nextX = unit.x + Math.cos(moveAngle) * chaseSpeed * dt;
        const nextY = unit.y + Math.sin(moveAngle) * chaseSpeed * dt;

        if (isGrassOrRoad(nextX, nextY)) {
            unit.x = nextX;
            unit.y = nextY;
        } else {
            const xWalkable = isGrassOrRoad(nextX, unit.y);
            const yWalkable = isGrassOrRoad(unit.x, nextY);
            if (xWalkable && yWalkable) {
                const xDist = Math.hypot(player.x - nextX, player.y - unit.y);
                const yDist = Math.hypot(player.x - unit.x, player.y - nextY);
                if (xDist <= yDist) unit.x = nextX;
                else unit.y = nextY;
            } else if (xWalkable) unit.x = nextX;
            else if (yWalkable) unit.y = nextY;
        }

        const movedDistance = Math.hypot(unit.x - oldX, unit.y - oldY);
        if (movedDistance > 0.001) {
            unit.walkTimer = (unit.walkTimer || 0) + chaseSpeed * dt * 0.12;
            unit.speed = chaseSpeed;
        } else {
            unit.speed = 0;
        }
    }
}

// --- STAGE 4A: REVISED POLICE RECOGNITION, WARNING, ARREST & CHASE SYSTEM ---
function updatePoliceStage4A(dt, player, cars, npcs) {
    if (!player) return;
    if (player.beingChased === undefined) player.beingChased = false;

    cars.forEach(c => {
        if (
            c &&
            c.isPolice &&
            (c.health <= 0 || c.exploded) &&
            (c.policeState === "WARNING" || c.policeState === "CHASE" || c.policeState === "ARRESTING")
        ) {
            c.speed = 0;
            c.isParked = true;
            c.policeState = "PATROL";

            if (typeof c.stopSiren === 'function') {
                c.stopSiren();
            } else {
                c.sirenState = 0;
            }

            c.warningTimer = 0;
            c.graceTimer = 0;
            c.arrestStage = 0;
            c.arrestTimer = 0;
        }
    });

    updateSurrenderButtonVisibility();

    if (player.isBeingArrested) {
        updateArrestTransport(dt);
        return;
    }

    // Add session-only points for surviving an active chase.
    if (player.beingChased) {
        chaseScoreTimer += Math.max(0, dt || 0);

        // dt is measured in approximately 1/60-second frame units.
        while (chaseScoreTimer >= 60) {
            chaseScoreTimer -= 60;

            chaseWantedScore = Math.min(
                100,
                chaseWantedScore + 0.25
            );

            refreshWantedScore();
        }
    }
    // --- POLICE CHASE ESCAPE ---
    if (player.beingChased) {
        const POLICE_ESCAPE_DISTANCE = 450;

        const nearbyChasingCar = cars.some(c =>
            c &&
            c.isPolice &&
            c !== playerCar &&
            !c.exploded &&
            c.health > 0 &&
            c.policeState === "CHASE" &&
            Math.hypot(player.x - c.x, player.y - c.y) <= POLICE_ESCAPE_DISTANCE
        );

        const nearbyChasingOfficer = npcs.some(n =>
            n &&
            n.isPolice &&
            n.policeState === "CHASE" &&
            Math.hypot(player.x - n.x, player.y - n.y) <= POLICE_ESCAPE_DISTANCE
        );

        if (!nearbyChasingCar && !nearbyChasingOfficer) {
    // Successful escape bonus; not saved to localStorage.
    chaseWantedScore = Math.min(
        100,
        chaseWantedScore + 5
    );

    refreshWantedScore();

    player.beingChased = false;
            player.wanted = true;

            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                taxiManager.setMessage("You escaped! they are searching for you", 240);
            }

            cars.forEach(c => {
                if (c && c.isPolice && c.policeState === "CHASE") {
                    if (typeof c.stopSiren === 'function') {
                        c.stopSiren();
                    } else {
                        c.sirenState = 0;
                    }

                    c.policeState = "PATROL";
                    c.isParked = false;
                    c.warningTimer = 0;
                    c.graceTimer = 0;
                    c.arrestStage = 0;
                    c.arrestTimer = 0;
                }
            });

            npcs.forEach(n => {
                if (n && n.isPolice && n.policeState === "CHASE") {
                    n.policeState = "PATROL";
                    n.speed = 0.3 + Math.random() * 0.4;
                }
            });

            if (surrenderBtn) {
                surrenderBtn.style.display = 'none';
            }

            return;
        }
    }

    // 1. CLEAR ALL POLICE UNITS WHEN NOT WANTED
    if (!player.wanted && !player.beingChased) {
        cars.forEach(c => {
            if (
                c.isPolice &&
                c.policeState &&
                c.policeState !== "PATROL" &&
                c.policeState !== "ASSAULT_RESPONSE" &&
                c.policeState !== "ASSAULT_RESPONSE_PARKED"
            ) {
                if (typeof c.stopSiren === 'function') c.stopSiren();
                else c.sirenState = 0;
                c.isParked = false;
                c.policeState = "PATROL";
                c.warningTimer = 0;
                c.graceTimer = 0;
                c.arrestStage = 0;
                c.arrestTimer = 0;
                c.saidStepOut = false;
                c.saidArrested = false;
            }
        });

        npcs.forEach(n => {
            if (
                n.isPolice &&
                n.policeState &&
                n.policeState !== "PATROL" &&
                n.policeState !== "ASSAULT_WITNESS"
            ) {    
                n.speed = 0.3 + Math.random() * 0.4;
                n.policeState = "PATROL";
                n.saidStepOut = false;
                n.saidArrested = false;
            }
        });

        player.beingChased = false;
        isPlayerSurrendered = false;

        if (surrenderBtn) surrenderBtn.style.display = 'none';
        return;
    }

    // Find any police unit currently in WARNING or ARRESTING mode
    let warningOrArrestingUnit = cars.find(c => c.isPolice && c !== playerCar && c.hasDriver && (c.policeState === "WARNING" || c.policeState === "ARRESTING")) ||
                                 npcs.find(n => n.isPolice && (n.policeState === "WARNING" || n.policeState === "ARRESTING"));

    // 2. DETECT WANTED PLAYER (Spotting unit)
    if (player.wanted && !player.beingChased && !warningOrArrestingUnit) {
        let closestUnit = null;
        let minDistance = 110;

        cars.forEach(c => {
            if (
                c.isPolice &&
                c !== playerCar &&
                c.hasDriver &&
                !c.isStolen &&
                !c.exploded &&
                c.health > 0 &&
                (!c.policeState || c.policeState === "PATROL")
            ) {
                let dist = Math.hypot(player.x - c.x, player.y - c.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestUnit = c;
                }
            }
        });

        npcs.forEach(npc => {
            if (
                npc.isPolice &&
                !npc.isInjured &&
                (!npc.policeState || npc.policeState === "PATROL")
            ) {
                let dist = Math.hypot(player.x - npc.x, player.y - npc.y);    
                if (dist < minDistance) {
                    minDistance = dist;
                    closestUnit = npc;
                }
            }
        });

        if (closestUnit) {
            warningOrArrestingUnit = closestUnit;
            warningOrArrestingUnit.policeState = "WARNING";
            warningOrArrestingUnit.warningTimer = 480;
            warningOrArrestingUnit.saidStepOut = false;
            warningOrArrestingUnit.saidArrested = false;

            if (warningOrArrestingUnit.length !== undefined) {
                warningOrArrestingUnit.speed = 0;
                warningOrArrestingUnit.isParked = true;
                if (typeof warningOrArrestingUnit.playSiren === 'function') warningOrArrestingUnit.playSiren(1);
                else warningOrArrestingUnit.sirenState = 1;
            } else {
                warningOrArrestingUnit.speed = 0;
            }

            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                taxiManager.setMessage("Police wants to stop you!", 180);
            }
        }
    }

    // 3. WARNING & ARREST SEQUENCE
    if (warningOrArrestingUnit) {
        const isCar = warningOrArrestingUnit.length !== undefined;
        let officerNPC = !isCar ? warningOrArrestingUnit : (
            warningOrArrestingUnit.associatedOfficer ||
            npcs.find(n => n.isPolice && Math.hypot(n.x - warningOrArrestingUnit.x, n.y - warningOrArrestingUnit.y) < 200)
        );

        if (warningOrArrestingUnit.policeState === "WARNING") {
            updateSurrenderButtonVisibility();
            warningOrArrestingUnit.warningTimer -= dt;
            warningOrArrestingUnit.speed = 0;

            if (!warningOrArrestingUnit.graceTimer) warningOrArrestingUnit.graceTimer = 60;
            if (warningOrArrestingUnit.graceTimer > 0) warningOrArrestingUnit.graceTimer -= dt;

            if (officerNPC && typeof officerNPC.say === 'function') {
                if (playerCar) {
                    if (!warningOrArrestingUnit.saidStepOut) {
                        officerNPC.say("Step out!", 140);
                        warningOrArrestingUnit.saidStepOut = true;
                    } else if (warningOrArrestingUnit.warningTimer <= 340 && !warningOrArrestingUnit.saidArrested) {
                        officerNPC.say("You are arrested!", 180);
                        warningOrArrestingUnit.saidArrested = true;
                    }
                } else if (!warningOrArrestingUnit.saidArrested) {
                    officerNPC.say("You are arrested!", 180);
                    warningOrArrestingUnit.saidArrested = true;
                }
            }

            if (isPlayerSurrendered) {
                isPlayerSurrendered = false;
                warningOrArrestingUnit.policeState = "ARRESTING";
                warningOrArrestingUnit.arrestStage = 0;
                warningOrArrestingUnit.arrestTimer = 30;
                if (surrenderBtn) surrenderBtn.style.display = 'none';
            } else if (warningOrArrestingUnit.graceTimer <= 0 &&
                (Math.hypot(player.x - warningOrArrestingUnit.x, player.y - warningOrArrestingUnit.y) > 250 ||
                 (playerCar ? Math.abs(playerCar.speed) : Math.abs(player.speed || 0)) > 2.5 ||
                 warningOrArrestingUnit.warningTimer <= 0)) {

                player.beingChased = true;

                // Roadblock officers report the chase but stay parked at the block.
                if (warningOrArrestingUnit.isRoadblockUnit) {
                    warningOrArrestingUnit.policeState = "PATROL";
                    warningOrArrestingUnit.speed = 0;
                    warningOrArrestingUnit.isParked = true;
                    if (typeof warningOrArrestingUnit.stopSiren === "function") {
                        warningOrArrestingUnit.stopSiren();
                    } else {
                        warningOrArrestingUnit.sirenState = 0;
                    }
                } else {
                    warningOrArrestingUnit.policeState = "CHASE";
                }

                if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    taxiManager.setMessage("You are being chased!", 180);
                }
            }
        } else if (warningOrArrestingUnit.policeState === "ARRESTING") {
            if (surrenderBtn) {
                surrenderBtn.style.display = 'none';
            }

            warningOrArrestingUnit.speed = 0;
            return;
        }                
    }

    // 4. JOIN CHASE MECHANIC FOR NEARBY UNITS
    if (player.beingChased) {
        updateSurrenderButtonVisibility();
        let activeChasingCars = cars.filter(c => c.isPolice && c.policeState === "CHASE").length;
        let activeChasingOfficers = npcs.filter(n => n.isPolice && n.policeState === "CHASE").length;

        if (activeChasingCars < 3) {
            cars.forEach(c => {
                if (
                    activeChasingCars < 3 &&
                    c.isPolice &&
                    c !== playerCar &&
                    c.hasDriver &&
                    !c.isStolen &&
                    !c.exploded &&
                    c.health > 0 &&
                    !c.isRoadblockUnit &&
                    (!c.policeState || c.policeState === "PATROL")
                ) {
                    if (Math.hypot(player.x - c.x, player.y - c.y) <= 240) {
                        c.policeState = "CHASE";
                        c.isParked = false;
                        activeChasingCars++;
                        if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                            taxiManager.setMessage("A police car joined the chase!", 180);
                        }
                    }
                }
            });
        }

        if (activeChasingOfficers < 2) {
            npcs.forEach(n => {
                if (
                    activeChasingOfficers < 2 &&
                    n.isPolice &&
                    !n.isInjured &&
                    (!n.policeState || n.policeState === "PATROL")
                ) {  
                    if (Math.hypot(player.x - n.x, player.y - n.y) <= 240) {
                        n.policeState = "CHASE";
                        activeChasingOfficers++;
                        if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                            taxiManager.setMessage("A police unit joined the chase!", 180);
                        }
                    }
                }
            });
        }

        // 5. UPDATE MOVEMENT & BEHAVIOR FOR ALL ACTIVE CHASING UNITS
        cars.forEach(c => {
            if (c.isPolice && c.policeState === "CHASE") {
                updateSinglePoliceChase(c, dt, player, cars, npcs);
            }
        });

        npcs.forEach(n => {
            if (n.isPolice && n.policeState === "CHASE") {
                updateSinglePoliceChase(n, dt, player, cars, npcs);
            }
        });
    }
}
// ============================================================
// POLICE ROADBLOCK SYSTEM (StreetBound)
// Include / load after police.js (wanted score + police AI).
// ============================================================
// Activates cumulatively with wanted score. Parked police cars
// + physical barricades. Geometry is detected from the collision
// map; placement is deferred until the player is far enough away.
// ============================================================

const ROADBLOCK_SAFE_DISTANCE = 550;
const ROADBLOCK_MIN_ROAD_WIDTH = 28;
const ROADBLOCK_MAX_SEARCH = 90;
const ROADBLOCK_THRESHOLDS = [23, 35, 45, 55, 65];

const ROADBLOCK_CANDIDATES = [
    { id: "A", x: 3193, y: 1208 },
    { id: "B", x: 2792, y: 1802 },
    { id: "C", x: 843,  y: 1272 },
    { id: "D", x: 2469, y: 484  },
    { id: "E", x: 2537, y: 1246 }
];

const roadblockLocations = {};

const roadblockState = {
    activeIds: [],
    pendingIds: [],
    selectedOrder: [],
    selectionSeeded: false,
    barricades: [],
    cars: [],
    nextBarricadeId: 1,
    nextCarIdBase: 810000
};

function roadblockResetSelection() {
    roadblockState.activeIds = [];
    roadblockState.pendingIds = [];
    roadblockState.selectedOrder = [];
    roadblockState.selectionSeeded = false;
    for (const id of Object.keys(roadblockLocations)) {
        const loc = roadblockLocations[id];
        loc.active = false;
        loc.pending = false;
        loc.spawned = false;
        loc.geometry = null;
        loc.invalid = loc.invalid || false;
    }
}

function roadblockInitLocations() {
    for (const c of ROADBLOCK_CANDIDATES) {
        if (!roadblockLocations[c.id]) {
            roadblockLocations[c.id] = {
                id: c.id,
                x: c.x,
                y: c.y,
                active: false,
                pending: false,
                spawned: false,
                geometry: null,
                invalid: false,
                invalidReason: null
            };
        }
    }
}

function roadblockIsRoadSurface(x, y) {
    if (
        !collisionData ||
        typeof mapWidth !== "number" ||
        typeof mapHeight !== "number" ||
        mapWidth <= 0 ||
        mapHeight <= 0
    ) {
        return false;
    }

    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= mapWidth || py >= mapHeight) {
        return false;
    }

    const index = (py * mapWidth + px) * 4;
    const terrain = getTerrainType(
        collisionData[index],
        collisionData[index + 1],
        collisionData[index + 2]
    );

    // Road edges and antialiased asphalt are classified as TRANSITION by the
    // map parser. Excluding them reduces the apparent road to isolated pixels.
    return terrain === "ROAD" || terrain === "TRANSITION";
}

function roadblockSampleRoadPoint(cx, cy, radius) {
    const isCoreRoad = typeof isRoadColor === "function"
        ? isRoadColor
        : roadblockIsRoadSurface;

    if (isCoreRoad(cx, cy)) {
        return { x: cx, y: cy };
    }

    let best = null;
    let bestDist = Infinity;
    const step = 6;

    for (let r = step; r <= radius; r += step) {
        const samples = Math.max(8, Math.floor((Math.PI * 2 * r) / step));
        for (let i = 0; i < samples; i++) {
            const a = (i / samples) * Math.PI * 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (isCoreRoad(x, y)) {
                const d = Math.hypot(x - cx, y - cy);
                if (d < bestDist) {
                    bestDist = d;
                    best = { x, y };
                }
            }
        }
        if (best && bestDist <= r) break;
    }
    return best;
}

function roadblockMeasureWidth(px, py, nx, ny) {
    let left = 0;
    let right = 0;
    const max = 80;
    for (let d = 2; d <= max; d += 2) {
        if (roadblockIsRoadSurface(px - nx * d, py - ny * d)) {
            left = d;
        } else break;
    }
    for (let d = 2; d <= max; d += 2) {
        if (roadblockIsRoadSurface(px + nx * d, py + ny * d)) {
            right = d;
        } else break;
    }
    return { left, right, width: left + right };
}

function roadblockEstimateDirection(px, py) {
    const R = 36;
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0, n = 0;
    const step = 4;

    for (let dy = -R; dy <= R; dy += step) {
        for (let dx = -R; dx <= R; dx += step) {
            if (dx * dx + dy * dy > R * R) continue;
            if (roadblockIsRoadSurface(px + dx, py + dy)) {
                sumX += dx;
                sumY += dy;
                sumXX += dx * dx;
                sumYY += dy * dy;
                sumXY += dx * dy;
                n++;
            }
        }
    }

    if (n < 8) return null;

    const meanX = sumX / n;
    const meanY = sumY / n;
    const covXX = sumXX / n - meanX * meanX;
    const covYY = sumYY / n - meanY * meanY;
    const covXY = sumXY / n - meanX * meanY;

    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    const eig = trace / 2 + disc;

    let vx, vy;
    if (Math.abs(covXY) > 1e-6) {
        vx = eig - covYY;
        vy = covXY;
    } else if (covXX >= covYY) {
        vx = 1;
        vy = 0;
    } else {
        vx = 0;
        vy = 1;
    }

    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;

    return { tx: vx, ty: vy, nx: -vy, ny: vx };
}

function roadblockAnalyzeGeometry(loc) {
    if (loc.geometry) return loc.geometry;
    if (loc.invalid) return null;

    if (
        typeof collisionData === "undefined" ||
        !collisionData ||
        typeof mapWidth === "undefined" ||
        mapWidth <= 0
    ) {
        return null;
    }

    const center = roadblockSampleRoadPoint(loc.x, loc.y, ROADBLOCK_MAX_SEARCH);
    if (!center) {
        loc.invalid = true;
        loc.invalidReason = "no road near candidate";
        console.log("[ROADBLOCK] Rejected " + loc.id + ": " + loc.invalidReason);
        return null;
    }

    const dir = roadblockEstimateDirection(center.x, center.y);
    if (!dir) {
        loc.invalid = true;
        loc.invalidReason = "could not estimate road direction";
        console.log("[ROADBLOCK] Rejected " + loc.id + ": " + loc.invalidReason);
        return null;
    }

    const measure = roadblockMeasureWidth(center.x, center.y, dir.nx, dir.ny);
    if (measure.width < ROADBLOCK_MIN_ROAD_WIDTH) {
        loc.invalid = true;
        loc.invalidReason = "road too narrow (" + measure.width.toFixed(0) + "px)";
        console.log("[ROADBLOCK] Rejected " + loc.id + ": " + loc.invalidReason);
        return null;
    }

    const midOffset = (measure.right - measure.left) * 0.5;
    const cx = center.x + dir.nx * midOffset;
    const cy = center.y + dir.ny * midOffset;

    if (!roadblockIsRoadSurface(cx, cy)) {
        loc.invalid = true;
        loc.invalidReason = "centerline not on road";
        console.log("[ROADBLOCK] Rejected " + loc.id + ": " + loc.invalidReason);
        return null;
    }

    loc.geometry = {
        cx,
        cy,
        tx: dir.tx,
        ty: dir.ty,
        nx: dir.nx,
        ny: dir.ny,
        halfWidth: measure.width * 0.5,
        width: measure.width
    };
    return loc.geometry;
}

function roadblockCreateBarricade(x, y, angle, length, thickness) {
    return {
        id: roadblockState.nextBarricadeId++,
        x,
        y,
        angle,
        length: length || 22,
        thickness: thickness || 10,
        intact: true,
        locationId: null
    };
}

function roadblockPointInBarricade(px, py, b) {
    if (!b || !b.intact) return false;
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const dx = px - b.x;
    const dy = py - b.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    return (
        Math.abs(localX) <= b.length * 0.5 + 2 &&
        Math.abs(localY) <= b.thickness * 0.5 + 2
    );
}

function roadblockBlocksPoint(px, py) {
    for (let i = 0; i < roadblockState.barricades.length; i++) {
        const b = roadblockState.barricades[i];
        if (b.intact && roadblockPointInBarricade(px, py, b)) {
            return true;
        }
    }
    return false;
}

function roadblockCircleHitsBarricade(cx, cy, radius, b) {
    if (!b || !b.intact) return false;
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const dx = cx - b.x;
    const dy = cy - b.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    const closestX = Math.max(-b.length * 0.5, Math.min(b.length * 0.5, localX));
    const closestY = Math.max(-b.thickness * 0.5, Math.min(b.thickness * 0.5, localY));
    const ex = localX - closestX;
    const ey = localY - closestY;
    return ex * ex + ey * ey <= radius * radius;
}

function roadblockDestroyBarricade(b) {
    if (!b || !b.intact) return;
    b.intact = false;

    if (typeof spawnExplosionDebris === "function") {
        spawnExplosionDebris(b.x, b.y, 8);
    }
    if (typeof playSpatialSound === "function" && typeof carCrashPool !== "undefined") {
        playSpatialSound(carCrashPool, b.x, b.y, 0.55, 350);
    }
}

function roadblockCanVehicleBreak(car) {
    if (!car || car.exploded || car.health <= 0) return false;
    if (typeof playerCar !== "undefined" && playerCar && car === playerCar) return true;
    if (car.isRaceOpponent) return true;
    if (car.isPolice && car.policeState === "CHASE") return true;
    return false;
}

function roadblockHandleVehicleCollision(car) {
    if (!car || car.exploded || car.health <= 0) return;
    if (car.isRoadblockUnit) return;

    const radius = Math.max(car.width || 16, car.length || 28) * 0.35;

    for (let i = 0; i < roadblockState.barricades.length; i++) {
        const b = roadblockState.barricades[i];
        if (!b.intact) continue;
        if (!roadblockCircleHitsBarricade(car.x, car.y, radius, b)) continue;

        if (roadblockCanVehicleBreak(car)) {
            roadblockDestroyBarricade(b);
        } else {
            const dx = car.x - b.x;
            const dy = car.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            car.x += (dx / d) * 2;
            car.y += (dy / d) * 2;
            car.speed = Math.min(car.speed, 0.4);
        }
    }
}

function roadblockSpawnAt(loc) {
    const geo = roadblockAnalyzeGeometry(loc);
    if (!geo) return false;

    if (typeof Car !== "function" || typeof cars === "undefined") {
        return false;
    }

    const roadHeading = Math.atan2(geo.ty, geo.tx);
    const carAngle = roadHeading + Math.PI / 2;
    const barricadeAngle = Math.atan2(geo.ny, geo.nx);

    const halfW = geo.halfWidth;
    const segmentLen = 20;
    const count = Math.max(1, Math.min(3, Math.ceil((halfW * 2) / (segmentLen + 4))));
    const totalSpan = count * segmentLen + (count - 1) * 4;
    const startOffset = -totalSpan * 0.5 + segmentLen * 0.5;

    for (let i = 0; i < count; i++) {
        const along = startOffset + i * (segmentLen + 4);
        const bx = geo.cx + geo.nx * along;
        const by = geo.cy + geo.ny * along;

        if (!roadblockIsRoadSurface(bx, by)) {
            continue;
        }

        const b = roadblockCreateBarricade(bx, by, barricadeAngle, segmentLen, 10);
        b.locationId = loc.id;
        roadblockState.barricades.push(b);
    }

    const carCount = halfW > 40 ? 2 : 1;
    const carBack = 28;

    for (let i = 0; i < carCount; i++) {
        const side = carCount === 1 ? 0 : (i === 0 ? -0.35 : 0.35);
        let cx = geo.cx - geo.tx * carBack + geo.nx * halfW * side;
        let cy = geo.cy - geo.ty * carBack + geo.ny * halfW * side;

        if (typeof isAICarWalkable === "function" && !isAICarWalkable(cx, cy)) {
            cx = geo.cx - geo.tx * carBack;
            cy = geo.cy - geo.ty * carBack;
            if (typeof isAICarWalkable === "function" && !isAICarWalkable(cx, cy)) {
                continue;
            }
        }

        const id =
            Date.now() +
            roadblockState.nextCarIdBase +
            Math.floor(Math.random() * 900) +
            i;

        const policeCar = new Car(id, cx, cy, "#111111", true);
        policeCar.isPolice = true;
        policeCar.ownerType = "police";
        policeCar.type = "Commuter, Sedan";
        policeCar.width = 16;
        policeCar.length = 28;
        policeCar.baseSpeed = 3.2;
        policeCar.speed = 0;
        policeCar.isParked = true;
        policeCar.hasDriver = true;
        policeCar.angle = carAngle;
        policeCar.policeState = "PATROL";
        policeCar.isRoadblockUnit = true;
        policeCar.roadblockLocationId = loc.id;
        policeCar.updateAI = function () {};

        if (typeof policeCar.setSirenState === "function") {
            policeCar.setSirenState(0);
        } else {
            policeCar.sirenState = 0;
        }

        cars.push(policeCar);
        roadblockState.cars.push(policeCar);
    }

    loc.spawned = true;
    loc.active = true;
    loc.pending = false;

    console.log(
        "[ROADBLOCK] Activated " +
            loc.id +
            " at (" +
            geo.cx.toFixed(0) +
            "," +
            geo.cy.toFixed(0) +
            ") width=" +
            geo.width.toFixed(0)
    );
    return true;
}

function roadblockPlayerDistanceTo(loc) {
    if (typeof player === "undefined" || !player) return Infinity;
    const geo = loc.geometry;
    const x = geo ? geo.cx : loc.x;
    const y = geo ? geo.cy : loc.y;
    return Math.hypot(player.x - x, player.y - y);
}

function roadblockDesiredCount() {
    if (typeof wantedScore === "undefined") return 0;
    const score = wantedScore;
    let count = 0;
    for (let i = 0; i < ROADBLOCK_THRESHOLDS.length; i++) {
        if (score >= ROADBLOCK_THRESHOLDS[i]) count = i + 1;
    }
    return count;
}

function roadblockEnsureSelection() {
    if (roadblockState.selectionSeeded) return;

    roadblockInitLocations();

    const ids = ROADBLOCK_CANDIDATES.map(c => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = ids[i];
        ids[i] = ids[j];
        ids[j] = t;
    }

    const valid = [];
    for (const id of ids) {
        const loc = roadblockLocations[id];
        if (roadblockAnalyzeGeometry(loc)) {
            valid.push(id);
        }
    }

    roadblockState.selectedOrder = valid;
    roadblockState.selectionSeeded = true;
}

function roadblockTryActivatePending() {
    if (!roadblockState.pendingIds.length) return;

    const stillPending = [];
    for (const id of roadblockState.pendingIds) {
        const loc = roadblockLocations[id];
        if (!loc || loc.spawned || loc.invalid) continue;

        if (roadblockPlayerDistanceTo(loc) < ROADBLOCK_SAFE_DISTANCE) {
            stillPending.push(id);
            continue;
        }

        if (roadblockPlayerDistanceTo(loc) >= ROADBLOCK_SAFE_DISTANCE) {
            const ok = roadblockSpawnAt(loc);
            if (ok) {
                if (roadblockState.activeIds.indexOf(id) < 0) {
                    roadblockState.activeIds.push(id);
                }
            } else if (!loc.invalid) {
                stillPending.push(id);
            }
        } else {
            stillPending.push(id);
        }
    }
    roadblockState.pendingIds = stillPending;
}

function roadblockSyncToWantedScore() {
    if (
        typeof player === "undefined" ||
        !player ||
        (!player.wanted && !player.beingChased)
    ) {
        return;
    }

    if (player.isBeingArrested || player.isArrestPassenger) {
        return;
    }

    const desired = roadblockDesiredCount();
    if (desired <= 0) return;

    roadblockEnsureSelection();

    const currentlyTracked =
        roadblockState.activeIds.length + roadblockState.pendingIds.length;

    if (currentlyTracked >= desired) {
        roadblockTryActivatePending();
        return;
    }

    for (const id of roadblockState.selectedOrder) {
        if (roadblockState.activeIds.length + roadblockState.pendingIds.length >= desired) {
            break;
        }
        if (roadblockState.activeIds.indexOf(id) >= 0) continue;
        if (roadblockState.pendingIds.indexOf(id) >= 0) continue;

        const loc = roadblockLocations[id];
        if (!loc || loc.invalid || loc.spawned) continue;

        if (!roadblockAnalyzeGeometry(loc)) continue;

        loc.pending = true;
        roadblockState.pendingIds.push(id);
    }

    roadblockTryActivatePending();
}

function clearRoadblocks() {
    roadblockState.barricades = [];

    if (typeof cars !== "undefined" && Array.isArray(cars)) {
        for (const car of roadblockState.cars) {
            if (!car) continue;
            if (car.humAudio) {
                car.humAudio.pause();
                car.humAudio = null;
            }
            if (typeof car.stopSiren === "function") {
                car.stopSiren();
            } else {
                car.sirenState = 0;
            }
            const idx = cars.indexOf(car);
            if (idx >= 0) cars.splice(idx, 1);
        }
    }
    roadblockState.cars = [];

    roadblockResetSelection();
}

function updateRoadblocks(dt) {
    roadblockInitLocations();

    if (
        typeof player !== "undefined" &&
        player &&
        !player.wanted &&
        !player.beingChased &&
        !player.isBeingArrested
    ) {
        if (
            roadblockState.activeIds.length > 0 ||
            roadblockState.pendingIds.length > 0 ||
            roadblockState.barricades.length > 0 ||
            roadblockState.cars.length > 0
        ) {
            clearRoadblocks();
        }
        return;
    }

    roadblockSyncToWantedScore();

    for (const car of roadblockState.cars) {
        if (!car) continue;
        if (car.health <= 0 || car.exploded) continue;
        car.speed = 0;
        car.isParked = true;
        car.hasDriver = true;
        if (
            car.policeState !== "WARNING" &&
            car.policeState !== "ARRESTING" &&
            car.policeState !== "CHASE"
        ) {
            car.policeState = "PATROL";
        }
        if (car.policeState === "CHASE" && car.isRoadblockUnit) {
            car.policeState = "PATROL";
            car.speed = 0;
            car.isParked = true;
            if (typeof car.stopSiren === "function") car.stopSiren();
            else car.sirenState = 0;
        }
    }

    if (typeof cars !== "undefined" && Array.isArray(cars)) {
        for (let i = 0; i < cars.length; i++) {
            roadblockHandleVehicleCollision(cars[i]);
        }
    }
}

function drawRoadblocks(ctx) {
    if (!roadblockState.barricades.length) return;

    for (let i = 0; i < roadblockState.barricades.length; i++) {
        const b = roadblockState.barricades[i];
        if (!b.intact) continue;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);

        ctx.fillStyle = "#c8c2b4";
        ctx.strokeStyle = "#3a3a3a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(
                -b.length * 0.5,
                -b.thickness * 0.5,
                b.length,
                b.thickness,
                2
            );
        } else {
            ctx.rect(
                -b.length * 0.5,
                -b.thickness * 0.5,
                b.length,
                b.thickness
            );
        }
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "#c0392b";
        ctx.lineWidth = 2;
        const stripeStep = 6;
        for (let s = -b.length * 0.5; s < b.length * 0.5; s += stripeStep) {
            ctx.beginPath();
            ctx.moveTo(s, -b.thickness * 0.45);
            ctx.lineTo(s + 4, b.thickness * 0.45);
            ctx.stroke();
        }

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(-b.length * 0.5 - 1, -2, 3, 4);
        ctx.fillRect(b.length * 0.5 - 2, -2, 3, 4);

        ctx.restore();
    }
}

function isRoadblockBlocking(x, y) {
    return roadblockBlocksPoint(x, y);
}

function roadblockObstacleNear(x, y, radius) {
    for (let i = 0; i < roadblockState.barricades.length; i++) {
        const b = roadblockState.barricades[i];
        if (!b.intact) continue;
        if (roadblockCircleHitsBarricade(x, y, radius, b)) return true;
    }
    return false;
}

// Hook wanted-score clear when available (police.js loads first).
(function hookClearWantedScore() {
    if (typeof clearWantedScore === "function") {
        const prev = clearWantedScore;
        clearWantedScore = function () {
            prev();
            clearRoadblocks();
        };
    }
})();

roadblockInitLocations();
