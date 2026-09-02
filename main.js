console.log("pizza");
// --- 1. AUDIO & STATE ---
const musicUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/a5fe3dcfe3438531dfff064503d78422031253a7/cricket.ogg";
const bgMusic = new Audio(musicUrl);
bgMusic.loop = true;
bgMusic.volume = 1.0;

// --- POLICE SIREN AUDIO URLS ---
const sirenWailUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/3f2e1c44ba2a5125a8e9110c934c07e9a2079164/SirenWail.ogg"; 
const sirenYelpUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/3f2e1c44ba2a5125a8e9110c934c07e9a2079164/SirenYelp.ogg"; 

// --- NEW FOOTSTEP AUDIO INTEGRATION ---
const grassWalkUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/ddddea61f0bfe6a7858006295392fa8b79839939/walkongrass.ogg";
const roadWalkUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/ddddea61f0bfe6a7858006295392fa8b79839939/walkonroad.ogg";

// Audio pool factory to safely support rapid overlapping sound plays
function createAudioPool(url, baseVolume = 1.0) {
    const pool = [];
    const poolSize = 6;
    for (let i = 0; i < poolSize; i++) {
        const audio = new Audio(url);
        audio.volume = baseVolume;
        pool.push(audio);
    }
    let currentIdx = 0;
    return {
        play(volume) {
            const audio = pool[currentIdx];
            audio.volume = volume !== undefined ? volume : baseVolume;
            audio.currentTime = 0;
            audio.play().catch(() => {});
            currentIdx = (currentIdx + 1) % poolSize;
        }
    };
}

const grassAudioPool = createAudioPool(grassWalkUrl, 0.6);
const roadAudioPool = createAudioPool(roadWalkUrl, 1.0);

// --- NEW VEHICLE & COLLISION AUDIO POOLS ---
const npcHitUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/personHit.wav";
const carCrashUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/CarCrash.wav";
const engineDeadUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/enginedying.wav";
const explosionUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/CarExplosion.mp3";
const fireUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/defd10de381fc232acf76a7faed6a5bd5ae7b5d4/Fire3.mp3";
const engineHumUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/defd10de381fc232acf76a7faed6a5bd5ae7b5d4/engine3-loop.mp3";

const npcHitPool = createAudioPool(npcHitUrl, 1.0);
const carCrashPool = createAudioPool(carCrashUrl, 0.4);
const explosionPool = createAudioPool(explosionUrl, 1.0);
const engineDeadPool = createAudioPool(engineDeadUrl, 0.4);

// --- SPATIAL SOUND HELPER (another file)---


// --- CAR START & STOP SOUND POOLS ---
const carStartUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/e6af9779049a2aa837e485e387bcb2e3df5293a5/EngineStart.mp3";
const carStopUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/e6af9779049a2aa837e485e387bcb2e3df5293a5/EngineStop.mp3";

const carStartPool = createAudioPool(carStartUrl, 0.8);
const carStopPool = createAudioPool(carStopUrl, 0.6);

// --- GLOBAL PARTICLE & MARK ARRAYS ---
const exhaustParticles = [];
const debrisParticles = [];
const tyreMarks = [];

//TYRE MARKS AND DEBRIS HELPERS (Another file)

// -- SOMETHING ELSE --          
if (typeof window.isWalkableColor !== 'function') {
    window.isWalkableColor = function(x, y, size) {
        if (typeof isInsideDealership !== 'undefined' && isInsideDealership) {
            let dWidth = dealershipMapWidth > 0 ? dealershipMapWidth : 800;
            let dHeight = dealershipMapHeight > 0 ? dealershipMapHeight : 600;
            return x > 30 && x < dWidth - 30 && y > 50 && y < dHeight - 30;
        }
        return true;
    };
}

let angryDrivers = [];
let playerCar = null;
let targetCar = null;

window.mapImage = window.mapImage || new Image();
mapImage.crossOrigin = "Anonymous";

window.mapWidth = window.mapWidth || 0;
window.mapHeight = window.mapHeight || 0;
window.collisionData = window.collisionData || null;

mapWidth = window.mapWidth;
mapHeight = window.mapHeight;
collisionData = window.collisionData;

const restaurantZone = {
  x: 1454,
  y: 765,
  radius: 45,
  mealCost: 40,
  messageTimer: 0
};


    
// ===== 1. VISUAL MAP (Renders the world & mini-map) =====
mapImage.addEventListener('load', () => {
    mapWidth = mapImage.width;
    mapHeight = mapImage.height;

    // Tell the loading screen that the visual map is ready.
    mapAssetLoaded = true;
    tryEnableStartButton();
});
mapImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/Map2.png";


// ===== 2. COLLISION & A* NAVIGATION MAP =====
// Paste your collision map image URL below:
const COLLISION_MAP_URL = "YOUR_COLLISION_MAP_URL_HERE"; 

const collisionMapImage = new Image();
collisionMapImage.crossOrigin = "Anonymous";
// ============================================================
// PROCEDURAL BUILDING LIGHTS
// Detected once from CollisionMap2 when it loads.
// ============================================================

window.buildingLightShapes = [];

const BUILDING_LIGHT_MIN_PIXELS = 12;

// CollisionMap2's main building color is approximately:
// RGB(249, 212, 19).
// Use a range so antialiased/shaded yellow pixels remain connected.
function isBuildingLightPixel(index) {
    const r = collisionData[index];
    const g = collisionData[index + 1];
    const b = collisionData[index + 2];

    return (
        r >= 220 &&
        g >= 175 &&
        b <= 85 &&
        r - b >= 135 &&
        g - b >= 90
    );
}

