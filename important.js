// ===== GLOBAL CANVAS & STATE (Declared first so both files can use them!) =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameActive = false;
let showFullMap = false;
let desktopControlsOpen = false;
let playerPhoneOpen = false;
console.log("!");
// ============================================================
// HIT & RUN / CRIME CASE SYSTEM
// ============================================================

const HIT_RUN_ESCAPE_DISTANCE = 300;

let pendingHitRunIncidents = [];

let playerHitRunCases = parseInt(
    localStorage.getItem("gma_hit_run_cases") || "0",
    10
);

let playerCarStealCases = parseInt(
    localStorage.getItem("gma_car_steal_cases") || "0",
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

        // Once the player reaches 300 units, the opportunity to
        // report the accident is gone permanently.
        if (distance >= HIT_RUN_ESCAPE_DISTANCE) {
            pendingHitRunIncidents.splice(i, 1);

            playerHitRunCases++;
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

// ============================================================
// PLAYER PHONE


const playerPhone = document.getElementById("playerPhone");

function canOpenPlayerPhone() {
    if (!playerPhone) return false;

    // Phone must never open over the full map.
    if (showFullMap) return false;

    // Phone must not open while the player is being transported
    // after arrest.
    if (player && player.isArrestPassenger) return false;

    return true;
}

function openPlayerPhone() {
    if (!canOpenPlayerPhone()) return false;

    playerPhoneOpen = true;
    playerPhone.style.display = "block";
    playerPhone.setAttribute("aria-hidden", "false");

    return true;
}

function closePlayerPhone() {
    playerPhoneOpen = false;

    if (playerPhone) {
        playerPhone.style.display = "none";
        playerPhone.setAttribute("aria-hidden", "true");
    }
}

function togglePlayerPhone() {
    if (playerPhoneOpen) {
        closePlayerPhone();
        return;
    }

    openPlayerPhone();
}
function openAmbulanceCallScreen() {
    const homeScreen = document.getElementById("phoneHomeScreen");
    const callScreen = document.getElementById("phoneCallScreen");

    if (!homeScreen || !callScreen) return;

    homeScreen.style.display = "none";
    callScreen.style.display = "flex";

    const callStatus = document.getElementById("phoneCallStatus");

    if (callStatus) {
        callStatus.textContent = "Select a contact";
    }
}

function callAmbulance() {
    const callScreen = document.getElementById("phoneCallScreen");
    const callStatus = document.getElementById("phoneCallStatus");

    if (!callScreen) return;

    callScreen.style.display = "flex";

    // The call takes exactly 5 seconds.
    window.ambulanceCallTimer = setTimeout(() => {
        window.ambulanceCallTimer = null;

        const resolved = resolveNearbyHitRunIncidents();

        if (callStatus) {
            callStatus.textContent = resolved
                ? "Ambulance notified"
                : "No reportable accident nearby";
        }

        // Return to the phone home screen shortly after the call.
        setTimeout(() => {
            if (callScreen) {
                callScreen.style.display = "none";
            }

            if (homeScreen) {
                homeScreen.style.display = "flex";
            }
        }, 350);

    }, 5000);
}

function cancelAmbulanceCall() {
    if (window.ambulanceCallTimer) {
        clearTimeout(window.ambulanceCallTimer);
        window.ambulanceCallTimer = null;
    }

    const homeScreen = document.getElementById("phoneHomeScreen");
    const callScreen = document.getElementById("phoneCallScreen");

    if (callScreen) {
        callScreen.style.display = "none";
    }

    if (homeScreen) {
        homeScreen.style.display = "flex";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const callApp =
        document.getElementById("phoneCallApp");

    const ambulanceContact =
        document.getElementById("ambulanceContactButton");

    const phoneBackButton =
        document.getElementById("phoneBackButton");

    if (callApp) {
        callApp.addEventListener("pointerdown", e => {
            e.preventDefault();

            if (!playerPhoneOpen) return;

            openAmbulanceCallScreen();
        });
    }

    if (ambulanceContact) {
        ambulanceContact.addEventListener("pointerdown", e => {
            e.preventDefault();

            if (!playerPhoneOpen) return;

            callAmbulance();
        });
    }

    if (phoneBackButton) {
        phoneBackButton.addEventListener("pointerdown", e => {
            e.preventDefault();

            cancelAmbulanceCall();
        });
    }
});


// ===== DAY / NIGHT SYSTEM =====
let lastTimeSave = 0;
let nightMusicPlaying = false;

const DAY_LENGTH = 15 * 60; 

const savedGameTime = localStorage.getItem("gameTime"); let gameSeconds = (savedGameTime === null) ? (DAY_LENGTH * 0.25) : Number(savedGameTime); if (isNaN(gameSeconds)) { gameSeconds = DAY_LENGTH * 0.25; }

let ambientBrightness = 1;
let skyColor = "rgba(0,0,0,0)";

function updateDayNight(dt){
   gameSeconds += dt / 60;

   if (gameSeconds >= DAY_LENGTH) {
       gameSeconds = 0;
   }

   const t = gameSeconds / DAY_LENGTH;

   // Save game time only every 5 in-game seconds
   if (gameSeconds - lastTimeSave >= 5 || gameSeconds < lastTimeSave) {
       lastTimeSave = gameSeconds;
       localStorage.setItem("gameTime", gameSeconds);
   }

   const hour = t * 24;
   let darkness = 0;

   // --- DYNAMIC TOW BUTTON VISIBILITY ---
   if (typeof towTruckBtn !== 'undefined' && towTruckBtn) {
       if (typeof playerCar !== 'undefined' && playerCar) {
           towTruckBtn.style.display = 'flex';
       } else {
           towTruckBtn.style.display = 'none';
       }
   }

   // --- ADJUSTED FOR DARKER, DEEPER NIGHTS ---
   if(hour < 5){
       darkness = 0.53;
       skyColor = "rgba(5, 10, 30, 0.6)";
   } else if(hour < 7){
       let k=(hour-5)/2;
       darkness = 0.53 * (1 - k);
       skyColor = `rgba(${5 + 195*k}, ${10 + 120*k}, ${30*(1-k) + 80*k}, ${0.6 * (1-k)})`;
   } else if(hour < 18){
       darkness = 0;
       skyColor = "rgba(0,0,0,0)";
   } else if(hour < 20){
       let k=(hour-18)/2;
       darkness = 0.53 * k;
       skyColor = `rgba(${200 * (1-k) + 5*k}, ${120 * (1-k) + 10*k}, ${80 * (1-k) + 30*k}, ${0.6 * k})`;
   } else{
       darkness = 0.53;
       skyColor = "rgba(5, 10, 30, 0.6)";
   }

   ambientBrightness = 1 - darkness;

   if (ambientBrightness < 0.75) {
       if (typeof bgMusic !== 'undefined' && !nightMusicPlaying) {
           bgMusic.loop = true;
           bgMusic.play();
           nightMusicPlaying = true;
       }
   } else {
       if (typeof bgMusic !== 'undefined' && nightMusicPlaying) {
           bgMusic.pause();
           bgMusic.currentTime = 0;
           nightMusicPlaying = false;
       }
   }

  // --- DAILY RENT LOGIC ($80 at 5:30 AM) ---
   if (hour < 5 || hour > 6) {
       if (typeof rentPaidForDayCycle !== 'undefined') rentPaidForDayCycle = false;
   } else if (hour >= 5.5 && hour <= 6.0 && typeof rentPaidForDayCycle !== 'undefined' && !rentPaidForDayCycle) {
       if (typeof player !== 'undefined') {
           if (player.isEvicted) {
               // Already evicted â€” skip rent entirely
           } else if (player.rentDebtActive) {
               // Had unpaid debt from yesterday â†’ evict now
               player.isEvicted = true;
               if (typeof isInsideHouse !== 'undefined' && isInsideHouse) {
                   isInsideHouse = false;
                   player.x = outsideX;
                   player.y = outsideY;
                   player.size = 20;
                   if (typeof exitHomeBtn !== 'undefined') exitHomeBtn.style.display = 'none';
                   if (typeof sleepBtn !== 'undefined') sleepBtn.style.display = 'none';
               }
               if (typeof taxiManager !== 'undefined') taxiManager.setMessage("You've been evicted! Visit the house with $80 to rent it again.", 360);
           } else {
               player.money -= 80;
               localStorage.setItem("gma_player_money", player.money);
               if (player.money < 0) {
                   player.rentDebtActive = true;
                   if (typeof taxiManager !== 'undefined') taxiManager.setMessage("House rent due! Clear your debt before tomorrow.", 300);
               } else {
                   if (typeof taxiManager !== 'undefined') taxiManager.setMessage("Paid Daily House Rent: $80", 240);
               }
           }
       }
       rentPaidForDayCycle = true;
   }
} 

function drawNightOverlay() {
    if (ambientBrightness >= 0.999) return;

    ctx.save();

    const lights = window.buildingLightShapes || [];

    const cameraTarget =
        player.isArrestPassenger && arrestTransportCar
            ? arrestTransportCar
            : player;

    const cameraX = cameraTarget.x;
    const cameraY = cameraTarget.y;

    const cosA = Math.cos(camera.angle);
    const sinA = Math.sin(camera.angle);

    const screenCenterX = canvas.width * 0.5;
    const screenCenterY = canvas.height * 0.5;

    function worldToScreen(x, y) {
        const dx = x - cameraX;
        const dy = y - cameraY;

        return {
            x: screenCenterX + dx * cosA + dy * sinA,
            y: screenCenterY - dx * sinA + dy * cosA
        };
    }

    /*
     * ---------------------------------------------------------
     * FULL NIGHT OVERLAY
     * ---------------------------------------------------------
     *
     * The darkness is always drawn first.
     * Lights are added on top.
     */
    ctx.fillStyle = skyColor;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle =
        `rgba(0,0,20,${1 - ambientBrightness})`;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    if (lights.length === 0 || ambientBrightness >= 0.75) {
        ctx.restore();
        return;
    }

    function isLightInViewport(light) {
        const startScreen = worldToScreen(light.x, light.y);
        const endScreen = worldToScreen(
            light.x + light.nx * light.length * 0.82,
            light.y + light.ny * light.length * 0.82
        );
        const glowMargin = Math.max(35, light.baseWidth * 1.8) + 12;
        const minX = Math.min(startScreen.x, endScreen.x) - glowMargin;
        const maxX = Math.max(startScreen.x, endScreen.x) + glowMargin;
        const minY = Math.min(startScreen.y, endScreen.y) - glowMargin;
        const maxY = Math.max(startScreen.y, endScreen.y) + glowMargin;

        return !(
            maxX < 0 ||
            minX > canvas.width ||
            maxY < 0 ||
            minY > canvas.height
        );
    }

     function drawLightBeam(light) {
    const length = light.length * 0.82;
    const px = -light.ny;
    const py = light.nx;

    const startWidth = light.baseWidth * 0.38;
    const endWidth = light.baseWidth * 1.15;

    const startHalf = startWidth * 0.5;
    const endHalf = endWidth * 0.5;

    const startX = light.x;
    const startY = light.y;

    const endX = light.x + light.nx * length;
    const endY = light.y + light.ny * length;

    const startLeft = worldToScreen(
        startX + px * startHalf,
        startY + py * startHalf
    );

    const startRight = worldToScreen(
        startX - px * startHalf,
        startY - py * startHalf
    );

    const endLeft = worldToScreen(
        endX + px * endHalf,
        endY + py * endHalf
    );

    const endRight = worldToScreen(
        endX - px * endHalf,
        endY - py * endHalf
    );

    /*
     * -----------------------------------------------------
     * MAIN BEAM (High origin brightness fading outward)
     * -----------------------------------------------------
     */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startLeft.x, startLeft.y);
    ctx.lineTo(endLeft.x, endLeft.y);
    ctx.lineTo(endRight.x, endRight.y);
    ctx.lineTo(startRight.x, startRight.y);
    ctx.closePath();
    ctx.clip();

    // The overlay is rendered in screen space, so the gradient must use the
    // transformed screen endpoints rather than fixed world coordinates.
    const gradient = ctx.createLinearGradient(
        startLeft.x,
        startLeft.y,
        endLeft.x,
        endLeft.y
    );

    // High brightness near the origin point
    gradient.addColorStop(0, "rgba(255, 230, 110, 0.75)");
    gradient.addColorStop(0.15, "rgba(255, 230, 110, 0.55)");
    gradient.addColorStop(0.30, "rgba(255, 232, 125, 0.35)");
    gradient.addColorStop(0.50, "rgba(255, 235, 140, 0.20)");
    gradient.addColorStop(0.70, "rgba(255, 238, 155, 0.10)");
    gradient.addColorStop(0.85, "rgba(255, 240, 165, 0.04)");
    gradient.addColorStop(1, "rgba(255, 245, 170, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    /*
     * -----------------------------------------------------
     * EXPANDED SOFT END BLUR
     * -----------------------------------------------------
     */
    ctx.save();
    const endScreen = worldToScreen(endX, endY);
    
    // Increased blur radius and opacity for stronger end diffusion
    const blurRadius = Math.max(35, light.baseWidth * 1.8);

    const endGlow = ctx.createRadialGradient(
        endScreen.x,
        endScreen.y,
        0,
        endScreen.x,
        endScreen.y,
        blurRadius
    );

    endGlow.addColorStop(0, "rgba(255, 235, 140, 0.35)");
    endGlow.addColorStop(0.40, "rgba(255, 235, 140, 0.18)");
    endGlow.addColorStop(0.75, "rgba(255, 235, 140, 0.05)");
    endGlow.addColorStop(1, "rgba(255, 235, 140, 0)");

    ctx.fillStyle = endGlow;
    ctx.beginPath();
    ctx.arc(
        endScreen.x,
        endScreen.y,
        blurRadius,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
}


    /*
     * ---------------------------------------------------------
     * DRAW LIGHTS
     * ---------------------------------------------------------
     */
    for (let i = 0; i < lights.length; i++) {

        const light = lights[i];

        if (!isLightInViewport(light)) {
            continue;
        }

        drawLightBeam(light);
    }

    ctx.restore();
}
                     
function drawClock(){
    const totalMinutes=Math.floor(gameSeconds/DAY_LENGTH*24*60);
    const h=Math.floor(totalMinutes/60);
    const m=totalMinutes%60;

    ctx.save();
    ctx.fillStyle="rgba(0,0,0,.65)";
    const clockX = canvas.width - 730;
    const clockY = 150;

    ctx.fillRect(clockX, clockY, 145, 40);
    ctx.fillStyle = "white";
    ctx.font="bold 20px Arial";
    ctx.textAlign="center";
    ctx.fillText(
        String(h).padStart(2,"0")+":"+
        String(m).padStart(2,"0"),
        clockX + 73,
        clockY + 27
    );
    ctx.restore();
}

// --- 2. START BUTTON LOGIC ---
const startBtn = document.getElementById('startButton');
const startScreen = document.getElementById('startScreen');
const hasPlayedBefore = localStorage.getItem("gma_has_played") === "true";
const loadingDelay = hasPlayedBefore ? 4000 : 8690;

// Loading state
let mapAssetLoaded = false;
let collisionMapAssetLoaded = false;
let minimumLoadingTimeElapsed = false;
let startButtonReady = false;

startBtn.disabled = true;
startBtn.textContent = "Loading...";


function tryEnableStartButton() {
    if (
        minimumLoadingTimeElapsed &&
        mapAssetLoaded &&
        collisionMapAssetLoaded &&
        !startButtonReady
    ) {
        startButtonReady = true;
        startBtn.disabled = false;
        startBtn.textContent = "START GAME";
    }
}

// First-time player: 8.690 seconds.
// Returning player: 4 seconds.
setTimeout(() => {
    minimumLoadingTimeElapsed = true;
    tryEnableStartButton();
}, loadingDelay);

startBtn.addEventListener('click', () => {
  if (startBtn.disabled) return;
  startScreen.style.display = 'none';

  const taxiBtn = document.getElementById('taxiBtn');
  const restaurantBtn = document.getElementById('restaurantBtn');

  const docEl = document.documentElement;
  if (docEl.requestFullscreen) docEl.requestFullscreen().catch(err => {});
  else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();

  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(err => {
      console.warn("Landscape lock request denied or not supported on this device.");
    });
  }

  resizeCanvas();

  gameActive = true;
  showFullMap = false;
      if (typeof taxiManager !== 'undefined') {
      taxiManager.setMessage("Tap SPACE for desktop controls", 300);
      }
  localStorage.setItem("gma_has_played", "true");
  if (typeof gameLoop !== 'undefined') {
      requestAnimationFrame(gameLoop); 
  }
});

// --- 3. DYNAMIC RESIZE FUNCTION ---

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if ((gameActive || showFullMap) && typeof drawGame !== 'undefined') drawGame();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// ===== 4. MAP & COLLISION DETECTORS =====
const mapImage = new Image();
mapImage.crossOrigin = "Anonymous"; 
window.mapImage = mapImage; // Export safely to window global namespace

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');
let mapWidth = 0;
let mapHeight = 0;
let collisionData = null;

// Helper: Evaluates pixel color against terrain rules
function getTerrainType(r, g, b) {
    // 1. Explicitly Blocked Colors
    // Black / near black
    if (r < 30 && g < 30 && b < 30) return "BLOCKED";

    // Light Green with Yellow Accent
    if (g > 150 && r > 120 && b < 100 && (g - b) > 50) return "BLOCKED";

    // Yellow
    if (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50) return "BLOCKED";

    // Non-walkable Blue River
    if (b > r + 20 && b > g + 10) return "BLOCKED";

    // 2. Walkable Surfaces
    // Light Grey Road
if (
    Math.abs(r - g) < 20 &&
    Math.abs(g - b) < 20 &&
    r >= 90 &&
    r <= 130
) return "ROAD";

    // White Road
    if (r > 220 && g > 220 && b > 220) return "ROAD";

    // Dark Green Grass
    if (g > r + 10 && g > b + 10 && g < 160) return "GRASS";

    // Transition Edges (neutral grey edge transitions between surfaces)
    if (Math.abs(r - g) < 65 && Math.abs(g - b) < 65 && Math.abs(r - b) < 65) return "TRANSITION";

    return "BLOCKED";
}

function isGrassOrRoad(x, y) {
    if (!collisionData || mapWidth === 0) return true;

    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}

function isWalkableColor(nextX, nextY, entitySize = 24) {
    const currentMapWidth = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseMapWidth : mapWidth;
    const currentMapHeight = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseMapHeight : mapHeight;
    const data = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseCollisionData : collisionData;

    if (!data || currentMapWidth === 0) return false;

    let checkX = Math.floor(nextX + entitySize / 2);
    let checkY = Math.floor(nextY + entitySize / 2);
    if (checkX < 0 || checkX >= currentMapWidth || checkY < 0 || checkY >= currentMapHeight) return false;

    const index = (checkY * currentMapWidth + checkX) * 4;
    const type = getTerrainType(data[index], data[index + 1], data[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}

// --- ROAD DETECTION CONTROLLERS ---
function isRoadColor(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD";
}

function isPlayerCarWalkable(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}

function isAICarWalkable(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "TRANSITION";
}

function isStrictRoadColor(x, y) {
    return isRoadColor(x, y);
}

function getRandomRoadPosition() {
    let spawned = false;
    let carX = 0, carY = 0, attempts = 0;
    while (!spawned && attempts < 3000) {
        carX = Math.floor(Math.random() * mapWidth);
        carY = Math.floor(Math.random() * mapHeight);
        attempts++;
        if (isRoadColor(carX, carY)) spawned = true;
    }
    return { x: carX, y: carY };
}

function getRandomStrictRoadPosition() {
    return getRandomRoadPosition();
}

function isAngryDriverWalkable(x, y, entitySize = 20) {
    if (!collisionData || mapWidth === 0) return true;

    // Check only the center point to allow easy off-road traversal
    const checkX = Math.floor(x);
    const checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}


        
// --- 8. KEYBOARD & JOYSTICK CONTROLS ---
const activeMoves = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// WASD + Arrow Keys
const keyboardKeyMap = {
    w: "ArrowUp",
    a: "ArrowLeft",
    s: "ArrowDown",
    d: "ArrowRight",
    W: "ArrowUp",
    A: "ArrowLeft",
    S: "ArrowDown",
    D: "ArrowRight",

    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight"
};

window.addEventListener('keydown', e => {

    // SPACE = Open / close desktop controls
    if (e.code === 'Space') {
        e.preventDefault();

        const desktopControlsModal =
            document.getElementById('desktopControlsModal');

        if (!desktopControlsModal) return;

        desktopControlsOpen = !desktopControlsOpen;

        if (desktopControlsOpen) {
            desktopControlsModal.style.display = 'flex';
            gameActive = false;
        } else {
            desktopControlsModal.style.display = 'none';
            gameActive = true;
        }

        return;
    }

    if (!gameActive) return;

    const mappedKey = keyboardKeyMap[e.key];

    if (mappedKey) {
        e.preventDefault();
        activeMoves[mappedKey] = true;
        return;
    }

    // E = Enter / Exit vehicle
    if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();

        if (playerCar) {
            if (
                typeof exitBtn !== 'undefined' &&
                exitBtn &&
                exitBtn.style.display !== 'none'
            ) {
                exitBtn.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    pointerType: 'keyboard'
                }));
            }
        } else {
            if (
                typeof jackBtn !== 'undefined' &&
                jackBtn &&
                jackBtn.style.display !== 'none'
            ) {
                jackBtn.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    pointerType: 'keyboard'
                }));
            }
        }

        return;
    }

    // H = Open / close full map
    if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();

        if (showFullMap) {
    showFullMap = false;
    gameActive = true;
} else {
    if (playerPhoneOpen) {
        closePlayerPhone();
    }

    showFullMap = true;
    gameActive = false;
        }

        return;
    }
    // P = Open / close player phone
