//HUMAN CLASS 
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

    // --- FIXED: INITIALIZE COMPLETED TAXI MISSIONS ---
    let savedTaxiMissions = localStorage.getItem("gma_taxi_missions_completed");
    this.taxiMissionsCompleted = savedTaxiMissions !== null ? parseInt(savedTaxiMissions) : 0;

    // --- HEALTH STATUS FLAGS ---
    this.isInvulnerable = false;
    this.invulnerabilityTimer = 0;

    // --- EVICTION FLAGS ---
    this.rentDebtActive = false;
    this.isEvicted = false;
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
// === DYNAMIC CAR CLASS ===
 class Car {
   constructor(id, x, y, color) {
       this.id = id;
       this.x = x;
       this.y = y;
       this.color = color;
       this.isTaxi = false;
       this.ownerType = "civilian";

       // --- 1. DETERMINE VEHICLE TYPE ---
       const roll = Math.random();
       if (roll < 0.25) {
         this.type = "sedan";
       } else if (roll < 0.45) {
         this.type = "suv";
       } else if (roll < 0.65) {
         this.type = "hatchback";
       } else if (roll < 0.80) {
         this.type = "van";
       } else if (roll < 0.92) {
         this.type = "truck";
       } else {
         this.type = "sports";
       }
     

       // --- 2. CONFIGURE DYNAMIC STATS & SIZES ---
       if (this.type === "truck") {
         this.width = 23;
         this.length = 56;
         this.baseSpeed = 0.6 + Math.random() * 0.4; // Slow (0.6 - 1.0)
         this.turnSpeed = 0.022;
         this.sensorLength = 55; 
       } else if (this.type === "van") {
         this.width = 21;
         this.length = 44;                            // Big body
         this.baseSpeed = 0.8 + Math.random() * 0.4; // Slow (0.8 - 1.2)
         this.turnSpeed = 0.028;                     // Poor steering
         this.sensorLength = 45;
       } else if (this.type === "suv") {
         this.width = 19;                            // Wider than sedan (16)
         this.length = 34;                           // Bulky frame
         this.baseSpeed = 1.5 + Math.random() * 0.5; // Faster than sedan (1.5 - 2.0)
         this.turnSpeed = 0.065;                     // Better steering than sedan (0.05)
         this.sensorLength = 38;
       } else if (this.type === "sedan") {
         this.width = 16;
         this.length = 28;
         this.baseSpeed = 1.2 + Math.random() * 0.5; // Medium (1.2 - 1.7)
         this.turnSpeed = 0.05;
         this.sensorLength = 35;
       } else if (this.type === "hatchback") {
         this.width = 15;                            // Similar to sports (15x26)
         this.length = 25;
         this.baseSpeed = 1.0 + Math.random() * 0.3; // Slower than sedan, faster than truck (1.0 - 1.3)
         this.turnSpeed = 0.055;
         this.sensorLength = 35;
       } else if (this.type === "sports") {
         this.width = 15;
         this.length = 26;
         this.baseSpeed = 1.8 + Math.random() * 0.7; // Fast (1.8 - 2.5)
         this.turnSpeed = 0.08;  
         this.sensorLength = 35;
       }

       this.speed = this.baseSpeed;
       this.angle = Math.random() * Math.PI * 2;
       this.lastX = x;
       this.lastY = y;
       this.stuckTimer = 0;
       this.isRecovering = false;
       this.recoveryTimer = 0;
       this.recentlyJackedTimer = 0;
       this.isParked = false;
       this.hasDriver = true;
     }

     updateAI(dt, player, npcs, allCars) {
       if (this.recentlyJackedTimer > 0) this.recentlyJackedTimer -= 1 * dt; 
       if (typeof playerCar !== 'undefined' && playerCar && this.id === playerCar.id) return; 

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

       if (player) processObstacle(player.x, player.y, 0.06);
       if (npcs) npcs.forEach(npc => processObstacle(npc.x, npc.y, 0.04));
       if (allCars) {
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
       }

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

       // --- STEERING CONTROLLER WITH CUSTOM TURN SPEEDS ---
       if (this.speed > 0.05) {
         if (!isAICarWalkable(sLeftX, sLeftY) && isAICarWalkable(sRightX, sRightY)) this.angle += this.turnSpeed * dt;
         else if (!isAICarWalkable(sRightX, sRightY) && isAICarWalkable(sLeftX, sLeftY)) this.angle -= this.turnSpeed * dt;
         else if (!isAICarWalkable(sCenterX, sCenterY)) this.angle += (this.turnSpeed * 0.8) * dt;
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

       // 1. Draw Shadow
       if (ambientBrightness >= 0.75) {
         ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
         ctx.fillRect(-this.width / 2 + 3, -this.length / 2 + 3, this.width, this.length);
       } 

       // 2. Draw Main Body
       ctx.fillStyle = this.color;
       ctx.fillRect(-this.width / 2, -this.length / 2, this.width, this.length);

       // 3. Draw Type-Specific Cabins & Details
       if (this.type === "truck") {
         ctx.fillStyle = "#2c3e50";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 2 + 6, this.width - 4, this.length / 4);
         ctx.fillStyle = "#1a252f";
         ctx.fillRect(-this.width / 2 + 2, 0, this.width - 4, this.length / 2 - 2);
       } 
       else if (this.type === "van") {
         // Long enclosed roof cabin & front windshield
         ctx.fillStyle = "#2c3e50";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 2 + 5, this.width - 4, this.length - 10);
         ctx.fillStyle = "#34495e";
         ctx.fillRect(-this.width / 2 + 3, -this.length / 2 + 6, this.width - 6, 5);
         // Rear split door seam line
         ctx.fillStyle = "#111111";
         ctx.fillRect(-0.5, -this.length / 4, 1, this.length * 0.7);
       }
       else if (this.type === "suv") {
         // Wide cabin roof
         ctx.fillStyle = "#2c3e50";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 3, this.width - 4, this.length * 0.65);
         // Side roof rack rails
         ctx.fillStyle = "#111111";
         ctx.fillRect(-this.width / 2 + 1, -this.length / 6, 2, this.length / 2);
         ctx.fillRect(this.width / 2 - 3, -this.length / 6, 2, this.length / 2);
       }
       else if (this.type === "sports") {
         ctx.fillStyle = "#34495e";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 4, this.width - 4, this.length / 3);
         ctx.fillStyle = "#2c3e50"; // Rear wing
         ctx.fillRect(-this.width / 2 - 2, this.length / 2 - 3, this.width + 4, 3);
       } 
       else if (this.type === "hatchback") {
         // Compact cabin with no spoiler
         ctx.fillStyle = "#34495e";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 4, this.width - 4, this.length * 0.55);
         // Slanted rear hatch glass
         ctx.fillStyle = "#1a252f";
         ctx.fillRect(-this.width / 2 + 3, this.length / 4 + 1, this.width - 6, 3);
       }
       else { // sedan
         ctx.fillStyle = "#2c3e50";
         ctx.fillRect(-this.width / 2 + 2, -this.length / 6, this.width - 4, this.length / 3);
         ctx.fillRect(-this.width / 2 + 2, this.length / 4, this.width - 4, this.length / 8);
       }

       // 4. Headlights 
       ctx.fillStyle = "rgba(255, 255, 220, 0.8)";
       ctx.fillRect(-this.width / 2 + 1, -this.length / 2, 2, 1);
       ctx.fillRect(this.width / 2 - 3, -this.length / 2, 2, 1);

       // 5. Taillights 
       ctx.fillStyle = "#ff3333";
       ctx.fillRect(-this.width / 2 + 1, this.length / 2 - 2, 3, 2);
       ctx.fillRect(this.width / 2 - 4, this.length / 2 - 2, 3, 2);

       // --- 6. IMPROVED NIGHT LIGHT CONES ---
       if (ambientBrightness < 0.75) {
            ctx.save();

            let beamGradient = ctx.createLinearGradient(0, -this.length / 2, 0, -this.length / 2 - 120);
            beamGradient.addColorStop(0, 'rgba(255, 255, 230, 0.4)');
            beamGradient.addColorStop(0.2, 'rgba(255, 255, 200, 0.15)');
            beamGradient.addColorStop(1, 'rgba(255, 255, 200, 0)');

            ctx.fillStyle = beamGradient;

            ctx.beginPath();
            ctx.moveTo(-this.width / 3, -this.length / 2);
            ctx.lineTo(-this.width * 1.5, -this.length / 2 - 100); 
            ctx.lineTo(this.width * 0.2, -this.length / 2 - 100);  
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(this.width / 3, -this.length / 2);  
            ctx.lineTo(-this.width * 0.2, -this.length / 2 - 100); 
            ctx.lineTo(this.width * 1.5, -this.length / 2 - 100);  
            ctx.closePath();
            ctx.fill();

            ctx.restore();
       }
       ctx.restore();
     }
}               


//---NPC & CAR INITIALIZATION ---
let player = new Player(300, 300);

let savedX = localStorage.getItem("gma_player_x");
let savedY = localStorage.getItem("gma_player_y");

if (savedX !== null && savedY !== null) {
    player.x = parseFloat(savedX);
    player.y = parseFloat(savedY);
}
let npcs = [];
let cars = [];

mapImage.onload = () => {
  mapWidth = mapImage.width;
  mapHeight = mapImage.height;
  collisionCanvas.width = mapWidth;
  collisionCanvas.height = mapHeight;
  collisionCtx.drawImage(mapImage, 0, 0);
  collisionData = collisionCtx.getImageData(0, 0, mapWidth, mapHeight).data;

  const NUM_NPCS = 17;
  const NUM_CARS = 23;

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

