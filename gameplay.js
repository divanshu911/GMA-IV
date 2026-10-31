console.log("rkh");

const JOB_LOCATION_CHECK_INTERVAL = 15;

function isWithinJobLocationRadiusCached(owner, key, x, y, centerX, centerY, radius) {
    if (!owner._locationProximityCache) {
        owner._locationProximityCache = Object.create(null);
    }

    let cached = owner._locationProximityCache[key];

    if (!cached || --cached.framesUntilCheck <= 0) {
        const dx = x - centerX;
        const dy = y - centerY;

        cached = owner._locationProximityCache[key] = {
            inside: dx * dx + dy * dy < radius * radius,
            framesUntilCheck: JOB_LOCATION_CHECK_INTERVAL
        };
    }

    return cached.inside;
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

    this.passengerState = "none";
    this.passengerWalkSpeed = 0.75;
    this.stationaryTimer = 0;
    this.lastTaxiX = 0;
    this.lastTaxiY = 0;
  }

  setMessage(text, duration = 180) {
    this.messageText = text;
    this.messageTimer = duration;
  }

  // Search a limited area once per pickup. Prefer walkable grass
  // beside the road and close to an unwalkable boundary.
  findRoadsidePassengerPosition(roadX, roadY) {
    const isWalkable = (x, y) =>
      typeof isWalkableColor === "function" &&
      isWalkableColor(x, y, 12);

    const isRoad = (x, y) =>
      typeof isRoadColor === "function" &&
      isRoadColor(x, y);

    let best = null;
    let bestScore = Infinity;

    // Fixed, bounded search; never runs every frame.
    for (let radius = 18; radius <= 90; radius += 12) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const x = Math.round(roadX + Math.cos(angle) * radius);
        const y = Math.round(roadY + Math.sin(angle) * radius);

        if (!isWalkable(x, y) || isRoad(x, y)) continue;

        // Keep the NPC on the walkable side of a building,
        // river, or other unwalkable boundary when possible.
        let nearBlockedEdge = false;
        for (let a = 0; a < 8; a++) {
          const edgeAngle = a * Math.PI / 4;
          const ex = x + Math.cos(edgeAngle) * 16;
          const ey = y + Math.sin(edgeAngle) * 16;

          if (!isWalkable(ex, ey)) {
            nearBlockedEdge = true;
            break;
          }
        }

        // Prefer grass adjacent to an obstacle, but still
        // close enough to the road for the taxi to reach.
        const score =
          radius + (nearBlockedEdge ? -10 : 12);

        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }

      // A good nearby roadside point has been found.
      if (best && bestScore <= radius) break;
    }

    // Fallback: try nearby walkable positions if the roadside
    // scan found no suitable point.
    if (!best) {
      for (let radius = 12; radius <= 72; radius += 12) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = Math.round(roadX + Math.cos(angle) * radius);
          const y = Math.round(roadY + Math.sin(angle) * radius);

          if (isWalkable(x, y) && !isRoad(x, y)) {
            best = { x, y };
            break;
          }
        }
        if (best) break;
      }
    }

    // Last resort: use the road pickup point itself, but only
    // when no walkable roadside point exists nearby.
    return best || { x: roadX, y: roadY };
  }

  spawnWaitingPassenger(npcs) {
    const pos = this.findRoadsidePassengerPosition(
      this.pickupX,
      this.pickupY
    );

    const shirtColors = [
      "#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6"
    ];
    const hairColors = ["#2d3436", "#4a3728", "#d35400"];
    const skinColors = ["#ffdbac", "#f1c27d", "#e0ac69"];

    this.currentPassenger = new NPC(
      Date.now(),
      pos.x,
      pos.y,
      shirtColors[Math.floor(Math.random() * shirtColors.length)],
      hairColors[Math.floor(Math.random() * hairColors.length)],
      skinColors[Math.floor(Math.random() * skinColors.length)]
    );

    
    this.currentPassenger.isTaxiWaiting = true;
    this.currentPassenger.isPassenger = false;

    // Face the road pickup point while waiting for the taxi.
    this.currentPassenger.angle = Math.atan2(
      this.pickupY - pos.y,
      this.pickupX - pos.x
    );

    this.passengerState = "waiting";

    // Keep the waiting pedestrian in the normal NPC array so
    // collisions and injury detection can affect them.
    if (!npcs.includes(this.currentPassenger)) {
      npcs.push(this.currentPassenger);
    }
  }

  removeWaitingPassenger(npcs) {
    if (!this.currentPassenger) return;

    const index = npcs.indexOf(this.currentPassenger);
    if (index !== -1) npcs.splice(index, 1);

    this.currentPassenger.isTaxiWaiting = false;
    this.currentPassenger = null;
    this.passengerState = "none";
  }

  update(dt, player, cars, npcs) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
    }

    if (!this.isJobActive) {
      const nearDepot = isWithinJobLocationRadiusCached(
        this, "taxiDepot",
        player.x, player.y,
        this.depotX, this.depotY, 60
      );

      if (nearDepot && !playerCar) {
        taxiBtn.style.display = "flex";
      } else {
        taxiBtn.style.display = "none";
      }
      return;
    }

    this.rentTimer -= dt;
    if (this.rentTimer <= 0) {
      this.endJobExpired(player, cars, npcs);
      return;
    }

    if (!playerCar || !playerCar.isTaxi) {
      const taxi = cars.find(c => c.isTaxi);
      if (taxi) {
        const dx = player.x - taxi.x;
        const dy = player.y - taxi.y;

        if (dx * dx + dy * dy > 300 * 300) {
          this.failJob(player, cars, npcs);
          return;
        }
      }

      if (!this.warnedOutOfTaxi) {
        this.setMessage(
          "Get back into your Taxi! Don't stray too far.", 180
        );
        this.warnedOutOfTaxi = true;
      }
      return;
    }

    this.warnedOutOfTaxi = false;

    if (this.pickupCooldown > 0) {
      this.pickupCooldown -= dt;
    }

    if (!this.hasPassenger) {
      if (
        this.pickupX === 0 &&
        this.pickupY === 0 &&
        this.pickupCooldown <= 0
      ) {
        this.generateNewPickupPoint(npcs);
      }

      if (this.currentPassenger && this.currentPassenger.isInjured) {
    // Leave the injured pedestrian in the NPC array.
    // Normal world cleanup can remove them later.
    this.currentPassenger.isTaxiWaiting = false;
    this.currentPassenger.inConversation = false;

    this.currentPassenger = null;
    this.passengerState = "none";
    this.pickupX = 0;
    this.pickupY = 0;
    this.stationaryTimer = 0;
    this.pickupCooldown = 30;

    this.setMessage(
        "Passenger injured! Finding another customer.", 210
    );
    return;
      }

      if (this.pickupX !== 0 && this.pickupY !== 0) {
        const dx = playerCar.x - this.pickupX;
        const dy = playerCar.y - this.pickupY;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < 55 * 55 && this.currentPassenger) {
          // The taxi must be almost stationary near the pickup
          // before the passenger starts walking over.
          if (Math.abs(playerCar.speed || 0) < 0.12) {
            this.stationaryTimer += dt;
          } else {
            this.stationaryTimer = 0;
          }

          if (this.stationaryTimer >= 12) {
            this.passengerState = "approaching";
          }
        } else {
          this.stationaryTimer = 0;
        }

        if (
          this.passengerState === "approaching" &&
          this.currentPassenger &&
          !this.currentPassenger.isInjured
        ) {
          const p = this.currentPassenger;
          const tx = playerCar.x;
          const ty = playerCar.y;
          const pdx = tx - p.x;
          const pdy = ty - p.y;
          const distance = Math.sqrt(pdx * pdx + pdy * pdy);

          if (distance <= 27) {
            this.pickUpPassengerAtPoint(npcs);
            return;
          }

          // Direct movement only: no A*, no path creation.
          

          const step = Math.min(
    distance,
    this.passengerWalkSpeed * dt
);

const nextX = p.x + (pdx / distance) * step;
const nextY = p.y + (pdy / distance) * step;


          // Always face the taxi while approaching it.
          p.angle = Math.atan2(pdy, pdx);

          // Taxi passengers can cross any surface to reach the taxi.
          p.x = nextX;
          p.y = nextY;

                    p.walkTimer += step * 0.12;          
        }
      }
    } else {
      const dx = playerCar.x - this.destinationX;
      const dy = playerCar.y - this.destinationY;

      if (dx * dx + dy * dy < 60 * 60) {
        this.dropOffPassenger(player, npcs);
      }
    }
  }

  startJob(player, cars, npcs) {
    player.money -= this.rentCost;
    localStorage.setItem("gma_player_money", player.money);

    this.isJobActive = true;
    this.rentTimer = this.maxRentTime;
    this.hasPassenger = false;
    this.currentPassenger = null;
    this.passengerState = "none";
    this.pickupCooldown = 0;
    this.warnedOutOfTaxi = false;

    const taxiId = cars.length + 999;
    const taxi = new Car(taxiId, this.depotX, this.depotY, "#f1c40f");

    taxi.type = "sedan";
    taxi.ownerType = "taxiDepot";
    taxi.width = 16;
    taxi.length = 28;
    taxi.baseSpeed = 1.2 + Math.random() * 0.5;
    taxi.turnSpeed = 0.05;
    taxi.sensorLength = 35;
    taxi.isTaxi = true;
    taxi.hasDriver = false;
    taxi.isParked = true;
    cars.push(taxi);

    playerCar = taxi;
    playerCar.isParked = false;

    this.generateNewPickupPoint(npcs);
  }

  generateNewPickupPoint(npcs = []) {
    this.removeWaitingPassenger(npcs);

    const pickPos = getRandomStrictRoadPosition();
    this.pickupX = pickPos.x;
    this.pickupY = pickPos.y;
    this.hasPassenger = false;
    this.passengerState = "none";
    this.stationaryTimer = 0;

    this.spawnWaitingPassenger(npcs);

    this.setMessage(
      "New customer waiting! Stop near the yellow marker for pickup.", 240
    );
  }

  pickUpPassengerAtPoint(npcs) {
    if (!this.currentPassenger || this.currentPassenger.isInjured) {
      this.removeWaitingPassenger(npcs);
      this.pickupX = 0;
      this.pickupY = 0;
      this.pickupCooldown = 30;
      this.setMessage("Customer unavailable. Finding another pickup.", 180);
      return;
    }

    const passenger = this.currentPassenger;

    // Remove the pedestrian from the world NPC list while inside
    // the taxi, avoiding duplicate NPC references on drop-off.
    const index = npcs.indexOf(passenger);
    if (index !== -1) npcs.splice(index, 1);

    passenger.isTaxiWaiting = false;
    passenger.isPassenger = true;

    this.hasPassenger = true;
    this.passengerState = "boarded";
    this.pickupX = 0;
    this.pickupY = 0;
    this.stationaryTimer = 0;

    const dest = getRandomStrictRoadPosition();
    this.destinationX = dest.x;
    this.destinationY = dest.y;

    this.setMessage(
      "Passenger picked up! Head to the green dropoff zone.", 180
    );
  }

  dropOffPassenger(player, npcs) {
    const fare = 85 + Math.floor(Math.random() * 58);
    player.money += fare;
    localStorage.setItem("gma_player_money", player.money);

    player.taxiMissionsCompleted =
      (player.taxiMissionsCompleted || 0) + 1;
    localStorage.setItem(
      "gma_taxi_missions_completed",
      player.taxiMissionsCompleted
    );

    if (this.currentPassenger) {
      this.currentPassenger.isPassenger = false;
      this.currentPassenger.isTaxiWaiting = false;
      this.currentPassenger.x = playerCar.x + 35;
      this.currentPassenger.y = playerCar.y;

      if (!npcs.includes(this.currentPassenger)) {
        npcs.push(this.currentPassenger);
      }
    }

    this.hasPassenger = false;
    this.currentPassenger = null;
    this.passengerState = "none";
    this.pickupCooldown = 180;
    this.pickupX = 0;
    this.pickupY = 0;

    this.setMessage(
      "Passenger arrived safely! Earned $" + fare, 180
    );
  }

  failJob(player, cars, npcs) {
    player.money -= 80;
    localStorage.setItem("gma_player_money", player.money);
    this.endJobExpired(player, cars, npcs);
    this.setMessage(
      "Abandoned taxi! Penalty: -$80. Taxi despawned.", 300
    );
  }

  endJobExpired(player, cars, npcs) {
    this.isJobActive = false;

    if (this.currentPassenger) {
      if (this.hasPassenger) {
        this.currentPassenger.isPassenger = false;
        this.currentPassenger.isTaxiWaiting = false;
        if (!npcs.includes(this.currentPassenger)) {
          npcs.push(this.currentPassenger);
        }
      } else {
        this.removeWaitingPassenger(npcs);
      }
    }

    this.hasPassenger = false;
    this.currentPassenger = null;
    this.passengerState = "none";
    this.pickupX = 0;
    this.pickupY = 0;
    this.destinationX = 0;
    this.destinationY = 0;

    this.setMessage("Rental time expired! Taxi despawned.", 300);

    const taxiIndex = cars.findIndex(c => c.isTaxi);
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

      const secondsLeft = Math.max(0, Math.floor(this.rentTimer / 60));
      ctx.fillText(` TIME LEFT: ${secondsLeft}s`, 35, 105);

      let status = "Searching...";
      if (this.passengerState === "approaching") status = "Pickup...";
      if (this.hasPassenger) status = "Ferrying...";

      ctx.fillText(`STATUS: ${status}`, 35, 130);
    }
  }

  drawWorldMarkers(ctx) {}
}
const taxiBtn = document.getElementById('taxiBtn');
if (taxiBtn) {
    taxiBtn.addEventListener('click', () => {
      if (player.money >= taxiManager.rentCost) {
        taxiManager.startJob(player, cars, npcs);
        if (typeof navigationManager !== "undefined") navigationManager.register("taxi");
        taxiBtn.style.display = 'none'; 
      } else {
        taxiManager.setMessage("Not enough money to rent a Taxi! Need $" + taxiManager.rentCost, 60);
      }
    });
}
let taxiManager = new TaxiJobManager(2908, 950);

