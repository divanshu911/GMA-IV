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
       darkness = 0.53; // Increased from 0.40 for a much darker night
       skyColor = "rgba(5, 10, 30, 0.6)"; // Deeper midnight blue
   } else if(hour < 7){
       let k=(hour-5)/2;
       darkness = 0.53 * (1 - k); // Smooth transition down to day
       skyColor = `rgba(${5 + 195*k}, ${10 + 120*k}, ${30*(1-k) + 80*k}, ${0.6 * (1-k)})`;
   } else if(hour < 18){
       darkness = 0;
       skyColor = "rgba(0,0,0,0)";
   } else if(hour < 20){
       let k=(hour-18)/2;
       darkness = 0.53 * k; // Smooth transition up
       skyColor = `rgba(${200 * (1-k) + 5*k}, ${120 * (1-k) + 10*k}, ${80 * (1-k) + 30*k}, ${0.6 * k})`;
   } else{
       darkness = 0.53; // Increased from 0.40
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

    const isRoad = (Math.abs(r - g) < 50 && Math.abs(g - b) < 50 && r > 20);
    const isGrass = (g > r + 10 && g > b + 10) || (g > 50 && g >= r - 10 && g >= b - 10);
    const isPeachOrBeige = (r > 170 && g > 130 && b > 120);
    const isTransitionEdge = (Math.abs(r - g) < 70 && Math.abs(g - b) < 70 && Math.abs(r - b) < 70);

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

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 50 && Math.abs(g - b) < 50 && Math.abs(r - b) < 50);
  const isGreen = (g > r + 10 && g > b + 10) || (g > 50 && g >= r - 10 && g >= b - 10);
  const isPeach = (r > 170 && g > 130 && b < 180);
  const isBeige = (r > 180 && g > 180 && b > 150);
  const isTransitionEdge = (Math.abs(r - g) < 70 && Math.abs(g - b) < 70 && Math.abs(r - b) < 70);

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

  const isGreyRoad = (Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && r > 30);
  const isWhiteLine = (r > 190 && g > 190 && b > 190);

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

  const isGreyWhiteOrShadow = (Math.abs(r - g) < 50 && Math.abs(g - b) < 50 && Math.abs(r - b) < 50);
  const isBrightLine = (r > 180 && g > 180 && b > 180);
  const isGreen = (g > r + 10 && g > b + 10) || (g > 50 && g >= r - 10 && g >= b - 10);
  const isPeach = (r > 170 && g > 130 && b < 180);
  const isBeige = (r > 180 && g > 180 && b > 150);
  // Edge transition color tolerance (curbs, dirt, road-grass blend)
  const isEdgeTransition = (Math.abs(r - g) < 70 && Math.abs(g - b) < 70 && Math.abs(r - b) < 70);

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

  }
}
const taxiBtn = document.getElementById('taxiBtn');
if (taxiBtn) {
    taxiBtn.addEventListener('click', () => {
      if (player.money >= taxiManager.rentCost) {
        taxiManager.startJob(player, cars);
        taxiBtn.style.display = 'none'; 
      } else {
        taxiManager.setMessage("Not enough money to rent a Taxi! Need $" + taxiManager.rentCost, 60);
      }
    });}
let taxiManager = new TaxiJobManager(2908, 950);
  // --- BLACK MARKET ZONE ---
