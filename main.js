console.log("me");
// --- 1. AUDIO & STATE ---
const musicUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/a5fe3dcfe3438531dfff064503d78422031253a7/cricket.ogg";
const bgMusic = new Audio(musicUrl);
bgMusic.loop = true;
bgMusic.volume = 1.0;

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
const fireUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/Fire.wav";

const npcHitPool = createAudioPool(npcHitUrl, 1.0);
const carCrashPool = createAudioPool(carCrashUrl, 0.6);
const explosionPool = createAudioPool(explosionUrl, 1.0);
const engineDeadPool = createAudioPool(engineDeadUrl, 0.4);

// --- SPATIAL SOUND HELPER ---
function playSpatialSound(audioPool, eventX, eventY, maxVolume = 1.0, maxDistance = 400) {
    if (typeof player === 'undefined' || !player) {
        audioPool.play(maxVolume);
        return;
    }
    const dx = eventX - player.x;
    const dy = eventY - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxDistance) return;

    const volume = maxVolume * (1 - distance / maxDistance);
    if (volume > 0.01) {
        audioPool.play(volume);
    }
}

function getSurfaceType(worldX, worldY) {
    if (typeof isInsideHouse !== 'undefined' && isInsideHouse) return 'road'; 
    if (typeof isInsideDealership !== 'undefined' && isInsideDealership) return 'road';
    if (typeof isStrictRoadColor === 'function' && isStrictRoadColor(worldX, worldY)) {
        return 'road';
    }
    if (typeof isRoadColor === 'function' && isRoadColor(worldX, worldY)) {
        return 'road';
    }
    return 'grass';
}

