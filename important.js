// ===== GLOBAL CANVAS & STATE (Declared first so both files can use them!) =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameActive = false;
let showFullMap = false;
console.log("fffto");

// ===== DAY / NIGHT SYSTEM =====
let lastTimeSave = 0;
let nightMusicPlaying = false;

const DAY_LENGTH = 15 * 60; 

const savedGameTime = localStorage.getItem("gameTime"); let gameSeconds = (savedGameTime === null) ? (DAY_LENGTH * 0.25) : Number(savedGameTime); if (isNaN(gameSeconds)) { gameSeconds = DAY_LENGTH * 0.25; }

let ambientBrightness = 1;
let skyColor = "rgba(0,0,0,0)";

function updateDayNight(dt){
   gameSeconds += dt / 60;
   localStorage.setItem("gameTime", gameSeconds);

   if (gameSeconds >= DAY_LENGTH) {
       gameSeconds = 0;
   }
   localStorage.setItem("gameTime", gameSeconds);

   const t = gameSeconds / DAY_LENGTH;

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

function drawNightOverlay(){
    ctx.save();
    ctx.fillStyle=skyColor;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=`rgba(0,0,20,${1-ambientBrightness})`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
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

startBtn.disabled = true;
startBtn.textContent = "Loading...";

setTimeout(() => {
    startBtn.disabled = false;
    startBtn.textContent = "START GAME";
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

function isGrassOrRoad(x, y) {
    if (!collisionData || mapWidth === 0) return true; // Default allow if map data hasn't loaded yet

    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const r = collisionData[index];
    const g = collisionData[index + 1];
    const b = collisionData[index + 2];

    // Explicitly block yellow
    const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
    if (isYellow) return false;

    // EXPLICITLY BLOCK BLUE, TEAL, AND PURPLE BUILDINGS
    const isBlue = (b > r + 20 && b > g + 10);
    const isTeal = (g > r + 20 && b > r + 20);
    const isPurple = (r > g + 15 && b > g + 15);
    if (isBlue || isTeal || isPurple) return false;

    const isRoad = (Math.abs(r - g) < 45 && Math.abs(g - b) < 45 && Math.abs(r - b) < 45 && r > 20);
    const isGrass = (g > r + 5 && g > b) || (g > r && g > b + 5);
    const isPeachOrBeige = (r > 160 && g > 120 && b > 100 && r > b + 15);
    const isTransitionEdge = (Math.abs(r - g) < 65 && Math.abs(g - b) < 65 && Math.abs(r - b) < 65);

    return isRoad || isGrass || isPeachOrBeige || isTransitionEdge;
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
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];

  // Explicitly block yellow
  const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
  if (isYellow) return false;

  // EXPLICITLY BLOCK BLUE, TEAL, AND PURPLE BUILDINGS
  const isBlue = (b > r + 20 && b > g + 10);
  const isTeal = (g > r + 20 && b > r + 20);
  const isPurple = (r > g + 15 && b > g + 15);
  if (isBlue || isTeal || isPurple) return false;

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 45 && Math.abs(g - b) < 45 && Math.abs(r - b) < 45);
  const isGreen = (g > r + 5 && g > b) || (g > r && g > b + 5);
  const isPeach = (r > 160 && g > 120 && b < 180 && r > b + 15);
  const isBeige = (r > 170 && g > 170 && b > 140 && Math.abs(r - g) < 30);
  const isTransitionEdge = (Math.abs(r - g) < 65 && Math.abs(g - b) < 65 && Math.abs(r - b) < 65);

  return (isGreyWhiteOrShadow || isGreen || isPeach || isBeige || isTransitionEdge);
}

// --- ROAD DETECTION CONTROLLERS ---
function isRoadColor(x, y) {
  if (!collisionData || mapWidth === 0) return false;
  let checkX = Math.floor(x);
  let checkY = Math.floor(y);
  if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

  const index = (checkY * mapWidth + checkX) * 4;
  const r = collisionData[index];
  const g = collisionData[index + 1];
  const b = collisionData[index + 2];

  // Explicitly block yellow
  const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
  if (isYellow) return false;

  // EXPLICITLY BLOCK BLUE, TEAL, AND PURPLE
  const isBlue = (b > r + 20 && b > g + 10);
  const isTeal = (g > r + 20 && b > r + 20);
  const isPurple = (r > g + 15 && b > g + 15);
  if (isBlue || isTeal || isPurple) return false;

  const isGreyRoad = (Math.abs(r - g) < 45 && Math.abs(g - b) < 45 && r > 25);
  const isWhiteLine = (r > 180 && g > 180 && b > 180);

  return isGreyRoad || isWhiteLine;
}

function isPlayerCarWalkable(x, y) {
  if (!collisionData || mapWidth === 0) return false;
  let checkX = Math.floor(x);
  let checkY = Math.floor(y);
  if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

  const index = (checkY * mapWidth + checkX) * 4;
  const r = collisionData[index];
  const g = collisionData[index + 1];
  const b = collisionData[index + 2];

  // Explicitly block yellow
  const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
  if (isYellow) return false;

  // EXPLICITLY BLOCK BLUE, TEAL, AND PURPLE BUILDINGS
  const isBlue = (b > r + 20 && b > g + 10);
  const isTeal = (g > r + 20 && b > r + 20);
  const isPurple = (r > g + 15 && b > g + 15);
  if (isBlue || isTeal || isPurple) return false;

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 45 && Math.abs(g - b) < 45 && Math.abs(r - b) < 45);
  const isBrightLine = (r > 180 && g > 180 && b > 180);
  const isGreen = (g > r + 5 && g > b) || (g > r && g > b + 5);
  const isPeach = (r > 160 && g > 120 && b < 180 && r > b + 15);
  const isBeige = (r > 170 && g > 170 && b > 140 && Math.abs(r - g) < 30);
  const isEdgeTransition = (Math.abs(r - g) < 65 && Math.abs(g - b) < 65 && Math.abs(r - b) < 65);

  return (isGreyWhiteOrShadow || isBrightLine || isGreen || isPeach || isBeige || isEdgeTransition);
}

function isAICarWalkable(x, y) {
  if (!collisionData || mapWidth === 0) return false;
  let checkX = Math.floor(x);
  let checkY = Math.floor(y);
  if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

  const index = (checkY * mapWidth + checkX) * 4;
  const r = collisionData[index];
  const g = collisionData[index + 1];
  const b = collisionData[index + 2];

  // Explicitly block yellow
  const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
  if (isYellow) return false;

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && Math.abs(r - b) < 40);
  const isBrightLine = (r > 190 && g > 190 && b > 190);

  return (isGreyWhiteOrShadow || isBrightLine);
}