const blackMarketZone = { x: 3412, y: 1435, radius: 65, soldTimes: [] };
const blackMarketBtn = document.getElementById('blackMarketBtn');
if (blackMarketBtn) {
    blackMarketBtn.style.right = '70%'; 
    blackMarketBtn.style.background = 'rgba(142, 68, 173, 0.7)'; 
    blackMarketBtn.style.display = 'none';

    blackMarketBtn.addEventListener('click', () => {
        const currentHour = (typeof gameSeconds !== 'undefined' && typeof DAY_LENGTH !== 'undefined') ? (gameSeconds / DAY_LENGTH) * 24 : 12;

        blackMarketZone.soldTimes = blackMarketZone.soldTimes.filter(saleTime => {
            let diff = currentHour - saleTime;
            if (diff < 0) diff += 24; 
            return diff <= 6.0;
        });

        if (blackMarketZone.soldTimes.length >= 2) {
            taxiManager.setMessage("Black market is hot! Come back later. (Limit: 2 cars per 6 hours)", 180);
            return;
        }

        let carToSell = null;
        for (let i = 0; i < cars.length; i++) {
            let c = cars[i];
            if (c.isParked && !c.hasDriver) {
                let dist = Math.sqrt(Math.pow(c.x - blackMarketZone.x, 2) + Math.pow(c.y - blackMarketZone.y, 2));
                if (dist < blackMarketZone.radius) {
                    carToSell = c;
                    break;
                } 
            } 
        }

        if (!carToSell) {
            taxiManager.setMessage("No car parked here! Park a stolen car inside the purple zone to sell it.", 180);
            return;
        }
        if (carToSell.ownerType !== "civilian") {
          taxiManager.setMessage("The black market only buys civillian owned vehicles.", 180);
          return;
        }

        let carType = carToSell.type || "Commuter, Sedan"; 
        let price = 50; 

        if (carType === "Hauler, Truck") price = 70;
        else if (carType === "Falcon, Sports") price = 95;
        else if (carType === "Ranger, SUV") price = 80;
        else if (carType === "Porter, Van") price = 65; 
        else if (carType === "Sprint, Hatchback") price = 40;

        player.money += price;
        localStorage.setItem("gma_player_money", player.money);
        taxiManager.setMessage(`Sold a ${carType} for $${price}!`, 180);

        let carIndex = cars.indexOf(carToSell);
        if (carIndex > -1) cars.splice(carIndex, 1);
        blackMarketZone.soldTimes.push(currentHour);
        blackMarketBtn.style.display = 'none';
    });
}
  // --- TRUCK JOB SYSTEM MANAGER ---
class TruckJobManager {
  constructor(companyX, companyY) {
    this.companyX = companyX;
    this.companyY = companyY;
    this.companyRadius = 60;

    this.isJobActive = false;
    this.stage = 0; 
    this.truck = null;

    this.pickupX = 0;
    this.pickupY = 0;
    this.destinationX = 0;
    this.destinationY = 0;

    this.messageText = "";
    this.messageTimer = 0;
    this.warnedOutOfTruck = false;
  }

  setMessage(text, duration = 180) {
    this.messageText = text;
    this.messageTimer = duration;
  }

  startJob(player, cars) {
    this.isJobActive = true;
    this.stage = 1; 

    let truckId = cars.length + 2000;
    this.truck = new Car(truckId, this.companyX, this.companyY, "#e67e22");
    this.truck.ownerType = "truckCompany";   
    this.truck.type = "Hauler, Truck";
    this.truck.width = 23;
    this.truck.length = 56;
    this.truck.baseSpeed = 0.9 + Math.random() * 0.4;
    this.truck.turnSpeed = 0.022;
    this.truck.sensorLength = 55;
    this.truck.isParked = false;
    this.truck.hasDriver = false;

    cars.push(this.truck);
    playerCar = this.truck; 

    this.generatePickupPoint();
    taxiManager.setMessage("Truck Job Started! Drive to the orange cargo pickup zone.", 240);
  }

  generatePickupPoint() {
    let pos = typeof getRandomStrictRoadPosition === 'function' ? getRandomStrictRoadPosition() : { x: 2000, y: 2000 };
    this.pickupX = pos.x;
    this.pickupY = pos.y;
  }

  generateDropoffPoint() {
    let pos = typeof getRandomStrictRoadPosition === 'function' ? getRandomStrictRoadPosition() : { x: 2200, y: 2200 };
    this.destinationX = pos.x;
    this.destinationY = pos.y;
  }

  failJob(player, cars) {
    player.money -= 140; 
    localStorage.setItem("gma_player_money", player.money);
    this.setMessage("Mission Failed! Left the truck behind. Penalty: -$140", 240);
    this.cleanup(cars);
  }

