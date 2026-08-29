console.log("lldv")
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

  drawWorldMarkers(ctx) {}
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
        updateStolenCarsStorage();

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
            <button id="confirmRepairBtn" style="padding:8px 18px; background:#2ecc71; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔧</button>
            <button id="cancelRepairBtn" style="padding:8px 18px; background:#e74c3c; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">✖️</button>
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
            if (typeof playerCar !== 'undefined' && playerCar) {
                towModal.style.display = 'block';
            } else {
                taxiManager.setMessage("You must be inside a vehicle to use the Tow service!", 180);
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

if (enterHomeBtn) {
    enterHomeBtn.addEventListener('click', () => {
        if (player.isEvicted) {
            player.money -= 80;
            localStorage.setItem("gma_player_money", player.money);
            player.isEvicted = false;
            player.rentDebtActive = false;
            localStorage.setItem("gma_player_evicted", "false");

            let firstData = JSON.parse(localStorage.getItem("gma_player_owned_car") || "{}");
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
            if (c.isFirstCar) {
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

function getNearbyRoadPosition(startX, startY) {
    // Check if the current player position is already a road
    if (typeof isStrictRoadColor === 'function' && isStrictRoadColor(startX, startY)) {
        return { x: startX, y: startY };
    }

    const maxRadius = 1000;
    const step = 20;

    // Search outward in expanding concentric circles
    for (let radius = step; radius <= maxRadius; radius += step) {
        const samples = Math.floor(2 * Math.PI * radius / step);
        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * 2 * Math.PI;
            const checkX = Math.floor(startX + Math.cos(angle) * radius);
            const checkY = Math.floor(startY + Math.sin(angle) * radius);

            if (typeof isStrictRoadColor === 'function' && isStrictRoadColor(checkX, checkY)) {
                return { x: checkX, y: checkY };
            }
        }
    }

    // Fallback to random strict road position if search radius yields nothing
    return typeof getRandomStrictRoadPosition === 'function' 
        ? getRandomStrictRoadPosition() 
        : { x: 300, y: 300 };
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

// SPAWN PLAYER'S OWNED CARS ON GAME LOAD ONLY IF THEY ACTUALLY OWN ONE
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
});
// Dynamic positioning helper
function repositionSirenButton() {
    const exitBtn = document.getElementById('exitBtn');
    if (exitBtn) {
        const exitRect = exitBtn.getBoundingClientRect();
        sirenBtn.style.right = (window.innerWidth - exitRect.right) + 'px';
        sirenBtn.style.bottom = (window.innerHeight - exitRect.top + 10) + 'px'; // 10px spacing above exitBtn
    }
}

// --- DYNAMIC SIREN BUTTON CREATION & EVENT LISTENERS ---
let sirenBtn = document.getElementById('sirenBtn');

if (!sirenBtn) {
    sirenBtn = document.createElement('button');
    sirenBtn.id = 'sirenBtn';
    sirenBtn.innerText = '🚨 SIREN: OFF';
    sirenBtn.style.position = 'fixed';

    // Position directly on the right side of the screen
    sirenBtn.style.right = '30px';
    sirenBtn.style.bottom = '120px'; // Adjust bottom distance as needed to sit neatly near your controls

    sirenBtn.style.padding = '10px 16px';
    sirenBtn.style.fontSize = '12px';
    sirenBtn.style.fontWeight = 'bold';
    sirenBtn.style.backgroundColor = '#111';
    sirenBtn.style.color = '#fff';
    sirenBtn.style.border = '2px solid #e74c3c';
    sirenBtn.style.borderRadius = '6px';
    sirenBtn.style.zIndex = '1000';
    sirenBtn.style.display = 'none';

    // UI alignment setup
    sirenBtn.style.alignItems = 'center';
    sirenBtn.style.justifyContent = 'center';

    document.body.appendChild(sirenBtn);
}

// Siren Button Tap Handler: OFF -> WAIL -> YELP -> OFF
sirenBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!playerCar || !playerCar.isPolice) return;

    let nextState = (playerCar.sirenState + 1) % 3;
    playerCar.setSirenState(nextState);

    updateSirenButtonLabel();
});

function updateSirenButtonLabel() {
    // Hide button if not in a car or if the current car is NOT a police car
    if (!playerCar || !playerCar.isPolice) {
        sirenBtn.style.display = 'none';
        return;
    }

    // Show button when inside a police car
    sirenBtn.style.display = 'flex';

    if (playerCar.sirenState === 1) {
        sirenBtn.innerText = '🚨 SIREN: WAIL';
        sirenBtn.style.borderColor = '#e74c3c';
    } else if (playerCar.sirenState === 2) {
        sirenBtn.innerText = '🚨 SIREN: YELP';
        sirenBtn.style.borderColor = '#3498db';
    } else {
        sirenBtn.innerText = '🚨 SIREN: OFF';
        sirenBtn.style.borderColor = '#ffffff';
    }
}
let beingchased = false;
let isPlayerSurrendered = false;

// Create Surrender Button UI
const surrenderBtn = document.createElement('button');
surrenderBtn.id = 'surrenderBtn';
surrenderBtn.innerText = 'SURRENDER';
surrenderBtn.style.position = 'fixed';
surrenderBtn.style.bottom = '20px';
surrenderBtn.style.left = '50%';
surrenderBtn.style.transform = 'translateX(-50%)';
surrenderBtn.style.padding = '12px 24px';
surrenderBtn.style.backgroundColor = '#e74c3c';
surrenderBtn.style.color = '#ffffff';
surrenderBtn.style.fontFamily = 'Arial';
surrenderBtn.style.fontSize = '16px';
surrenderBtn.style.fontWeight = 'bold';
surrenderBtn.style.border = '2px solid #ffffff';
surrenderBtn.style.borderRadius = '8px';
surrenderBtn.style.cursor = 'pointer';
surrenderBtn.style.zIndex = '2000';
surrenderBtn.style.display = 'none';

(document.getElementById('gameContainer') || document.body).appendChild(surrenderBtn);

function executeArrestProcess() {
    if (player.isBeingArrested) return;

    player.isBeingArrested = true;
    player.isArrestPassenger = false;
player.arrestTransportCar = null;
    player.beingChased = false;

    // Stop player input immediately.
    player.speed = 0;

    // Hide all interaction controls immediately.
    if (typeof exitBtn !== 'undefined' && exitBtn) {
        exitBtn.style.display = 'none';
    }

    if (typeof jackBtn !== 'undefined' && jackBtn) {
        jackBtn.style.display = 'none';
    }

    if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
        surrenderBtn.style.display = 'none';
    }

    // If player was driving, force them out immediately.
    // The stolen/player car remains in the world until the
    // black-screen transition, so arrest cleanup is NOT immediate.
    if (playerCar) {
        if (playerCar.humAudio) {
            playerCar.humAudio.pause();
            playerCar.humAudio = null;
        }

        const arrestedCar = playerCar;
        arrestedCar.speed = 0;
        arrestedCar.isParked = true;
        arrestedCar.hasDriver = false;

        const sideAngle = arrestedCar.angle - Math.PI / 2;

        player.x =
            arrestedCar.x +
            Math.cos(sideAngle) * 35;

        player.y =
            arrestedCar.y +
            Math.sin(sideAngle) * 35;

        player.angle = arrestedCar.angle;

        playerCar = null;
    }

    // ------------------------------------------------------------
    // Capture police cars that were ACTUALLY chasing at the
    // instant of arrest. These become escort vehicles.
    // ------------------------------------------------------------
    arrestEscortCars = cars.filter(c =>
    c &&
    c.isPolice &&
    (c.policeState === "CHASE" || c.policeState === "WARNING") &&
    c !== playerCar &&
    !c.exploded &&
    c.health > 0
);
    arrestEscortCars.forEach((escort, index) => {
        escort.policeState = "ARREST_ESCORT";
        escort.isParked = false;
        escort.hasDriver = true;
        escort.arrestEscortIndex = index;
        escort.arrestEscortPath = null;
        escort.arrestEscortRepathTimer = 0;

        if (typeof escort.playSiren === 'function') {
            escort.playSiren(2);
        } else {
            escort.sirenState = 2;
        }
    });

    // The arresting police car is a NEW vehicle.
    arrestTransportCar = null;
    arrestTransportState = "SPAWNING";
    arrestTransportPath = null;
    arrestTransportRepathTimer = 0;
    arrestTransitionStarted = false;

    // Make absolutely sure wanted status remains active during
    // the arrest sequence.
    player.wanted = true;
    localStorage.setItem("gma_player_wanted", "true");

    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
        taxiManager.setMessage("Police are taking you in...", 180);
    }

    spawnArrestTransportCar();
}