// --- BLACK MARKET ZONE ---
let savedBlackMarketSales = [];
try {
    const savedSales = localStorage.getItem("gma_black_market_sold_times");
    if (savedSales) {
        const parsedSales = JSON.parse(savedSales);
        if (Array.isArray(parsedSales)) {
            savedBlackMarketSales = parsedSales.filter(time => Number.isFinite(Number(time))).map(Number);
        }
    }
} catch (error) {
    console.warn("Could not load black-market cooldown data.", error);
}

const blackMarketZone = {
    x: 3412,
    y: 1435,
    radius: 65,
    soldTimes: savedBlackMarketSales
};
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
        localStorage.setItem(
            "gma_black_market_sold_times",
            JSON.stringify(blackMarketZone.soldTimes)
        );

        if (blackMarketZone.soldTimes.length >= 2) {
            taxiManager.setMessage("Black market is full! (Limit: 2 cars per 6 hours)", 180);
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
            taxiManager.setMessage("No car parked! Park a stolen car in the purple zone to sell it.", 180);
            return;
        }
        if (carToSell.ownerType !== "civilian") {
          taxiManager.setMessage("The black market only buys civilian owned vehicles.", 180);
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

        // Remove sold car from cars array
        let carIndex = cars.indexOf(carToSell);
        if (carIndex > -1) cars.splice(carIndex, 1);

        // Sync stolen array and recalculate wanted state
        updateStolenCarsStorage(true);

        blackMarketZone.soldTimes.push(currentHour);
        localStorage.setItem(
            "gma_black_market_sold_times",
            JSON.stringify(blackMarketZone.soldTimes)
        );
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

    
    this.warnedOutOfTruck = false;
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
    player.money -= 120; 
    localStorage.setItem("gma_player_money", player.money);
    taximanager.setMessage("Mission Failed! Left the truck behind. Penalty: -$120", 240);
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
    
const nearCompany = isWithinJobLocationRadiusCached(
    this, "truckCompany",
    player.x, player.y,
    this.companyX, this.companyY, this.companyRadius
);

const btn = document.getElementById('truckBtn');

if (!this.isJobActive && nearCompany && !playerCar) {
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
        taxiManager.setMessage("Get back in the truck! Don't leave it to avoid penalty.", 180);
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
          taxiManager.setMessage("Goods Loaded! Deliver them safely to the green waypoint.", 240);
        }
      } else if (this.stage === 2) {
        let dist = Math.sqrt(Math.pow(this.truck.x - this.destinationX, 2) + Math.pow(this.truck.y - this.destinationY, 2));
        if (dist < 60) {
          this.stage = 3;
          this.destinationX = 0;
          this.destinationY = 0;
          taxiManager.setMessage("Goods Delivered! Return the truck to the Truck Company zone.", 240);
        }
      } else if (this.stage === 3) {
        let dist = Math.sqrt(Math.pow(this.truck.x - this.companyX, 2) + Math.pow(this.truck.y - this.companyY, 2));
        if (dist < 60) {
          let reward = 150 + Math.floor(Math.random() * 85); 
          player.money += reward;
          localStorage.setItem("gma_player_money", player.money);
          taxiManager.setMessage(`Cargo Completed! Job Pay: +$${reward}`, 240);
          this.cleanup(cars);
        }
      }
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
        if (typeof navigationManager !== "undefined") navigationManager.register("truck");
        truckBtn.style.display = 'none';
      } else {
        let missingMissions = 15 - completedTaxi;
        taxiManager.setMessage(`Locked: Complete ${missingMissions} more Taxi jobs to unlock Cargo Missions!`, 180);
      }
    });
}