function handleFootstepSound(character, isPlayer, dt) {
    if (typeof gameActive !== 'undefined' && !gameActive) return;

    let isMoving = false;
    if (isPlayer) {
        isMoving = player.speed > 0.1;
    } else {
        isMoving = (character.speed && character.speed > 0.1 && !character.isPassenger);
    }

    if (!isMoving) return;
    if (isPlayer && playerCar) return;

    if (character.footstepTimer === undefined) {
        character.footstepTimer = 0;
    }

    character.footstepTimer += dt;
    const speed = Math.max(character.speed || 0, 0.1);

    const MIN_INTERVAL = 8;    // Fastest
    const MAX_INTERVAL = 30;  // Slowest
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

                if (distance > 350) return; 
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

let angryDriverInstance = null;
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

const restaurantZone = {
  x: 1454,
  y: 765,
  radius: 45,
  mealCost: 40,
  messageTimer: 0
};

let isInsideHouse = false;
let houseImage = new Image();
houseImage.crossOrigin = "Anonymous";
let houseCollisionData = null;
let houseMapWidth = 0, houseMapHeight = 0;
let outsideX = 0, outsideY = 0;
let rentPaidForDayCycle = false;

const homeZone = { x: 1912, y: 1768, radius: 50 };

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
houseImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/Player_house.jpg";

mapImage.addEventListener('load', () => {
    mapWidth = mapImage.width;
    mapHeight = mapImage.height;

    const mapCanvas = document.createElement("canvas");
    mapCanvas.width = mapWidth;
    mapCanvas.height = mapHeight;

    const mapCtx = mapCanvas.getContext("2d");
    mapCtx.drawImage(mapImage, 0, 0);

    collisionData = mapCtx.getImageData(0, 0, mapWidth, mapHeight).data;
});

mapImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/map.png";

let camera = { angle: 0, targetAngle: 0, moveTimer: 0, lastAngle: 0 };

const jackBtn = document.getElementById('jackBtn');
const exitBtn = document.getElementById('exitBtn');

const enterDealerBtn = document.getElementById('enterDealerBtn');
const exitDealerBtn = document.getElementById('exitDealerBtn');
const dealershipPanel = document.getElementById('dealershipPanel');
const buyCarBtn = document.getElementById('buyCarBtn');

function initHomeBtn(id, text, bg, bottom) {
    let btn = document.getElementById(id);
    if (!btn) {
        btn = document.createElement('button');
        btn.id = id;
        btn.innerText = text;
        btn.style.position = 'absolute';
        btn.style.bottom = bottom;
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.padding = '10px 18px';
        btn.style.background = bg;
        btn.style.color = '#ffffff';
        btn.style.border = '2px solid white';
        btn.style.borderRadius = '8px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '1000';
        btn.style.display = 'none';
        const container = document.getElementById('gameContainer') || document.body;
        container.appendChild(btn);
    }
    return btn;
}

const leaveHomeBtn = initHomeBtn('leaveHomeBtn', 'LEAVE HOME', '#e74c3c', '110px');
const enterHomeBtn = initHomeBtn('enterHomeBtn', 'ENTER HOME', '#3498db', '110px');

enterHomeBtn.style.transform = 'translateX(-110%)';
leaveHomeBtn.style.transform = 'translateX(10%)';

const sleepBtn = initHomeBtn('sleepBtn', 'SLEEP (RESTORE HP)', '#2ecc71', '160px');
const exitHomeBtn = initHomeBtn('exitHomeBtn', 'EXIT HOME', '#e74c3c', '110px');

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

if (exitBtn) {
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
}

if (leaveHomeBtn) {
    leaveHomeBtn.addEventListener('click', () => {
        player.isEvicted = true;
        localStorage.setItem("gma_player_evicted", "true");

        cars.forEach(car => {
            if (car.isFirstCar) {
                let firstData = JSON.parse(localStorage.getItem("gma_player_owned_car") || "{}");
                firstData.x = car.x;
                firstData.y = car.y;
                localStorage.setItem("gma_player_owned_car", JSON.stringify(firstData));
            }
        });

        taxiManager.setMessage("You left your home and stopped paying rent. You are now evicted!", 240);
        leaveHomeBtn.style.display = 'none';
        if (enterHomeBtn) enterHomeBtn.style.display = 'none';
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
          playerCar.isParked = true;
          playerCar.hasDriver = false;
          playerCar = null;
          if (exitBtn) exitBtn.style.display = 'none';
          if (jackBtn) jackBtn.style.display = 'none';
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
        if (typeof isRoadColor === 'function') {
            if (!isRoadColor(c1.x, c1.y)) { c1.x += nx * overlap * 0.5; c1.y += ny * overlap * 0.5; }
            if (!isRoadColor(c2.x, c2.y)) { c2.x -= nx * overlap * 0.5; c2.y -= ny * overlap * 0.5; }
        }

        let vx1 = Math.cos(c1.angle - Math.PI / 2) * (c1.speed || 0);
        let vy1 = Math.sin(c1.angle - Math.PI / 2) * (c1.speed || 0);
        let vx2 = Math.cos(c2.angle - Math.PI / 2) * (c2.speed || 0);
        let vy2 = Math.sin(c2.angle - Math.PI / 2) * (c2.speed || 0);
        let relSpeed = Math.sqrt(Math.pow(vx1 - vx2, 2) + Math.pow(vy1 - vy2, 2));

        if (relSpeed > 0.6) {
            if (!c1.crashCooldown || c1.crashCooldown <= 0) {
                let midX = (c1.x + c2.x) / 2;
                let midY = (c1.y + c2.y) / 2;
                playSpatialSound(carCrashPool, midX, midY, Math.min(1.0, relSpeed * 0.5));
                c1.crashCooldown = 30;
                c2.crashCooldown = 30;
            }

            const isPlayerInvolved = (playerCar && (c1.id === playerCar.id || c2.id === playerCar.id));

            if (isPlayerInvolved) {
                let dmg1 = relSpeed * 5 * (c2.weightMultiplier || 1.0);
                let dmg2 = relSpeed * 5 * (c1.weightMultiplier || 1.0);
                if (c1.health > 0) c1.health = Math.max(0, c1.health - dmg1);
                if (c2.health > 0) c2.health = Math.max(0, c2.health - dmg2);
            }

            let tryExplode = (car, strikingCar, speed) => {
                if (speed > 2.8 && strikingCar.weightMultiplier >= 2.5 && Math.random() < (speed * 0.12) && !car.exploded) {
                    playSpatialSound(explosionPool, car.x, car.y, 1.0, 500);
                    car.health = 0;
                    car.exploded = true;
                    if (typeof playerCar !== 'undefined' && playerCar && car.id === playerCar.id) {
                        player.health -= 60; 
                        car.isParked = true; car.hasDriver = false; car.recentlyJackedTimer = 90;
                        let sideAngle = car.angle - Math.PI / 2;
                        player.x = car.x + Math.cos(sideAngle) * 35;
                        player.y = car.y + Math.sin(sideAngle) * 35;
                        playerCar = null;
                        if (typeof exitBtn !== 'undefined' && exitBtn) exitBtn.style.display = 'none';
                        if (typeof jackBtn !== 'undefined' && jackBtn) jackBtn.style.display = 'none';
                        checkPlayerDeath(); 
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

          if (!playerCar && !player.isInvulnerable && Math.abs(car.speed) > 1.5) {
            player.health -= 35; 
            player.isInvulnerable = true;
            player.invulnerabilityTimer = 60; 
            checkPlayerDeath();
          }
        }
      });
  }

  cars.forEach(car => {
    npcs.forEach(npc => {
      let dx = npc.x - car.x, dy = npc.y - car.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22) {
        if (!car.crashCooldown || car.crashCooldown <= 0) {
            playSpatialSound(carCrashPool, car.x, car.y, 0.6);
            car.crashCooldown = 30;
        }
        if (dist === 0) { dx = 1; dy = 0; dist = 1; }
        let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
        let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
        if (typeof isRoadColor === 'function' && isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }
      }
    });
  });

  if (!isInsideHouse && !isInsideDealership) {
      npcs.forEach(npc => {
        let dx = npc.x - player.x, dy = npc.y - player.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 22) {
          if (dist === 0) { dx = 1; dy = 0; dist = 1; }
          let overlap = 22 - dist, nx = dx / dist, ny = dy / dist;
          let tx = npc.x + nx * overlap, ty = npc.y + ny * overlap;
          if (typeof isRoadColor === 'function' && isRoadColor(tx, ty)) { npc.x = tx; npc.y = ty; }
        }
      });

      for (let i = 0; i < npcs.length; i++) {
          if (npcs[i].hitCooldown > 0) npcs[i].hitCooldown--;
          for (let j = i + 1; j < npcs.length; j++) {
              let dx = npcs[j].x - npcs[i].x;
              let dy = npcs[j].y - npcs[i].y;
              if (dx * dx + dy * dy < 484) { 
                  if (!npcs[i].hitCooldown || npcs[i].hitCooldown <= 0) {
                      playSpatialSound(npcHitPool, npcs[i].x, npcs[i].y, 0.6);
                      npcs[i].hitCooldown = 60;
                  }
              }
          }
      }  
  }
}

function updateGame(dt) {
  if (typeof gameActive !== 'undefined' && !gameActive) return;
  if (typeof updateDayNight === 'function') updateDayNight(dt);

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
      cars.forEach(car => car.updateAI(dt, player, npcs, cars));
      taxiManager.update(dt, player, cars, npcs);
      truckManager.update(dt, player, cars);

      cars.forEach(car => {
          if (car.crashCooldown > 0) car.crashCooldown -= dt;

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
                      car.fireAudio.play().catch(() => {});
                  }
                  car.fireAudio.volume = Math.max(0, 1 - (dist / 350));
              } else if (car.fireAudio) {
                  car.fireAudio.pause(); car.fireAudio = null;
              }
          } else if (car.fireAudio) {
              car.fireAudio.pause(); car.fireAudio = null;
          }
      });
  } else {
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
          towTruckBtn.style.display = (playerCar && playerCar.health <= 0) ? 'flex' : 'none';
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

  let inputX = 0, inputY = 0, isMoving = false;
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
      if (jackBtn) jackBtn.style.display = (targetCar && !targetCar.exploded) ? 'flex' : 'none'; 
      if (exitBtn) exitBtn.style.display = 'none'; 

  } else {
    if (exitBtn) exitBtn.style.display = 'flex';
    if (jackBtn) jackBtn.style.display = 'none';
  }

  if (playerCar) {
    if (isMoving) {
      let screenAngle = Math.atan2(inputY, inputX) + Math.PI / 2;
      let worldMoveAngle = screenAngle + camera.angle;
      let angleDiff = worldMoveAngle - playerCar.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      let hFactor = (playerCar.health > 0) ? Math.max(0.2, playerCar.health / playerCar.maxHealth) : 0;

      playerCar.angle += angleDiff * (0.06 * hFactor * dt);
      playerCar.speed += (0.08 * hFactor) * dt; 
      if (playerCar.speed > playerCar.baseSpeed * 3 * hFactor) playerCar.speed = playerCar.baseSpeed * 3 * hFactor; 

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
        } else {
            player.speed = 0;
        }
    } else {
        player.update(dt, isMoving, targetAngle);
    }
  }

  if (angryDriverInstance && playerCar && !isInsideHouse) {
    const keepAlive = angryDriverInstance.update(dt, playerCar, () => {
      player.x = playerCar.x + Math.cos(playerCar.angle - Math.PI / 2 - Math.PI / 2) * 35; 
      player.y = playerCar.y + Math.sin(playerCar.angle - Math.PI / 2 - Math.PI / 2) * 35;
      playerCar.speed = playerCar.baseSpeed * 1.5; playerCar.recentlyJackedTimer = 240; 
      playerCar.isParked = false; playerCar.hasDriver = true; 
      playerCar = null; 
      if (jackBtn) jackBtn.style.display = 'none'; 
      if (exitBtn) exitBtn.style.display = 'none';

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

  if (!isInsideHouse && !isInsideDealership) {
      npcs.forEach(npc => {
          handleFootstepSound(npc, false, dt);
      });
      if (angryDriverInstance) {
          handleFootstepSound(angryDriverInstance, false, dt);
      }
  }
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

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-camera.angle);
  ctx.translate(-player.x - player.size / 2, -player.y - player.size / 2);

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

  if (isInsideDealership) {
      dealershipCars.forEach(car => car.draw(ctx));
  } else if (!isInsideHouse) {
      npcs.forEach(npc => npc.draw(ctx));
      if (angryDriverInstance) angryDriverInstance.draw(ctx);
      cars.forEach(car => car.draw(ctx));
  }

  ctx.restore(); 

  if (!playerCar) player.draw(ctx, camera.angle);
  if (!isInsideHouse && !isInsideDealership && typeof drawNightOverlay === 'function') drawNightOverlay();

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
        restaurantBtn.style.display = 'none'; 
      } else {
        taxiManager.setMessage("Not enough money to buy food!", 60);
      }
    });
}