// ============================================================
// ARREST TRANSPORT SYSTEM
// ============================================================

const ARREST_STATION_X = 3692;
const ARREST_STATION_Y = 421;

let arrestTransportCar = null;
let arrestEscortCars = [];
let arrestTransportState = "NONE";
let arrestTransportPath = null;
let arrestTransportRepathTimer = 0;
let arrestTransitionStarted = false;
let arrestFadeOverlay = null;


// ------------------------------------------------------------
// Create the black transition overlay once.
// ------------------------------------------------------------
function getArrestFadeOverlay() {
    if (arrestFadeOverlay) return arrestFadeOverlay;

    arrestFadeOverlay = document.createElement("div");
    arrestFadeOverlay.id = "arrestFadeOverlay";

    arrestFadeOverlay.style.position = "fixed";
    arrestFadeOverlay.style.left = "0";
    arrestFadeOverlay.style.top = "0";
    arrestFadeOverlay.style.width = "100vw";
    arrestFadeOverlay.style.height = "100vh";
    arrestFadeOverlay.style.background = "#000";
    arrestFadeOverlay.style.opacity = "0";
    arrestFadeOverlay.style.pointerEvents = "none";
    arrestFadeOverlay.style.zIndex = "99999";
    arrestFadeOverlay.style.transition = "opacity 0.45s ease";

    document.body.appendChild(arrestFadeOverlay);

    return arrestFadeOverlay;
}


// ------------------------------------------------------------
// Find a road position outside the current viewport.
// ------------------------------------------------------------

function getArrestSpawnPosition() {
    const SPAWN_DISTANCE = 500;

    const angles = [
        0,
        Math.PI * 0.25,
        Math.PI * 0.5,
        Math.PI * 0.75,
        Math.PI,
        Math.PI * 1.25,
        Math.PI * 1.5,
        Math.PI * 1.75
    ];

    // Try deterministic directions first.
    for (const angle of angles) {
        const x = player.x + Math.cos(angle) * SPAWN_DISTANCE;
        const y = player.y + Math.sin(angle) * SPAWN_DISTANCE;

        if (
            x > 30 &&
            y > 30 &&
            x < mapWidth - 30 &&
            y < mapHeight - 30 &&
            isAICarWalkable(x, y)
        ) {
            return { x, y };
        }
    }

    // Fallback: search around the same 500-unit distance.
    for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance =
            SPAWN_DISTANCE - 40 + Math.random() * 80;

        const x = player.x + Math.cos(angle) * distance;
        const y = player.y + Math.sin(angle) * distance;

        if (
            x > 30 &&
            y > 30 &&
            x < mapWidth - 30 &&
            y < mapHeight - 30 &&
            isAICarWalkable(x, y)
        ) {
            return { x, y };
        }
    }

    return getRandomStrictRoadPosition();
}        

// ------------------------------------------------------------
// Spawn the arrest transport police car.
// ------------------------------------------------------------
function spawnArrestTransportCar() {
    const spawn = getArrestSpawnPosition();

    const id =
        Date.now() +
        700000 +
        Math.floor(Math.random() * 10000);

    const policeCar =
        new Car(
            id,
            spawn.x,
            spawn.y,
            "#111111",
            true
        );

    policeCar.isPolice = true;
    policeCar.ownerType = "police";
    policeCar.type = "Commuter, Sedan";

    // Keep police-car characteristics.
    policeCar.width = 16;
    policeCar.length = 28;
    policeCar.baseSpeed = 2.3;
    policeCar.speed = policeCar.baseSpeed;

    policeCar.isParked = false;
    policeCar.hasDriver = true;
    policeCar.policeState = "ARREST_TRANSPORT";

    // Face roughly toward the player initially.
    policeCar.angle =
        Math.atan2(
            player.y - policeCar.y,
            player.x - policeCar.x
        ) + Math.PI / 2;

    policeCar.arrestTransportRepathTimer = 0;
    policeCar.arrestTransportPath = null;

    if (typeof policeCar.playSiren === 'function') {
        policeCar.playSiren(2);
    } else {
        policeCar.sirenState = 2;
    }

    cars.push(policeCar);

    arrestTransportCar = policeCar;
    arrestTransportState = "APPROACHING";
}



