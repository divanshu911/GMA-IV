console.log("pp9v")
// --- 1. ENHANCE PEDESTRIAN BASE CLASS WITH SPEECH BUBBLES ---
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

    // Speech Bubble Properties
    this.speechText = null;
    this.speechTimer = 0;
  }

  say(text, duration = 120) {
    this.speechText = text;
    this.speechTimer = duration;
  }

  updateSpeech(dt) {
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) {
        this.speechText = null;
      }
    }
  }

  drawSpeechBubble(ctx) {
    if (!this.speechText) return;

    ctx.save();

    // Counter-rotate by both NPC angle and camera angle to keep bubble upright and parallel to the screen
    let cameraAngle = (typeof camera !== "undefined" && camera.angle) ? camera.angle : 0;
    let bubbleAngle = -this.angle + cameraAngle;

    ctx.rotate(bubbleAngle);

    // draw bubble...
    ctx.font = "bold 11px Arial";
    const padding = 6;
    const textWidth = ctx.measureText(this.speechText).width;
    const bubbleWidth = textWidth + padding * 2;
    const bubbleHeight = 18;
    const bx = -bubbleWidth / 2;
    const by = -this.size - 18;

    // Speech Bubble Body
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 5);
    } else {
      ctx.rect(bx, by, bubbleWidth, bubbleHeight);
    }
    ctx.fill();
    ctx.stroke();

    // Triangle Tail
    ctx.beginPath();
    ctx.moveTo(-3, by + bubbleHeight);
    ctx.lineTo(3, by + bubbleHeight);
    ctx.lineTo(0, by + bubbleHeight + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bubble Text
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.speechText, 0, by + bubbleHeight / 2);

    ctx.restore();
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
    // --- POLICE WANTED STATE ---
    let savedWanted = localStorage.getItem("gma_player_wanted");
    this.wanted = savedWanted === "true";
    this.beingChased = false;

    // --- LOAD SAVED DATA ---
    let savedMoney = localStorage.getItem("gma_player_money");
    this.money = savedMoney !== null ? parseInt(savedMoney) : 200; 

    let savedHunger = localStorage.getItem("gma_player_hunger");
    this.hunger = savedHunger !== null ? parseFloat(savedHunger) : 100.0;

    let savedHealth = localStorage.getItem("gma_player_health");
    this.health = savedHealth !== null ? parseFloat(savedHealth) : 100.0;
    this.maxHealth = 100.0;

    // --- INITIALIZE COMPLETED TAXI MISSIONS ---
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

// --- UPDATE NPC CLASS FOR OFF-ROAD RECOVERY ---
class NPC extends Pedestrian {
  constructor(id, x, y, shirt, hair, skin, isPolice = false) {
    let shirtColor = isPolice ? "#0b1d3a" : shirt;
    super(x, y, 20, shirtColor, hair, skin);
    this.id = id;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.3 + Math.random() * 0.4;
    this.changeDirTimer = Math.random() * 120;
    this.isPassenger = false;
    this.isPolice = isPolice;

    // Conversation & Reaction properties
    this.inConversation = false;
    this.conversationCooldown = Math.random() * 200;
    this.fleeTimer = 0;
    this.fleeAngle = 0;

    // Off-road recovery pathfinding properties
    this.recoveryPath = null;
    this.recoveryPathIndex = 0;
  }

  update(dt) {
    if (this.isPassenger) return;
// Police officers in an active police interaction are controlled
// by updatePoliceStage4A(), not by normal NPC movement.
if (
    this.isPolice &&
    this.policeState &&
    this.policeState !== "PATROL"
) {
    this.updateSpeech(dt);
    return;
}
    this.updateSpeech(dt);

    if (this.conversationCooldown > 0) {
      this.conversationCooldown -= dt;
    }

    // Reaction: Running away from explosions
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      this.angle = this.fleeAngle;
      let runSpeed = this.speed * 2.5;
      let nextX = this.x + Math.cos(this.angle - Math.PI / 2) * (runSpeed * dt);
      let nextY = this.y + Math.sin(this.angle - Math.PI / 2) * (runSpeed * dt);

      if (typeof isRoadColor === 'function' && isRoadColor(nextX, nextY)) {
        this.x = nextX;
        this.y = nextY;
      }
      this.walkTimer += runSpeed * dt * 0.3;
      return;
    }

    // --- OFF-ROAD RECOVERY LOGIC ---
    const currentlyOnRoad = typeof isRoadColor === 'function' && isRoadColor(this.x, this.y);

    if (!currentlyOnRoad) {
      // Build navigation grid if necessary
      if (typeof navigationSystem !== 'undefined' && !navigationSystem.ready) {
        navigationSystem.buildGrid();
      }

      // Calculate path to nearest road tile if path is missing or finished
      if (!this.recoveryPath || this.recoveryPathIndex >= this.recoveryPath.length) {
        if (typeof navigationSystem !== 'undefined' && navigationSystem.ready) {
          const currentGrid = navigationSystem.worldToGrid(this.x, this.y);
          let targetRoadCell = null;

          // Find nearest walkable road cell in expanding rings
          for (let radius = 1; radius < 25; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                let testWorld = navigationSystem.gridToWorld(currentGrid.x + dx, currentGrid.y + dy);
                if (isRoadColor(testWorld.x, testWorld.y)) {
                  targetRoadCell = testWorld;
                  break;
                }
              }
              if (targetRoadCell) break;
            }
            if (targetRoadCell) break;
          }

          if (targetRoadCell) {
            this.recoveryPath = navigationSystem.findPath(this.x, this.y, targetRoadCell.x, targetRoadCell.y);
            this.recoveryPathIndex = 0;
          }
        }
      }

      // Navigate along recovery path (allowed to walk on grass/transitions)
      if (this.recoveryPath && this.recoveryPathIndex < this.recoveryPath.length) {
        let wp = this.recoveryPath[this.recoveryPathIndex];
        let dx = wp.x - this.x;
        let dy = wp.y - this.y;
        let dist = Math.hypot(dx, dy);

        if (dist < 8) {
          this.recoveryPathIndex++;
        } else {
          this.angle = Math.atan2(dy, dx) + Math.PI / 2;
          let moveDist = this.speed * dt;
          let nextX = this.x + Math.cos(this.angle - Math.PI / 2) * moveDist;
          let nextY = this.y + Math.sin(this.angle - Math.PI / 2) * moveDist;

          if (typeof isWalkableColor === 'function' && isWalkableColor(nextX, nextY, this.size)) {
            this.x = nextX;
            this.y = nextY;
          }
          this.walkTimer += this.speed * dt * 0.25;
        }
        return;
      }
    } else {
      // Clear recovery path when back on road surface
      this.recoveryPath = null;
      this.recoveryPathIndex = 0;
    }

    // Stop moving when engaged in conversation
    if (this.inConversation) return;

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

    // Render speech bubble upright above NPC body
    this.drawSpeechBubble(ctx);

    ctx.restore();
  }
}