if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();

    // Never open the phone while the full map is displayed
    // or while the player is an arrest-transport passenger.
    if (!playerPhoneOpen && !canOpenPlayerPhone()) {
        return;
    }

    togglePlayerPhone();
    return;
}

    // F = Main interaction buttons only
    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();

        const interactButtonIds = [
            'taxiBtn',
            'blackMarketBtn',
            'restaurantBtn',
            'truckBtn',
            'repairGarageBtn',
            'enterDealerBtn',
            'exitDealerBtn',
            'enterHomeBtn',
            'leaveHomeBtn',
            'sleepBtn',
            'exitHomeBtn'
        ];

        for (const id of interactButtonIds) {
            const button = document.getElementById(id);

            if (
                button &&
                button.style.display !== 'none' &&
                button.offsetParent !== null
            ) {
                button.click();
                break;
            }
        }

        return;
    }

    // L = Tow truck
    if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();

        if (
            typeof towTruckBtn !== 'undefined' &&
            towTruckBtn &&
            towTruckBtn.style.display !== 'none'
        ) {
            towTruckBtn.click();
        }

        return;
    }

    // G = Police siren
    if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();

        if (
            typeof sirenBtn !== 'undefined' &&
            sirenBtn &&
            sirenBtn.style.display !== 'none'
        ) {
            sirenBtn.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerType: 'keyboard'
            }));
        }

        return;
    }
});

