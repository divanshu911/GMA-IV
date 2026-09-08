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
    sirenBtn.innerText = 'ðŸš¨ SIREN: OFF';
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
        sirenBtn.innerText = 'ðŸš¨ SIREN: WAIL';
        sirenBtn.style.borderColor = '#e74c3c';
    } else if (playerCar.sirenState === 2) {
        sirenBtn.innerText = 'ðŸš¨ SIREN: YELP';
        sirenBtn.style.borderColor = '#3498db';
    } else {
        sirenBtn.innerText = 'ðŸš¨ SIREN: OFF';
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
    // The stolen/player car remains in the world until the
    // black-screen transition, so arrest cleanup is NOT immediate.
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

    // ------------------------------------------------------------
    // Capture police cars that were ACTUALLY chasing at the
    // instant of arrest. These become escort vehicles.
    // ------------------------------------------------------------
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

    // Make absolutely sure wanted status remains active during
    // the arrest sequence.
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


// ------------------------------------------------------------
// Create the black transition overlay once.
// ------------------------------------------------------------
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


// ------------------------------------------------------------
// Find a road position outside the current viewport.
// ------------------------------------------------------------

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

    // Try deterministic directions first.
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

    // Fallback: search around the same 500-unit distance.
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

// ------------------------------------------------------------
// Spawn the arrest transport police car.
// ------------------------------------------------------------
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

    // Keep police-car characteristics.
    policeCar.width = 16;
    policeCar.length = 28;
    policeCar.baseSpeed = 3.2;
    policeCar.speed = 3.2;

    policeCar.isParked = false;
    policeCar.hasDriver = true;
    policeCar.policeState = "ARREST_TRANSPORT";

    // Face roughly toward the player initially.
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

// ------------------------------------------------------------
// POLICE LOCAL OBSTACLE AVOIDANCE
// Avoids:
// 1. Other cars
// 2. Yellow collision pixels (buildings)
// 3. Blue collision pixels (water)
// ------------------------------------------------------------
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

        // Yellow building pixels.
        const yellow =
            r >= 220 &&
            g >= 175 &&
            b <= 85 &&
            r - b >= 135 &&
            g - b >= 90;

        // Blue water pixels.
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

    // Turn toward the side with fewer obstacles.
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

    // If both sides are blocked, make a smaller turn
    // so the car can search for an opening naturally.
    return {
        angle: moveAngle + Math.PI * 0.35,
        blocked: true
    };
}