function generateBuildingLightShapes() {
    window.buildingLightShapes.length = 0;

    if (!collisionData || !collisionMapImage.width || !collisionMapImage.height) {
        return;
    }

    const cw = collisionMapImage.width;
    const ch = collisionMapImage.height;
    const totalPixels = cw * ch;

    // CollisionMap2 is lower resolution than the actual world map.
    // Convert collision-map coordinates into world/map coordinates.
    const worldW = mapImage.naturalWidth || 4096;
    const worldH = mapImage.naturalHeight || 2286;

    const scaleX = worldW / cw;
    const scaleY = worldH / ch;

    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);

    const getIndex = (x, y) => (y * cw + x) * 4;

    const isBuildingXY = (x, y) => {
        if (x < 0 || y < 0 || x >= cw || y >= ch) {
            return false;
        }

        return isBuildingLightPixel((y * cw + x) * 4);
    };

    // Check whether the proposed light would hit another yellow
    // building region before reaching its end.
    function lightIntersectsBuilding(
        originX,
        originY,
        normalX,
        normalY,
        length,
        baseWidth
    ) {
        const perpendicularX = -normalY;
        const perpendicularY = normalX;

        // Start slightly outside the building itself.
        for (let t = 0.12; t <= 0.94; t += 0.10) {
            const centerX = originX + normalX * length * t;
            const centerY = originY + normalY * length * t;

            // Broad at the building, narrow farther away.
            const halfWidth =
                (baseWidth * (1 - t)) * 0.5;

            // Only 5 samples across the triangle.
            // This is much cheaper than testing every pixel.
            for (let s = -1; s <= 1; s++) {
                const sideX =
                    centerX +
                    perpendicularX *
                    halfWidth *
                    s;

                const sideY =
                    centerY +
                    perpendicularY *
                    halfWidth *
                    s;

                const collisionX =
                    Math.floor(sideX / scaleX);
                const collisionY =
                    Math.floor(sideY / scaleY);

                if (isBuildingXY(collisionX, collisionY)) {
                    return true;
                }
            }

            // Also test the center between the three main samples.
            const collisionX = Math.floor(centerX / scaleX);
            const collisionY = Math.floor(centerY / scaleY);

            if (isBuildingXY(collisionX, collisionY)) {
                return true;
            }
        }

        return false;
    }

    // Find an outward-facing normal from an outer yellow pixel.
    function getOutwardNormal(pixelIndex) {
        const p = pixelIndex / 4;
        const py = Math.floor(p / cw);
        const px = p - py * cw;

        let nx = 0;
        let ny = 0;

        // Examine the 8 surrounding pixels.
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;

                const xx = px + ox;
                const yy = py + oy;

                if (
                    xx < 0 ||
                    yy < 0 ||
                    xx >= cw ||
                    yy >= ch
                ) {
                    continue;
                }

                if (!isBuildingXY(xx, yy)) {
                    nx += ox;
                    ny += oy;
                }
            }
        }

        const length = Math.hypot(nx, ny);

        if (length < 0.001) {
            return null;
        }

        nx /= length;
        ny /= length;

        // Convert the normal correctly if collision/world
        // scaling is not identical on both axes.
        nx *= scaleX;
        ny *= scaleY;

        const worldLength = Math.hypot(nx, ny);

        return {
            x: nx / worldLength,
            y: ny / worldLength
        };
    }

    // Choose spatially separated points instead of putting all
    // lights beside each other.
    function chooseBoundaryPoints(boundary, count, minX, maxX, minY, maxY) {
        if (!boundary.length) {
            return [];
        }

        const selected = [];

        const centerX = (minX + maxX) * 0.5;
        const centerY = (minY + maxY) * 0.5;

        // First point: boundary point closest to building center.
        let first = boundary[0];
        let bestDist = Infinity;

        for (let i = 0; i < boundary.length; i++) {
            const p = boundary[i] / 4;
            const y = Math.floor(p / cw);
            const x = p - y * cw;

            const dx = x - centerX;
            const dy = y - centerY;
            const dist = dx * dx + dy * dy;

            if (dist < bestDist) {
                bestDist = dist;
                first = boundary[i];
            }
        }

        selected.push(first);

        // Farthest-point selection gives separated lights.
        while (selected.length < count) {
            let bestCandidate = null;
            let bestMinDistance = -1;

            for (let i = 0; i < boundary.length; i++) {
                const candidate = boundary[i];

                let p = candidate / 4;
                let cy = Math.floor(p / cw);
                let cx = p - cy * cw;

                let nearestDistance = Infinity;

                for (let j = 0; j < selected.length; j++) {
                    p = selected[j] / 4;
                    const sy = Math.floor(p / cw);
                    const sx = p - sy * cw;

                    const dx = cx - sx;
                    const dy = cy - sy;
                    const d = dx * dx + dy * dy;

                    if (d < nearestDistance) {
                        nearestDistance = d;
                    }
                }

                if (nearestDistance > bestMinDistance) {
                    bestMinDistance = nearestDistance;
                    bestCandidate = candidate;
                }
            }

            if (bestCandidate === null) {
                break;
            }

            selected.push(bestCandidate);
        }

        return selected;
    }

    let buildingCount = 0;
    let lightCount = 0;

    for (let startPixel = 0; startPixel < totalPixels; startPixel++) {
        const startIndex = startPixel * 4;

        if (visited[startPixel]) {
            continue;
        }

        if (!isBuildingLightPixel(startIndex)) {
            visited[startPixel] = 1;
            continue;
        }

        // --------------------------------------------------------
        // Flood-fill one connected yellow region.
        // One connected yellow region = ONE building.
        // --------------------------------------------------------

        let queueHead = 0;
        let queueTail = 0;

        queue[queueTail++] = startPixel;
        visited[startPixel] = 1;

        const boundary = [];

        let area = 0;

        let minX = cw;
        let minY = ch;
        let maxX = 0;
        let maxY = 0;

        while (queueHead < queueTail) {
            const pixel = queue[queueHead++];

            const y = Math.floor(pixel / cw);
            const x = pixel - y * cw;

            area++;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            let isBoundary = false;

            // 4-neighbor connected-component detection.
            const neighbors = [
                [x + 1, y],
                [x - 1, y],
                [x, y + 1],
                [x, y - 1]
            ];

            for (let n = 0; n < 4; n++) {
                const nx = neighbors[n][0];
                const ny = neighbors[n][1];

                if (
                    nx < 0 ||
                    ny < 0 ||
                    nx >= cw ||
                    ny >= ch
                ) {
                    isBoundary = true;
                    continue;
                }

                const neighborPixel = ny * cw + nx;

                if (!isBuildingXY(nx, ny)) {
                    isBoundary = true;
                    continue;
                }

                if (!visited[neighborPixel]) {
                    visited[neighborPixel] = 1;
                    queue[queueTail++] = neighborPixel;
                }
            }

            if (isBoundary) {
                boundary.push(pixel * 4);
            }
        }

        if (
            area < BUILDING_LIGHT_MIN_PIXELS ||
            boundary.length === 0
        ) {
            continue;
        }

        buildingCount++;

        let desiredLights = 1;

        if (area >= 2000) {
            desiredLights = 3;
        } else if (area >= 200) {
            desiredLights = 2;
        }

        const candidates = chooseBoundaryPoints(
            boundary,
            desiredLights,
            minX,
            maxX,
            minY,
            maxY
        );

        for (let i = 0; i < candidates.length; i++) {
            const pixelIndex = candidates[i];

            const p = pixelIndex / 4;
            const collisionY = Math.floor(p / cw);
            const collisionX = p - collisionY * cw;
          

      const normal = getOutwardNormal(pixelIndex);

if (!normal) {
    continue;
}

// FIXED CODE
const isCornerNormal =
    Math.abs(normal.x) > 0.60 &&
    Math.abs(normal.y) > 0.60;

if (isCornerNormal) {
    continue;
}

            // Convert the outermost yellow pixel to world coordinates.
            const originX =
                (collisionX + 0.5) * scaleX;
            const originY =
                (collisionY + 0.5) * scaleY;

            // Large enough to look like light spilling from a building,
            // but deliberately not huge.
            const length =
                area >= 2000 ? 82 :
                area >= 200 ? 68 :
                54;

            const baseWidth =
                area >= 2000 ? 42 :
                area >= 200 ? 36 :
                30;

            // Never allow a light to shine into another building.
            if (
                lightIntersectsBuilding(
                    originX,
                    originY,
                    normal.x,
                    normal.y,
                    length,
                    baseWidth
                )
            ) {
                continue;
            }

            window.buildingLightShapes.push({
                x: originX,
                y: originY,

                nx: normal.x,
                ny: normal.y,

                length,
                baseWidth
            });

            lightCount++;
        }
    }

    console.log(
        `Building lights: detected ${buildingCount} buildings, ` +
        `created ${lightCount} valid lights.`
    );
}

collisionMapImage.addEventListener('load', () => {
    const collisionCanvas = document.createElement("canvas");

    collisionCanvas.width = collisionMapImage.width;
    collisionCanvas.height = collisionMapImage.height;

    const collisionCtx = collisionCanvas.getContext("2d");

    collisionCtx.drawImage(
        collisionMapImage,
        0,
        0
    );

    // Collision map dimensions are intentionally kept here.
    // They are separate from the visual map's world dimensions.
    mapWidth = collisionMapImage.width;
    mapHeight = collisionMapImage.height;

    collisionData = collisionCtx.getImageData(
        0,
        0,
        mapWidth,
        mapHeight
    ).data;

    //do not touch
    navigationSystem.buildGrid();
    //end of do not touch

    // Detect buildings and calculate their light positions
    // exactly once when CollisionMap2 is loaded.
    generateBuildingLightShapes();

    collisionMapAssetLoaded = true;
    tryEnableStartButton();
});

collisionMapImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/CollisionMap2.png";

let camera = {
    angle: 0,
    targetAngle: 0,
    moveTimer: 0,
    lastAngle: 0,
    arrestFollowAngle: null
};

const jackBtn = document.getElementById('jackBtn');
const exitBtn = document.getElementById('exitBtn');



if (jackBtn) {
    jackBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();

        if (isInsideDealership && targetCar) {
            viewingCar = targetCar;
            const carPanelName = document.getElementById('carPanelName');
            const carPanelPrice = document.getElementById('carPanelPrice');
            const carPanelStats = document.getElementById('carPanelStats');
            if (carPanelName) carPanelName.innerText = viewingCar.type;
            if (carPanelPrice) carPanelPrice.innerText = "$" + carPrices[viewingCar.type];
            if (carPanelStats) carPanelStats.innerText = `Speed: ${Math.round(viewingCar.baseSpeed * 10)} | Handling: ${Math.round(viewingCar.turnSpeed * 1000)}`;
            if (dealershipPanel) dealershipPanel.style.display = 'block';
            return; 
        }

        if (targetCar && !playerCar) {
            playerCar = targetCar; 
            playerCar.isParked = false; 

            // A police car taken by the player is no longer an active police
            // unit. Clear any warning/chase state so it can be driven normally.
            if (targetCar.isPolice) {
                targetCar.policeState = "PATROL";
                targetCar.warningTimer = 0;
                targetCar.graceTimer = 0;
                targetCar.arrestStage = 0;
                targetCar.arrestTimer = 0;
                if (typeof targetCar.stopSiren === 'function') {
                    targetCar.stopSiren();
                } else {
                    targetCar.sirenState = 0;
                }
            }

            if (targetCar.hasDriver) {
                // DO NOT set targetCar.isStolen = true immediately.
                // Store reference to targetCar on AngryDriver.
                
                let sideAngle = targetCar.angle - Math.PI / 2;
                let newAngryDriver = new AngryDriver(
                    targetCar.x + Math.cos(sideAngle) * 35,
                    targetCar.y + Math.sin(sideAngle) * 35,
                    targetCar.color,
                    targetCar.angle,
                    false,
                    targetCar
                );
                const hijackLines = ["Thief!", "Hey you!", "My car!", "Get back here!"];
                newAngryDriver.say(hijackLines[Math.floor(Math.random() * hijackLines.length)], 120);

                angryDrivers.push(newAngryDriver);
                targetCar.hasDriver = false;
            } else {
                playSpatialSound(carStartPool, playerCar.x, playerCar.y, 0.8);
                playerCar.engineStartingTimer = 90; 
            }
            jackBtn.style.display = 'none';
        }
    });
}


