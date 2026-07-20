
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
    } else {
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

//---7-INITIALIZATION CONTROLLERS ---
let taxiManager = new TaxiJobManager(2908, 950);
let angryDriverInstance = null;
let playerCar = null;
let targetCar = null;
// --- BLACK MARKET ZONE ---
const blackMarketZone = { x: 3412, y: 1435, radius: 65, soldTimes: [] };
const restaurantZone = {
  x: 1454,
  y: 765,
  radius: 45,
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
houseImage.src = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/IMG_20260715_162413.jpg";

let camera = { angle: 0, targetAngle: 0, moveTimer: 0, lastAngle: 0 };

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
      player.money -= 150;
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

  // Clear rent debt automatically when money returns to 0 or above
  if (player.money >= 0 && player.rentDebtActive) {
      player.rentDebtActive = false;
  }

  if (!isInsideHouse) {
      npcs.forEach(npc => npc.update(dt));
      cars.forEach(car => car.updateAI(dt, player, npcs, cars));
      taxiManager.update(dt, player, cars, npcs);
      truckManager.update(dt, player, cars);
  } else {
      taxiBtn.style.display = 'none';
      if (document.getElementById('truckBtn')) document.getElementById('truckBtn').style.display = 'none';
  }

  let distToRest = Math.sqrt(Math.pow(player.x - restaurantZone.x, 2) + Math.pow(player.y - restaurantZone.y, 2));
  restaurantBtn.style.display = (!isInsideHouse && distToRest < restaurantZone.radius) ? 'flex' : 'none';

  // NEW: Black Market Button Visibility
  let distToBM = Math.sqrt(Math.pow(player.x - blackMarketZone.x, 2) + Math.pow(player.y - blackMarketZone.y, 2));
  let bmBtn = document.getElementById('blackMarketBtn');
  if (bmBtn) {
      // Show button if player is on foot in the zone
      bmBtn.style.display = (!isInsideHouse && distToBM < blackMarketZone.radius && !playerCar) ? 'flex' : 'none';
  }


  // 3. HOME ZONE TRIGGERS
  if (!isInsideHouse) {
      let distToHome = Math.sqrt(Math.pow(player.x - homeZone.x, 2) + Math.pow(player.y - homeZone.y, 2));
      const canEnterOrRent = distToHome < homeZone.radius && !playerCar &&
          (!player.isEvicted || player.money >= 80);
      enterHomeBtn.style.display = canEnterOrRent ? 'flex' : 'none';
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

      // Home Full Map Marker
      ctx.fillStyle = "#3498db";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fullX + homeZone.x * scale, fullY + homeZone.y * scale, 12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

 // Black Market Full Map Marker
ctx.fillStyle = "#8e44ad";
ctx.strokeStyle = "#ffffff";
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.arc(fullX + blackMarketZone.x * scale,
        fullY + blackMarketZone.y * scale,
        12, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();

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

      // --- LEGEND ---
      const legendItems = [
        { color: "#f1c40f", label: "Taxi / Pickup" },
        { color: "#2ecc71", label: "Drop-off" },
        { color: "#e67e22", label: "Truck / Cargo" },
        { color: "#d35400", label: "Restaurant" },
        { color: "#3498db", label: "Home" },
        { color: "#8e44ad", label: "Black Market" },
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
      // --- END LEGEND ---
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
      truckManager.drawWorldMarkers(ctx);
      // FIXED: Removed truckManager.drawUI(ctx) from camera space to prevent offset bugs

  } else {
      // House interior zones (bed, door) are intentionally invisible in the world view.
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
  ctx.fillRect(24, 204, Math.max(0, hungerWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HUNGER: ${Math.ceil(player.hunger)}%`, 110, 217);

  // --- DRAW HUD: HEALTH BAR --- (Positioned cleanly below Hunger)
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(20, 230, 180, 25); 

  let healthWidth = (player.health / player.maxHealth) * 172;
  ctx.fillStyle = player.health < 30 ? "#c0392b" : "#e74c3c"; 
  ctx.fillRect(24, 234, Math.max(0, healthWidth), 17);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(` HEALTH: ${Math.ceil(player.health)}%`, 110, 247);

  // --- DRAW HUD MESSAGES & JOB PROMPTS (SCREEN HUD SPACE) ---
  taxiManager.drawUI(ctx);
  truckManager.drawUI(ctx); // FIXED: Draw UI now accurately renders on top of screen HUD
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
        ctx.arc(restaurantZone.x, restaurantZone.y, 30, 0, Math.PI * 2);
        ctx.fill();

        // Radar Home Marker
        ctx.fillStyle = "#3498db";
        ctx.beginPath();
        ctx.arc(homeZone.x, homeZone.y, 30, 0, Math.PI * 2);
        ctx.fill();

  // Radar Black Market Marker
ctx.fillStyle = "#8e44ad";
ctx.beginPath();
ctx.arc(blackMarketZone.x, blackMarketZone.y, 30, 0, Math.PI * 2);
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
    if (player.isEvicted) {
        // Re-rent the house
        player.money -= 80;
        localStorage.setItem("gma_player_money", player.money);
        player.isEvicted = false;
        player.rentDebtActive = false;
        taxiManager.setMessage("House rented again! Welcome back.", 240);
        return;
    }
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
    if (player.isEvicted) return;
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


// --- TRUCK JOB SYSTEM MANAGER ---
class TruckJobManager {
  constructor(companyX, companyY) {
    this.companyX = companyX;
    this.companyY = companyY;
    this.companyRadius = 60;

    this.isJobActive = false;
    this.stage = 0; // 0 = Idle, 1 = Going to pickup, 2 = Going to dropoff, 3 = Returning Truck
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

    // Spawn orange truck
    let truckId = cars.length + 2000;
    this.truck = new Car(truckId, this.companyX, this.companyY, "#e67e22");
    this.ownerType = "truckCompany";   
    this.truck.type = "truck";
    this.truck.width = 23;
    this.truck.length = 56;
    this.truck.baseSpeed = 0.6 + Math.random() * 0.4;
    this.truck.turnSpeed = 0.022;
    this.truck.sensorLength = 55;
    this.truck.isParked = false;
    this.truck.hasDriver = false;

    cars.push(this.truck);
    playerCar = this.truck; // Place player in the driver seat instantly

    this.generatePickupPoint();
    taxiManager.setMessage("Truck Job Started! Drive to the orange cargo pickup zone.", 240);
  }

  generatePickupPoint() {
    let pos = getRandomStrictRoadPosition();
    this.pickupX = pos.x;
    this.pickupY = pos.y;
  }

  generateDropoffPoint() {
    let pos = getRandomStrictRoadPosition();
    this.destinationX = pos.x;
    this.destinationY = pos.y;
  }

  failJob(player, cars) {
    player.money -= 140; // Subtracts the penalty normally, pushing them deeper into debt
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

    // Check interaction button appearance requirements
    let distToCompany = Math.sqrt(Math.pow(player.x - this.companyX, 2) + Math.pow(player.y - this.companyY, 2));
    const btn = document.getElementById('truckBtn');

    if (!this.isJobActive && distToCompany < this.companyRadius && !playerCar) {
      if (btn) btn.style.display = 'flex';
    } else {
      if (btn) btn.style.display = 'none';
    }

    if (!this.isJobActive) return;

    // Distance cancellation fine evaluation loop
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

    // Job sequence logic loop
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
          let reward = 120 + Math.floor(Math.random() * 71); // Yields $120 to $190
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

  drawWorldMarkers(ctx) {
    
  }
}

// --- INITIALIZE INSTANCE & CLICK EVENT ---
let truckManager = new TruckJobManager(2491, 2206);

// --- DYNAMIC TRUCK BUTTON SETUP ---
const truckBtn = document.createElement('button');
truckBtn.id = 'truckBtn';
truckBtn.className = 'interact-btn';
truckBtn.innerHTML = '🚛';
truckBtn.style.right = '70%'; 
truckBtn.style.background = 'rgba(230, 126, 34, 0.7)'; // Custom semi-transparent orange
document.getElementById('gameContainer').appendChild(truckBtn);

// --- FIXED: TRUCK BUTTON EVENT LISTENER ---
document.getElementById('truckBtn').addEventListener('click', () => {
  let completedTaxi = player.taxiMissionsCompleted || parseInt(localStorage.getItem("gma_taxi_missions_completed") || "0");

  if (completedTaxi >= 15) {
    truckManager.startJob(player, cars);
    document.getElementById('truckBtn').style.display = 'none';
  } else {
    // Player lacks progress -> Deny access and print requirements safely
    let missingMissions = 15 - completedTaxi;
    truckManager.setMessage(`Locked: Complete ${missingMissions} more Taxi jobs to unlock Cargo Missions!`, 180);
  }
});
// --- DYNAMIC BLACK MARKET BUTTON SETUP ---
const blackMarketBtn = document.createElement('button');
blackMarketBtn.id = 'blackMarketBtn';
blackMarketBtn.className = 'interact-btn';
blackMarketBtn.innerHTML = '💸'; // Money/Sale icon
blackMarketBtn.style.right = '70%'; // Cleanly placed next to the other buttons
blackMarketBtn.style.background = 'rgba(142, 68, 173, 0.7)'; // Custom semi-transparent purple
blackMarketBtn.style.display = 'none';
document.getElementById('gameContainer').appendChild(blackMarketBtn);

// --- BLACK MARKET SALE LOGIC ---
document.getElementById('blackMarketBtn').addEventListener('click', () => {
    // Calculate current in-game hour
    const currentHour = (gameSeconds / DAY_LENGTH) * 24;

    // Filter out sales that happened more than 6 in-game hours ago
    blackMarketZone.soldTimes = blackMarketZone.soldTimes.filter(saleTime => {
        let diff = currentHour - saleTime;
        if (diff < 0) diff += 24; 
        return diff <= 6.0;
    });

    // Check if the 2-car limit has been reached
    if (blackMarketZone.soldTimes.length >= 2) {
        taxiManager.setMessage("Black market is hot! Come back later. (Limit: 2 cars per 6 hours)", 180);
        return;
    }

    // Find a parked car inside the Black Market zone
    let carToSell = null;
    for (let i = 0; i < cars.length; i++) {
        let c = cars[i];
        if (c.isParked && !c.hasDriver) {
            let dist = Math.sqrt(Math.pow(c.x - blackMarketZone.x, 2) + Math.pow(c.y - blackMarketZone.y, 2));
            if (dist < blackMarketZone.radius) {
                carToSell = c;
                break;
            } } }
    if (!carToSell) {
        taxiManager.setMessage("No car parked here! Park a stolen car inside the purple zone to sell it.", 180);
        return;
    }
  if (carToSell.ownerType !== "civilian") {
    taxiManager.setMessage("The black market won't buy company or taxi vehicles.", 180);
    return;
  }

    // Determine price based on car type
    let carType = carToSell.type || "sedan"; // Default to sedan if type isn't explicitly set
    let price = 50; 

    if (carType === "truck") price = 70;
    else if (carType === "sports") price = 85;

    player.money += price;
    localStorage.setItem("gma_player_money", player.money);
    taxiManager.setMessage(`Sold a ${carType} for $${price}!`, 180);

    let carIndex = cars.indexOf(carToSell);
    if (carIndex > -1) cars.splice(carIndex, 1);
    blackMarketZone.soldTimes.push(currentHour);
    document.getElementById('blackMarketBtn').style.display = 'none';
});