// --- 3. CONVERSATION MANAGER & TOPICS ---
const activeConversations = [];
const MAX_CONVERSATIONS = 5; // Keeps active conversations between 4 to 6

const sampleDialogues = [
  ["Hey, how's it going?", "Not bad! Just walking around."],
  ["Did you hear that noise earlier?", "Yeah, driver was insane!"],
  ["Nice weather today, isn't it?", "Totally agree, pretty nice."],
  ["Where are you heading?", "Just grabbing some food."],
  ["Watch out for crazy cars!", "Tell me about it..."]
];

class Conversation {
  constructor(npc1, npc2) {
    this.npc1 = npc1;
    this.npc2 = npc2;
    // 5 to 10 seconds duration (300 to 600 frames)
    this.duration = 300 + Math.random() * 300;
    this.timer = this.duration;
    this.dialogue = sampleDialogues[Math.floor(Math.random() * sampleDialogues.length)];
    this.speakerIdx = 0;
    this.switchTimer = 0;

    this.npc1.inConversation = true;
    this.npc2.inConversation = true;
    npc1.lastConversationPartner = npc2.id;
    npc2.lastConversationPartner = npc1.id;

    // Rotate NPCs to face each other
    let dx = npc2.x - npc1.x;
    let dy = npc2.y - npc1.y;
    let angleTo2 = Math.atan2(dy, dx) + Math.PI / 2;
    npc1.angle = angleTo2;
    npc2.angle = angleTo2 + Math.PI;
  }

  update(dt) {
    this.timer -= dt;
    this.switchTimer += dt;

    // Alternate dialogue bubbles every ~2.5 seconds
    if (this.switchTimer >= 125) {
      this.switchTimer = 0;
      if (this.speakerIdx === 0) {
        this.npc1.say(this.dialogue[0], 120);
        this.npc2.speechText = null;
        this.speakerIdx = 1;
      } else {
        this.npc2.say(this.dialogue[1], 120);
        this.npc1.speechText = null;
        this.speakerIdx = 0;
      }
    }

    if (this.timer <= 0) {
      this.end();
      return false;
    }
    return true;
  }

  end() {
    this.npc1.inConversation = false;
    this.npc2.inConversation = false;
    this.npc1.speechText = null;
    this.npc2.speechText = null;
    this.npc1.conversationCooldown = 300;
    this.npc2.conversationCooldown = 300;
  }
}

function updateNPCConversations(dt) {
  // Update current conversations
  for (let i = activeConversations.length - 1; i >= 0; i--) {
    if (!activeConversations[i].update(dt)) {
      activeConversations.splice(i, 1);
    }
  }

  // Create new conversations if under the limit
  if (activeConversations.length < MAX_CONVERSATIONS) {
    for (let i = 0; i < npcs.length; i++) {
      if (activeConversations.length >= MAX_CONVERSATIONS) break;
      let npc1 = npcs[i];
      if (npc1.inConversation || npc1.conversationCooldown > 0 || npc1.fleeTimer > 0) continue;

      for (let j = i + 1; j < npcs.length; j++) {
        let npc2 = npcs[j];
        if (npc2.inConversation || npc2.conversationCooldown > 0 || npc2.fleeTimer > 0) continue;

        let dx = npc2.x - npc1.x;
        let dy = npc2.y - npc1.y;
        if (dx * dx + dy * dy < 1225) { // Within ~35px proximity
          if (Math.random() < 0.35) {
            activeConversations.push(new Conversation(npc1, npc2));
            break;
          } else {
            npc1.conversationCooldown = 120;
            npc2.conversationCooldown = 120;
          }
        }
      }
    }
  }
}

class AngryDriver extends Pedestrian {
  constructor(x, y, targetCarColor, targetCarAngle, isPolice = false, targetCar = null) {
    let officerShirt = "#0b1d3a"; 
    let shirt = isPolice ? officerShirt : targetCarColor;

    super(x, y, 20, shirt, "#2d3436", "#ffdbac");
    this.speed = 1.3;
    this.angle = targetCarAngle;
    this.reactionDelay = 150;
    this.isPolice = isPolice;
    this.targetCar = targetCar;

    // A* Navigation Tracking
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.escapeTimer = 0;
    this.escapeAngle = 0;
  }

  // Check collision against nearby cars and other pedestrians
  isBlockedByEntity(checkX, checkY, npcs = [], cars = [], targetEntity = null) {
    // Avoid active cars
    for (let i = 0; i < cars.length; i++) {
      let car = cars[i];
      if (car.exploded) continue;
      if (car === this.targetCar || car === playerCar) continue;
      let dx = checkX - car.x;
      let dy = checkY - car.y;
      if (Math.hypot(dx, dy) < (car.length || 30) * 0.45) {
        return true;
      }
    }

    // Avoid other pedestrians (excluding self and target player)
    for (let i = 0; i < npcs.length; i++) {
      let npc = npcs[i];
      if (npc === this || npc === targetEntity) continue;
      let dx = checkX - npc.x;
      let dy = checkY - npc.y;
      if (Math.hypot(dx, dy) < 18) {
        return true;
      }
    }

    return false;
  }

