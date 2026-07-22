// ===== GLOBAL CANVAS & STATE (Declared first so both files can use them!) =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');


let gameActive = false;
let showFullMap = false;

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

   // --- ADJUSTED FOR DARKER, DEEPER NIGHTS ---
   if(hour < 5){
       darkness = 0.60; // Increased from 0.40 for a much darker night
       skyColor = "rgba(5, 10, 30, 0.6)"; // Deeper midnight blue
   } else if(hour < 7){
       let k=(hour-5)/2;
       darkness = 0.60 * (1 - k); // Smooth transition down to day
       skyColor = `rgba(${5 + 195*k}, ${10 + 120*k}, ${30*(1-k) + 80*k}, ${0.6 * (1-k)})`;
   } else if(hour < 18){
       darkness = 0;
       skyColor = "rgba(0,0,0,0)";
   } else if(hour < 20){
       let k=(hour-18)/2;
       darkness = 0.60 * k; // Smooth transition up
       skyColor = `rgba(${200 * (1-k) + 5*k}, ${120 * (1-k) + 10*k}, ${80 * (1-k) + 30*k}, ${0.6 * k})`;
   } else{
       darkness = 0.60; // Increased from 0.40
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
               // Already evicted — skip rent entirely
           } else if (player.rentDebtActive) {
               // Had unpaid debt from yesterday → evict now
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
// --- START BUTTON LOADING DELAY ---
const hasPlayedBefore = localStorage.getItem("gma_has_played") === "true";
const loadingDelay = hasPlayedBefore ? 3500 : 7600;

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

  // Force geometry normalization before frame dispatch begins
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

// --- 4. MAP & COLLISION DETECTORS ---
const mapImage = new Image();
mapImage.crossOrigin = "Anonymous"; 
window.mapImage = mapImage; // Export safely to window global namespace

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');
let mapWidth = 0;
let mapHeight = 0;
let collisionData = null; 

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

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && Math.abs(r - b) < 35);
  const isGreen = (g > r + 15 && g > b + 15);
  const isPeach = (r > 180 && g > 140 && b < 180);
  const isBeige = (r > 190 && g > 190 && b > 160 && Math.abs(r - g) < 20);

  return (isGreyWhiteOrShadow || isGreen || isPeach || isBeige);
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
  return (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 30);
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

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && Math.abs(r - b) < 35);
  const isGreen = (g > r + 15 && g > b + 15);
  return (isGreyWhiteOrShadow || isGreen);
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

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && Math.abs(r - b) < 35);
  return isGreyWhiteOrShadow;
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

  const isGreyOrShadow = (Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && Math.abs(r - b) < 35 && r > 30 && r < 220);
  return isGreyOrShadow;
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
// --- 6. MISSION / TAXI SYSTEM MANAGER ---
class TaxiJobManager {
  constructor(depotX, depotY) {
    this.depotX = depotX;
    this.depotY = depotY;
    this.depotRadius = 35;
    this.rentCost = 100;

    this.isJobActive = false;
    this.rentTimer = 0;        
    this.maxRentTime = 8000;   

    this.currentPassenger = null;
    this.pickupX = 0;
    this.pickupY = 0;
    this.destinationX = 0;
    this.destinationY = 0;
    this.hasPassenger = false;

    this.messageText = "";
    this.messageTimer = 0;
    this.pickupCooldown = 0;
    this.warnedOutOfTaxi = false;
  }

  setMessage(text, duration = 180) {
    this.messageText = text;
    this.messageTimer = duration;
  }

  update(dt, player, cars, npcs) {
    if (this.messageTimer > 0) this.messageTimer -= 1 * dt;  
    if (!this.isJobActive) {
      let distToDepot = Math.sqrt(Math.pow(player.x - this.depotX, 2) + Math.pow(player.y - this.depotY, 2));

      if (distToDepot < 60 && !playerCar) {
        taxiBtn.style.display = 'flex';
      } else {
        taxiBtn.style.display = 'none';
      }
      return; 
    }

    this.rentTimer -= 1 * dt;
    if (this.rentTimer <= 0) {
      this.endJobExpired(player, cars, npcs);
      return;
    }

    if (!playerCar || !playerCar.isTaxi) {
      let taxi = cars.find(c => c.isTaxi);
      if (taxi) {
        let distToTaxi = Math.sqrt(Math.pow(player.x - taxi.x, 2) + Math.pow(player.y - taxi.y, 2));
        if (distToTaxi > 300) {
          this.failJob(player, cars, npcs);
          return;
        }
      }
      if (!this.warnedOutOfTaxi) {
        this.setMessage("Get back into your Taxi! Don't stray too far.", 180);
        this.warnedOutOfTaxi = true;
      }
      return;
    }
    this.warnedOutOfTaxi = false;

    if (this.pickupCooldown > 0) {
      this.pickupCooldown -= 1 * dt;
    }

    if (!this.hasPassenger) {
      if (this.pickupX === 0 && this.pickupY === 0 && this.pickupCooldown <= 0) {
        this.generateNewPickupPoint();
      }

      if (this.pickupX !== 0 && this.pickupY !== 0) {
        let distToPickup = Math.sqrt(Math.pow(playerCar.x - this.pickupX, 2) + Math.pow(playerCar.y - this.pickupY, 2));
        if (distToPickup < 50) {
          this.pickUpPassengerAtPoint();
        }
      }
    } else {
      let distToDest = Math.sqrt(Math.pow(playerCar.x - this.destinationX, 2) + Math.pow(playerCar.y - this.destinationY, 2));
      if (distToDest < 60) {
        this.dropOffPassenger(player, npcs);
      }
    }
  }