if (exitBtn) {
    exitBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (playerCar) {
            let sideAngle = playerCar.angle - Math.PI / 2;
            let spawnX = playerCar.x + Math.cos(sideAngle) * 35;
            let spawnY = playerCar.y + Math.sin(sideAngle) * 35;
            if (typeof isWalkableColor === 'function' ? isWalkableColor(spawnX, spawnY, player.size) : true) {
 // Play stopping sound on clean exit
                playSpatialSound(carStopPool, playerCar.x, playerCar.y, 0.8);

                // Stop engine humming audio
                if (playerCar.humAudio) {
                    playerCar.humAudio.pause();
                    playerCar.humAudio = null;
                }
                if (playerCar.isPolice) {
                    playerCar.policeState = "PATROL";
                    playerCar.warningTimer = 0;
                    playerCar.graceTimer = 0;
                    playerCar.arrestStage = 0;
                    playerCar.arrestTimer = 0;
                    if (typeof playerCar.stopSiren === 'function') {
                        playerCar.stopSiren();
                    } else {
                        playerCar.sirenState = 0;
                    }
                }
                playerCar.isParked = true; 
                playerCar.hasDriver = false; 
                playerCar.recentlyJackedTimer = 90;

                player.x = spawnX;
                player.y = spawnY;
                player.angle = playerCar.angle;

                playerCar = null;
                exitBtn.style.display = 'none';
            } else {
                if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    taxiManager.setMessage("no space for exit!", 180);
                }
            }
        }
    });
}



function checkPlayerDeath() {
  if (player.health <= 0) {
      taxiManager.setMessage("WASTED: Rushed to the hospital! Medical fee: $150", 240);
      player.money -= 150;
      player.health = player.maxHealth;
      player.hunger = 100;

      localStorage.setItem("gma_player_money", player.money);
      localStorage.setItem("gma_player_health", player.health);
      localStorage.setItem("gma_player_hunger", player.hunger);

      player.x = 3888;
      player.y = 1215;
      player.speed = 0;

      if (playerCar) {
          if (playerCar.humAudio) {
              playerCar.humAudio.pause();
              playerCar.humAudio = null;
          }
          playerCar.isParked = true;
          playerCar.hasDriver = false;
          playerCar = null;
          if (exitBtn) exitBtn.style.display = 'none';
          if (jackBtn) jackBtn.style.display = 'none';
      }
  }
}
const previousCarPositions = new Map();

function snapshotCarPositions() {
    for (const car of cars) {
        if (car) {
            previousCarPositions.set(car.id, {
                x: car.x,
                y: car.y
            });
        }
    }
}
let playerDamageVignette = 0;

function damagePlayer(amount) {
    if (!amount || amount <= 0) return false;

    player.health -= amount;
    playerDamageVignette = 1;

    if (player.health <= 0) {
        checkPlayerDeath();
        return true;
    }

    return false;
}

 // --- SPATIAL GRID FOR COLLISION BROAD-PHASE ---
const collisionGrid = new Map();
const COLLISION_CELL_SIZE = 80;

function getCollisionCell(x, y) {
    return `${Math.floor(x / COLLISION_CELL_SIZE)},${Math.floor(y / COLLISION_CELL_SIZE)}`;
}

function buildCollisionGrid() {
    collisionGrid.clear();

    // Add cars
    for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (!car) continue;

        const key = getCollisionCell(car.x, car.y);

        let cell = collisionGrid.get(key);
        if (!cell) {
            cell = [];
            collisionGrid.set(key, cell);
        }

        cell.push({
            entity: car,
            type: "car",
            index: i
        });
    }

    // Add NPCs
    for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        if (!npc) continue;

        const key = getCollisionCell(npc.x, npc.y);

        let cell = collisionGrid.get(key);
        if (!cell) {
            cell = [];
            collisionGrid.set(key, cell);
        }

        cell.push({
            entity: npc,
            type: "npc",
            index: i
        });
    }
}

