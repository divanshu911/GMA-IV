console.log("spiderman");
// --- 1. AUDIO & STATE ---
const musicUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/a5fe3dcfe3438531dfff064503d78422031253a7/cricket.ogg";
const bgMusic = new Audio(musicUrl);
bgMusic.loop = true;
bgMusic.volume = 1.0;
let npcs = []; 
// --- STOLEN CAR HISTORY & WANTED STATE HELPERS ---
let stolenCarIds = JSON.parse(localStorage.getItem("gma_stolen_car_ids") || "[]");

function clearWantedState() {
    player.wanted = false;
    stolenCarIds = [];
    localStorage.setItem("gma_player_wanted", "false");
    localStorage.removeItem("stolen car");
    localStorage.removeItem("gma_stolen_car_ids");
}


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
const fireUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/54c156cbfdbb75449f031cf44e5b16fbe0c3c475/Fire.wav";
const engineHumUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/705c2e366b2ed0ea966b27abc218d4e70d8e2f94/EngineHumLoop.ogg";

const npcHitPool = createAudioPool(npcHitUrl, 1.0);
const carCrashPool = createAudioPool(carCrashUrl, 0.6);
const explosionPool = createAudioPool(explosionUrl, 1.0);
const engineDeadPool = createAudioPool(engineDeadUrl, 0.4);

// --- SPATIAL SOUND HELPER (another file)---


// --- CAR START & STOP SOUND POOLS ---
const carStartUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/e6af9779049a2aa837e485e387bcb2e3df5293a5/EngineStart.mp3";
const carStopUrl = "https://raw.githubusercontent.com/divanshu911/My-game-assets/e6af9779049a2aa837e485e387bcb2e3df5293a5/EngineStop.mp3";

const carStartPool = createAudioPool(carStartUrl, 0.8);
const carStopPool = createAudioPool(carStopUrl, 0.8);

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
            const isHijack = targetCar.hasDriver; // Check if car was occupied
            playerCar = targetCar; 
            playerCar.isParked = false; 

                        if (targetCar.hasDriver) {
                targetCar.isStolen = true; // Mark as stolen

                // Track stolen car ID in memory & localStorage
                if (!stolenCarIds.includes(targetCar.id)) {
                    stolenCarIds.push(targetCar.id);
                    localStorage.setItem("gma_stolen_car_ids", JSON.stringify(stolenCarIds));
                }

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
                // Play ignition sound ONLY when entering a parked/empty vehicle
                playSpatialSound(carStartPool, playerCar.x, playerCar.y, 0.8);
                // Delay engine hum until engine start sound completes (~1.5s)
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

      // Clear wanted state and stolen car history from LocalStorage
      clearWantedState();

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

function handlePhysicsAndCollisions(dt) {
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
                addTyreMarks(c1);
                addTyreMarks(c2);
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
                    if (car.humAudio) {
                        car.humAudio.pause();
                        car.humAudio = null;
                    }
                    spawnExplosionDebris(car.x, car.y, 25);

                    // Make nearby NPCs react and run away
                    npcs.forEach(npc => {
                        let dx = npc.x - car.x;
                        let dy = npc.y - car.y;
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 250) {
                            if (npc.inConversation) {
                                npc.inConversation = false;
                            }
                            const fleePhrases = ["Fire!", "Run!", "Explosion!", "Aaahhh!"];
                            npc.say(fleePhrases[Math.floor(Math.random() * fleePhrases.length)], 180);
                            npc.fleeTimer = 240; // Run away for ~4 seconds
                            npc.fleeAngle = Math.atan2(dy, dx) + Math.PI / 2;
                        }
                    });

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
      if (car.recentlyJackedTimer > 0) car.recentlyJackedTimer -= dt;
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

        // --- STOLEN CAR & POLICE SYSTEM LOGIC ---
    if (player.wanted) {
        let activeStolenCount = 0;

        // Iterate over all stolen cars tracked during this wanted streak
        stolenCarIds.slice().forEach(id => {
            let stolenCar = cars.find(c => c.id === id);

            if (stolenCar) {
                let isPlayerInThisCar = (playerCar && playerCar.id === stolenCar.id);

                if (isPlayerInThisCar) {
                    // Update current car's saved position
                    const stolenCarData = {
                        id: stolenCar.id,
                        x: stolenCar.x,
                        y: stolenCar.y,
                        color: stolenCar.color,
                        type: stolenCar.type,
                        angle: stolenCar.angle
                    };
                    localStorage.setItem("stolen car", JSON.stringify(stolenCarData));
                    activeStolenCount++;
                } else {
                    // Distance check for abandoning individual stolen car
                    let dx = player.x - stolenCar.x;
                    let dy = player.y - stolenCar.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist >= 800) {
                        // Despawn abandoned stolen car
                        cars = cars.filter(c => c.id !== stolenCar.id);

                        // Remove abandoned car from history tracking
                        stolenCarIds = stolenCarIds.filter(cId => cId !== id);
                        localStorage.setItem("gma_stolen_car_ids", JSON.stringify(stolenCarIds));

                        if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                            taxiManager.setMessage("A stolen car was recovered by police!", 180);
                        }
                    } else {
                        // Car is still nearby, count it as active
                        activeStolenCount++;
                    }
                }
            }
        });

        // --- SCALE POLICE CHASE INTENSITY BASED ON STOLEN CAR COUNT ---
        let totalStolenCount = stolenCarIds.length;
        if (typeof policeSystem !== 'undefined') {
            // Scale police speed and vehicle spawn quantity dynamically
            policeSystem.update(dt, player, cars, npcs, totalStolenCount);

            cars.forEach(c => {
                if (c.isPolice) {
                    if (!c.originalBaseSpeed) c.originalBaseSpeed = c.baseSpeed || 1.8;
                    // Increase speed by 15% per additional stolen car
                    c.baseSpeed = c.originalBaseSpeed * (1 + Math.max(0, totalStolenCount - 1) * 0.15);
                }
            });
        }

        // Only clear wanted status if ALL stolen cars are abandoned, sold, or despawned
        if (activeStolenCount === 0 || stolenCarIds.length === 0) {
            clearWantedState();
            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                taxiManager.setMessage("Lost the police!", 180);
            }
        }
    }
    

    // 3. Stop Siren Sound & Handle AngryDriver catching player or giving up
