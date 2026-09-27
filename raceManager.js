// ============================================================
// STREETBOUND RACE EVENTS MANAGER
// ============================================================
// Phase 1:
// - Random race time
// - Random safe road start / finish
// - Random road checkpoints
// - Route validation through existing A*
// - 2-hour-before notification
// - Phone race message
// - Start marker
// - Join button
// - Player-owned-car validation
// - Race transition / car orientation
// - Race markers
// - Automatic 1-hour race ending
// - Finish message
//
// NPC racers are NOT implemented yet.
// Checkpoint completion is NOT tracked yet.
// ============================================================

class RaceEventsManager {
    constructor() {
        this.state = "WAITING";

        this.raceStartHour = null;
        this.raceStartMinute = 0;

        this.start = null;
        this.finish = null;
        this.checkpoints = [];
        this.route = [];

        this.joinRadius = 90;

        this.phoneMessageActive = false;
        this.phoneMessageDismissed = false;

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        this.raceStarted = false;
        this.raceEndHour = null;

        this.joinButton = null;

        this.midnightWaitActive = false;
        this.lastObservedHour = -1;

        this.generateAttempts = 0;

        this.createJoinButton();

        // Collision map is already loaded before this is called.
        this.waitForWorldAndGenerate();
    }

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------

    waitForWorldAndGenerate() {
        if (
            typeof collisionData === "undefined" ||
            !collisionData ||
            typeof mapWidth === "undefined" ||
            mapWidth <= 0 ||
            typeof mapHeight === "undefined" ||
            mapHeight <= 0
        ) {
            setTimeout(() => {
                this.waitForWorldAndGenerate();
            }, 250);

            return;
        }

        this.scheduleNextRace();
    }

    // --------------------------------------------------------
    // RANDOM RACE TIME
    // --------------------------------------------------------

    scheduleNextRace() {
        this.clearRaceState();

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        // If it is already 6 PM or later,
        // DO NOT generate today's race.
        //
        // Wait until the in-game clock crosses midnight.
        if (currentHour >= 18) {
            this.state = "WAITING_FOR_MIDNIGHT";
            this.midnightWaitActive = true;

            console.log(
                "[RACE] Current time is " +
                this.formatTime(currentHour) +
                ". Next race will be calculated after midnight."
            );

            return;
        }

        this.midnightWaitActive = false;

        // Whole-hour race time for now.
        //
        // Example:
        // current = 15:xx
        // possible = 16:00 ... 23:00
        //
        // We will later decide whether races should use
        // random minutes too.
        const currentWholeHour =
            Math.floor(currentHour);

        const minimumHour =
            Math.max(1, currentWholeHour + 1);

        const maximumHour = 23;

        if (minimumHour > maximumHour) {
            this.state = "WAITING_FOR_MIDNIGHT";
            this.midnightWaitActive = true;
            return;
        }

        this.raceStartHour =
            minimumHour +
            Math.floor(
                Math.random() *
                (maximumHour - minimumHour + 1)
            );

        this.raceStartMinute = 0;

        // Generate the actual race immediately.
        const generated =
            this.generateRaceRoute();

        if (!generated) {
            console.warn(
                "[RACE] Could not generate a valid race. Retrying."
            );

            setTimeout(() => {
                this.scheduleNextRace();
            }, 500);

            return;
        }

        this.state = "SCHEDULED";

        console.log(
            `[RACE] Race scheduled for ${this.formatHourMinute(
                this.raceStartHour,
                this.raceStartMinute
            )}`
        );

        console.log(
            "[RACE] Start:",
            this.start
        );

        console.log(
            "[RACE] Finish:",
            this.finish
        );

        console.log(
            "[RACE] Checkpoints:",
            this.checkpoints
        );
    }

    // --------------------------------------------------------
    // RACE GENERATION
    // --------------------------------------------------------