function getNearbyCollisionEntities(entity) {
    const nearby = [];

    const cellX = Math.floor(entity.x / COLLISION_CELL_SIZE);
    const cellY = Math.floor(entity.y / COLLISION_CELL_SIZE);

    // Check current cell + 8 neighboring cells
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const cell = collisionGrid.get(
                `${cellX + ox},${cellY + oy}`
            );

            if (!cell) continue;

            for (const entry of cell) {
                if (entry.entity !== entity) {
                    nearby.push(entry);
                }
            }
        }
    }

    return nearby;
}       
function handlePhysicsAndCollisions(dt) {
    buildCollisionGrid();
      // --- CAR VS CAR COLLISIONS ---
  for (let i = 0; i < cars.length; i++) {
    const c1 = cars[i];
    if (!c1) continue;

    const nearby = getNearbyCollisionEntities(c1);

    for (const entry of nearby) {
      if (entry.type !== "car") continue;

      // Only process each car pair once
      if (entry.index <= i) continue;

      const c2 = entry.entity;

      let dx = c2.x - c1.x;
      let dy = c2.y - c1.y;
      let distSq = dx * dx + dy * dy;

      if (distSq < 26 * 26) {
        let dist = Math.sqrt(distSq);

        if (dist === 0) {
          dx = 1;
          dy = 0;
          dist = 1;
        }

        let overlap = 26 - dist;
        let nx = dx / dist;
        let ny = dy / dist;

        c1.x -= nx * overlap * 0.5;
        c1.y -= ny * overlap * 0.5;
        c2.x += nx * overlap * 0.5;
        c2.y += ny * overlap * 0.5;

        if (typeof isRoadColor === 'function') {
          if (!isRoadColor(c1.x, c1.y)) {
            c1.x += nx * overlap * 0.5;
            c1.y += ny * overlap * 0.5;
          }

          if (!isRoadColor(c2.x, c2.y)) {
            c2.x -= nx * overlap * 0.5;
            c2.y -= ny * overlap * 0.5;
          }
        }

        let vx1 = Math.cos(c1.angle - Math.PI / 2) * (c1.speed || 0);
        let vy1 = Math.sin(c1.angle - Math.PI / 2) * (c1.speed || 0);
        let vx2 = Math.cos(c2.angle - Math.PI / 2) * (c2.speed || 0);
        let vy2 = Math.sin(c2.angle - Math.PI / 2) * (c2.speed || 0);

        let relSpeed = Math.sqrt(
          Math.pow(vx1 - vx2, 2) +
          Math.pow(vy1 - vy2, 2)
        );

        const isCarMoving =
          Math.abs(c1.speed || 0) > 0.2 ||
          Math.abs(c2.speed || 0) > 0.2;

        if (
          relSpeed > 0.6 &&
          isCarMoving &&
          !c1.exploded &&
          !c2.exploded &&
          c1.health > 0 &&
          c2.health > 0
        ) {
          if (!c1.crashCooldown || c1.crashCooldown <= 0) {
            let midX = (c1.x + c2.x) / 2;
            let midY = (c1.y + c2.y) / 2;

            playSpatialSound(
              carCrashPool,
              midX,
              midY,
              Math.min(1.0, relSpeed * 0.5)
            );

            c1.crashCooldown = 30;
            c2.crashCooldown = 30;

            addTyreMarks(c1);
            addTyreMarks(c2);
          }

          const isPlayerInvolved =
            playerCar &&
            (c1.id === playerCar.id || c2.id === playerCar.id);

          if (isPlayerInvolved) {
            let dmg1 = relSpeed * 5 * (c2.weightMultiplier || 1.0);
            let dmg2 = relSpeed * 5 * (c1.weightMultiplier || 1.0);

            if (c1.health > 0)
              c1.health = Math.max(0, c1.health - dmg1);

            if (c2.health > 0)
              c2.health = Math.max(0, c2.health - dmg2);
          }

          let tryExplode = (car, strikingCar, speed) => {
            if (
              speed > 2.8 &&
              strikingCar.weightMultiplier >= 2.5 &&
              Math.random() < (speed * 0.12) &&
              !car.exploded
            ) {
              playSpatialSound(
                explosionPool,
                car.x,
                car.y,
                1.0,
                500
              );

              car.health = 0;
              car.exploded = true;

              if (car.humAudio) {
                car.humAudio.pause();
                car.humAudio = null;
              }

              spawnExplosionDebris(car.x, car.y, 25);

              // Make nearby NPCs react and run away
              npcs.forEach(npc => {
                let ndx = npc.x - car.x;
                let ndy = npc.y - car.y;
                let ndist = Math.sqrt(ndx * ndx + ndy * ndy);

                if (ndist < 250) {
                  if (npc.inConversation) {
                    npc.inConversation = false;
                  }

                  const fleePhrases = [
                    "Fire!",
                    "Run!",
                    "Explosion!",
                    "Aaahhh!"
                  ];

                  npc.say(
                    fleePhrases[
                      Math.floor(Math.random() * fleePhrases.length)
                    ],
                    180
                  );

                  npc.fleeTimer = 240;
                  npc.fleeAngle = Math.atan2(ndy, ndx) + Math.PI / 2;
                }
              });

              if (
                typeof playerCar !== 'undefined' &&
                playerCar &&
                car.id === playerCar.id
              ) {
                 if (damagePlayer(60)) return;

car.isParked = true;
                car.hasDriver = false;
                car.recentlyJackedTimer = 90;

                let sideAngle = car.angle - Math.PI / 2;

                player.x =
                  car.x + Math.cos(sideAngle) * 35;

                player.y =
                  car.y + Math.sin(sideAngle) * 35;

                playerCar = null;

                if (
                  typeof exitBtn !== 'undefined' &&
                  exitBtn
                ) {
                  exitBtn.style.display = 'none';
                }

                if (
                  typeof jackBtn !== 'undefined' &&
                  jackBtn
                ) {
                  jackBtn.style.display = 'none';
                }

                
              }
            }
          };

          tryExplode(c1, c2, relSpeed);
          tryExplode(c2, c1, relSpeed);
        }
      }
    }
  }

  if (!isInsideHouse && !isInsideDealership) {
      cars.forEach(car => {
        if (playerCar && car.id === playerCar.id) return; 
        let dx = player.x - car.x, dy = player.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 24) {
          if (dist === 0) { dx = 1; dy = 0; dist = 1; }
          let overlap = 24 - dist, nx = dx / dist, ny = dy / dist;
          let targetX = player.x + nx * overlap, targetY = player.y + ny * overlap;
          if (typeof isWalkableColor === 'function') {
              if (isWalkableColor(targetX, player.y, player.size)) player.x = targetX;
              if (isWalkableColor(player.x, targetY, player.size)) player.y = targetY;
          }

          if (
    !playerCar &&
    !player.isArrestPassenger &&
    !player.isInvulnerable &&
    (() => {
    const previous = previousCarPositions.get(car.id);
    return previous &&
        Math.hypot(car.x - previous.x, car.y - previous.y) > 1.5;
})()
) {
    damagePlayer(35);
    player.isInvulnerable = true;
    player.invulnerabilityTimer = 60;
    
          }
        }
      });
  }

  cars.forEach(car => {
      if (car.recentlyJackedTimer > 0) car.recentlyJackedTimer -= dt;
    const nearby = getNearbyCollisionEntities(car);

for (const entry of nearby) {
    if (entry.type !== "npc") continue;

    const npc = entry.entity;
      let dx = npc.x - car.x, dy = npc.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22) {
        if ((!car.crashCooldown || car.crashCooldown <= 0) && car.health > 0 && !car.exploded) {
    playSpatialSound(carCrashPool, car.x, car.y, 0.6);
    car.crashCooldown = 30;
        }
        if (dist === 0) { dx = 1; dy = 0; dist = 1; }
        let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
        let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
        if (typeof isRoadColor === 'function' && isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }
      }
    }
  });

  if (!isInsideHouse && !isInsideDealership) {
      // NPC vs Player collision (On foot or in vehicle)
      npcs.forEach(npc => {
          let dx = npc.x - player.x, dy = npc.y - player.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 22) {
            if (dist === 0) { dx = 1; dy = 0; dist = 1; }
            let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
            let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
            if (typeof isRoadColor === 'function' && isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }

            // Occasional collision speech reaction
            if (Math.random() < 0.25 && !npc.speechText) {
                const lines = ["Are you blind!", "Idiot!", "Watch where you're going!", "Hey!"];
                npc.say(lines[Math.floor(Math.random() * lines.length)], 90);
            }
          }
      });

      // NPC vs Player Car collision
      cars.forEach(car => {
          if (playerCar && car.id === playerCar.id) {
              npcs.forEach(npc => {
                  let dx = npc.x - car.x, dy = npc.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist < 28 && Math.random() < 0.3 && !npc.speechText) {
                      const lines = ["Are you blind!", "Idiot!", "Watch out!", "Crazy driver!"];
                      npc.say(lines[Math.floor(Math.random() * lines.length)], 90);
                  }
              });
          }
      });

            // --- NPC VS NPC COLLISIONS ---
      for (let i = 0; i < npcs.length; i++) {
        const npc1 = npcs[i];
        if (!npc1) continue;

        if (npc1.hitCooldown > 0) {
          npc1.hitCooldown--;
        }

        const nearby = getNearbyCollisionEntities(npc1);

        for (const entry of nearby) {
          if (entry.type !== "npc") continue;

          // Only process each NPC pair once
          if (entry.index <= i) continue;

          const npc2 = entry.entity;

          let dx = npc2.x - npc1.x;
          let dy = npc2.y - npc1.y;

          if (dx * dx + dy * dy < 22 * 22) {
            if (!npc1.hitCooldown || npc1.hitCooldown <= 0) {
              playSpatialSound(
                npcHitPool,
                npc1.x,
                npc1.y,
                0.6
              );

              npc1.hitCooldown = 60;
            }
          }
        }
      }
  }
}
// --- HELPER TO SYNC ALL STOLEN CARS & WANTED STATUS ---
function updateStolenCarsStorage() {
    let stolenCars = cars.filter(c => c && c.isStolen);

    if (stolenCars.length > 0) {
        let stolenDataList = stolenCars.map(c => ({
            id: c.id,
            x: c.x,
            y: c.y,
            color: c.color,
            type: c.type,
            angle: c.angle,
            isPolice: Boolean(c.isPolice)
        }));
        localStorage.setItem("stolen_cars", JSON.stringify(stolenDataList));
    } else {
        // No stolen cars left in world -> Remove from storage & clear wanted state
        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car"); // clean up legacy single key
     if (!player.beingChased) {   player.wanted = false;
        player.beingChased = false;
    
        localStorage.setItem("gma_player_wanted", "false");
    }}
}


function updateGame(dt) {
  if (typeof gameActive !== 'undefined' && !gameActive) return;
  if (typeof updateDayNight === 'function') updateDayNight(dt);
    
    // --- REFINED STOLEN CAR & POLICE SYSTEM LOGIC ---
    let stolenCars = cars.filter(c => c.isStolen);

    if (stolenCars.length > 0) {
        for (let i = stolenCars.length - 1; i >= 0; i--) {
            let stolenCar = stolenCars[i];

            // If player is NOT driving this specific stolen car, check abandon distance
            if (!playerCar || playerCar.id !== stolenCar.id) {
                let dx = player.x - stolenCar.x;
                let dy = player.y - stolenCar.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= 1050) {
                    // Remove only this abandoned stolen car from world
                    cars = cars.filter(c => c.id !== stolenCar.id);

                    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                        taxiManager.setMessage("A stolen car was found by police!", 180);
                    }
                }
            }
        }

        // Sync updated positions/list to local storage
        updateStolenCarsStorage();
    } else {
    // No stolen cars remain.
    // Only clear wanted status if the player is NOT currently being chased.
    if (player.wanted && !player.beingChased) {
        player.wanted = false;
        updateStolenCarsStorage();
    }
}
 // --- 3. Handle AngryDriver logic in updateGame ---