window.addEventListener('keyup', e => {
    if (!gameActive) return;

    const mappedKey = keyboardKeyMap[e.key];

    if (mappedKey) {
        e.preventDefault();
        activeMoves[mappedKey] = false;
    }
});

// Prevent stuck movement if browser loses focus
window.addEventListener('blur', () => {
    activeMoves.ArrowUp = false;
    activeMoves.ArrowDown = false;
    activeMoves.ArrowLeft = false;
    activeMoves.ArrowRight = false;
});       

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (showFullMap) {
    if (mouseX >= 30 && mouseX <= 160 && mouseY >= 30 && mouseY <= 75) {
      showFullMap = false; gameActive = true; 
    }
    return;
  }

  if (gameActive) {
    const radarRadius = 80, padding = 20;
    const mmX = canvas.width - radarRadius - padding, mmY = radarRadius + padding;
    if (Math.sqrt((mouseX - mmX) ** 2 + (mouseY - mmY) ** 2) <= radarRadius) {
      showFullMap = true; gameActive = false; 
    }
  }
});

const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');
let joystickActive = false, joystickStartX = 0, joystickStartY = 0;
let joystickInputX = 0, joystickInputY = 0, joystickTouchId = null;

if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
      if (!gameActive || joystickActive) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier; joystickActive = true;
      joystickStartX = touch.clientX; joystickStartY = touch.clientY;

      joystickBase.style.left = `${joystickStartX - 50}px`;
      joystickBase.style.top = `${joystickStartY - 50}px`;
      joystickBase.style.display = 'block';
      joystickKnob.style.left = '30px'; joystickKnob.style.top = '30px';
    });

    joystickZone.addEventListener('touchmove', (e) => {
      if (!joystickActive) return;
      e.preventDefault();
      for (let touch of e.touches) {
        if (touch.identifier === joystickTouchId) {
          let deltaX = touch.clientX - joystickStartX, deltaY = touch.clientY - joystickStartY;
          let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const maxRadius = 40; 
          if (distance > maxRadius) { deltaX = (deltaX / distance) * maxRadius; deltaY = (deltaY / distance) * maxRadius; }
          joystickKnob.style.left = `${30 + deltaX}px`; joystickKnob.style.top = `${30 + deltaY}px`;
          joystickInputX = deltaX / maxRadius; joystickInputY = deltaY / maxRadius;
        }
      }
    });

    const endJoystick = (e) => {
      if (!joystickActive) return;
      for (let touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          joystickActive = false; joystickTouchId = null; joystickInputX = 0; joystickInputY = 0;
          joystickBase.style.display = 'none'; 
        }
      }
    };
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);
}
// ============================================================
// PLAYER PHONE SWIPE CONTROL
// Swipe down from the top of the screen = OPEN
// Swipe back upward toward the top = CLOSE
// ========================================

