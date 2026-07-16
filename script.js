const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. AUDIO & STATE ---
const musicUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/a5fe3dcfe3438531dfff064503d78422031253a7/cricket.ogg";
const bgMusic = new Audio(musicUrl);
bgMusic.loop = true;
bgMusic.volume = 1.0;
let gameActive = false;
let showFullMap = false;

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

function getSurfaceType(worldX, worldY) {
    if (typeof isInsideHouse !== 'undefined' && isInsideHouse) return 'road'; 
    if (typeof isStrictRoadColor === 'function' && isStrictRoadColor(worldX, worldY)) {
        return 'road';
    }
    if (typeof isRoadColor === 'function' && isRoadColor(worldX, worldY)) {
        return 'road';
    }
    return 'grass';
}

// Global function to trigger footstep sounds at an interval
function handleFootstepSound(character, isPlayer, dt) {
    if (!gameActive) return;

    // Determine if the entity is actually moving on foot
    let isMoving = false;
 if (isPlayer) {
    isMoving = player.speed > 0.1;
}  else {
        isMoving = (character.speed && character.speed > 0.1 && !character.isPassenger);
    }

if (!isMoving) {
    return;
}

if (isPlayer && playerCar) {
    return;
}

    if (character.footstepTimer === undefined) {
        character.footstepTimer = 0;
    }

    character.footstepTimer += dt;
    
   
    const speed = Math.max(character.speed || 0, 0.1);

// Adjust these if needed.
const MIN_INTERVAL = 8;    // Fastest (running)
const MAX_INTERVAL = 30;  // Slowest (walking)
const MAX_SPEED = 8;

const strideInterval =
    MAX_INTERVAL -
    (Math.min(speed, MAX_SPEED) / MAX_SPEED) *
    (MAX_INTERVAL - MIN_INTERVAL);

    if (character.footstepTimer >= strideInterval) {
        character.footstepTimer = 0;

        let volume = 1.0; 

        if (!isPlayer) {
            
            if (typeof player !== 'undefined') {
                let dx = character.x - player.x;
                let dy = character.y - player.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 350) return; // Unhearable past 350 pixels
                volume = 0.65 * (1 - distance / 350); 
            } else {
                volume = 0.42;
            }
        }

        const surface = getSurfaceType(character.x, character.y);
        if (surface === 'road') {
            roadAudioPool.play(volume);
        } else {
            grassAudioPool.play(volume);
        }
    }
}

// ===== DAY / NIGHT SYSTEM =====
let lastTimeSave = 0;
let nightMusicPlaying = false;

const DAY_LENGTH = 15 * 60; 

let gameSeconds = Number(localStorage.getItem("gameTime"));

if (isNaN(gameSeconds)) {
    gameSeconds = DAY_LENGTH * 0.25; // Default to 06:00
}

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

    if(hour < 5){
        darkness = 0.40;
        skyColor = "rgba(10,20,60,0.25)";
    } else if(hour < 7){
        let k=(hour-5)/2;
        darkness=0.40*(1-k);
        skyColor=`rgba(${30+170*k}, ${40+90*k}, ${80*(1-k)}, ${0.45*(1-k)})`;
    } else if(hour < 18){
        darkness=0;
        skyColor="rgba(0,0,0,0)";
    } else if(hour < 20){
        let k=(hour-18)/2;
        darkness=0.40*k;
        skyColor=`rgba(${200}, ${120*(1-k)}, ${80*(1-k)}, ${0.45*k})`;
    } else{
        darkness=0.40;
        skyColor="rgba(10,20,60,0.45)";
    }

    ambientBrightness=1-darkness;
    if (ambientBrightness < 0.75) {
        if (!nightMusicPlaying) {
            bgMusic.loop = true;
            bgMusic.play();
            nightMusicPlaying = true;
        }
    } else {
        if (nightMusicPlaying) {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            nightMusicPlaying = false;
        }
    }

    // --- DAILY RENT LOGIC ($60 at 5:30 AM) ---
    if (hour < 5 || hour > 6) {
        rentPaidForDayCycle = false;
    } else if (hour >= 5.5 && hour <= 6.0 && !rentPaidForDayCycle) {
        player.money -= 60;
        localStorage.setItem("gma_player_money", player.money);
        if (typeof taxiManager !== 'undefined') taxiManager.setMessage("Paid Daily House Rent: $60", 240);
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

const NUM_NPCS = 20; 
const NUM_CARS = 17; 

// --- 2. START BUTTON LOGIC ---
const startBtn = document.getElementById('startButton');
const startScreen = document.getElementById('startScreen');
startBtn.addEventListener('click', () => {
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

  gameActive = true;
  requestAnimationFrame(gameLoop); 
});

// --- 3. DYNAMIC RESIZE FUNCTION ---
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gameActive || showFullMap) drawGame();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// --- 4. MAP & COLLISION DETECTORS ---
const mapImage = new Image();
mapImage.crossOrigin = "Anonymous"; 

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');
let mapWidth = 0;
let mapHeight = 0;
let collisionData = null; 