if (!isInsideHouse && angryDrivers.length > 0) {
    angryDrivers = angryDrivers.filter(driver => {
        driver.updateSpeech(dt);
        
        let caught = false;
        let isChasing = driver.update(dt, player, (caughtDriver) => {
            caught = true; // Flag that player was caught
            taxiManager.setMessage("The driver caught you and beat you up! (-40 HP)", 180);
            damagePlayer(40);

            if (playerCar) {
                if (typeof playerCar.stopSiren === 'function') {
                    playerCar.stopSiren();
                }
                let sideAngle = playerCar.angle - Math.PI;
                player.x = playerCar.x + Math.cos(sideAngle) * 35; 
                player.y = playerCar.y + Math.sin(sideAngle) * 35;

                if (caughtDriver.targetCar && playerCar.id === caughtDriver.targetCar.id) {
                    caughtDriver.targetCar.speed = caughtDriver.targetCar.baseSpeed * 1.5; 
                    caughtDriver.targetCar.recentlyJackedTimer = 240; 
                    caughtDriver.targetCar.isParked = false; 
                    caughtDriver.targetCar.hasDriver = true; 
                } else {
                    playerCar.isParked = true;
                    playerCar.hasDriver = false;

                    if (caughtDriver.targetCar && !caughtDriver.targetCar.hasDriver) {
                        caughtDriver.targetCar.speed = caughtDriver.targetCar.baseSpeed * 1.5;
                        caughtDriver.targetCar.recentlyJackedTimer = 240;
                        caughtDriver.targetCar.isParked = false;
                        caughtDriver.targetCar.hasDriver = true;
                    }
                }

                playerCar = null; 
                if (typeof exitBtn !== 'undefined' && exitBtn) exitBtn.style.display = 'none';
                if (typeof jackBtn !== 'undefined' && jackBtn) jackBtn.style.display = 'none';
            } else {
                if (caughtDriver.targetCar && !caughtDriver.targetCar.hasDriver) {
                    caughtDriver.targetCar.speed = caughtDriver.targetCar.baseSpeed * 1.5;
                    caughtDriver.targetCar.recentlyJackedTimer = 240;
                    caughtDriver.targetCar.isParked = false;
                    caughtDriver.targetCar.hasDriver = true;
                }
            }

            checkPlayerDeath();
        }, npcs, cars);

        // ONLY trigger wanted status if the player ESCAPED (gave up chasing and was not caught)
        if (!isChasing && !caught) {
            if (driver.targetCar) {
                driver.targetCar.isStolen = true;
            }
            player.wanted = true;
            localStorage.setItem("gma_player_wanted", "true");
            updateStolenCarsStorage();

            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                taxiManager.setMessage("Stolen car was reported to police", 180);
            }
        }

        return isChasing;
    });
}
   updatePoliceBullets(dt); 
            
    updatePoliceStage4A(dt, player, cars, npcs);
    
  // --- 0. CALCULATE PLAYER INPUT & MOVING STATE FIRST ---
  let inputX = 0, inputY = 0, isMoving = false;
      if (player.isBeingArrested) { isMoving = false;                                  }
  if (typeof joystickActive !== 'undefined' && joystickActive) {
    if (Math.sqrt(joystickInputX * joystickInputX + joystickInputY * joystickInputY) > 0.15) { 
       inputX = joystickInputX; inputY = joystickInputY; isMoving = true; 
    }
  } else if (typeof activeMoves !== 'undefined') {
    if (activeMoves.ArrowUp)    inputY = -1;
    if (activeMoves.ArrowDown)  inputY = 1;
    if (activeMoves.ArrowLeft)  inputX = -1;
    if (activeMoves.ArrowRight) inputX = 1;
    if (inputX !== 0 || inputY !== 0) isMoving = true;
  }
    
  // 1. Update global particles and tyre marks
  updateExhaustParticles(dt);
  updateDebrisParticles(dt);
  updateTyreMarks(dt);

  // 2. Track acceleration & generate smoke for player car
  if (playerCar) {
      playerCar.isAccelerating = isMoving;
      if (isMoving && Math.random() < 0.4) {
          emitExhaustSmoke(playerCar);
      }
      // Leave tyre marks when braking hard at high speed
      if (playerCar.speed > 1.2 && !isMoving) {
          addTyreMarks(playerCar);
      }
      // Update position memory every frame:
      playerCar.lastX = playerCar.x;
      playerCar.lastY = playerCar.y;
      playerCar.lastAngle = playerCar.angle;
  }

  // 3. Track acceleration & generate smoke for AI cars
  cars.forEach(car => {
      if (playerCar && car.id === playerCar.id) return;

      car.isAccelerating = (!car.isParked && car.speed < car.baseSpeed && car.health > 0);
      if (!car.isParked && car.speed > 0.2 && Math.random() < 0.25) {
          emitExhaustSmoke(car);
      }
  });