  update(dt, targetEntity, onCatchPlayer, npcs = [], cars = []) {
    if (this.reactionDelay > 0) {
      this.reactionDelay -= 1 * dt;
      return true;
    }

    let dx = targetEntity.x - this.x;
    let dy = targetEntity.y - this.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 330) return false; // Player escaped out of range
    if (dist < 30) {
      onCatchPlayer(this);
      return false; // Player caught
    }

    // Ensure A* grid is available when possible.
// A* is only a navigation aid; the driver must still be able
// to chase directly if the grid/path is temporarily unavailable.
if (!navigationSystem.ready) {
    navigationSystem.buildGrid();
}

    // Periodically recalculate path to chasing target
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.path || this.pathIndex >= this.path.length) {
      this.repathTimer = 20; // Recalculate route every 20 frames
      if (navigationSystem.ready) {
        let foundPath = navigationSystem.findPath(this.x, this.y, targetEntity.x, targetEntity.y);
        if (foundPath && foundPath.length > 0) {
          this.path = foundPath;
          this.pathIndex = foundPath.length > 1 ? 1 : 0; 
        }
      }
    }

    // Target current path waypoint when A* has a valid route.
// Otherwise chase the player directly.
let targetX = targetEntity.x;
let targetY = targetEntity.y;

if (this.path && this.pathIndex < this.path.length) {
    let wp = this.path[this.pathIndex];

    // Ignore invalid/stale waypoints.
    if (
        wp &&
        Number.isFinite(wp.x) &&
        Number.isFinite(wp.y)
    ) {
        let wpDx = wp.x - this.x;
        let wpDy = wp.y - this.y;

        if (Math.hypot(wpDx, wpDy) < 16) {
            this.pathIndex++;

            if (this.pathIndex < this.path.length) {
                wp = this.path[this.pathIndex];
            }
        }

        if (
            wp &&
            Number.isFinite(wp.x) &&
            Number.isFinite(wp.y)
        ) {
            targetX = wp.x;
            targetY = wp.y;
        }
    }
}

    const moveAngle = Math.atan2(targetY - this.y, targetX - this.x);
    // Use a short perpendicular escape when the driver has been making
    // collision-limited progress on the same road spot.
    let stepAngle = moveAngle;
    if (this.escapeTimer > 0) {
      stepAngle = this.escapeAngle;
      this.escapeTimer = Math.max(0, this.escapeTimer - dt);
    }

    let nextNx = this.x + Math.cos(stepAngle) * (this.speed * dt);
    let nextNy = this.y + Math.sin(stepAngle) * (this.speed * dt);
    const previousX = this.x;
    const previousY = this.y;

    const canMoveTo = (x, y) =>
    isAngryDriverWalkable(x, y, this.size) &&
    !this.isBlockedByEntity(x, y, npcs, cars, targetEntity);
    let moved = false;
    // Prefer the full diagonal step, then try axis-aligned sliding along a wall.
    if (canMoveTo(nextNx, nextNy)) {
      this.x = nextNx;
      this.y = nextNy;
      moved = true;
    } else {
      const xOnlyValid = canMoveTo(nextNx, this.y);
      const yOnlyValid = canMoveTo(this.x, nextNy);

      if (xOnlyValid && yOnlyValid) {
        const xProgress = Math.abs(targetX - nextNx) + Math.abs(targetY - this.y);
        const yProgress = Math.abs(targetX - this.x) + Math.abs(targetY - nextNy);
        if (xProgress <= yProgress) {
          this.x = nextNx;
        } else {
          this.y = nextNy;
        }
        moved = true;
      } else if (xOnlyValid) {
        this.x = nextNx;
        moved = true;
      } else if (yOnlyValid) {
        this.y = nextNy;
        moved = true;
      }
    }

    // Local obstacle steering bypass if direct step is blocked
    if (!moved) {
      for (let offset of [0.55, -0.55, 1.05, -1.05, 1.57, -1.57, 2.2, -2.2, Math.PI]) {
        let altAngle = stepAngle + offset;
        let altX = this.x + Math.cos(altAngle) * (this.speed * dt);
        let altY = this.y + Math.sin(altAngle) * (this.speed * dt);
        if (canMoveTo(altX, altY)) {
          this.x = altX;
          this.y = altY;
          moved = true;
          break;
        }
      }
    }

    const actualDx = this.x - previousX;
    const actualDy = this.y - previousY;
    const actualDistance = Math.hypot(actualDx, actualDy);
    const expectedDistance = Math.max(0.001, this.speed * dt);

    // A valid axis step can still be only a tiny collision correction.
    // Measure real displacement so these frames also count as stuck.
    if (actualDistance < expectedDistance * 0.2) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);
    }

    if (this.stuckTimer >= 18) {
      this.stuckTimer = 0;
      this.path = [];
      this.pathIndex = 0;
      this.repathTimer = 0;

      // Move sideways relative to the blocked chase direction. This gets
      // the driver out of a dynamic road obstruction before replanning.
      const turnDirection = Math.random() < 0.5 ? -1 : 1;
      this.escapeAngle = moveAngle + turnDirection * Math.PI / 2;
      this.escapeTimer = 24;
    } else if (!moved) {
      // Fully blocked frames should also trigger an immediate replan.
      this.path = [];
      this.pathIndex = 0;
      this.repathTimer = 0;
    }

    // FIX: Only increment walkTimer when moving, and ensure they always face their target
    if (actualDistance > 0.001) {
      this.angle = Math.atan2(actualDy, actualDx) + Math.PI / 2;
      this.walkTimer += 0.2 * dt;
    } else {
      // If stuck, keep visual tracking on the target
      this.angle = moveAngle + Math.PI / 2; 
    }
    
    return true;
  }

    draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // FIX: Tie the animation to walkTimer instead of Date.now()
    let runOffset = this.reactionDelay > 0 ? 0 : Math.sin(this.walkTimer) * (this.size * 0.25);
    this.drawBaseBody(ctx, runOffset);

    this.drawSpeechBubble(ctx);
    ctx.restore();
    }
}

  
// === IMPROVED DYNAMIC CAR CLASS WITH OBSTACLE AVOIDANCE & DECOUPLED PLAYER CONTROLS ===
class Car {
  constructor(id, x, y, color, isPolice = false, type = null) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.isPolice = isPolice;
    this.color = isPolice ? "#111111" : color; // Black body for police cars
    this.isTaxi = false;
    this.ownerType = isPolice ? "police" : "civilian";
    // --- POLICE SIREN SYSTEM PROPERTIES ---
    this.sirenState = 0; 
    this.sirenAudio = null;
    this.sirenBoostTimer = 0; // Duration left for temporary speed boost
    this.sirenCooldownTimer = 1800 + Math.random() * 2400; // ~30 to 70s until random AI siren