if (enterHomeBtn) {
    enterHomeBtn.addEventListener('click', () => {
        if (player.isEvicted) {
            player.money -= 80;
            localStorage.setItem("gma_player_money", player.money);
            player.isEvicted = false;
            player.rentDebtActive = false;
            localStorage.setItem("gma_player_evicted", "false");

            let firstData = JSON.parse(localStorage.getItem("gma_player_owned_car") || "{}");
            delete firstData.x;
            delete firstData.y;
            localStorage.setItem("gma_player_owned_car", JSON.stringify(firstData));

            taxiManager.setMessage("House rented again! Welcome back.", 240);
            return;
        }
        outsideX = player.x;
        outsideY = player.y;
        isInsideHouse = true;

        let hWidth = houseMapWidth > 0 ? houseMapWidth : 800;
        let hHeight = houseMapHeight > 0 ? houseMapHeight : 600;

        player.x = hWidth / 2;
        player.y = hHeight - 120;
        player.size = 45; 

        if (enterHomeBtn) enterHomeBtn.style.display = 'none';
        if (leaveHomeBtn) leaveHomeBtn.style.display = 'none';
        if (exitHomeBtn) exitHomeBtn.style.display = 'flex';
        taxiManager.setMessage("Welcome home! Enjoy your stay.", 120);
    });
}