function isWalkableColor(nextX, nextY, entitySize = 24) {
  const currentMapWidth = isInsideHouse ? houseMapWidth : mapWidth;
  const currentMapHeight = isInsideHouse ? houseMapHeight : mapHeight;
  const data = isInsideHouse ? houseCollisionData : collisionData;
  
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

// --- 5. ES6 ENTITY CLASSES ---

class Pedestrian {
  constructor(x, y, size, shirtColor, hairColor, skinColor) {
    this.x = x;
    this.y = y;
    this.size = size || 20;
    this.angle = 0;
    this.speed = 0;
    this.shirtColor = shirtColor;
    this.hairColor = hairColor;
    this.skinColor = skinColor;
    this.walkTimer = Math.random() * 100;
  }

  drawBaseBody(ctx, swingOffset) {
    ctx.fillStyle = this.skinColor;
    ctx.beginPath();
    ctx.arc(-this.size * 0.42, -this.size * 0.1 + swingOffset, this.size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.size * 0.42, -this.size * 0.1 - swingOffset, this.size * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.shirtColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size * 0.46, this.size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.hairColor;
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.skinColor;
    ctx.beginPath();
    ctx.arc(0, -this.size * 0.22, this.size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Player extends Pedestrian {
  constructor(x, y) {
    super(x, y, 20, "#e67e22", "#2d3436", "#ffdbac");
    this.maxSpeed = 3;
    
    // --- LOAD SAVED DATA ---
    let savedMoney = localStorage.getItem("gma_player_money");
    this.money = savedMoney !== null ? parseInt(savedMoney) : 200; 

    let savedHunger = localStorage.getItem("gma_player_hunger");
    this.hunger = savedHunger !== null ? parseFloat(savedHunger) : 100.0;

    let savedHealth = localStorage.getItem("gma_player_health");
    this.health = savedHealth !== null ? parseFloat(savedHealth) : 100.0;
    this.maxHealth = 100.0;

    // --- HEALTH STATUS FLAGS ---
    this.isInvulnerable = false;
    this.invulnerabilityTimer = 0;
  }

  update(dt, isMoving, targetAngle) {
    this.speed = 0;
    if (isMoving) {
      this.angle = targetAngle;
      
      let hungerModifier = 1.0;
      if (this.hunger <= 0) {
        hungerModifier = 0.4;
      } else if (this.hunger < 20) {
        hungerModifier = 0.4 + (this.hunger / 20) * 0.6;
      }
      
      this.speed = this.maxSpeed * hungerModifier;   
      this.walkTimer += this.speed * dt * 0.12; 
    }

    let nextX = this.x + Math.cos(this.angle - Math.PI / 2) * (this.speed * dt);
    let nextY = this.y + Math.sin(this.angle - Math.PI / 2) * (this.speed * dt);

    if (isWalkableColor(nextX, this.y, this.size)) this.x = nextX;
    if (isWalkableColor(this.x, nextY, this.size)) this.y = nextY;
  }

  draw(ctx, cameraAngle) {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(this.angle - cameraAngle); 

    // Blink effect when invulnerable
    if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }

    let swingOffset = Math.sin(this.walkTimer) * (this.size * 0.18);
    this.drawBaseBody(ctx, swingOffset);

    ctx.restore();
  }
}

class NPC extends Pedestrian {
  constructor(id, x, y, shirt, hair, skin) {
    super(x, y, 20, shirt, hair, skin);
    this.id = id;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.3 + Math.random() * 0.4;
    this.changeDirTimer = Math.random() * 120;
    this.isPassenger = false;
  }

  update(dt) {
    if (this.isPassenger) return; 

    this.changeDirTimer -= 1 * dt;
    if (this.changeDirTimer <= 0) {
      this.angle = Math.random() * Math.PI * 2;
      this.changeDirTimer = 150 + Math.random() * 200;
    }

    let nextX = this.x + Math.cos(this.angle - Math.PI / 2) * (this.speed * dt);
    let nextY = this.y + Math.sin(this.angle - Math.PI / 2) * (this.speed * dt);

    if (isRoadColor(nextX, nextY)) {
      this.x = nextX;
      this.y = nextY;
      this.walkTimer += this.speed * dt * 0.25;
    } else {
      this.angle = Math.random() * Math.PI * 2;
      this.changeDirTimer = 40;
    }
  }

  draw(ctx) {
    if (this.isPassenger) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    let swingOffset = Math.sin(this.walkTimer) * (this.size * 0.18);
    this.drawBaseBody(ctx, swingOffset);

    ctx.restore();
  }
}

class AngryDriver extends Pedestrian {
  constructor(x, y, targetCarColor, targetCarAngle) {
    super(x, y, 20, targetCarColor, "#2d3436", "#ffdbac");
    this.speed = 2.5;
    this.angle = targetCarAngle;
    this.reactionDelay = 90;
  }

  update(dt, playerCar, onCatchPlayer) {
    if (this.reactionDelay > 0) {
      this.reactionDelay -= 1 * dt;
      return true;
    }

    let dx = playerCar.x - this.x;
    let dy = playerCar.y - this.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 350) return false; 
    
    if (dist < 40) {
      onCatchPlayer();
      return false; 
    }

    let angleToCar = Math.atan2(dy, dx);
    let nextNx = this.x + Math.cos(angleToCar) * (this.speed * dt);
    let nextNy = this.y + Math.sin(angleToCar) * (this.speed * dt);
    
    if (isWalkableColor(nextNx, this.y, this.size) || isRoadColor(nextNx, this.y)) this.x = nextNx;
    if (isWalkableColor(this.x, nextNy, this.size) || isRoadColor(this.x, nextNy)) this.y = nextNy;
    
    this.angle = angleToCar + Math.PI / 2;
    this.walkTimer += 0.2 * dt; 
    return true;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    
    let runOffset = this.reactionDelay > 0 ? 0 : Math.sin(Date.now() / 60) * (this.size * 0.25);
    this.drawBaseBody(ctx, runOffset);
    
    ctx.restore();
  }
}

class Car {
  constructor(id, x, y, color) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = 16;
    this.length = 28;
    this.angle = Math.random() * Math.PI * 2;
    this.baseSpeed = 1.2 + Math.random() * 0.5;
    this.speed = this.baseSpeed;
    this.color = color;
    this.sensorLength = 35;
    this.lastX = x;
    this.lastY = y;
    this.stuckTimer = 0;
    this.isRecovering = false;
    this.recoveryTimer = 0;
    this.recentlyJackedTimer = 0;
    this.isParked = false;
    this.hasDriver = true;
    this.isTaxi = false;
  }

  updateAI(dt, player, npcs, allCars) {
    if (this.recentlyJackedTimer > 0) this.recentlyJackedTimer -= 1 * dt; 
    if (playerCar && this.id === playerCar.id) return; 

    if (this.isParked) {
      this.speed *= 0.90; 
      let rollX = this.x + Math.cos(this.angle - Math.PI / 2) * (this.speed * dt);
      let rollY = this.y + Math.sin(this.angle - Math.PI / 2) * (this.speed * dt);
      if (isAICarWalkable(rollX, this.y)) this.x = rollX;
      if (isAICarWalkable(this.x, rollY)) this.y = rollY;
      return; 
    }

    let distMoved = Math.sqrt(Math.pow(this.x - this.lastX, 2) + Math.pow(this.y - this.lastY, 2));
    this.lastX = this.x; this.lastY = this.y;

    if (distMoved < 0.15) this.stuckTimer += 1 * dt;
    else this.stuckTimer = 0;

    if (this.stuckTimer > 120 && !this.isRecovering) {
      this.isRecovering = true;
      this.recoveryTimer = 150; 
    }

    if (this.stuckTimer > 270) {
      let respawnPos = getRandomRoadPosition();
      this.x = respawnPos.x; this.y = respawnPos.y;
      this.lastX = respawnPos.x; this.lastY = respawnPos.y;
      this.angle = Math.random() * Math.PI * 2;
      this.speed = this.baseSpeed;
      this.stuckTimer = 0;
      this.isRecovering = false;
      return; 
    }

    if (this.isRecovering) {
      this.recoveryTimer -= 1 * dt;
      if (this.recoveryTimer <= 0) { this.isRecovering = false; this.stuckTimer = 0; }
      this.speed = -this.baseSpeed * 0.6;
      this.angle += 0.04 * dt; 

      let backX = this.x - Math.cos(this.angle - Math.PI / 2) * (this.speed * dt);
      let backY = this.y - Math.sin(this.angle - Math.PI / 2) * (this.speed * dt);
      if (isAICarWalkable(backX, this.y)) this.x = backX;
      if (isAICarWalkable(this.x, backY)) this.y = backY;
      return; 
    }

    let frontBumperX = this.x + Math.cos(this.angle - Math.PI / 2) * (this.length / 2);
    let frontBumperY = this.y + Math.sin(this.angle - Math.PI / 2) * (this.length / 2);
    let brakeRequired = false, emergencyBrake = false, steerFactor = 0; 
    
    const scanRadius = 40, blindSpotAngle = 0.8;  

    const processObstacle = (targetX, targetY, weight) => {
      let dx = targetX - frontBumperX, dy = targetY - frontBumperY;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < scanRadius) {
        let angleToTarget = Math.atan2(dy, dx) + Math.PI / 2;
        let relativeAngle = angleToTarget - this.angle;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;

        if (Math.abs(relativeAngle) < blindSpotAngle) {
          brakeRequired = true;
          if (dist < 26) emergencyBrake = true; 
        }
        let crossProduct = Math.cos(this.angle) * dx - Math.sin(this.angle) * dy;
        steerFactor += (Math.abs(crossProduct) < 2) ? (this.id % 2 === 0 ? -weight : weight) : (crossProduct > 0 ? -weight : weight);
      }
    };

    processObstacle(player.x, player.y, 0.06);
    npcs.forEach(npc => processObstacle(npc.x, npc.y, 0.04));
    allCars.forEach(otherCar => {
      if (otherCar.id === this.id) return;
      let dx = otherCar.x - frontBumperX, dy = otherCar.y - frontBumperY;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < scanRadius + 8) {
        let angleToTarget = Math.atan2(dy, dx) + Math.PI / 2;
        let relativeAngle = angleToTarget - this.angle;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;

        if (Math.abs(relativeAngle) < blindSpotAngle + 0.2) {
          brakeRequired = true;
          if (dist < 28) emergencyBrake = true; 
        }
        let crossProduct = Math.cos(this.angle) * dx - Math.sin(this.angle) * dy;
        steerFactor += crossProduct > 0 ? -0.05 : 0.05;
      }
    });

    if (emergencyBrake) this.speed = 0;
    else if (brakeRequired) { this.speed -= 0.3 * dt; if (this.speed < 0) this.speed = 0; }
    else { this.speed += 0.04 * dt; if (this.speed > this.baseSpeed) this.speed = this.baseSpeed; }

    this.angle += steerFactor * dt;

    let rightOffsetAngle = this.angle + Math.PI / 2;
    let laneOffsetX = Math.cos(rightOffsetAngle - Math.PI / 2) * 6;
    let laneOffsetY = Math.sin(rightOffsetAngle - Math.PI / 2) * 6;
    let sensorOriginX = this.x + laneOffsetX, sensorOriginY = this.y + laneOffsetY;

    let sLeftX = sensorOriginX + Math.cos(this.angle - 0.35 - Math.PI / 2) * this.sensorLength;
    let sLeftY = sensorOriginY + Math.sin(this.angle - 0.35 - Math.PI / 2) * this.sensorLength;
    let sRightX = sensorOriginX + Math.cos(this.angle + 0.35 - Math.PI / 2) * this.sensorLength;
    let sRightY = sensorOriginY + Math.sin(this.angle + 0.35 - Math.PI / 2) * this.sensorLength;
    let sCenterX = sensorOriginX + Math.cos(this.angle - Math.PI / 2) * this.sensorLength;
    let sCenterY = sensorOriginY + Math.sin(this.angle - Math.PI / 2) * this.sensorLength;

    if (this.speed > 0.05) {
      if (!isAICarWalkable(sLeftX, sLeftY) && isAICarWalkable(sRightX, sRightY)) this.angle += 0.06 * dt;
      else if (!isAICarWalkable(sRightX, sRightY) && isAICarWalkable(sLeftX, sLeftY)) this.angle -= 0.06 * dt;
      else if (!isAICarWalkable(sCenterX, sCenterY)) this.angle += 0.05 * dt;
    }

    let nextX = this.x + Math.cos(this.angle - Math.PI / 2) * (this.speed * dt);
    let nextY = this.y + Math.sin(this.angle - Math.PI / 2) * (this.speed * dt);
    let movedOnX = false, movedOnY = false;

    if (isAICarWalkable(nextX, this.y)) { this.x = nextX; movedOnX = true; }
    if (isAICarWalkable(this.x, nextY)) { this.y = nextY; movedOnY = true; }
    if (!movedOnX && !movedOnY) this.angle += 0.08 * dt; 

    if (this.x < 0) this.x = mapWidth;
    if (this.x > mapWidth) this.x = 0;
    if (this.y < 0) this.y = mapHeight;
    if (this.y > mapHeight) this.y = 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(-this.width / 2 + 3, -this.length / 2 + 3, this.width, this.length);

    ctx.fillStyle = this.color;
    ctx.fillRect(-this.width / 2, -this.length / 2, this.width, this.length);

    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(-this.width / 2 + 2, -this.length / 6, this.width - 4, this.length / 3);
    ctx.fillRect(-this.width / 2 + 2, this.length / 4, this.width - 4, this.length / 8);

    ctx.fillStyle = "#ffffd0";
    ctx.fillRect(-this.width / 2 + 1, -this.length / 2, 3, 2);
    ctx.fillRect(this.width / 2 - 4, -this.length / 2, 3, 2);

    ctx.fillStyle = "#ff3333";
    ctx.fillRect(-this.width / 2 + 1, this.length / 2 - 2, 3, 2);
    ctx.fillRect(this.width / 2 - 4, this.length / 2 - 2, 3, 2);
    
    if (ambientBrightness < 0.75) {
        ctx.fillStyle = "#FFF8C0";
        ctx.fillRect(-5, -19, 2, 3);
        ctx.fillRect(3, -19, 2, 3);
    }

    ctx.restore();
  }
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
      this.setMessage("Get back into your Taxi!", 2);
      return;
    }

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

    if (playerCar && playerCar.isTaxi) {
      let index = cars.findIndex(c => c.id === playerCar.id);
      if (index > -1) cars.splice(index, 1);
      playerCar = null;
    }
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
    if (!this.isJobActive) {
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#f1c40f";
      ctx.fillStyle = "rgba(241, 196, 15, 0.15)";
      ctx.beginPath();
      ctx.arc(this.depotX, this.depotY, this.depotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.isJobActive && !this.hasPassenger && this.pickupX !== 0) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#f1c40f";
      ctx.fillStyle = "rgba(241, 196, 15, 0.25)";
      ctx.beginPath();
      ctx.arc(this.pickupX, this.pickupY, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.isJobActive && this.hasPassenger) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#2ecc71";
      ctx.fillStyle = "rgba(46, 204, 113, 0.25)";
      ctx.beginPath();
      ctx.arc(this.destinationX, this.destinationY, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// --- 7. INITIALIZATION CONTROLLERS ---
let player = new Player(300, 300);
let taxiManager = new TaxiJobManager(2908, 950);
let npcs = [];
let cars = [];
let angryDriverInstance = null; 
let playerCar = null;           
let targetCar = null;           

const restaurantZone = {
  x: 1454,       
  y: 765,        
  radius: 60,
  mealCost: 40,
  messageTimer: 0
};

// --- HOME SYSTEM VARIABLES ---
let isInsideHouse = false;
let houseImage = new Image();
houseImage.crossOrigin = "Anonymous";
let houseCollisionData = null;
let houseMapWidth = 0, houseMapHeight = 0;
let outsideX = 0, outsideY = 0;
let rentPaidForDayCycle = false;

const homeZone = { x: 1912, y: 1768, radius: 60 };

houseImage.onload = () => {
  houseMapWidth = houseImage.width;
  houseMapHeight = houseImage.height;
  const hcCanvas = document.createElement('canvas');
  hcCanvas.width = houseMapWidth;
  hcCanvas.height = houseMapHeight;
  const hCtx = hcCanvas.getContext('2d');
  hCtx.drawImage(houseImage, 0, 0);
  houseCollisionData = hCtx.getImageData(0, 0, houseMapWidth, houseMapHeight).data;
};
houseImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/IMG_20260715_162413.jpg";

let camera = { angle: 0, targetAngle: 0, moveTimer: 0, lastAngle: 0 };

mapImage.onload = () => {
  mapWidth = mapImage.width;
  mapHeight = mapImage.height;
  collisionCanvas.width = mapWidth;
  collisionCanvas.height = mapHeight;
  collisionCtx.drawImage(mapImage, 0, 0);
  collisionData = collisionCtx.getImageData(0, 0, mapWidth, mapHeight).data;

  const shirtColors = ["#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e84393"];
  const hairColors = ["#2d3436", "#4a3728", "#d35400", "#f39c12"];
  const skinColors = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  for (let i = 0; i < NUM_NPCS; i++) {
    let pos = getRandomRoadPosition();
    npcs.push(new NPC(
      i, pos.x, pos.y,
      shirtColors[Math.floor(Math.random() * shirtColors.length)],
      hairColors[Math.floor(Math.random() * hairColors.length)],
      skinColors[Math.floor(Math.random() * skinColors.length)]
    ));
  }

  const carColors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];
  for (let i = 0; i < NUM_CARS; i++) {
    let pos = getRandomRoadPosition();
    cars.push(new Car(i, pos.x, pos.y, carColors[i % carColors.length]));
  }
};

mapImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/map.png"; 

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

// --- 9. ACTION BUTTON LISTENERS ---
const jackBtn = document.getElementById('jackBtn');
const exitBtn = document.getElementById('exitBtn');

jackBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (targetCar && !playerCar) {
    playerCar = targetCar; 
    playerCar.isParked = false; 
    
    if (targetCar.hasDriver) {
      let sideAngle = targetCar.angle - Math.PI / 2;
      angryDriverInstance = new AngryDriver(
        targetCar.x + Math.cos(sideAngle) * 35,
        targetCar.y + Math.sin(sideAngle) * 35,
        targetCar.color,
        targetCar.angle
      );
      targetCar.hasDriver = false; 
    }
    jackBtn.style.display = 'none';
  }
});

exitBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (playerCar) {
    playerCar.isParked = true; playerCar.hasDriver = false; playerCar.recentlyJackedTimer = 90;
    let sideAngle = playerCar.angle - Math.PI / 2;
    player.x = playerCar.x + Math.cos(sideAngle) * 35;
    player.y = playerCar.y + Math.sin(sideAngle) * 35;
    player.angle = playerCar.angle;

    playerCar = null;
    exitBtn.style.display = 'none';
  }
});

// --- 10. PHYSICS ENGINE & CORE UPDATE LOOP ---

// GLOBAL CHECK DEATH FUNCTION
function checkPlayerDeath() {
  if (player.health <= 0) {
      taxiManager.setMessage("WASTED: Rushed to the hospital! Medical fee: $150", 240);
      player.money = Math.max(0, player.money - 150);
      player.health = player.maxHealth;
      player.hunger = 100;
      
      localStorage.setItem("gma_player_money", player.money);
      localStorage.setItem("gma_player_health", player.health);
      localStorage.setItem("gma_player_hunger", player.hunger);

      // Hospital Coordinates
      player.x = 3888;
      player.y = 1215;
      player.speed = 0;

      // Ensure Ejection if died in car
      if (playerCar) {
          playerCar.isParked = true;
          playerCar.hasDriver = false;
          playerCar = null;
          exitBtn.style.display = 'none';
          jackBtn.style.display = 'none';
      }
  }
}

function handlePhysicsAndCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      let c1 = cars[i], c2 = cars[j];
      let dx = c2.x - c1.x, dy = c2.y - c1.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 26) {
        if (dist === 0) { dx = 1; dy = 0; dist = 1; }
        let overlap = 26 - dist, nx = dx / dist, ny = dy / dist;
        c1.x -= nx * overlap * 0.5; c1.y -= ny * overlap * 0.5;
        c2.x += nx * overlap * 0.5; c2.y += ny * overlap * 0.5;
        if (!isRoadColor(c1.x, c1.y)) { c1.x += nx * overlap * 0.5; c1.y += ny * overlap * 0.5; }
        if (!isRoadColor(c2.x, c2.y)) { c2.x -= nx * overlap * 0.5; c2.y -= ny * overlap * 0.5; }
      }
    }
  }

  if (!isInsideHouse) {
      cars.forEach(car => {
        if (playerCar && car.id === playerCar.id) return; 
        let dx = player.x - car.x, dy = player.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 24) {
          if (dist === 0) { dx = 1; dy = 0; dist = 1; }
          let overlap = 24 - dist, nx = dx / dist, ny = dy / dist;
          let targetX = player.x + nx * overlap, targetY = player.y + ny * overlap;
          if (isWalkableColor(targetX, player.y, player.size)) player.x = targetX;
          if (isWalkableColor(player.x, targetY, player.size)) player.y = targetY;

          // --- PLAYER VELOCITY-BASED DAMAGE LOGIC ---
          if (!playerCar && !player.isInvulnerable && Math.abs(car.speed) > 1.5) {
            player.health -= 35; // Take damage on high velocity hit
            player.isInvulnerable = true;
            player.invulnerabilityTimer = 60; // Setup i-frames
            checkPlayerDeath();
          }
        }
      });
  }

  cars.forEach(car => {
    npcs.forEach(npc => {
      let dx = npc.x - car.x, dy = npc.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22) {
        if (dist === 0) { dx = 1; dy = 0; dist = 1; }
        let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
        let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
        if (isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }
      }
    });
  });

  if (!isInsideHouse) {
      npcs.forEach(npc => {
        let dx = npc.x - player.x, dy = npc.y - player.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 22) {
          if (dist === 0) { dx = 1; dy = 0; dist = 1; }
          let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
          let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
          if (isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }
        }
      });
  }
}