let phoneSwipeStartX = 0;
let phoneSwipeStartY = 0;
let phoneSwipeTracking = false;

canvas.addEventListener("touchstart", (e) => {
    if (!gameActive) return;
    if (!e.touches || e.touches.length !== 1) return;

    const touch = e.touches[0];

    phoneSwipeStartX = touch.clientX;
    phoneSwipeStartY = touch.clientY;

    phoneSwipeTracking = true;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
    if (!phoneSwipeTracking) return;
    if (!e.changedTouches || e.changedTouches.length === 0) {
        phoneSwipeTracking = false;
        return;
    }

    const touch = e.changedTouches[0];

    const deltaX = touch.clientX - phoneSwipeStartX;
    const deltaY = touch.clientY - phoneSwipeStartY;

    phoneSwipeTracking = false;

    // Ignore mostly-horizontal gestures.
    if (Math.abs(deltaY) < Math.abs(deltaX) * 1.35) {
        return;
    }

    const swipeDistance = Math.abs(deltaY);

    // Ignore small finger movements.
    if (swipeDistance < 70) {
        return;
    }

    // OPEN:
    // Swipe DOWN starting near the top edge of the screen.
    if (
        !playerPhoneOpen &&
        deltaY > 0 &&
        phoneSwipeStartY < 120
    ) {
        openPlayerPhone();
        return;
    }

    // CLOSE:
    // Swipe UP toward the top while the phone is open.
    if (
        playerPhoneOpen &&
        deltaY < 0 &&
        touch.clientY < 150
    ) {
        closePlayerPhone();
    }
}, { passive: true });