    // --- 1. DETERMINE VEHICLE TYPE ---
    if (this.isPolice) {
      this.type = "Commuter, Sedan"; // Police cars are strictly Commuter, Sedan
    } else if (type) {
      this.type = type;
    } else {
      const roll = Math.random();
      if (roll < 0.25) {
        this.type = "Commuter, Sedan";
      } else if (roll < 0.45) {
        this.type = "Ranger, SUV";
      } else if (roll < 0.65) {
        this.type = "Sprint, Hatchback";
      } else if (roll < 0.80) {
        this.type = "Porter, Van";
      } else if (roll < 0.92) {
        this.type = "Hauler, Truck";
      } else {
        this.type = "Falcon, Sports";
      }
    }

    // --- 2. CONFIGURE DYNAMIC STATS & SIZES ---
    if (this.type === "Hauler, Truck") {
      this.width = 23;
      this.length = 56;
      this.baseSpeed = 0.9 + Math.random() * 0.4;
      this.turnSpeed = 0.022;
      this.sensorLength = 55;
    } else if (this.type === "Porter, Van") {
      this.width = 21;
      this.length = 44;
      this.baseSpeed = 1.0 + Math.random() * 0.4;
      this.turnSpeed = 0.028;
      this.sensorLength = 45;
    } else if (this.type === "Ranger, SUV") {
      this.width = 19;
      this.length = 34;
      this.baseSpeed = 1.5 + Math.random() * 0.5;
      this.turnSpeed = 0.065;
      this.sensorLength = 38;
    } else if (this.type === "Sprint, Hatchback") {
      this.width = 15;
      this.length = 25;
      this.baseSpeed = 1.0 + Math.random() * 0.3;
      this.turnSpeed = 0.055;
      this.sensorLength = 35;
    } else if (this.type === "Falcon, Sports") {
      this.width = 15;
      this.length = 26;
      this.baseSpeed = 1.8 + Math.random() * 0.7;
      this.turnSpeed = 0.08;
      this.sensorLength = 35;
    } else {
      this.type = "Commuter, Sedan";
      this.width = 16;
      this.length = 28;
      this.baseSpeed = 1.2 + Math.random() * 0.5;
      this.turnSpeed = 0.05;
      this.sensorLength = 35;
    }

    // --- Vehicle Health System ---
    this.health = 250;
    this.maxHealth = 250;
    this.exploded = false;
    this.damageParticles = [];

    if (this.type === "Hauler, Truck") { this.weightMultiplier = 4.0; }
    else if (this.type === "Porter, Van") { this.weightMultiplier = 2.6; }
    else if (this.type === "Ranger, SUV") { this.weightMultiplier = 2.5; }
    else if (this.type === "Commuter, Sedan") { this.weightMultiplier = 1.5; }
    else if (this.type === "Falcon, Sports") { this.weightMultiplier = 1.2; }
    else { this.weightMultiplier = 1.0; }

    this.speed = this.baseSpeed;
    this.angle = Math.random() * Math.PI * 2;