if (exitHomeBtn) {
    exitHomeBtn.addEventListener('click', () => {
        isInsideHouse = false;
        player.x = outsideX;
        player.y = outsideY;
        player.size = 20; 
        if (exitHomeBtn) exitHomeBtn.style.display = 'none';
        if (sleepBtn) sleepBtn.style.display = 'none';
    });
}

if (sleepBtn) {
    sleepBtn.addEventListener('click', () => {
        if (player.isEvicted) return;
        const hour = (typeof gameSeconds !== 'undefined' && typeof DAY_LENGTH !== 'undefined') ? (gameSeconds / DAY_LENGTH) * 24 : 0;
        if (hour >= 20 || hour < 5) {
            if (typeof DAY_LENGTH !== 'undefined') {
                gameSeconds = (5 / 24) * DAY_LENGTH; 
                localStorage.setItem("gameTime", gameSeconds);
            }
            player.health = player.maxHealth;
            localStorage.setItem("gma_player_health", player.health);
            taxiManager.setMessage("Slept until 5:00 AM. Health fully restored!", 240);
            rentPaidForDayCycle = false; 
        } else {
            taxiManager.setMessage("You can only sleep at night (8 PM - 5 AM).", 120);
        }
    });
}

setInterval(() => {
    if (typeof player !== 'undefined' && !isInsideHouse && !isInsideDealership) {
        localStorage.setItem("gma_player_x", player.x.toFixed(2));
        localStorage.setItem("gma_player_y", player.y.toFixed(2));

        cars.forEach(c => {
            if (c.isSecondCar) {
                let secondData = JSON.parse(localStorage.getItem("gma_player_second_car") || "{}");
                secondData.x = c.x;
                secondData.y = c.y;
                localStorage.setItem("gma_player_second_car", JSON.stringify(secondData));
            }
            if (c.isFirstCar && player.isEvicted) {
                let firstData = JSON.parse(localStorage.getItem("gma_player_owned_car") || "{}");
                firstData.x = c.x;
                firstData.y = c.y;
                localStorage.setItem("gma_player_owned_car", JSON.stringify(firstData));
            }
        });
    }
}, 3000); 