canvas.addEventListener("touchcancel", () => {
    phoneSwipeTracking = false;
}, { passive: true });
// ============================================================
// A* NAVIGATION SYSTEM
//==================================================

class NavigationSystem {
    constructor() {
        
        // Start with 32 and adjust later if necessary.
        this.cellSize = 32;

        this.grid = [];
        this.gridWidth = 0;
        this.gridHeight = 0;

        this.ready = false;
    }

    // --------------------------------------------------------
    // Convert world/map coordinates to navigation-grid coords
    // --------------------------------------------------------

    worldToGrid(x, y) {
        return {
            x: Math.floor(x / this.cellSize),
            y: Math.floor(y / this.cellSize)
        };
    }

    gridToWorld(x, y) {
        return {
            x: x * this.cellSize + this.cellSize / 2,
            y: y * this.cellSize + this.cellSize / 2
        };
    }

    // --------------------------------------------------------
    // Check whether a navigation cell can be used by vehicles
    // --------------------------------------------------------

    isCellWalkable(gridX, gridY) {
        if (
            gridX < 0 ||
            gridY < 0 ||
            gridX >= this.gridWidth ||
            gridY >= this.gridHeight
        ) {
            return false;
        }

        return this.grid[gridY][gridX] === 0;
    }

    // --------------------------------------------------------
    // Build navigation grid from existing collisionData
        buildGrid() {
        if (!collisionData || mapWidth === 0 || mapHeight === 0) {
            console.warn("Navigation: collisionData is not ready.");
            return false;
        }

        this.gridWidth = Math.ceil(mapWidth / this.cellSize);
        this.gridHeight = Math.ceil(mapHeight / this.cellSize);
        this.grid = new Array(this.gridHeight);

        for (let gy = 0; gy < this.gridHeight; gy++) {
            this.grid[gy] = new Array(this.gridWidth);

            for (let gx = 0; gx < this.gridWidth; gx++) {
                const world = this.gridToWorld(gx, gy);
                
                // Grid cell is walkable if center coordinate falls on road, grass, or transition edge
                let walkable = isGrassOrRoad(world.x, world.y);

                this.grid[gy][gx] = walkable ? 0 : 1;
            }
        }

        this.ready = true;
        console.log(`Navigation grid created: ${this.gridWidth} × ${this.gridHeight}`);
        return true;
        }
    
    
    // Keep coordinates inside the navigation grid
    