function updateGame(dt) {
  if (!gameActive) return;
  updateDayNight(dt);

  // Health Invulnerability Timer Update
  if (player.isInvulnerable) {
    player.invulnerabilityTimer -= 1 * dt;
    if (player.invulnerabilityTimer <= 0) player.isInvulnerable = false;
  }

  // --- AUTOMATIC SLOW HEALTH REGENERATION ---
  if (!player.isInvulnerable && player.health < player.maxHealth && player.health > 0) {
    player.health += 0.015 * dt; // Slow step regeneration
    if (player.health > player.maxHealth) player.health = player.maxHealth;
    
    // Periodically sync up local storage for persistence
    if (Math.random() < 0.01) {
      localStorage.setItem("gma_player_health", player.health.toFixed(1));
    }
  }

  if (!isInsideHouse) {
      npcs.forEach(npc => npc.update(dt));
      cars.forEach(car => car.updateAI(dt, player, npcs, cars));
      taxiManager.update(dt, player, cars, npcs);
  } else {
      taxiBtn.style.display = 'none';
  }

  let distToRest = Math.sqrt(Math.pow(player.x - restaurantZone.x, 2) + Math.pow(player.y - restaurantZone.y, 2));
  restaurantBtn.style.display = (!isInsideHouse && distToRest < restaurantZone.radius) ? 'flex' : 'none';
  
  // 3. HOME ZONE TRIGGERS
  if (!isInsideHouse) {
      let distToHome = Math.sqrt(Math.pow(player.x - homeZone.x, 2) + Math.pow(player.y - homeZone.y, 2));
      enterHomeBtn.style.display = (distToHome < homeZone.radius && !playerCar) ? 'flex' : 'none';
      sleepBtn.style.display = 'none';
      exitHomeBtn.style.display = 'none';
  } else {
      enterHomeBtn.style.display = 'none';
      let hWidth = houseMapWidth > 0 ? houseMapWidth : 800;
      let hHeight = houseMapHeight > 0 ? houseMapHeight : 600;

      // Bed is at the top middle
      let distToBed = Math.sqrt(Math.pow(player.x - (hWidth / 2), 2) + Math.pow(player.y - 200, 2));
      sleepBtn.style.display = (distToBed < 80) ? 'flex' : 'none';

      // Door is at the bottom middle
      let distToDoor = Math.sqrt(Math.pow(player.x - (hWidth / 2), 2) + Math.pow(player.y - (hHeight - 100), 2));
      exitHomeBtn.style.display = (distToDoor < 100) ? 'flex' : 'none';
  }

  let inputX = 0, inputY = 0, isMoving = false;
  if (joystickActive) {
    if (Math.sqrt(joystickInputX * joystickInputX + joystickInputY * joystickInputY) > 0.15) { 
       inputX = joystickInputX; inputY = joystickInputY; isMoving = true; 
    }
  } else {
    if (activeMoves.ArrowUp)    inputY = -1;
    if (activeMoves.ArrowDown)  inputY = 1;
    if (activeMoves.ArrowLeft)  inputX = -1;
    if (activeMoves.ArrowRight) inputX = 1;
    if (inputX !== 0 || inputY !== 0) isMoving = true;
  }

  // --- HUNGER SYSTEM LOGIC ---
  let drainRate = 0.003; 
  if (isMoving) {
    drainRate = playerCar ? 0.005 : 0.008; 
  }
  
  player.hunger -= drainRate * dt;
  if (player.hunger < 0) player.hunger = 0;
  
  if (Math.random() < 0.01) {
    localStorage.setItem("gma_player_hunger", player.hunger.toFixed(1)); 
  }

  if (!playerCar) {
    let closestCar = null, minCarDist = 55; 
    if (!isInsideHouse) {
        cars.forEach(car => {
          if (car.recentlyJackedTimer > 0) return; 
          let dist = Math.sqrt(Math.pow(car.x - player.x, 2) + Math.pow(car.y - player.y, 2));
          if (dist < minCarDist) { minCarDist = dist; closestCar = car; }
        });
    }
    targetCar = closestCar;
    jackBtn.style.display = targetCar ? 'flex' : 'none';
    exitBtn.style.display = 'none'; 
  } else {
    jackBtn.style.display = 'none'; exitBtn.style.display = 'flex'; 
  }

  if (playerCar) {
    if (isMoving) {
      let screenAngle = Math.atan2(inputY, inputX) + Math.PI / 2;
      let worldMoveAngle = screenAngle + camera.angle;
      let angleDiff = worldMoveAngle - playerCar.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      
      playerCar.angle += angleDiff * (0.06 * dt);
      playerCar.speed += 0.08 * dt; 
      if (playerCar.speed > playerCar.baseSpeed * 3) playerCar.speed = playerCar.baseSpeed * 3; 
      
      camera.moveTimer += 1 * dt; camera.lastAngle = worldMoveAngle;
      if (camera.moveTimer > 60) camera.targetAngle = playerCar.angle;
    } else {
      playerCar.speed *= 0.92; camera.moveTimer = 0;
    }

    let nextX = playerCar.x + Math.cos(playerCar.angle - Math.PI / 2) * (playerCar.speed * dt);
    let nextY = playerCar.y + Math.sin(playerCar.angle - Math.PI / 2) * (playerCar.speed * dt);
    if (isPlayerCarWalkable(nextX, playerCar.y)) playerCar.x = nextX;
    if (isPlayerCarWalkable(playerCar.x, nextY)) playerCar.y = nextY;

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

    player.update(dt, isMoving, targetAngle);
  }

  // --- ANGRY DRIVER DAMAGE ---
  if (angryDriverInstance && playerCar && !isInsideHouse) {
    const keepAlive = angryDriverInstance.update(dt, playerCar, () => {
      player.x = playerCar.x + Math.cos(playerCar.angle - Math.PI / 2 - Math.PI / 2) * 35; 
      player.y = playerCar.y + Math.sin(playerCar.angle - Math.PI / 2 - Math.PI / 2) * 35;
      playerCar.speed = playerCar.baseSpeed * 1.5; playerCar.recentlyJackedTimer = 240; 
      playerCar.isParked = false; playerCar.hasDriver = true; 
      playerCar = null; jackBtn.style.display = 'none'; exitBtn.style.display = 'none';

      // Apply penalty and check death
      taxiManager.setMessage("The driver pulled you out and beat you up! (-40 HP)", 180);
      player.health -= 40;
      checkPlayerDeath();

    });
    if (!keepAlive) angryDriverInstance = null;
  }

  let camDiff = camera.targetAngle - camera.angle;
  while (camDiff < -Math.PI) camDiff += Math.PI * 2;
  while (camDiff > Math.PI) camDiff -= Math.PI * 2;
  camera.angle += camDiff * (0.025 * dt);
  
  handlePhysicsAndCollisions();
  
handleFootstepSound(player, true, dt);

if (!isInsideHouse) {
    npcs.forEach(npc => {
        handleFootstepSound(npc, false, dt);
    });
      if (angryDriverInstance) {
        handleFootstepSound(angryDriverInstance, false, dt);
    }
}
}