    generateRaceRoute() {
        const MAX_ATTEMPTS = 80;

        for (
            let attempt = 0;
            attempt < MAX_ATTEMPTS;
            attempt++
        ) {
            this.generateAttempts++;

            const leftToRight =
                Math.random() < 0.5;

            const startRegion = leftToRight
                ? "left"
                : "right";

            const finishRegion = leftToRight
                ? "right"
                : "left";

            const start =
                this.getSafeRoadPositionInRegion(
                    startRegion
                );

            const finish =
                this.getSafeRoadPositionInRegion(
                    finishRegion
                );

            if (!start || !finish) {
                continue;
            }

            // Ensure the two points really are far apart.
            const directDistance =
                Math.hypot(
                    finish.x - start.x,
                    finish.y - start.y
                );

            // Because the regions already guarantee separation,
            // this is mostly an additional sanity check.
            if (directDistance < mapWidth * 0.35) {
                continue;
            }

            if (
                typeof navigationSystem === "undefined" ||
                !navigationSystem.ready ||
                typeof navigationSystem.findPath !== "function"
            ) {
                continue;
            }

            const route =
                navigationSystem.findPath(
                    start.x,
                    start.y,
                    finish.x,
                    finish.y
                );

            if (
                !route ||
                route.length < 3
            ) {
                continue;
            }

            const checkpoints =
                this.generateCheckpoints(
                    route,
                    start,
                    finish
                );

            if (
                !checkpoints ||
                checkpoints.length === 0
            ) {
                continue;
            }

            this.start = start;
            this.finish = finish;
            this.route = route;
            this.checkpoints = checkpoints;

            return true;
        }

        return false;
    }

    // --------------------------------------------------------
    // START / FINISH REGION
    // --------------------------------------------------------

    getSafeRoadPositionInRegion(region) {
        const maxAttempts = 40;

        const minX =
            region === "left"
                ? 0
                : mapWidth * 0.70;

        const maxX =
            region === "left"
                ? mapWidth * 0.30
                : mapWidth;

        for (
            let attempt = 0;
            attempt < maxAttempts;
            attempt++
        ) {
            // IMPORTANT:
            // Use the game's existing safe road-position function.
            const candidate =
                getRandomStrictRoadPosition();

            if (
                !candidate ||
                !Number.isFinite(candidate.x) ||
                !Number.isFinite(candidate.y)
            ) {
                continue;
            }

            if (
                candidate.x >= minX &&
                candidate.x <= maxX
            ) {
                return candidate;
            }
        }

        return null;
    }

    // --------------------------------------------------------
    // CHECKPOINT GENERATION
    // --------------------------------------------------------
    //
    // Checkpoints are chosen from the generated A* route,
    // but each checkpoint is still validated through the
    // existing safe-road-position function.
    //
    // This keeps them on the actual race route instead of
    // randomly placing checkpoints somewhere disconnected.
    // --------------------------------------------------------

    generateCheckpoints(
        route,
        start,
        finish
    ) {
        if (!route || route.length < 4) {
            return [];
        }

        const checkpointCount = Math.min(
            5,
            Math.max(
                3,
                Math.floor(route.length / 12)
            )
        );

        const checkpoints = [];

        for (
            let i = 1;
            i <= checkpointCount;
            i++
        ) {
            const progress =
                i /
                (checkpointCount + 1);

            const routeIndex =
                Math.floor(
                    progress *
                    (route.length - 1)
                );

            const routePoint =
                route[
                    Math.max(
                        1,
                        Math.min(
                            route.length - 2,
                            routeIndex
                        )
                    )
                ];

            if (!routePoint) {
                continue;
            }

            // Find a safe random road position around
            // this section of the route.
            let selected = null;

            for (
                let attempt = 0;
                attempt < 25;
                attempt++
            ) {
                const candidate =
                    getRandomStrictRoadPosition();

                if (!candidate) {
                    continue;
                }

                const distance =
                    Math.hypot(
                        candidate.x - routePoint.x,
                        candidate.y - routePoint.y
                    );

                if (distance <= 180) {
                    selected = candidate;
                    break;
                }
            }

            // If no nearby safe random point was found,
            // use the route point itself.
            if (!selected) {
                selected = {
                    x: routePoint.x,
                    y: routePoint.y
                };
            }

            // Avoid checkpoints becoming too close together.
            if (checkpoints.length > 0) {
                const previous =
                    checkpoints[
                        checkpoints.length - 1
                    ];

                if (
                    Math.hypot(
                        selected.x - previous.x,
                        selected.y - previous.y
                    ) < 180
                ) {
                    continue;
                }
            }

            checkpoints.push(selected);
        }

        return checkpoints;
    }

    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