  startJob(player, cars) {
    player.money -= this.rentCost;
    localStorage.setItem("gma_player_money", player.money); 

    this.isJobActive = true;
    this.rentTimer = this.maxRentTime;
    this.hasPassenger = false;
    this.currentPassenger = null;
    this.pickupCooldown = 0; 

    let taxiId = cars.length + 999;
    let taxi = new Car(taxiId, this.depotX, this.depotY, "#f1c40f");

    taxi.type = "sedan"; taxi.ownerType = "taxiDepot";
    taxi.width = 16; taxi.length = 28;
    taxi.baseSpeed = 1.2 + Math.random() * 0.5;
    taxi.turnSpeed = 0.05; taxi.sensorLength = 35;
    taxi.isTaxi = true;
    taxi.hasDriver = false;
    taxi.isParked = true; 
    cars.push(taxi);

    playerCar = taxi;
    playerCar.isParked = false; 
    this.generateNewPickupPoint();
  }

  generateNewPickupPoint() {
    let pickPos = getRandomStrictRoadPosition();
    this.pickupX = pickPos.x;
    this.pickupY = pickPos.y;
    this.hasPassenger = false;
    this.setMessage("New customer waiting! Follow the yellow radar tracker to the pickup zone.", 240);
  }

  pickUpPassengerAtPoint() {
    this.hasPassenger = true;
    const shirtColors = ["#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6"];
    const hairColors = ["#2d3436", "#4a3728", "#d35400"];
    const skinColors = ["#ffdbac", "#f1c27d", "#e0ac69"];

    this.currentPassenger = new NPC(
      Date.now(), this.pickupX, this.pickupY,
      shirtColors[Math.floor(Math.random() * shirtColors.length)],
      hairColors[Math.floor(Math.random() * hairColors.length)],
      skinColors[Math.floor(Math.random() * skinColors.length)]
    );
    this.currentPassenger.isPassenger = true;

    this.pickupX = 0;
    this.pickupY = 0;

    let dest = getRandomStrictRoadPosition();
    this.destinationX = dest.x;
    this.destinationY = dest.y;

    this.setMessage("Passenger picked up! Head to the green dropoff zone.", 180);
  }

  dropOffPassenger(player, npcs) {
    let fare = 80 + Math.floor(Math.random() * 60);
    player.money += fare;
    localStorage.setItem("gma_player_money", player.money);

    // Increment completed taxi mission counter
    player.taxiMissionsCompleted = (player.taxiMissionsCompleted || 0) + 1;
    localStorage.setItem("gma_taxi_missions_completed", player.taxiMissionsCompleted);

    if (this.currentPassenger) {
      this.currentPassenger.isPassenger = false;
      this.currentPassenger.x = playerCar.x + 35;
      this.currentPassenger.y = playerCar.y;
      npcs.push(this.currentPassenger); 
    }

    this.hasPassenger = false;
    this.currentPassenger = null;
    this.pickupCooldown = 180; 

    this.setMessage("Passenger arrived safely! Earned $" + fare, 180);
  }

  failJob(player, cars, npcs) {
    player.money -= 80;
    localStorage.setItem("gma_player_money", player.money);
    this.endJobExpired(player, cars, npcs);
    this.setMessage("Abandoned taxi! Penalty: -$80. Taxi despawned.", 300);
  }

  endJobExpired(player, cars, npcs) {
    this.isJobActive = false;

    if (this.hasPassenger && this.currentPassenger) {
      this.currentPassenger.isPassenger = false;
      npcs.push(this.currentPassenger);
    }

    this.hasPassenger = false;
    this.currentPassenger = null;
    this.pickupX = 0;
    this.pickupY = 0;
    this.setMessage("Rental time expired! Taxi despawned.", 300);

    // Despawn taxi whether the player is inside it or has already exited
    let taxiIndex = cars.findIndex(c => c.isTaxi);
    if (taxiIndex > -1) cars.splice(taxiIndex, 1);
    if (playerCar && playerCar.isTaxi) playerCar = null;
  }

  drawUI(ctx) {
    if (this.messageTimer > 0 && this.messageText) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(canvas.width / 2 - 250, 40, 500, 45);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(this.messageText, canvas.width / 2, 68);
    }

    if (this.isJobActive) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(20, 80, 180, 70);
      ctx.fillStyle = "#f1c40f";
      ctx.font = "14px Arial";
      ctx.textAlign = "left";

      let secondsLeft = Math.max(0, Math.floor(this.rentTimer / 60));
      ctx.fillText(` TIME LEFT: ${secondsLeft}s`, 35, 105);
      ctx.fillText(`STATUS: ${this.hasPassenger ? "Ferrying..." : "Searching..."}`, 35, 130);
    }
  }

  drawWorldMarkers(ctx) {
    // Zones and pickup/dropoff points are intentionally invisible in the world view.
    // They remain visible on the radar minimap and full world map.
  }
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