    this.lastX = x;
    this.lastY = y;
    this.stuckTimer = 0;
    this.recentlyJackedTimer = 0;
    this.isParked = false;
    this.hasDriver = true;
  }

  checkRayWalkable(originX, originY, angleOffset, distance) {
    let checkAngle = this.angle + angleOffset - Math.PI / 2;
    let midX = originX + Math.cos(checkAngle) * (distance * 0.5);
    let midY = originY + Math.sin(checkAngle) * (distance * 0.5);
    let farX = originX + Math.cos(checkAngle) * distance;
    let farY = originY + Math.sin(checkAngle) * distance;

    return isAICarWalkable(midX, midY) && isAICarWalkable(farX, farY);
  }

  setSirenState(state) {
    this.sirenState = state;

    if (this.sirenAudio) {
      this.sirenAudio.pause();
      this.sirenAudio.currentTime = 0;
      this.sirenAudio = null;
    }

    let url = null;
    if (this.sirenState === 1) url = sirenWailUrl;
    else if (this.sirenState === 2) url = sirenYelpUrl;

      if (url) {
    this.sirenAudio = new Audio(url);
    this.sirenAudio.loop = true;
    this.sirenAudio.volume = 0.5; // Set volume higher than 0 so it's audible!
    this.sirenAudio.play().catch(() => {});
      }
  }

  stopSiren() {
    this.setSirenState(0);
    this.sirenBoostTimer = 0;
  }
  updateAI(dt, player, npcs, cars) {
    // --- DECOUPLE PLAYER & EMPTY CARS FROM AI CONTROL ---
if (this.isParked || this.health <= 0 || this.exploded || !this.hasDriver) return;

// Active police units are controlled exclusively by updatePoliceStage4A().
if (
    this.isPolice &&
    this.policeState &&
    this.policeState !== "PATROL"
) {
    return;
}

if (typeof playerCar !== 'undefined' && playerCar && this.id === playerCar.id) return;
    // --- AI POLICE RANDOM YELP & SPEED BOOST ---
    if (this.isPolice && (!playerCar || playerCar.id !== this.id)) {
      if (this.sirenBoostTimer > 0) {
        this.sirenBoostTimer -= dt;
        if (this.sirenBoostTimer <= 0) {
          this.stopSiren();
          this.sirenCooldownTimer = 1800 + Math.random() * 2400; // Reset cooldown
        }
      } else {
        this.sirenCooldownTimer -= dt;
        if (this.sirenCooldownTimer <= 0) {
          this.sirenBoostTimer = 3600 + Math.random() * 3600; // 60 to 120 seconds
          this.setSirenState(2); // Yelp sound
        }
      }
    }

    // Apply speed modifier when boosted
    const boostMultiplier = (this.sirenBoostTimer > 0) ? 1.6 : 1.0;
    const currentBaseSpeed = this.baseSpeed * boostMultiplier;

    // --- INITIALIZE AI STATE VARIABLES ---
    if (this.stuckTimer === undefined) this.stuckTimer = 0;
    if (this.reverseTimer === undefined) this.reverseTimer = 0;
    if (this.turnDirection === undefined) this.turnDirection = 1;
    if (this.lastX === undefined) this.lastX = this.x;
    if (this.lastY === undefined) this.lastY = this.y;

    const forwardAngle = this.angle - Math.PI / 2;

    // --- REVERSING STATE (STUCK ESCAPE MANEUVER) ---
    if (this.reverseTimer > 0) {
        this.reverseTimer -= dt;

        this.speed = -this.baseSpeed * 0.4;
        this.angle += 0.035 * this.turnDirection * dt;

        this.x += Math.cos(forwardAngle) * (this.speed * dt);
        this.y += Math.sin(forwardAngle) * (this.speed * dt);

        this.lastX = this.x;
        this.lastY = this.y;

        if (this.reverseTimer <= 0) {
            this.reverseTimer = 0;
            this.stuckTimer = 0;
            this.speed = 0;
        }
        return;
    }

    // --- OFF-ROAD VEHICLE RECOVERY MANEUVER ---
    const currentlyOnRoad = typeof isRoadColor === 'function' && isRoadColor(this.x, this.y);
    
    if (!currentlyOnRoad) {
      // Sample radial directions to find nearest road vector
      let bestRoadAngle = null;
      let minDistance = Infinity;

      for (let ray = 0; ray < 16; ray++) {
        let testAngle = (ray / 16) * Math.PI * 2;
        for (let dist = 15; dist <= 300; dist += 15) {
          let checkX = this.x + Math.cos(testAngle) * dist;
          let checkY = this.y + Math.sin(testAngle) * dist;
          if (typeof isRoadColor === 'function' && isRoadColor(checkX, checkY)) {
            if (dist < minDistance) {
              minDistance = dist;
              bestRoadAngle = testAngle + Math.PI / 2; // Adjust for vehicle sprite orientation
            }
            break;
          }
        }
      }

      if (bestRoadAngle !== null) {
        // Smoothly turn toward nearest road
        let angleDiff = bestRoadAngle - this.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        this.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.turnSpeed * dt);
        this.speed = Math.min(this.baseSpeed, this.speed + 0.03 * dt);

        let nextX = this.x + Math.cos(forwardAngle) * (this.speed * dt);
        let nextY = this.y + Math.sin(forwardAngle) * (this.speed * dt);

        // Allow temporary drive over walkable grass terrain to recover
        if (typeof isPlayerCarWalkable === 'function' && isPlayerCarWalkable(nextX, nextY)) {
          this.x = nextX;
          this.y = nextY;
        } else {
          // Trigger escape turn if blocked by solid non-walkable obstacle
          this.reverseTimer = 30;
          this.turnDirection = Math.random() < 0.5 ? 1 : -1;
        }
        return;
      }
    }

    // --- DYNAMIC OBSTACLE DETECTION (PLAYER, NPCS, CARS) ---
    let obstacleInFront = false;
    let avoidLeft = false;
    let avoidRight = false;
    const detectDist = (this.sensorLength || 40) + Math.max(0, this.speed * 12);

    const checkObstacle = (obsX, obsY, obsRadius) => {
        let dx = obsX - this.x;
        let dy = obsY - this.y;
        let dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < detectDist + obsRadius) {
            let angleToObs = Math.atan2(dy, dx);
            let diff = angleToObs - forwardAngle;

            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < 0.7) {
                obstacleInFront = true;
                if (diff < 0) avoidRight = true;
                else avoidLeft = true;
            }
        }
    };

    if (typeof player !== 'undefined' && player && (!playerCar || playerCar.id !== this.id)) {
        checkObstacle(player.x, player.y, 16);
    }

    if (npcs && npcs.length) {
        for (let i = 0; i < npcs.length; i++) {
            let npc = npcs[i];
            if (!npc.isPassenger) {
                checkObstacle(npc.x, npc.y, 14);
            }
        }
    }

    if (cars && cars.length) {
        for (let i = 0; i < cars.length; i++) {
            let other = cars[i];
            if (other.id !== this.id && !other.exploded) {
                checkObstacle(other.x, other.y, (other.length || 30) * 0.5);
            }
        }
    }

    // --- ROAD SENSORS ---
    const probeDist = 35;
    const frontX = this.x + Math.cos(forwardAngle) * probeDist;
    const frontY = this.y + Math.sin(forwardAngle) * probeDist;

    const leftX = this.x + Math.cos(forwardAngle - 0.4) * probeDist;
    const leftY = this.y + Math.sin(forwardAngle - 0.4) * probeDist;

    const rightX = this.x + Math.cos(forwardAngle + 0.4) * probeDist;
    const rightY = this.y + Math.sin(forwardAngle + 0.4) * probeDist;

    const frontRoad = typeof isRoadColor === 'function' ? isRoadColor(frontX, frontY) : true;
    const leftRoad  = typeof isRoadColor === 'function' ? isRoadColor(leftX, leftY)   : true;
    const rightRoad = typeof isRoadColor === 'function' ? isRoadColor(rightX, rightY)  : true;

    // --- STEERING & SPEED CONTROL ---
    if (obstacleInFront) {
        this.speed = Math.max(0, this.speed - 0.08 * dt);

        if (avoidRight && rightRoad) {
            this.angle += 0.035 * dt;
        } else if (avoidLeft && leftRoad) {
            this.angle -= 0.035 * dt;
        }
    } else if (!frontRoad || !leftRoad || !rightRoad) {
        if (!leftRoad && rightRoad) {
            this.angle += 0.04 * dt;
        } else if (!rightRoad && leftRoad) {
            this.angle -= 0.04 * dt;
        } else {
            this.angle += 0.04 * this.turnDirection * dt;
        }
        this.speed = Math.max(0.4, this.speed * 0.95);
    } else {
        if (this.speed < this.baseSpeed) {
            this.speed += 0.04 * dt;
        }
    }

    // --- POSITION & STUCK CALCULATION ---
    let nextX = this.x + Math.cos(forwardAngle) * (this.speed * dt);
    let nextY = this.y + Math.sin(forwardAngle) * (this.speed * dt);

    let distMoved = Math.hypot(nextX - this.lastX, nextY - this.lastY);

    if (distMoved < 0.12 && (this.speed > 0.1 || obstacleInFront)) {
        this.stuckTimer += 1 * dt;
    } else {
        this.stuckTimer = Math.max(0, this.stuckTimer - 0.5 * dt);
    }

    this.lastX = this.x;
    this.lastY = this.y;

    this.x = nextX;
    this.y = nextY;

    if (this.stuckTimer > 50) {
        this.reverseTimer = 45;
        this.stuckTimer = 0;
        this.turnDirection = Math.random() < 0.5 ? 1 : -1;
    }
  }
              
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (typeof ambientBrightness !== 'undefined' && ambientBrightness >= 0.75) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(-this.width / 2 + 3, -this.length / 2 + 3, this.width, this.length);
    }

    ctx.fillStyle = this.exploded ? "#3a3a3a" : this.color;
    ctx.fillRect(-this.width / 2, -this.length / 2, this.width, this.length);

    // Visual Dents (Only below 60% health)
    if (this.health < (this.maxHealth * 0.6) && !this.exploded) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath(); ctx.arc(this.width / 4, -this.length / 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-this.width / 3, 2, 2, 0, Math.PI * 2); ctx.fill();
    }

    if (this.type === "Hauler, Truck") {
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 2 + 6, this.width - 4, this.length / 4);
      ctx.fillStyle = "#1a252f";
      ctx.fillRect(-this.width / 2 + 2, 0, this.width - 4, this.length / 2 - 2);
    } 
    else if (this.type === "Porter, Van") {
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 2 + 5, this.width - 4, this.length - 10);
      ctx.fillStyle = "#34495e";
      ctx.fillRect(-this.width / 2 + 3, -this.length / 2 + 6, this.width - 6, 5);
      ctx.fillStyle = "#111111";
      ctx.fillRect(-0.5, -this.length / 4, 1, this.length * 0.7);
    }
    else if (this.type === "Ranger, SUV") {
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 3, this.width - 4, this.length * 0.65);
      ctx.fillStyle = "#111111";
      ctx.fillRect(-this.width / 2 + 1, -this.length / 6, 2, this.length / 2);
      ctx.fillRect(this.width / 2 - 3, -this.length / 6, 2, this.length / 2);
    }
    else if (this.type === "Falcon, Sports") {
      ctx.fillStyle = "#34495e";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 4, this.width - 4, this.length / 3);
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(-this.width / 2 - 2, this.length / 2 - 3, this.width + 4, 3);
    } 
    else if (this.type === "Sprint, Hatchback") {
      ctx.fillStyle = "#34495e";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 4, this.width - 4, this.length * 0.55);
      ctx.fillStyle = "#1a252f";
      ctx.fillRect(-this.width / 2 + 3, this.length / 4 + 1, this.width - 6, 3);
    }
    else {
      // Standard Commuter, Sedan Roof & Windows
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(-this.width / 2 + 2, -this.length / 6, this.width - 4, this.length / 3);
      ctx.fillRect(-this.width / 2 + 2, this.length / 4, this.width - 4, this.length / 8);

      // POLICE CAR CUSTOM THEMED GRAPHICS
      if (this.isPolice) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-this.width / 2 + 3, -this.length / 8, this.width - 6, this.length / 4);

        ctx.fillStyle = "#e74c3c"; // Red
        ctx.fillRect(-this.width / 2 + 2, -2, this.width / 2 - 2, 4);
        ctx.fillStyle = "#3498db"; // Blue
        ctx.fillRect(0, -2, this.width / 2 - 2, 4);
      }
    }

    ctx.fillStyle = "rgba(255, 255, 220, 0.8)";
    ctx.fillRect(-this.width / 2 + 1, -this.length / 2, 2, 1);
    ctx.fillRect(this.width / 2 - 3, -this.length / 2, 2, 1);

    ctx.fillStyle = "#ff3333";
    ctx.fillRect(-this.width / 2 + 1, this.length / 2 - 2, 3, 2);
    ctx.fillRect(this.width / 2 - 4, this.length / 2 - 2, 3, 2);

    // Damage Visuals
    if (this.health < 60 || this.exploded) {
      if (!this.damageParticles) this.damageParticles = [];
      if (Math.random() < (this.health <= 0 ? 0.4 : 0.15)) {
        this.damageParticles.push({
          x: (Math.random() - 0.5) * 8,
          y: -this.length / 3,
          life: 1.0,
          isFire: this.exploded
        });
      }

      for (let i = this.damageParticles.length - 1; i >= 0; i--) {
        let p = this.damageParticles[i];
        p.life -= 0.03;
        p.y -= 0.5;
        p.x += (Math.random() - 0.5) * 1.5;

        if (p.life <= 0) {
          this.damageParticles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.isFire 
          ? `rgba(255, ${Math.floor(p.life * 150)}, 0, ${p.life})` 
          : `rgba(80, 80, 80, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.isFire ? 4 : 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // --- POLICE SIREN ANIMATION & GLOW EFFECT ---
    if (this.isPolice) {
      const isFlashing = this.sirenState > 0 && !this.exploded;
      const flashSpeed = this.sirenState === 2 ? 80 : 160; // Faster flashing for Yelp
      const flashPhase = Math.floor(Date.now() / flashSpeed) % 2 === 0;

      // FIX 1: Static when inactive, alternating when active
      let leftColor = "rgba(255, 30, 30, 0.95)";
      let rightColor = "rgba(30, 100, 255, 0.95)";

      if (isFlashing) {
        leftColor = flashPhase ? "rgba(255, 30, 30, 0.95)" : "rgba(30, 100, 255, 0.95)";
        rightColor = flashPhase ? "rgba(30, 100, 255, 0.95)" : "rgba(255, 30, 30, 0.95)";
      }

      // Draw Lightbar Bulbs
      ctx.fillStyle = leftColor;
      ctx.fillRect(-this.width / 2 + 2, -2, this.width / 2 - 2, 4);
      ctx.fillStyle = rightColor;
      ctx.fillRect(0, -2, this.width / 2 - 2, 4);

      // Radial Glow Effect on Lightbar
      if (isFlashing) {
        ctx.save();

        // FIX 2: Correct Radial Glow colors for Red & Blue
        const leftGlowColor = flashPhase ? "rgba(255, 0, 0, 0.7)" : "rgba(0, 100, 255, 0.7)";
        const rightGlowColor = flashPhase ? "rgba(0, 100, 255, 0.7)" : "rgba(255, 0, 0, 0.7)";

        // Left Glow
        let leftGlow = ctx.createRadialGradient(-this.width / 4, 0, 2, -this.width / 4, 0, 45);
        leftGlow.addColorStop(0, leftGlowColor);
        leftGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = leftGlow;
        ctx.beginPath();
        ctx.arc(-this.width / 4, 0, 45, 0, Math.PI * 2);
        ctx.fill();

        // Right Glow
        let rightGlow = ctx.createRadialGradient(this.width / 4, 0, 2, this.width / 4, 0, 45);
        rightGlow.addColorStop(0, rightGlowColor);
        rightGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = rightGlow;
        ctx.beginPath();
        ctx.arc(this.width / 4, 0, 45, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // Locate this section in Car.draw(ctx):
if (typeof ambientBrightness !== 'undefined' && ambientBrightness < 0.75 && !this.isParked && !this.exploded) {
  ctx.save();

  // Headlight rendering logic...
  const headlightLength = 180;
  const beamSpread = this.width * 1.8;

  let beamGradient = ctx.createLinearGradient(0, -this.length / 2, 0, -this.length / 2 - headlightLength);
  beamGradient.addColorStop(0, 'rgba(255, 255, 220, 0.85)');   
  beamGradient.addColorStop(0.3, 'rgba(255, 255, 190, 0.45)');  
  beamGradient.addColorStop(1, 'rgba(255, 255, 180, 0)');     

  ctx.fillStyle = beamGradient;

  // Left Headlight Cone
  ctx.beginPath();
  ctx.moveTo(-this.width / 3, -this.length / 2);
  ctx.lineTo(-this.width / 3 - beamSpread, -this.length / 2 - headlightLength); 
  ctx.lineTo(this.width * 0.1, -this.length / 2 - headlightLength);  
  ctx.closePath();
  ctx.fill();

  // Right Headlight Cone
  ctx.beginPath();
  ctx.moveTo(this.width / 3, -this.length / 2);  
  ctx.lineTo(-this.width * 0.1, -this.length / 2 - headlightLength); 
  ctx.lineTo(this.width / 3 + beamSpread, -this.length / 2 - headlightLength);  
  ctx.closePath();
  ctx.fill();

  // Focal point bulb glow
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(-this.width / 3, -this.length / 2, 2.5, 0, Math.PI * 2);
  ctx.arc(this.width / 3, -this.length / 2, 2.5, 0, Math.PI * 2);
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

function initSpawns() {
  if (npcs.length > 0 || cars.length > 0) return;

  const NUM_NPCS = 25;
  const NUM_CARS = 20;

  const shirtColors = ["#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e84393"];
  const hairColors = ["#2d3436", "#4a3728", "#d35400", "#f39c12"];
  const skinColors = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  const carColors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#ecf0f1", "#34495e"];

  // 1. Spawn NPCs
  for (let i = 0; i < NUM_NPCS; i++) {
    let pos = getRandomRoadPosition();
    let isPolice = Math.random() < 0.15; 

    npcs.push(new NPC(
      i, pos.x, pos.y,
      shirtColors[Math.floor(Math.random() * shirtColors.length)],
      hairColors[Math.floor(Math.random() * hairColors.length)],
      skinColors[Math.floor(Math.random() * skinColors.length)],
      isPolice
    ));
  }

  // 2. Load saved stolen cars (support current plural and legacy singular keys)
  let savedStolenCars = localStorage.getItem("stolen_cars");
  let savedStolenCar = localStorage.getItem("stolen car");
  try {
    let carDataList = savedStolenCars ? JSON.parse(savedStolenCars) : [];
    if (!Array.isArray(carDataList)) carDataList = [carDataList];
    if (carDataList.length === 0 && savedStolenCar) {
      carDataList = [JSON.parse(savedStolenCar)];
    }

    carDataList.forEach((carData, index) => {
      if (!carData || carData.x === undefined || carData.y === undefined) return;
      let stolenCar = new Car(
        carData.id ?? (8888 + index),
        carData.x,
        carData.y,
        carData.color || "#34495e",
        Boolean(carData.isPolice),
        carData.type || null
      );
      stolenCar.angle = carData.angle || 0;
      stolenCar.isStolen = true;
      stolenCar.hasDriver = false;
      stolenCar.isParked = true;
      cars.push(stolenCar);
    });
  } catch (e) {
    console.error("Failed to parse saved stolen car data:", e);
  }

  // 3. Spawn AI Cars
  for (let i = 0; i < NUM_CARS; i++) {
    let pos = getRandomRoadPosition();
    let isPolice = Math.random() < 0.15;
    let color = carColors[Math.floor(Math.random() * carColors.length)];

    cars.push(new Car(i + 100, pos.x, pos.y, color, isPolice));
  }
}


if (mapImage.complete && mapWidth > 0) {
  initSpawns();
} else {
  mapImage.addEventListener('load', initSpawns);
}


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
// --- EXHAUST SMOKE HELPER ---
function emitExhaustSmoke(car) {
    if (!car || car.isParked || car.health <= 0 || car.exploded) return;

    // Position smoke at the rear bumper
    const backOffset = car.length / 2;
    const exhaustX = car.x - Math.cos(car.angle - Math.PI / 2) * backOffset;
    const exhaustY = car.y - Math.sin(car.angle - Math.PI / 2) * backOffset;

    // Darker smoke when accelerating; lighter smoke when idle or driving at top speed
    const isTopSpeed = Math.abs(car.speed) >= (car.baseSpeed * 2.5);
    const isDarkSmoke = car.isAccelerating && !isTopSpeed;

    exhaustParticles.push({
        x: exhaustX + (Math.random() - 0.5) * 4,
        y: exhaustY + (Math.random() - 0.5) * 4,
        vx: -Math.cos(car.angle - Math.PI / 2) * (car.speed * 0.2) + (Math.random() - 0.5) * 0.4,
        vy: -Math.sin(car.angle - Math.PI / 2) * (car.speed * 0.2) + (Math.random() - 0.5) * 0.4,
        size: 3 + Math.random() * 2,
        maxSize: 9 + Math.random() * 5,
        alpha: isDarkSmoke ? 0.65 : 0.25,
        colorShade: isDarkSmoke ? 40 : 210, // Dark gray vs light gray
        life: 40 + Math.random() * 20,
        maxLife: 60
    });
}

function updateExhaustParticles(dt) {
    for (let i = exhaustParticles.length - 1; i >= 0; i--) {
        const p = exhaustParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += 0.15 * dt;
        p.alpha -= 0.012 * dt;
        p.life -= dt;

        if (p.life <= 0 || p.alpha <= 0) {
            exhaustParticles.splice(i, 1);
        }
    }
}

function drawExhaustParticles(ctx) {
    exhaustParticles.forEach(p => {
        ctx.fillStyle = `rgba(${p.colorShade}, ${p.colorShade}, ${p.colorShade}, ${Math.max(0, p.alpha)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

// --- DEBRIS SYSTEM HELPER ---
function spawnExplosionDebris(x, y, count = 22) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        debrisParticles.push({
            x: x,
            y: y,
            z: 5 + Math.random() * 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            vz: 3 + Math.random() * 5,
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.3,
            size: 3 + Math.random() * 4,
            color: Math.random() < 0.5 ? '#222222' : '#555555',
            life: 180 + Math.random() * 120 // ~3 to 5 seconds
        });
    }
}

function updateDebrisParticles(dt) {
    for (let i = debrisParticles.length - 1; i >= 0; i--) {
        const p = debrisParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vz -= 0.22 * dt; // Gravity
        p.rotation += p.vRot * dt;
        p.life -= dt;

        // Bounce on ground contact
        if (p.z <= 0) {
            p.z = 0;
            p.vz = -p.vz * 0.45; 
            p.vx *= 0.65;
            p.vy *= 0.65;
            p.vRot *= 0.65;
        }

        if (p.life <= 0) {
            debrisParticles.splice(i, 1);
        }
    }
}

function drawDebrisParticles(ctx) {
    debrisParticles.forEach(p => {
        const alpha = p.life < 30 ? p.life / 30 : 1.0;

        // Shadow on the ground
        if (p.z > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * alpha})`;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Flying debris piece
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
    });
}

// --- TYRE MARKS HELPER ---
function addTyreMarks(car) {
    if (!car) return;

    // Initialize last tracking coordinates if undefined
    if (car.tyreLastX === undefined || car.tyreLastY === undefined) {
        car.tyreLastX = car.x;
        car.tyreLastY = car.y;
        car.tyreLastAngle = car.angle;
        return;
    }

    // Measure movement distance since last frame
    const dx = car.x - car.tyreLastX;
    const dy = car.y - car.tyreLastY;
    const distSq = dx * dx + dy * dy;

    // Skip drawing if car teleported/respawned (> 50px) or is stationary (< 0.2px)
    if (distSq > 2500 || distSq < 0.04) {
        car.tyreLastX = car.x;
        car.tyreLastY = car.y;
        car.tyreLastAngle = car.angle;
        return;
    }

    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const prevCos = Math.cos(car.tyreLastAngle !== undefined ? car.tyreLastAngle : car.angle);
    const prevSin = Math.sin(car.tyreLastAngle !== undefined ? car.tyreLastAngle : car.angle);

    const rw = car.width / 2 - 2;
    const rl = car.length / 2 - 4;

    // Calculate current rear wheel coordinates
    const lrX = car.x + (-rw * cos - rl * sin);
    const lrY = car.y + (-rw * sin + rl * cos);
    const rrX = car.x + (rw * cos - rl * sin);
    const rrY = car.y + (rw * sin + rl * cos);

    // Calculate previous rear wheel coordinates using last frame position & angle
    const prevLrX = car.tyreLastX + (-rw * prevCos - rl * prevSin);
    const prevLrY = car.tyreLastY + (-rw * prevSin + rl * prevCos);
    const prevRrX = car.tyreLastX + (rw * prevCos - rl * prevSin);
    const prevRrY = car.tyreLastY + (rw * prevSin + rl * prevCos);

    tyreMarks.push(
        { x1: prevLrX, y1: prevLrY, x2: lrX, y2: lrY, alpha: 0.5, life: 500 },
        { x1: prevRrX, y1: prevRrY, x2: rrX, y2: rrY, alpha: 0.5, life: 500 }
    );

    // Update position memory for next frame
    car.tyreLastX = car.x;
    car.tyreLastY = car.y;
    car.tyreLastAngle = car.angle;
}

function updateTyreMarks(dt) {
    for (let i = tyreMarks.length - 1; i >= 0; i--) {
        const tm = tyreMarks[i];
        tm.life -= dt;
        if (tm.life < 100) {
            tm.alpha = (tm.life / 100) * 0.5;
        }
        if (tm.life <= 0) {
            tyreMarks.splice(i, 1);
        }
    }
}

function drawTyreMarks(ctx) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111111";
    tyreMarks.forEach(tm => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, tm.alpha);
        ctx.beginPath();
        ctx.moveTo(tm.x1, tm.y1);
        ctx.lineTo(tm.x2, tm.y2);
        ctx.stroke();
        ctx.restore();
    });
}