    clampGridPosition(pos) {
        return {
            x: Math.max(
                0,
                Math.min(this.gridWidth - 1, pos.x)
            ),

            y: Math.max(
                0,
                Math.min(this.gridHeight - 1, pos.y)
            )
        };
    }

    // --------------------------------------------------------
    // Find nearest usable navigation cell
    // --------------------------------------------------------

    findNearestWalkable(startX, startY) {

        const start = this.clampGridPosition({
            x: startX,
            y: startY
        });

        if (this.isCellWalkable(start.x, start.y)) {
            return start;
        }

        // Search outward in expanding rings.
        for (let radius = 1; radius < 20; radius++) {

            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {

                    // Only inspect the outer edge of the ring.
                    if (
                        Math.abs(x) !== radius &&
                        Math.abs(y) !== radius
                    ) {
                        continue;
                    }

                    const gx = start.x + x;
                    const gy = start.y + y;

                    if (this.isCellWalkable(gx, gy)) {
                        return {
                            x: gx,
                            y: gy
                        };
                    }
                }
            }
        }

        return null;
    }

    // --------------------------------------------------------
    // Heuristic used by A*
    //
    // Diagonal movement is allowed, so use octile distance.
    // --------------------------------------------------------

    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);

        const straight = 1;
        const diagonal = Math.SQRT2;

        return (
            straight * (dx + dy) +
            (diagonal - 2 * straight) *
            Math.min(dx, dy)
        );
    }

    // --------------------------------------------------------
    // Get neighboring cells
    // --------------------------------------------------------

    getNeighbors(node, preferRoads = false) {

        const neighbors = [];

        const directions = [
            { x:  1, y:  0, cost: 1 },
            { x: -1, y:  0, cost: 1 },
            { x:  0, y:  1, cost: 1 },
            { x:  0, y: -1, cost: 1 },

            // Diagonals
            { x:  1, y:  1, cost: Math.SQRT2 },
            { x: -1, y:  1, cost: Math.SQRT2 },
            { x:  1, y: -1, cost: Math.SQRT2 },
            { x: -1, y: -1, cost: Math.SQRT2 }
        ];

        for (const dir of directions) {

            const x = node.x + dir.x;
            const y = node.y + dir.y;

            if (!this.isCellWalkable(x, y)) {
                continue;
            }

            // Prevent diagonal movement through the corner
            // of two blocked cells.
            if (dir.x !== 0 && dir.y !== 0) {

                if (
                    !this.isCellWalkable(
                        node.x + dir.x,
                        node.y
                    ) ||
                    !this.isCellWalkable(
                        node.x,
                        node.y + dir.y
                    )
                ) {
                    continue;
                }
            }

           neighbors.push({
    x,
    y,
    cost: dir.cost * this.getTerrainCost(x, y, preferRoads)
}); 
        }

        return neighbors;
    }

    // --------------------------------------------------------
    // A* PATHFINDING
    //
    // Returns an array of world-coordinate waypoints.
    // --------------------------------------------------------

      getTerrainCost(gridX, gridY, preferRoads = false) {
        if (!preferRoads) return 1;

        if (
            !collisionData ||
            gridX < 0 ||
            gridY < 0 ||
            gridX >= this.gridWidth ||
            gridY >= this.gridHeight
        ) {
            return Infinity;
        }

        const world = this.gridToWorld(gridX, gridY);

        const checkX = Math.floor(world.x);
        const checkY = Math.floor(world.y);

        if (
            checkX < 0 ||
            checkX >= mapWidth ||
            checkY < 0 ||
            checkY >= mapHeight
        ) {
            return Infinity;
        }

        const index = (checkY * mapWidth + checkX) * 4;

        const type = getTerrainType(
            collisionData[index],
            collisionData[index + 1],
            collisionData[index + 2]
        );

        // Strongly prefer roads.
        // Transition is cheap because it is used to enter/leave roads.
        // Grass remains possible, but is expensive.
        if (type === "ROAD") return 1;
        if (type === "TRANSITION") return 2;
        if (type === "GRASS") return 12;

        return Infinity;
    }  findPath(startX, startY, targetX, targetY, preferRoads = false) {

        if (!this.ready) {
            return null;
        }

        const rawStart = this.worldToGrid(startX, startY);
        const rawGoal = this.worldToGrid(targetX, targetY);

        const start = this.findNearestWalkable(
            rawStart.x,
            rawStart.y
        );

        const goal = this.findNearestWalkable(
            rawGoal.x,
            rawGoal.y
        );

        if (!start || !goal) {
            return null;
        }

        // If already at destination.
        if (
            start.x === goal.x &&
            start.y === goal.y
        ) {
            return [
                this.gridToWorld(goal.x, goal.y)
            ];
        }

        const openSet = [];
        const closedSet = new Set();

        const nodes = new Map();

        const startKey = `${start.x},${start.y}`;

        const startNode = {
            x: start.x,
            y: start.y,
            g: 0,
            h: this.heuristic(start, goal),
            f: 0,
            parent: null
        };

        startNode.f =
            startNode.g +
            startNode.h;

        openSet.push(startNode);
        nodes.set(startKey, startNode);

        while (openSet.length > 0) {

            // Find node with lowest f score.
            let bestIndex = 0;

            for (let i = 1; i < openSet.length; i++) {
                if (
                    openSet[i].f <
                    openSet[bestIndex].f
                ) {
                    bestIndex = i;
                }
            }

            const current =
                openSet.splice(bestIndex, 1)[0];

            const currentKey =
                `${current.x},${current.y}`;

            closedSet.add(currentKey);

            // Goal reached.
            if (
                current.x === goal.x &&
                current.y === goal.y
            ) {

                const path = [];

                let node = current;

                while (node) {
                    path.push(
                        this.gridToWorld(
                            node.x,
                            node.y
                        )
                    );

                    node = node.parent;
                }

                path.reverse();

                return path;
            }

            const neighbors =
                this.getNeighbors(current, preferRoads);

            for (const neighbor of neighbors) {

                const key =
                    `${neighbor.x},${neighbor.y}`;

                if (closedSet.has(key)) {
                    continue;
                }

                const tentativeG =
                    current.g +
                    neighbor.cost;

                let neighborNode =
                    nodes.get(key);

                if (!neighborNode) {

                    neighborNode = {
                        x: neighbor.x,
                        y: neighbor.y,
                        g: Infinity,
                        h: 0,
                        f: Infinity,
                        parent: null
                    };

                    nodes.set(key, neighborNode);
                }

                if (tentativeG >= neighborNode.g) {
                    continue;
                }

                neighborNode.parent = current;
                neighborNode.g = tentativeG;
                neighborNode.h =
                    this.heuristic(
                        neighborNode,
                        goal
                    );

                neighborNode.f =                    neighborNode.g +                    neighborNode.h;

                // Add to open set if it isn't already there.
                if (!openSet.includes(neighborNode)) {
                    openSet.push(neighborNode);
                }
            }
        }

        // No route found.
        return null;
    }

    // --------------------------------------------------------
    // Optional helper:
    // Remove unnecessary points from a path.
    //
    // We can improve this later using your collision system.
    // --------------------------------------------------------

    simplifyPath(path) {

        if (!path || path.length <= 2) {
            return path;
        }

        const result = [path[0]];

        let previousDirection = null;

        for (let i = 1; i < path.length; i++) {

            const previous = path[i - 1];
            const current = path[i];

            const dx =
                Math.sign(
                    current.x - previous.x
                );

            const dy =
                Math.sign(
                    current.y - previous.y
                );

            const direction =
                `${dx},${dy}`;

            if (
                previousDirection !== null &&
                direction !== previousDirection
            ) {
                result.push(previous);
            }

            previousDirection = direction;
        }

        result.push(
            path[path.length - 1]
        );

        return result;
    }
}


// GLOBAL NAVIGATION SYSTEM

const navigationSystem =
    new NavigationSystem();

// Helper to check if a car has meaningful movement
function isCarMoving(car, threshold = 0.2) {
    if (!car) return false;

    // Check magnitude of car's current speed property
    if (typeof car.speed === 'number') {
        return Math.abs(car.speed) > threshold;
    }

    // Alternative: check positional displacement (vx, vy) if used in your physics
    if (typeof car.vx === 'number' && typeof car.vy === 'number') {
        return Math.hypot(car.vx, car.vy) > threshold;
    }

    return false;
}
function isEntityOnScreen(entity, margin = 150) {
    if (!entity) return false;

    const dx = entity.x - player.x;
    const dy = entity.y - player.y;

    const maxDistance = Math.max(canvas.width, canvas.height) * 0.75 + margin;

    return dx * dx + dy * dy <= maxDistance * maxDistance;
}