if (playerDamageVignette > 0) {
    playerDamageVignette -= 0.035 * dt;
    if (playerDamageVignette < 0) {
        playerDamageVignette = 0;
    }
}
  if (player.isInvulnerable) {
    player.invulnerabilityTimer -= 1 * dt;
    if (player.invulnerabilityTimer <= 0) player.isInvulnerable = false;
  }

  if (!player.isInvulnerable && player.health < player.maxHealth && player.health > 0) {
    player.health += 0.015 * dt; 
    if (player.health > player.maxHealth) player.health = player.maxHealth;

    if (Math.random() < 0.01) {
      localStorage.setItem("gma_player_health", player.health.toFixed(1));
    }
  }

  if (player.money >= 0 && player.rentDebtActive) {
      player.rentDebtActive = false;
  }

  if (!isInsideHouse && !isInsideDealership) {
     npcs.forEach(npc => npc.update(dt));

snapshotCarPositions();

cars.forEach(car => car.updateAI(dt, player, npcs, cars)); 

      // Update NPC-NPC Conversations
      updateNPCConversations(dt);

      taxiManager.update(dt, player, cars, npcs);
      truckManager.update(dt, player, cars);

      // --- POLICE SIREN SPATIAL AUDIO LOGIC ---
      cars.forEach(car => {
          if (car.isPolice) {
              // Automatically stop siren and clear audio if car is destroyed
              if (car.health <= 0 || car.exploded) {
                  if (car.sirenAudio) {
                      car.sirenAudio.pause();
                      car.sirenAudio = null;
                  }
                  car.sirenState = 0;
                  return;
              }

              if (car.sirenState !== 0) {
                  const targetUrl = car.sirenState === 1 ? sirenWailUrl : sirenYelpUrl;

                  // Instantiate audio if missing or state/URL changed
                  if (!car.sirenAudio) {
                      car.sirenAudio = new Audio(targetUrl);
                      car.sirenAudio.loop = true;
                  } else if (car.sirenAudio.src !== targetUrl) {
                      car.sirenAudio.pause();
                      car.sirenAudio = new Audio(targetUrl);
                      car.sirenAudio.loop = true;
                  }

                  const dx = player.x - car.x;
                  const dy = player.y - car.y;
                  const dist = Math.sqrt(dx * dx + dy * dy); 
                  const maxSirenDist = 600;

                  if (dist < maxSirenDist) {
                      const targetVolume = Math.max(0, 1 - (dist / maxSirenDist)); 
                      car.sirenAudio.volume = targetVolume; 
                      if (car.sirenAudio.paused) {
                          car.sirenAudio.play().catch(() => {}); 
                      }
                  } else {
                      car.sirenAudio.volume = 0;
                  }
              } else if (car.sirenAudio) {
                  car.sirenAudio.pause();
                  car.sirenAudio = null;
              }
          }
      });

cars.forEach(car => {
          if (car.crashCooldown > 0) car.crashCooldown -= dt;

          if (car.engineStartingTimer > 0) {
              car.engineStartingTimer -= dt;
          }

          // --- ENGINE HUMMING AUDIO LOGIC ---
          let isRunning = (car.health > 0 && !car.exploded) &&
                          ((playerCar && car.id === playerCar.id) || !car.isParked);
          let isStarting = car.engineStartingTimer && car.engineStartingTimer > 0;

          if (isRunning && !isStarting) {
              let dx = player.x - car.x;
              let dy = player.y - car.y;
              let dist = Math.sqrt(dx * dx + dy * dy);
              let maxHumDist = 400;

              if (dist < maxHumDist) {
                  if (!car.humAudio) {
                      car.humAudio = new Audio(engineHumUrl);
                      car.humAudio.loop = true;
                      car.humAudio.play().catch(() => {});
                  }
                  let vol = 0.9 * (1 - dist / maxHumDist);
                  car.humAudio.volume = Math.max(0, Math.min(1, vol));
              } else if (car.humAudio) {
                  car.humAudio.pause();
                  car.humAudio = null;
              }
          } else if (car.humAudio) {
              car.humAudio.pause();
              car.humAudio = null;
          }

          if (car.health <= 0 && !car.engineDeadPlayed && !car.exploded) {
              playSpatialSound(engineDeadPool, car.x, car.y, 0.8);
              car.engineDeadPlayed = true;
          } else if (car.health > 0) {
              car.engineDeadPlayed = false;
          }

          if (car.exploded) {
              let dist = Math.sqrt(Math.pow(player.x - car.x, 2) + Math.pow(player.y - car.y, 2));
              if (dist < 350) {
                  if (!car.fireAudio) {
                      car.fireAudio = new Audio(fireUrl);
                      car.fireAudio.loop = true;
                      car.fireAudio.volume = Math.max(0, 1 - (dist / 350));
                      car.fireAudio.play().catch(() => {});
                  } else {
                      car.fireAudio.volume = Math.max(0, 1 - (dist / 350));
                  }
              } else if (car.fireAudio) {
                  car.fireAudio.pause(); car.fireAudio = null;
              }
          } else if (car.fireAudio) {
              car.fireAudio.pause(); car.fireAudio = null;
          }
      });
  } else {
      cars.forEach(car => {
          if (car.humAudio) {
              car.humAudio.pause();
              car.humAudio = null;
          }
      });
      if (typeof taxiBtn !== 'undefined' && taxiBtn) taxiBtn.style.display = 'none';
      if (document.getElementById('truckBtn')) document.getElementById('truckBtn').style.display = 'none';
  }

  let distToRest = Math.sqrt(Math.pow(player.x - restaurantZone.x, 2) + Math.pow(player.y - restaurantZone.y, 2));
  if (restaurantBtn) restaurantBtn.style.display = (!isInsideHouse && !isInsideDealership && distToRest < restaurantZone.radius) ? 'flex' : 'none';

  if (!isInsideHouse && !isInsideDealership) {
      let distToRepair = Math.hypot(player.x - repairGarageZone.x, player.y - repairGarageZone.y);
      if (repairGarageBtn) {
          repairGarageBtn.style.display = (!playerCar && distToRepair < repairGarageZone.radius) ? 'flex' : 'none';
      }
      if (towTruckBtn) {
          towTruckBtn.style.display = playerCar ? 'flex' : 'none';
      }
  } else {
      if (repairGarageBtn) repairGarageBtn.style.display = 'none';
      if (towTruckBtn) towTruckBtn.style.display = 'none';
  }

  let distToBM = Math.sqrt(Math.pow(player.x - blackMarketZone.x, 2) + Math.pow(player.y - blackMarketZone.y, 2));
  let bmBtn = document.getElementById('blackMarketBtn');
  if (bmBtn) {
      bmBtn.style.display = (!isInsideHouse && !isInsideDealership && distToBM < blackMarketZone.radius && !playerCar) ? 'flex' : 'none';
  }

  if (!isInsideHouse && !isInsideDealership) {
      let distToDealer = Math.sqrt(Math.pow(player.x - dealershipZone.x, 2) + Math.pow(player.y - dealershipZone.y, 2));
      if (enterDealerBtn) enterDealerBtn.style.display = (distToDealer < dealershipZone.radius && !playerCar) ? 'flex' : 'none';
  } else if (isInsideDealership) {
      if (enterDealerBtn) enterDealerBtn.style.display = 'none';
      let dWidth = dealershipMapWidth > 0 ? dealershipMapWidth : 800;
      let dHeight = dealershipMapHeight > 0 ? dealershipMapHeight : 600;
      let distToDoor = Math.sqrt(Math.pow(player.x - (dWidth / 2), 2) + Math.pow(player.y - (dHeight - 50), 2));
      if (exitDealerBtn) exitDealerBtn.style.display = (distToDoor < 100) ? 'flex' : 'none';
  }

  if (!isInsideHouse) {
      let distToHome = Math.sqrt(Math.pow(player.x - homeZone.x, 2) + Math.pow(player.y - homeZone.y, 2));
      const canEnterOrRent = distToHome < homeZone.radius && !playerCar && !isInsideDealership &&
          (!player.isEvicted || player.money >= 80);
      if (enterHomeBtn) enterHomeBtn.style.display = canEnterOrRent ? 'flex' : 'none';
      if (leaveHomeBtn) leaveHomeBtn.style.display = (distToHome < homeZone.radius && !playerCar && !isInsideDealership && !player.isEvicted) ? 'flex' : 'none';

      if (sleepBtn) sleepBtn.style.display = 'none';
      if (exitHomeBtn) exitHomeBtn.style.display = 'none';
  } else {
      if (enterHomeBtn) enterHomeBtn.style.display = 'none';
      if (leaveHomeBtn) leaveHomeBtn.style.display = 'none';

      let hWidth = houseMapWidth > 0 ? houseMapWidth : 800;
      let hHeight = houseMapHeight > 0 ? houseMapHeight : 600;

      let distToBed = Math.sqrt(Math.pow(player.x - (hWidth / 2), 2) + Math.pow(player.y - 200, 2));
      if (sleepBtn) sleepBtn.style.display = (distToBed < 150) ? 'flex' : 'none';

      let distToDoor = Math.sqrt(Math.pow(player.x - (hWidth / 2), 2) + Math.pow(player.y - (hHeight - 120), 2));
      if (exitHomeBtn) exitHomeBtn.style.display = (distToDoor < 150) ? 'flex' : 'none';
  }

  let drainRate = 0.003; 
  if (isMoving) {
    drainRate = playerCar ? 0.005 : 0.006; 
  }

  player.hunger -= drainRate * dt;
  if (player.hunger < 0) player.hunger = 0;

  if (Math.random() < 0.01) {
    localStorage.setItem("gma_player_hunger", player.hunger.toFixed(1)); 
  }

    if (!playerCar) {
    let closestCar = null, minCarDist = 55; 

    if (isInsideDealership) {
        dealershipCars.forEach(car => {
            let dist = Math.sqrt(Math.pow(car.x - player.x, 2) + Math.pow(car.y - player.y, 2));
            if (dist < minCarDist) { minCarDist = dist; closestCar = car; }
        });
    } else if (!isInsideHouse) {
        cars.forEach(car => {
          if (car.recentlyJackedTimer > 0) return; 
          let dist = Math.sqrt(Math.pow(car.x - player.x, 2) + Math.pow(car.y - player.y, 2));
          if (dist < minCarDist) { minCarDist = dist; closestCar = car; }
        });
    }

      targetCar = closestCar;
        if (jackBtn) {
            jackBtn.style.display =
                (!player.isBeingArrested && targetCar && !targetCar.exploded)
                    ? 'flex'
                    : 'none';
        }
      if (exitBtn) exitBtn.style.display = 'none'; 
      if (typeof sirenBtn !== 'undefined' && sirenBtn) sirenBtn.style.display = 'none'; // Hide siren when on foot

  } else {
    if (exitBtn) {
    exitBtn.style.display =
        player.isBeingArrested ? 'none' : 'flex';
    }
    if (jackBtn) jackBtn.style.display = 'none';
   // Update siren button label and display status when driving
    if (typeof updateSirenButtonLabel === 'function') {
        if (playerCar && playerCar.isPolice) {
            repositionSirenButton(); // Keep alignment above exitBtn
        }
        updateSirenButtonLabel();
    }
    } 