// ------------------------------------------------------------
function moveArrestPoliceCar(
    car,
    targetX,
    targetY,
    dt,
    speed
) {
    if (!car) return;

    // Initialize tracking properties if not present
    if (car.arrestTransportRepathTimer === undefined) car.arrestTransportRepathTimer = 0;
    if (car.arrestTransportPathIndex === undefined) car.arrestTransportPathIndex = 1;

    car.arrestTransportRepathTimer -= dt;

    // Check if path is physically blocked by another vehicle ahead
    const checkSensorDist = (car.sensorLength || 35) + 10;
    const forwardAngle = car.angle - Math.PI / 2;
    const frontCheckX = car.x + Math.cos(forwardAngle) * checkSensorDist;
    const frontCheckY = car.y + Math.sin(forwardAngle) * checkSensorDist;

    let pathBlockedByCar = false;
    if (typeof cars !== 'undefined') {
        for (let i = 0; i < cars.length; i++) {
            const otherCar = cars[i];
            if (otherCar !== car && otherCar !== playerCar && !otherCar.exploded) {
                if (Math.hypot(otherCar.x - frontCheckX, otherCar.y - frontCheckY) < 25) {
                    pathBlockedByCar = true;
                    break;
                }
            }
        }
    }

    // Repath ONLY if path is missing or blocked by a car (and repath cooldown expired)
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

    // Dynamic Police Unit Separation (prevent stacking/spinning)
    let avoidX = 0;
    let avoidY = 0;
    const avoidanceRadius = 55;

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
    // Avoid normal traffic and collision-map obstacles.
const localAvoidance =
    getPoliceObstacleAvoidance(
        car,
        moveAngle,
        cars
    );

if (localAvoidance.blocked) {
    moveAngle = localAvoidance.angle;
}

    smoothlyTurnAIMovement(car, moveAngle, dt, true);
car.speed = speed;

    const nextX = car.x + Math.cos(moveAngle) * speed * dt;
    const nextY = car.y + Math.sin(moveAngle) * speed * dt;

    // Movement check matching chasing police (primarily road, secondary grass)
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

    // Give the fade time to reach black.
    setTimeout(() => {
        // DESPAWN TRANSPORT CAR.
        // ------------------------------------------------------
        if (arrestTransportCar) {
            if (typeof arrestTransportCar.stopSiren === 'function') {
                arrestTransportCar.stopSiren();
            }

            if (arrestTransportCar.humAudio) {
                arrestTransportCar.humAudio.pause();
                arrestTransportCar.humAudio = null;
            }

            const index =
                cars.indexOf(arrestTransportCar);

            if (index > -1) {
                cars.splice(index, 1);
            }
        }

        arrestTransportCar = null;

        // ------------------------------------------------------
        // DESPAWN ESCORT POLICE CARS.
        // ------------------------------------------------------
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

        // ------------------------------------------------------
        // REMOVE ALL STOLEN CARS ONLY NOW.
        // ------------------------------------------------------
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

        // ------------------------------------------------------
        // NOW clear wanted/stolen records.
        // ------------------------------------------------------
        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car");

        player.wanted = false;
        player.beingChased = false;

        localStorage.setItem(
            "gma_player_wanted",
            "false"
        );

        // Place player at the police station.
        player.x = ARREST_STATION_X;
        player.y = ARREST_STATION_Y;
        player.speed = 0;

        // ------------------------------------------------------
        // Hold black screen for 2 seconds.
        // ------------------------------------------------------
        setTimeout(() => {

            overlay.style.opacity = "0";

            setTimeout(() => {
 player.isBeingArrested = false;
player.isArrestPassenger = false;
 player.ispassenger = false;
 camera.passengerFollowAngle = null;  player.arrestTransportCar = null; 
arrestTransportState = "NONE";                       arrestTransitionStarted = false;                 arrestTransportPath = null;
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

if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
    taxiManager.setMessage(
        `Charged with ${hitRunCharges} hit-run and ${carStealCharges} car steal cases.`,
        300
    );
}

// The current wanted streak is now finished.
playerHitRunCases = 0;
playerCarStealCases = 0;
saveCrimeCaseCounts();

// All pending hit-run incidents are cleared with the arrest.
pendingHitRunIncidents = [];
savePendingHitRunIncidents();
                }
            }, 450);

        }, 2000);

    }, 450);
}