  cleanup(cars) {
    this.isJobActive = false;
    this.stage = 0;
    if (this.truck) {
      let index = cars.findIndex(c => c.id === this.truck.id);
      if (index > -1) cars.splice(index, 1);
      if (playerCar === this.truck) playerCar = null;
      this.truck = null;
    }
    this.pickupX = 0;
    this.pickupY = 0;
    this.destinationX = 0;
    this.destinationY = 0;
  }

  update(dt, player, cars) {
    if (this.messageTimer > 0) this.messageTimer -= 1 * dt;

    let distToCompany = Math.sqrt(Math.pow(player.x - this.companyX, 2) + Math.pow(player.y - this.companyY, 2));
    const btn = document.getElementById('truckBtn');

    if (!this.isJobActive && distToCompany < this.companyRadius && !playerCar) {
      if (btn) btn.style.display = 'flex';
    } else {
      if (btn) btn.style.display = 'none';
    }

    if (!this.isJobActive) return;

    if (playerCar !== this.truck && this.truck) {
      let distToTruck = Math.sqrt(Math.pow(player.x - this.truck.x, 2) + Math.pow(player.y - this.truck.y, 2));
      if (distToTruck > 300) {
        this.failJob(player, cars);
        return;
      } else if (!this.warnedOutOfTruck) {
        this.setMessage("Get back in the truck! Don't leave it to avoid penalty.", 180);
        this.warnedOutOfTruck = true;
      }
    }

    if (playerCar === this.truck) {
      this.warnedOutOfTruck = false;
      if (this.stage === 1) {
        let dist = Math.sqrt(Math.pow(this.truck.x - this.pickupX, 2) + Math.pow(this.truck.y - this.pickupY, 2));
        if (dist < 60) {
          this.stage = 2;
          this.pickupX = 0;
          this.pickupY = 0;
          this.generateDropoffPoint();
          truckManager.setMessage("Goods Loaded! Deliver them safely to the green waypoint.", 240);
        }
      } else if (this.stage === 2) {
        let dist = Math.sqrt(Math.pow(this.truck.x - this.destinationX, 2) + Math.pow(this.truck.y - this.destinationY, 2));
        if (dist < 60) {
          this.stage = 3;
          this.destinationX = 0;
          this.destinationY = 0;
          truckManager.setMessage("Goods Delivered! Return the truck to the Truck Company zone.", 240);
        }
      } else if (this.stage === 3) {
        let dist = Math.sqrt(Math.pow(this.truck.x - this.companyX, 2) + Math.pow(this.truck.y - this.companyY, 2));
        if (dist < 60) {
          let reward = 150 + Math.floor(Math.random() * 71); 
          player.money += reward;
          localStorage.setItem("gma_player_money", player.money);
          truckManager.setMessage(`Cargo Completed! Job Pay: +$${reward}`, 240);
          this.cleanup(cars);
        }
      }
    }
  }

  drawUI(ctx) {
    if (this.messageTimer > 0 && this.messageText) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(canvas.width / 2 - 250, 95, 500, 45);
      ctx.fillStyle = "#e67e22";
      ctx.font = "bold 15px Arial";
      ctx.textAlign = "center";
      ctx.fillText(this.messageText, canvas.width / 2, 123);
    }
  }

  drawWorldMarkers(ctx) {}
}

let truckManager = new TruckJobManager(2491, 2206);

const truckBtn = document.getElementById('truckBtn');
if (truckBtn) {
    truckBtn.style.right = '70%'; 
    truckBtn.style.background = 'rgba(230, 126, 34, 0.7)'; 

    truckBtn.addEventListener('click', () => {
      let completedTaxi = player.taxiMissionsCompleted || parseInt(localStorage.getItem("gma_taxi_missions_completed") || "0");

      if (completedTaxi >= 15) {
        truckManager.startJob(player, cars);
        truckBtn.style.display = 'none';
      } else {
        let missingMissions = 15 - completedTaxi;
        truckManager.setMessage(`Locked: Complete ${missingMissions} more Taxi jobs to unlock Cargo Missions!`, 180);
      }
    });
}

 // ===== REPAIR GARAGE GLOBAL DECLARATIONS =====