// ------------------------------------------------------------
function moveArrestPoliceCar(
    car,
    targetX,
    targetY,
    dt,
    speed
) {
    if (!car) return;

    // Initialize tracking properties if not present
    if (car.arrestTransportRepathTimer === undefined) car.arrestTransportRepathTimer = 0;
    if (car.arrestTransportPathIndex === undefined) car.arrestTransportPathIndex = 1;

    car.arrestTransportRepathTimer -= dt;

    // Check if path is physically blocked by another vehicle ahead
    const checkSensorDist = (car.sensorLength || 35) + 10;
    const forwardAngle = car.angle - Math.PI / 2;
    const frontCheckX = car.x + Math.cos(forwardAngle) * checkSensorDist;
    const frontCheckY = car.y + Math.sin(forwardAngle) * checkSensorDist;

    let pathBlockedByCar = false;
    if (typeof cars !== 'undefined') {
        for (let i = 0; i < cars.length; i++) {
            const otherCar = cars[i];
            if (otherCar !== car && otherCar !== playerCar && !otherCar.exploded) {
                if (Math.hypot(otherCar.x - frontCheckX, otherCar.y - frontCheckY) < 25) {
                    pathBlockedByCar = true;
                    break;
                }
            }
        }
    }

    // Repath ONLY if path is missing or blocked by a car (and repath cooldown expired)
    if (!car.arrestTransportPath || (pathBlockedByCar && car.arrestTransportRepathTimer <= 0)) {
        const newPath = navigationSystem.findPath(
            car.x,
            car.y,
            targetX,
            targetY
        );

        if (newPath && newPath.length > 1) {
            car.arrestTransportPath = newPath;

            let closestIndex = 1;
            let closestDistance = Infinity;

            for (let i = 1; i < newPath.length; i++) {
                const waypoint = newPath[i];
                if (!waypoint) continue;

                const distance = Math.hypot(
                    waypoint.x - car.x,
                    waypoint.y - car.y
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = i;
                }
            }

            car.arrestTransportPathIndex = closestIndex;
        }

        car.arrestTransportRepathTimer = 0.33;
    }

    const path = car.arrestTransportPath;
    let moveAngle = Math.atan2(
        targetY - car.y,
        targetX - car.x
    );

    if (path && path.length > 1 && car.arrestTransportPathIndex < path.length) {
        let waypoint = path[car.arrestTransportPathIndex];

        if (waypoint) {
            const waypointDistance = Math.hypot(
                waypoint.x - car.x,
                waypoint.y - car.y
            );

            if (waypointDistance < 18) {
                car.arrestTransportPathIndex++;
                waypoint = path[car.arrestTransportPathIndex];
            }

            if (waypoint) {
                moveAngle = Math.atan2(
                    waypoint.y - car.y,
                    waypoint.x - car.x
                );
            }
        }
    }

    // Dynamic Police Unit Separation (prevent stacking/spinning)
    let avoidX = 0;
    let avoidY = 0;
    const avoidanceRadius = 55;

    if (typeof cars !== 'undefined') {
        cars.forEach(otherCar => {
            if (otherCar !== car && otherCar !== playerCar && otherCar.isPolice) {
                const dx = otherCar.x - car.x;
                const dy = otherCar.y - car.y;
                const d = Math.hypot(dx, dy);

                if (d < avoidanceRadius && d > 0.01) {
                    const strength = (avoidanceRadius - d) / avoidanceRadius;
                    avoidX -= (dx / d) * strength;
                    avoidY -= (dy / d) * strength;
                }
            }
        });
    }

    if (avoidX !== 0 || avoidY !== 0) {
        const avoidAngle = Math.atan2(avoidY, avoidX);
        const separationStrength = Math.min(0.35, Math.hypot(avoidX, avoidY) * 0.35);

        const chaseX = Math.cos(moveAngle);
        const chaseY = Math.sin(moveAngle);
        const avoidDirX = Math.cos(avoidAngle);
        const avoidDirY = Math.sin(avoidAngle);

        const finalX = chaseX * (1 - separationStrength) + avoidDirX * separationStrength;
        const finalY = chaseY * (1 - separationStrength) + avoidDirY * separationStrength;

        if (Math.hypot(finalX, finalY) > 0.001) {
            moveAngle = Math.atan2(finalY, finalX);
        }
    }

    car.angle = moveAngle + Math.PI / 2;
    car.speed = speed;

    const nextX = car.x + Math.cos(moveAngle) * speed * dt;
    const nextY = car.y + Math.sin(moveAngle) * speed * dt;

    // Movement check matching chasing police (primarily road, secondary grass)
    if (isGrassOrRoad(nextX, nextY)) {
        car.x = nextX;
        car.y = nextY;
    } else {
        const xWalkable = isGrassOrRoad(nextX, car.y);
        const yWalkable = isGrassOrRoad(car.x, nextY);

        if (xWalkable && yWalkable) {
            const xDist = Math.hypot(targetX - nextX, targetY - car.y);
            const yDist = Math.hypot(targetX - car.x, targetY - nextY);
            if (xDist <= yDist) car.x = nextX;
            else car.y = nextY;
        } else if (xWalkable) {
            car.x = nextX;
        } else if (yWalkable) {
            car.y = nextY;
        } else {
            car.speed = 0;
        }
    }
}  

function startArrestTransition() {
    if (arrestTransitionStarted) return;

    arrestTransitionStarted = true;
    arrestTransportState = "TRANSITION";

    const overlay = getArrestFadeOverlay();

    overlay.style.opacity = "1";

    // Give the fade time to reach black.
    setTimeout(() => {
        // DESPAWN TRANSPORT CAR.
        // ------------------------------------------------------
        if (arrestTransportCar) {
            if (typeof arrestTransportCar.stopSiren === 'function') {
                arrestTransportCar.stopSiren();
            }

            if (arrestTransportCar.humAudio) {
                arrestTransportCar.humAudio.pause();
                arrestTransportCar.humAudio = null;
            }

            const index =
                cars.indexOf(arrestTransportCar);

            if (index > -1) {
                cars.splice(index, 1);
            }
        }

        arrestTransportCar = null;

        // ------------------------------------------------------
        // DESPAWN ESCORT POLICE CARS.
        // ------------------------------------------------------
        arrestEscortCars.forEach(escort => {
            if (!escort) return;

            if (typeof escort.stopSiren === 'function') {
                escort.stopSiren();
            }

            if (escort.humAudio) {
                escort.humAudio.pause();
                escort.humAudio = null;
            }

            const index = cars.indexOf(escort);

            if (index > -1) {
                cars.splice(index, 1);
            }
        });

        arrestEscortCars = [];

        // ------------------------------------------------------
        // REMOVE ALL STOLEN CARS ONLY NOW.
        // ------------------------------------------------------
        cars = cars.filter(car => {
            if (!car || !car.isStolen) {
                return true;
            }

            if (typeof car.stopSiren === 'function') {
                car.stopSiren();
            }

            if (car.humAudio) {
                car.humAudio.pause();
                car.humAudio = null;
            }

            return false;
        });

        // ------------------------------------------------------
        // NOW clear wanted/stolen records.
        // ------------------------------------------------------
        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car");

        player.wanted = false;
        player.beingChased = false;

        localStorage.setItem(
            "gma_player_wanted",
            "false"
        );

        // Place player at the police station.
        player.x = ARREST_STATION_X;
        player.y = ARREST_STATION_Y;
        player.speed = 0;

        // ------------------------------------------------------
        // Hold black screen for 2 seconds.
        // ------------------------------------------------------
        setTimeout(() => {

            overlay.style.opacity = "0";

            setTimeout(() => {
                player.isBeingArrested = false;
                arrestTransportState = "NONE";
                arrestTransitionStarted = false;
                arrestTransportPath = null;
                arrestTransportRepathTimer = 0;

                if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
                    surrenderBtn.style.display = 'none';
                }

                if (typeof exitBtn !== 'undefined' && exitBtn) {
                    exitBtn.style.display = 'none';
                }

                if (typeof jackBtn !== 'undefined' && jackBtn) {
                    jackBtn.style.display = 'none';
                }

                if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    taxiManager.setMessage(
                        "You were arrested. Stolen vehicles impounded.",
                        240
                    );
                }
            }, 450);

        }, 2000);

    }, 450);
}