// ------------------------------------------------------------
// Update arrest transport + escorts.
// ------------------------------------------------------------
function updateArrestTransport(dt) {

    if (!player.isBeingArrested) return false;

    // Keep player absolutely immobile.
    player.speed = 0;

    // ----------------------------------------------------------
    // Transport stuck detection.
    // If the transport car remains at the same position for
    // 5 seconds, move it to a safe road position.
    // ----------------------------------------------------------
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
            const safeRoadPosition =
                getRandomStrictRoadPosition();

            arrestTransportCar.x = safeRoadPosition.x;
            arrestTransportCar.y = safeRoadPosition.y;

            arrestTransportCar.speed = 0;
            arrestTransportCar.velocityX = 0;
            arrestTransportCar.velocityY = 0;

            arrestTransportCar.stuckX =
                arrestTransportCar.x;
            arrestTransportCar.stuckY =
                arrestTransportCar.y;
            arrestTransportCar.stuckTimer = 0;

            arrestTransportCar.arrestTransportPath = null;
            arrestTransportCar.arrestTransportRepathTimer = 0;

            // Keep the arrested player attached to the transport.
            if (player.isArrestPassenger) {
                player.x = arrestTransportCar.x;
                player.y = arrestTransportCar.y;
                player.angle = arrestTransportCar.angle;
            }

            console.log(
                "Arrest transport stuck for 5 seconds â€” respawned on road."
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

    // ----------------------------------------------------------
    // Transport car approaching player.
    // ----------------------------------------------------------
    if (
        arrestTransportState === "APPROACHING" &&
        arrestTransportCar
    ) {
        const distance =
            Math.hypot(
                player.x - arrestTransportCar.x,
                player.y - arrestTransportCar.y
            );

        if (distance <= 42) {

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

    // ----------------------------------------------------------
    // Transport car carrying player to station.
    // ----------------------------------------------------------
    if (
        arrestTransportState === "CARRYING" &&
        arrestTransportCar
    ) {
        player.x = arrestTransportCar.x;
        player.y = arrestTransportCar.y;
        player.angle = arrestTransportCar.angle;
        player.speed = 0;

        const stationDistance =
            Math.hypot(
                ARREST_STATION_X - arrestTransportCar.x,
                ARREST_STATION_Y - arrestTransportCar.y
            );

        if (stationDistance <= 55) {

            arrestTransportCar.x =
                ARREST_STATION_X;

            arrestTransportCar.y =
                ARREST_STATION_Y;

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

            // Keep player attached after movement.
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

            const forwardAngle =
                arrestTransportCar.angle -
                Math.PI / 2;

            // Keep escorts behind / beside the transport rather
            // than sending every car to exactly the same point.
            const side =
                index % 2 === 0 ? -1 : 1;

            const row =
                Math.floor(index / 2);

            const targetX =
                arrestTransportCar.x -
                Math.cos(forwardAngle) *
                (65 + row * 45) +
                Math.cos(forwardAngle + Math.PI / 2) *
                side *
                45;

            const targetY =
                arrestTransportCar.y -
                Math.sin(forwardAngle) *
                (65 + row * 45) +
                Math.sin(forwardAngle + Math.PI / 2) *
                side *
                45;

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

    if (specificUnit) {
        return (
            specificUnit.isPolice &&
            specificUnit.policeState === "CHASE" &&
            Math.hypot(player.x - specificUnit.x, player.y - specificUnit.y) <= maxDistance
        );
    }

    let nearby = false;

    cars.forEach(c => {
        if (
            c.isPolice &&
            c !== playerCar &&
            c.policeState === "CHASE"
        ) {
            if (Math.hypot(player.x - c.x, player.y - c.y) <= maxDistance) {
                nearby = true;
            }
        }
    });

    npcs.forEach(n => {
        if (
            n.isPolice &&
            n.policeState === "CHASE"
        ) {
            if (Math.hypot(player.x - n.x, player.y - n.y) <= maxDistance) {
                nearby = true;
            }
        }
    });

    return nearby;
}              // --- STAGE 4A: POLICE RECOGNITION, WARNING & ARREST SYSTEM ---
// POLICE OFFICER VEHICLE INTERCEPTION BULLETS
// ============================================================

const policeBullets = [];

const POLICE_BULLET_SPEED = 7.5;
const POLICE_BULLET_LIFETIME = 55;
const POLICE_BULLET_RADIUS = 3;
const POLICE_OFFICER_FIRE_COOLDOWN = 28;
const POLICE_OFFICER_SHOOT_RANGE = 300;
const POLICE_OFFICER_MIN_CAR_SPEED = 0.35;


const POLICE_BULLET_SOUND_URL = "https://raw.githubusercontent.com/divanshu911/My-game-assets/ed8f60817772b47df611091dd6f73b2f58435b46/gunshot.wav";

let policeBulletSound = null;

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

// Brief firing pose.
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

        // Bullet reached the player's car.
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
    // Only puncture and notify once.
    if (!car.tirePunctured) {
        car.tirePunctured = true;
        taxiManager.setMessage("Car's tyre is punctured!", 240);

        // Immediately reduce current speed so the effect is noticeable.
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

        ctx.translate(
            bullet.x,
            bullet.y
        );

        ctx.rotate(bulletAngle);

        // Tiny bullet-like projectile.
      // Bright bullet with a small glow.
ctx.shadowColor = "#ffd84a";
ctx.shadowBlur = 6;
ctx.fillStyle = "#ffd84a";

ctx.fillRect(
    -6,
    -1.5,
    12,
    3
);  

        ctx.restore();
    });

    ctx.restore();
 }                                                             function smoothlyTurnAIMovement(unit, moveAngle, dt, isCar) {
    const targetAngle = moveAngle + Math.PI / 2;

    // Base turning speed from the vehicle/NPC.
    const baseTurnSpeed = isCar
    ? Math.max(unit.turnSpeed || 0.05, 0.085)
    : 0.12;

    let angleDiff = targetAngle - unit.angle;

    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    const turnAmount = Math.abs(angleDiff);

    // Larger directional changes turn faster.
    // Small corrections remain slower and smooth.
    const directionScale =
        0.5 + (turnAmount / Math.PI) * 1.5;

    const turnSpeed =
        baseTurnSpeed * directionScale;

    const maxTurn = turnSpeed * dt;

    unit.angle +=
        Math.sign(angleDiff) *
        Math.min(turnAmount, maxTurn);
}
// --- HELPER: EXECUTE EXISTING CHASE & NAVIGATION BEHAVIOR FOR A SINGLE UNIT ---
function updateSinglePoliceChase(unit, dt, player, cars, npcs) {
    const isCar = unit.length !== undefined;

    // Injured police officers must immediately leave the chase.
    if (!isCar && unit.isInjured) {
        unit.speed = 0;
        unit.policeState = "PATROL";
        unit.policeFiringTimer = 0;
        return;
    }
    if (!isCar && unit.policeFiringTimer > 0) {
    unit.policeFiringTimer -= dt;
}
        // --- Police-car A* repath timer ---
    if (isCar) {
        if (unit.repathTimer === undefined) {
            unit.repathTimer = 0;
        }

        // --- Police chase stop/start timers ---
        if (unit.policeChaseTimerState === undefined) {
            unit.policeChaseTimerState = "CHASING";
            unit.policeStopTimer = 0;
            unit.policeStartTimer = 0;
            unit.policeCoastAngle = unit.angle - Math.PI / 2;
            unit.policeCoastSpeed = 3.2;
        }
    }
    // Destroyed police cars must never continue the chase.
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

    // Siren and unpark state for police cars
    if (isCar) {
        unit.isParked = false;
        if (typeof unit.playSiren === 'function') {
            unit.playSiren(2);
        } else {
            unit.sirenState = 2;
        }
    }

    // ON-FOOT OFFICER VS MOVING PLAYER CAR (Interceptor shooting logic)
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
    // --- POLICE CAR STOP/START CHASE TIMERS ---
    // Police cars only. Officer NPC chase behavior is untouched.
    if (isCar) {
    const playerIsMoving = Math.abs(player.speed || 0) > 0.05;
    const policeCarIsNearPlayer = isPlayerNearPoliceUnit(120, unit);

    if (!playerIsMoving && policeCarIsNearPlayer) {

            // Player just stopped during a normal chase.
            // Start the 0.6 second forward-coast period.
            if (unit.policeChaseTimerState === "CHASING") {
                unit.policeChaseTimerState = "STOPPING";
                unit.policeStopTimer = 0.6 * 60;

                // Lock the direction the police car was already facing.
                unit.policeCoastAngle = unit.angle - Math.PI / 2;

                // Keep its current chase speed for the coast.
                unit.policeCoastSpeed =
                    Math.abs(unit.speed) > 0.05
                        ? Math.abs(unit.speed)
                        : 3.2;
            }

            // Player stopped while the 0.8 sec start timer was running.
            // IMPORTANT: pause the timer; do NOT reset it.
            if (unit.policeChaseTimerState === "STARTING") {
                unit.policeChaseTimerState = "STARTING_PAUSED";
                unit.speed = 0;
                return;
            }

            // Timer already paused. Remain stopped.
            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.speed = 0;
                return;
            }

            // -----------------------------------------------------
            // 0.6 SECOND FORWARD COAST
            // -----------------------------------------------------
            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer -= dt;

                const coastSpeed = unit.policeCoastSpeed;
                const coastAngle = unit.policeCoastAngle;

                unit.speed = coastSpeed;
                unit.angle = coastAngle + Math.PI / 2;

                const nextX =
                    unit.x +
                    Math.cos(coastAngle) *
                    coastSpeed *
                    dt;

                const nextY =
                    unit.y +
                    Math.sin(coastAngle) *
                    coastSpeed *
                    dt;

                if (isGrassOrRoad(nextX, nextY)) {
                    unit.x = nextX;
                    unit.y = nextY;
                } else {
                    const xWalkable =
                        isGrassOrRoad(nextX, unit.y);

                    const yWalkable =
                        isGrassOrRoad(unit.x, nextY);

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

                return;
            }

            // Police has completed the 0.6 sec coast.
            // Stay exactly where it stopped.
            if (unit.policeChaseTimerState === "STOPPED") {
                unit.speed = 0;
                return;
            }
        }

        // ---------------------------------------------------------
        // PLAYER HAS STARTED MOVING
        // ---------------------------------------------------------
        else {

            // Player started moving while police was still in the0.6 sec coast. Cancel the coast and begin the 0.5 sec stationary delay.
            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer = 0;
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }

            // Player starts moving after police has completely stopped.
            if (unit.policeChaseTimerState === "STOPPED") {
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }
           // Resume a previously paused 0.5 sec timer.
            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.policeChaseTimerState = "STARTING";
            }
            // -------------------------------------------            // 0.5 SECOND START DELAY           // -----------------------------------------------------
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

    // --- A* CHASE LOGIC & NAVIGATION MOVEMENT ---
    const chaseTarget =
    playerCar && !playerCar.exploded
        ? playerCar
        : player;

const chaseDistance = Math.hypot(
    chaseTarget.x - unit.x,
    chaseTarget.y - unit.y
);

if (chaseDistance > 35) {
    // --- A* repath timer for ALL police units ---
    if (unit.repathTimer === undefined) {
        unit.repathTimer = 0;
    }

    unit.repathTimer -= dt;

    unit.policePath = navigationSystem.findPath(
    unit.x,
    unit.y,
    chaseTarget.x,
    chaseTarget.y
);

        unit.repathTimer = 0.33; // recalculate roughly 3 times/sec
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

                // Dynamic Police Unit Separation
        // Prevent multiple police units from occupying the exact same
        // chase position and getting stuck spinning against each other.
        let avoidX = 0;
        let avoidY = 0;
        const avoidanceRadius = isCar ? 55 : 35;

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

        // Only apply separation when police units are actually close.
        // Keep the player's chase direction dominant so police don't
        // randomly veer away during a normal chase.
        if (avoidX !== 0 || avoidY !== 0) {
            const avoidAngle = Math.atan2(avoidY, avoidX);

            const separationStrength =
                Math.min(0.35, Math.hypot(avoidX, avoidY) * 0.35);

            // Blend using vectors instead of directly averaging angles.
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

    if (isCar) {
        const localAvoidance = getPoliceObstacleAvoidance(
            unit,
            moveAngle,
            cars
        );

        if (localAvoidance.blocked) {
            moveAngle = localAvoidance.angle;
        }
    }

    smoothlyTurnAIMovement(unit, moveAngle, dt, isCar);

        // Position Updates & Collision Handling
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

    if (player.isBeingArrested) {
        updateArrestTransport(dt);
        return;
    }

    const surrenderBtn = document.getElementById('surrenderBtn');

    // --- POLICE CHASE ESCAPE ---
    // Only actively chasing police units count.
    // Patrol units do NOT prevent the player from escaping the chase.
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
    player.beingChased = false;
    player.wanted = true;

    // Player has escaped the active chase, but remains wanted.
    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
        taxiManager.setMessage("You escaped! they are searching for you", 240);
    }

    // Keep player.wanted = true.
            // Being out of the chase does NOT mean the player is no longer wanted.

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
            if (c.isPolice && c.policeState && c.policeState !== "PATROL") {
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
            if (n.isPolice && n.policeState && n.policeState !== "PATROL") {
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
            if (surrenderBtn) surrenderBtn.style.display = 'block';
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
                warningOrArrestingUnit.policeState = "CHASE";

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

    // 4. JOIN CHASE MECHANIC FOR NEARBY UNITS (Within 240px | Max 3 Cars, 2 Officers)
    if (player.beingChased) {
        // SURRENDER BUTTON: only available when a chasing police unit is close
if (surrenderBtn) {
    surrenderBtn.style.display = isPlayerNearPoliceUnit(120) ? 'block' : 'none';
}
        let activeChasingCars = cars.filter(c => c.isPolice && c.policeState === "CHASE").length;
        let activeChasingOfficers = npcs.filter(n => n.isPolice && n.policeState === "CHASE").length;

        // Check nearby police cars
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

        // Check nearby police officer NPCs
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
                          // --- HUD MESSAGE FOR NEW OFFICER JOINING ---
                            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                                taxiManager.setMessage("A police unit joined the chase!", 180);

                    }
                }}
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