// --- 11. GRAPHICS DRAW ENGINE ---
function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  if (showFullMap) {
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
      
      ctx.fillStyle = "#d35400";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + restaurantZone.x * scale, fullY + restaurantZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      
      // Home Full Map Marker
      ctx.fillStyle = "#3498db";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + homeZone.x * scale, fullY + homeZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.save();
      if (!isInsideHouse) {
          ctx.translate(fullX + (player.x + player.size / 2) * scale, fullY + (player.y + player.size / 2) * scale);
      } else {
          ctx.translate(fullX + (homeZone.x) * scale, fullY + (homeZone.y) * scale);
      }
      ctx.rotate(player.angle);
      ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-7, 7); ctx.lineTo(7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
    ctx.fillRect(30, 30, 130, 45); ctx.strokeRect(30, 30, 130, 45);
    ctx.fillStyle = "#000000"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(" BACK", 30 + 130 / 2, 30 + 45 / 2);
    return; 
  }
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-camera.angle);
  ctx.translate(-player.x - player.size / 2, -player.y - player.size / 2);
  
  if (isInsideHouse) {
      if (houseImage.complete && houseMapWidth > 0) ctx.drawImage(houseImage, 0, 0, houseMapWidth, houseMapHeight);
  } else {
      if (mapImage.complete && mapWidth > 0) ctx.drawImage(mapImage, 0, 0, mapWidth, mapHeight);
      else { ctx.fillStyle = "#e0deca"; ctx.fillRect(player.x - 400, player.y - 400, 800, 800); }
  }

  if (!isInsideHouse) {
      taxiManager.drawWorldMarkers(ctx);
      
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#d35400"; 
      ctx.fillStyle = "rgba(211, 84, 0, 0.2)";
      ctx.beginPath();
      ctx.arc(restaurantZone.x, restaurantZone.y, restaurantZone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#3498db"; 
      ctx.fillStyle = "rgba(52, 152, 219, 0.2)";
      ctx.beginPath();
      ctx.arc(homeZone.x, homeZone.y, homeZone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
  } else {
      ctx.save();
      ctx.lineWidth = 4;
      // Draw a subtle marker for Bed Zone
      ctx.strokeStyle = "#9b59b6"; ctx.fillStyle = "rgba(155, 89, 182, 0.2)";
      ctx.beginPath(); ctx.arc(houseMapWidth / 2, 200, 80, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Draw a subtle marker for Door Zone
      ctx.strokeStyle = "#95a5a6"; ctx.fillStyle = "rgba(149, 165, 166, 0.2)";
      ctx.beginPath(); ctx.arc(houseMapWidth / 2, houseMapHeight - 100, 80, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
  }

  if (!isInsideHouse) {
      npcs.forEach(npc => npc.draw(ctx));
      if (angryDriverInstance) angryDriverInstance.draw(ctx);
      cars.forEach(car => car.draw(ctx));
  }

  ctx.restore(); 

  if (!playerCar) player.draw(ctx, camera.angle);
  if (!isInsideHouse) drawNightOverlay()

  // --- DRAW HUD: MONEY ---
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 20, 150, 45);
  ctx.fillStyle = "#2ecc71";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`$${player.money}`, 35, 50);

  // --- DRAW HUD: HUNGER BAR ---
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 200, 180, 25); 

  let hungerWidth = (player.hunger / 100) * 172;
  ctx.fillStyle = player.hunger < 25 ? "#e74c3c" : "#e67e22"; 
  ctx.fillRect(24, 234, Math.max(0, hungerWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HUNGER: ${Math.ceil(player.hunger)}%`, 110, 247);

  // --- DRAW HUD: HEALTH BAR --- (Positioned cleanly below Hunger)
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 230, 180, 25); 

  let healthWidth = (player.health / player.maxHealth) * 172;
  ctx.fillStyle = player.health < 30 ? "#c0392b" : "#e74c3c"; 
  ctx.fillRect(24, 204, Math.max(0, healthWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HEALTH: ${Math.ceil(player.health)}%`, 110, 217);

  taxiManager.drawUI(ctx);
  drawClock();

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
    } else {
        if (mapImage.complete && mapWidth > 0) ctx.drawImage(mapImage, 0, 0, mapWidth, mapHeight);
        
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
        
        ctx.fillStyle = "#d35400";
        ctx.beginPath();
        ctx.arc(restaurantZone.x, restaurantZone.y, 30, 0, Math.PI * 2);
        ctx.fill();

        // Radar Home Marker
        ctx.fillStyle = "#3498db";
        ctx.beginPath();
        ctx.arc(homeZone.x, homeZone.y, 30, 0, Math.PI * 2);
        ctx.fill();
    }
    
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
}