// ------------------------------------------------------------
// Update arrest transport + escorts.
// ------------------------------------------------------------
function updateArrestTransport(dt) {
    if (!window.arrestTransportDebugTimer) {
    window.arrestTransportDebugTimer = 0;
}

window.arrestTransportDebugTimer -= dt;

if (window.arrestTransportDebugTimer <= 0) {
    window.arrestTransportDebugTimer = 0.5;

    if (arrestTransportCar) {
        const transportDistance = Math.hypot(
            arrestTransportCar.x - player.x,
            arrestTransportCar.y - player.y
        );

        console.log(
            `[ARREST TRANSPORT] EXISTS | Distance: ${transportDistance.toFixed(1)} | ` +
            `Position: (${arrestTransportCar.x.toFixed(0)}, ${arrestTransportCar.y.toFixed(0)})`
        );
    } else {
        console.log("[ARREST TRANSPORT] NOT EXISTING");
    }
}
    if (!player.isBeingArrested) return false;

// Keep player absolutely immobile.
player.speed = 0;

if (!player.isArrestPassenger) {
    cars.forEach(c => {
        if (
            c &&
            c.isPolice &&
            c.policeState === "CHASE"
        ) {
            c.speed = 0;
        }
    });
}

    if (typeof exitBtn !== 'undefined' && exitBtn) {
        exitBtn.style.display = 'none';
    }

    if (typeof jackBtn !== 'undefined' && jackBtn) {
        jackBtn.style.display = 'none';
    }

    if (typeof surrenderBtn !== 'undefined' && surrenderBtn) {
        surrenderBtn.style.display = 'none';
    }

    // ----------------------------------------------------------
    // Transport car approaching player.
    // ----------------------------------------------------------
    if (
        arrestTransportState === "APPROACHING" &&
        arrestTransportCar
    ) {
        const distance =
            Math.hypot(
                player.x - arrestTransportCar.x,
                player.y - arrestTransportCar.y
            );

        if (distance <= 42) {

     arrestTransportState = "CARRYING";

player.isArrestPassenger = true;
player.arrestTransportCar = arrestTransportCar;

arrestTransportCar.speed = 0;
arrestTransportCar.hasArrestPassenger = true;       

            arrestTransportCar.arrestTransportPath = null;
            arrestTransportCar.arrestTransportRepathTimer = 0;

        } else {
            moveArrestPoliceCar(
                arrestTransportCar,
                player.x,
                player.y,
                dt,
                arrestTransportCar.baseSpeed || 2.3
            );
        }
    }

    // ----------------------------------------------------------
    // Transport car carrying player to station.
    // ----------------------------------------------------------
    if (
        arrestTransportState === "CARRYING" &&
        arrestTransportCar
    ) {
        player.x = arrestTransportCar.x;
        player.y = arrestTransportCar.y;
        player.angle = arrestTransportCar.angle;
        player.speed = 0;

        const stationDistance =
            Math.hypot(
                ARREST_STATION_X - arrestTransportCar.x,
                ARREST_STATION_Y - arrestTransportCar.y
            );

        if (stationDistance <= 55) {

            arrestTransportCar.x =
                ARREST_STATION_X;

            arrestTransportCar.y =
                ARREST_STATION_Y;

            arrestTransportCar.speed = 0;

            player.x = ARREST_STATION_X;
            player.y = ARREST_STATION_Y;

            startArrestTransition();

        } else {
            moveArrestPoliceCar(
                arrestTransportCar,
                ARREST_STATION_X,
                ARREST_STATION_Y,
                dt,
                arrestTransportCar.baseSpeed || 2.3
            );

            // Keep player attached after movement.
            player.x = arrestTransportCar.x;
            player.y = arrestTransportCar.y;
            player.angle = arrestTransportCar.angle;
        }
    }

    // ----------------------------------------------------------
    // Escort police cars follow the transport vehicle.
    // ----------------------------------------------------------
    if (
        arrestTransportCar &&
        arrestTransportState !== "TRANSITION"
    ) {
        arrestEscortCars.forEach((escort, index) => {

            if (!escort) return;
            if (!cars.includes(escort)) return;

            const forwardAngle =
                arrestTransportCar.angle -
                Math.PI / 2;

            // Keep escorts behind / beside the transport rather
            // than sending every car to exactly the same point.
            const side =
                index % 2 === 0 ? -1 : 1;

            const row =
                Math.floor(index / 2);

            const targetX =
                arrestTransportCar.x -
                Math.cos(forwardAngle) *
                (65 + row * 45) +
                Math.cos(forwardAngle + Math.PI / 2) *
                side *
                45;

            const targetY =
                arrestTransportCar.y -
                Math.sin(forwardAngle) *
                (65 + row * 45) +
                Math.sin(forwardAngle + Math.PI / 2) *
                side *
                45;

            moveArrestPoliceCar(
                escort,
                targetX,
                targetY,
                dt,
                escort.baseSpeed || 2.3
            );

            if (typeof escort.playSiren === 'function') {
                escort.playSiren(2);
            } else {
                escort.sirenState = 2;
            }
        });
    }

    return true;
}    
surrenderBtn.addEventListener('click', () => {
    if (player.isBeingArrested) return;

    isPlayerSurrendered = true;
    executeArrestProcess();
});
function isPlayerNearPoliceUnit(maxDistance = 120) {
    if (!player) return false;

    let nearby = false;

    cars.forEach(c => {
        if (
            c.isPolice &&
            c !== playerCar &&
            c.policeState === "CHASE"
        ) {
            if (Math.hypot(player.x - c.x, player.y - c.y) <= maxDistance) {
                nearby = true;
            }
        }
    });

    npcs.forEach(n => {
        if (
            n.isPolice &&
            n.policeState === "CHASE"
        ) {
            if (Math.hypot(player.x - n.x, player.y - n.y) <= maxDistance) {
                nearby = true;
            }
        }
    });

    return nearby;
}
                               // --- STAGE 4A: POLICE RECOGNITION, WARNING & ARREST SYSTEM ---