    update(dt) {
        if (
            typeof gameSeconds === "undefined" ||
            typeof DAY_LENGTH === "undefined"
        ) {
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        // Midnight detection.
        if (
            this.lastObservedHour >= 23 &&
            currentHour < 1
        ) {
            if (
                this.state === "WAITING_FOR_MIDNIGHT" ||
                this.state === "FINISHED" ||
                this.state === "MISSED"
            ) {
                this.midnightWaitActive = false;
                this.scheduleNextRace();
            }
        }

        this.lastObservedHour =
            currentHour;

        // ----------------------------------------------------
        // TWO-HOUR WARNING
        // ----------------------------------------------------

        if (
            this.state === "SCHEDULED" &&
            !this.raceStarted
        ) {
            const hoursUntilRace =
                this.getHoursUntilRace(
                    currentHour
                );

            if (
                hoursUntilRace <= 2 &&
                hoursUntilRace > 0
            ) {
                if (
                    !this.startMarkerVisible
                ) {
                    this.startMarkerVisible = true;

                    if (
                        typeof taxiManager !== "undefined" &&
                        taxiManager.setMessage
                    ) {
                        taxiManager.setMessage(
                            "Check phone for race event",
                            180
                        );
                    }
                }
            }

            // Race time reached.
            if (
                currentHour >=
                this.raceStartHour
            ) {
                this.handleRaceStartTime();
            }
        }

        // ----------------------------------------------------
        // ACTIVE PLAYER RACE
        // ----------------------------------------------------

        if (
            this.state === "RACING" &&
            this.raceStarted
        ) {
            if (
                currentHour >=
                this.raceEndHour
            ) {
                this.finishRace();
            }
        }

        // Join button proximity.
        this.updateJoinButton();
    }

    // --------------------------------------------------------
    // RACE TIME
    // --------------------------------------------------------

    getHoursUntilRace(currentHour) {
        let difference =
            this.raceStartHour -
            currentHour;

        if (difference < 0) {
            difference += 24;
        }

        return difference;
    }

    handleRaceStartTime() {
        if (
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        // Player didn't join.
        // For this phase, simply remove the event.
        // NPC racing will be added later.
        this.state = "MISSED";

        this.hidePhoneRaceMessage();
        this.hideJoinButton();

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        console.log(
            "[RACE] Race time reached. Player did not join."
        );

        // Do NOT generate another race immediately.
        // Wait until midnight.
    }

    // --------------------------------------------------------
    // PHONE MESSAGE
    // --------------------------------------------------------

    showPhoneRaceMessage() {
        if (
            this.phoneMessageDismissed ||
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        if (
            hoursUntilRace <= 0 ||
            hoursUntilRace > 2
        ) {
            return;
        }

        const layer =
            document.getElementById(
                "phoneCutsceneMessage"
            );

        const text =
            document.getElementById(
                "phoneCutsceneMessageText"
            );

        if (!layer || !text) {
            return;
        }

        text.textContent =
            `Race at ${this.formatHourMinute(
                this.raceStartHour,
                this.raceStartMinute
            )}, tap cross to get location`;

        layer.style.display = "flex";

        this.phoneMessageActive = true;
    }

    hidePhoneRaceMessage() {
        const layer =
            document.getElementById(
                "phoneCutsceneMessage"
            );

        if (layer) {
            layer.style.display = "none";
        }

        this.phoneMessageActive = false;
    }

    dismissPhoneRaceMessage() {
        this.phoneMessageDismissed = true;
        this.hidePhoneRaceMessage();
    }

    shouldShowPhoneMessage() {
        if (
            this.phoneMessageDismissed ||
            this.state !== "SCHEDULED"
        ) {
            return false;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        return (
            hoursUntilRace > 0 &&
            hoursUntilRace <= 2
        );
    }

    // --------------------------------------------------------
    // JOIN BUTTON
    // --------------------------------------------------------

    createJoinButton() {
        const button =
            document.createElement("button");

        button.id =
            "raceJoinButton";

        button.textContent =
            "JOIN RACE";

        button.style.display =
            "none";

        button.style.position =
            "absolute";

        button.style.left =
            "50%";

        button.style.bottom =
            "18%";

        button.style.transform =
            "translateX(-50%)";

        button.style.zIndex =
            "300";

        button.style.padding =
            "12px 24px";

        button.style.fontWeight =
            "bold";

        button.style.fontSize =
            "16px";

        button.style.borderRadius =
            "8px";

        button.style.border =
            "2px solid white";

        button.style.background =
            "#e74c3c";

        button.style.color =
            "white";

        document.body.appendChild(button);

        this.joinButton = button;

        button.addEventListener(
            "pointerdown",
            e => {
                e.preventDefault();
                this.tryJoinRace();
            }
        );
    }

    updateJoinButton() {
        if (
            !this.joinButton ||
            this.state !== "SCHEDULED" ||
            !this.start
        ) {
            this.hideJoinButton();
            return;
        }

        const currentHour =
            (gameSeconds / DAY_LENGTH) * 24;

        const hoursUntilRace =
            this.getHoursUntilRace(
                currentHour
            );

        if (
            hoursUntilRace <= 0 ||
            hoursUntilRace > 2
        ) {
            this.hideJoinButton();
            return;
        }

        if (
            typeof player === "undefined" ||
            !player
        ) {
            this.hideJoinButton();
            return;
        }

        const distance =
            Math.hypot(
                player.x - this.start.x,
                player.y - this.start.y
            );

        if (
            distance <= this.joinRadius
        ) {
            this.joinButton.style.display =
                "block";
        } else {
            this.hideJoinButton();
        }
    }

    hideJoinButton() {
        if (this.joinButton) {
            this.joinButton.style.display =
                "none";
        }
    }

    // --------------------------------------------------------
    // JOIN VALIDATION
    // --------------------------------------------------------

    tryJoinRace() {
        if (
            this.state !== "SCHEDULED"
        ) {
            return;
        }

        if (
            typeof playerCar === "undefined" ||
            !playerCar
        ) {
            this.showJoinDenied(
                "You must be in your own car to join the race"
            );
            return;
        }

        // Owned cars created by gameplay.js use this flag.
        const isOwned =
            playerCar.ownerType ===
                "playerOwned";

        // Taxi / truck-job cars are explicitly rejected.
        const isJobVehicle =
            Boolean(
                playerCar.isTaxi ||
                playerCar ===
                    (typeof truckManager !== "undefined"
                        ? truckManager.truck
                        : null)
            );

        const isStolen =
            Boolean(playerCar.isStolen);

        if (
            !isOwned ||
            isStolen ||
            isJobVehicle
        ) {
            this.showJoinDenied(
                "You can only join in your own car"
            );
            return;
        }

        this.startPlayerRace();
    }

    showJoinDenied(message) {
        if (
            typeof taxiManager !== "undefined" &&
            taxiManager.setMessage
        ) {
            taxiManager.setMessage(
                message,
                180
            );
        }
    }

    // --------------------------------------------------------
    // START PLAYER RACE
    // --------------------------------------------------------

    startPlayerRace() {
        if (
            !playerCar ||
            !this.route ||
            this.route.length < 2
        ) {
            return;
        }

        this.hideJoinButton();
        this.hidePhoneRaceMessage();

        this.raceStarted = true;
        this.state = "RACING";

        this.startMarkerVisible = false;
        this.raceMarkersVisible = true;

        // Race lasts exactly one in-game hour.
        this.raceEndHour =
            this.raceStartHour + 1;

        if (this.raceEndHour >= 24) {
            this.raceEndHour -= 24;
        }

        // First path segment determines the starting direction.
        const nextPoint =
            this.route[1];

        const routeAngle =
            Math.atan2(
                nextPoint.y - this.start.y,
                nextPoint.x - this.start.x
            );

        this.beginRaceTransition(
            routeAngle
        );
    }

    beginRaceTransition(routeAngle) {
        const transition =
            document.createElement("div");

        transition.id =
            "raceBlackTransition";

        transition.style.position =
            "fixed";

        transition.style.inset =
            "0";

        transition.style.background =
            "black";

        transition.style.zIndex =
            "9999";

        transition.style.opacity =
            "0";

        transition.style.transition =
            "opacity 250ms ease";

        document.body.appendChild(
            transition
        );

        requestAnimationFrame(() => {
            transition.style.opacity =
                "1";
        });

        setTimeout(() => {
            if (playerCar) {
                // Car sprites use angle - PI/2
                // as their forward direction.
                playerCar.angle =
                    routeAngle +
                    Math.PI / 2;

                player.angle =
                    playerCar.angle;

                playerCar.speed = 0;

                player.x =
                    playerCar.x;

                player.y =
                    playerCar.y;
            }

            transition.style.opacity =
                "0";

            setTimeout(() => {
                transition.remove();
            }, 300);
        }, 300);
    }

    // --------------------------------------------------------
    // FINISH
    // --------------------------------------------------------

    finishRace() {
        if (
            this.state !== "RACING"
        ) {
            return;
        }

        this.state = "FINISHED";
        this.raceStarted = false;

        this.hideJoinButton();
        this.hidePhoneRaceMessage();

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        this.showFinishMessage();

        console.log(
            "[RACE] Player race ended at scheduled finish time."
        );
    }

    showFinishMessage() {
        const overlay =
            document.createElement("div");

        overlay.id =
            "raceFinishMessage";

        overlay.style.position =
            "fixed";

        overlay.style.inset =
            "0";

        overlay.style.display =
            "flex";

        overlay.style.alignItems =
            "center";

        overlay.style.justifyContent =
            "center";

        overlay.style.background =
            "rgba(0,0,0,0.72)";

        overlay.style.zIndex =
            "10000";

        const box =
            document.createElement("div");

        box.style.width =
            "min(520px, 80vw)";

        box.style.padding =
            "28px";

        box.style.background =
            "rgba(15,15,15,0.96)";

        box.style.border =
            "2px solid white";

        box.style.borderRadius =
            "12px";

        box.style.color =
            "white";

        box.style.textAlign =
            "center";

        box.innerHTML = `
            <h2 style="margin-top:0;">
                RACE FINISHED
            </h2>

            <p>
                The race event has ended.
            </p>

            <button
                id="raceFinishContinue"
                style="
                    padding:10px 24px;
                    font-weight:bold;
                    cursor:pointer;
                "
            >
                CONTINUE
            </button>
        `;

        overlay.appendChild(box);

        document.body.appendChild(
            overlay
        );

        const continueButton =
            document.getElementById(
                "raceFinishContinue"
            );

        if (continueButton) {
            continueButton.addEventListener(
                "pointerdown",
                e => {
                    e.preventDefault();

                    overlay.remove();

                    this.clearRaceState();

                    // New race is deliberately NOT generated
                    // until midnight.
                    this.state =
                        "WAITING_FOR_MIDNIGHT";

                    this.midnightWaitActive =
                        true;
                }
            );
        }
    }

    // --------------------------------------------------------
    // MARKER DATA
    // --------------------------------------------------------

    getStartMarker() {
        if (
            !this.startMarkerVisible ||
            !this.start
        ) {
            return null;
        }

        return this.start;
    }

    getRaceMarkers() {
        if (
            !this.raceMarkersVisible
        ) {
            return [];
        }

        return [
            ...this.checkpoints,
            this.finish
        ].filter(Boolean);
    }

    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    clearRaceState() {
        this.start = null;
        this.finish = null;
        this.checkpoints = [];
        this.route = [];

        this.startMarkerVisible = false;
        this.raceMarkersVisible = false;

        this.raceStarted = false;

        this.raceStartHour = null;
        this.raceStartMinute = 0;
        this.raceEndHour = null;

        this.phoneMessageActive = false;
        this.phoneMessageDismissed = false;

        this.hidePhoneRaceMessage();
        this.hideJoinButton();
    }

    // --------------------------------------------------------
    // TIME FORMAT
    // --------------------------------------------------------

    formatHourMinute(hour, minute) {
        const suffix =
            hour >= 12
                ? "PM"
                : "AM";

        let displayHour =
            hour % 12;

        if (displayHour === 0) {
            displayHour = 12;
        }

        return (
            `${displayHour}:` +
            `${String(minute).padStart(2, "0")} ` +
            suffix
        );
    }

    formatTime(hourFloat) {
        const hour =
            Math.floor(hourFloat);

        const minute =
            Math.floor(
                (hourFloat - hour) * 60
            );

        return this.formatHourMinute(
            hour,
            minute
        );
    }
}


// ============================================================
// CREATE GLOBAL MANAGER
// ============================================================

window.raceEventManager =
    new RaceEventsManager();