const repairGarageZone = { x: 869, y: 702, radius: 60 };
let repairGarageBtn = null;
let towTruckBtn = null;

window.addEventListener('load', () => {
    // UI Buttons for Repair & Tow Truck
    repairGarageBtn = initHomeBtn('repairGarageBtn', 'REPAIR GARAGE', '#1abc9c', '110px');
    towTruckBtn = initHomeBtn('towTruckBtn', 'TOW ($250)', '#e67e22', '160px');

    // Repair Confirmation Modal Dialog
    let carToRepair = null;
    let calculatedRepairCost = 0;

    let repairModal = document.createElement('div');
    repairModal.id = 'repairModal';
    repairModal.style.position = 'absolute';
    repairModal.style.top = '30%';
    repairModal.style.left = '50%';
    repairModal.style.transform = 'translate(-50%, -50%)';
    repairModal.style.background = 'rgba(20, 20, 20, 0.95)';
    repairModal.style.border = '2px solid #1abc9c';
    repairModal.style.borderRadius = '10px';
    repairModal.style.padding = '20px';
    repairModal.style.color = '#ffffff';
    repairModal.style.fontFamily = 'Arial, sans-serif';
    repairModal.style.textAlign = 'center';
    repairModal.style.zIndex = '2000';
    repairModal.style.display = 'none';

    repairModal.innerHTML = `
        <h3 style="margin-top:0; color:#1abc9c;">🔧</h3>
        <p id="repairModalText" style="margin:15px 0; font-size:14px; color:#ddd;"></p>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:15px;">
            <button id="confirmRepairBtn" style="padding:8px 18px; background:#2ecc71; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔧</button>
            <button id="cancelRepairBtn" style="padding:8px 18px; background:#e74c3c; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">✖️</button>
        </div>
    `;
    (document.getElementById('gameContainer') || document.body).appendChild(repairModal);

    // REPAIR GARAGE BUTTON CLICK
    if (repairGarageBtn) {
 repairGarageBtn.addEventListener('click', () => {
            const parkedCar = cars.find(c => {
                let d = Math.hypot(c.x - repairGarageZone.x, c.y - repairGarageZone.y);
                return d <= repairGarageZone.radius + 20;
            });

            if (!parkedCar || parkedCar.exploded) {
                taxiManager.setMessage("No car parked here", 180);
                return;
            }

            const maxHealth = parkedCar.maxHealth || 250;

            if (parkedCar.health >= maxHealth) {
                taxiManager.setMessage("Vehicle is already in perfect condition!", 180);
                return;
            }

            const basePrice = carPrices[parkedCar.type] || 4000;
            const missingHealth = maxHealth - parkedCar.health;
            const missingHealthRatio = missingHealth / maxHealth;
//12% of dealership price 
            const rawCost = Math.round(missingHealthRatio * basePrice * 0.12);

            // Only applies the $50 minimum fee if the car is actually damaged
            calculatedRepairCost = missingHealth > 0 ? Math.max(50, rawCost) : 0;
            carToRepair = parkedCar;

            const textElem = document.getElementById('repairModalText');
            if (textElem) {
                textElem.innerText = `Repair ${parkedCar.type || 'Vehicle'}?\nRepair Cost: $${calculatedRepairCost}`;
            }
            repairModal.style.display = 'block';
        });
    }       

    // CONFIRM REPAIR
    const confirmRepairBtn = document.getElementById('confirmRepairBtn');
    if (confirmRepairBtn) {
        confirmRepairBtn.addEventListener('click', () => {
            if (carToRepair && calculatedRepairCost > 0) {
    if (player.money >= calculatedRepairCost) {
        player.money -= calculatedRepairCost;
        localStorage.setItem("gma_player_money", player.money);

        // Dynamically heal to full maxHealth instead of hardcoding 250
        carToRepair.health = carToRepair.maxHealth || 250;
        carToRepair.engineDeadPlayed = false;

        taxiManager.setMessage(`Vehicle fully repaired for $${calculatedRepairCost}!`, 200);
    }
            } else {
                    taxiManager.setMessage("Not enough money for repairs!", 180);
                }
           repairModal.style.display = 'none';
            carToRepair = null;
        });
    }

    // CANCEL REPAIR
    const cancelRepairBtn = document.getElementById('cancelRepairBtn');
    if (cancelRepairBtn) {
        cancelRepairBtn.addEventListener('click', () => {
            repairModal.style.display = 'none';
            carToRepair = null;
        });
    }

    // TOW TRUCK BUTTON CLICK
    if (towTruckBtn) {
        towTruckBtn.addEventListener('click', () => {
            if (playerCar && playerCar.health <= 0) {
                if (player.money >= 250) {
                    player.money -= 250;
                    localStorage.setItem("gma_player_money", player.money);

                    playerCar.x = repairGarageZone.x;
                    playerCar.y = repairGarageZone.y;
                    playerCar.speed = 0;
                    player.x = repairGarageZone.x;
                    player.y = repairGarageZone.y;

                    taxiManager.setMessage("Tow truck delivered your car to the Repair Garage! (-$250)", 240);
                } else {
                    taxiManager.setMessage("Not enough money for Tow Truck ($250 needed)!", 180);
                }
            }
        });
    }
});
//dealership=======>
const dealershipZone = { x: 2748, y: 295, radius: 55 };
let isInsideDealership = false;
let dealershipCars = [];
let viewingCar = null;