// POLICE OFFICER VEHICLE INTERCEPTION BULLETS
// ============================================================

const policeBullets = [];

const POLICE_BULLET_SPEED = 7.5;
const POLICE_BULLET_LIFETIME = 55;
const POLICE_BULLET_RADIUS = 3;
const POLICE_OFFICER_FIRE_COOLDOWN = 28;
const POLICE_OFFICER_SHOOT_RANGE = 300;
const POLICE_OFFICER_MIN_CAR_SPEED = 0.35;

function fireOfficerBullet(officer, targetCar) {
    if (!officer || !targetCar) return;

    const dx = targetCar.x - officer.x;
    const dy = targetCar.y - officer.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 0 || distance > POLICE_OFFICER_SHOOT_RANGE) return;

    const angle = Math.atan2(dy, dx);

    policeBullets.push({
        x: officer.x,
        y: officer.y,
        vx: Math.cos(angle) * POLICE_BULLET_SPEED,
        vy: Math.sin(angle) * POLICE_BULLET_SPEED,
        life: POLICE_BULLET_LIFETIME,
        owner: officer,
        targetCar: targetCar
    });
}

function updatePoliceBullets(dt) {
    for (let i = policeBullets.length - 1; i >= 0; i--) {
        const bullet = policeBullets[i];

        if (!bullet || !bullet.targetCar) {
            policeBullets.splice(i, 1);
            continue;
        }

        const car = bullet.targetCar;

        if (
            car.exploded ||
            car.health <= 0 ||
            playerCar !== car
        ) {
            policeBullets.splice(i, 1);
            continue;
        }

        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;

        // Bullet reached the player's car.
        const hitDistance = Math.hypot(
            bullet.x - car.x,
            bullet.y - car.y
        );

        const hitRadius = Math.max(
            16,
            (car.width || 18) * 0.75,
            (car.length || 28) * 0.22
        );

        if (hitDistance <= hitRadius) {
    // Only puncture and notify once.
    if (!car.tirePunctured) {
        car.tirePunctured = true;
        taxiManager.setMessage("Car's tyre is punctured!", 240);

        // Immediately reduce current speed so the effect is noticeable.
        if (Math.abs(car.speed) > car.baseSpeed * 1.15) {
            car.speed = Math.sign(car.speed) * car.baseSpeed * 1.15;
        }
    }

    policeBullets.splice(i, 1);
    continue;
        }

        if (bullet.life <= 0) {
            policeBullets.splice(i, 1);
        }
    }
}