// --- 12. RUNNER ANIMATION INTERVALLER CLOCK ---
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

// --- ZONE INTERACTION BUTTON TRIGGERS ---
const taxiBtn = document.getElementById('taxiBtn');
const restaurantBtn = document.getElementById('restaurantBtn');

taxiBtn.addEventListener('click', () => {
  if (player.money >= taxiManager.rentCost) {
    taxiManager.startJob(player, cars);
    taxiBtn.style.display = 'none'; 
  } else {
    taxiManager.setMessage("Not enough money to rent a Taxi! Need $" + taxiManager.rentCost, 60);
  }
});

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
    restaurantBtn.style.display = 'none'; 
  } else {
    taxiManager.setMessage("Not enough money to buy food!", 60);
  }
});

const enterHomeBtn = document.getElementById('enterHomeBtn');
const sleepBtn = document.getElementById('sleepBtn');
const exitHomeBtn = document.getElementById('exitHomeBtn');

enterHomeBtn.addEventListener('click', () => {
    outsideX = player.x;
    outsideY = player.y;
    isInsideHouse = true;
    player.x = (houseMapWidth > 0 ? houseMapWidth : 800) / 2;
    player.y = (houseMapHeight > 0 ? houseMapHeight : 600) - 100;
    player.size = 30; // Scale player up inside
    enterHomeBtn.style.display = 'none';
    taxiManager.setMessage("Welcome home! Enjoy your stay.", 120);
});

exitHomeBtn.addEventListener('click', () => {
    isInsideHouse = false;
    player.x = outsideX;
    player.y = outsideY;
    player.size = 20; // Revert size outside
    exitHomeBtn.style.display = 'none';
    sleepBtn.style.display = 'none';
});

sleepBtn.addEventListener('click', () => {
    const hour = (gameSeconds / DAY_LENGTH) * 24;
    if (hour >= 20 || hour < 5) {
        gameSeconds = (5 / 24) * DAY_LENGTH; // Advance to 5 AM
        localStorage.setItem("gameTime", gameSeconds);
        player.health = player.maxHealth;
        localStorage.setItem("gma_player_health", player.health);
        taxiManager.setMessage("Slept until 5:00 AM. Health fully restored!", 240);
        rentPaidForDayCycle = false; // Reset rent trigger
    } else {
        taxiManager.setMessage("You can only sleep at night (8 PM - 5 AM).", 120);
    }
});