function isStrictRoadColor(x, y) {
  if (!collisionData || mapWidth === 0) return false;
  let checkX = Math.floor(x);
  let checkY = Math.floor(y);
  if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

  const index = (checkY * mapWidth + checkX) * 4;
  const r = collisionData[index];
  const g = collisionData[index + 1];
  const b = collisionData[index + 2];

  // Explicitly block yellow
  const isYellow = (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50);
  if (isYellow) return false;

  const isGreyOrShadow = (Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && Math.abs(r - b) < 40 && r > 30);
  const isBrightLine = (r > 190 && g > 190 && b > 190);

  return isGreyOrShadow || isBrightLine;
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
  let spawned = false;
  let carX = 0, carY = 0, attempts = 0;
  while (!spawned && attempts < 3000) {
    carX = Math.floor(Math.random() * mapWidth);
    carY = Math.floor(Math.random() * mapHeight);
    attempts++;
    if (isStrictRoadColor(carX, carY)) spawned = true;
  }
  return { x: carX, y: carY };
}

// --- 8. KEYBOARD & JOYSTICK CONTROLS ---
const activeMoves = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
window.addEventListener('keydown', e => { if(gameActive) activeMoves[e.key] = true; });
window.addEventListener('keyup', e => { if(gameActive) activeMoves[e.key] = false; });

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