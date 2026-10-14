console.log("ke00");
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
const npcHitUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/66f01202b08c57723436a17be8bbd267ea178cc0/punch.mp3";
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
// ===== MINIMAP STATIC MAP CACHE =====
// The world map never changes, so the minimap uses a small cached copy
// instead of resampling the full 4096x2286 map every frame.
const minimapMapCache = document.createElement("canvas");
const minimapMapCacheCtx = minimapMapCache.getContext("2d");

const MINIMAP_CACHE_WIDTH = 512;
let minimapCacheReady = false;

function buildMinimapMapCache() {
    if (!mapImage.complete || !mapImage.naturalWidth || !mapImage.naturalHeight) {
        return;
    }

    const aspectRatio = mapImage.naturalHeight / mapImage.naturalWidth;

    minimapMapCache.width = MINIMAP_CACHE_WIDTH;
    minimapMapCache.height = Math.max(
        1,
        Math.round(MINIMAP_CACHE_WIDTH * aspectRatio)
    );

    minimapMapCacheCtx.clearRect(
        0,
        0,
        minimapMapCache.width,
        minimapMapCache.height
    );

    minimapMapCacheCtx.drawImage(
        mapImage,
        0,
        0,
        minimapMapCache.width,
        minimapMapCache.height
    );

    minimapCacheReady = true;
}
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

    // Build the low-resolution static minimap copy once.
    buildMinimapMapCache();

    // Tell the loading screen that the visual map is ready.
    mapAssetLoaded = true;
    tryEnableStartButton();

    // Shadow lighting: analyse the map once, in the background, so entities can
    // be shaded while they stand in a detected shadow.
    if (window.ShadowLighting) ShadowLighting.start();
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
window.detectedBuildings = [];

const BUILDING_LIGHT_MIN_PIXELS = 12;

// ============================================================
// LOCATION BOARDS
// Important gameplay locations only.
// Home and all other locations are intentionally excluded.
// ============================================================

const locationBoardDefinitions = [
    {
        x: 2908,
        y: 950,
        text: "TAXI DEPOT"
    },
    {
        x: 2748,
        y: 295,
        text: "CAR DEALERSHIP"
    },
    {
        x: 3412,
        y: 1435,
        text: "BLACK MARKET"
    },
    {
        x: 2491,
        y: 2206,
        text: "TRUCK DEPOT"
    },
    {
        x: 1454,
        y: 765,
        text: "RESTAURANT"
    },
    {
        x: 869,
        y: 702,
        text: "REPAIR GARAGE"
    }
];

window.locationBoards = [];


// Find the detected building closest to a gameplay location.
function findNearestLocationBuilding(locationX, locationY) {
    const buildings = window.detectedBuildings || [];

    let nearest = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];

        const dx = building.centerX - locationX;
        const dy = building.centerY - locationY;
        const distance = Math.hypot(dx, dy);

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = building;
        }
    }

    return nearest;
}


// Determine whether the nearest road runs horizontally or vertically.
//
// The game currently uses cardinal road detection, so this deliberately
// keeps the sign aligned to the actual road rather than trying to invent
// arbitrary diagonal angles.
function getNearestRoadBoardAngle(x, y) {
    const maxSearchDistance = 350;
    const searchStep = 8;

    let bestRoadX = x;
    let bestRoadY = y;
    let bestDistance = Infinity;

    const directions = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
    ];

    for (let d = 0; d < directions.length; d++) {
        const dir = directions[d];

        for (
            let distance = searchStep;
            distance <= maxSearchDistance;
            distance += searchStep
        ) {
            const roadX = x + dir.dx * distance;
            const roadY = y + dir.dy * distance;

            if (typeof isRoadColor === "function" &&
                isRoadColor(roadX, roadY)) {

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestRoadX = roadX;
                    bestRoadY = roadY;
                }

                break;
            }
        }
    }

    if (bestDistance === Infinity) {
        return 0;
    }

    // Check the local road shape.
    const horizontalRoad =
        typeof isRoadColor === "function" &&
        isRoadColor(bestRoadX - 20, bestRoadY) &&
        isRoadColor(bestRoadX + 20, bestRoadY);

    const verticalRoad =
        typeof isRoadColor === "function" &&
        isRoadColor(bestRoadX, bestRoadY - 20) &&
        isRoadColor(bestRoadX, bestRoadY + 20);

    if (horizontalRoad && !verticalRoad) {
        return 0;
    }

    if (verticalRoad && !horizontalRoad) {
        return Math.PI / 2;
    }

    // If the road intersection is ambiguous, use the direction
    // from the building toward the nearest road.
    const dx = bestRoadX - x;
    const dy = bestRoadY - y;

    if (Math.abs(dx) > Math.abs(dy)) {
        return 0;
    }

    return Math.PI / 2;
}


// Resolve every gameplay location to its nearest detected building.
// This is called once after building detection, NOT every frame.
function generateLocationBoards() {
    window.locationBoards.length = 0;

    const buildings = window.detectedBuildings || [];

    if (!buildings.length) {
        console.warn("Location boards: no detected buildings available.");
        return;
    }

    for (let i = 0; i < locationBoardDefinitions.length; i++) {
        const location = locationBoardDefinitions[i];

        const building = findNearestLocationBuilding(
            location.x,
            location.y
        );

        if (!building) {
            console.warn(
                `Location board skipped: ${location.text}`
            );
            continue;
        }

        const buildingWidth =
            Math.max(20, building.maxX - building.minX);

        const buildingHeight =
            Math.max(20, building.maxY - building.minY);

        // Board size follows building size.
        const boardWidth = Math.max(
            90,
            Math.min(
                280,
                buildingWidth * 0.62
            )
        );

        const boardHeight = Math.max(
            28,
            Math.min(
                72,
                buildingHeight * 0.16
            )
        );

        const angle = getNearestRoadBoardAngle(
            building.centerX,
            building.centerY
        );

        // Put the board slightly toward the nearest gameplay location
        // so it sits on the relevant face of the building.
        let boardX = building.centerX;
        let boardY = building.centerY;

        const locationDX = location.x - building.centerX;
        const locationDY = location.y - building.centerY;
        const locationDistance = Math.hypot(
            locationDX,
            locationDY
        );

        if (locationDistance > 0) {
            boardX +=
                (locationDX / locationDistance) *
                Math.min(buildingWidth, buildingHeight) *
                0.22;

            boardY +=
                (locationDY / locationDistance) *
                Math.min(buildingWidth, buildingHeight) *
                0.22;
        }

        window.locationBoards.push({
            text: location.text,

            x: boardX,
            y: boardY,

            width: boardWidth,
            height: boardHeight,

            angle: angle,

            buildingWidth: buildingWidth,
            buildingHeight: buildingHeight
        });
    }

    console.log(
        `Location boards: generated ${window.locationBoards.length}`
    );
}


// Draw the physical board BEFORE the night overlay.
function drawLocationBoards(ctx) {
    const boards = window.locationBoards || [];

    if (!boards.length) return;

    for (let i = 0; i < boards.length; i++) {
        const board = boards[i];

        ctx.save();

        ctx.translate(board.x, board.y);
        ctx.rotate(board.angle);

        // Dark backing / wooden-metal board.
        ctx.fillStyle = "rgba(25, 25, 25, 0.96)";
        ctx.fillRect(
            -board.width / 2,
            -board.height / 2,
            board.width,
            board.height
        );

        ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
        ctx.lineWidth = 3;

        ctx.strokeRect(
            -board.width / 2,
            -board.height / 2,
            board.width,
            board.height
        );

        // Small mounting posts.
        const postHeight = Math.max(
            12,
            board.height * 0.55
        );

        ctx.fillStyle = "rgba(20, 20, 20, 0.95)";

        ctx.fillRect(
            -board.width * 0.30,
            board.height / 2,
            Math.max(4, board.height * 0.10),
            postHeight
        );

        ctx.fillRect(
            board.width * 0.20,
            board.height / 2,
            Math.max(4, board.height * 0.10),
            postHeight
        );

        ctx.restore();
    }
}