// ===== REPAIR GARAGE GLOBAL DECLARATIONS =====
const repairGarageZone = { x: 869, y: 702, radius: 60 };
let repairGarageBtn = null;
let towTruckBtn = null;

window.addEventListener('load', () => {
    repairGarageBtn = initHomeBtn('repairGarageBtn', 'REPAIR GARAGE', '#1abc9c', '110px');
    towTruckBtn = initHomeBtn('towTruckBtn', 'TOW ($250)', '#e67e22', '160px');

    if (towTruckBtn) {
        towTruckBtn.style.position = 'fixed';
        towTruckBtn.style.bottom = '20px';
        towTruckBtn.style.left = '70px';
        towTruckBtn.style.right = 'auto';
        towTruckBtn.style.top = 'auto';
        towTruckBtn.style.zIndex = '1000';
        towTruckBtn.style.display = 'none';
    }

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
        <h3 style="margin-top:0; color:#1abc9c;">CONFIRM?</h3>
        <p id="repairModalText" style="margin:15px 0; font-size:14px; color:#ddd;"></p>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:15px;">
            <button id="confirmRepairBtn" style="padding:8px 18px; background:#2ecc71; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">✔️</button>
            <button id="cancelRepairBtn" style="padding:8px 18px; background:#e74c3c; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">❌</button>
        </div>
    `;
    (document.getElementById('gameContainer') || document.body).appendChild(repairModal);

    let towModal = document.createElement('div');
    towModal.id = 'towModal';
    towModal.style.position = 'absolute';
    towModal.style.top = '30%';
    towModal.style.left = '50%';
    towModal.style.transform = 'translate(-50%, -50%)';
    towModal.style.background = 'rgba(20, 20, 20, 0.95)';
    towModal.style.border = '2px solid #e67e22';
    towModal.style.borderRadius = '10px';
    towModal.style.padding = '20px';
    towModal.style.color = '#ffffff';
    towModal.style.fontFamily = 'Arial, sans-serif';
    towModal.style.textAlign = 'center';
    towModal.style.zIndex = '2000';
    towModal.style.display = 'none';

    towModal.innerHTML = `
        <h3 style="margin-top:0; color:#e67e22;">Tow Truck</h3>
        <p id="towModalText" style="margin:15px 0; font-size:14px; color:#ddd;">Tow your vehicle to the Repair Garage for $250?</p>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:15px;">
            <button id="confirmTowBtn" style="padding:8px 18px; background:#2ecc71; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">Confirm ($250)</button>
            <button id="cancelTowBtn" style="padding:8px 18px; background:#e74c3c; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">Cancel</button>
        </div>
    `;
    (document.getElementById('gameContainer') || document.body).appendChild(towModal);

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
            const rawCost = Math.round(missingHealthRatio * basePrice * 0.12);

            calculatedRepairCost = missingHealth > 0 ? Math.max(50, rawCost) : 0;
            carToRepair = parkedCar;

            const textElem = document.getElementById('repairModalText');
            if (textElem) {
                textElem.innerText = `Repair ${parkedCar.type || 'Vehicle'}?\nRepair Cost: $${calculatedRepairCost}`;
            }
            repairModal.style.display = 'block';
        });
    }       

    const confirmRepairBtn = document.getElementById('confirmRepairBtn');
    if (confirmRepairBtn) {
        confirmRepairBtn.addEventListener('click', () => {
            if (carToRepair && calculatedRepairCost > 0) {
                if (player.money >= calculatedRepairCost) {
                    player.money -= calculatedRepairCost;
                    localStorage.setItem("gma_player_money", player.money);

                    carToRepair.health = carToRepair.maxHealth || 250;
                    carToRepair.engineDeadPlayed = false;

                    taxiManager.setMessage(`Vehicle fully repaired for $${calculatedRepairCost}!`, 200);
                } else {
                    taxiManager.setMessage("Not enough money for repairs!", 180);
                }
            }
            repairModal.style.display = 'none';
            carToRepair = null;
        });
    }

    const cancelRepairBtn = document.getElementById('cancelRepairBtn');
    if (cancelRepairBtn) {
        cancelRepairBtn.addEventListener('click', () => {
            repairModal.style.display = 'none';
            carToRepair = null;
        });
    }

    if (towTruckBtn) {
        towTruckBtn.addEventListener('click', () => {

            // During a race, this button becomes LEAVE RACE.
            if (
                typeof raceEventManager !== "undefined" &&
                raceEventManager &&
                raceEventManager.state === "RACING" &&
                raceEventManager.playerJoined &&
                !raceEventManager.playerLeftRace
            ) {
                raceEventManager.leavePlayerRace();
                return;
            }

            // Normal Tow Truck behavior.
            if (
                typeof playerCar !== 'undefined' &&
                playerCar
            ) {
                towModal.style.display = 'block';
            } else {
                taxiManager.setMessage(
                    "You must be inside a vehicle to use the Tow service!",
                    180
                );
            }
        });
    }

    const confirmTowBtn = document.getElementById('confirmTowBtn');
    if (confirmTowBtn) {
        confirmTowBtn.addEventListener('click', () => {
            if (typeof playerCar !== 'undefined' && playerCar) {
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
            towModal.style.display = 'none';
        });
    }

    const cancelTowBtn = document.getElementById('cancelTowBtn');
    if (cancelTowBtn) {
        cancelTowBtn.addEventListener('click', () => {
            towModal.style.display = 'none';
        });
    }
});

// DEALERSHIP
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
        car.width = 15; car.length = 26; car.baseSpeed = 2.3; car.turnSpeed = 0.08; car.sensorLength = 35; car.weightMultiplier = 1.2;
    } else {
        car.type = "Commuter, Sedan";
        car.width = 16; car.length = 28; car.baseSpeed = 1.4; car.turnSpeed = 0.05; car.sensorLength = 35; car.weightMultiplier = 1.5;
    }
    car.speed = car.baseSpeed;
}

// PLAYER-OWNED CARS
// Keep all owned vehicles in one collection so dealerships, persistence, and
// world spawning use the same source of truth.
const PLAYER_CARS_STORAGE_KEY = "gma_player_cars";
let playerCars = [];

function normalizePlayerCarData(data, index) {
    if (!data || !data.type) return null;

    const fallbackX = dealershipZone.x + 80 + (index * 45);
    const fallbackY = dealershipZone.y + 40;
    return {
        id: data.id !== undefined ? data.id : 100000 + index,
        type: data.type,
        color: data.color || "#ffffff",
        x: Number.isFinite(Number(data.x)) ? Number(data.x) : fallbackX,
        y: Number.isFinite(Number(data.y)) ? Number(data.y) : fallbackY,
        angle: Number.isFinite(Number(data.angle)) ? Number(data.angle) : 0
    };
}

function savePlayerCars() {
    localStorage.setItem(PLAYER_CARS_STORAGE_KEY, JSON.stringify(playerCars));
    // Prevent an older loader from recreating slot-based cars.
    localStorage.removeItem("gma_player_owned_car");
    localStorage.removeItem("gma_player_second_car");
}

function loadPlayerCars() {
    let savedCars = null;
    const arrayData = localStorage.getItem(PLAYER_CARS_STORAGE_KEY);

    if (arrayData) {
        try {
            savedCars = JSON.parse(arrayData);
        } catch (error) {
            console.warn("Invalid player car array; starting with no owned cars.");
        }
    }

    // Migrate the two old slots once, preserving existing player vehicles.
    if (!Array.isArray(savedCars)) {
        savedCars = [];
        for (const legacyKey of ["gma_player_owned_car", "gma_player_second_car"]) {
            const legacyData = localStorage.getItem(legacyKey);
            if (!legacyData) continue;
            try {
                const normalized = normalizePlayerCarData(JSON.parse(legacyData), savedCars.length);
                if (normalized) savedCars.push(normalized);
            } catch (error) {
                console.warn(`Could not migrate ${legacyKey}.`);
            }
        }
    }

    playerCars = savedCars
        .map((data, index) => normalizePlayerCarData(data, index))
        .filter(Boolean);
    savePlayerCars();
}

function nextPlayerCarId() {
    const numericIds = playerCars
        .map(car => Number(car.id))
        .filter(Number.isFinite);
    return Math.max(99999, ...numericIds) + 1;
}

function createPlayerOwnedCar(data, index = 0) {
    const car = new Car(
        data.id,
        data.x,
        data.y,
        data.color,
        false,
        data.type
    );
    applyCarStats(car, data.type);
    car.angle = data.angle || 0;
    car.isParked = true;
    car.hasDriver = false;
    car.ownerType = "playerOwned";
    car.playerCarId = data.id;
    return car;
}

function syncPlayerCarsStorage() {
    if (typeof cars === "undefined") return;

    playerCars.forEach(savedCar => {
        const worldCar = cars.find(car =>
            car.ownerType === "playerOwned" &&
            car.playerCarId === savedCar.id
        );
        if (!worldCar) return;

        savedCar.x = worldCar.x;
        savedCar.y = worldCar.y;
        savedCar.angle = worldCar.angle;
    });
    savePlayerCars();
}

loadPlayerCars();

const enterDealerBtn = document.getElementById('enterDealerBtn');
const exitDealerBtn = document.getElementById('exitDealerBtn');
const dealershipPanel = document.getElementById('dealershipPanel');
const buyCarBtn = document.getElementById('buyCarBtn');

if (enterDealerBtn) {
    enterDealerBtn.addEventListener('click', () => {
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

            const purchasedCar = {
                id: nextPlayerCarId(),
                type: viewingCar.type,
                color: pickedColor,
                x: spawnX,
                y: spawnY,
                angle: 0
            };
            playerCars.push(purchasedCar);
            savePlayerCars();

            cars.push(createPlayerOwnedCar(purchasedCar));
            taxiManager.setMessage(
                `Bought ${viewingCar.type}, parked outside!`,
                240
            );

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

if (leaveHomeBtn) {
    leaveHomeBtn.addEventListener('click', () => {
        player.isEvicted = true;
        localStorage.setItem("gma_player_evicted", "true");

        taxiManager.setMessage("You left your home and stopped paying rent. You are now evicted!", 240);
        leaveHomeBtn.style.display = 'none';
        if (enterHomeBtn) enterHomeBtn.style.display = 'none';
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

    }
    syncPlayerCarsStorage();
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

// --- RESPAWN ROAD SEARCH HELPERS ---
// Probe directions used to measure how far a point is from the nearest non-road pixel.
const respawnProbeDirs = [];
for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    respawnProbeDirs.push({ x: Math.cos(a), y: Math.sin(a) });
}

// Distance (capped) from (x, y) to the nearest non-road pixel. Returns 0 if (x, y) itself is not road.
function getRespawnRoadClearance(x, y, cap) {
    if (!isStrictRoadColor(x, y)) return 0;
    let clearance = cap;
    for (let i = 0; i < respawnProbeDirs.length; i++) {
        const dir = respawnProbeDirs[i];
        for (let d = 2; d < clearance; d += 2) {
            if (!isStrictRoadColor(x + dir.x * d, y + dir.y * d)) {
                clearance = d;
                break;
            }
        }
    }
    return clearance;
}

// Hill-climbs from a road point toward the position with the most road around it
// (i.e. the middle of the road/lane), moving from coarse to fine steps.
function centerOnRoadForRespawn(x, y) {
    const cap = 40;
    let bestX = x;
    let bestY = y;
    let best = getRespawnRoadClearance(bestX, bestY, cap);

    for (let step = 8; step >= 1; step /= 2) {
        for (let iter = 0; iter < 40; iter++) {
            let nextX = bestX;
            let nextY = bestY;
            let nextBest = best;

            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * 2 * Math.PI;
                const cx = bestX + Math.cos(a) * step;
                const cy = bestY + Math.sin(a) * step;
                const c = getRespawnRoadClearance(cx, cy, cap);
                if (c > nextBest) {
                    nextBest = c;
                    nextX = cx;
                    nextY = cy;
                }
            }

            if (nextBest <= best) break;
            best = nextBest;
            bestX = nextX;
            bestY = nextY;
        }
    }

    return { x: bestX, y: bestY, clearance: best };
}

// startX/startY and the returned position are player coordinates (top-left of the player box,
// same as player.x / player.y). The returned position puts the player's center well inside a road.
function getNearbyRoadPosition(startX, startY) {
    const half = ((typeof player !== 'undefined' && player.size) || 20) / 2;
    const toPlayerPos = (p) => ({ x: Math.round(p.x - half), y: Math.round(p.y - half) });

    if (typeof isStrictRoadColor === 'function') {
        const minClearance = 8;   // road pixels needed around the spawn point on every side
        const maxRadius = 1000;
        const step = 6;
        const maxFailedCandidates = 40;

        const centerX = startX + half;
        const centerY = startY + half;

        let bestFallback = null;
        const failed = [];

        // Returns a well-centered road position near (px, py), or null if the spot is unsuitable.
        const tryPoint = (px, py) => {
            if (!isStrictRoadColor(px, py)) return null;
            for (let i = 0; i < failed.length; i++) {
                if (Math.hypot(px - failed[i].x, py - failed[i].y) < 24) return null;
            }
            const refined = centerOnRoadForRespawn(px, py);
            if (refined.clearance >= minClearance) return refined;
            failed.push({ x: px, y: py });
            if (!bestFallback || refined.clearance > bestFallback.clearance) bestFallback = refined;
            return null;
        };

        // Search outward in expanding concentric circles
        search:
        for (let radius = 0; radius <= maxRadius; radius += step) {
            const samples = radius === 0 ? 1 : Math.floor(2 * Math.PI * radius / step);
            for (let i = 0; i < samples; i++) {
                const angle = (i / samples) * 2 * Math.PI;
                const found = tryPoint(
                    Math.floor(centerX + Math.cos(angle) * radius),
                    Math.floor(centerY + Math.sin(angle) * radius)
                );
                if (found) return toPlayerPos(found);
                if (failed.length >= maxFailedCandidates) break search;
            }
        }

        // No roomy spot found: use the best (most centered) road spot seen
        if (bestFallback) return toPlayerPos(bestFallback);
    }

    // Fallback to random strict road position if search radius yields nothing
    const randomPos = typeof getRandomStrictRoadPosition === 'function'
        ? getRandomStrictRoadPosition()
        : { x: 300 + half, y: 300 + half };
    return toPlayerPos(randomPos);
}


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
        // Find nearby road relative to current position
        let roadPos = getNearbyRoadPosition(player.x, player.y);
        player.x = roadPos.x;
        player.y = roadPos.y;

        localStorage.setItem("gma_player_x", player.x.toFixed(2));
        localStorage.setItem("gma_player_y", player.y.toFixed(2));

        taxiManager.setMessage("Respawned successfully on nearby road!", 180);

       if (typeof showFullMap !== 'undefined') {
    showFullMap = false;
    fullMapAnimating = false;
    mapSettingsOpen = false;

    // Restore joystick touch input after respawning.
    if (typeof sbSetJoystickZoneInteractive === 'function') {
        sbSetJoystickZoneInteractive(true);
    }

    gameActive = true;
       } 
    } else {
        taxiManager.setMessage(status.reason, 240);
    }
});

function updateRespawnButtonUI() {
    if (
        typeof showFullMap !== 'undefined' &&
        (showFullMap || fullMapAnimating)
    ) {
        respawnBtn.style.display = 'block';

        const fadeProgress =
            typeof fullMapAnimationProgress !== 'undefined'
                ? Math.max(0, Math.min(1, fullMapAnimationProgress))
                : 1;

        respawnBtn.style.opacity = fadeProgress;
        respawnBtn.style.pointerEvents =
            fadeProgress > 0.95 ? 'auto' : 'none';

        const status = getRespawnStatus();

        if (status.active) {
            respawnBtn.style.backgroundColor = '#f1c40f';
            respawnBtn.style.color = '#000000';
        } else {
            respawnBtn.style.backgroundColor = '#7f8c8d';
            respawnBtn.style.color = '#ffffff';
        }
    } else {
        respawnBtn.style.display = 'none';
        respawnBtn.style.opacity = '0';
        respawnBtn.style.pointerEvents = 'none';
    }
}

setInterval(updateRespawnButtonUI, 100);
updateRespawnButtonUI();
function spawnPlayerOwnedCars() {
    if (typeof cars === "undefined") return;

    playerCars.forEach((savedCar, index) => {
        const alreadySpawned = cars.some(car =>
            car.ownerType === "playerOwned" &&
            car.playerCarId === savedCar.id
        );
        if (!alreadySpawned) {
            cars.push(createPlayerOwnedCar(savedCar, index));
        }
    });
}

window.addEventListener('load', () => {
    if (localStorage.getItem("gma_player_evicted") === "true") {
        player.isEvicted = true;
    }
    spawnPlayerOwnedCars();
});
// Dynamic positioning helper
function repositionSirenButton() {
    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) {
        // Work in logical stage coordinates (the siren button must live in the stage).
        if (sirenBtn.parentElement !== gameStage) gameStage.appendChild(sirenBtn);
        sirenBtn.style.right = (GAME_WIDTH - (exitBtn.offsetLeft + exitBtn.offsetWidth)) + 'px';
        sirenBtn.style.bottom = (GAME_HEIGHT - exitBtn.offsetTop + 10) + 'px'; // 10px spacing above exitBtn
    }
}