let lastRespawnCheckX = 0;
let lastRespawnCheckY = 0;
let recentMovementDistance = 0;

setInterval(() => {
    if (typeof player !== 'undefined') {
        let dx = player.x - lastRespawnCheckX;
        let dy = player.y - lastRespawnCheckY;
        recentMovementDistance = Math.sqrt(dx * dx + dy * dy);
        lastRespawnCheckX = player.x;
        lastRespawnCheckY = player.y;
    }
}, 2000); 

function getRespawnStatus() {
    if (playerCar) return { active: false, reason: "Cannot respawn while driving a vehicle!" };
    if (isInsideHouse || isInsideDealership) return { active: false, reason: "Cannot respawn while inside a building!" };
    if (recentMovementDistance > 25) return { active: false, reason: "You must stand still for a moment to respawn!" };

    return { active: true, reason: "" };
}

const respawnBtn = document.createElement('button');
respawnBtn.id = 'respawnBtn';
respawnBtn.innerHTML = 'RESPAWN';
respawnBtn.style.position = 'absolute';
respawnBtn.style.bottom = '12px'; 
respawnBtn.style.left = '50%';
respawnBtn.style.transform = 'translateX(-50%)';
respawnBtn.style.padding = '7px 16px';
respawnBtn.style.fontFamily = 'Arial';
respawnBtn.style.fontWeight = 'bold';
respawnBtn.style.border = '2px solid white';
respawnBtn.style.borderRadius = '5px';
respawnBtn.style.cursor = 'pointer';
respawnBtn.style.zIndex = '1000';
respawnBtn.style.display = 'none'; 

const container = document.getElementById('gameContainer') || document.body;
container.appendChild(respawnBtn);

respawnBtn.addEventListener('click', () => {
    let status = getRespawnStatus();

    if (status.active) {
        player.x = 300;
        player.y = 300;
        localStorage.setItem("gma_player_x", player.x.toFixed(2));
        localStorage.setItem("gma_player_y", player.y.toFixed(2));

        taxiManager.setMessage("Respawned successfully!", 180);

        if (typeof showFullMap !== 'undefined') {
            showFullMap = false;
            gameActive = true;
        }
    } else {
        taxiManager.setMessage(status.reason, 240);
    }
});

function updateRespawnButtonUI() {
    if (typeof showFullMap !== 'undefined' && showFullMap) {
        respawnBtn.style.display = 'block';
        let status = getRespawnStatus();

        if (status.active) {
            respawnBtn.style.backgroundColor = '#f1c40f'; 
            respawnBtn.style.color = '#000000';           
        } else {
            respawnBtn.style.backgroundColor = '#7f8c8d'; 
            respawnBtn.style.color = '#ffffff';           
        }
    } else {
        respawnBtn.style.display = 'none';
    }

    requestAnimationFrame(updateRespawnButtonUI);
}

updateRespawnButtonUI();

// SPAWN PLAYER'S OWNED CARS ON GAME LOAD
window.addEventListener('load', () => {
    if (localStorage.getItem("gma_player_evicted") === "true") {
        player.isEvicted = true;
    }

    let savedCarData = localStorage.getItem("gma_player_owned_car");
    if (savedCarData) {
        let pCarData = JSON.parse(savedCarData);
        let carX = homeZone.x;
        let carY = homeZone.y;

        if (player.isEvicted && pCarData.x !== undefined && pCarData.y !== undefined) {
            carX = pCarData.x;
            carY = pCarData.y;
        }

        let carType = pCarData.type || "Ranger, SUV";
        let homeOwnedCar = new Car(9999, carX, carY, pCarData.color, false, carType);
        applyCarStats(homeOwnedCar, carType);
        homeOwnedCar.isParked = true;
        homeOwnedCar.hasDriver = false;
        homeOwnedCar.ownerType = "playerOwned";
        homeOwnedCar.isFirstCar = true;
        cars.push(homeOwnedCar);
    }

    let savedSecondCarData = localStorage.getItem("gma_player_second_car");
    if (savedSecondCarData) {
        let sCarData = JSON.parse(savedSecondCarData);
        let carType = sCarData.type || "Commuter, Sedan";
        let secondCar = new Car(9998, sCarData.x || (dealershipZone.x + 80), sCarData.y || (dealershipZone.y + 40), sCarData.color, false, carType);
        applyCarStats(secondCar, carType);
        secondCar.isParked = true;
        secondCar.hasDriver = false;
        secondCar.ownerType = "playerOwned";
        secondCar.isSecondCar = true;
        cars.push(secondCar);
    }
});