// Draw the lettering AFTER the night overlay.
// This deliberately makes the text remain bright at night.
function drawLocationBoardText(ctx) {
    const boards = window.locationBoards || [];

    if (!boards.length) return;

    const isNight =
        typeof ambientBrightness !== "undefined" &&
        ambientBrightness < 0.75;

    for (let i = 0; i < boards.length; i++) {
        const board = boards[i];

        ctx.save();

        ctx.translate(board.x, board.y);
        ctx.rotate(board.angle);

        const fontSize = Math.max(
            10,
            Math.min(
                24,
                board.height * 0.48
            )
        );

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${fontSize}px Arial`;

        if (isNight) {
            ctx.shadowColor = "rgba(255, 220, 90, 0.95)";
            ctx.shadowBlur = 12;
        } else {
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = isNight
            ? "#ffe66b"
            : "#ffffff";

        ctx.fillText(
            board.text,
            0,
            0
        );

        ctx.restore();
    }
}
// ============================================================
// BUILDING LIGHT SEQUENCING
// Lights turn on/off one at a time every 0.5 real seconds.
// ============================================================

let buildingLightsMode = "day";
let buildingLightsSequence = [];
let buildingLightsSequenceIndex = 0;
let buildingLightsLastActionTime = 0;

const BUILDING_LIGHT_INTERVAL = 500; // 0.5 real seconds

function shuffleBuildingLights() {
    const lights = window.buildingLightShapes || [];

    buildingLightsSequence = lights.slice();

    // Fisher-Yates shuffle
    for (let i = buildingLightsSequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        const temp = buildingLightsSequence[i];
        buildingLightsSequence[i] = buildingLightsSequence[j];
        buildingLightsSequence[j] = temp;
    }

    buildingLightsSequenceIndex = 0;
}

function startBuildingLightsOn() {
    const lights = window.buildingLightShapes || [];

    if (lights.length === 0) return;

    shuffleBuildingLights();

    buildingLightsMode = "turningOn";
    buildingLightsLastActionTime = performance.now();

    // Start with one light immediately at 8 PM.
    const firstLight = buildingLightsSequence[0];

    if (firstLight) {
        firstLight.enabled = true;
        buildingLightsSequenceIndex = 1;
    }
}

function startBuildingLightsOff() {
    const lights = window.buildingLightShapes || [];

    if (lights.length === 0) return;

    shuffleBuildingLights();

    buildingLightsMode = "turningOff";
    buildingLightsLastActionTime = performance.now();

    // Start with one light immediately at 5 AM.
    const firstLight = buildingLightsSequence[0];

    if (firstLight) {
        firstLight.enabled = false;
        buildingLightsSequenceIndex = 1;
    }
}

function updateBuildingLightSequence() {
    const lights = window.buildingLightShapes || [];

    if (lights.length === 0) return;

    const currentHour = (gameSeconds / DAY_LENGTH) * 24;


    // Past 10 PM, including the after-midnight part of the same night,
    // immediately turn every remaining light ON.
    if (currentHour >= 22 || currentHour < 5) {
        for (let i = 0; i < lights.length; i++) {
            lights[i].enabled = true;
        }

        buildingLightsMode = "night";
        buildingLightsSequenceIndex = lights.length;
        return;
    }

    // Existing 20:00 → 22:00 sequential light sequence continues below...

    const now = performance.now();

    if (
        buildingLightsMode === "turningOn" &&
        buildingLightsSequenceIndex < buildingLightsSequence.length
    ) {
        if (now - buildingLightsLastActionTime >= BUILDING_LIGHT_INTERVAL) {
            const light =
                buildingLightsSequence[buildingLightsSequenceIndex];

            if (light) {
                light.enabled = true;
            }

            buildingLightsSequenceIndex++;
            buildingLightsLastActionTime = now;
        }

        return;
    }

    if (
        buildingLightsMode === "turningOff" &&
        buildingLightsSequenceIndex < buildingLightsSequence.length
    ) {
        if (now - buildingLightsLastActionTime >= BUILDING_LIGHT_INTERVAL) {
            const light =
                buildingLightsSequence[buildingLightsSequenceIndex];

            if (light) {
                light.enabled = false;
            }

            buildingLightsSequenceIndex++;
            buildingLightsLastActionTime = now;
        }

        return;
    }

    // Sequence finished.
    if (
        buildingLightsMode === "turningOn" &&
        buildingLightsSequenceIndex >= buildingLightsSequence.length
    ) {
        buildingLightsMode = "night";
    }

    if (
        buildingLightsMode === "turningOff" &&
        buildingLightsSequenceIndex >= buildingLightsSequence.length
    ) {
        buildingLightsMode = "day";
    }
}
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
// --------------------------------------------------------
// Save this detected building for gameplay location boards.
// One connected yellow region = one building.
// --------------------------------------------------------

const buildingMinX = minX * scaleX;
const buildingMaxX = (maxX + 1) * scaleX;
const buildingMinY = minY * scaleY;
const buildingMaxY = (maxY + 1) * scaleY;

window.detectedBuildings.push({
    minX: buildingMinX,
    maxX: buildingMaxX,
    minY: buildingMinY,
    maxY: buildingMaxY,

    centerX: (buildingMinX + buildingMaxX) * 0.5,
    centerY: (buildingMinY + buildingMaxY) * 0.5,

    width: buildingMaxX - buildingMinX,
    height: buildingMaxY - buildingMinY,

    area: area
});

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
// Ensures light only shines straight North, South, East, or West
const isStrictCardinal = 
    Math.abs(normal.x) < 0.35 || Math.abs(normal.y) < 0.35;

if (!isStrictCardinal) {
    continue; // Skip diagonal/corner light placements
}
            

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
    baseWidth,

    // Lights begin off and are enabled by the day/night sequence.
    enabled: false
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

    const collisionCtx = collisionCanvas.getContext("2d", {
        alpha: false
    });
    collisionCtx.imageSmoothingEnabled = false;
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
    // ===== Collision map speck repair =====
    // CollisionMap2.png contains ~24,000 tiny isolated BLOCKED pixel clusters
    // (1-24 px: dark outline noise, olive/blue-grey blends). Many sit inside roads
    // and along road edges. A vehicle footprint test samples ~9 points, so a single
    // stray pixel rejects the move and the car "sticks".
    //
    // Run ONCE after getImageData() and BEFORE navigationSystem.buildGrid().
    // It repaints every tiny blocked cluster with the colour of its surrounding
    // walkable terrain, so every existing function (isPlayerCarWalkable,
    // isAICarWalkable, navigation grid, ...) keeps working unchanged.
    //
    // getTerrainType is the existing classifier from important.js.
    function repairCollisionSpecks(data, w, h, maxSpeckSize = 24) {
        const total = w * h;
        const BLOCKED = 0;
        const type = new Uint8Array(total); // 0 blocked, 1 road, 2 grass, 3 transition
        let lastKey = -1, lastType = BLOCKED; // map is made of flat colour runs
        for (let i = 0, p = 0; i < total; i++, p += 4) {
            const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
            if (key !== lastKey) {
                const t = getTerrainType(data[p], data[p + 1], data[p + 2]);
                lastType = t === "ROAD" ? 1 : t === "GRASS" ? 2 : t === "TRANSITION" ? 3 : BLOCKED;
                lastKey = key;
            }
            type[i] = lastType;
        }

        const seen = new Uint8Array(total);
        const stack = [];                       // frontier only; stays small
        const comp = new Int32Array(maxSpeckSize + 1);
        let repaired = 0, clusters = 0;

        for (let start = 0; start < total; start++) {
            if (type[start] !== BLOCKED || seen[start]) continue;

            // Flood fill the WHOLE cluster (8-connected) so big objects such as
            // buildings, trees and the river are fully marked and never revisited.
            let n = 0, touchesEdge = false;
            stack.push(start); seen[start] = 1;
            while (stack.length > 0) {
                const idx = stack.pop();
                if (n <= maxSpeckSize) comp[n] = idx;
                n++;
                const x = idx % w, y = (idx - x) / w;
                if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy; if (ny < 0 || ny >= h) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx; if (nx < 0 || nx >= w) continue;
                        const ni = ny * w + nx;
                        if (type[ni] === BLOCKED && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
                    }
                }
            }
            if (n > maxSpeckSize) continue;      // real object, leave untouched
            if (touchesEdge || n === 0) continue;
            clusters++;

            // vote on the surrounding walkable terrain (ring of the cluster)
            const votes = [0, 0, 0, 0], src = [-1, -1, -1, -1];
            for (let k = 0; k < n; k++) {
                const idx = comp[k], x = idx % w, y = (idx - x) / w;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const ni = (y + dy) * w + (x + dx);
                    const t = type[ni];
                    if (t !== BLOCKED) { votes[t]++; if (src[t] < 0) src[t] = ni; }
                }
            }
            let best = 1;
            for (let t = 2; t <= 3; t++) if (votes[t] > votes[best]) best = t;
            if (votes[best] === 0) continue;
            const sp4 = src[best] * 4;
            const r = data[sp4], g = data[sp4 + 1], b = data[sp4 + 2];
            for (let k = 0; k < n; k++) {
                const p = comp[k] * 4;
                data[p] = r; data[p + 1] = g; data[p + 2] = b;
                repaired++;
            }
        }
        console.log(`Collision speck repair: ${clusters} clusters, ${repaired} pixels repainted.`);
        return repaired;
    }
    window.collisionData = collisionData;

    //do not touch
repairCollisionSpecks(collisionData, mapWidth, mapHeight);
    navigationSystem.buildGrid();
    //end of do not touch

    // Detect buildings and calculate their light positions
    // exactly once when CollisionMap2 is loaded.
    generateBuildingLightShapes();
generateLocationBoards();
    collisionMapAssetLoaded = true;
    tryEnableStartButton();
    if (typeof initSpawns === "function") {
    initSpawns();
    }
});

collisionMapImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/CollisionMap2.png";

let camera = {
    angle: 0,
    targetAngle: 0,
    moveTimer: 0,
    lastAngle: 0,
    passengerFollowAngle: null
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
const collisionNearbyCache = new Map();
const COLLISION_CELL_SIZE = 80;

function getCollisionCell(x, y) {
    return `${Math.floor(x / COLLISION_CELL_SIZE)},${Math.floor(y / COLLISION_CELL_SIZE)}`;
}

function buildCollisionGrid() {
    collisionGrid.clear();
    collisionNearbyCache.clear();

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
    const cachedNearby = collisionNearbyCache.get(entity);
    if (cachedNearby) {
        return cachedNearby;
    }

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

    collisionNearbyCache.set(entity, nearby);
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

            let r1 = Math.max(c1.width || 16, c1.length || 28) * 0.5;
            let r2 = Math.max(c2.width || 16, c2.length || 28) * 0.5;
            let combinedRadius = r1 + r2;

            if (distSq < combinedRadius * combinedRadius) {
              let dist = Math.sqrt(distSq);

              if (dist === 0) {
                dx = 1;
                dy = 0;
                dist = 1;
              }

              let overlap = combinedRadius - dist;
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

            const playerRaceCollisionDamageDisabled =
              isPlayerInvolved &&
              typeof window.raceEventManager !== "undefined" &&
              window.raceEventManager &&
              window.raceEventManager.state === "RACING" &&
              window.raceEventManager.playerJoined;

            if (
              isPlayerInvolved &&
              !playerRaceCollisionDamageDisabled
            ) {
              let dmg1 = relSpeed * 5 * (c2.weightMultiplier || 1.0);
              let dmg2 = relSpeed * 5 * (c1.weightMultiplier || 1.0);
              let stolenCarStateChanged = false;

              if (c1.health > 0) {
                const previousHealth = c1.health;
                c1.health = Math.max(0, c1.health - dmg1);
                stolenCarStateChanged =
                  stolenCarStateChanged ||
                  (c1.isStolen && c1.health !== previousHealth);
              }

              if (c2.health > 0) {
                const previousHealth = c2.health;
                c2.health = Math.max(0, c2.health - dmg2);
                stolenCarStateChanged =
                  stolenCarStateChanged ||
                  (c2.isStolen && c2.health !== previousHealth);
              }

              if (stolenCarStateChanged) {
                updateStolenCarsStorage(true);
              }
            }
          let tryExplode = (car, strikingCar, speed) => {

    // Remember whether this car had a driver BEFORE
    // the explosion removes the driver.
    const hadDriverBeforeExplosion =
        Boolean(car.hasDriver);

    const wasPlayerAttack =
        typeof playerCar !== 'undefined' &&
        playerCar &&
        strikingCar &&
        strikingCar.id === playerCar.id;

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

              if (car.isStolen) {
                updateStolenCarsStorage(true);
              }
        // ------------------------------------------------------------
// PLAYER BLASTED A CAR WITH A DRIVER


if (
    wasPlayerAttack &&
    hadDriverBeforeExplosion &&
    car.id !== playerCar.id
) {
    registerHitRunIncident(
        "CAR",
        car.x,
        car.y,
        car.id
    );
}

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

            let carRadius = Math.max(car.width || 16, car.length || 28) * 0.5;
            let minDist = carRadius + (player.size || 20) * 0.5;
            if (dist < minDist) {
              if (dist === 0) { dx = 1; dy = 0; dist = 1; }
              let overlap = minDist - dist, nx = dx / dist, ny = dy / dist;
              let targetX = player.x + nx * overlap, targetY = player.y + ny * overlap;
              if (typeof isWalkableColor === 'function') {
                  if (isWalkableColor(targetX, player.y, player.size)) player.x = targetX;
                  if (isWalkableColor(player.x, targetY, player.size)) player.y = targetY;
              }


        if (
    !playerCar &&
    !player.isArrestPassenger &&
    !player.isInvulnerable &&
    car.hasDriver &&
    car.health > 0 &&
    !car.exploded &&
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

          let carRadius = Math.max(car.width || 16, car.length || 28) * 0.5
          let minDist = carRadius + (npc.size || 20) * 0.5;

          if (dist < minDist) {
            if ((!car.crashCooldown || car.crashCooldown <= 0) && car.health > 0 && !car.exploded) {
              playSpatialSound(carCrashPool, car.x, car.y, 0.6);
              car.crashCooldown = 30;
            }
            if (dist === 0) { dx = 1; dy = 0; dist = 1; }
            let overlap = minDist - dist, nx = dx / dist, ny = dy / dist;
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
      
// NPC VS PLAYER CAR
      cars.forEach(car => {
          if (!playerCar || car.id !== playerCar.id) return;

          npcs.forEach(npc => {
              if (!npc) return;

              let dx = npc.x - car.x;
              let dy = npc.y - car.y;
              let dist = Math.hypot(dx, dy);

              let carRadius = Math.max(car.width || 16, car.length || 28) * 0.5;
              let minDist = carRadius + (npc.size || 20) * 0.5 + 4;

              if (dist >= minDist) return;
              // ... hit and run trigger logic


        if (
            !npc.isInjured &&
            car.health > 0 &&
            !car.exploded &&
            Math.abs(car.speed) > 2.5
        ) {
            npc.isInjured = true;
            npc.speed = 0;
            npc.inConversation = false;
            npc.speechText = null;
            npc.speechTimer = 0;

            // Stop all normal pedestrian movement.
            npc.changeDirTimer = 999999;
            npc.fleeTimer = 0;

        registerHitRunIncident(
                "NPC",
                npc.x,
                npc.y,
                npc.id
            );

            playSpatialSound(
                npcHitPool,
                npc.x,
                npc.y,
                1.0
            );

            return;
        }

        // ----------------------------------------------------
        // NORMAL SMALL BUMP
        // Existing reaction remains unchanged.
        // ----------------------------------------------------

        if (
            !npc.isInjured &&
            Math.random() < 0.3 &&
            !npc.speechText
        ) {
            const lines = [
                "Are you blind!",
                "Idiot!",
                "Watch out!",
                "Crazy driver!"
            ];

            npc.say(
                lines[Math.floor(Math.random() * lines.length)],
                90
            );
        }
    });
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
let stolenCarsStorageLastWrite = -Infinity;
let stolenCarsStorageNeedsCleanup = true;
const STOLEN_CARS_STORAGE_INTERVAL = 500;

function updateStolenCarsStorage(forceWrite = false) {
    const stolenCars = cars.filter(c => c && c.isStolen);

    if (stolenCars.length > 0) {
        const now = performance.now();

        // localStorage is synchronous. Avoid serializing and writing moving
        // stolen cars every animation frame while keeping state fresh.
        if (
            !forceWrite &&
            now - stolenCarsStorageLastWrite < STOLEN_CARS_STORAGE_INTERVAL
        ) {
            return;
        }

        const stolenDataList = stolenCars.map(c => ({
            id: c.id,
            x: c.x,
            y: c.y,
            color: c.color,
            type: c.type,
            angle: c.angle,
            isPolice: Boolean(c.isPolice),
            health: c.health,
            exploded: Boolean(c.exploded)
        }));

        localStorage.setItem(
            "stolen_cars",
            JSON.stringify(stolenDataList)
        );
        stolenCarsStorageLastWrite = now;
        stolenCarsStorageNeedsCleanup = true;

        return;
    }

    // No stolen cars remain.
    if (stolenCarsStorageNeedsCleanup) {
        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car");
        stolenCarsStorageNeedsCleanup = false;
    }

    // A stolen-car crime is now gone.
    // Keep the player wanted only if another crime still exists
    // or police are actively chasing the player.
  const hasHitRunCase =
    typeof playerHitRunCases !== "undefined" &&
    playerHitRunCases > 0;

const hasAssaultCase =
    typeof playerAssaultCases !== "undefined" &&
    playerAssaultCases > 0;

    if (
        player.wanted &&
    !player.beingChased &&
    !hasHitRunCase &&
    !hasAssaultCase
) {
    player.wanted = false;
    player.beingChased = false;
    localStorage.setItem(
        "gma_player_wanted",
        "false"
    );
}  
}
// ============================================================
// PUNCH / BASIC MELEE COMBAT
// Foundation only: no NPC reactions or crime logic yet.
// ============================================================

const punchBtn = document.getElementById("punchBtn");

const PUNCH_RANGE = 48;
const PUNCH_COOLDOWN = 14;
const PUNCH_KNOCKBACK = 6;

function getPunchTarget() {
    if (
        !player ||
        playerCar ||
        player.isBeingArrested ||
        isInsideHouse ||
        isInsideDealership
    ) {
        return null;
    }

    let closestNPC = null;
    let closestDistance = PUNCH_RANGE;

    const forwardX = Math.cos(player.angle - Math.PI / 2);
    const forwardY = Math.sin(player.angle - Math.PI / 2);

    for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];

        if (!npc) continue;
        if (npc.isPassenger) continue;
        if (npc.isPolice) continue;
        if (npc.isInjured) continue;

        const dx = npc.x - player.x;
        const dy = npc.y - player.y;
        const distance = Math.hypot(dx, dy);

        if (distance > PUNCH_RANGE || distance === 0) {
            continue;
        }

        // NPC must be roughly in front of the player.
        const dot =
            (dx / distance) * forwardX +
            (dy / distance) * forwardY;

        if (dot < 0.15) continue;

        if (distance < closestDistance) {
            closestDistance = distance;
            closestNPC = npc;
        }
    }

    return closestNPC;
}
// ============================================================
// ASSAULT WITNESS / REPORTING SYSTEM
// ============================================================
//
// Combat itself does NOT register crime.
//
// Flow:
//
// PLAYER PUNCH
//      |
//      +--> police witness
//      |       |
//      |       +--> first incident: warn both, no crime
//      |       |
//      |       +--> another punch: assault crime
//      |
//      +--> civilian witnesses
//      |       |
//      |       +--> 40% calls police
//      |       |
//      |       +--> 60% flees
//      |
//      +--> punched NPC flees
//              |
//              +--> player gets 320px away
//                      |
//                      +--> 45% base reporting chance
//                           + witness bonus
//
// Police officers are never valid punch targets.
// ============================================================

const assaultEncounters = [];
let activeAssaultPoliceResponse = null;

const ASSAULT_WITNESS_DISTANCE = 180;
const ASSAULT_POLICE_WITNESS_DISTANCE = 220;
const ASSAULT_POLICE_WARNING_DISTANCE = 55;
const ASSAULT_FLEE_ESCAPE_DISTANCE = 320;

function getAssaultEncounter(target) {
    if (!target) return null;

    let encounter = assaultEncounters.find(
        e => e.target === target
    );

    if (!encounter) {
        encounter = {
            target: target,
            sceneX: target.x,
            sceneY: target.y,
            npcWitnesses: [],
            policeWitness: null,
            policeWitnessCar: null,
            policeWarningActive: false,
            policeResponseStarted: false,
            fleeReportChecked: false,
            resolved: false
        };

        assaultEncounters.push(encounter);
    }

    return encounter;
}

function removeAssaultEncounter(target) {
    for (let i = assaultEncounters.length - 1; i >= 0; i--) {
        if (assaultEncounters[i].target === target) {
            assaultEncounters.splice(i, 1);
        }
    }
}

function resetNPCCombatAfterPoliceWarning(target) {
    if (!target) return;

    target.isFightingBack = false;
    target.fightTimer = 0;
    target.fightPath = [];
    target.fightPathIndex = 0;
    target.fightRepathTimer = 0;

    target.fleeTimer = 0;
    target.fleePath = [];
    target.fleePathIndex = 0;
    target.fleePathRepathTimer = 0;

    target.speed = 0;
    target.changeDirTimer = 60;

    target.inConversation = false;
    target.speechTimer = 0;
    target.speechText = null;
}

function makePoliceOfficerWitness(officer, encounter) {
    if (!officer || !encounter) return;

    encounter.policeWitness = officer;
    encounter.policeWarningActive = true;

    officer.policeState = "ASSAULT_WITNESS";
    officer.assaultEncounter = encounter;
    officer.assaultPath = [];
    officer.assaultPathIndex = 0;
    officer.assaultRepathTimer = 0;
    officer.speed = 0;

    resetNPCCombatAfterPoliceWarning(
        encounter.target
    );

    officer.say(
        "Stop fighting!",
        150
    );

    encounter.target.say(
        "Alright!",
        100
    );

    if (
        typeof taxiManager !== "undefined" &&
        taxiManager.setMessage
    ) {
        taxiManager.setMessage(
            "Police: Stop fighting!",
            150
        );
    }
}

function setPoliceWarningForAssault(officer, target) {
    if (!officer) return;

    if (
        typeof registerAssaultCrime === "function"
    ) {
        registerAssaultCrime(target);
    }

    resetNPCCombatAfterPoliceWarning(target);

    officer.policeState = "WARNING";
    officer.warningTimer = 480;
    officer.graceTimer = 60;
    officer.saidStepOut = false;
    officer.saidArrested = false;
    officer.speed = 0;

    if (
        typeof officer.say === "function"
    ) {
        officer.say(
            "Stop! Police!",
            150
        );
    }

    if (
        typeof taxiManager !== "undefined" &&
        taxiManager.setMessage
    ) {
        taxiManager.setMessage(
            "Assault reported! Police are stopping you.",
            180
        );
    }
}

function getNearbyAssaultPolice(target) {
    if (!target) return null;

    // First check on-foot officers.
    for (let i = 0; i < npcs.length; i++) {
        const officer = npcs[i];

        if (
            !officer ||
            !officer.isPolice ||
            officer.isInjured ||
            officer.policeState === "ARRESTING"
        ) {
            continue;
        }

        const distance = Math.hypot(
            officer.x - target.x,
            officer.y - target.y
        );

        if (
            distance <=
            ASSAULT_POLICE_WITNESS_DISTANCE
        ) {
            return {
                type: "OFFICER",
                unit: officer
            };
        }
    }

    // Then check police cars with an officer inside.
    for (let i = 0; i < cars.length; i++) {
        const car = cars[i];

        if (
            !car ||
            !car.isPolice ||
            !car.hasDriver ||
            car.exploded ||
            car.health <= 0 ||
            car === playerCar
        ) {
            continue;
        }

        const distance = Math.hypot(
            car.x - target.x,
            car.y - target.y
        );

        if (
            distance <=
            ASSAULT_POLICE_WITNESS_DISTANCE
        ) {
            return {
                type: "POLICE_CAR",
                unit: car
            };
        }
    }

    return null;
}

function getCivilianAssaultWitnesses(target) {
    const witnesses = [];

    if (!target) return witnesses;

    const centerX =
        (target.x + player.x) * 0.5;

    const centerY =
        (target.y + player.y) * 0.5;

    for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];

        if (
            !npc ||
            npc === target ||
            npc.isPolice ||
            npc.isPassenger ||
            npc.isInjured
        ) {
            continue;
        }

        const distance = Math.hypot(
            npc.x - centerX,
            npc.y - centerY
        );

        if (
            distance <=
            ASSAULT_WITNESS_DISTANCE
        ) {
            witnesses.push(npc);
        }
    }

    return witnesses;
}

function getAssaultReportChance(
    witnessCount
) {
    // Base chance = 45%.
    // Each additional civilian witness adds 10%.
    // Maximum = 85%.
    return Math.min(
        0.85,
        0.45 +
        Math.max(0, witnessCount - 1) * 0.10
    );
}

function spawnAssaultPoliceResponse(
    encounter,
    caller
) {
    if (
        !encounter ||
        !caller ||
        activeAssaultPoliceResponse
    ) {
        return;
    }

    const spawn =
        typeof getArrestSpawnPosition ===
        "function"
            ? getArrestSpawnPosition()
            : {
                x: player.x + 500,
                y: player.y
            };

    const id =
        Date.now() +
        810000 +
        Math.floor(
            Math.random() * 10000
        );

    const policeCar = new Car(
        id,
        spawn.x,
        spawn.y,
        "#111111",
        true
    );

    policeCar.isPolice = true;
    policeCar.ownerType = "police";
    policeCar.type =
        "Commuter, Sedan";

    policeCar.width = 16;
    policeCar.length = 28;
    policeCar.baseSpeed = 3.2;
    policeCar.speed = 3.2;

    policeCar.isParked = false;
    policeCar.hasDriver = true;

    policeCar.policeState =
        "ASSAULT_RESPONSE";

    policeCar.assaultResponseTarget =
        encounter.target;

    policeCar.assaultResponseX =
        caller.x;

    policeCar.assaultResponseY =
        caller.y;

    policeCar.arrestTransportPath = null;
    policeCar.arrestTransportPathIndex = 1;
    policeCar.arrestTransportRepathTimer = 0;

    if (
        typeof policeCar.playSiren ===
        "function"
    ) {
        policeCar.playSiren(2);
    } else {
        policeCar.sirenState = 2;
    }

    cars.push(policeCar);

    activeAssaultPoliceResponse = {
        car: policeCar,
        encounter: encounter
    };

    encounter.policeResponseStarted = true;

    if (
        typeof taxiManager !== "undefined" &&
        taxiManager.setMessage
    ) {
        taxiManager.setMessage(
            "Someone called the police!",
            180
        );
    }
}

function createOfficerFromPoliceCar(
    policeCar,
    encounter
) {
    if (
        !policeCar ||
        !encounter
    ) {
        return null;
    }

    policeCar.speed = 0;
    policeCar.isParked = true;
    policeCar.hasDriver = false;

    if (
        typeof policeCar.stopSiren ===
        "function"
    ) {
        policeCar.stopSiren();
    } else {
        policeCar.sirenState = 0;
    }

    const officer = new NPC(
        Date.now() +
        Math.floor(Math.random() * 10000),
        policeCar.x,
        policeCar.y,
        "#0b1d3a",
        "#2d3436",
        "#ffdbac",
        true
    );

    officer.isPolice = true;
    officer.policeState =
        "ASSAULT_WITNESS";

    officer.assaultWitnessCar =
        policeCar;

    officer.assaultEncounter =
        encounter;

    officer.assaultPath = [];
    officer.assaultPathIndex = 0;
    officer.assaultRepathTimer = 0;

    policeCar.assaultWitnessOfficer =
        officer;

    npcs.push(officer);

    encounter.policeWitness =
        officer;

    encounter.policeWitnessCar =
        policeCar;

    return officer;
}

function moveAssaultWitnessOfficer(
    officer,
    targetX,
    targetY,
    dt
) {
    if (!officer) return;

    if (!officer.assaultPath) {
        officer.assaultPath = [];
        officer.assaultPathIndex = 0;
        officer.assaultRepathTimer = 0;
    }

    officer.assaultRepathTimer -= dt;

    if (
        officer.assaultRepathTimer <= 0 ||
        officer.assaultPathIndex >=
        officer.assaultPath.length
    ) {
        officer.assaultPath =
            typeof findNPCReactionPath ===
            "function"
                ? findNPCReactionPath(
                    officer.x,
                    officer.y,
                    targetX,
                    targetY,
                    true
                )
                : [];

        officer.assaultPathIndex = 0;
        officer.assaultRepathTimer = 30;
    }

    let moveAngle =
        Math.atan2(
            targetY - officer.y,
            targetX - officer.x
        );

    if (
        officer.assaultPath &&
        officer.assaultPathIndex <
        officer.assaultPath.length
    ) {
        const waypoint =
            officer.assaultPath[
                officer.assaultPathIndex
            ];

        if (waypoint) {
            const dx =
                waypoint.x - officer.x;
            const dy =
                waypoint.y - officer.y;

            const distance =
                Math.hypot(dx, dy);

            if (distance < 10) {
                officer.assaultPathIndex++;
            } else {
                moveAngle =
                    Math.atan2(dy, dx);
            }
        }
    }

    officer.angle =
        moveAngle + Math.PI / 2;

    const speed = 1.6;

    const nextX =
        officer.x +
        Math.cos(moveAngle) *
        speed *
        dt;

    const nextY =
        officer.y +
        Math.sin(moveAngle) *
        speed *
        dt;

    if (
        typeof isGrassOrRoad ===
        "function" &&
        isGrassOrRoad(nextX, nextY)
    ) {
        officer.x = nextX;
        officer.y = nextY;
        officer.walkTimer +=
            speed * dt * 0.12;
    }
}

function updateAssaultPoliceResponse(dt) {
    if (
        !activeAssaultPoliceResponse
    ) {
        return;
    }

    const response =
        activeAssaultPoliceResponse;

    const car = response.car;
    const encounter =
        response.encounter;

    if (
        !car ||
        !encounter ||
        !cars.includes(car)
    ) {
        activeAssaultPoliceResponse =
            null;
        return;
    }

    const target =
        encounter.target;

    if (!target) {
        car.policeState = "PATROL";
        car.isParked = false;
        car.hasDriver = true;
        activeAssaultPoliceResponse =
            null;
        return;
    }

    const distance = Math.hypot(
        car.x -
        encounter.sceneX,
        car.y -
        encounter.sceneY
    );

    // Arrived at the scene.
    if (distance <= 55) {
        car.speed = 0;
        car.isParked = true;

        const fightStillGoing =
            !target.isInjured &&
            (
                target.isFightingBack ||
                target.fleeTimer > 0 ||
                Math.hypot(
                    player.x - target.x,
                    player.y - target.y
                ) <= 90
            );

        if (!fightStillGoing) {
            car.policeState = "PATROL";
            car.isParked = false;
            car.hasDriver = true;

            activeAssaultPoliceResponse =
                null;

            return;
        }

        const officer =
            createOfficerFromPoliceCar(
                car,
                encounter
            );

        activeAssaultPoliceResponse =
            null;

        if (!officer) return;

        // If the fleeing NPC is still involved,
        // police immediately treats this as a witnessed assault.
        if (
            target.fleeTimer > 0 &&
            !target.isFightingBack
        ) {
            setPoliceWarningForAssault(
                officer,
                target
            );
        } else {
            // First fight-back incident:
            // police breaks it up without creating a crime.
            makePoliceOfficerWitness(
                officer,
                encounter
            );
        }

        return;
    }

    if (
        typeof moveArrestPoliceCar ===
        "function"
    ) {
        moveArrestPoliceCar(
            car,
            encounter.sceneX,
            encounter.sceneY,
            dt,
            3.2
        );
    }
}

function finishAssaultPoliceWitness(
    encounter
) {
    if (!encounter) return;

    const officer =
        encounter.policeWitness;

    if (!officer) return;

    const policeCar =
        encounter.policeWitnessCar ||
        officer.assaultWitnessCar;

    if (policeCar) {
        officer.isPassenger = true;
        officer.x = policeCar.x;
        officer.y = policeCar.y;

        policeCar.assaultWitnessOfficer =
            null;

        policeCar.hasDriver = true;
        policeCar.isParked = false;
        policeCar.policeState = "PATROL";

        if (
            typeof policeCar.playSiren ===
            "function"
        ) {
            policeCar.playSiren(0);
        } else {
            policeCar.sirenState = 0;
        }
    } else {
        officer.policeState = "PATROL";
        officer.speed =
            0.3 + Math.random() * 0.4;
    }

    officer.assaultEncounter = null;
    officer.assaultWitnessCar = null;
}

function handleAssaultWitnesses(
    target,
    targetWillFightBack
) {
    if (!target || target.isPolice) {
        return;
    }

    const encounter =
        getAssaultEncounter(target);

    // --------------------------------------------------------
    // A police witness already exists.
    // Another punch against the same NPC becomes the crime.
    // --------------------------------------------------------
    if (encounter.policeWitness) {
        if (
            encounter.policeWarningActive &&
            !target.assaultCrimeRegistered
        ) {
            setPoliceWarningForAssault(
                encounter.policeWitness,
                target
            );

            encounter.policeWarningActive =
                false;

            return;
        }

        // Already a crime: never create another case.
        return;
    }

    // --------------------------------------------------------
    // Find police who witnessed the punch.
    // --------------------------------------------------------
    const policeWitness =
        getNearbyAssaultPolice(target);

    if (policeWitness) {
        if (
            policeWitness.type ===
            "OFFICER"
        ) {
            const officer =
                policeWitness.unit;

            if (
                targetWillFightBack &&
                !target.assaultCrimeRegistered
            ) {
                makePoliceOfficerWitness(
                    officer,
                    encounter
                );
            } else {
                setPoliceWarningForAssault(
                    officer,
                    target
                );
            }

            return;
        }

        if (
            policeWitness.type ===
            "POLICE_CAR"
        ) {
            const policeCar =
                policeWitness.unit;

            // The officer exits the parked police car.
            const officer =
                createOfficerFromPoliceCar(
                    policeCar,
                    encounter
                );

            if (!officer) return;

            if (
                targetWillFightBack &&
                !target.assaultCrimeRegistered
            ) {
                makePoliceOfficerWitness(
                    officer,
                    encounter
                );
            } else {
                setPoliceWarningForAssault(
                    officer,
                    target
                );
            }

            return;
        }
    }

    // --------------------------------------------------------
    // Civilian witnesses.
    //
    // Police already handled the scene above, so civilians
    // are not allowed to create a second police call.
    // --------------------------------------------------------
    const witnesses =
        getCivilianAssaultWitnesses(
            target
        );

    encounter.npcWitnesses =
        witnesses.filter(
            npc =>
                !encounter.npcWitnesses.includes(
                    npc
                )
        );

    const policeAlreadyActive =
        assaultEncounters.some(
            e =>
                e !== encounter &&
                e.policeWitness
        );

    if (!policeAlreadyActive) {
        for (
            let i = 0;
            i <
            encounter.npcWitnesses.length;
            i++
        ) {
            const witness =
                encounter.npcWitnesses[i];

            if (
                witness.assaultDecisionMade
            ) {
                continue;
            }

            witness.assaultDecisionMade =
                true;

            // 40% chance to call police.
            if (
                Math.random() < 0.40 &&
                !encounter.policeResponseStarted
            ) {
                witness.say(
                    "I'm calling police!",
                    180
                );

                spawnAssaultPoliceResponse(
                    encounter,
                    witness
                );

                break;
            }

            // 60% chance to flee.
            witness.say(
                "I should get away!",
                120
            );

            witness.fleeTimer = 240;

            witness.fleeAngle =
                Math.atan2(
                    witness.y - player.y,
                    witness.x - player.x
                ) +
                Math.PI / 2;

            witness.fleePath = [];
            witness.fleePathIndex = 0;
            witness.fleePathRepathTimer = 0;
        }
    }

    // If the punched NPC is going to flee,
    // remember where the assault happened.
    if (!targetWillFightBack) {
        encounter.sceneX = target.x;
        encounter.sceneY = target.y;
        encounter.fleeReportChecked = false;
    }
}

function updateAssaultWitnessSystem(dt) {
    updateAssaultPoliceResponse(dt);

    for (
        let i = assaultEncounters.length - 1;
        i >= 0;
        i--
    ) {
        const encounter =
            assaultEncounters[i];

        const target =
            encounter.target;

        if (!target) {
            assaultEncounters.splice(i, 1);
            continue;
        }

        // ----------------------------------------------------
        // Move a police officer toward the fight.
        // ----------------------------------------------------
        if (
            encounter.policeWitness &&
            encounter.policeWitness.policeState ===
            "ASSAULT_WITNESS"
        ) {
            const officer =
                encounter.policeWitness;

            const targetX =
                (player.x + target.x) *
                0.5;

            const targetY =
                (player.y + target.y) *
                0.5;

            const distance =
                Math.hypot(
                    officer.x - targetX,
                    officer.y - targetY
                );

            if (
                distance >
                ASSAULT_POLICE_WARNING_DISTANCE
            ) {
                moveAssaultWitnessOfficer(
                    officer,
                    targetX,
                    targetY,
                    dt
                );
            } else {
                officer.speed = 0;

                if (
                    !encounter.warningShown
                ) {
                    encounter.warningShown =
                        true;

                    officer.say(
                        "Stop fighting!",
                        150
                    );

                    target.say(
                        "Alright!",
                        100
                    );

                    resetNPCCombatAfterPoliceWarning(
                        target
                    );

                    if (
                        typeof taxiManager !==
                        "undefined" &&
                        taxiManager.setMessage
                    ) {
                        taxiManager.setMessage(
                            "Police broke up the fight.",
                            150
                        );
                    }
                }
            }
        }

        // ----------------------------------------------------
        // Fleeing punched NPC:
        // once player has gone 320 units from the scene,
        // decide whether the assault gets reported.
        // ----------------------------------------------------
        if (
            target.fleeTimer > 0 &&
            !target.assaultCrimeRegistered &&
            !encounter.fleeReportChecked
        ) {
            const playerDistance =
                Math.hypot(
                    player.x -
                    encounter.sceneX,
                    player.y -
                    encounter.sceneY
                );

            if (
                playerDistance >=
                ASSAULT_FLEE_ESCAPE_DISTANCE
            ) {
                encounter.fleeReportChecked =
                    true;

                const witnessCount =
                    encounter.npcWitnesses.length;

                const reportChance =
                    getAssaultReportChance(
                        witnessCount
                    );

                if (
                    Math.random() <
                    reportChance
                ) {
                    registerAssaultCrime(
                        target
                    );
                }

                // The scene is finished.
                target.fleeTimer = 0;
                target.fleePath = [];
                target.fleePathIndex = 0;

                if (
                    !target.assaultCrimeRegistered
                ) {
                    target.assaultDecisionMade =
                        false;

                    removeAssaultEncounter(
                        target
                    );
                }
            }
        }
    }
}
function punchNPC() {
    if (
        !player ||
        player.punchCooldown > 0
    ) {
        return;
    }

    const target = getPunchTarget();

    if (!target) return;

    // Police are NEVER valid combat targets.
    if (target.isPolice) return;

    // --------------------------------------------------------
    // Start player punch animation.
    // --------------------------------------------------------
    player.punchTimer = 12;
    player.punchCooldown =
        PUNCH_COOLDOWN;

    // --------------------------------------------------------
    // Count punches against THIS NPC.
    // --------------------------------------------------------
    target.punchCount =
        (target.punchCount || 0) + 1;

    // --------------------------------------------------------
    // Knock NPC backwards.
    // --------------------------------------------------------
    let dx =
        target.x - player.x;

    let dy =
        target.y - player.y;

    let distance =
        Math.hypot(dx, dy);

    if (distance > 0) {
        const nx =
            dx / distance;

        const ny =
            dy / distance;

        const pushedX =
            target.x +
            nx * PUNCH_KNOCKBACK;

        const pushedY =
            target.y +
            ny * PUNCH_KNOCKBACK;

        if (
            typeof isRoadColor !==
                "function" ||
            isRoadColor(
                pushedX,
                pushedY
            )
        ) {
            target.x = pushedX;
            target.y = pushedY;
        }
    }

    // --------------------------------------------------------
    // Clear normal conversation.
    // --------------------------------------------------------
    target.inConversation = false;
    target.speechText = null;
    target.speechTimer = 0;
    target.conversationCooldown = 180;

    // --------------------------------------------------------
    // Determine whether THIS punch would make the NPC fight.
    // --------------------------------------------------------
    const targetWillFightBack =
        Boolean(
            target.canFightBack &&
            !target.isPolice
        );

    // --------------------------------------------------------
    // Witnesses see the actual assault.
    //
    // This happens BEFORE the civilian reaction is started
    // so a police witness can immediately break up a fight.
    // --------------------------------------------------------
    handleAssaultWitnesses(
        target,
        targetWillFightBack
    );

    // --------------------------------------------------------
    // If a police witness has already warned this NPC/player,
    // the second punch registers the assault and police.js
    // takes over.
    // --------------------------------------------------------
    const encounter =
        getAssaultEncounter(target);

    if (
        encounter &&
        encounter.policeWitness &&
        encounter.policeWarningActive &&
        !target.assaultCrimeRegistered
    ) {
        setPoliceWarningForAssault(
            encounter.policeWitness,
            target
        );

        encounter.policeWarningActive =
            false;

        if (
            typeof npcHitPool !==
            "undefined"
        ) {
            playSpatialSound(
                npcHitPool,
                target.x,
                target.y,
                1.0
            );
        }

        return;
    }

    // --------------------------------------------------------
    // Injure after the existing random 2–5 punches.
    // --------------------------------------------------------
    if (
        target.punchCount >=
        target.punchesToInjure
    ) {
        target.isInjured = true;
        target.speed = 0;

        target.isFightingBack = false;
        target.fightTimer = 0;
        target.fightPath = [];
        target.fightPathIndex = 0;

        target.fleeTimer = 0;
        target.fleePath = [];
        target.fleePathIndex = 0;

        target.inConversation = false;
        target.speechText = null;
        target.speechTimer = 0;
        target.changeDirTimer = 999999;

        if (
            typeof npcHitPool !==
            "undefined"
        ) {
            playSpatialSound(
                npcHitPool,
                target.x,
                target.y,
                1.0
            );
        }

        return;
    }

    // --------------------------------------------------------
    // If police broke up the fight, do NOT start another
    // civilian reaction.
    // --------------------------------------------------------
    if (
        encounter &&
        encounter.policeWitness &&
        encounter.warningShown
    ) {
        resetNPCCombatAfterPoliceWarning(
            target
        );

        if (
            typeof npcHitPool !==
            "undefined"
        ) {
            playSpatialSound(
                npcHitPool,
                target.x,
                target.y,
                1.0
            );
        }

        return;
    }

    // --------------------------------------------------------
    // CIVILIAN FIGHT BACK
    // --------------------------------------------------------
    if (targetWillFightBack) {
        target.isFightingBack = true;
        target.fightTimer = 900;

        target.fightPath = [];
        target.fightPathIndex = 0;
        target.fightRepathTimer = 0;

        target.fleeTimer = 0;
        target.fleePath = [];
        target.fleePathIndex = 0;
        target.fleePathRepathTimer = 0;

        const fightLines = [
            "Hey you!",
            "Who you think you are?",
            "Back off!",
            "You wanna fight?!",
            "What you want!"
        ];

        target.say(
            fightLines[
                Math.floor(
                    Math.random() *
                    fightLines.length
                )
            ],
            90
        );
    }

    // --------------------------------------------------------
    // CIVILIAN FLEES
    // --------------------------------------------------------
    else {
        target.isFightingBack = false;
        target.fightTimer = 0;

        target.fightPath = [];
        target.fightPathIndex = 0;

        target.fleeAngle =
            Math.atan2(
                dy,
                dx
            ) +
            Math.PI / 2;

        target.fleeTimer = 300;

        target.fleePath = [];
        target.fleePathIndex = 0;
        target.fleePathRepathTimer = 0;

        const fleeLines = [
            "Police!",
            "What was that?!",
            "Help!",
            "What you want!"
        ];

        target.say(
            fleeLines[
                Math.floor(
                    Math.random() *
                    fleeLines.length
                )
            ],
            90
        );
    }

    if (
        typeof npcHitPool !==
        "undefined"
    ) {
        playSpatialSound(
            npcHitPool,
            target.x,
            target.y,
            1.0
        );
    }
}            
if (punchBtn) {
    punchBtn.addEventListener("click", punchNPC);
}
function updateGame(dt) {
    if (typeof gameActive !== 'undefined' && !gameActive) return;

    if (typeof updateDayNight === 'function') {
        updateDayNight(dt);
    }

    if (
        typeof raceEventManager !== "undefined" &&
        raceEventManager
    ) {
        raceEventManager.update(dt);
    }
    updateHitRunIncidents();    updateAssaultWitnessSystem(dt);
        if (playerPhoneOpen && player.isArrestPassenger) {
        closePlayerPhone();
        }
    
 // --- REFINED STOLEN CAR & POLICE SYSTEM LOGIC ---
let stolenCars = cars.filter(c => c && c.isStolen);

if (stolenCars.length > 0) {
    for (let i = stolenCars.length - 1; i >= 0; i--) {
        let stolenCar = stolenCars[i];

        // If player is NOT driving this specific stolen car,
        // check whether it has been abandoned.
        if (!playerCar || playerCar.id !== stolenCar.id) {
            let dx = player.x - stolenCar.x;
            let dy = player.y - stolenCar.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= 1050) {
                // Remove only this abandoned stolen car from the world.
                cars = cars.filter(c => c.id !== stolenCar.id);

                if (
                    typeof taxiManager !== 'undefined' &&
                    taxiManager.setMessage
                ) {
                    taxiManager.setMessage(
                        "A stolen car was found by police!",
                        180
                    );
                }
            }
        }
    }
}

// Always sync the current stolen-car list.
// If no stolen cars remain, updateStolenCarsStorage()
// will remove their storage and clear wanted when appropriate.
    updateStolenCarsStorage();
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
            playerCarStealCases++;
    saveCrimeCaseCounts();
            player.wanted = true;
            localStorage.setItem("gma_player_wanted", "true");
            updateStolenCarsStorage(true);

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
    const dist = Math.hypot(
        player.x - car.x,
        player.y - car.y
    );

    if (dist < 350) {
        const volume = Math.max(0, 1 - (dist / 350));

        if (!car.fireAudio) {
            car.fireAudio = new Audio(fireUrl);
            car.fireAudio.loop = true;

            // Set the correct distance volume BEFORE starting playback.
            car.fireAudio.volume = volume;

            car.fireAudio.play().catch(() => {});
        } else {
            // Continuously update volume as the player moves.
            car.fireAudio.volume = volume;
        }
    } else if (car.fireAudio) {
        car.fireAudio.pause();
        car.fireAudio.currentTime = 0;
        car.fireAudio = null;
    }
} else if (car.fireAudio) {
    car.fireAudio.pause();
    car.fireAudio.currentTime = 0;
    car.fireAudio = null;
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
      if (truckBtn) truckBtn.style.display = 'none';
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
  if (blackMarketBtn) {
    blackMarketBtn.style.display = (!isInsideHouse && !isInsideDealership && distToBM < blackMarketZone.radius && !playerCar) ? 'flex' : 'none';
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
          if (car.isRaceOpponent) return;
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

              if (punchBtn) {
          const punchTarget = getPunchTarget();

          punchBtn.style.display =
              (!player.isBeingArrested && punchTarget)
                  ? 'flex'
                  : 'none';
              }
  } else {
    if (exitBtn) {
    exitBtn.style.display =
        player.isBeingArrested ? 'none' : 'flex';
    }
    if (jackBtn) jackBtn.style.display = 'none';
            if (punchBtn) punchBtn.style.display = 'none';
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

        const oldX = playerCar.x;
        const oldY = playerCar.y;

        if (isPlayerCarWalkable(nextX, playerCar.y, playerCar)) {
            playerCar.x = nextX;
        } else {
            hitWall = true;
            playerCar.x = oldX;
        }

        if (isPlayerCarWalkable(playerCar.x, nextY, playerCar)) {
            playerCar.y = nextY;
        } else {
            hitWall = true;
            playerCar.y = oldY;
        }

        if (hitWall && playerCar.speed > 0.7) {
            if (!playerCar.crashCooldown || playerCar.crashCooldown <= 0) {
                playSpatialSound(carCrashPool, playerCar.x, playerCar.y, 1.0);
                playerCar.crashCooldown = 30;
            }
            const previousPlayerCarHealth = playerCar.health;
            playerCar.health = Math.max(0, playerCar.health - playerCar.speed * 3);
            if (
                playerCar.isStolen &&
                playerCar.health !== previousPlayerCarHealth
            ) {
                updateStolenCarsStorage(true);
            }
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

  if (player.ispassenger) {
    // Lock the camera's current heading while an AI controls the vehicle.
    // The passenger state is general and is not tied to police transport.
    if (camera.passengerFollowAngle === null) {
      camera.passengerFollowAngle = camera.angle;
    }
    camera.angle = camera.passengerFollowAngle;
    camera.targetAngle = camera.passengerFollowAngle;
} else {
    camera.passengerFollowAngle = null;
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
  applyViewportTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  if (
    (typeof showFullMap !== 'undefined' && showFullMap) ||
    (typeof fullMapAnimating !== 'undefined' && fullMapAnimating)
) {
    // Update full-map animation progress.
    if (fullMapAnimating) {
        const elapsed = performance.now() - fullMapAnimationStartTime;
        const t = Math.min(
            1,
            elapsed / fullMapAnimationDuration
        );

        // Smooth ease-out.
        const eased = 1 - Math.pow(1 - t, 3);

        fullMapAnimationProgress =
            fullMapAnimationFrom +
            (fullMapAnimationTo - fullMapAnimationFrom) * eased;

        if (t >= 1) {
            fullMapAnimationProgress = fullMapAnimationTo;
            fullMapAnimating = false;

            // Only return control to the game after the
            // closing animation has completely finished.
            if (fullMapAnimationProgress <= 0) {
                showFullMap = false;
                gameActive = true;
            } else {
                showFullMap = true;
                gameActive = false;
            }
        }
    }

    const mapProgress = Math.max(
    0,
    Math.min(1, fullMapAnimationProgress)
);
// Dark background fades in/out with the map.
const backgroundAlpha = mapProgress * 0.95;

ctx.fillStyle =
    `rgba(26, 26, 26, ${backgroundAlpha})`;

ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
);

ctx.globalAlpha = 1;

ctx.globalAlpha = 1;


    if (mapImage.complete && mapWidth > 0) {
        const padding = 40;

        const scale = Math.min(
            (canvas.width - padding * 2) / mapWidth,
            (canvas.height - padding * 2) / mapHeight
        );

        const fullW = mapWidth * scale;
        const fullH = mapHeight * scale;

        const fullX = (canvas.width - fullW) / 2;
        const fullY = (canvas.height - fullH) / 2;

        const fullCenterX = fullX + fullW / 2;
        const fullCenterY = fullY + fullH / 2;

        // The animation begins from the minimap position.
        const radarRadius = 80;
        const radarPadding = 20;
        const miniMapX =
            canvas.width - radarRadius - radarPadding;
        const miniMapY =
            radarRadius + radarPadding;

        // Start with the map fitting roughly inside the minimap.
        const startScale = Math.min(
            (radarRadius * 2) / fullW,
            (radarRadius * 2) / fullH
        );

        const animatedScale =
            startScale +
            (1 - startScale) * mapProgress;

        const animatedCenterX =
            miniMapX +
            (fullCenterX - miniMapX) * mapProgress;

        const animatedCenterY =
            miniMapY +
            (fullCenterY - miniMapY) * mapProgress;

        // Everything inside this save/restore is the map itself
        // and its markers, so they expand together.
        ctx.save();

        ctx.translate(
            animatedCenterX,
            animatedCenterY
        );

        ctx.scale(
            animatedScale,
            animatedScale
        );

        ctx.translate(
            -fullCenterX,
            -fullCenterY
        );

        ctx.globalAlpha =
            0.25 + mapProgress * 0.75;

        ctx.drawImage(
            mapImage,
            fullX,
            fullY,
            fullW,
            fullH
        );

        ctx.strokeStyle =
            "rgba(255, 255, 255, 0.4)";

        ctx.lineWidth = 3;

        ctx.strokeRect(
            fullX,
            fullY,
            fullW,
            fullH
        );
        
        

   // ========================================================
// RACE EVENT MARKERS
// ========================================================

if (
    typeof raceEventManager !== "undefined" &&
    raceEventManager
) {
    const raceStart =
        raceEventManager.getStartMarker();

    if (raceStart) {
        ctx.fillStyle = "#e74c3c";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(
            fullX + raceStart.x * scale,
            fullY + raceStart.y * scale,
            12,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
    }

    const raceMarkers =
    raceEventManager.getRaceMarkers();

for (let i = 0; i < raceMarkers.length; i++) {
    const marker =
        raceMarkers[i];

    const isFinish =
        i === raceMarkers.length - 1;

    ctx.fillStyle =
        isFinish
            ? "#e74c3c"
            : "#9b59b6";

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(
        fullX + marker.x * scale,
        fullY + marker.y * scale,
            12,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();
}
}
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

// End the map + marker animation transform.
// The legend and BACK button remain screen-space UI.
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

ctx.globalAlpha = mapProgress;

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

    ctx.save();

ctx.globalAlpha = mapProgress;

ctx.fillStyle = "#f1c40f";
ctx.strokeStyle = "#ffffff";
ctx.lineWidth = 3;

ctx.fillRect(
    30,
    30,
    130,
    45
);

ctx.strokeRect(
    30,
    30,
    130,
    45
);

ctx.fillStyle = "#000000";
ctx.font = "bold 18px Arial";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

ctx.fillText(
    " BACK",
    30 + 130 / 2,
    30 + 45 / 2
);

ctx.restore();

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
  // Shadow lighting: once-per-frame setup (daylight, smoothing, map scale).
  // Nothing is drawn here; entities read it when they draw themselves.
  if (window.ShadowLighting) ShadowLighting.beginFrame(!isInsideHouse && !isInsideDealership);

  if (!isInsideHouse && !isInsideDealership) {
      taxiManager.drawWorldMarkers(ctx);
      truckManager.drawWorldMarkers(ctx);
  }
if (!isInsideHouse && !isInsideDealership) {
    drawLocationBoards(ctx);
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
      
  }

  // 2. Draw exhaust smoke and flying debris
  drawExhaustParticles(ctx);
  drawDebrisParticles(ctx);

  ctx.restore();

  if (!playerCar && !player.ispassenger) {
  player.draw(ctx, isInsideDealership ? 0 : camera.angle);
}

// Ray occlusion + object glow data for this frame (headlights & building lights).
if (!isInsideHouse && !isInsideDealership && typeof updateObjectLighting === 'function') {
    updateObjectLighting();
}

if (!isInsideHouse && !isInsideDealership && typeof drawNightOverlay === 'function') {
    drawNightOverlay();
    
}
 if (!isInsideHouse && !isInsideDealership) {
    ctx.save();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-camera.angle);

    const boardCameraTarget =
        player.isArrestPassenger &&
        arrestTransportCar
            ? arrestTransportCar
            : player;

    ctx.translate(
        -boardCameraTarget.x -
            (boardCameraTarget.size || player.size) / 2,
        -boardCameraTarget.y -
            (boardCameraTarget.size || player.size) / 2
    );

    drawLocationBoardText(ctx);

    ctx.restore();
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

    // Bullets are world-space objects, so they must use
    // the same camera transform as vehicles and lights.
    drawPoliceBullets(ctx);

    cars.forEach(car => {
        if (isEntityOnScreen(car)) {
            car.drawLights(ctx);
        }
    });

    // Soft glow on the exposed part of cars / NPCs / player hit by a light.
    if (typeof drawObjectGlows === 'function') {
        drawObjectGlows(ctx);
    }

    ctx.restore();
}


 if (!openingCutsceneActive) { ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
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
  if (
      typeof raceEventManager !== "undefined" &&
      raceEventManager &&
      raceEventManager.drawRaceArrow
  ) {
      raceEventManager.drawRaceArrow(ctx);
  }
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

const minimapScaleX =
    radarZoom * (mapWidth / minimapMapCache.width);

const minimapScaleY =
    radarZoom * (mapHeight / minimapMapCache.height);

ctx.translate(mmX, mmY);
ctx.scale(minimapScaleX, minimapScaleY);
ctx.translate(
    -(player.x + player.size / 2) *
        (minimapMapCache.width / mapWidth),
    -(player.y + player.size / 2) *
        (minimapMapCache.height / mapHeight)
);

ctx.globalAlpha = 0.9;  

const minimapWorldToCacheX = worldX =>
    worldX * (minimapMapCache.width / mapWidth);
const minimapWorldToCacheY = worldY =>
    worldY * (minimapMapCache.height / mapHeight);

    if (isInsideHouse) {
      if (houseImage.complete && houseMapWidth > 0) ctx.drawImage(houseImage, 0, 0, houseMapWidth, houseMapHeight);
    } else if (isInsideDealership) {
      let dW = dealershipMapWidth || 800;
      let dH = dealershipMapHeight || 600;

      drawDealershipFloor(ctx, dW, dH);
      dealershipCars.forEach(car => car.draw(ctx)); 
    }
 else if (minimapCacheReady) {
  ctx.drawImage(
      minimapMapCache,
      0,
      0,
      minimapMapCache.width,
      minimapMapCache.height
  );
} else if (mapImage.complete && mapWidth > 0) {
    if (!window.minimapFallbackLogged) {
        console.warn("[MINIMAP] Using fallback: static map cache is not ready.");
        window.minimapFallbackLogged = true;
    }

    ctx.drawImage(mapImage, 0, 0, mapWidth, mapHeight);
} else {
      ctx.fillStyle = "#e0deca"; 
      ctx.fillRect(player.x - 400, player.y - 400, 800, 800); 
    }

    // ========================================================
    // RACE EVENT MINIMAP MARKERS
// ========================================================

if (
    typeof raceEventManager !== "undefined" &&
    raceEventManager
) {
    const raceStart =
        raceEventManager.getStartMarker();

    if (raceStart) {
        ctx.fillStyle = "#e74c3c";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(
            minimapWorldToCacheX(raceStart.x),
            minimapWorldToCacheY(raceStart.y),
            14,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
    }

    const raceMarkers =
    raceEventManager.getRaceMarkers();

for (
    let i = 0;
    i < raceMarkers.length;
    i++
) {
    const marker =
        raceMarkers[i];

    const isFinish =
        i === raceMarkers.length - 1;

    const markerX =
        minimapWorldToCacheX(marker.x);

    const markerY =
        minimapWorldToCacheY(marker.y);

    ctx.fillStyle =
        isFinish
            ? "#e74c3c"
            : "#9b59b6";

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
        markerX,
        markerY,
        12,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();
}
}
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      if (taxiManager.isJobActive && taxiManager.hasPassenger) {
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(taxiManager.destinationX), minimapWorldToCacheY(taxiManager.destinationY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (taxiManager.isJobActive && !taxiManager.hasPassenger && taxiManager.pickupX !== 0) {
      ctx.fillStyle = "#f1c40f"; 
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(taxiManager.pickupX), minimapWorldToCacheY(taxiManager.pickupY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (!taxiManager.isJobActive) {
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(taxiManager.depotX), minimapWorldToCacheY(taxiManager.depotY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } 

    if (truckManager.isJobActive && truckManager.stage === 2) {
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(truckManager.destinationX), minimapWorldToCacheY(truckManager.destinationY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (truckManager.isJobActive && truckManager.stage === 1) {
      ctx.fillStyle = "#e67e22"; 
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(truckManager.pickupX), minimapWorldToCacheY(truckManager.pickupY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (!truckManager.isJobActive || truckManager.stage === 3) {
      ctx.fillStyle = "#e67e22";
      ctx.beginPath(); ctx.arc(minimapWorldToCacheX(truckManager.companyX), minimapWorldToCacheY(truckManager.companyY), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    ctx.fillStyle = "#d35400";
    ctx.beginPath();
    ctx.arc(minimapWorldToCacheX(restaurantZone.x), minimapWorldToCacheY(restaurantZone.y), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#1abc9c";
    ctx.beginPath(); ctx.arc(minimapWorldToCacheX(repairGarageZone.x), minimapWorldToCacheY(repairGarageZone.y), 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#3498db";
    ctx.beginPath();
    ctx.arc(minimapWorldToCacheX(homeZone.x), minimapWorldToCacheY(homeZone.y), 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8e44ad";
    ctx.beginPath();
    ctx.arc(minimapWorldToCacheX(blackMarketZone.x), minimapWorldToCacheY(blackMarketZone.y), 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#00bcd4";
    ctx.beginPath();
    ctx.arc(minimapWorldToCacheX(dealershipZone.x), minimapWorldToCacheY(dealershipZone.y), 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

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
  }}
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
                                                                                                                                                 


/* =====================================================================
 * SHADOW LIGHTING
 *
 * The detector below (ShadowDetectorCoreFactory) analyses Map2.png once, in a
 * background worker, and finds the cast shadows painted into the map. The
 * result is baked into a small lookup grid (see shadowLightBake) that is
 * invisible environmental lighting: in daytime (05:00-20:00 game time) cars,
 * NPCs and the player look less brightly lit while they stand in a shadow.
 * The map image itself is never modified and nothing is drawn on top of it.
 *
 * Detector tunables: ShadowLighting.cfg (e.g. {highConfidence:0.7,
 * lowConfidence:0.4, scale:2}); call ShadowLighting.rerun() after changing
 * them. Look of the effect: ShadowLighting.light (maxDarken, smoothTime...).
 * ===================================================================== */

const ShadowDetectorCoreFactory = function () {
  'use strict';
  'use strict';

  const DEFAULTS = {
    // ---- working resolution -------------------------------------------
    scale: 2,                 // analyse at 1/scale of the map (2 = half res)

    // ---- ray probing of the "lit surface" (all distances in FULL-res px)
    nDirs: 16,
    maxRayPx: 56,             // how far to look for the lit surface
    rayStepPx: 4,
    plateauSteps: 3,          // lit surface must stay flat this many steps
    plateauTol: 0.08,         // relative luma change allowed inside plateau

    // ---- attenuation model: shadow = lit surface * k (per channel) ----
    brighterRatio: 1.22,      // lit luma must be >= this x candidate luma
    kMin: 0.22,               // darker than this  -> outline / black, not shadow
    kMax: 0.84,
    channelEps: 6,            // keeps near-zero blue from blowing up ratios
    channelSpreadMax: 2.3,    // max(kc)/min(kc): how much hue may shift
    channelKCeil: 0.97,       // every channel must get darker

    // ---- grass-aware regional reference --------------------------------
    grassTilePx: 32,
    grassPropagateTiles: 12,  // how far (tiles) a lit-grass colour may be borrowed
    litGrassMinY: 80,
    litGrassMaxTex: 6,
    priorWeight: 0.75,         // evidence given to a prior-only (no local lit pixel) match

    // ---- pixel evidence shaping ----------------------------------------
    flatTexOk: 6,             // local std-dev (luma) up to here counts as flat
    flatTexMax: 16,           // above this: textured (canopy, roof stripes, markings)

    // ---- region stage ---------------------------------------------------
    seedThr: 0.30,            // pixel evidence needed to seed a region
    minSeedPx: 2,             // seed blobs smaller than this (analysis px) are specks
    minAreaPx: 20,            // full-res px; smaller final regions are rejected
    growDepth: 8,             // analysis px a region may grow past its seeds
    growTexMax: 14,
    growChroma: 0.02,         // squared chroma distance allowed while growing
    litTexMax: 8,             // an outside pixel only counts as 'lit surface' if it is flat
    litChroma: 0.03,          // squared chroma distance for 'outside pixel is lit surface'
    regionTexOk: 6,
    regionTexMax: 16,
    otherOk: 0.35,            // share of boundary that is neither lit surface, bright line nor occluder
    otherMax: 0.7,
    meanKOk: 0.62,            // regions only ~this dark or darker get full marks
    meanKMax: 0.78,           // regions barely darker than their surface (tone drift) score 0
    evidenceFull: 0.65,       // mean pixel evidence regarded as 'fully convincing'

    // ---- confidence thresholds (configurable) -------------------------
    highConfidence: 0.62,
    lowConfidence: 0.38,

    // ---- light direction (unit vector pointing toward the light) -------
    lightDir: null,           // null = estimate from the image itself

    debug: false
  };

  /* ------------------------------------------------------------------ */
  function merge(a, b) {
    const o = {};
    for (const k in a) o[k] = a[k];
    if (b) for (const k in b) o[k] = b[k];
    return o;
  }

  /* Rec.709 luma on the gamma-encoded values the artwork is painted in. */
  function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }


  /* Two lit-surface estimates agree if luma is close and the colour proportions match. */
  function similarLit(r1, g1, b1, y1, r2, g2, b2, y2) {
    if (Math.abs(Math.log(y1 / y2)) > 0.22) return false;
    const e = 6;
    const dr = (r1 + e) / (y1 + e) - (r2 + e) / (y2 + e);
    const dg = (g1 + e) / (y1 + e) - (g2 + e) / (y2 + e);
    const db = (b1 + e) / (y1 + e) - (b2 + e) / (y2 + e);
    return dr * dr + dg * dg + db * db < 0.012;
  }

  /* Separable running-sum box filter (radius r, clamped edges). */
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / win;
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / win;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  /* Downsample by box average into planar Float32 R,G,B. */
  function downsample(rgba, W, H, s) {
    const w = Math.floor(W / s), h = Math.floor(H / s);
    const R = new Float32Array(w * h), G = new Float32Array(w * h), B = new Float32Array(w * h);
    const inv = 1 / (s * s);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < s; dy++) {
          let p = ((y * s + dy) * W + x * s) * 4;
          for (let dx = 0; dx < s; dx++, p += 4) { r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; }
        }
        const i = y * w + x;
        R[i] = r * inv; G[i] = g * inv; B[i] = b * inv;
      }
    }
    return { w, h, R, G, B };
  }

  /* ------------------------------------------------------------------ */
  function analyseShadows(rgba, W, H, userCfg, onProgress) {
    const cfg = merge(DEFAULTS, userCfg);
    const s = cfg.scale | 0 || 1;
    const t0 = Date.now();
    const progress = onProgress || function () {};

    const ds = downsample(rgba, W, H, s);
    const w = ds.w, h = ds.h, N = w * h;
    // 3x3 smoothed copies are what the probing reads (suppresses dithering)
    const R = boxBlur(ds.R, w, h, 1), G = boxBlur(ds.G, w, h, 1), B = boxBlur(ds.B, w, h, 1);
    const Y = new Float32Array(N);
    for (let i = 0; i < N; i++) Y[i] = luma(R[i], G[i], B[i]);
    progress(0.05);

    // local texture: std-dev of raw luma in 5x5 (of the downsampled image)
    const Yraw = new Float32Array(N), Y2raw = new Float32Array(N);
    for (let i = 0; i < N; i++) { const v = luma(ds.R[i], ds.G[i], ds.B[i]); Yraw[i] = v; Y2raw[i] = v * v; }
    const m1 = boxBlur(Yraw, w, h, 2), m2 = boxBlur(Y2raw, w, h, 2);
    const tex = new Float32Array(N);
    for (let i = 0; i < N; i++) tex[i] = Math.sqrt(Math.max(0, m2[i] - m1[i] * m1[i]));

    // ---------------- ray set ----------------------------------------
    const nD = cfg.nDirs;
    const dirX = new Float32Array(nD), dirY = new Float32Array(nD);
    for (let d = 0; d < nD; d++) { const a = d * 2 * Math.PI / nD; dirX[d] = Math.cos(a); dirY[d] = Math.sin(a); }
    const stepPx = Math.max(1, cfg.rayStepPx / s);
    const nSteps = Math.max(4, Math.round(cfg.maxRayPx / s / stepPx));
    const pl = cfg.plateauSteps;

    // ---------------- candidate prefilter ---------------------------------
    // a pixel can only be a shadow if something clearly brighter lies nearby
    const Rwin = Math.round(cfg.maxRayPx / s);
    const Ymax = slidingMax(Y, w, h, Rwin);
    const cand = new Uint8Array(N);
    let nCand = 0;
    for (let i = 0; i < N; i++) {
      if (Ymax[i] >= Y[i] * cfg.brighterRatio && Y[i] > 8) { cand[i] = 1; nCand++; }
    }
    progress(0.12);

    // outputs of probing
    const kOut = new Float32Array(N);        // luma ratio to lit surface
    const spreadOut = new Float32Array(N);   // channel ratio spread
    const awayOut = new Float32Array(N);     // lit support on far side (0..1)
    const towardOut = new Float32Array(N);   // lit support toward the light (0..1)
    const nValid = new Uint8Array(N);
    const cohOut = new Float32Array(N);      // agreement between lit estimates
    const dirHist = new Float64Array(nD);    // for light-direction estimation
    const validMask = new Uint16Array(N);    // bit d set -> direction d found lit surface
    const litR = new Float32Array(N), litG = new Float32Array(N), litB = new Float32Array(N);

    const eps = cfg.channelEps;
    const tmpK = new Float32Array(3);

    // returns true if (pr,pg,pb) is a plausibly attenuated version of (lr,lg,lb)
    // spread of per-channel attenuation. Channels that are nearly empty in the
    // lit surface (blue of grass: ~13/255) carry no reliable ratio and are ignored.
    function spreadOf(pr, pg, pb, lr, lg, lb) {
      const kr = (pr + eps) / (lr + eps), kg = (pg + eps) / (lg + eps), kb = (pb + eps) / (lb + eps);
      let mx = Math.max(kr, kg), mn = Math.min(kr, kg);
      if (lb >= 30) { mx = Math.max(mx, kb); mn = Math.min(mn, kb); }
      return mx / mn;
    }
    function ceilingOk(pr, pg, pb, lr, lg, lb) {
      const kr = (pr + eps) / (lr + eps), kg = (pg + eps) / (lg + eps), kb = (pb + eps) / (lb + eps);
      if (kr > cfg.channelKCeil || kg > cfg.channelKCeil) return false;
      if (lb >= 30 && kb > cfg.channelKCeil) return false;
      return true;
    }
    function compat(pr, pg, pb, py, lr, lg, lb, ly) {
      const k = py / ly;
      if (k < cfg.kMin || k > cfg.kMax) return false;
      if (!ceilingOk(pr, pg, pb, lr, lg, lb)) return false;
      return spreadOf(pr, pg, pb, lr, lg, lb) <= cfg.channelSpreadMax;
    }

    // per-pixel scratch (one entry per direction)
    const rLr = new Float32Array(nD), rLg = new Float32Array(nD), rLb = new Float32Array(nD), rLy = new Float32Array(nD);
    const rOk = new Uint8Array(nD);
    const maxSoft = 3;           // soft shadow edge may take up to this many extra steps

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!cand[i]) continue;
        const pr = R[i], pg = G[i], pb = B[i], py = Y[i];
        let nFound = 0;
        for (let d = 0; d < nD; d++) {
          rOk[d] = 0;
          const sx = dirX[d] * stepPx, sy = dirY[d] * stepPx;
          let first = -1, prevY = py;
          let monoBreak = false;
          // 1) walk outward until something clearly brighter than the pixel appears
          for (let st = 1; st <= nSteps; st++) {
            const ix = Math.round(x + sx * st), iy = Math.round(y + sy * st);
            if (ix < 0 || iy < 0 || ix >= w || iy >= h) break;
            const yj = Y[iy * w + ix];
            if (yj < py * 0.72) break;                    // darker thing: outline / occluder
            if (yj >= py * cfg.brighterRatio) { first = st; break; }
          }
          if (first < 0) continue;
          // 2) the lit surface must be a flat plateau that starts within a few steps
          //    of the first bright sample, rising monotonically (no bright line
          //    followed by a darker surface => kerb / marking / roof ridge)
          let ly = 0, lr = 0, lg = 0, lb = 0, okp = false;
          for (let a = first; a <= first + maxSoft && a + pl - 1 <= nSteps; a++) {
            let flat = true, base = -1, sr = 0, sg = 0, sb = 0, sy2 = 0, peak = 0;
            for (let t = 0; t < pl; t++) {
              const qx = Math.round(x + sx * (a + t)), qy = Math.round(y + sy * (a + t));
              if (qx < 0 || qy < 0 || qx >= w || qy >= h) { flat = false; break; }
              const jj = qy * w + qx, yv = Y[jj];
              if (base < 0) base = yv;
              if (Math.abs(yv - base) > cfg.plateauTol * base) { flat = false; break; }
              sr += R[jj]; sg += G[jj]; sb += B[jj]; sy2 += yv;
            }
            if (!flat) continue;
            ly = sy2 / pl; lr = sr / pl; lg = sg / pl; lb = sb / pl;
            // monotone approach: nothing between pixel and plateau may overshoot it
            // or dip back down after having risen
            let bad = false, hi = py;
            for (let st = 1; st < a; st++) {
              const ix = Math.round(x + sx * st), iy = Math.round(y + sy * st);
              const yv = Y[iy * w + ix];
              if (yv > ly * 1.12) { bad = true; break; }
              if (yv < hi * 0.88) { bad = true; break; }
              if (yv > hi) hi = yv;
            }
            if (bad) break;
            okp = true; break;
          }
          if (!okp) continue;
          if (ly < py * cfg.brighterRatio) continue;
          if (!compat(pr, pg, pb, py, lr, lg, lb, ly)) continue;
          rOk[d] = 1; rLr[d] = lr; rLg[d] = lg; rLb[d] = lb; rLy[d] = ly; nFound++;
        }
        if (!nFound) continue;

        // 3) consensus lit surface = the largest cluster of agreeing ray results
        let bestCnt = 0, bestD = -1;
        for (let a = 0; a < nD; a++) {
          if (!rOk[a]) continue;
          let cnt = 0;
          for (let b = 0; b < nD; b++) {
            if (!rOk[b]) continue;
            if (similarLit(rLr[a], rLg[a], rLb[a], rLy[a], rLr[b], rLg[b], rLb[b], rLy[b])) cnt++;
          }
          if (cnt > bestCnt) { bestCnt = cnt; bestD = a; }
        }
        let mask = 0, sr = 0, sg = 0, sb = 0, sY = 0, n = 0;
        for (let b = 0; b < nD; b++) {
          if (!rOk[b]) continue;
          if (similarLit(rLr[bestD], rLg[bestD], rLb[bestD], rLy[bestD], rLr[b], rLg[b], rLb[b], rLy[b])) {
            mask |= (1 << b); sr += rLr[b]; sg += rLg[b]; sb += rLb[b]; sY += rLy[b]; n++;
          }
        }
        validMask[i] = mask; nValid[i] = n;
        litR[i] = sr / n; litG[i] = sg / n; litB[i] = sb / n;
        const lyM = sY / n;
        kOut[i] = py / lyM;
        spreadOut[i] = spreadOf(pr, pg, pb, litR[i], litG[i], litB[i]);
        for (let d = 0; d < nD; d++) if (mask & (1 << d)) dirHist[d] += 1;
      }
      if ((y & 63) === 0) progress(0.12 + 0.55 * (y / h));
    }

    progress(0.68);

    // ------------------------------------------------------------------
    // Stage 2 - grass-aware regional reference
    // Lit grass is identified from the picture itself (grass chroma, bright,
    // flat). Its colour is averaged per tile and propagated to nearby tiles,
    // so a dark-green patch with NO lit grass inside the probing radius (e.g.
    // a whole lawn in shade) can still be compared with "grass nearby".
    // ------------------------------------------------------------------
    const T = Math.max(8, Math.round(cfg.grassTilePx / s));
    const tw = Math.ceil(w / T), th = Math.ceil(h / T);
    const tR = new Float32Array(tw * th), tG = new Float32Array(tw * th), tB = new Float32Array(tw * th), tC = new Float32Array(tw * th);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (Y[i] < cfg.litGrassMinY || tex[i] > cfg.litGrassMaxTex) continue;
        if (!isGrassChroma(R[i], G[i], B[i])) continue;
        const t = ((y / T) | 0) * tw + ((x / T) | 0);
        tR[t] += R[i]; tG[t] += G[i]; tB[t] += B[i]; tC[t]++;
      }
    }
    const tHas = new Uint8Array(tw * th);
    for (let t = 0; t < tw * th; t++) {
      if (tC[t] >= T * T * 0.12) { tR[t] /= tC[t]; tG[t] /= tC[t]; tB[t] /= tC[t]; tHas[t] = 1; }
    }
    // propagate to tiles that have no lit grass (BFS, limited radius)
    const tDist = new Int16Array(tw * th).fill(-1);
    const queue = [];
    for (let t = 0; t < tw * th; t++) if (tHas[t]) { tDist[t] = 0; queue.push(t); }
    const maxHop = cfg.grassPropagateTiles;
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi];
      if (tDist[t] >= maxHop) continue;
      const tx = t % tw, ty = (t / tw) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const nt = ny * tw + nx;
        if (tDist[nt] >= 0) continue;
        tDist[nt] = tDist[t] + 1; tR[nt] = tR[t]; tG[nt] = tG[t]; tB[nt] = tB[t];
        queue.push(nt);
      }
    }

    // ------------------------------------------------------------------
    // Stage 3 - per-pixel evidence
    // ------------------------------------------------------------------
    const lx = -1 / Math.SQRT2, ly2 = -1 / Math.SQRT2;
    const L = cfg.lightDir || [lx, ly2];            // toward the light
    const awayDirs = [], towardDirs = [];
    for (let d = 0; d < nD; d++) {
      const dot = dirX[d] * L[0] + dirY[d] * L[1];
      if (dot < -0.35) awayDirs.push(d);
      if (dot > 0.85) towardDirs.push(d);
    }
    const P = new Float32Array(N);          // pixel evidence 0..1
    const srcKind = new Uint8Array(N);      // 1 = ray evidence, 2 = grass prior only
    const kFin = new Float32Array(N);
    const refR = new Float32Array(N), refG = new Float32Array(N), refB = new Float32Array(N);
    function ramp(v, a, b) { return v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); }
    for (let i = 0; i < N; i++) {
      if (Y[i] < 8) continue;
      const pr = R[i], pg = G[i], pb = B[i], py = Y[i];
      const flat = 1 - ramp(tex[i], cfg.flatTexOk, cfg.flatTexMax);
      if (flat <= 0) continue;
      let e = 0, k = 0, spread = 1, kind = 0;
      const nv = nValid[i];
      if (nv >= 2) {
        const mask = validMask[i];
        let a = 0, t = 0;
        for (const d of awayDirs) if (mask & (1 << d)) a++;
        for (const d of towardDirs) if (mask & (1 << d)) t++;
        const A = a / awayDirs.length, Tt = t / towardDirs.length;
        e = Math.min(1, nv / 5) * (0.45 + 0.55 * Math.min(1, A * 1.6)) * (1 - Math.min(1, Tt * 2));
        k = kOut[i]; spread = spreadOut[i]; kind = 1;
        refR[i] = litR[i]; refG[i] = litG[i]; refB[i] = litB[i];
      }
      if (kind === 0 && isGrassLike(pr, pg, pb)) {
        // grass prior: compare with regional lit-grass colour
        const t = ((((i / w) | 0) / T) | 0) * tw + (((i % w) / T) | 0);
        if (tDist[t] >= 0) {
          const lr = tR[t], lg = tG[t], lb = tB[t], ly = luma(lr, lg, lb);
          if (compat(pr, pg, pb, py, lr, lg, lb, ly)) {
            k = py / ly;
            spread = spreadOf(pr, pg, pb, lr, lg, lb);
            e = cfg.priorWeight * (1 - tDist[t] / (maxHop + 1)); kind = 2;
            refR[i] = lr; refG[i] = lg; refB[i] = lb;
          }
        }
      }
      if (!kind) continue;
      const kFit = Math.min(ramp(k, cfg.kMin, 0.32), 1 - ramp(k, 0.68, cfg.kMax));
      const cFit = 1 - 0.6 * ramp(spread, 1.6, cfg.channelSpreadMax);
      P[i] = e * kFit * cFit * flat;
      srcKind[i] = kind; kFin[i] = k;
    }
    progress(0.8);

    // ------------------------------------------------------------------
    // Stage 4 - regions: seeds -> grow (colour constancy) -> context score
    // ------------------------------------------------------------------
    const reg = buildRegions({ w, h, N, s, cfg, L, P, srcKind, Y, R, G, B, tex, refR, refG, refB, spreadOf, ceilingOk });
    progress(0.97);

    // light-direction diagnostic: which outward direction of accepted regions is lit?
    return {
      w, h, scale: s, cfg, N, nCand, T, tw, th,
      cls: reg.cls, conf: reg.conf, regions: reg.regions, lightDirEstimate: reg.lightEstimate,
      arrays: { Y, R, G, B, tex, cand, kOut, spreadOut, nValid, cohOut, validMask, litR, litG, litB, P, srcKind, kFin, label: reg.label },
      dirX, dirY, dirHist, L,
      ms: Date.now() - t0
    };
  }

  function ramp01(v, a, b) { return v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); }

  /* Region stage. Works on the analysis grid. */
  function buildRegions(c) {
    const { w, h, N, s, cfg, L, P, srcKind, Y, R, G, B, tex, refR, refG, refB, ceilingOk } = c;
    const seedThr = cfg.seedThr;
    const label = new Int32Array(N);
    const depth = new Uint8Array(N);
    const stack = new Int32Array(N);
    const comps = [null];                      // 1-based
    const N8x = [-1, 0, 1, -1, 1, -1, 0, 1], N8y = [-1, -1, -1, 0, 0, 1, 1, 1];

    // 1) seed components
    for (let i0 = 0; i0 < N; i0++) {
      if (P[i0] < seedThr || label[i0]) continue;
      const id = comps.length;
      let sp = 0; stack[sp++] = i0; label[i0] = id;
      const cs = { id, n: 0, seedN: 0, sumP: 0, sY: 0, sR: 0, sG: 0, sB: 0, rY: 0, rR: 0, rG: 0, rB: 0, priorN: 0 };
      while (sp) {
        const i = stack[--sp];
        cs.n++; cs.seedN++; cs.sumP += P[i]; cs.sY += Y[i]; cs.sR += R[i]; cs.sG += G[i]; cs.sB += B[i];
        cs.rR += refR[i]; cs.rG += refG[i]; cs.rB += refB[i]; cs.rY += luma(refR[i], refG[i], refB[i]);
        if (srcKind[i] === 2) cs.priorN++;
        const x = i % w, y = (i / w) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = x + N8x[k], ny = y + N8y[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (P[j] >= seedThr && !label[j]) { label[j] = id; stack[sp++] = j; }
        }
      }
      if (cs.n < cfg.minSeedPx) {
        // un-label tiny seed comps (isolated pixels / specks)
        // (flood again to clear)
        sp = 0; stack[sp++] = i0; label[i0] = -1;
        while (sp) {
          const i = stack[--sp]; const x = i % w, y = (i / w) | 0;
          for (let k = 0; k < 8; k++) {
            const nx = x + N8x[k], ny = y + N8y[k];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (label[j] === id) { label[j] = -1; stack[sp++] = j; }
          }
        }
        comps.push(null);
        continue;
      }
      const n = cs.n;
      cs.mY = cs.sY / n; cs.mR = cs.sR / n; cs.mG = cs.sG / n; cs.mB = cs.sB / n;
      cs.lR = cs.rR / n; cs.lG = cs.rG / n; cs.lB = cs.rB / n; cs.lY = cs.rY / n;
      comps.push(cs);
    }

    // 2) bounded growth into similar-colour, flat, attenuation-compatible neighbours
    let qh = 0, qt = 0;
    const queue = new Int32Array(N);
    for (let i = 0; i < N; i++) if (label[i] > 0) { queue[qt++] = i; depth[i] = 0; }
    const e = 6;
    while (qh < qt) {
      const i = queue[qh++];
      const id = label[i];
      const cs = comps[id];
      if (depth[i] >= cfg.growDepth) continue;
      const x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + N8x[k], ny = y + N8y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] !== 0) continue;
        const yj = Y[j];
        if (yj < cs.mY * 0.6 || yj > cs.mY * 1.45) continue;
        if (tex[j] > cfg.growTexMax) continue;
        const kk = yj / cs.lY;
        if (kk < cfg.kMin * 0.95 || kk > cfg.kMax) continue;
        // colour proportions close to the region's own colour
        const dr = (R[j] + e) / (yj + e) - (cs.mR + e) / (cs.mY + e);
        const dg = (G[j] + e) / (yj + e) - (cs.mG + e) / (cs.mY + e);
        const db = (B[j] + e) / (yj + e) - (cs.mB + e) / (cs.mY + e);
        if (dr * dr + dg * dg + db * db > cfg.growChroma) continue;
        if (!ceilingOk(R[j], G[j], B[j], cs.lR, cs.lG, cs.lB)) continue;
        label[j] = id; depth[j] = depth[i] + 1; queue[qt++] = j;
        cs.n++;
      }
    }

    // 3) region statistics: texture, boundary context (relative to the light)
    const nc = comps.length;
    for (let id = 1; id < nc; id++) if (comps[id]) {
      const cs = comps[id];
      cs.texSum = 0; cs.cnt = 0; cs.perim = 0; cs.allTot = 0; cs.other = 0;
      cs.tTot = 0; cs.tOcc = 0; cs.aTot = 0; cs.aLit = 0; cs.oTot = 0; cs.oLit = 0;
      cs.minX = w; cs.minY = h; cs.maxX = 0; cs.maxY = 0;
      cs.dirTot = new Float32Array(8); cs.dirLit = new Float32Array(8);
    }
    const OX = [-1, 0, 1, -1, 1, -1, 0, 1], OY = [-1, -1, -1, 0, 0, 1, 1, 1];
    const reach = 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, id = label[i];
        if (id <= 0) continue;
        const cs = comps[id];
        cs.cnt++; cs.texSum += tex[i];
        if (x < cs.minX) cs.minX = x; if (x > cs.maxX) cs.maxX = x;
        if (y < cs.minY) cs.minY = y; if (y > cs.maxY) cs.maxY = y;
        let edge = false;
        for (let k = 0; k < 8; k++) {
          const qx = x + OX[k] * reach, qy = y + OY[k] * reach;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const j = qy * w + qx;
          if (label[j] === id) continue;
          // only count samples that lie just outside the region
          const qx1 = x + OX[k], qy1 = y + OY[k];
          if (qx1 >= 0 && qy1 >= 0 && qx1 < w && qy1 < h && label[qy1 * w + qx1] === id) continue;
          edge = true;
          // classify outside sample relative to the region's lit reference
          const yj = Y[j];
          const ry = cs.lY;
          let lit = false;
          if (yj >= ry * 0.72 && yj <= ry * 1.35 && tex[j] <= cfg.litTexMax) {
            const dr = (R[j] + e) / (yj + e) - (cs.lR + e) / (ry + e);
            const dg = (G[j] + e) / (yj + e) - (cs.lG + e) / (ry + e);
            const db = (B[j] + e) / (yj + e) - (cs.lB + e) / (ry + e);
            lit = dr * dr + dg * dg + db * db < cfg.litChroma;
          }
          const bright = !lit && yj > ry * 1.2;      // kerb / road marking / ridge line
          const ln = Math.hypot(OX[k], OY[k]);
          const dotL = (OX[k] * L[0] + OY[k] * L[1]) / ln;
          cs.dirTot[k]++; if (lit) cs.dirLit[k]++;
          cs.allTot++;
          if (!lit && !bright && yj >= cs.mY * 0.8 && yj <= cs.mY * 1.3) cs.other++;
          if (dotL > 0.5) { cs.tTot++; if (!lit) cs.tOcc++; }
          else if (dotL < -0.5) { cs.aTot++; if (lit || bright) cs.aLit++; }
          else { cs.oTot++; if (lit || bright) cs.oLit++; }
        }
        if (edge) cs.perim++;
      }
    }

    // 4) score regions
    const conf = new Uint8Array(N), cls = new Uint8Array(N);
    const regions = [];
    const dirAgg = new Float64Array(8), dirAggLit = new Float64Array(8);
    for (let id = 1; id < nc; id++) {
      const cs = comps[id];
      if (!cs) continue;
      const n = cs.cnt;
      const areaFull = n * s * s;
      if (areaFull < cfg.minAreaPx) { cs.reject = 'area'; continue; }
      const meanP = cs.sumP / cs.seedN;
      const seedFrac = Math.min(1, cs.seedN / n);
      const meanTex = cs.texSum / n;
      const thick = (2 * n / Math.max(1, cs.perim)) * s;           // mean half-width x2 (full-res px)
      const occToward = cs.tTot >= 3 ? cs.tOcc / cs.tTot : 0.5;
      const litAway = cs.aTot >= 3 ? cs.aLit / cs.aTot : 0.5;
      const litSide = cs.oTot >= 3 ? cs.oLit / cs.oTot : 0.5;
      const ctx = 0.7 * occToward + 0.3 * Math.max(litAway, litSide);
      const flat = 1 - ramp01(meanTex, cfg.regionTexOk, cfg.regionTexMax);
        const geom =
            (0.65 + 0.35 * ramp01(areaFull, cfg.minAreaPx, cfg.minAreaPx * 4)) *
            (0.35 + 0.65 * ramp01(thick, 1.5, 7));
      const otherFrac = cs.allTot ? cs.other / cs.allTot : 0;
      const meanK = cs.mY / cs.lY;
      const kFac = 1 - ramp01(meanK, cfg.meanKOk, cfg.meanKMax);
      const evid = Math.min(1, meanP / cfg.evidenceFull);

        const meanLuma = luma(cs.mR, cs.mG, cs.mB);
        const maxChannel = Math.max(cs.mR, cs.mG, cs.mB);
        const minChannel = Math.min(cs.mR, cs.mG, cs.mB);

        // Dark, nearly neutral pixels resembling the sampled asphalt.
        const neutralDarkRoadLike =
            meanLuma >= 43 &&
            meanLuma <= 61 &&
            maxChannel - minChannel <= 12;

        // Apply a penalty, not a hard rejection, to preserve possible shadows.
        const roadColourPenalty = neutralDarkRoadLike ? 0.55 : 1;

        const score =
            Math.pow(evid, 0.7) *
            (0.25 + 0.75 * ctx) *
            (0.35 + 0.65 * flat) *
            (0.55 + 0.45 * geom) *
            (0.7 + 0.3 * seedFrac) *
            kFac *
            (1 - 0.9 * ramp01(otherFrac, cfg.otherOk, cfg.otherMax)) *
            roadColourPenalty;
      cs.score = score;
      cs.f = { otherFrac, meanK, n, areaFull, meanP, seedFrac, meanTex, thick, occToward, litAway, litSide, ctx, flat, geom, evid, priorShare: cs.priorN / cs.seedN };
      const v = Math.round(255 * Math.min(1, score));
      let k = 0;
      if (score >= cfg.highConfidence) k = 2; else if (score >= cfg.lowConfidence) k = 1;
      cs.k = k;
      if (k >= 1) for (let d = 0; d < 8; d++) { dirAgg[d] += cs.dirTot[d]; dirAggLit[d] += cs.dirLit[d]; }
      regions.push({ id, cx: (cs.minX + cs.maxX) / 2 * s, cy: (cs.minY + cs.maxY) / 2 * s, ...cs.f, score, cls: k, bbox: [cs.minX * s, cs.minY * s, (cs.maxX + 1) * s, (cs.maxY + 1) * s] });
    }
    for (let i = 0; i < N; i++) {
      const id = label[i];
      if (id > 0 && comps[id] && comps[id].k) { cls[i] = comps[id].k; conf[i] = Math.round(255 * Math.min(1, comps[id].score)); }
    }
    // outward-direction lit fractions of accepted regions -> estimated direction toward the light
    let ex = 0, ey = 0;
    for (let d = 0; d < 8; d++) {
      if (dirAgg[d] < 5) continue;
      const lf = dirAggLit[d] / dirAgg[d];
      const len = Math.hypot(OX[d], OY[d]);
      ex += (0.5 - lf) * OX[d] / len; ey += (0.5 - lf) * OY[d] / len;
    }
    const en = Math.hypot(ex, ey) || 1;
    return { cls, conf, label, regions, lightEstimate: [ex / en, ey / en] };
  }

  /* Looser test for a darkened pixel: shade desaturates grass towards olive,
   * but red must not exceed green and blue must stay small (rejects asphalt,
   * navy / red / yellow roofs, water). */
  function isGrassLike(r, g, b) {
    if (g < 14) return false;
    return g / (r + 3) >= 0.98 && (b + 3) / (g + 3) <= 0.55;
  }

  function isGrassChroma(r, g, b) {
    if (g < 14) return false;
    const gr = g / (r + 3), bg = (b + 3) / (g + 3);
    return gr >= 1.12 && gr <= 2.6 && bg <= 0.5;
  }

  /* Sliding-window maximum over a (2r+1)^2 square: separable, O(N) monotonic deque. */
  function slidingMax(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const dq = new Int32Array(Math.max(w, h) + 1);
    function pass(get, set, len) {
      let hd = 0, tl = 0;
      for (let i = 0; i < len + r; i++) {
        if (i < len) {
          const v = get(i);
          while (tl > hd && get(dq[tl - 1]) <= v) tl--;
          dq[tl++] = i;
        }
        const c = i - r;
        if (c >= 0) {
          while (dq[hd] < c - r) hd++;
          set(c, get(dq[hd]));
        }
      }
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      pass(i => src[o + i], (i, v) => { tmp[o + i] = v; }, w);
    }
    for (let x = 0; x < w; x++) {
      pass(i => tmp[i * w + x], (i, v) => { out[i * w + x] = v; }, h);
    }
    return out;
  }

  return { analyseShadows, DEFAULTS };
};

/* Bakes the detector output (cls + conf on the analysis grid) into ONE Uint8
 * lookup grid: 0 = fully lit ... 255 = fully shaded. High-confidence shadow
 * pixels count (almost) fully, low-confidence ones only partly, rejected
 * pixels not at all. A small box blur then softens the shadow edges so that
 * the shade of a moving object changes gradually instead of in a single step.
 *
 * Self-contained on purpose: it runs inside the analysis worker (via
 * toString) as well as on the main thread in the no-Worker fallback. */
function shadowLightBake(cls, conf, w, h, hiThr, loThr) {
  const n = w * h;
  const raw = new Uint8Array(n);
  const loSpan = Math.max(0.01, hiThr - loThr);
  const hiSpan = Math.max(0.01, 1 - hiThr);
  for (let i = 0; i < n; i++) {
    const k = cls[i];
    if (!k) continue;
    const score = conf[i] / 255;
    let wgt;
    if (k === 2) wgt = 0.85 + 0.15 * Math.min(1, Math.max(0, (score - hiThr) / hiSpan));
    else wgt = 0.35 + 0.40 * Math.min(1, Math.max(0, (score - loThr) / loSpan));
    raw[i] = (wgt * 255 + 0.5) | 0;
  }

  // separable box blur, radius r analysis px (= 2r+1 px window), zero padded
  const r = 2, win = 2 * r + 1;
  const tmp = new Uint8Array(n), out = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0;
    for (let k = 0; k <= r && k < w; k++) sum += raw[o + k];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = (sum / win + 0.5) | 0;
      const add = x + r + 1, sub = x - r;
      if (add < w) sum += raw[o + add];
      if (sub >= 0) sum -= raw[o + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = 0; k <= r && k < h; k++) sum += tmp[k * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / win + 0.5) | 0;
      const add = y + r + 1, sub = y - r;
      if (add < h) sum += tmp[add * w + x];
      if (sub >= 0) sum -= tmp[sub * w + x];
    }
  }
  return out;
}

window.ShadowLighting = (function () {
  const SL = {
    status: 'idle',            // idle | loading | analysing | ready | error
    cfg: {},                   // overrides for the detector DEFAULTS (tuned values live there)

    // Look of the effect.
    light: {
      maxDarken: 0.55,         // darkness of a fully shaded object at full daylight (0..1)
      smoothTime: 0.12,        // seconds; temporal smoothing so shade never pops
      dayStart: 5,             // game hours: no shading before this ...
      dayEnd: 20,              // ... or after this
      rampHours: 2             // fade in/out over this many hours inside the window
    },

    grid: null, gw: 0, gh: 0,  // baked shade lookup on the analysis grid (see shadowLightBake)
    gridVersion: 0,
    result: null, worker: null,

    // per-frame state, set by beginFrame()
    on: false, frameId: 0, k: 1, strength: 0, sx: 0, sy: 0
  };
  let started = false, lastT = 0;

  function log(st, msg) {
    SL.status = st;
    if (st === 'error') console.warn('[ShadowLighting] ' + msg);
    else if (msg) console.log('[ShadowLighting] ' + st + ': ' + msg);
  }

  /* ---------------- analysis (once, in the background) ---------------- */

  function readMapPixels() {
    const img = window.mapImage;
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);            // drawn once, onto a private canvas
    // throws SecurityError if the image is cross-origin without CORS headers
    const data = cx.getImageData(0, 0, W, H);
    return { W, H, rgba: data.data };
  }

  function finish(res, W, H) {
    SL.grid = res.shade; SL.gw = res.w; SL.gh = res.h;
    SL.gridVersion++;
    SL.result = { w: res.w, h: res.h, scale: res.scale, W, H, regions: res.regions, lightDir: res.lightDirEstimate };
    log('ready', res.regions.length + ' regions in ' + res.ms + ' ms');
  }

  function run() {
    if (started) return;
    started = true;
    const img = window.mapImage;
    if (!img || !img.complete || !(img.naturalWidth > 0)) { started = false; log('loading', 'map not loaded yet'); return; }
    log('analysing', 'reading map pixels');
    // defer so the game's own start-up is never blocked by this work
    const defer = window.requestIdleCallback
      ? function (fn) { window.requestIdleCallback(fn, { timeout: 1500 }); }
      : function (fn) { setTimeout(fn, 50); };
    defer(function () {
      let px;
      try { px = readMapPixels(); }
      catch (e) { log('error', 'cannot read map pixels (CORS/tainted canvas?): ' + e.message); return; }
      const cfg = Object.assign({}, SL.cfg);
      try {
        const src = '(' + ShadowDetectorCoreFactory.toString() + ')()';
        const blob = new Blob([
          'const core=' + src + ';' +
          'const bake=' + shadowLightBake.toString() + ';' +
          'onmessage=function(e){try{var m=e.data;var r=core.analyseShadows(m.rgba,m.W,m.H,m.cfg,null);' +
          'var c=Object.assign({},core.DEFAULTS,m.cfg);' +
          'var g=bake(r.cls,r.conf,r.w,r.h,c.highConfidence,c.lowConfidence);' +
          'postMessage({done:true,w:r.w,h:r.h,scale:r.scale,shade:g,regions:r.regions,lightDirEstimate:r.lightDirEstimate,ms:r.ms},[g.buffer]);}' +
          'catch(err){postMessage({error:String(err&&err.message||err)});}};'
        ], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const wk = new Worker(url);
        SL.worker = wk;
        wk.onmessage = function (e) {
          const m = e.data;
          if (m.error) { log('error', m.error); wk.terminate(); SL.worker = null; URL.revokeObjectURL(url); return; }
          if (m.done) { finish(m, px.W, px.H); wk.terminate(); SL.worker = null; URL.revokeObjectURL(url); }
        };
        wk.onerror = function (e) { log('error', 'worker failed: ' + e.message); };
        wk.postMessage({ rgba: px.rgba, W: px.W, H: px.H, cfg: cfg }, [px.rgba.buffer]);
        log('analysing', 'running in worker');
      } catch (e) {
        // no Worker / Blob support: run on the main thread (blocks briefly)
        try {
          const core = ShadowDetectorCoreFactory();
          const r = core.analyseShadows(px.rgba, px.W, px.H, cfg, null);
          const c = Object.assign({}, core.DEFAULTS, cfg);
          r.shade = shadowLightBake(r.cls, r.conf, r.w, r.h, c.highConfidence, c.lowConfidence);
          finish(r, px.W, px.H);
        } catch (e2) { log('error', String(e2 && e2.message || e2)); }
      }
    });
  }

  SL.start = function () { if (!started) run(); };
  SL.rerun = function () {
    if (SL.worker) { SL.worker.terminate(); SL.worker = null; }
    started = false; SL.grid = null; SL.result = null;
    run();
  };

  /* ---------------- per-frame setup ---------------- */

  /* Called once per rendered frame, before any entity is drawn. `active` is
   * false indoors (house / dealership), where nothing is shaded. */
  SL.beginFrame = function (active) {
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
    SL.frameId++;
    SL.on = false;
    if (!active || !SL.grid) return;
    if (typeof gameSeconds === 'undefined' || typeof DAY_LENGTH === 'undefined') return;

    // Daylight 0..1: only inside dayStart..dayEnd, easing in/out so the
    // effect follows the sky instead of switching on at a fixed minute.
    const L = SL.light;
    const hour = gameSeconds / DAY_LENGTH * 24;
    if (hour <= L.dayStart || hour >= L.dayEnd) return;
    const day = Math.min(1, (hour - L.dayStart) / L.rampHours, (L.dayEnd - hour) / L.rampHours);
    if (day <= 0.02) return;

    // Same world size the map image is drawn with (see the map drawImage call).
    if (typeof mapWidth === 'undefined' || typeof mapHeight === 'undefined' || !(mapWidth > 0) || !(mapHeight > 0)) return;
    SL.sx = SL.gw / mapWidth;
    SL.sy = SL.gh / mapHeight;
    SL.strength = L.maxDarken * day;
    SL.k = dt > 0 ? 1 - Math.exp(-dt / L.smoothTime) : 1;
    SL.on = true;
  };

  /* ---------------- sampling ---------------- */

  /* Shade weight 0..1 at a world position. */
  function cover(wx, wy) {
    const ix = (wx * SL.sx) | 0, iy = (wy * SL.sy) | 0;
    if (wx < 0 || wy < 0 || ix >= SL.gw || iy >= SL.gh) return 0;
    return SL.grid[iy * SL.gw + ix] * (1 / 255);
  }

  function newState() { return { f: -100, g: -1, x: NaN, y: NaN, a: NaN, t: 0, v: 0 }; }

  /* Ease the displayed value toward the sampled target, once per frame. */
  function advance(st) {
    const gap = SL.frameId - st.f;
    st.f = SL.frameId;
    if (gap > 3) { st.v = st.t; return; }          // newly visible: no fade from a stale value
    const d = st.t - st.v;
    st.v += (d < 0.002 && d > -0.002) ? d : d * SL.k;
  }

  // footprint sample lattices, in fractions of the object's size
  const CAR_X = [-0.33, 0, 0.33];
  const CAR_Y = [-0.4, -0.13, 0.13, 0.4];
  const PED_X = [0, 0.3, -0.3, 0, 0];
  const PED_Y = [0, 0, 0, 0.2, -0.2];

  /* Darkness alpha (0 = unchanged) for a Car, centre x,y, size width x length. */
  SL.car = function (car) {
    if (!SL.on) return 0;
    const st = car._sl || (car._sl = newState());
    if (st.f !== SL.frameId) {
      const x = car.x, y = car.y, a = car.angle;
      if (x !== st.x || y !== st.y || a !== st.a || st.g !== SL.gridVersion) {
        st.x = x; st.y = y; st.a = a; st.g = SL.gridVersion;
        const c = Math.cos(a), s = Math.sin(a);
        let sum = 0;
        for (let i = 0; i < 3; i++) {
          const lx = CAR_X[i] * car.width;
          for (let j = 0; j < 4; j++) {
            const ly = CAR_Y[j] * car.length;
            sum += cover(x + lx * c - ly * s, y + lx * s + ly * c);
          }
        }
        st.t = sum * (1 / 12);
      }
      advance(st);
    }
    return st.v * SL.strength;
  };

  /* Darkness alpha for a pedestrian (player, NPC, driver). (wx, wy) is the
   * body centre in WORLD coordinates. */
  SL.pedestrian = function (p, wx, wy) {
    if (!SL.on) return 0;
    const st = p._sl || (p._sl = newState());
    if (st.f !== SL.frameId) {
      const a = p.angle || 0;
      if (wx !== st.x || wy !== st.y || a !== st.a || st.g !== SL.gridVersion) {
        st.x = wx; st.y = wy; st.a = a; st.g = SL.gridVersion;
        const c = Math.cos(a), s = Math.sin(a), size = p.size;
        let sum = 0;
        for (let i = 0; i < 5; i++) {
          const lx = PED_X[i] * size, ly = PED_Y[i] * size;
          sum += cover(wx + lx * c - ly * s, wy + lx * s + ly * c);
        }
        st.t = sum * (1 / 5);
      }
      advance(st);
    }
    return st.v * SL.strength;
  };

  /* Cached fill style for a darkness alpha (no string building per frame).
   * A very dark, faintly cool neutral: it scales brightness and keeps hue. */
  const STYLE = [];
  SL.style = function (alpha) {
    const i = Math.min(63, Math.round(alpha * 128));
    return STYLE[i] || (STYLE[i] = 'rgba(6,10,22,' + (i / 128).toFixed(3) + ')');
  };

  return SL;
})();