function drawPoliceBullets(ctx) {
    if (!policeBullets.length) return;

    ctx.save();

    policeBullets.forEach(bullet => {
        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(
            bullet.x,
            bullet.y,
            POLICE_BULLET_RADIUS,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });

    ctx.restore();
}                                                                     // --- HELPER: EXECUTE EXISTING CHASE & NAVIGATION BEHAVIOR FOR A SINGLE UNIT ---
function updateSinglePoliceChase(unit, dt, player, cars, npcs) {
    const isCar = unit.length !== undefined;
        // --- Police-car A* repath timer ---
    if (isCar) {
        if (unit.repathTimer === undefined) {
            unit.repathTimer = 0;
        }

        // --- Police chase stop/start timers ---
        if (unit.policeChaseTimerState === undefined) {
            unit.policeChaseTimerState = "CHASING";
            unit.policeStopTimer = 0;
            unit.policeStartTimer = 0;
            unit.policeCoastAngle = unit.angle - Math.PI / 2;
            unit.policeCoastSpeed = unit.baseSpeed || 2.3;
        }
    }
    // Destroyed police cars must never continue the chase.
    if (isCar && (unit.health <= 0 || unit.exploded)) {
        unit.speed = 0;

        if (typeof unit.stopSiren === 'function') {
            unit.stopSiren();
        } else {
            unit.sirenState = 0;
        }
        unit.policeState = "PATROL";
        unit.isParked = true;
        return;
    }

    // Siren and unpark state for police cars
    if (isCar) {
        unit.isParked = false;
        if (typeof unit.playSiren === 'function') {
            unit.playSiren(2);
        } else {
            unit.sirenState = 2;
        }
    }

    // ON-FOOT OFFICER VS MOVING PLAYER CAR (Interceptor shooting logic)
    if (!isCar && playerCar) {
        const playerCarSpeed = Math.abs(playerCar.speed);
        if (playerCarSpeed > POLICE_OFFICER_MIN_CAR_SPEED) {
            unit.speed = 0;
            const dx = playerCar.x - unit.x;
            const dy = playerCar.y - unit.y;
            const carDistance = Math.hypot(dx, dy);

            if (carDistance > 0) {
                unit.angle = Math.atan2(dy, dx) + Math.PI / 2;
            }

            if (unit.policeFireCooldown === undefined) unit.policeFireCooldown = 0;
            unit.policeFireCooldown -= dt;

            if (carDistance <= POLICE_OFFICER_SHOOT_RANGE && unit.policeFireCooldown <= 0) {
                fireOfficerBullet(unit, playerCar);
                unit.policeFireCooldown = POLICE_OFFICER_FIRE_COOLDOWN;
            }
            return;
        }
    }
    // --- POLICE CAR STOP/START CHASE TIMERS ---
    // Police cars only. Officer NPC chase behavior is untouched.
    if (isCar) {
    const playerIsMoving = Math.abs(player.speed || 0) > 0.05;
        if (!playerIsMoving) {

            // Player just stopped during a normal chase.
            // Start the 1.4 second forward-coast period.
            if (unit.policeChaseTimerState === "CHASING") {
                unit.policeChaseTimerState = "STOPPING";
                unit.policeStopTimer = 1.4 * 60;

                // Lock the direction the police car was already facing.
                unit.policeCoastAngle = unit.angle - Math.PI / 2;

                // Keep its current chase speed for the coast.
                unit.policeCoastSpeed =
                    Math.abs(unit.speed) > 0.05
                        ? Math.abs(unit.speed)
                        : (unit.baseSpeed || 2.3);
            }

            // Player stopped while the 0.8 sec start timer was running.
            // IMPORTANT: pause the timer; do NOT reset it.
            if (unit.policeChaseTimerState === "STARTING") {
                unit.policeChaseTimerState = "STARTING_PAUSED";
                unit.speed = 0;
                return;
            }

            // Timer already paused. Remain stopped.
            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.speed = 0;
                return;
            }

            // -----------------------------------------------------
            // 1.4 SECOND FORWARD COAST
            // -----------------------------------------------------
            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer -= dt;

                const coastSpeed = unit.policeCoastSpeed;
                const coastAngle = unit.policeCoastAngle;

                unit.speed = coastSpeed;
                unit.angle = coastAngle + Math.PI / 2;

                const nextX =
                    unit.x +
                    Math.cos(coastAngle) *
                    coastSpeed *
                    dt;

                const nextY =
                    unit.y +
                    Math.sin(coastAngle) *
                    coastSpeed *
                    dt;

                if (isGrassOrRoad(nextX, nextY)) {
                    unit.x = nextX;
                    unit.y = nextY;
                } else {
                    const xWalkable =
                        isGrassOrRoad(nextX, unit.y);

                    const yWalkable =
                        isGrassOrRoad(unit.x, nextY);

                    if (xWalkable && yWalkable) {
                        unit.x = nextX;
                        unit.y = nextY;
                    } else if (xWalkable) {
                        unit.x = nextX;
                    } else if (yWalkable) {
                        unit.y = nextY;
                    }
                }

                if (unit.policeStopTimer <= 0) {
                    unit.policeStopTimer = 0;
                    unit.speed = 0;
                    unit.policeChaseTimerState = "STOPPED";
                }

                return;
            }

            // Police has completed the 1.4 sec coast.
            // Stay exactly where it stopped.
            if (unit.policeChaseTimerState === "STOPPED") {
                unit.speed = 0;
                return;
            }
        }

        // ---------------------------------------------------------
        // PLAYER HAS STARTED MOVING
        // ---------------------------------------------------------
        else {

            // Player started moving while police was still in the
            // 1.4 sec coast. Cancel the coast and begin the 0.8 sec
            // stationary delay.
            if (unit.policeChaseTimerState === "STOPPING") {
                unit.policeStopTimer = 0;
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }

            // Player starts moving after police has completely stopped.
            if (unit.policeChaseTimerState === "STOPPED") {
                unit.policeStartTimer = 0.5 * 60;
                unit.policeChaseTimerState = "STARTING";
                unit.speed = 0;
                return;
            }
           // Resume a previously paused 0.8 sec timer.
            if (unit.policeChaseTimerState === "STARTING_PAUSED") {
                unit.policeChaseTimerState = "STARTING";
            }
            // -------------------------------------------            // 0.8 SECOND START DELAY           // -----------------------------------------------------
            if (unit.policeChaseTimerState === "STARTING") {
                unit.speed = 0;

                unit.policeStartTimer -= dt;

                if (unit.policeStartTimer > 0) {
                    return;
                }

                unit.policeStartTimer = 0;
                unit.policeChaseTimerState = "CHASING";
            }
        }
    }

    // --- A* CHASE LOGIC & NAVIGATION MOVEMENT ---
    const distToPlayer = Math.hypot(player.x - unit.x, player.y - unit.y);

    if (distToPlayer > 30) {
    // --- A* repath timer for ALL police units ---
    if (unit.repathTimer === undefined) {
        unit.repathTimer = 0;
    }

    unit.repathTimer -= dt;

    if (!unit.policePath || unit.repathTimer <= 0) {
        unit.policePath = navigationSystem.findPath(
            unit.x, unit.y,
            player.x, player.y
        );

        unit.repathTimer = 0.33; // recalculate roughly 3 times/sec
    }

    const path = unit.policePath;
        let moveAngle = unit.angle;

        if (path && path.length > 1) {
            const nextWaypoint = path[1];
            moveAngle = Math.atan2(nextWaypoint.y - unit.y, nextWaypoint.x - unit.x);
        } else {
            moveAngle = Math.atan2(player.y - unit.y, player.x - unit.x);
        }

                // Dynamic Police Unit Separation
        // Prevent multiple police units from occupying the exact same
        // chase position and getting stuck spinning against each other.
        let avoidX = 0;
        let avoidY = 0;
        const avoidanceRadius = isCar ? 55 : 35;

        cars.forEach(otherCar => {
            if (otherCar !== unit && otherCar !== playerCar && otherCar.isPolice) {
                const dx = otherCar.x - unit.x;
                const dy = otherCar.y - unit.y;
                const d = Math.hypot(dx, dy);

                if (d < avoidanceRadius && d > 0.01) {
                    const strength = (avoidanceRadius - d) / avoidanceRadius;
                    avoidX -= (dx / d) * strength;
                    avoidY -= (dy / d) * strength;
                }
            }
        });

        npcs.forEach(npc => {
            if (npc !== unit && npc.isPolice) {
                const dx = npc.x - unit.x;
                const dy = npc.y - unit.y;
                const d = Math.hypot(dx, dy);

                if (d < avoidanceRadius && d > 0.01) {
                    const strength = (avoidanceRadius - d) / avoidanceRadius;
                    avoidX -= (dx / d) * strength;
                    avoidY -= (dy / d) * strength;
                }
            }
        });

        // Only apply separation when police units are actually close.
        // Keep the player's chase direction dominant so police don't
        // randomly veer away during a normal chase.
        if (avoidX !== 0 || avoidY !== 0) {
            const avoidAngle = Math.atan2(avoidY, avoidX);

            const separationStrength =
                Math.min(0.35, Math.hypot(avoidX, avoidY) * 0.35);

            // Blend using vectors instead of directly averaging angles.
            const chaseX = Math.cos(moveAngle);
            const chaseY = Math.sin(moveAngle);
            const avoidDirX = Math.cos(avoidAngle);
            const avoidDirY = Math.sin(avoidAngle);

            const finalX =
                chaseX * (1 - separationStrength) +
                avoidDirX * separationStrength;

            const finalY =
                chaseY * (1 - separationStrength) +
                avoidDirY * separationStrength;

            if (Math.hypot(finalX, finalY) > 0.001) {
                moveAngle = Math.atan2(finalY, finalX);
            }
        }

        unit.angle = moveAngle + Math.PI / 2;

        // Position Updates & Collision Handling
        if (isCar) {
            const policeChaseSpeed = unit.baseSpeed || 2.3;
            unit.speed = policeChaseSpeed;
            const nextX = unit.x + Math.cos(moveAngle) * policeChaseSpeed * dt;
            const nextY = unit.y + Math.sin(moveAngle) * policeChaseSpeed * dt;

            if (isGrassOrRoad(nextX, nextY)) {
                unit.x = nextX;
                unit.y = nextY;
            } else {
                const xWalkable = isGrassOrRoad(nextX, unit.y);
                const yWalkable = isGrassOrRoad(unit.x, nextY);
                if (xWalkable && yWalkable) {
                    const xDist = Math.hypot(player.x - nextX, player.y - unit.y);
                    const yDist = Math.hypot(player.x - unit.x, player.y - nextY);
                    if (xDist <= yDist) unit.x = nextX;
                    else unit.y = nextY;
                } else if (xWalkable) unit.x = nextX;
                else if (yWalkable) unit.y = nextY;
            }
        } else {
            const chaseSpeed = 1.6;
            const oldX = unit.x;
            const oldY = unit.y;
            const nextX = unit.x + Math.cos(moveAngle) * chaseSpeed * dt;
            const nextY = unit.y + Math.sin(moveAngle) * chaseSpeed * dt;

            if (isGrassOrRoad(nextX, nextY)) {
                unit.x = nextX;
                unit.y = nextY;
            } else {
                const xWalkable = isGrassOrRoad(nextX, unit.y);
                const yWalkable = isGrassOrRoad(unit.x, nextY);
                if (xWalkable && yWalkable) {
                    const xDist = Math.hypot(player.x - nextX, player.y - unit.y);
                    const yDist = Math.hypot(player.x - unit.x, player.y - nextY);
                    if (xDist <= yDist) unit.x = nextX;
                    else unit.y = nextY;
                } else if (xWalkable) unit.x = nextX;
                else if (yWalkable) unit.y = nextY;
            }

            const movedDistance = Math.hypot(unit.x - oldX, unit.y - oldY);
            if (movedDistance > 0.001) {
                unit.walkTimer = (unit.walkTimer || 0) + chaseSpeed * dt * 0.12;
                unit.speed = chaseSpeed;
            } else {
                unit.speed = 0;
            }
        }
    } else {
        unit.speed = 0;
    }
}