const carPrices = {
    "Commuter, Sedan": 4200,
    "Sprint, Hatchback": 3000,
    "Ranger, SUV": 6300,
    "Porter, Van": 5500,
    "Falcon, Sports": 8900
};

let dealershipMapWidth = 800;
let dealershipMapHeight = 600;

function applyCarStats(car, type) {
    car.type = type || car.type || "Commuter, Sedan";
    if (car.type === "Hauler, Truck") {
        car.width = 23; car.length = 56; car.baseSpeed = 1.1; car.turnSpeed = 0.022; car.sensorLength = 55; car.weightMultiplier = 4.0;
    } else if (car.type === "Porter, Van") {
        car.width = 21; car.length = 44; car.baseSpeed = 1.0; car.turnSpeed = 0.028; car.sensorLength = 45; car.weightMultiplier = 2.6;
    } else if (car.type === "Ranger, SUV") {
        car.width = 19; car.length = 34; car.baseSpeed = 1.7; car.turnSpeed = 0.065; car.sensorLength = 38; car.weightMultiplier = 2.5;
    } else if (car.type === "Sprint, Hatchback") {
        car.width = 15; car.length = 25; car.baseSpeed = 1.15; car.turnSpeed = 0.055; car.sensorLength = 35; car.weightMultiplier = 1.0;
    } else if (car.type === "Falcon, Sports") {
        car.width = 15; car.length = 26; car.baseSpeed = 2.1; car.turnSpeed = 0.08; car.sensorLength = 35; car.weightMultiplier = 1.2;
    } else {
        car.type = "Commuter, Sedan";
        car.width = 16; car.length = 28; car.baseSpeed = 1.4; car.turnSpeed = 0.05; car.sensorLength = 35; car.weightMultiplier = 1.5;
    }
    car.speed = car.baseSpeed;
}
const enterDealerBtn = document.getElementById('enterDealerBtn');
const exitDealerBtn = document.getElementById('exitDealerBtn');
const dealershipPanel = document.getElementById('dealershipPanel');
const buyCarBtn = document.getElementById('buyCarBtn');

if (enterDealerBtn) {
    enterDealerBtn.addEventListener('click', () => {
        let ownsCar = localStorage.getItem("gma_player_owned_car");
        if (ownsCar && !player.isEvicted) {
            taxiManager.setMessage("Buying a car will not store it at home, your current home allows one car", 300);
        }

        isInsideDealership = true;
        outsideX = player.x;
        outsideY = player.y;

        player.x = (dealershipMapWidth > 0 ? dealershipMapWidth : 800) / 2;
        player.y = (dealershipMapHeight > 0 ? dealershipMapHeight : 600) - 80;
        player.size = 30; 
        enterDealerBtn.style.display = 'none';

        const typesToSpawn = ["Sprint, Hatchback", "Commuter, Sedan", "Ranger, SUV", "Porter, Van", "Falcon, Sports"];
        dealershipCars = [];

        let startX = 100;
        typesToSpawn.forEach((type, index) => {
            let displayCar = new Car(8000 + index, startX + (index * 160), 220, "#ffffff", false, type);
            applyCarStats(displayCar, type);
            displayCar.isParked = true;
            displayCar.hasDriver = false;
            displayCar.angle = Math.PI / 2; 
            dealershipCars.push(displayCar);
        });
    });
}

