// Brief vehicle-name HUD toast.
let vehicleNameToast = "";
let vehicleNameToastStartedAt = 0;

const VEHICLE_NAME_TOAST_HOLD_MS = 2100;
const VEHICLE_NAME_TOAST_FADE_MS = 800;

function showVehicleNameToast(car) {
    if (!car || !car.type) return;

    vehicleNameToast = car.type;
    vehicleNameToastStartedAt = performance.now();
}
function checkPlayerDeath() {
  if (player.health <= 0) {
      taxiManager.setMessage("WASTED: Rushed to the hospital! Medical fee: $150", 240);
      player.money -= 100;
      player.health = player.maxHealth;
      player.hunger = 100;

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
    
      // Automatically arrest the player at the hospital if still wanted.
      if (
          player.wanted &&
          !player.isBeingArrested &&
          typeof executeArrestProcess === "function"
      ) {
          executeArrestProcess();
      }
}
let playerDamageVignette = 0;

function damagePlayer(amount) {
    if (!amount || amount <= 0) return false;

    player.health -= amount;
    playerDamageVignette = 1;

    if (player.health <= 0) {
        checkPlayerDeath();
        return true;
    }

    return false;
}
// --- HELPER TO SYNC ALL STOLEN CARS & WANTED STATUS ---
let stolenCarsStorageLastWrite = -Infinity;
let stolenCarsStorageNeedsCleanup = true;
const STOLEN_CARS_STORAGE_INTERVAL = 500;

function updateStolenCarsStorage(forceWrite = false) {
    const stolenCars = cars.filter(c => c && c.isStolen);

    if (stolenCars.length > 0) {
        const now = performance.now();

        // localStorage is synchronous. Avoid serializing and writing moving
        // stolen cars every animation frame while keeping state fresh.
        if (
            !forceWrite &&
            now - stolenCarsStorageLastWrite < STOLEN_CARS_STORAGE_INTERVAL
        ) {
            return;
        }

        const stolenDataList = stolenCars.map(c => ({
            id: c.id,
            x: c.x,
            y: c.y,
            color: c.color,
            type: c.type,
            angle: c.angle,
            isPolice: Boolean(c.isPolice),
            health: c.health,
            exploded: Boolean(c.exploded)
        }));

        localStorage.setItem(
            "stolen_cars",
            JSON.stringify(stolenDataList)
        );
        stolenCarsStorageLastWrite = now;
        stolenCarsStorageNeedsCleanup = true;

        return;
    }

    // No stolen cars remain.
    if (stolenCarsStorageNeedsCleanup) {
        localStorage.removeItem("stolen_cars");
        localStorage.removeItem("stolen car");
        stolenCarsStorageNeedsCleanup = false;
    }

    // A stolen-car crime is now gone.
    // Keep the player wanted only if another crime still exists
    // or police are actively chasing the player.
  const hasHitRunCase =
    typeof playerHitRunCases !== "undefined" &&
    playerHitRunCases > 0;

const hasAssaultCase =
    typeof playerAssaultCases !== "undefined" &&
    playerAssaultCases > 0;

    if (
        player.wanted &&
    !player.beingChased &&
    !hasHitRunCase &&
    !hasAssaultCase
) {
    player.wanted = false;
    player.beingChased = false;
    localStorage.setItem(
        "gma_player_wanted",
        "false"
    );
}  
}
    // ============================================================
    // PUNCH / BASIC MELEE COMBAT
    // Foundation only: no NPC reactions or crime logic yet.
    // ============================================================

    const punchBtn = document.getElementById("punchBtn");

    const PUNCH_RANGE = 48;
    const PUNCH_COOLDOWN = 14;
    const PUNCH_KNOCKBACK = 6;

    function getPunchTarget() {
        if (
            !player ||
            playerCar ||
            player.isBeingArrested ||
            isInsideHouse ||
            isInsideDealership
        ) {
            return null;
        }

        let closestNPC = null;
        let closestDistance = PUNCH_RANGE;

        const forwardX = Math.cos(player.angle - Math.PI / 2);
        const forwardY = Math.sin(player.angle - Math.PI / 2);

        for (let i = 0; i < npcs.length; i++) {
            const npc = npcs[i];

            if (!npc) continue;
            if (npc.isPassenger) continue;
            if (npc.isPolice) continue;
            if (npc.isInjured) continue;

            const dx = npc.x - player.x;
            const dy = npc.y - player.y;
            const distance = Math.hypot(dx, dy);

            if (distance > PUNCH_RANGE || distance === 0) {
                continue;
            }

            // NPC must be roughly in front of the player.
            const dot =
                (dx / distance) * forwardX +
                (dy / distance) * forwardY;

            if (dot < 0.15) continue;

            if (distance < closestDistance) {
                closestDistance = distance;
                closestNPC = npc;
            }
        }

        return closestNPC;
    }
    // ============================================================
    // ASSAULT WITNESS / REPORTING SYSTEM
    // ============================================================
    //
    // Combat itself does NOT register crime.
    //
    // Flow:
    //
    // PLAYER PUNCH
    //      |
    //      +--> police witness
    //      |       |
    //      |       +--> first incident: warn both, no crime
    //      |       |
    //      |       +--> another punch: assault crime
    //      |
    //      +--> civilian witnesses
    //      |       |
    //      |       +--> 40% calls police
    //      |       |
    //      |       +--> 60% flees
    //      |
    //      +--> punched NPC flees
    //              |
    //              +--> player gets 320px away
    //                      |
    //                      +--> 45% base reporting chance
    //                           + witness bonus
    //
    // Police officers are never valid punch targets.
    // ============================================================

    const assaultEncounters = [];
    let activeAssaultPoliceResponse = null;

    const ASSAULT_WITNESS_DISTANCE = 180;
    const ASSAULT_POLICE_WITNESS_DISTANCE = 220;
    const ASSAULT_POLICE_WARNING_DISTANCE = 55;
    const ASSAULT_FLEE_ESCAPE_DISTANCE = 320;

    function getAssaultEncounter(target) {
        if (!target) return null;

        let encounter = assaultEncounters.find(
            e => e.target === target
        );

        if (!encounter) {
            encounter = {
                target: target,
                sceneX: target.x,
                sceneY: target.y,
                npcWitnesses: [],
                policeWitness: null,
                policeWitnessCar: null,
                policeWarningActive: false,
                policeResponseStarted: false,
                fleeReportChecked: false,
                resolved: false
            };

            assaultEncounters.push(encounter);
        }

        return encounter;
    }

    function removeAssaultEncounter(target) {
        for (let i = assaultEncounters.length - 1; i >= 0; i--) {
            if (assaultEncounters[i].target === target) {
                assaultEncounters.splice(i, 1);
            }
        }
    }

    function resetNPCCombatAfterPoliceWarning(target) {
        if (!target) return;

        target.isFightingBack = false;
        target.fightTimer = 0;
        target.fightPath = [];
        target.fightPathIndex = 0;
        target.fightRepathTimer = 0;

        target.fleeTimer = 0;
        target.fleePath = [];
        target.fleePathIndex = 0;
        target.fleePathRepathTimer = 0;

        target.speed = 0;
        target.changeDirTimer = 60;

        target.inConversation = false;
        target.speechTimer = 0;
        target.speechText = null;
    }

    function makePoliceOfficerWitness(officer, encounter) {
        if (!officer || !encounter) return;

        encounter.policeWitness = officer;
        encounter.policeWarningActive = true;

        officer.policeState = "ASSAULT_WITNESS";
        officer.assaultEncounter = encounter;
        officer.assaultPath = [];
        officer.assaultPathIndex = 0;
        officer.assaultRepathTimer = 0;
        officer.speed = 0;

        resetNPCCombatAfterPoliceWarning(
            encounter.target
        );

        officer.say(
            "Stop fighting!",
            150
        );

        encounter.target.say(
            "Alright!",
            100
        );

        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                "Police: Stop fighting!",
                150
            );
        }
    }

    function setPoliceWarningForAssault(officer, target) {
        if (!officer) return;

        if (
            typeof registerAssaultCrime === "function"
        ) {
            registerAssaultCrime(target);
        }

        resetNPCCombatAfterPoliceWarning(target);

        officer.policeState = "WARNING";
        officer.warningTimer = 480;
        officer.graceTimer = 60;
        officer.saidStepOut = false;
        officer.saidArrested = false;
        officer.speed = 0;

        if (
            typeof officer.say === "function"
        ) {
            officer.say(
                "Stop! Police!",
                150
            );
        }

        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                "Assault reported! Police are stopping you.",
                180
            );
        }
    }

    function getNearbyAssaultPolice(target) {
        if (!target) return null;

        // First check on-foot officers.
        for (let i = 0; i < npcs.length; i++) {
            const officer = npcs[i];

            if (
                !officer ||
                !officer.isPolice ||
                officer.isInjured ||
                officer.policeState === "ARRESTING"
            ) {
                continue;
            }

            const distance = Math.hypot(
                officer.x - target.x,
                officer.y - target.y
            );

            if (
                distance <=
                ASSAULT_POLICE_WITNESS_DISTANCE
            ) {
                return {
                    type: "OFFICER",
                    unit: officer
                };
            }
        }

        // Then check police cars with an officer inside.
        for (let i = 0; i < cars.length; i++) {
            const car = cars[i];

            if (
                !car ||
                !car.isPolice ||
                !car.hasDriver ||
                car.exploded ||
                car.health <= 0 ||
                car === playerCar
            ) {
                continue;
            }

            const distance = Math.hypot(
                car.x - target.x,
                car.y - target.y
            );

            if (
                distance <=
                ASSAULT_POLICE_WITNESS_DISTANCE
            ) {
                return {
                    type: "POLICE_CAR",
                    unit: car
                };
            }
        }

        return null;
    }

    function getCivilianAssaultWitnesses(target) {
        const witnesses = [];

        if (!target) return witnesses;

        const centerX =
            (target.x + player.x) * 0.5;

        const centerY =
            (target.y + player.y) * 0.5;

        for (let i = 0; i < npcs.length; i++) {
            const npc = npcs[i];

            if (
                !npc ||
                npc === target ||
                npc.isPolice ||
                npc.isPassenger ||
                npc.isInjured
            ) {
                continue;
            }

            const distance = Math.hypot(
                npc.x - centerX,
                npc.y - centerY
            );

            if (
                distance <=
                ASSAULT_WITNESS_DISTANCE
            ) {
                witnesses.push(npc);
            }
        }

        return witnesses;
    }

    function getAssaultReportChance(
        witnessCount
    ) {
        // Base chance = 45%.
        // Each additional civilian witness adds 10%.
        // Maximum = 85%.
        return Math.min(
            0.85,
            0.45 +
            Math.max(0, witnessCount - 1) * 0.10
        );
    }

    function spawnAssaultPoliceResponse(
        encounter,
        caller
    ) {
        if (
            !encounter ||
            !caller ||
            activeAssaultPoliceResponse
        ) {
            return;
        }

        const spawn =
            typeof getArrestSpawnPosition ===
            "function"
                ? getArrestSpawnPosition()
                : {
                    x: player.x + 500,
                    y: player.y
                };

        const id =
            Date.now() +
            810000 +
            Math.floor(
                Math.random() * 10000
            );

        const policeCar = new Car(
            id,
            spawn.x,
            spawn.y,
            "#111111",
            true
        );

        policeCar.isPolice = true;
        policeCar.ownerType = "police";
        policeCar.type =
            "Commuter, Sedan";

        policeCar.width = 16;
        policeCar.length = 28;
        policeCar.baseSpeed = 3.2;
        policeCar.speed = 3.2;

        policeCar.isParked = false;
        policeCar.hasDriver = true;

        policeCar.policeState =
            "ASSAULT_RESPONSE";

        policeCar.assaultResponseTarget =
            encounter.target;

        policeCar.assaultResponseX =
            caller.x;

        policeCar.assaultResponseY =
            caller.y;

        policeCar.arrestTransportPath = null;
        policeCar.arrestTransportPathIndex = 1;
        policeCar.arrestTransportRepathTimer = 0;

        if (
            typeof policeCar.playSiren ===
            "function"
        ) {
            policeCar.playSiren(2);
        } else {
            policeCar.sirenState = 2;
        }

        cars.push(policeCar);

        activeAssaultPoliceResponse = {
            car: policeCar,
            encounter: encounter
        };

        encounter.policeResponseStarted = true;

        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                "Someone called the police!",
                180
            );
        }
    }

    function createOfficerFromPoliceCar(
        policeCar,
        encounter
    ) {
        if (
            !policeCar ||
            !encounter
        ) {
            return null;
        }

        policeCar.speed = 0;
        policeCar.isParked = true;
        policeCar.hasDriver = false;

        if (
            typeof policeCar.stopSiren ===
            "function"
        ) {
            policeCar.stopSiren();
        } else {
            policeCar.sirenState = 0;
        }

        const officer = new NPC(
            Date.now() +
            Math.floor(Math.random() * 10000),
            policeCar.x,
            policeCar.y,
            "#0b1d3a",
            "#2d3436",
            "#ffdbac",
            true
        );

        officer.isPolice = true;
        officer.policeState =
            "ASSAULT_WITNESS";

        officer.assaultWitnessCar =
            policeCar;

        officer.assaultEncounter =
            encounter;

        officer.assaultPath = [];
        officer.assaultPathIndex = 0;
        officer.assaultRepathTimer = 0;

        policeCar.assaultWitnessOfficer =
            officer;

        npcs.push(officer);

        encounter.policeWitness =
            officer;

        encounter.policeWitnessCar =
            policeCar;

        return officer;
    }

    function moveAssaultWitnessOfficer(
        officer,
        targetX,
        targetY,
        dt
    ) {
        if (!officer) return;

        if (!officer.assaultPath) {
            officer.assaultPath = [];
            officer.assaultPathIndex = 0;
            officer.assaultRepathTimer = 0;
        }

        officer.assaultRepathTimer -= dt;

        if (
            officer.assaultRepathTimer <= 0 ||
            officer.assaultPathIndex >=
            officer.assaultPath.length
        ) {
            officer.assaultPath =
                typeof findNPCReactionPath ===
                "function"
                    ? findNPCReactionPath(
                        officer.x,
                        officer.y,
                        targetX,
                        targetY,
                        true
                    )
                    : [];

            officer.assaultPathIndex = 0;
            officer.assaultRepathTimer = 30;
        }

        let moveAngle =
            Math.atan2(
                targetY - officer.y,
                targetX - officer.x
            );

        if (
            officer.assaultPath &&
            officer.assaultPathIndex <
            officer.assaultPath.length
        ) {
            const waypoint =
                officer.assaultPath[
                    officer.assaultPathIndex
                ];

            if (waypoint) {
                const dx =
                    waypoint.x - officer.x;
                const dy =
                    waypoint.y - officer.y;

                const distance =
                    Math.hypot(dx, dy);

                if (distance < 10) {
                    officer.assaultPathIndex++;
                } else {
                    moveAngle =
                        Math.atan2(dy, dx);
                }
            }
        }

        officer.angle =
            moveAngle + Math.PI / 2;

        const speed = 1.6;

        const nextX =
            officer.x +
            Math.cos(moveAngle) *
            speed *
            dt;

        const nextY =
            officer.y +
            Math.sin(moveAngle) *
            speed *
            dt;

        if (
            typeof isGrassOrRoad ===
            "function" &&
            isGrassOrRoad(nextX, nextY)
        ) {
            officer.x = nextX;
            officer.y = nextY;
            officer.walkTimer +=
                speed * dt * 0.12;
        }
    }

    function updateAssaultPoliceResponse(dt) {
        if (
            !activeAssaultPoliceResponse
        ) {
            return;
        }

        const response =
            activeAssaultPoliceResponse;

        const car = response.car;
        const encounter =
            response.encounter;

        if (
            !car ||
            !encounter ||
            !cars.includes(car)
        ) {
            activeAssaultPoliceResponse =
                null;
            return;
        }

        const target =
            encounter.target;

        if (!target) {
            car.policeState = "PATROL";
            car.isParked = false;
            car.hasDriver = true;
            activeAssaultPoliceResponse =
                null;
            return;
        }

        const distance = Math.hypot(
            car.x -
            encounter.sceneX,
            car.y -
            encounter.sceneY
        );

        // Arrived at the scene.
        if (distance <= 55) {
            car.speed = 0;
            car.isParked = true;

            const fightStillGoing =
                !target.isInjured &&
                (
                    target.isFightingBack ||
                    target.fleeTimer > 0 ||
                    Math.hypot(
                        player.x - target.x,
                        player.y - target.y
                    ) <= 90
                );

            if (!fightStillGoing) {
                car.policeState = "PATROL";
                car.isParked = false;
                car.hasDriver = true;

                activeAssaultPoliceResponse =
                    null;

                return;
            }

            const officer =
                createOfficerFromPoliceCar(
                    car,
                    encounter
                );

            activeAssaultPoliceResponse =
                null;

            if (!officer) return;

            // If the fleeing NPC is still involved,
            // police immediately treats this as a witnessed assault.
            if (
                target.fleeTimer > 0 &&
                !target.isFightingBack
            ) {
                setPoliceWarningForAssault(
                    officer,
                    target
                );
            } else {
                // First fight-back incident:
                // police breaks it up without creating a crime.
                makePoliceOfficerWitness(
                    officer,
                    encounter
                );
            }

            return;
        }

        if (
            typeof moveArrestPoliceCar ===
            "function"
        ) {
            moveArrestPoliceCar(
                car,
                encounter.sceneX,
                encounter.sceneY,
                dt,
                3.2
            );
        }
    }

    function finishAssaultPoliceWitness(
        encounter
    ) {
        if (!encounter) return;

        const officer =
            encounter.policeWitness;

        if (!officer) return;

        const policeCar =
            encounter.policeWitnessCar ||
            officer.assaultWitnessCar;

        if (policeCar) {
            officer.isPassenger = true;
            officer.x = policeCar.x;
            officer.y = policeCar.y;

            policeCar.assaultWitnessOfficer =
                null;

            policeCar.hasDriver = true;
            policeCar.isParked = false;
            policeCar.policeState = "PATROL";

            if (
                typeof policeCar.playSiren ===
                "function"
            ) {
                policeCar.playSiren(0);
            } else {
                policeCar.sirenState = 0;
            }
        } else {
            officer.policeState = "PATROL";
            officer.speed =
                0.3 + Math.random() * 0.4;
        }

        officer.assaultEncounter = null;
        officer.assaultWitnessCar = null;
    }

    function handleAssaultWitnesses(
        target,
        targetWillFightBack
    ) {
        if (!target || target.isPolice) {
            return;
        }

        const encounter =
            getAssaultEncounter(target);

        // --------------------------------------------------------
        // A police witness already exists.
        // Another punch against the same NPC becomes the crime.
        // --------------------------------------------------------
        if (encounter.policeWitness) {
            if (
                encounter.policeWarningActive &&
                !target.assaultCrimeRegistered
            ) {
                setPoliceWarningForAssault(
                    encounter.policeWitness,
                    target
                );

                encounter.policeWarningActive =
                    false;

                return;
            }

            // Already a crime: never create another case.
            return;
        }
        

            // --------------------------------------------------------
            // Find police who witnessed the punch.
            // --------------------------------------------------------
            const policeWitness =
                getNearbyAssaultPolice(target);

            if (policeWitness) {
                if (
                    policeWitness.type ===
                    "OFFICER"
                ) {
                    const officer =
                        policeWitness.unit;

                    if (
                        targetWillFightBack &&
                        !target.assaultCrimeRegistered
                    ) {
                        makePoliceOfficerWitness(
                            officer,
                            encounter
                        );
                    } else {
                        setPoliceWarningForAssault(
                            officer,
                            target
                        );
                    }

                    return;
                }

                if (
                    policeWitness.type ===
                    "POLICE_CAR"
                ) {
                    const policeCar =
                        policeWitness.unit;

                    // The officer exits the parked police car.
                    const officer =
                        createOfficerFromPoliceCar(
                            policeCar,
                            encounter
                        );

                    if (!officer) return;

                    if (
                        targetWillFightBack &&
                        !target.assaultCrimeRegistered
                    ) {
                        makePoliceOfficerWitness(
                            officer,
                            encounter
                        );
                    } else {
                        setPoliceWarningForAssault(
                            officer,
                            target
                        );
                    }

                    return;
                }
            }

            // --------------------------------------------------------
            // Civilian witnesses.
            //
            // Police already handled the scene above, so civilians
            // are not allowed to create a second police call.
            // --------------------------------------------------------
            const witnesses =
                getCivilianAssaultWitnesses(
                    target
                );

            encounter.npcWitnesses =
                witnesses.filter(
                    npc =>
                        !encounter.npcWitnesses.includes(
                            npc
                        )
                );

            const policeAlreadyActive =
                assaultEncounters.some(
                    e =>
                        e !== encounter &&
                        e.policeWitness
                );

            if (!policeAlreadyActive) {
                for (
                    let i = 0;
                    i <
                    encounter.npcWitnesses.length;
                    i++
                ) {
                    const witness =
                        encounter.npcWitnesses[i];

                    if (
                        witness.assaultDecisionMade
                    ) {
                        continue;
                    }

                    witness.assaultDecisionMade =
                        true;

                    // 40% chance to call police.
                    if (
                        Math.random() < 0.40 &&
                        !encounter.policeResponseStarted
                    ) {
                        witness.say(
                            "I'm calling police!",
                            180
                        );

                        spawnAssaultPoliceResponse(
                            encounter,
                            witness
                        );

                        break;
                    }

                    // 60% chance to flee.
                    witness.say(
                        "I should get away!",
                        120
                    );

                    witness.fleeTimer = 240;

                    witness.fleeAngle =
                        Math.atan2(
                            witness.y - player.y,
                            witness.x - player.x
                        ) +
                        Math.PI / 2;

                    witness.fleePath = [];
                    witness.fleePathIndex = 0;
                    witness.fleePathRepathTimer = 0;
                }
            }

            // If the punched NPC is going to flee,
            // remember where the assault happened.
            if (!targetWillFightBack) {
                encounter.sceneX = target.x;
                encounter.sceneY = target.y;
                encounter.fleeReportChecked = false;
            }
        }

        function updateAssaultWitnessSystem(dt) {
            updateAssaultPoliceResponse(dt);

            for (
                let i = assaultEncounters.length - 1;
                i >= 0;
                i--
            ) {
                const encounter =
                    assaultEncounters[i];

                const target =
                    encounter.target;

                if (!target) {
                    assaultEncounters.splice(i, 1);
                    continue;
                }

                // ----------------------------------------------------
                // Move a police officer toward the fight.
                // ----------------------------------------------------
                if (
                    encounter.policeWitness &&
                    encounter.policeWitness.policeState ===
                    "ASSAULT_WITNESS"
                ) {
                    const officer =
                        encounter.policeWitness;

                    const targetX =
                        (player.x + target.x) *
                        0.5;

                    const targetY =
                        (player.y + target.y) *
                        0.5;

                    const distance =
                        Math.hypot(
                            officer.x - targetX,
                            officer.y - targetY
                        );

                    if (
                        distance >
                        ASSAULT_POLICE_WARNING_DISTANCE
                    ) {
                        moveAssaultWitnessOfficer(
                            officer,
                            targetX,
                            targetY,
                            dt
                        );
                    } else {
                        officer.speed = 0;

                        if (
                            !encounter.warningShown
                        ) {
                            encounter.warningShown =
                                true;

                            officer.say(
                                "Stop fighting!",
                                150
                            );

                            target.say(
                                "Alright!",
                                100
                            );

                            resetNPCCombatAfterPoliceWarning(
                                target
                            );

                            if (
                                typeof taxiManager !==
                                "undefined" &&
                                taxiManager.setMessage
                            ) {
                                taxiManager.setMessage(
                                    "Police broke up the fight.",
                                    150
                                );
                            }
                        }
                    }
                }

                // ----------------------------------------------------
                // Fleeing punched NPC:
                // once player has gone 320 units from the scene,
                // decide whether the assault gets reported.
                // ----------------------------------------------------
                if (
                    target.fleeTimer > 0 &&
                    !target.assaultCrimeRegistered &&
                    !encounter.fleeReportChecked
                ) {
                    const playerDistance =
                        Math.hypot(
                            player.x -
                            encounter.sceneX,
                            player.y -
                            encounter.sceneY
                        );

                    if (
                        playerDistance >=
                        ASSAULT_FLEE_ESCAPE_DISTANCE
                    ) {
                        encounter.fleeReportChecked =
                            true;

                        const witnessCount =
                            encounter.npcWitnesses.length;

                        const reportChance =
                            getAssaultReportChance(
                                witnessCount
                            );

                        if (
                            Math.random() <
                            reportChance
                        ) {
                            registerAssaultCrime(
                                target
                            );
                        }

                        // The scene is finished.
                        target.fleeTimer = 0;
                        target.fleePath = [];
                        target.fleePathIndex = 0;

                        if (
                            !target.assaultCrimeRegistered
                        ) {
                            target.assaultDecisionMade =
                                false;

                            removeAssaultEncounter(
                                target
                            );
                        }
                    }
                }
            }
        }
        function punchNPC() {
            if (
                !player ||
                player.punchCooldown > 0
            ) {
                return;
            }

            const target = getPunchTarget();

            if (!target) return;

            // Police are NEVER valid combat targets.
            if (target.isPolice) return;

            // --------------------------------------------------------
            // Start player punch animation.
            // --------------------------------------------------------
            player.punchTimer = 12;
            player.punchCooldown =
                PUNCH_COOLDOWN;

            // --------------------------------------------------------
            // Count punches against THIS NPC.
            // --------------------------------------------------------
            target.punchCount =
                (target.punchCount || 0) + 1;

            // --------------------------------------------------------
            // Knock NPC backwards.
            // --------------------------------------------------------
            let dx =
                target.x - player.x;

            let dy =
                target.y - player.y;

            let distance =
                Math.hypot(dx, dy);

            if (distance > 0) {
                const nx =
                    dx / distance;

                const ny =
                    dy / distance;

                const pushedX =
                    target.x +
                    nx * PUNCH_KNOCKBACK;

                const pushedY =
                    target.y +
                    ny * PUNCH_KNOCKBACK;

                if (
                    typeof isRoadColor !==
                        "function" ||
                    isRoadColor(
                        pushedX,
                        pushedY
                    )
                ) {
                    target.x = pushedX;
                    target.y = pushedY;
                }
            }

            // --------------------------------------------------------
            // Clear normal conversation.
            // --------------------------------------------------------
            target.inConversation = false;
            target.speechText = null;
            target.speechTimer = 0;
            target.conversationCooldown = 180;

            // --------------------------------------------------------
            // Determine whether THIS punch would make the NPC fight.
            // --------------------------------------------------------
            const targetWillFightBack =
                Boolean(
                    target.canFightBack &&
                    !target.isPolice
                );

            // --------------------------------------------------------
            // Witnesses see the actual assault.
            //
            // This happens BEFORE the civilian reaction is started
            // so a police witness can immediately break up a fight.
            // --------------------------------------------------------
            handleAssaultWitnesses(
                target,
                targetWillFightBack
            );

            // --------------------------------------------------------
            // If a police witness has already warned this NPC/player,
            // the second punch registers the assault and police.js
            // takes over.
            // --------------------------------------------------------
            const encounter =
                getAssaultEncounter(target);

            if (
                encounter &&
                encounter.policeWitness &&
                encounter.policeWarningActive &&
                !target.assaultCrimeRegistered
            ) {
                setPoliceWarningForAssault(
                    encounter.policeWitness,
                    target
                );

                encounter.policeWarningActive =
                    false;

                if (
                    typeof npcHitPool !==
                    "undefined"
                ) {
                    playSpatialSound(
                        npcHitPool,
                        target.x,
                        target.y,
                        1.0
                    );
                }

                return;
            }

            // --------------------------------------------------------
            // Injure after the existing random 2â€“5 punches.
            // --------------------------------------------------------
            if (
                target.punchCount >=
                target.punchesToInjure
            ) {
                target.isInjured = true;
                target.speed = 0;

                target.isFightingBack = false;
                target.fightTimer = 0;
                target.fightPath = [];
                target.fightPathIndex = 0;

                target.fleeTimer = 0;
                target.fleePath = [];
                target.fleePathIndex = 0;

                target.inConversation = false;
                target.speechText = null;
                target.speechTimer = 0;
                target.changeDirTimer = 999999;

                if (
                    typeof npcHitPool !==
                    "undefined"
                ) {
                    playSpatialSound(
                        npcHitPool,
                        target.x,
                        target.y,
                        1.0
                    );
                }

                return;
            }

            // --------------------------------------------------------
            // If police broke up the fight, do NOT start another
            // civilian reaction.
            // --------------------------------------------------------
            if (
                encounter &&
                encounter.policeWitness &&
                encounter.warningShown
            ) {
                resetNPCCombatAfterPoliceWarning(
                    target
                );

                if (
                    typeof npcHitPool !==
                    "undefined"
                ) {
                    playSpatialSound(
                        npcHitPool,
                        target.x,
                        target.y,
                        1.0
                    );
                }

                return;
            }
            // --------------------------------------------------------
                // CIVILIAN FIGHT BACK
                // --------------------------------------------------------
                if (targetWillFightBack) {
                    target.isFightingBack = true;
                    target.fightTimer = 900;

                    target.fightPath = [];
                    target.fightPathIndex = 0;
                    target.fightRepathTimer = 0;

                    target.fleeTimer = 0;
                    target.fleePath = [];
                    target.fleePathIndex = 0;
                    target.fleePathRepathTimer = 0;

                    const fightLines = [
                        "Hey you!",
                        "Who you think you are?",
                        "Back off!",
                        "You wanna fight?!",
                        "What you want!"
                    ];

                    target.say(
                        fightLines[
                            Math.floor(
                                Math.random() *
                                fightLines.length
                            )
                        ],
                        90
                    );
                }

                // --------------------------------------------------------
                // CIVILIAN FLEES
                // --------------------------------------------------------
                else {
                    target.isFightingBack = false;
                    target.fightTimer = 0;

                    target.fightPath = [];
                    target.fightPathIndex = 0;

                    target.fleeAngle =
                        Math.atan2(
                            dy,
                            dx
                        ) +
                        Math.PI / 2;

                    target.fleeTimer = 300;

                    target.fleePath = [];
                    target.fleePathIndex = 0;
                    target.fleePathRepathTimer = 0;

                    const fleeLines = [
                        "Police!",
                        "What was that?!",
                        "Help!",
                        "What you want!"
                    ];

                    target.say(
                        fleeLines[
                            Math.floor(
                                Math.random() *
                                fleeLines.length
                            )
                        ],
                        90
                    );
                }

                if (
                    typeof npcHitPool !==
                    "undefined"
                ) {
                    playSpatialSound(
                        npcHitPool,
                        target.x,
                        target.y,
                        1.0
                    );
                }
            }            
            if (punchBtn) {
                punchBtn.addEventListener("click", punchNPC);
            }