// --- STAGE 4A: REVISED POLICE RECOGNITION, WARNING, ARREST & CHASE SYSTEM ---
function updatePoliceStage4A(dt, player, cars, npcs) {
    if (!player) return;
    if (player.beingChased === undefined) player.beingChased = false;

    if (player.isBeingArrested) {
        updateArrestTransport(dt);
        return;
    }

    const surrenderBtn = document.getElementById('surrenderBtn');

    // --- POLICE CHASE ESCAPE ---
    // Only actively chasing police units count.
    // Patrol units do NOT prevent the player from escaping the chase.
    if (player.beingChased) {
        const POLICE_ESCAPE_DISTANCE = 450;

        const nearbyChasingCar = cars.some(c =>
    c &&
    c.isPolice &&
    c !== playerCar &&
    !c.exploded &&
    c.health > 0 &&
    c.policeState === "CHASE" &&
    Math.hypot(player.x - c.x, player.y - c.y) <= POLICE_ESCAPE_DISTANCE
);

        const nearbyChasingOfficer = npcs.some(n =>
            n &&
            n.isPolice &&
            n.policeState === "CHASE" &&
            Math.hypot(player.x - n.x, player.y - n.y) <= POLICE_ESCAPE_DISTANCE
        );

        if (!nearbyChasingCar && !nearbyChasingOfficer) {
    player.beingChased = false;
    player.wanted = true;

    // Player has escaped the active chase, but remains wanted.
    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
        taxiManager.setMessage("You escaped! they are searching for you", 240);
    }

    // Keep player.wanted = true.
            // Being out of the chase does NOT mean the player is no longer wanted.

            cars.forEach(c => {
                if (c && c.isPolice && c.policeState === "CHASE") {
                    if (typeof c.stopSiren === 'function') {
                        c.stopSiren();
                    } else {
                        c.sirenState = 0;
                    }

                    c.policeState = "PATROL";
                    c.isParked = false;
                    c.warningTimer = 0;
                    c.graceTimer = 0;
                    c.arrestStage = 0;
                    c.arrestTimer = 0;
                }
            });

            npcs.forEach(n => {
                if (n && n.isPolice && n.policeState === "CHASE") {
                    n.policeState = "PATROL";
                    n.speed = 0.3 + Math.random() * 0.4;
                }
            });

            if (surrenderBtn) {
                surrenderBtn.style.display = 'none';
            }

            return;
        }
    }

    // 1. CLEAR ALL POLICE UNITS WHEN NOT WANTED
    if (!player.wanted && !player.beingChased) {
        cars.forEach(c => {
            if (c.isPolice && c.policeState && c.policeState !== "PATROL") {
                if (typeof c.stopSiren === 'function') c.stopSiren();
                else c.sirenState = 0;
                c.isParked = false;
                c.policeState = "PATROL";
                c.warningTimer = 0;
                c.graceTimer = 0;
                c.arrestStage = 0;
                c.arrestTimer = 0;
                c.saidStepOut = false;
                c.saidArrested = false;
            }
        });

        npcs.forEach(n => {
            if (n.isPolice && n.policeState && n.policeState !== "PATROL") {
                n.speed = 0.3 + Math.random() * 0.4;
                n.policeState = "PATROL";
                n.saidStepOut = false;
                n.saidArrested = false;
            }
        });

        player.beingChased = false;
        isPlayerSurrendered = false;

        if (surrenderBtn) surrenderBtn.style.display = 'none';
        return;
    }
    // 1. CLEAR ALL POLICE UNITS WHEN NOT WANTED