if (player.isBeingArrested) {
    player.speed = 0;
} else if (playerCar) {
    if (isMoving) {
      let screenAngle = Math.atan2(inputY, inputX) + Math.PI / 2;
      let worldMoveAngle = screenAngle + camera.angle;
      let angleDiff = worldMoveAngle - playerCar.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      let hFactor = (playerCar.health > 0) ? Math.max(0.2, playerCar.health / playerCar.maxHealth) : 0;

      playerCar.angle += angleDiff * (0.06 * hFactor * dt);
      playerCar.speed += (0.08 * hFactor) * dt;

// Police bullet tire puncture.
// A punctured tire greatly reduces the car's maximum speed,
// but does not completely disable the vehicle.
const punctureSpeedMultiplier =
    playerCar.tirePunctured ? 0.38 : 3.0;

const maxPlayerCarSpeed =
    playerCar.baseSpeed * punctureSpeedMultiplier * hFactor;

if (playerCar.speed > maxPlayerCarSpeed) {
    playerCar.speed = maxPlayerCarSpeed;
}
if (playerCar.health <= 0) {
    playerCar.speed = 0;
}
      if (playerCar.health <= 0) playerCar.speed = 0; 

      camera.moveTimer += 1 * dt; camera.lastAngle = worldMoveAngle;
      if (camera.moveTimer > 60) camera.targetAngle = playerCar.angle;
    } else {
      playerCar.speed *= 0.92; camera.moveTimer = 0;
    }

    let nextX = playerCar.x + Math.cos(playerCar.angle - Math.PI / 2) * (playerCar.speed * dt);
    let nextY = playerCar.y + Math.sin(playerCar.angle - Math.PI / 2) * (playerCar.speed * dt);
    if (typeof isPlayerCarWalkable === 'function') {
        let hitWall = false;
        if (isPlayerCarWalkable(nextX, playerCar.y)) playerCar.x = nextX; else hitWall = true;
        if (isPlayerCarWalkable(playerCar.x, nextY)) playerCar.y = nextY; else hitWall = true;

        if (hitWall && playerCar.speed > 0.7) {
            if (!playerCar.crashCooldown || playerCar.crashCooldown <= 0) {
                playSpatialSound(carCrashPool, playerCar.x, playerCar.y, 1.0);
                playerCar.crashCooldown = 30;
            }
            playerCar.health = Math.max(0, playerCar.health - playerCar.speed * 3); 
            playerCar.speed *= 0.4; 
        }
    } else {
        playerCar.x = nextX;
        playerCar.y = nextY;
    }

    player.x = playerCar.x; player.y = playerCar.y;
    player.angle = playerCar.angle; player.speed = playerCar.speed;
  } else {
    let targetAngle = player.angle;
    if (isMoving) {
      let screenAngle = Math.atan2(inputY, inputX) + Math.PI / 2;
      targetAngle = screenAngle + camera.angle;
      let angleDiff = targetAngle - camera.lastAngle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      if (Math.abs(angleDiff) < 0.1) camera.moveTimer += 1 * dt;
      else camera.moveTimer = 0;

      camera.lastAngle = targetAngle;
      if (camera.moveTimer > 60) camera.targetAngle = targetAngle;
    } else {
      camera.moveTimer = 0;
    }

        if (isInsideDealership) {
        let dMaxX = dealershipMapWidth > 0 ? dealershipMapWidth - 40 : 760;
        let dMaxY = dealershipMapHeight > 0 ? dealershipMapHeight - 40 : 560;
        let moveSpeed = 3.5 * dt;

        if (isMoving) {
            let nextX = player.x + Math.cos(targetAngle - Math.PI / 2) * moveSpeed;
            let nextY = player.y + Math.sin(targetAngle - Math.PI / 2) * moveSpeed;
            player.x = Math.max(40, Math.min(nextX, dMaxX));
            player.y = Math.max(40, Math.min(nextY, dMaxY));
            player.angle = targetAngle;
            player.speed = 2.0;
            player.walkTimer += player.speed * dt * 0.12;
        } else {
            player.speed = 0;
        }
    } else {
            
        player.update(dt, isMoving, targetAngle);
    }
  }

  if (player.isArrestPassenger && camera.arrestFollowAngle !== null) {
    camera.angle = camera.arrestFollowAngle;
    camera.targetAngle = camera.arrestFollowAngle;
} else {
    let camDiff = camera.targetAngle - camera.angle;
    while (camDiff < -Math.PI) camDiff += Math.PI * 2;
    while (camDiff > Math.PI) camDiff -= Math.PI * 2;
    camera.angle += camDiff * (0.025 * dt);
  }

  handlePhysicsAndCollisions(dt);
  handleFootstepSound(player, true, dt);

  if (!isInsideHouse && !isInsideDealership) {
      npcs.forEach(npc => {
          handleFootstepSound(npc, false, dt);
      });
      angryDrivers.forEach(driver => {
          handleFootstepSound(driver, false, dt);
      });
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  if (typeof showFullMap !== 'undefined' && showFullMap) {
    ctx.fillStyle = "rgba(26, 26, 26, 0.95)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (mapImage.complete && mapWidth > 0) {
      const padding = 40;
      const scale = Math.min((canvas.width - padding * 2) / mapWidth, (canvas.height - padding * 2) / mapHeight);
      const fullW = mapWidth * scale, fullH = mapHeight * scale;
      const fullX = (canvas.width - fullW) / 2, fullY = (canvas.height - fullH) / 2;

      ctx.drawImage(mapImage, fullX, fullY, fullW, fullH);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 3; ctx.strokeRect(fullX, fullY, fullW, fullH);
        
        

      if (taxiManager.isJobActive && taxiManager.hasPassenger) {
        ctx.fillStyle = "#2ecc71"; 
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fullX + taxiManager.destinationX * scale, fullY + taxiManager.destinationY * scale, 12, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else if (taxiManager.isJobActive && !taxiManager.hasPassenger && taxiManager.pickupX !== 0) {
        ctx.fillStyle = "#f1c40f"; 
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fullX + taxiManager.pickupX * scale, fullY + taxiManager.pickupY * scale, 12, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else if (!taxiManager.isJobActive) {
        ctx.fillStyle = "#f1c40f";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fullX + taxiManager.depotX * scale, fullY + taxiManager.depotY * scale, 12, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }

      if (truckManager.isJobActive && truckManager.stage === 2) {
        ctx.fillStyle = "#2ecc71"; 
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(fullX + truckManager.destinationX * scale, fullY + truckManager.destinationY * scale, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (truckManager.isJobActive && truckManager.stage === 1) {
        ctx.fillStyle = "#e67e22"; 
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(fullX + truckManager.pickupX * scale, fullY + truckManager.pickupY * scale, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (!truckManager.isJobActive || truckManager.stage === 3) {
        ctx.fillStyle = "#e67e22";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(fullX + truckManager.companyX * scale, fullY + truckManager.companyY * scale, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      ctx.fillStyle = "#d35400";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + restaurantZone.x * scale, fullY + restaurantZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#3498db";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + homeZone.x * scale, fullY + homeZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#1abc9c";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + repairGarageZone.x * scale, fullY + repairGarageZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#8e44ad";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + blackMarketZone.x * scale, fullY + blackMarketZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#00bcd4";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + dealershipZone.x * scale, fullY + dealershipZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.save();
      if (isInsideHouse) {
          ctx.translate(fullX + (homeZone.x) * scale, fullY + (homeZone.y) * scale);
      } else if (isInsideDealership) {
          ctx.translate(fullX + (dealershipZone.x) * scale, fullY + (dealershipZone.y) * scale);
      } else {
          ctx.translate(fullX + (player.x + player.size / 2) * scale, fullY + (player.y + player.size / 2) * scale);
      }
      ctx.rotate(player.angle);
      ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-7, 7); ctx.lineTo(7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();

      const legendItems = [
        { color: "#f1c40f", label: "Taxi / Pickup" },
        { color: "#2ecc71", label: "Drop-off" },
        { color: "#e67e22", label: "Truck / Cargo" },
        { color: "#d35400", label: "Restaurant" },
        { color: "#3498db", label: "Home" },
        { color: "#8e44ad", label: "Black Market" },
        { color: "#00bcd4", label: "Car Dealership" },
        { color: "#1abc9c", label: "Repair Garage" },
        { color: "#f1c40f", label: "You", isTriangle: true },
      ];
      const lDot = 5;
      const lRowH = 20;
      const lPad = 8;
      const lW = 140;
      const lH = lPad * 2 + 16 + legendItems.length * lRowH;
      const lX = canvas.width - lW - 12;
      const lY = canvas.height / 2 - lH / 2;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.fillRect(lX, lY, lW, lH);
      ctx.strokeRect(lX, lY, lW, lH);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MAP LEGEND", lX + lW / 2, lY + lPad + 5);

      legendItems.forEach((item, i) => {
        const cy = lY + lPad + 18 + i * lRowH;
        const cx = lX + lPad + lDot;
        ctx.beginPath();
        if (item.isTriangle) {
          ctx.moveTo(cx, cy - lDot);
          ctx.lineTo(cx - lDot, cy + lDot);
          ctx.lineTo(cx + lDot, cy + lDot);
          ctx.closePath();
        } else {
          ctx.arc(cx, cy, lDot, 0, Math.PI * 2);
        }
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#cccccc";
        ctx.font = "10px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(item.label, cx + lDot + 6, cy);
      });
      ctx.restore();
    }

    ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
    ctx.fillRect(30, 30, 130, 45); ctx.strokeRect(30, 30, 130, 45);
    ctx.fillStyle = "#000000"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(" BACK", 30 + 130 / 2, 30 + 45 / 2);
    return; 
  }
  // Camera transform setup
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-camera.angle);
  const cameraTarget =
    player.isArrestPassenger &&
    arrestTransportCar
        ? arrestTransportCar
        : player;

ctx.translate(
    -cameraTarget.x - (cameraTarget.size || player.size) / 2,
    -cameraTarget.y - (cameraTarget.size || player.size) / 2
);

  // Map / Floor rendering
  if (isInsideHouse) {
      if (houseImage.complete && houseMapWidth > 0) ctx.drawImage(houseImage, 0, 0, houseMapWidth, houseMapHeight);
  } else if (isInsideDealership) {
      let dW = dealershipMapWidth || 800;
      let dH = dealershipMapHeight || 600;
      drawDealershipFloor(ctx, dW, dH);
  } else {
      if (mapImage.complete && mapWidth > 0) ctx.drawImage(mapImage, 0, 0, mapWidth, mapHeight);
      else { ctx.fillStyle = "#e0deca"; ctx.fillRect(player.x - 400, player.y - 400, 800, 800); }
  }

  if (!isInsideHouse && !isInsideDealership) {
      taxiManager.drawWorldMarkers(ctx);
      truckManager.drawWorldMarkers(ctx);
  }

  // 1. Draw tyre marks on the ground (underneath vehicles)
  drawTyreMarks(ctx);

  // Vehicles & Characters rendering ...
  if (isInsideDealership) {
      dealershipCars.forEach(car => car.draw(ctx));
  } else if (!isInsideHouse) {
      npcs.forEach(npc => {
    if (isEntityOnScreen(npc)) {
        npc.draw(ctx);
    }
});
      angryDrivers.forEach(driver => {
    if (isEntityOnScreen(driver)) {
        driver.draw(ctx);
    }
});
      cars.forEach(car => {
    if (isEntityOnScreen(car)) {
        car.draw(ctx);
    }
});
      drawPoliceBullets(ctx);
  }

  // 2. Draw exhaust smoke and flying debris
  drawExhaustParticles(ctx);
  drawDebrisParticles(ctx);

  ctx.restore();

  if (!playerCar && !player.isArrestPassenger) {
  player.draw(ctx, isInsideDealership ? 0 : camera.angle);
}

if (!isInsideHouse && !isInsideDealership && typeof drawNightOverlay === 'function') {
    drawNightOverlay();
}



if (!isInsideHouse && !isInsideDealership) {
    ctx.save();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-camera.angle);

    const lightCameraTarget =
        player.isArrestPassenger &&
        arrestTransportCar
            ? arrestTransportCar
            : player;

    ctx.translate(
        -lightCameraTarget.x -
            (lightCameraTarget.size || player.size) / 2,
        -lightCameraTarget.y -
            (lightCameraTarget.size || player.size) / 2
    );

    cars.forEach(car => {
        if (isEntityOnScreen(car)) {
            car.drawLights(ctx);
        }
    });

    ctx.restore();
    }

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 20, 150, 45);
  ctx.fillStyle = "#2ecc71";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`$${player.money}`, 35, 50);

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 200, 180, 25); 

  let hungerWidth = (player.hunger / 100) * 172;
  ctx.fillStyle = player.hunger < 25 ? "#e74c3c" : "#e67e22"; 
  ctx.fillRect(24, 204, Math.max(0, hungerWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HUNGER: ${Math.ceil(player.hunger)}%`, 110, 217);

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 230, 180, 25); 

  let healthWidth = (player.health / player.maxHealth) * 172;
  ctx.fillStyle = player.health < 30 ? "#c0392b" : "#e74c3c"; 
  ctx.fillRect(24, 234, Math.max(0, healthWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HEALTH: ${Math.ceil(player.health)}%`, 110, 247);

  taxiManager.drawUI(ctx);
  truckManager.drawUI(ctx); 
  if (typeof drawClock === 'function') drawClock();

if (player && player.wanted) {
    ctx.save();
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Drop shadow
    ctx.fillStyle = "#000000";
    ctx.fillText("⚠ WANTED ⚠", canvas.width / 2 + 2, 12);
    // Red text
    ctx.fillStyle = "#e74c3c";
    ctx.fillText("⚠ WANTED ⚠", canvas.width / 2, 10);
    ctx.restore();
}
    

  if (mapImage.complete && mapWidth > 0) {
    const radarRadius = 80, padding = 20, mmX = canvas.width - radarRadius - padding, mmY = radarRadius + padding, radarZoom = 0.12; 
    ctx.save();
    ctx.beginPath(); ctx.arc(mmX, mmY, radarRadius, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip(); 

    ctx.fillStyle = "#2c3e50"; ctx.fillRect(mmX - radarRadius, mmY - radarRadius, radarRadius * 2, radarRadius * 2);

    ctx.save();
    ctx.translate(mmX, mmY); ctx.scale(radarZoom, radarZoom); ctx.translate(-(player.x + player.size / 2), -(player.y + player.size / 2));
    ctx.globalAlpha = 0.9; 

    if (isInsideHouse) {
      if (houseImage.complete && houseMapWidth > 0) ctx.drawImage(houseImage, 0, 0, houseMapWidth, houseMapHeight);
    } else if (isInsideDealership) {
      let dW = dealershipMapWidth || 800;
      let dH = dealershipMapHeight || 600;

      drawDealershipFloor(ctx, dW, dH);
      dealershipCars.forEach(car => car.draw(ctx)); 
    }
    else if (mapImage.complete && mapWidth > 0) {
      ctx.drawImage(mapImage, 0, 0, mapWidth, mapHeight);
    } else { 
      ctx.fillStyle = "#e0deca"; 
      ctx.fillRect(player.x - 400, player.y - 400, 800, 800); 
    }

    if (taxiManager.isJobActive && taxiManager.hasPassenger) {
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(taxiManager.destinationX, taxiManager.destinationY, 35, 0, Math.PI * 2); ctx.fill();
    } else if (taxiManager.isJobActive && !taxiManager.hasPassenger && taxiManager.pickupX !== 0) {
      ctx.fillStyle = "#f1c40f"; 
      ctx.beginPath(); ctx.arc(taxiManager.pickupX, taxiManager.pickupY, 35, 0, Math.PI * 2); ctx.fill();
    } else if (!taxiManager.isJobActive) {
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath(); ctx.arc(taxiManager.depotX, taxiManager.depotY, 30, 0, Math.PI * 2); ctx.fill();
    } 

    if (truckManager.isJobActive && truckManager.stage === 2) {
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(truckManager.destinationX, truckManager.destinationY, 35, 0, Math.PI * 2); ctx.fill();
    } else if (truckManager.isJobActive && truckManager.stage === 1) {
      ctx.fillStyle = "#e67e22"; 
      ctx.beginPath(); ctx.arc(truckManager.pickupX, truckManager.pickupY, 35, 0, Math.PI * 2); ctx.fill();
    } else if (!truckManager.isJobActive || truckManager.stage === 3) {
      ctx.fillStyle = "#e67e22";
      ctx.beginPath(); ctx.arc(truckManager.companyX, truckManager.companyY, 30, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = "#d35400";
    ctx.beginPath();
    ctx.arc(restaurantZone.x, restaurantZone.y, 30, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#1abc9c";
    ctx.beginPath(); ctx.arc(repairGarageZone.x, repairGarageZone.y, 30, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#3498db";
    ctx.beginPath();
    ctx.arc(homeZone.x, homeZone.y, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8e44ad";
    ctx.beginPath();
    ctx.arc(blackMarketZone.x, blackMarketZone.y, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#00bcd4";
    ctx.beginPath();
    ctx.arc(dealershipZone.x, dealershipZone.y, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;

    ctx.restore(); 
    ctx.restore(); 

    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mmX, mmY, radarRadius, 0, Math.PI * 2); ctx.stroke();

    ctx.save();
    ctx.translate(mmX, mmY); ctx.rotate(player.angle); 
    ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-5, 5); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore(); 
  }
    if (playerDamageVignette > 0) {
    ctx.save();

    ctx.fillStyle = `rgba(255, 0, 0, ${0.35 * playerDamageVignette})`;
    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();
    }
}

let lastTime = 0;
function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let frameTime = timestamp - lastTime;
  lastTime = timestamp;

  let dt = frameTime / 16.666;
  if (dt > 4) dt = 4;

  updateGame(dt);
  drawGame();
  requestAnimationFrame(gameLoop);
}

const restaurantBtn = document.getElementById('restaurantBtn');

if (restaurantBtn) {
    restaurantBtn.addEventListener('click', () => {
      if (player.money >= restaurantZone.mealCost) {
        if (player.hunger >= 100 && player.health >= player.maxHealth) {
          taxiManager.setMessage("You are already fully healed and full!", 60);
          return;
        }
        player.money -= restaurantZone.mealCost;
        player.hunger = 100;
        player.health = Math.min(player.maxHealth, player.health + 40); 

        localStorage.setItem("gma_player_money", player.money);
        localStorage.setItem("gma_player_hunger", player.hunger);
        localStorage.setItem("gma_player_health", player.health);

        taxiManager.setMessage("Yum! Bought a burger meal. (Restored Hunger & Health)", 120);
      } else {
        taxiManager.setMessage("Not enough money for a meal!", 120);
      }
    });
}

// gameplay.js owns player-car persistence and spawning. Keep the game-loop
// startup here without duplicating that dealership state.
window.addEventListener('load', () => {
    requestAnimationFrame(gameLoop);
});