if (!isInsideHouse && angryDrivers.length > 0) {
    angryDrivers = angryDrivers.filter(driver => {
        driver.updateSpeech(dt);
        let caughtPlayer = false;

        let keepChasing = driver.update(dt, player, (caughtDriver) => {
            caughtPlayer = true;
            taxiManager.setMessage("The driver caught you and beat you up! (-40 HP)", 180);
            player.health -= 40;

            if (playerCar) {
                // Stop police siren if active
                if (typeof playerCar.stopSiren === 'function') {
                    playerCar.stopSiren();
                }
                // Move player to the side of the car
                let sideAngle = playerCar.angle - Math.PI;
                player.x = playerCar.x + Math.cos(sideAngle) * 35; 
                player.y = playerCar.y + Math.sin(sideAngle) * 35;

                // Check if player was sitting in THIS driver's original vehicle
                if (caughtDriver.targetCar && playerCar.id === caughtDriver.targetCar.id) {
                    caughtDriver.targetCar.speed = caughtDriver.targetCar.baseSpeed * 1.5; 
                    caughtDriver.targetCar.recentlyJackedTimer = 240; 
                    caughtDriver.targetCar.isParked = false; 
                    caughtDriver.targetCar.hasDriver = true; 
                } else {
                    // Ejected from a parked/other car — leave that car parked
                    playerCar.isParked = true;
                    playerCar.hasDriver = false;

                    // Driver reclaims their own car if it's sitting empty nearby
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
                // Player was on foot when caught
                if (caughtDriver.targetCar && !caughtDriver.targetCar.hasDriver) {
                    caughtDriver.targetCar.speed = caughtDriver.targetCar.baseSpeed * 1.5;
                    caughtDriver.targetCar.recentlyJackedTimer = 240;
                    caughtDriver.targetCar.isParked = false;
                    caughtDriver.targetCar.hasDriver = true;
                }
            }

            checkPlayerDeath();
        });

        // Driver stopped chasing (update returned false) without catching the player -> Driver gave up!
        if (!keepChasing && !caughtPlayer) {
            player.wanted = true;
            if (typeof policeSystem !== 'undefined' && policeSystem.startChase) {
                policeSystem.startChase(player);
            }
        }

        return keepChasing;
    });
}

  // --- 0. CALCULATE PLAYER INPUT & MOVING STATE FIRST ---
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

      // Update NPC-NPC Conversations
      updateNPCConversations(dt);

      taxiManager.update(dt, player, cars, npcs);
      truckManager.update(dt, player, cars);

      // --- POLICE SIREN SPATIAL AUDIO LOGIC ---
cars.forEach(car => {
    if (car.isPolice && car.sirenAudio && car.sirenState !== 0) {
        // Calculate distance between player and the police car
        const dx = player.x - car.x; 
        const dy = player.y - car.y; 
        const dist = Math.sqrt(dx * dx + dy * dy); 
        // Define maximum distance where siren is audible (e.g., 600 units)
        const maxSirenDist = 600;

        if (dist < maxSirenDist) {
            // Linear volume reduction based on distance
            const targetVolume = Math.max(0, 1 - (dist / maxSirenDist)); 
            car.sirenAudio.volume = targetVolume; 
            if (car.sirenAudio.paused) {
                car.sirenAudio.play().catch(() => {}); 
            }
        } else {
            // Pause sound or set volume to 0 when outside maximum range
            car.sirenAudio.volume = 0;
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
                  let vol = 0.6 * (1 - dist / maxHumDist);
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
      if (jackBtn) jackBtn.style.display = (targetCar && !targetCar.exploded) ? 'flex' : 'none'; 
      if (exitBtn) exitBtn.style.display = 'none'; 
      if (typeof sirenBtn !== 'undefined' && sirenBtn) sirenBtn.style.display = 'none'; // Hide siren when on foot

  } else {
    if (exitBtn) exitBtn.style.display = 'flex';
    if (jackBtn) jackBtn.style.display = 'none';
   // Update siren button label and display status when driving
    if (typeof updateSirenButtonLabel === 'function') {
        if (playerCar && playerCar.isPolice) {
            repositionSirenButton(); // Keep alignment above exitBtn
        }
        updateSirenButtonLabel();
    }
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

  let camDiff = camera.targetAngle - camera.angle;
  while (camDiff < -Math.PI) camDiff += Math.PI * 2;
  while (camDiff > Math.PI) camDiff -= Math.PI * 2;
  camera.angle += camDiff * (0.025 * dt);

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
  ctx.translate(-player.x - player.size / 2, -player.y - player.size / 2);

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
      npcs.forEach(npc => npc.draw(ctx));
      angryDrivers.forEach(driver => driver.draw(ctx));
      cars.forEach(car => car.draw(ctx));
  }

  // 2. Draw exhaust smoke and flying debris
  drawExhaustParticles(ctx);
  drawDebrisParticles(ctx);

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
//Wanted UI
if (player && player.wanted) {
    ctx.save();
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";   ctx.textBaseline = "top";
    // Drop shadow
    ctx.fillStyle = "#000000";
    ctx.fillText("WANTED", canvas.width / 2 + 2, 12);
    // Red text
    ctx.fillStyle = "#e74c3c";
    ctx.fillText("WANTED", canvas.width / 2, 10);
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

// SPAWN PLAYERS OWNED CARS ON GAME LOAD ONLY IF THEY ACTUALLY OWN ONE
window.addEventListener('load', () => {
    if (localStorage.getItem("gma_player_evicted") === "true") {
        player.isEvicted = true;
    }

    let savedCarData = localStorage.getItem("gma_player_owned_car");
    if (savedCarData) {
        let pCarData = JSON.parse(savedCarData);

        // ONLY spawn if pCarData exists and has a valid car type saved
        if (pCarData && pCarData.type) {
            let carX = (pCarData.x !== undefined) ? pCarData.x : homeZone.x;
            let carY = (pCarData.y !== undefined) ? pCarData.y : homeZone.y;

            let homeOwnedCar = new Car(9999, carX, carY, pCarData.color, false, pCarData.type);
            applyCarStats(homeOwnedCar, pCarData.type);
            homeOwnedCar.isParked = true;
            homeOwnedCar.hasDriver = false;
            homeOwnedCar.ownerType = "playerOwned";
            homeOwnedCar.isFirstCar = true;
            cars.push(homeOwnedCar);
        }
    }

    let savedSecondCarData = localStorage.getItem("gma_player_second_car");
    if (savedSecondCarData) {
        let sCarData = JSON.parse(savedSecondCarData);

        // ONLY spawn second car if it also has a valid car type saved
        if (sCarData && sCarData.type) {
            let secondCar = new Car(9998, sCarData.x || (dealershipZone.x + 80), sCarData.y || (dealershipZone.y + 40), sCarData.color, false, sCarData.type);
            applyCarStats(secondCar, sCarData.type);
            secondCar.isParked = true;
            secondCar.hasDriver = false;
            secondCar.ownerType = "playerOwned";
            secondCar.isSecondCar = true;
            cars.push(secondCar);
        }
    }
    requestAnimationFrame(gameLoop);
});