if (!player.wanted && !player.beingChased) {
        cars.forEach(c => {
            if (c.isPolice && c.policeState && c.policeState !== "PATROL") {
                if (typeof c.stopSiren === 'function') c.stopSiren();
                else c.sirenState = 0;
                c.isParked = false;
                c.policeState = "PATROL";
                c.warningTimer = 0;
                c.graceTimer = 0;
                c.arrestStage = 0;
                c.arrestTimer = 0;
                c.saidStepOut = false;
                c.saidArrested = false;
            }
        });
        npcs.forEach(n => {
            if (n.isPolice && n.policeState && n.policeState !== "PATROL") {
                n.speed = 0.3 + Math.random() * 0.4;
                n.policeState = "PATROL";
                n.saidStepOut = false;
                n.saidArrested = false;
            }
        });
        player.beingChased = false;
        isPlayerSurrendered = false;
        if (surrenderBtn) surrenderBtn.style.display = 'none';
        return;
    }

    // Find any police unit currently in WARNING or ARRESTING mode
    let warningOrArrestingUnit = cars.find(c => c.isPolice && c !== playerCar && c.hasDriver && (c.policeState === "WARNING" || c.policeState === "ARRESTING")) ||
                                 npcs.find(n => n.isPolice && (n.policeState === "WARNING" || n.policeState === "ARRESTING"));

    // 2. DETECT WANTED PLAYER (Spotting unit)
    if (player.wanted && !player.beingChased && !warningOrArrestingUnit) {
        let closestUnit = null;
        let minDistance = 110;

        cars.forEach(c => {
            if (c.isPolice && c !== playerCar && c.hasDriver && !c.isStolen && (!c.policeState || c.policeState === "PATROL")) {
                let dist = Math.hypot(player.x - c.x, player.y - c.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestUnit = c;
                }
            }
        });

        npcs.forEach(npc => {
            if (npc.isPolice && (!npc.policeState || npc.policeState === "PATROL")) {
                let dist = Math.hypot(player.x - npc.x, player.y - npc.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestUnit = npc;
                }
            }
        });

        if (closestUnit) {
            warningOrArrestingUnit = closestUnit;
            warningOrArrestingUnit.policeState = "WARNING";
            warningOrArrestingUnit.warningTimer = 480;
            warningOrArrestingUnit.saidStepOut = false;
            warningOrArrestingUnit.saidArrested = false;

            if (warningOrArrestingUnit.length !== undefined) {
                warningOrArrestingUnit.speed = 0;
                warningOrArrestingUnit.isParked = true;
                if (typeof warningOrArrestingUnit.playSiren === 'function') warningOrArrestingUnit.playSiren(1);
                else warningOrArrestingUnit.sirenState = 1;
            } else {
                warningOrArrestingUnit.speed = 0;
            }

            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                taxiManager.setMessage("Police wants to stop you!", 180);
            }
        }
    }

    // 3. WARNING & ARREST SEQUENCE
    if (warningOrArrestingUnit) {
        const isCar = warningOrArrestingUnit.length !== undefined;
        let officerNPC = !isCar ? warningOrArrestingUnit : (
            warningOrArrestingUnit.associatedOfficer ||
            npcs.find(n => n.isPolice && Math.hypot(n.x - warningOrArrestingUnit.x, n.y - warningOrArrestingUnit.y) < 200)
        );

        if (warningOrArrestingUnit.policeState === "WARNING") {
            if (surrenderBtn) surrenderBtn.style.display = 'block';
            warningOrArrestingUnit.warningTimer -= dt;
            warningOrArrestingUnit.speed = 0;

            if (!warningOrArrestingUnit.graceTimer) warningOrArrestingUnit.graceTimer = 60;
            if (warningOrArrestingUnit.graceTimer > 0) warningOrArrestingUnit.graceTimer -= dt;

            if (officerNPC && typeof officerNPC.say === 'function') {
                if (playerCar) {
                    if (!warningOrArrestingUnit.saidStepOut) {
                        officerNPC.say("Step out!", 140);
                        warningOrArrestingUnit.saidStepOut = true;
                    } else if (warningOrArrestingUnit.warningTimer <= 340 && !warningOrArrestingUnit.saidArrested) {
                        officerNPC.say("You are arrested!", 180);
                        warningOrArrestingUnit.saidArrested = true;
                    }
                } else if (!warningOrArrestingUnit.saidArrested) {
                    officerNPC.say("You are arrested!", 180);
                    warningOrArrestingUnit.saidArrested = true;
                }
            }

            if (isPlayerSurrendered) {
                isPlayerSurrendered = false;
                warningOrArrestingUnit.policeState = "ARRESTING";
                warningOrArrestingUnit.arrestStage = 0;
                warningOrArrestingUnit.arrestTimer = 30;
                if (surrenderBtn) surrenderBtn.style.display = 'none';
            } else if (warningOrArrestingUnit.graceTimer <= 0 &&
                (Math.hypot(player.x - warningOrArrestingUnit.x, player.y - warningOrArrestingUnit.y) > 250 ||
                 (playerCar ? Math.abs(playerCar.speed) : Math.abs(player.speed || 0)) > 2.5 ||
                 warningOrArrestingUnit.warningTimer <= 0)) {

                player.beingChased = true;
                warningOrArrestingUnit.policeState = "CHASE";

                if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    taxiManager.setMessage("You are being chased!", 180);
                }
            }
    } else if (warningOrArrestingUnit.policeState === "ARRESTING") {

    if (surrenderBtn) {
        surrenderBtn.style.display = 'none';
    }

    warningOrArrestingUnit.speed = 0;
    return;
        }                
    }

    // 4. JOIN CHASE MECHANIC FOR NEARBY UNITS (Within 240px | Max 3 Cars, 2 Officers)
    if (player.beingChased) {
        // SURRENDER BUTTON: only available when a chasing police unit is close
if (surrenderBtn) {
    surrenderBtn.style.display = isPlayerNearPoliceUnit(120) ? 'block' : 'none';
}
        let activeChasingCars = cars.filter(c => c.isPolice && c.policeState === "CHASE").length;
        let activeChasingOfficers = npcs.filter(n => n.isPolice && n.policeState === "CHASE").length;

        // Check nearby police cars
        if (activeChasingCars < 3) {
            cars.forEach(c => {
                if (activeChasingCars < 3 && c.isPolice && c !== playerCar && c.hasDriver && !c.isStolen && (!c.policeState || c.policeState === "PATROL")) {
                    if (Math.hypot(player.x - c.x, player.y - c.y) <= 240) {
                        c.policeState = "CHASE";
                        c.isParked = false;
                        activeChasingCars++;
    if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                    taxiManager.setMessage("A police car joined the chase!", 180);
                    }
                }
            }
        });
     }

        // Check nearby police officer NPCs
        if (activeChasingOfficers < 2) {
            npcs.forEach(n => {
                if (activeChasingOfficers < 2 && n.isPolice && (!n.policeState || n.policeState === "PATROL")) {
                    if (Math.hypot(player.x - n.x, player.y - n.y) <= 240) {
                        n.policeState = "CHASE";
                        activeChasingOfficers++;
                          // --- HUD MESSAGE FOR NEW OFFICER JOINING ---
                            if (typeof taxiManager !== 'undefined' && taxiManager.setMessage) {
                                taxiManager.setMessage("A police unit joined the chase!", 180);

                    }
                }}
            });
        }

        // 5. UPDATE MOVEMENT & BEHAVIOR FOR ALL ACTIVE CHASING UNITS
        cars.forEach(c => {
            if (c.isPolice && c.policeState === "CHASE") {
                updateSinglePoliceChase(c, dt, player, cars, npcs);
            }
        });

        npcs.forEach(n => {
            if (n.isPolice && n.policeState === "CHASE") {
                updateSinglePoliceChase(n, dt, player, cars, npcs);
            }
        });
    }
}