if (exitDealerBtn) {
    exitDealerBtn.addEventListener('click', () => {
        isInsideDealership = false;
        player.x = outsideX;
        player.y = outsideY;
        player.size = 20; 
        exitDealerBtn.style.display = 'none';
        if (dealershipPanel) dealershipPanel.style.display = 'none';
    });
}
const closePanelBtn = document.getElementById('closePanelBtn');
if (closePanelBtn) {
    closePanelBtn.addEventListener('click', () => {
        if (dealershipPanel) dealershipPanel.style.display = 'none';
    });
}

if (buyCarBtn) {
    buyCarBtn.addEventListener('click', () => {
        if (!viewingCar) return;
        let price = carPrices[viewingCar.type];
        if (player.money >= price) {
            player.money -= price;
            localStorage.setItem("gma_player_money", player.money);

            let colorPicker = document.getElementById('carColorPicker');
            let pickedColor = colorPicker ? colorPicker.value : "#ffffff";
            let spawnX = dealershipZone.x + 80;
            let spawnY = dealershipZone.y + 40;

            let hasFirstCar = localStorage.getItem("gma_player_owned_car") !== null;

            if (!hasFirstCar) {
                let firstCarData = { type: viewingCar.type, color: pickedColor };
                if (player.isEvicted) {
                    firstCarData.x = spawnX;
                    firstCarData.y = spawnY;
                }
                localStorage.setItem("gma_player_owned_car", JSON.stringify(firstCarData));

                let boughtCar = new Car(cars.length + 9000, spawnX, spawnY, pickedColor, false, viewingCar.type);
                applyCarStats(boughtCar, viewingCar.type);
                boughtCar.isParked = true;
                boughtCar.hasDriver = false;
                boughtCar.ownerType = "playerOwned";
                boughtCar.isFirstCar = true;
                cars.push(boughtCar);

                taxiManager.setMessage(`Bought ${viewingCar.type}, parked outside!`, 240);
            } else {
                let secondCarData = {
                    type: viewingCar.type,
                    color: pickedColor,
                    x: spawnX,
                    y: spawnY
                };
                localStorage.setItem("gma_player_second_car", JSON.stringify(secondCarData));

                let boughtCar = new Car(cars.length + 9050, spawnX, spawnY, pickedColor, false, viewingCar.type);
                applyCarStats(boughtCar, viewingCar.type);
                boughtCar.isParked = true;
                boughtCar.hasDriver = false;
                boughtCar.ownerType = "playerOwned";
                boughtCar.isSecondCar = true;
                cars.push(boughtCar);

                taxiManager.setMessage(`Bought second ${viewingCar.type}! Parked outside.`, 240);
            }

            if (dealershipPanel) dealershipPanel.style.display = 'none';
        } else {
            taxiManager.setMessage("Not enough money!", 120);
        }
    });
}
function drawDealershipFloor(ctx, width, height) {
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 2;
    const tileSize = 40;
    for (let x = 0; x <= width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, width, height);

    const startX = 100;
    for (let i = 0; i < 5; i++) {
        let cx = startX + (i * 160);
        let cy = 220;

        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(cx - 45, cy - 65, 90, 130);

        ctx.fillStyle = "#34495e";
        ctx.fillRect(cx - 40, cy - 60, 80, 120);

        ctx.strokeStyle = "#00bcd4";
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 40, cy - 60, 80, 120);
    }

    ctx.fillStyle = "rgba(231, 76, 60, 0.85)";
    ctx.fillRect(width / 2 - 60, height - 35, 120, 25);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("EXIT DOOR", width / 2, height - 18);
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
