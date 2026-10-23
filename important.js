// ===== GLOBAL CANVAS & STATE (Declared first so both files can use them!) =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
console.log("grapess");
// ============================================================
// VIEWPORT SYSTEM  (the single authority for game size/scale)
//
//   WORLD SPACE (4096 x 2286)
//        -> camera
//   LOGICAL VIEWPORT (GAME_WIDTH x GAME_HEIGHT)   <- what the player sees
//        -> one uniform scale (+ letterbox offset)
//   PHYSICAL SCREEN
//
// - #gameContainer is the logical stage. It is always GAME_WIDTH x
//   GAME_HEIGHT CSS pixels and is scaled/centred with a CSS transform,
//   so the canvas AND all gameplay DOM UI scale together.
// - canvas.width / canvas.height keep reporting the LOGICAL size to all
//   game code (camera, HUD, minimap, culling...). Only the hidden
//   backing-store resolution follows the physical size, for sharpness.
// - World coordinates and gameplay distances are never scaled.
// ============================================================
const GAME_WIDTH = 640;
const GAME_HEIGHT = 360;

// Backing-store sharpness only. Never affects how much world is visible.
// Touch devices keep 1:1 (same cost as before); desktops may use up to 2x.
const MAX_RENDER_DPR = 2;
const MAX_BACKING_WIDTH = 2560; // keeps hi-dpi desktops from allocating a huge canvas

const gameStage = document.getElementById('gameContainer');

const gameViewport = {
    scale: 1,       // logical px -> CSS px
    offsetX: 0,     // letterbox offset (CSS px)
    offsetY: 0,
    pixelScaleX: 1, // logical px -> canvas backing-store px
    pixelScaleY: 1
};

const setCanvasBackingSize = (function () {
    const nativeWidth = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    const nativeHeight = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');

    // Game code reads canvas.width/height as "screen size". Keep that
    // meaning logical, regardless of the real backing-store resolution.
    Object.defineProperty(canvas, 'width', { get: () => GAME_WIDTH, set() {}, configurable: true });
    Object.defineProperty(canvas, 'height', { get: () => GAME_HEIGHT, set() {}, configurable: true });

    return (w, h) => {
        nativeWidth.set.call(canvas, w);
        nativeHeight.set.call(canvas, h);
    };
})();

// Recalculate scale, letterbox offset and backing-store size from scratch.
function updateViewport() {
    const hostW = window.innerWidth;
    const hostH = window.innerHeight;
    if (!hostW || !hostH) return;

    const scale = Math.min(hostW / GAME_WIDTH, hostH / GAME_HEIGHT);
    const offsetX = Math.round((hostW - GAME_WIDTH * scale) / 2);
    const offsetY = Math.round((hostH - GAME_HEIGHT * scale) / 2);

    gameViewport.scale = scale;
    gameViewport.offsetX = offsetX;
    gameViewport.offsetY = offsetY;

    gameStage.style.width = GAME_WIDTH + 'px';
    gameStage.style.height = GAME_HEIGHT + 'px';
    gameStage.style.transform =
        'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';

    const isTouchDevice = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const dpr = isTouchDevice ? 1 : Math.max(1, Math.min(
        window.devicePixelRatio || 1,
        MAX_RENDER_DPR,
        MAX_BACKING_WIDTH / (GAME_WIDTH * scale)
    ));
    const backingW = Math.max(1, Math.round(GAME_WIDTH * scale * dpr));
    const backingH = Math.max(1, Math.round(GAME_HEIGHT * scale * dpr));

    if (backingW !== canvas.__backingW || backingH !== canvas.__backingH) {
        setCanvasBackingSize(backingW, backingH);
        canvas.__backingW = backingW;
        canvas.__backingH = backingH;
    }

    gameViewport.pixelScaleX = backingW / GAME_WIDTH;
    gameViewport.pixelScaleY = backingH / GAME_HEIGHT;
}

// Call at the start of every frame: maps logical coordinates onto the
// backing store. (Resizing the backing store resets the context state.)
function applyViewportTransform() {
    ctx.setTransform(gameViewport.pixelScaleX, 0, 0, gameViewport.pixelScaleY, 0, 0);
}

// Physical (client) coordinates -> logical gameplay coordinates.
// Uses the stage's live bounding rectangle, so letterbox offsets are exact.
function clientToLogical(clientX, clientY) {
    const rect = gameStage.getBoundingClientRect();
    const scale = rect.width / GAME_WIDTH || 1;
    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale
    };
}

updateViewport();

let gameActive = false;
let showFullMap = false;
let desktopControlsOpen = false;
let playerPhoneOpen = false;
// Full-map animation state
let fullMapAnimating = false;
let fullMapAnimationProgress = 0;
let fullMapAnimationFrom = 0;
let fullMapAnimationTo = 0;
let fullMapAnimationStartTime = 0;
let fullMapAnimationDuration = 350;

// ============================================================
// FIRST-PLAY OPENING CUTSCENE
// ============================================================

let openingCutsceneActive = false;

const openingCutscene = document.getElementById("openingCutscene");
const openingText = document.getElementById("openingText");

function openingShowText(text, className = "") {
    if (!openingText) return;

    openingText.className = "";
    openingText.textContent = text;

    if (className) {
        openingText.classList.add(className);
    }

    void openingText.offsetWidth;
    openingText.classList.add("show");
}

function openingClearText(callback) {
    if (!openingText) {
        if (callback) callback();
        return;
    }

    openingText.classList.remove("show");
    openingText.classList.add("fade");

    setTimeout(() => {
        openingText.className = "";
        openingText.textContent = "";

        if (callback) callback();
    }, 450);
}
// Function helpers to control the on-phone message overlay
function showPhoneCutsceneMessage(text) {
    const msgLayer = document.getElementById("phoneCutsceneMessage");
    const msgText = document.getElementById("phoneCutsceneMessageText");
    if (msgLayer && msgText) {
        const msgHeader = msgLayer.querySelector(".msg-header");
        if (msgHeader) msgHeader.textContent = "NEW MESSAGE";
        msgText.textContent = text;
        msgLayer.style.display = "flex";
    }
}

function hidePhoneCutsceneMessage() {
    const msgLayer = document.getElementById("phoneCutsceneMessage");
    if (msgLayer) {
        msgLayer.style.display = "none";
    }
}
function startOpeningCutscene() {
    if (!openingCutscene) {
        gameActive = true;
        return;
    }

    openingCutsceneActive = true;
    gameActive = false;
    showFullMap = false;
    fullMapAnimating = false;
    playerPhoneOpen = false;

    if (typeof closePlayerPhone === "function") {
        closePlayerPhone();
    }

    const gameContainer = document.getElementById("gameContainer");
    if (gameContainer) {
        gameContainer.classList.add("opening-cutscene");
    }

    openingCutscene.classList.add("active");
    openingCutscene.setAttribute("aria-hidden", "false");

    if (typeof resizeCanvas === "function") resizeCanvas();
    if (typeof drawGame === "function") drawGame();

    // Scene 1
    setTimeout(() => {
        openingShowText("So... this is it.");
    }, 900);

    // Scene 2
    setTimeout(() => {
        openingClearText(() => {
            openingShowText("A new city.");
        });
    }, 2600);

    // Scene 3
    setTimeout(() => {
        openingClearText(() => {
            openingShowText("A new start.");
        });
    }, 4200);

    // Scene 4: Need a job
    setTimeout(() => {
        openingClearText(() => {
            openingShowText("Just need a job.");
        });
    }, 5800);

    // Scene 5: Open Phone & Show Message Layer
    setTimeout(() => {
        openingClearText(() => {
            showPhoneCutsceneMessage("You said you were looking for work. Call me.");
            openPlayerPhone();
        });
    }, 7600);

   // Scene 6 — Title
setTimeout(() => {

    // Close the phone and remove its cutscene message.
    hidePhoneCutsceneMessage();

    if (typeof closePlayerPhone === "function") {
        closePlayerPhone();
    }

    // Fade the black title background in.
    openingCutscene.classList.add("title-screen");

    openingClearText(() => {

        openingShowText("STREETBOUND", "title");

    });

}, 10300); 

    // Scene 7: Subtitle
    setTimeout(() => {
        openingClearText(() => {
            openingShowText("Your life starts here.", "subtitle");
        });
    }, 12000);

    // Enter gameplay
    setTimeout(() => {
        finishOpeningCutscene();
    }, 13800);
}
function finishOpeningCutscene() {
        hidePhoneCutsceneMessage();

    if (typeof closePlayerPhone === "function") {
        closePlayerPhone();
    }

    openingCutsceneActive = false;
    gameActive = true;

    const gameContainer = document.getElementById("gameContainer");

    if (gameContainer) {
        gameContainer.classList.remove("opening-cutscene");
    }

    // Fade out the title black screen.
    if (openingCutscene) {
        openingCutscene.classList.remove("title-screen");
    }

    // Wait for the fade before removing the cutscene completely.
    setTimeout(() => {

        if (openingCutscene) {
            openingCutscene.classList.remove("active");
            openingCutscene.setAttribute("aria-hidden", "true");
        }

    }, 800);

    if (openingText) {
        openingText.className = "";
        openingText.textContent = "";
    }

    // Gameplay tips are delivered as scheduled phone messages
    // (see GAMEPLAY TIP SCHEDULER below).
    scheduleGameplayTips();

    if (typeof drawGame === "function") {
        drawGame();
    }
}
                     

// ============================================================
// PLAYER PHONE


const playerPhone = document.getElementById("playerPhone");

function canOpenPlayerPhone() {
    if (!playerPhone) return false;

    // Phone must never open over the full map.
    if (showFullMap) return false;

    // Phone must not open while the player is being transported
    // after arrest.
    if (player && player.isArrestPassenger) return false;

    return true;
}

function openPlayerPhone() {
    if (!canOpenPlayerPhone()) return false;
    if (!playerPhone) return false;

    // Cancel a closing animation if the phone is opened again quickly.
    if (window.playerPhoneCloseTimer) {
        clearTimeout(window.playerPhoneCloseTimer);
        window.playerPhoneCloseTimer = null;
    }

    playerPhoneOpen = true;

    // Opening the phone ALWAYS shows the normal home screen.
    resetPhoneToHome();

    // Reset animation state.
    playerPhone.classList.remove("phone-closing");
    playerPhone.classList.remove("phone-opening");

    // Force the browser to apply the reset before starting the animation.
    void playerPhone.offsetWidth;

    playerPhone.style.display = "block";
    playerPhone.classList.add("phone-opening");
    playerPhone.setAttribute("aria-hidden", "false");

    return true;
}

function closePlayerPhone() {
    if (!playerPhone) {
        playerPhoneOpen = false;
        return;
    }

    playerPhoneOpen = false;

    // Stop any previous animation.
    playerPhone.classList.remove("phone-opening");
    playerPhone.classList.remove("phone-closing");

    // Force the browser to reset the animation state.
    void playerPhone.offsetWidth;

    // Play the reverse/drop-out animation.
    playerPhone.classList.add("phone-closing");
    playerPhone.setAttribute("aria-hidden", "true");

    // Only hide it after the animation has finished.
    window.playerPhoneCloseTimer = setTimeout(() => {
        playerPhone.classList.remove("phone-closing");
        playerPhone.style.display = "none";
        window.playerPhoneCloseTimer = null;
    }, 280);
}



function togglePlayerPhone() {
    if (playerPhoneOpen) {
        closePlayerPhone();
        return;
    }

    openPlayerPhone();
}
function beginFullMapAnimation(targetProgress, duration) {
    fullMapAnimationFrom = fullMapAnimationProgress;
    fullMapAnimationTo = targetProgress;
    fullMapAnimationStartTime = performance.now();
    fullMapAnimationDuration = duration;
    fullMapAnimating = true;
}

function openFullMap() {
    if (showFullMap && !fullMapAnimating) return;

    if (playerPhoneOpen) {
        closePlayerPhone();
    }

    showFullMap = true;
    gameActive = false;

    beginFullMapAnimation(1, 350);
}

function closeFullMap() {
    if (!showFullMap && !fullMapAnimating) return;

    gameActive = false;

    beginFullMapAnimation(0, 280);
}

function toggleFullMap() {
    if (showFullMap || fullMapAnimating) {
        closeFullMap();
    } else {
        openFullMap();
    }
}
function openAmbulanceCallScreen() {
    const homeScreen = document.getElementById("phoneHomeScreen");
    const callScreen = document.getElementById("phoneCallScreen");
    const callIcon = document.querySelector(".phone-call-icon");
    const callName = document.querySelector(".phone-call-name");
    const ambulanceContact = document.getElementById("ambulanceContactButton");
    const callStatus = document.getElementById("phoneCallStatus");

    if (!homeScreen || !callScreen) return;

    homeScreen.style.display = "none";
    callScreen.style.display = "flex";

    if (callIcon) callIcon.textContent = "📇";
    if (callName) callName.textContent = "Contacts";
    if (ambulanceContact) ambulanceContact.style.display = "flex";
    if (callStatus) {
        callStatus.textContent = "Select a contact";
    }
}

function callAmbulance() {
    const homeScreen = document.getElementById("phoneHomeScreen");
    const callScreen = document.getElementById("phoneCallScreen");
    const callIcon = document.querySelector(".phone-call-icon");
    const callName = document.querySelector(".phone-call-name");
    const ambulanceContact = document.getElementById("ambulanceContactButton");
    const callStatus = document.getElementById("phoneCallStatus");

    if (!homeScreen || !callScreen) return;

    homeScreen.style.display = "none";
    callScreen.style.display = "flex";
    if (callIcon) callIcon.textContent = "🚑";
    if (callName) callName.textContent = "Ambulance";
    if (ambulanceContact) ambulanceContact.style.display = "none";
    if (callStatus) callStatus.textContent = "Calling ambulance...";

    // The call takes exactly 5 seconds.
    window.ambulanceCallTimer = setTimeout(() => {
        window.ambulanceCallTimer = null;

        const resolved = resolveNearbyHitRunIncidents();

        if (callStatus) {
            callStatus.textContent = resolved
                ? "Ambulance notified"
                : "No reportable accident nearby";
        }

        // Return to the opened Contacts app shortly after the call.
        setTimeout(() => {
            openAmbulanceCallScreen();
        }, 350);

    }, 5000);
}

function cancelAmbulanceCall() {
    if (window.ambulanceCallTimer) {
        clearTimeout(window.ambulanceCallTimer);
        window.ambulanceCallTimer = null;
    }

    const homeScreen = document.getElementById("phoneHomeScreen");
    const callScreen = document.getElementById("phoneCallScreen");

    if (callScreen) {
        callScreen.style.display = "none";
    }

    if (homeScreen) {
        homeScreen.style.display = "flex";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const callApp =
        document.getElementById("phoneCallApp");

    const ambulanceContact =
        document.getElementById("ambulanceContactButton");

    const phoneBackButton =
        document.getElementById("phoneBackButton");

    if (callApp) {
        callApp.addEventListener("pointerdown", e => {
            e.preventDefault();

            if (!playerPhoneOpen) return;

            openAmbulanceCallScreen();
        });
    }

    if (ambulanceContact) {
        ambulanceContact.addEventListener("pointerdown", e => {
            e.preventDefault();

            if (!playerPhoneOpen) return;

            callAmbulance();
        });
    }

    if (phoneBackButton) {
        phoneBackButton.addEventListener("pointerdown", e => {
            e.preventDefault();

            cancelAmbulanceCall();
        });
    }
});


// ============================================================
// PHONE MESSAGE SYSTEM
// ------------------------------------------------------------
// Single source of truth for every phone message (gameplay tips,
// race invitations, future story / job / NPC messages).
//
//   sendPhoneMessage(title, text, options)
//        -> phoneMessages.history  (oldest -> newest, in memory only)
//        -> Phone > Messages app (newest -> oldest, x = previous)
//
// options: { type: "normal" | "race", sound: true, notify: true }
//   type "race": x opens the existing Race Info screen instead of
//                the previous message, while the invitation is
//                still actionable (see isRaceInviteActionable).
// ============================================================

const PHONE_MESSAGE_SOUND_URL =
    "https://raw.githubusercontent.com/divanshu911/My-game-assets/e8ed68b9d44fbea3886c7a39773340219bac8517/message.mp3";

const phoneMessages = {
    history: [],        // oldest -> newest. Never deleted by the x button.
    nextId: 1,
    cursor: -1,         // index of the message being viewed
    mode: "closed"      // "closed" | "message" | "raceInfo" | "caughtUp"
};

function phoneEl(id) {
    return document.getElementById(id);
}

function sendPhoneMessage(title, text, options) {
    const opts = options || {};

    const message = {
        id: phoneMessages.nextId++,
        title: title,
        text: text,
        type: opts.type || "normal",
        seen: false,
        retired: false
    };

    phoneMessages.history.push(message);

    // Sound plays on RECEIVING the message, never when viewing it.
    if (opts.sound !== false) {
        try {
            const sound = new Audio(PHONE_MESSAGE_SOUND_URL);
            sound.volume = 1.0;
            sound.play().catch(() => {});
        } catch (e) {}
    }

    // HUD notice only. Never opens the phone or the Messages app.
    if (opts.notify !== false && typeof taxiManager !== "undefined" && taxiManager.setMessage) {
        taxiManager.setMessage("You received a message (swipe down to view)", 180);
    }

    updateMessagesBadge();

    // Phone already open on the Messages app: keep the viewer position,
    // the new message is simply the next "newest" the next time it opens.
    return message;
}

function getUnreadMessageCount() {
    return phoneMessages.history.filter(m => !m.seen).length;
}

function updateMessagesBadge() {
    const badge = phoneEl("phoneMessagesBadge");
    if (!badge) return;

    const unread = getUnreadMessageCount();
    badge.textContent = unread > 9 ? "9+" : String(unread);
    badge.style.display = unread > 0 ? "flex" : "none";
}

function isRaceInviteActionable(message) {
    return !!(
        message &&
        message.type === "race" &&
        !message.retired &&
        typeof raceEventManager !== "undefined" &&
        raceEventManager &&
        raceEventManager.state === "SCHEDULED" &&
        !raceEventManager.startMarkerEnabled
    );
}

function setPhoneMessagesSubScreens(viewer, caughtUp, raceInfo) {
    const layer = phoneEl("phoneCutsceneMessage");
    const caught = phoneEl("phoneMessagesCaughtUp");
    const info = phoneEl("phoneRaceInfoScreen");

    if (layer) layer.style.display = viewer ? "flex" : "none";
    if (caught) caught.style.display = caughtUp ? "flex" : "none";
    if (info) info.style.display = raceInfo ? "flex" : "none";
}

function showMessageAt(index) {
    const message = phoneMessages.history[index];
    if (!message) {
        showMessagesCaughtUp();
        return;
    }

    phoneMessages.cursor = index;
    phoneMessages.mode = "message";
    message.seen = true;

    const header = document.querySelector("#phoneCutsceneMessage .msg-header");
    const body = phoneEl("phoneCutsceneMessageText");
    if (header) header.textContent = message.title;
    if (body) body.textContent = message.text;

    setPhoneMessagesSubScreens(true, false, false);
    updateMessagesBadge();
}

function showPreviousMessage() {
    const previous = phoneMessages.cursor - 1;

    if (previous >= 0) {
        showMessageAt(previous);
    } else {
        showMessagesCaughtUp();
    }
}

function showMessagesCaughtUp() {
    phoneMessages.mode = "caughtUp";
    phoneMessages.cursor = -1;
    setPhoneMessagesSubScreens(false, true, false);
    updateMessagesBadge();
}

function openMessagesApp() {
    const home = phoneEl("phoneHomeScreen");
    if (home) home.style.display = "none";

    // Always start from the newest message (deterministic).
    if (phoneMessages.history.length > 0) {
        showMessageAt(phoneMessages.history.length - 1);
    } else {
        showMessagesCaughtUp();
    }
}

function closeMessagesApp() {
    resetPhoneToHome(true);
}

// x button on the message viewer.
function dismissCurrentMessage() {
    if (phoneMessages.mode !== "message") return;

    const message = phoneMessages.history[phoneMessages.cursor];

    if (isRaceInviteActionable(message)) {
        // Special case: race invitation -> EXISTING Race Info screen.
        raceEventManager.dismissPhoneRaceMessage();
        phoneMessages.mode = "raceInfo";
        return;
    }

    showPreviousMessage();
}

// Called by the race manager's ACCEPT button after its own logic ran.
function returnFromRaceInfo() {
    if (phoneMessages.mode !== "raceInfo") {
        setPhoneMessagesSubScreens(false, false, false);
        return false;
    }

    setPhoneMessagesSubScreens(false, false, false);
    showPreviousMessage();
    return true;
}

// The race is no longer actionable (started / finished / reset):
// the invitation stays in history but behaves like a normal message.
function retireRaceMessages() {
    let viewing = null;

    phoneMessages.history.forEach((m, i) => {
        if (m.type === "race" && !m.retired) {
            m.retired = true;
            if (i === phoneMessages.cursor) viewing = m;
        }
    });

    if (phoneMessages.mode === "raceInfo") {
        // Race Info no longer valid: continue with the previous message.
        returnFromRaceInfo();
    }
    return viewing;
}

// Always puts the phone on its home screen.
function resetPhoneToHome(force) {
    // The opening cutscene drives the phone/message layer itself.
    if (openingCutsceneActive && !force) return;

    if (phoneMessages.mode === "closed" && !force) return;

    phoneMessages.mode = "closed";
    phoneMessages.cursor = -1;
    setPhoneMessagesSubScreens(false, false, false);

    const home = phoneEl("phoneHomeScreen");
    if (home) home.style.display = "flex";
}

document.addEventListener("DOMContentLoaded", () => {
    const messagesApp = phoneEl("phoneMessagesApp");
    const messageClose = phoneEl("phoneCutsceneMessageClose");
    const caughtUpBack = phoneEl("phoneMessagesCaughtUpBack");

    if (messagesApp) {
        messagesApp.addEventListener("pointerdown", e => {
            e.preventDefault();
            if (!playerPhoneOpen || openingCutsceneActive) return;
            openMessagesApp();
        });
    }

    if (messageClose) {
        messageClose.addEventListener("pointerdown", e => {
            e.preventDefault();
            if (openingCutsceneActive) return;
            dismissCurrentMessage();
        });
    }

    if (caughtUpBack) {
        caughtUpBack.addEventListener("pointerdown", e => {
            e.preventDefault();
            closeMessagesApp();
        });
    }

    updateMessagesBadge();
});


// ============================================================
// GAMEPLAY TIP SCHEDULER
// Each tip is delivered as a phone message at a random in-game
// hour (game clock, NOT real time). Hours are unique per tip and
// avoid the race-invitation window (race hour - 2 .. race hour).
// The desktop-controls tip is NOT part of this list.
// ============================================================

const GAMEPLAY_TIPS = [
    { title: "Tip", text: "You can sell stolen cars at blackmarket." },
    { title: "Tip", text: "Open minimap to see locations on map." }
    // Add future tips here; they are scheduled automatically.
];

const gameplayTipScheduler = {
    started: false,
    dayCount: 0,        // in-game midnights passed since scheduling
    lastHour: 0,
    pending: []         // { tip, absHour, delayedLogged }
};

function getCurrentGameHour() {
    return (gameSeconds / DAY_LENGTH) * 24;
}

function getTipRaceHour() {
    if (typeof raceEventManager === "undefined" || !raceEventManager) return null;

    if (raceEventManager.raceStartHour !== null && raceEventManager.raceStartHour !== undefined) {
        return raceEventManager.raceStartHour;
    }

    if (typeof raceEventManager.loadSavedRaceTime === "function") {
        const saved = raceEventManager.loadSavedRaceTime();
        if (saved) return saved.hour;
    }

    return null;
}

function isRaceInvitationWindowNow() {
    if (typeof raceEventManager === "undefined" || !raceEventManager) return false;
    if (raceEventManager.state !== "SCHEDULED") return false;
    if (typeof raceEventManager.getHoursUntilRace !== "function") return false;

    const until = raceEventManager.getHoursUntilRace(getCurrentGameHour());
    return until > 0 && until <= 2;
}

function formatTipHour(absHour) {
    const hourOfDay = ((absHour % 24) + 24) % 24;
    const label = String(hourOfDay).padStart(2, "0") + ":00";
    return absHour >= 24 ? label + " (next day)" : label;
}

function scheduleGameplayTips() {
    if (gameplayTipScheduler.started) return;
    gameplayTipScheduler.started = true;

    gameplayTipScheduler.dayCount = 0;
    gameplayTipScheduler.lastHour = getCurrentGameHour();

    const firstHour = Math.floor(getCurrentGameHour()) + 1;
    const raceHour = getTipRaceHour();

    // Candidate hours: the next 24 whole in-game hours.
    let candidates = [];
    for (let h = firstHour; h < firstHour + 24; h++) {
        // Race conflicts only known for today's race (day 0).
        if (raceHour !== null && h < 24 && h >= raceHour - 2 && h <= raceHour) continue;
        candidates.push(h);
    }

    GAMEPLAY_TIPS.forEach(tip => {
        if (candidates.length === 0) return;

        const pick = Math.floor(Math.random() * candidates.length);
        const absHour = candidates.splice(pick, 1)[0];

        gameplayTipScheduler.pending.push({ tip: tip, absHour: absHour, delayedLogged: false });

        console.log(`[Gameplay Tips] "${tip.title}" scheduled for ${formatTipHour(absHour)}`);
    });
}

function tickGameplayTips() {
    const sched = gameplayTipScheduler;
    if (!sched.started || sched.pending.length === 0) return;

    const hour = getCurrentGameHour();

    // Midnight rollover (gameSeconds wraps to 0).
    if (hour < sched.lastHour) sched.dayCount++;
    sched.lastHour = hour;

    const now = sched.dayCount * 24 + hour;

    for (let i = 0; i < sched.pending.length; i++) {
        const entry = sched.pending[i];
        if (now < entry.absHour) continue;

        // Never collide with a race invitation: wait until it passes.
        if (isRaceInvitationWindowNow()) {
            if (!entry.delayedLogged) {
                entry.delayedLogged = true;
                console.log(`[Gameplay Tips] "${entry.tip.title}" delayed (race invitation window)`);
            }
            return;
        }

        sched.pending.splice(i, 1);
        sendPhoneMessage(entry.tip.title, entry.tip.text, { type: "normal" });
        console.log(`[Gameplay Tips] "${entry.tip.title}" delivered at ${formatTipHour(Math.floor(now))}`);
        return; // one message per tick
    }
}


// ===== DAY / NIGHT SYSTEM =====
let lastTimeSave = 0;
let nightMusicPlaying = false;

const DAY_LENGTH = 15 * 60; 

const savedGameTime = localStorage.getItem("gameTime"); let gameSeconds = (savedGameTime === null) ? (DAY_LENGTH * 0.625) : Number(savedGameTime); if (isNaN(gameSeconds)) { gameSeconds = DAY_LENGTH * 0.625; }

let ambientBrightness = 1;
let skyColor = "rgba(0,0,0,0)";

function updateDayNight(dt){
   gameSeconds += dt / 60;

   if (gameSeconds >= DAY_LENGTH) {
       gameSeconds = 0;
   }

   if (typeof tickGameplayTips === "function") tickGameplayTips();

   const t = gameSeconds / DAY_LENGTH;

   // Save game time only every 5 in-game seconds
   if (gameSeconds - lastTimeSave >= 5 || gameSeconds < lastTimeSave) {
       lastTimeSave = gameSeconds;
       localStorage.setItem("gameTime", gameSeconds);
   }

   const hour = t * 24;
   let darkness = 0;
    // ============================================================
// BUILDING LIGHT SCHEDULE
// 20:00 -> lights begin turning ON
// 05:00 -> lights begin turning OFF
// ============================================================

// After 6 AM, force every building light OFF.
if (hour >= 6 && hour < 20) {
    const lights = window.buildingLightShapes || [];

    for (let i = 0; i < lights.length; i++) {
        lights[i].enabled = false;
    }

    buildingLightsMode = "day";
    buildingLightsSequenceIndex = 0;
}

// Start turning building lights ON at 8 PM.
if (hour >= 20 && buildingLightsMode === "day") {
    startBuildingLightsOn();
}

if (hour >= 5 && hour < 6 && buildingLightsMode === "night") {
    startBuildingLightsOff();
}

if (hour >= 5 && hour < 20 && buildingLightsMode === "turningOn") {
    // Safety reset if the game somehow jumps past the night period.
    buildingLightsMode = "night";
}

if (hour >= 20 || hour < 5) {
    updateBuildingLightSequence();
}

  
    // --- DYNAMIC TOW / RACE BUTTON VISIBILITY ---
    if (
        typeof towTruckBtn !== 'undefined' &&
        towTruckBtn
    ) {
        if (
            typeof raceEventManager !== "undefined" &&
            raceEventManager &&
            raceEventManager.state === "RACING" &&
            raceEventManager.playerJoined &&
            !raceEventManager.playerLeftRace
        ) {
            towTruckBtn.innerText = "LEAVE RACE";
            towTruckBtn.style.display = "flex";
        } else {
            towTruckBtn.innerText = "TOW ($250)";

            if (
                typeof playerCar !== "undefined" &&
                playerCar
            ) {
                towTruckBtn.style.display = "flex";
            } else {
                towTruckBtn.style.display = "none";
            }
        }
    }

   // --- ADJUSTED FOR DARKER, DEEPER NIGHTS ---
   if(hour < 5){
       darkness = 0.53;
       skyColor = "rgba(5, 10, 30, 0.6)";
   } else if(hour < 7){
       let k=(hour-5)/2;
       darkness = 0.53 * (1 - k);
       skyColor = `rgba(${5 + 195*k}, ${10 + 120*k}, ${30*(1-k) + 80*k}, ${0.6 * (1-k)})`;
   } else if(hour < 18){
       darkness = 0;
       skyColor = "rgba(0,0,0,0)";
   } else if(hour < 20){
       let k=(hour-18)/2;
       darkness = 0.53 * k;
       skyColor = `rgba(${200 * (1-k) + 5*k}, ${120 * (1-k) + 10*k}, ${80 * (1-k) + 30*k}, ${0.6 * k})`;
   } else{
       darkness = 0.53;
       skyColor = "rgba(5, 10, 30, 0.6)";
   }

   ambientBrightness = 1 - darkness;

   if (ambientBrightness < 0.75) {
       if (typeof bgMusic !== 'undefined' && !nightMusicPlaying) {
           bgMusic.loop = true;
           bgMusic.play();
           nightMusicPlaying = true;
       }
   } else {
       if (typeof bgMusic !== 'undefined' && nightMusicPlaying) {
           bgMusic.pause();
           bgMusic.currentTime = 0;
           nightMusicPlaying = false;
       }
   }

  // --- DAILY RENT LOGIC ($80 at 5:30 AM) ---
   if (hour < 5 || hour > 6) {
       if (typeof rentPaidForDayCycle !== 'undefined') rentPaidForDayCycle = false;
   } else if (hour >= 5.5 && hour <= 6.0 && typeof rentPaidForDayCycle !== 'undefined' && !rentPaidForDayCycle) {
       if (typeof player !== 'undefined') {
           if (player.isEvicted) {
               // Already evicted — skip rent entirely
           } else if (player.rentDebtActive) {
               // Had unpaid debt from yesterday â†’ evict now
               player.isEvicted = true;
               if (typeof isInsideHouse !== 'undefined' && isInsideHouse) {
                   isInsideHouse = false;
                   player.x = outsideX;
                   player.y = outsideY;
                   player.size = 20;
                   if (typeof exitHomeBtn !== 'undefined') exitHomeBtn.style.display = 'none';
                   if (typeof sleepBtn !== 'undefined') sleepBtn.style.display = 'none';
               }
               if (typeof taxiManager !== 'undefined') taxiManager.setMessage("You've been evicted! Visit the house with $80 to rent it again.", 360);
           } else {
               player.money -= 80;
               localStorage.setItem("gma_player_money", player.money);
               if (player.money < 0) {
                   player.rentDebtActive = true;
                   if (typeof taxiManager !== 'undefined') taxiManager.setMessage("House rent due! Clear your debt before tomorrow.", 300);
               } else {
                   if (typeof taxiManager !== 'undefined') taxiManager.setMessage("Paid Daily House Rent: $80", 240);
               }
           }
       }
       rentPaidForDayCycle = true;
   }
} 

function drawNightOverlay() {
    if (ambientBrightness >= 0.999) return;

    ctx.save();

    const lights = window.buildingLightShapes || [];

    const cameraTarget =
        player.isArrestPassenger && arrestTransportCar
            ? arrestTransportCar
            : player;

    const cameraX =
        cameraTarget.x +
        (cameraTarget.size || player.size) / 2;

    const cameraY =
        cameraTarget.y +
        (cameraTarget.size || player.size) / 2;

    const cosA = Math.cos(camera.angle);
    const sinA = Math.sin(camera.angle);

    const screenCenterX = canvas.width * 0.5;
    const screenCenterY = canvas.height * 0.5;

    function worldToScreen(x, y) {
        const dx = x - cameraX;
        const dy = y - cameraY;

        return {
            x: screenCenterX + dx * cosA + dy * sinA,
            y: screenCenterY - dx * sinA + dy * cosA
        };
    }

    /*
     * ---------------------------------------------------------
     * FULL NIGHT OVERLAY
     * ---------------------------------------------------------
     *
     * The darkness is always drawn first.
     * Lights are added on top.
     */
    ctx.fillStyle = skyColor;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle =
        `rgba(0,0,20,${1 - ambientBrightness})`;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    if (
    lights.length === 0 ||
    ambientBrightness >= 0.75 ||
    buildingLightsMode === "day"
) {
    ctx.restore();
    return;
    }

    function isLightInViewport(light) {
        const startScreen = worldToScreen(light.x, light.y);
        const endScreen = worldToScreen(
            light.x + light.nx * light.length * 0.82,
            light.y + light.ny * light.length * 0.82
        );
        const glowMargin = Math.max(35, light.baseWidth * 1.8) + 12;
        const minX = Math.min(startScreen.x, endScreen.x) - glowMargin;
        const maxX = Math.max(startScreen.x, endScreen.x) + glowMargin;
        const minY = Math.min(startScreen.y, endScreen.y) - glowMargin;
        const maxY = Math.max(startScreen.y, endScreen.y) + glowMargin;

        return !(
            maxX < 0 ||
            minX > canvas.width ||
            maxY < 0 ||
            minY > canvas.height
        );
    }

     function drawLightBeam(light) {
    const length = light.length * 0.82;
    const px = -light.ny;
    const py = light.nx;

    const startWidth = light.baseWidth * 0.38;
    const endWidth = light.baseWidth * 1.15;

    const startHalf = startWidth * 0.5;
    const endHalf = endWidth * 0.5;

    const startX = light.x;
    const startY = light.y;

    const endX = light.x + light.nx * length;
    const endY = light.y + light.ny * length;

    const startLeft = worldToScreen(
        startX + px * startHalf,
        startY + py * startHalf
    );

    const startRight = worldToScreen(
        startX - px * startHalf,
        startY - py * startHalf
    );

    const endLeft = worldToScreen(
        endX + px * endHalf,
        endY + py * endHalf
    );

    const endRight = worldToScreen(
        endX - px * endHalf,
        endY - py * endHalf
    );

    /*
     * -----------------------------------------------------
     * MAIN BEAM (High origin brightness fading outward)
     * -----------------------------------------------------
     */
    // Ray-based occlusion (see OBJLIGHT): when cars / NPCs / the player /
    // buildings cut some rays short, the beam is clipped to the ray fan so no
    // light spills behind the blocker. Unobstructed beams keep the old shape.
    const fan =
        (light._ol && light._olFrame === OBJLIGHT.frame) ? light._ol.fan : null;
    const useFan = !!(fan && fan.shortened);

    ctx.save();
    ctx.beginPath();

         if (useFan) {
             const n = fan.n;

             const originPoint = i =>
                 worldToScreen(fan.ox[i], fan.oy[i]);

             const endPoint = i =>
                 worldToScreen(
                     fan.ox[i] + fan.dx[i] * fan.lens[i],
                     fan.oy[i] + fan.dy[i] * fan.lens[i]
                 );

             if (n <= 2) {
                 for (let i = 0; i < n; i++) {
                     const p = originPoint(i);

                     if (i === 0) {
                         ctx.moveTo(p.x, p.y);
                     } else {
                         ctx.lineTo(p.x, p.y);
                     }
                 }

                 for (let i = n - 1; i >= 0; i--) {
                     const p = endPoint(i);
                     ctx.lineTo(p.x, p.y);
                 }
             } else {
                 // Start along the source edge.
                 let p = originPoint(0);
                 ctx.moveTo(p.x, p.y);

                 for (let i = 1; i < n - 1; i++) {
                     const control = originPoint(i);
                     const next = originPoint(i + 1);

                     ctx.quadraticCurveTo(
                         control.x,
                         control.y,
                         (control.x + next.x) * 0.5,
                         (control.y + next.y) * 0.5
                     );
                 }

                 p = originPoint(n - 1);
                 ctx.lineTo(p.x, p.y);

                 // Join the source edge to the clipped far edge.
                 p = endPoint(n - 1);
                 ctx.lineTo(p.x, p.y);

                 // Smooth the actual clipped boundary, working backwards.
                 for (let i = n - 2; i > 0; i--) {
                     const control = endPoint(i);
                     const next = endPoint(i - 1);

                     ctx.quadraticCurveTo(
                         control.x,
                         control.y,
                         (control.x + next.x) * 0.5,
                         (control.y + next.y) * 0.5
                     );
                 }

                 p = endPoint(0);
                 ctx.lineTo(p.x, p.y);
             }
         } else {
        ctx.moveTo(startLeft.x, startLeft.y);
        ctx.lineTo(endLeft.x, endLeft.y);
        ctx.lineTo(endRight.x, endRight.y);
        ctx.lineTo(startRight.x, startRight.y);
    }
    ctx.closePath();
    ctx.clip();

    // The overlay is rendered in screen space, so the gradient must use the
    // transformed screen endpoints rather than fixed world coordinates.
    const gradient = ctx.createLinearGradient(
        startLeft.x,
        startLeft.y,
        endLeft.x,
        endLeft.y
    );

    // High brightness near the origin point
    gradient.addColorStop(0, "rgba(255, 230, 110, 0.75)");
    gradient.addColorStop(0.15, "rgba(255, 230, 110, 0.55)");
    gradient.addColorStop(0.30, "rgba(255, 232, 125, 0.35)");
    gradient.addColorStop(0.50, "rgba(255, 235, 140, 0.20)");
    gradient.addColorStop(0.70, "rgba(255, 238, 155, 0.10)");
    gradient.addColorStop(0.85, "rgba(255, 240, 165, 0.04)");
    gradient.addColorStop(1, "rgba(255, 245, 170, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    /*
     * -----------------------------------------------------
     * EXPANDED SOFT END BLUR
     * -----------------------------------------------------
     */
    // No far-end glow when the middle of the beam is blocked.
    const endBlocked = useFan && fan.lens[fan.n >> 1] < length - 0.5;

    if (!endBlocked) {
    ctx.save();
    const endScreen = worldToScreen(endX, endY);
    
    // Increased blur radius and opacity for stronger end diffusion
    const blurRadius = Math.max(35, light.baseWidth * 1.8);

    const endGlow = ctx.createRadialGradient(
        endScreen.x,
        endScreen.y,
        0,
        endScreen.x,
        endScreen.y,
        blurRadius
    );

    endGlow.addColorStop(0, "rgba(255, 235, 140, 0.35)");
    endGlow.addColorStop(0.40, "rgba(255, 235, 140, 0.18)");
    endGlow.addColorStop(0.75, "rgba(255, 235, 140, 0.05)");
    endGlow.addColorStop(1, "rgba(255, 235, 140, 0)");

    ctx.fillStyle = endGlow;
    ctx.beginPath();
    ctx.arc(
        endScreen.x,
        endScreen.y,
        blurRadius,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
    }
}

    /*
     * DRAW LIGHTS — visit only chunks near the visible viewport.
     */

    const viewportCorners = [
        [0, 0],
        [canvas.width, 0],
        [0, canvas.height],
        [canvas.width, canvas.height]
    ];

    let worldMinX = Infinity;
    let worldMinY = Infinity;
    let worldMaxX = -Infinity;
    let worldMaxY = -Infinity;

    // Convert the four screen corners into world coordinates.
    for (let i = 0; i < viewportCorners.length; i++) {
        const sx = viewportCorners[i][0] - screenCenterX;
        const sy = viewportCorners[i][1] - screenCenterY;

        const worldX = cameraX + sx * cosA - sy * sinA;
        const worldY = cameraY + sx * sinA + sy * cosA;

        worldMinX = Math.min(worldMinX, worldX);
        worldMinY = Math.min(worldMinY, worldY);
        worldMaxX = Math.max(worldMaxX, worldX);
        worldMaxY = Math.max(worldMaxY, worldY);
    }

    // Include room for beams and glow extending in from off-screen.
    const padding = 180;

    worldMinX -= padding;
    worldMinY -= padding;
    worldMaxX += padding;
    worldMaxY += padding;

    const chunks = window.buildingLightChunks;

    if (chunks && chunks.size) {
        for (const chunk of chunks.values()) {
            // Skip entire chunks outside the expanded viewport.
            if (
                chunk.maxX < worldMinX ||
                chunk.minX > worldMaxX ||
                chunk.maxY < worldMinY ||
                chunk.minY > worldMaxY
            ) {
                continue;
            }

            for (let i = 0; i < chunk.lights.length; i++) {
                const light = chunk.lights[i];

                if (!light.enabled) continue;
                if (!isLightInViewport(light)) continue;

                drawLightBeam(light);
            }
        }
        } else {
        // Fallback if chunks haven't been generated yet.
        console.log(
            "[Building Lights] Chunk data unavailable; using full light scan."
        );

        for (let i = 0; i < lights.length; i++) {
            const light = lights[i];

            if (!light.enabled) continue;
            if (!isLightInViewport(light)) continue;

            drawLightBeam(light);
        }
    }
    ctx.restore();
}
                     
function drawClock(){
    const totalMinutes=Math.floor(gameSeconds/DAY_LENGTH*24*60);
    const h=Math.floor(totalMinutes/60);
    const m=totalMinutes%60;

    ctx.save();
    ctx.fillStyle="rgba(0,0,0,.65)";
    const clockX = canvas.width - 625;
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

// --- 2. START BUTTON LOGIC ---

const startBtn = document.getElementById('startButton');
const startScreen = document.getElementById('startScreen');

// Loading requirements
let mapAssetLoaded = false;
let collisionMapAssetLoaded = false;
let loadingDelayFinished = false;

const hasPlayedBefore =
    localStorage.getItem("gma_has_played") === "true";

const loadingDelay = hasPlayedBefore ? 4000 : 8690;

startBtn.disabled = true;
startBtn.textContent = "Loading...";

// ----------------------------------------------------
// Enable START only when EVERYTHING is ready
// ----------------------------------------------------
function tryEnableStartButton() {

    if (
        mapAssetLoaded &&
        collisionMapAssetLoaded &&
        loadingDelayFinished
    ) {
        startBtn.disabled = false;
        startBtn.textContent = "START GAME";

        
    }
}

// Minimum loading time
setTimeout(() => {

    loadingDelayFinished = true;

    tryEnableStartButton();

}, loadingDelay);


// ----------------------------------------------------
// START GAME
// ----------------------------------------------------
startBtn.addEventListener('click', () => {

    if (startBtn.disabled) return;

    startScreen.style.display = 'none';

    const docEl = document.documentElement;

    if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => {});
    } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
    }

    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(err => {
            console.warn(
                "Landscape lock request denied or not supported on this device."
            );
        });
    }

    resizeCanvas();

    showFullMap = false;

    /*
     * hasPlayedBefore was calculated when the loading screen
     * initialized, so this remains true only for the first
     * actual play.
     */
    if (!hasPlayedBefore) {

        // Freeze the actual game during the introduction.
        gameActive = false;

        // Mark the game as played immediately so refreshing
        // during the introduction does not make it play again.
        localStorage.setItem("gma_has_played", "true");

        startOpeningCutscene();

        return;
    }

    // ========================================================
    // RETURNING PLAYER — NORMAL GAME START
    // ========================================================

    gameActive = true;

    if (typeof taxiManager !== 'undefined') {
        taxiManager.setMessage(
            "Tap SPACE for desktop controls",
            300
        );
    }

    // Gameplay tips (phone / minimap) are now scheduled phone messages.
    // The desktop-controls tip above intentionally stays a direct HUD message.
    scheduleGameplayTips();

    localStorage.setItem("gma_has_played", "true");
});
// --- 3. DYNAMIC RESIZE FUNCTION ---

function resizeCanvas() {
  updateViewport();
  if (
    (gameActive || showFullMap || fullMapAnimating) &&
    typeof drawGame !== 'undefined'
) {
    drawGame();
}
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas(); 

// ===== 4. MAP & COLLISION DETECTORS =====
const mapImage = new Image();
mapImage.crossOrigin = "Anonymous"; 
window.mapImage = mapImage; // Export safely to window global namespace

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');
let mapWidth = 0;
let mapHeight = 0;
let collisionData = null;

// Helper: Evaluates pixel color against terrain rules
function getTerrainType(r, g, b) {
    // 1. Explicitly Blocked Colors
    // Black / near black
    if (r < 30 && g < 30 && b < 30) return "BLOCKED";

    // Light Green with Yellow Accent
    if (g > 150 && r > 120 && b < 100 && (g - b) > 50) return "BLOCKED";

    // Yellow
    if (r > 150 && g > 140 && (r - b) > 50 && (g - b) > 50) return "BLOCKED";

    // Non-walkable Blue River
    if (b > r + 20 && b > g + 10) return "BLOCKED";

    // 2. Walkable Surfaces
    // Light Grey Road
if (
    Math.abs(r - g) < 20 &&
    Math.abs(g - b) < 20 &&
    r >= 90 &&
    r <= 130
) return "ROAD";

    // White Road
    if (r > 220 && g > 220 && b > 220) return "ROAD";

    // Dark Green Grass
    if (g > r + 10 && g > b + 10 && g < 160) return "GRASS";

    // Transition Edges (neutral grey edge transitions between surfaces)
    if (Math.abs(r - g) < 65 && Math.abs(g - b) < 65 && Math.abs(r - b) < 65) return "TRANSITION";

    return "BLOCKED";
}

function isGrassOrRoad(x, y) {
    if (!collisionData || mapWidth === 0) return true;

    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}

function isWalkableColor(nextX, nextY, entitySize = 24) {
    const currentMapWidth = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseMapWidth : mapWidth;
    const currentMapHeight = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseMapHeight : mapHeight;
    const data = (typeof isInsideHouse !== 'undefined' && isInsideHouse) ? houseCollisionData : collisionData;

    if (!data || currentMapWidth === 0) return false;

    let checkX = Math.floor(nextX + entitySize / 2);
    let checkY = Math.floor(nextY + entitySize / 2);
    if (checkX < 0 || checkX >= currentMapWidth || checkY < 0 || checkY >= currentMapHeight) return false;

    const index = (checkY * currentMapWidth + checkX) * 4;
    const type = getTerrainType(data[index], data[index + 1], data[index + 2]);

    if (!(type === "ROAD" || type === "GRASS" || type === "TRANSITION")) {
        return false;
    }

    // Intact police roadblock barricades block pedestrians on foot.
    if (
        typeof isRoadblockBlocking === "function" &&
        isRoadblockBlocking(checkX, checkY)
    ) {
        return false;
    }

    return true;
}

// --- ROAD DETECTION CONTROLLERS ---
function isRoadColor(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD";
}


function isPlayerCarWalkable(x, y, car = null) {
    if (!collisionData || mapWidth === 0) return false;

    function isWalkableAt(px, py) {
        const checkX = Math.floor(px);
        const checkY = Math.floor(py);

        if (
            checkX < 0 || checkX >= mapWidth ||
            checkY < 0 || checkY >= mapHeight
        ) {
            return false;
        }

        const index = (checkY * mapWidth + checkX) * 4;
        const type = getTerrainType(
            collisionData[index],
            collisionData[index + 1],
            collisionData[index + 2]
        );

        return (
            type === "ROAD" ||
            type === "GRASS" ||
            type === "TRANSITION"
        );
    }

    // Preserve the original point check for non-vehicle callers.
    if (!car || !Number.isFinite(car.angle)) {
        return isWalkableAt(x, y);
    }

    // Sample the vehicle's footprint instead of checking only its center.
    const halfLength = Math.max(5, (car.length || 28) * 0.35);
    const halfWidth = Math.max(5, (car.width || 16) * 0.35);

    const heading = car.angle - Math.PI / 2;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const sx = -fy;
    const sy = fx;

    // Check the four corners and the midpoint of each side.
    for (let forwardSign of [-1, 1]) {
        for (let sideSign of [-1, 1]) {
            const px =
                x + fx * halfLength * forwardSign +
                sx * halfWidth * sideSign;
            const py =
                y + fy * halfLength * forwardSign +
                sy * halfWidth * sideSign;

            if (!isWalkableAt(px, py)) return false;
        }

        const px = x + fx * halfLength * forwardSign;
        const py = y + fy * halfLength * forwardSign;

        if (!isWalkableAt(px, py)) return false;
    }

    for (let sideSign of [-1, 1]) {
        const px = x + sx * halfWidth * sideSign;
        const py = y + sy * halfWidth * sideSign;

        if (!isWalkableAt(px, py)) return false;
    }

    return isWalkableAt(x, y);
}

function isAICarWalkable(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    let checkX = Math.floor(x);
    let checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    if (!(type === "ROAD" || type === "TRANSITION")) {
        return false;
    }

    // Civilian / AI traffic treats intact barricades as impassable.
    if (
        typeof isRoadblockBlocking === "function" &&
        isRoadblockBlocking(checkX, checkY)
    ) {
        return false;
    }

    return true;
}

function isStrictRoadColor(x, y) {
    return isRoadColor(x, y);
}

function getRandomRoadPosition() {
    let attempts = 0;

    // Require enough road around the spawn point so NPCs/cars
    // don't spawn on building/river edges.
    const spawnRadius = 12;

    while (attempts < 3000) {
        const x = Math.floor(Math.random() * mapWidth);
        const y = Math.floor(Math.random() * mapHeight);
        attempts++;

        if (
            isRoadColor(x, y) &&
            isRoadColor(x - spawnRadius, y) &&
            isRoadColor(x + spawnRadius, y) &&
            isRoadColor(x, y - spawnRadius) &&
            isRoadColor(x, y + spawnRadius) &&
            isRoadColor(x - spawnRadius, y - spawnRadius) &&
            isRoadColor(x + spawnRadius, y - spawnRadius) &&
            isRoadColor(x - spawnRadius, y + spawnRadius) &&
            isRoadColor(x + spawnRadius, y + spawnRadius)
        ) {
            return { x, y };
        }
    }

    // Fallback: preserve the old behavior if a safe position
    // cannot be found after many attempts.
    for (let i = 0; i < 3000; i++) {
        const x = Math.floor(Math.random() * mapWidth);
        const y = Math.floor(Math.random() * mapHeight);

        if (isRoadColor(x, y)) {
            return { x, y };
        }
    }

    return {
        x: Math.floor(mapWidth / 2),
        y: Math.floor(mapHeight / 2)
    };
}

function getRandomStrictRoadPosition() {
    return getRandomRoadPosition();
}

function isAngryDriverWalkable(x, y, entitySize = 20) {
    if (!collisionData || mapWidth === 0) return true;

    // Check only the center point to allow easy off-road traversal
    const checkX = Math.floor(x);
    const checkY = Math.floor(y);
    if (checkX < 0 || checkX >= mapWidth || checkY < 0 || checkY >= mapHeight) return false;

    const index = (checkY * mapWidth + checkX) * 4;
    const type = getTerrainType(collisionData[index], collisionData[index + 1], collisionData[index + 2]);

    return type === "ROAD" || type === "GRASS" || type === "TRANSITION";
}


        
// --- 8. KEYBOARD & JOYSTICK CONTROLS ---
const activeMoves = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// WASD + Arrow Keys
const keyboardKeyMap = {
    w: "ArrowUp",
    a: "ArrowLeft",
    s: "ArrowDown",
    d: "ArrowRight",
    W: "ArrowUp",
    A: "ArrowLeft",
    S: "ArrowDown",
    D: "ArrowRight",

    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight"
};

window.addEventListener('keydown', e => {

    // SPACE = Open / close desktop controls
    if (e.code === 'Space') {
        e.preventDefault();

        const desktopControlsModal =
            document.getElementById('desktopControlsModal');

        if (!desktopControlsModal) return;

        desktopControlsOpen = !desktopControlsOpen;

        if (desktopControlsOpen) {
            desktopControlsModal.style.display = 'flex';
            gameActive = false;
        } else {
            desktopControlsModal.style.display = 'none';
            gameActive = true;
        }

        return;
    }

    // H = Open / close full map
if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    toggleFullMap();
    return;
}

if (!gameActive) return;

const mappedKey = keyboardKeyMap[e.key];

if (mappedKey) {
    e.preventDefault();
    activeMoves[mappedKey] = true;
    return;
}

// E = Enter / Exit vehicle
if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();

    if (playerCar) {
        if (
            typeof exitBtn !== 'undefined' &&
            exitBtn &&
            exitBtn.style.display !== 'none'
        ) {
            exitBtn.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerType: 'keyboard'
            }));
        }
    } else {
        if (
            typeof jackBtn !== 'undefined' &&
            jackBtn &&
            jackBtn.style.display !== 'none'
        ) {
            jackBtn.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerType: 'keyboard'
            }));
        }
    }

    return;
}
    // P = Open / close player phone
if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();

    // Never open the phone while the full map is displayed
    // or while the player is an arrest-transport passenger.
    if (!playerPhoneOpen && !canOpenPlayerPhone()) {
        return;
    }

    togglePlayerPhone();
    return;
}

    // F = Main interaction buttons only
    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();

        const interactButtonIds = [
            'taxiBtn',
            'blackMarketBtn',
            'restaurantBtn',
            'truckBtn',
            'repairGarageBtn',
            'enterDealerBtn',
            'exitDealerBtn',
            'enterHomeBtn',
            'leaveHomeBtn',
            'sleepBtn',
            'exitHomeBtn'
        ];

        for (const id of interactButtonIds) {
            const button = document.getElementById(id);

            if (
                button &&
                button.style.display !== 'none' &&
                button.offsetParent !== null
            ) {
                button.click();
                break;
            }
        }

        return;
    }

    // L = Tow truck
    if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();

        if (
            typeof towTruckBtn !== 'undefined' &&
            towTruckBtn &&
            towTruckBtn.style.display !== 'none'
        ) {
            towTruckBtn.click();
        }

        return;
    }

    // G = Police siren
    if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();

        if (
            typeof sirenBtn !== 'undefined' &&
            sirenBtn &&
            sirenBtn.style.display !== 'none'
        ) {
            sirenBtn.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerType: 'keyboard'
            }));
        }

        return;
    }
});

window.addEventListener('keyup', e => {
    if (!gameActive) return;

    const mappedKey = keyboardKeyMap[e.key];

    if (mappedKey) {
        e.preventDefault();
        activeMoves[mappedKey] = false;
    }
});

// Prevent stuck movement if browser loses focus
window.addEventListener('blur', () => {
    activeMoves.ArrowUp = false;
    activeMoves.ArrowDown = false;
    activeMoves.ArrowLeft = false;
    activeMoves.ArrowRight = false;
});       

canvas.addEventListener('pointerdown', (e) => {
  const { x: mouseX, y: mouseY } = clientToLogical(e.clientX, e.clientY);

if (showFullMap || fullMapAnimating) {
    if (
        showFullMap &&
        !fullMapAnimating &&
        mouseX >= 30 &&
        mouseX <= 160 &&
        mouseY >= 30 &&
        mouseY <= 75
    ) {
        closeFullMap();
    }

    return;
}

if (gameActive) {
    const radarRadius = 80, padding = 20;
    const mmX = canvas.width - radarRadius - padding;
    const mmY = radarRadius + padding;

    if (
        Math.sqrt(
            (mouseX - mmX) ** 2 +
            (mouseY - mmY) ** 2
        ) <= radarRadius
    ) {
        openFullMap();
    }
}  

  
});

const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');
let joystickActive = false, joystickStartX = 0, joystickStartY = 0;
let joystickInputX = 0, joystickInputY = 0, joystickTouchId = null;

if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
      if (!gameActive || joystickActive) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier; joystickActive = true;
      const startPoint = clientToLogical(touch.clientX, touch.clientY);
      joystickStartX = startPoint.x; joystickStartY = startPoint.y;

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
          const movePoint = clientToLogical(touch.clientX, touch.clientY);
          let deltaX = movePoint.x - joystickStartX, deltaY = movePoint.y - joystickStartY;
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
}
// ============================================================
// PLAYER PHONE SWIPE CONTROL
// Swipe down from the top of the screen = OPEN
// Swipe back upward toward the top = CLOSE
// ========================================

let phoneSwipeStartX = 0;
let phoneSwipeStartY = 0;
let phoneSwipeTracking = false;

canvas.addEventListener("touchstart", (e) => {
    if (!gameActive) return;
    if (!e.touches || e.touches.length !== 1) return;

    const touch = e.touches[0];

    const swipeStart = clientToLogical(touch.clientX, touch.clientY);
    phoneSwipeStartX = swipeStart.x;
    phoneSwipeStartY = swipeStart.y;

    phoneSwipeTracking = true;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
    if (!phoneSwipeTracking) return;
    if (!e.changedTouches || e.changedTouches.length === 0) {
        phoneSwipeTracking = false;
        return;
    }

    const touch = e.changedTouches[0];

    const swipeEnd = clientToLogical(touch.clientX, touch.clientY);
    const deltaX = swipeEnd.x - phoneSwipeStartX;
    const deltaY = swipeEnd.y - phoneSwipeStartY;

    phoneSwipeTracking = false;

    // Ignore mostly-horizontal gestures.
    if (Math.abs(deltaY) < Math.abs(deltaX) * 1.35) {
        return;
    }

    const swipeDistance = Math.abs(deltaY);

    // Ignore small finger movements.
    if (swipeDistance < 70) {
        return;
    }

    // OPEN:
    // Swipe DOWN starting near the top edge of the screen.
    if (
        !playerPhoneOpen &&
        deltaY > 0 &&
        phoneSwipeStartY < 120
    ) {
        openPlayerPhone();
        return;
    }

    // CLOSE:
    // Swipe UP toward the top while the phone is open.
    if (
        playerPhoneOpen &&
        deltaY < 0 &&
        swipeEnd.y < 150
    ) {
        closePlayerPhone();
    }
}, { passive: true });

canvas.addEventListener("touchcancel", () => {
    phoneSwipeTracking = false;
}, { passive: true });
// ============================================================
// A* NAVIGATION SYSTEM
//==================================================

class NavigationSystem {
    constructor() {
        
        // Start with 32 and adjust later if necessary.
        this.cellSize = 32;

        this.grid = [];
        this.gridWidth = 0;
        this.gridHeight = 0;

        this.ready = false;
    }

    // --------------------------------------------------------
    // Convert world/map coordinates to navigation-grid coords
    // --------------------------------------------------------

    worldToGrid(x, y) {
        return {
            x: Math.floor(x / this.cellSize),
            y: Math.floor(y / this.cellSize)
        };
    }

    gridToWorld(x, y) {
        return {
            x: x * this.cellSize + this.cellSize / 2,
            y: y * this.cellSize + this.cellSize / 2
        };
    }

    // --------------------------------------------------------
    // Check whether a navigation cell can be used by vehicles
    // --------------------------------------------------------

    isCellWalkable(gridX, gridY) {
        if (
            gridX < 0 ||
            gridY < 0 ||
            gridX >= this.gridWidth ||
            gridY >= this.gridHeight
        ) {
            return false;
        }

        if (this.grid[gridY][gridX] !== 0) {
            return false;
        }

        // Dynamic police roadblock barricades block A* routes.
        if (typeof isRoadblockBlocking === "function") {
            const world = this.gridToWorld(gridX, gridY);
            if (isRoadblockBlocking(world.x, world.y)) {
                return false;
            }
        }

        return true;
    }

    // --------------------------------------------------------
    // Build navigation grid from existing collisionData
        buildGrid() {
        if (!collisionData || mapWidth === 0 || mapHeight === 0) {
            console.warn("Navigation: collisionData is not ready.");
            return false;
        }

        this.gridWidth = Math.ceil(mapWidth / this.cellSize);
        this.gridHeight = Math.ceil(mapHeight / this.cellSize);
        this.grid = new Array(this.gridHeight);

        for (let gy = 0; gy < this.gridHeight; gy++) {
            this.grid[gy] = new Array(this.gridWidth);

            for (let gx = 0; gx < this.gridWidth; gx++) {
                const world = this.gridToWorld(gx, gy);
                
                // Grid cell is walkable if center coordinate falls on road, grass, or transition edge
                let walkable = isGrassOrRoad(world.x, world.y);

                this.grid[gy][gx] = walkable ? 0 : 1;
            }
        }

        this.ready = true;
        console.log(`Navigation grid created: ${this.gridWidth} × ${this.gridHeight}`);
        return true;
        }
    
    
    // Keep coordinates inside the navigation grid
    

    clampGridPosition(pos) {
        return {
            x: Math.max(
                0,
                Math.min(this.gridWidth - 1, pos.x)
            ),

            y: Math.max(
                0,
                Math.min(this.gridHeight - 1, pos.y)
            )
        };
    }

    // --------------------------------------------------------
    // Find nearest usable navigation cell
    // --------------------------------------------------------

    findNearestWalkable(startX, startY) {

        const start = this.clampGridPosition({
            x: startX,
            y: startY
        });

        if (this.isCellWalkable(start.x, start.y)) {
            return start;
        }

        // Search outward in expanding rings.
        for (let radius = 1; radius < 20; radius++) {

            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {

                    // Only inspect the outer edge of the ring.
                    if (
                        Math.abs(x) !== radius &&
                        Math.abs(y) !== radius
                    ) {
                        continue;
                    }

                    const gx = start.x + x;
                    const gy = start.y + y;

                    if (this.isCellWalkable(gx, gy)) {
                        return {
                            x: gx,
                            y: gy
                        };
                    }
                }
            }
        }

        return null;
    }

    // --------------------------------------------------------
    // Heuristic used by A*
    //
    // Diagonal movement is allowed, so use octile distance.
    // --------------------------------------------------------

    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);

        const straight = 1;
        const diagonal = Math.SQRT2;

        return (
            straight * (dx + dy) +
            (diagonal - 2 * straight) *
            Math.min(dx, dy)
        );
    }

    // --------------------------------------------------------
    // Get neighboring cells
    // --------------------------------------------------------

    getNeighbors(node, preferRoads = false) {

        const neighbors = [];

        const directions = [
            { x:  1, y:  0, cost: 1 },
            { x: -1, y:  0, cost: 1 },
            { x:  0, y:  1, cost: 1 },
            { x:  0, y: -1, cost: 1 },

            // Diagonals
            { x:  1, y:  1, cost: Math.SQRT2 },
            { x: -1, y:  1, cost: Math.SQRT2 },
            { x:  1, y: -1, cost: Math.SQRT2 },
            { x: -1, y: -1, cost: Math.SQRT2 }
        ];

        for (const dir of directions) {

            const x = node.x + dir.x;
            const y = node.y + dir.y;

            if (!this.isCellWalkable(x, y)) {
                continue;
            }

            // Prevent diagonal movement through the corner
            // of two blocked cells.
            if (dir.x !== 0 && dir.y !== 0) {

                if (
                    !this.isCellWalkable(
                        node.x + dir.x,
                        node.y
                    ) ||
                    !this.isCellWalkable(
                        node.x,
                        node.y + dir.y
                    )
                ) {
                    continue;
                }
            }

           neighbors.push({
    x,
    y,
    cost: dir.cost * this.getTerrainCost(x, y, preferRoads)
}); 
        }

        return neighbors;
    }

    // --------------------------------------------------------
    // A* PATHFINDING
    //
    // Returns an array of world-coordinate waypoints.
    // --------------------------------------------------------

      getTerrainCost(gridX, gridY, preferRoads = false) {
        if (!preferRoads) return 1;

        if (
            !collisionData ||
            gridX < 0 ||
            gridY < 0 ||
            gridX >= this.gridWidth ||
            gridY >= this.gridHeight
        ) {
            return Infinity;
        }

        const world = this.gridToWorld(gridX, gridY);

        const checkX = Math.floor(world.x);
        const checkY = Math.floor(world.y);

        if (
            checkX < 0 ||
            checkX >= mapWidth ||
            checkY < 0 ||
            checkY >= mapHeight
        ) {
            return Infinity;
        }

        const index = (checkY * mapWidth + checkX) * 4;

        const type = getTerrainType(
            collisionData[index],
            collisionData[index + 1],
            collisionData[index + 2]
        );

        // Strongly prefer roads.
        // Transition is cheap because it is used to enter/leave roads.
        // Grass remains possible, but is expensive.
        if (type === "ROAD") return 1;
        if (type === "TRANSITION") return 2;
        if (type === "GRASS") return 12;

        return Infinity;
    }  
    findPath(startX, startY, targetX, targetY, preferRoads = false) {

        if (!this.ready) {
            return null;
        }

        const rawStart = this.worldToGrid(startX, startY);
        const rawGoal = this.worldToGrid(targetX, targetY);

        const start = this.findNearestWalkable(
            rawStart.x,
            rawStart.y
        );

        const goal = this.findNearestWalkable(
            rawGoal.x,
            rawGoal.y
        );

        if (!start || !goal) {
            return null;
        }

        // If already at destination.
        if (
            start.x === goal.x &&
            start.y === goal.y
        ) {
            return [
                this.gridToWorld(goal.x, goal.y)
            ];
        }

        // --------------------------------------------------------
        // Fast integer key instead of "x,y" string allocation.
        // --------------------------------------------------------

        const getKey = (x, y) =>
            y * this.gridWidth + x;

        // --------------------------------------------------------
        // Binary min-heap for the A* open set.
        //
        // The old implementation scanned the entire openSet every
        // iteration. The heap reduces that lookup from O(n) to
        // O(log n).
        // --------------------------------------------------------

        const openHeap = [];

        const heapPush = (node) => {
            let index = openHeap.length;

            openHeap.push(node);

            while (index > 0) {
                const parentIndex =
                    (index - 1) >> 1;

                const parent =
                    openHeap[parentIndex];

                if (parent.f <= node.f) {
                    break;
                }

                openHeap[index] = parent;
                index = parentIndex;
            }

            openHeap[index] = node;
        };

        const heapPop = () => {
            const root = openHeap[0];
            const last = openHeap.pop();

            if (openHeap.length > 0) {
                let index = 0;

                while (true) {
                    const left =
                        index * 2 + 1;

                    if (left >= openHeap.length) {
                        break;
                    }

                    const right = left + 1;

                    let child = left;

                    if (
                        right < openHeap.length &&
                        openHeap[right].f <
                            openHeap[left].f
                    ) {
                        child = right;
                    }

                    if (
                        openHeap[child].f >=
                        last.f
                    ) {
                        break;
                    }

                    openHeap[index] =
                        openHeap[child];

                    index = child;
                }

                openHeap[index] = last;
            }

            return root;
        };

        const closedSet = new Set();
        const nodes = new Map();

        const startKey =
            getKey(start.x, start.y);

        const startNode = {
            x: start.x,
            y: start.y,
            g: 0,
            h: this.heuristic(start, goal),
            f: 0,
            parent: null
        };

        startNode.f =
            startNode.g +
            startNode.h;

        nodes.set(
            startKey,
            startNode
        );

        heapPush(startNode);

        // --------------------------------------------------------
        // A* search
        // --------------------------------------------------------

        while (openHeap.length > 0) {

            const current = heapPop();

            if (!current) {
                break;
            }

            const currentKey =
                getKey(
                    current.x,
                    current.y
                );

            // A node can appear more than once in the heap when its
            // g-score improves. Ignore stale/closed entries.
            if (closedSet.has(currentKey)) {
                continue;
            }

            closedSet.add(currentKey);

            // ----------------------------------------------------
            // Goal reached
            // ----------------------------------------------------

            if (
                current.x === goal.x &&
                current.y === goal.y
            ) {
                const path = [];

                let node = current;

                while (node) {
                    path.push(
                        this.gridToWorld(
                            node.x,
                            node.y
                        )
                    );

                    node = node.parent;
                }

                path.reverse();

                return path;
            }

            // ----------------------------------------------------
            // Get neighboring cells
            // ----------------------------------------------------

            const neighbors =
                this.getNeighbors(
                    current,
                    preferRoads
                );

            for (const neighbor of neighbors) {

                const key =
                    getKey(
                        neighbor.x,
                        neighbor.y
                    );

                if (closedSet.has(key)) {
                    continue;
                }

                const tentativeG =
                    current.g +
                    neighbor.cost;

                let neighborNode =
                    nodes.get(key);

                if (!neighborNode) {

                    neighborNode = {
                        x: neighbor.x,
                        y: neighbor.y,
                        g: Infinity,
                        h: 0,
                        f: Infinity,
                        parent: null
                    };

                    nodes.set(
                        key,
                        neighborNode
                    );
                }

                if (
                    tentativeG >=
                    neighborNode.g
                ) {
                    continue;
                }

                neighborNode.parent =
                    current;

                neighborNode.g =
                    tentativeG;

                neighborNode.h =
                    this.heuristic(
                        neighborNode,
                        goal
                    );

                neighborNode.f =
                    neighborNode.g +
                    neighborNode.h;

                heapPush(neighborNode);
            }
        }

        // No route found.
        return null;
    }

    // --------------------------------------------------------
    // Optional helper:
    // Remove unnecessary points from a path.
    //
    // We can improve this later using your collision system.
    // --------------------------------------------------------

    simplifyPath(path) {

        if (!path || path.length <= 2) {
            return path;
        }

        const result = [path[0]];

        let previousDirection = null;

        for (let i = 1; i < path.length; i++) {

            const previous = path[i - 1];
            const current = path[i];

            const dx =
                Math.sign(
                    current.x - previous.x
                );

            const dy =
                Math.sign(
                    current.y - previous.y
                );

            const direction =
                `${dx},${dy}`;

            if (
                previousDirection !== null &&
                direction !== previousDirection
            ) {
                result.push(previous);
            }

            previousDirection = direction;
        }

        result.push(
            path[path.length - 1]
        );

        return result;
    }
}


// GLOBAL NAVIGATION SYSTEM

const navigationSystem =
    new NavigationSystem();

// Helper to check if a car has meaningful movement
function isCarMoving(car, threshold = 0.2) {
    if (!car) return false;

    // Check magnitude of car's current speed property
    if (typeof car.speed === 'number') {
        return Math.abs(car.speed) > threshold;
    }

    // Alternative: check positional displacement (vx, vy) if used in your physics
    if (typeof car.vx === 'number' && typeof car.vy === 'number') {
        return Math.hypot(car.vx, car.vy) > threshold;
    }

    return false;
}
function isEntityOnScreen(entity, margin = 150) {
    if (!entity) return false;

    const dx = entity.x - player.x;
    const dy = entity.y - player.y;

    const maxDistance = Math.max(canvas.width, canvas.height) * 0.75 + margin;

    return dx * dx + dy * dy <= maxDistance * maxDistance;
}

// ============================================================================
// DYNAMIC OBJECT LIGHTING  (ray occlusion + partial object glow)
// ----------------------------------------------------------------------------
// Per frame (see main.js render loop):
//   1. updateObjectLighting()  gathers on-screen blockers (cars / NPCs / player),
//                              casts the rays of every visible light and stores
//                              ray lengths + soft glow spots per object.
//   2. drawNightOverlay()      building beams are clipped to their ray fan.
//   3. Car.drawLights()        headlight cones are clipped to their ray fan.
//   4. drawObjectGlows(ctx)    glow spots, clipped to each object's own
//                              silhouette, so only the exposed part lights up.
// Allocation-free after warm-up (pooled blockers, typed arrays, cached fans).
// ============================================================================
const OBJLIGHT = {
    HEAD_RAYS: 11,         // rays per headlight cone
    BUILD_RAYS: 9,         // rays per building beam
        // Soft glows where headlights hit static building/wall terrain.
    terrainGlowCount: 0,
    MAX_TERRAIN_GLOWS: 48,
    tgx: new Float32Array(48),
    tgy: new Float32Array(48),
    tnx: new Float32Array(48),
    tny: new Float32Array(48),
    tgi: new Float32Array(48),
    CELL: 4,               // world px per cached "solid?" cell
    STEP: 4,               // ray-march step against the collision map
    MAX_GLOWS: 5,          // glow spots kept per object
    GLOW_ALPHA: 0.5,       // peak additive alpha of a single glow
    GLOW_TOTAL_CAP: 0.8,   // total additive alpha allowed on one object
    HEAD_RANGE: 180,       // same as Car.drawLights headlightLength
    active: false,
    frame: 0,

    blockers: [],
    blockerCount: 0,
    cand: new Int16Array(128),   // scratch candidate list for one light

    grid: null, gridW: 0, gridH: 0, cw: 0, ch: 0,
    scaleX: 1, scaleY: 1, gridSource: null
};

function _olGetBlocker(i) {
    let b = OBJLIGHT.blockers[i];
    if (!b) {
        const M = OBJLIGHT.MAX_GLOWS;
        b = OBJLIGHT.blockers[i] = {
            kind: 0, ref: null, x: 0, y: 0, bound: 0,
            ang: 0, cos: 1, sin: 0, hw: 0, hl: 0, r: 0,
            gc: 0, gx: new Float32Array(M), gy: new Float32Array(M),
            gr: new Float32Array(M),
            gi: new Float32Array(M),
            ga: new Float32Array(M)
        };
    }
    return b;
}

// ---------------------------------------------------------------------------
// Static occlusion from the existing collision data / terrain classifier.
// A cell blocks light when its terrain is BLOCKED (buildings, walls...), except
// the blue river. Cells are classified lazily and cached (0 free / 1 solid).
// ---------------------------------------------------------------------------
function _olPrepareGrid() {
    const O = OBJLIGHT;
    if (!collisionData) return false;
    if (O.gridSource === collisionData) return true;

    const cw = (typeof collisionMapImage !== "undefined" && collisionMapImage.width) || mapWidth;
    const ch = (typeof collisionMapImage !== "undefined" && collisionMapImage.height) || mapHeight;
    if (!cw || !ch) return false;

    const worldW = (typeof mapImage !== "undefined" && mapImage.naturalWidth) || 4096;
    const worldH = (typeof mapImage !== "undefined" && mapImage.naturalHeight) || 2286;

    // same collision -> world conversion the building-light generator uses
    O.cw = cw; O.ch = ch;
    O.scaleX = worldW / cw;
    O.scaleY = worldH / ch;
    O.gridW = Math.ceil(worldW / O.CELL);
    O.gridH = Math.ceil(worldH / O.CELL);
    O.grid = new Uint8Array(O.gridW * O.gridH).fill(255);
    O.gridSource = collisionData;
    return true;
}

function _olPixelSolid(wx, wy) {
    const O = OBJLIGHT;
    const px = Math.floor(wx / O.scaleX);
    const py = Math.floor(wy / O.scaleY);
    if (px < 0 || py < 0 || px >= O.cw || py >= O.ch) return 1;
    const i = (py * O.cw + px) * 4;
    const r = collisionData[i], g = collisionData[i + 1], b = collisionData[i + 2];
    if (b > r + 20 && b > g + 10) return 0;            // river never blocks light
    return getTerrainType(r, g, b) === "BLOCKED" ? 1 : 0;
}

function _olSolidAt(wx, wy) {
    const O = OBJLIGHT;
    const cx = Math.floor(wx / O.CELL);
    const cy = Math.floor(wy / O.CELL);
    if (cx < 0 || cy < 0 || cx >= O.gridW || cy >= O.gridH) return 1;
    const idx = cy * O.gridW + cx;
    let v = O.grid[idx];
    if (v === 255) {
        // 4 sub-samples; at least half must be solid (ignores hairline noise)
        const x0 = cx * O.CELL, y0 = cy * O.CELL, q = O.CELL * 0.25, h = O.CELL * 0.75;
        const n = _olPixelSolid(x0 + q, y0 + q) + _olPixelSolid(x0 + h, y0 + q) +
                  _olPixelSolid(x0 + q, y0 + h) + _olPixelSolid(x0 + h, y0 + h);
        v = n >= 2 ? 1 : 0;
        O.grid[idx] = v;
    }
    return v;
}

// March along unit (dx,dy); returns distance to the first solid cell (or
// maxDist). Cells still inside the light's own wall / vehicle are skipped.
function _olMarchMap(ox, oy, dx, dy, maxDist) {
    const step = OBJLIGHT.STEP;
    let inside = true;
    for (let t = 0; t <= maxDist; t += step) {
        if (_olSolidAt(ox + dx * t, oy + dy * t)) {
            if (!inside || t > 24) return t;
        } else {
            inside = false;
        }
    }
    return maxDist;
    
}

function _olAddTerrainGlow(x, y, rayDx, rayDy, intensity) {
    const O = OBJLIGHT;
    const max = O.MAX_TERRAIN_GLOWS;

    // Estimate the outward-facing surface normal using the cached
    // terrain grid. The normal points toward free space.
    let nx =
        _olSolidAt(x - 8, y) -
        _olSolidAt(x + 8, y);

    let ny =
        _olSolidAt(x, y - 8) -
        _olSolidAt(x, y + 8);

    let normalLength = Math.hypot(nx, ny);

    if (normalLength < 0.001) {
        nx = -rayDx;
        ny = -rayDy;
        normalLength = Math.hypot(nx, ny) || 1;
    }

    nx /= normalLength;
    ny /= normalLength;

    // Merge nearby ray hits so one headlight produces a soft patch,
    // not a row of individual dots.
    for (let i = 0; i < O.terrainGlowCount; i++) {
        const dx = O.tgx[i] - x;
        const dy = O.tgy[i] - y;

        if (dx * dx + dy * dy < 18 * 18) {
            const oldIntensity = O.tgi[i];
            const total = oldIntensity + intensity;

            O.tgx[i] =
                (O.tgx[i] * oldIntensity + x * intensity) /
                total;

            O.tgy[i] =
                (O.tgy[i] * oldIntensity + y * intensity) /
                total;

            O.tnx[i] =
                O.tnx[i] * 0.5 + nx * 0.5;

            O.tny[i] =
                O.tny[i] * 0.5 + ny * 0.5;

            const nl = Math.hypot(O.tnx[i], O.tny[i]) || 1;
            O.tnx[i] /= nl;
            O.tny[i] /= nl;

            O.tgi[i] = Math.min(1, Math.max(oldIntensity, intensity));
            return;
        }
    }

    if (O.terrainGlowCount >= max) {
        return;
    }

    const i = O.terrainGlowCount++;

    O.tgx[i] = x;
    O.tgy[i] = y;
    O.tnx[i] = nx;
    O.tny[i] = ny;
    O.tgi[i] = Math.min(1, intensity);
}

// ---------------------------------------------------------------------------
// Ray vs blocker shape. Return distance or -1. The contact point (in the
// blocker's LOCAL frame) is left in _olHitLX/_olHitLY.
// ---------------------------------------------------------------------------
let _olHitLX = 0, _olHitLY = 0;

function _olRayRect(b, ox, oy, dx, dy, maxDist) {
    const rx = ox - b.x, ry = oy - b.y;
    const px = rx * b.cos + ry * b.sin;
    const py = -rx * b.sin + ry * b.cos;
    const vx = dx * b.cos + dy * b.sin;
    const vy = -dx * b.sin + dy * b.cos;

    let tmin = 0, tmax = maxDist;
    if (Math.abs(vx) < 1e-6) {
        if (px < -b.hw || px > b.hw) return -1;
    } else {
        let t1 = (-b.hw - px) / vx, t2 = (b.hw - px) / vx;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
    }
    if (Math.abs(vy) < 1e-6) {
        if (py < -b.hl || py > b.hl) return -1;
    } else {
        let t1 = (-b.hl - py) / vy, t2 = (b.hl - py) / vy;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
    }
    if (tmin <= 0 || tmin > maxDist) return -1;   // origin inside, or out of range
    _olHitLX = px + vx * tmin;
    _olHitLY = py + vy * tmin;
    return tmin;
}


function _olRayEllipse(b, ox, oy, dx, dy, maxDist) {
    // Transform ray into the person's local frame.
    const rx = ox - b.x;
    const ry = oy - b.y;

    const px = rx * b.cos + ry * b.sin;
    const py = -rx * b.sin + ry * b.cos;

    const vx = dx * b.cos + dy * b.sin;
    const vy = -dx * b.sin + dy * b.cos;

    const hw = Math.max(0.1, b.hw);
    const hl = Math.max(0.1, b.hl);

    const A =
        (vx * vx) / (hw * hw) +
        (vy * vy) / (hl * hl);

    if (A < 1e-10) return -1;

    const B =
        2 * (
            (px * vx) / (hw * hw) +
            (py * vy) / (hl * hl)
        );

    const C =
        (px * px) / (hw * hw) +
        (py * py) / (hl * hl) - 1;
    // A ray starting inside a person should not hit its far side.
    if (C < 0) return -1;

    const discriminant = B * B - 4 * A * C;

    if (discriminant < 0) return -1;

    const root = Math.sqrt(discriminant);
    const t1 = (-B - root) / (2 * A);
    const t2 = (-B + root) / (2 * A);

    let t = t1 > 0.01 ? t1 : t2;

    if (t <= 0.01 || t > maxDist) return -1;

    // Contact point in the ellipse's local frame.
    _olHitLX = px + vx * t;
    _olHitLY = py + vy * t;

    return t;
}
// ---------------------------------------------------------------------------
// Light fan: a bundle of rays belonging to one cone / beam.
// ---------------------------------------------------------------------------
function _olNewFan(n) {
    return {
        n: n,
        ox: new Float32Array(n), oy: new Float32Array(n),   // ray origins (world)
        dx: new Float32Array(n), dy: new Float32Array(n),   // unit directions
        full: new Float32Array(n),                          // length with static map applied
        lens: new Float32Array(n),                          // length after dynamic blockers
        wgt: new Float32Array(n),                           // across-beam brightness weight
        hitB: new Int16Array(n),                            // blocker index hit (-1 = none)
        hlx: new Float32Array(n), hly: new Float32Array(n), // contact point, blocker-local
        shortened: false, staticShort: false, dirty: false,
        sx: 0, sy: 0, range: 1                              // exact source + range (falloff)
    };
}

// Cast one fan. candidates = blockers whose bounding circle touches the light.
function _olCastFan(fan, owner, useMap, cx, cy, boundR) {
    const O = OBJLIGHT, n = fan.n;

    let cc = 0;
    for (let i = 0; i < O.blockerCount && cc < O.cand.length; i++) {
        const b = O.blockers[i];
        if (b.ref === owner) continue;
        const ddx = b.x - cx, ddy = b.y - cy;
        const rr = boundR + b.bound;
        if (ddx * ddx + ddy * ddy <= rr * rr) O.cand[cc++] = i;
    }

    // Static building light with nothing nearby: keep (or restore) cached result.
    if (cc === 0 && !useMap) {
        if (fan.dirty) {
            for (let r = 0; r < n; r++) { fan.lens[r] = fan.full[r]; fan.hitB[r] = -1; }
            fan.dirty = false;
        }
        fan.shortened = fan.staticShort;
        return;
    }

    let any = fan.staticShort;
    for (let r = 0; r < n; r++) {

        let len = fan.full[r];
        let hit = -1;
        const ox = fan.ox[r], oy = fan.oy[r], dx = fan.dx[r], dy = fan.dy[r];

        // Remember the static terrain hit separately from dynamic objects.
        const mapLen = useMap
            ? _olMarchMap(ox, oy, dx, dy, len)
            : len;

        len = mapLen;

        for (let c = 0; c < cc; c++) {
            const bi = O.cand[c];
            const b = O.blockers[bi];
            const t = b.kind === 0
                ? _olRayRect(b, ox, oy, dx, dy, len)
                : _olRayEllipse(b, ox, oy, dx, dy, len);
            if (t > 0 && t < len) {
                len = t; hit = bi;
                fan.hlx[r] = _olHitLX; fan.hly[r] = _olHitLY;
            }
        }

        fan.lens[r] = len;
        fan.hitB[r] = hit;

        // If terrain stopped the ray before any car/person did,
        // add a glow directly to the building surface.
        if (
            useMap &&
            hit < 0 &&
            mapLen < fan.full[r] - 0.5
        ) {
            const hitX = ox + dx * mapLen;
            const hitY = oy + dy * mapLen;

            const distance = Math.hypot(
                hitX - fan.sx,
                hitY - fan.sy
            );

            const falloff = Math.max(
                0,
                1 - distance / fan.range
            );

            const intensity =
                falloff * falloff *
                (0.55 + 0.45 * fan.wgt[r]);

            if (intensity > 0.06) {
                _olAddTerrainGlow(
                    hitX,
                    hitY,
                    dx,
                    dy,
                    intensity
                );
            }
        }

        if (
            len < fan.full[r] - 0.5 ||
            (useMap && len < fan.full[r])
        ) {
            any = true;
        }
    }
    fan.shortened = any;
    fan.dirty = true;

    // Turn each run of consecutive rays that hit the same object into ONE soft
    // glow spot at the intensity-weighted contact point.
    let r = 0;
    while (r < n) {
        const bi = fan.hitB[r];
        if (bi < 0) { r++; continue; }
        let sx = 0, sy = 0, sw = 0, best = 0, cnt = 0, r2 = r;
        while (r2 < n && fan.hitB[r2] === bi) {
            // brightness depends on distance from the EXACT light source
            const hx = fan.ox[r2] + fan.dx[r2] * fan.lens[r2];
            const hy = fan.oy[r2] + fan.dy[r2] * fan.lens[r2];
            const d = Math.hypot(hx - fan.sx, hy - fan.sy);
            const k = Math.max(0, 1 - d / fan.range);
            const inten = k * k * (0.55 + 0.45 * fan.wgt[r2]);
            sx += fan.hlx[r2] * inten; sy += fan.hly[r2] * inten; sw += inten;
            if (inten > best) best = inten;
            cnt++; r2++;
        }
        if (sw > 0.004) _olAddGlow(O.blockers[bi], sx / sw, sy / sw, best, 6 + cnt * 2.4);
        r = r2;
    }
}


function _olAddGlow(b, lx, ly, inten, radius) {
    const M = OBJLIGHT.MAX_GLOWS;

    // Find the tangent direction of the surface facing the light.
    let normalAngle;

    if (b.kind === 0) {
        // Cars use a rotated rectangle.
        if (
            Math.abs(lx / Math.max(0.1, b.hw)) >
            Math.abs(ly / Math.max(0.1, b.hl))
        ) {
            normalAngle = lx >= 0 ? 0 : Math.PI;
        } else {
            normalAngle = ly >= 0
                ? Math.PI / 2
                : -Math.PI / 2;
        }
    } else {
        // People use an oriented ellipse.
        normalAngle = Math.atan2(
            ly / Math.max(0.1, b.hl * b.hl),
            lx / Math.max(0.1, b.hw * b.hw)
        );
    }

    const tangentAngle = normalAngle + Math.PI / 2;

    let slot = b.gc;

    if (slot >= M) {
        let weakest = 0;

        for (let i = 1; i < M; i++) {
            if (b.gi[i] < b.gi[weakest]) weakest = i;
        }

        if (b.gi[weakest] >= inten) return;
        slot = weakest;
    } else {
        b.gc++;
    }

    b.gx[slot] = lx;
    b.gy[slot] = ly;
    b.gr[slot] = radius;
    b.gi[slot] = inten;
    b.ga[slot] = tangentAngle;
}

// Adds the fan outline to the current path. Output is in the local frame of
// (px,py,angle): apex first, then every ray end point.

function olTraceFan(ctx, fan, px, py, cosA, sinA, apexX, apexY) {
    const n = fan.n;

    if (n <= 2) {
        ctx.moveTo(apexX, apexY);

        for (let i = 0; i < n; i++) {
            const wx = fan.ox[i] + fan.dx[i] * fan.lens[i] - px;
            const wy = fan.oy[i] + fan.dy[i] * fan.lens[i] - py;

            ctx.lineTo(
                wx * cosA + wy * sinA,
                -wx * sinA + wy * cosA
            );
        }

        ctx.closePath();
        return;
    }

    // Trace the actual ray endpoints in car-local coordinates.
    // Curves are kept between adjacent endpoints to soften the
    // polygon without extending the beam beyond its sampled boundary.
    const pointX = i => {
        const wx = fan.ox[i] + fan.dx[i] * fan.lens[i] - px;
        const wy = fan.oy[i] + fan.dy[i] * fan.lens[i] - py;

        return wx * cosA + wy * sinA;
    };

    const pointY = i => {
        const wx = fan.ox[i] + fan.dx[i] * fan.lens[i] - px;
        const wy = fan.oy[i] + fan.dy[i] * fan.lens[i] - py;

        return -wx * sinA + wy * cosA;
    };

    ctx.moveTo(apexX, apexY);

    // Smooth the outer boundary between ray endpoints.
    ctx.lineTo(
        (pointX(0) + pointX(1)) * 0.5,
        (pointY(0) + pointY(1)) * 0.5
    );

    for (let i = 1; i < n - 1; i++) {
        ctx.quadraticCurveTo(
            pointX(i),
            pointY(i),
            (pointX(i) + pointX(i + 1)) * 0.5,
            (pointY(i) + pointY(i + 1)) * 0.5
        );
    }

    ctx.lineTo(pointX(n - 1), pointY(n - 1));
    ctx.closePath();
}

// ---------------------------------------------------------------------------
// Light registration
// ---------------------------------------------------------------------------
function _olSetupHeadlights(car) {
    const O = OBJLIGHT, N = O.HEAD_RAYS;
    let L = car._olHead;
    if (!L) L = car._olHead = { left: _olNewFan(N), right: _olNewFan(N) };

    const w = car.width, len = car.length;
    const range = O.HEAD_RANGE;
    const spread = w * 1.8;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    const ay = -len / 2;                 // bulb line (local)
    const far = ay - range;              // flat end of the cone (local)

    // left cone : apex (-w/3, ay), far edge x from  -w/3-spread .. 0.1w
    // right cone: apex ( w/3, ay), far edge x from -0.1w .. w/3+spread
    for (let side = 0; side < 2; side++) {
        const fan = side === 0 ? L.left : L.right;
        const axL = side === 0 ? -w / 3 : w / 3;
        const x0 = side === 0 ? -w / 3 - spread : -w * 0.1;
        const x1 = side === 0 ? w * 0.1 : w / 3 + spread;

        const wax = car.x + axL * cosA - ay * sinA;
        const way = car.y + axL * sinA + ay * cosA;
        fan.sx = wax; fan.sy = way; fan.range = range;

        for (let i = 0; i < N; i++) {
            const u = i / (N - 1);
            let vx = (x0 + (x1 - x0) * u) - axL, vy = far - ay;
            const dist = Math.hypot(vx, vy);
            vx /= dist; vy /= dist;
            fan.ox[i] = wax; fan.oy[i] = way;
            fan.dx[i] = vx * cosA - vy * sinA;
            fan.dy[i] = vx * sinA + vy * cosA;
            fan.full[i] = dist;
            fan.wgt[i] = 1 - Math.abs(u - 0.5) * 2 * 0.8;   // brightest on the cone axis
        }
        _olCastFan(fan, car, true, wax, way, range + 8);
    }
    car._olFrame = O.frame;
}

function _olSetupBuildingLight(light) {
    const O = OBJLIGHT, N = O.BUILD_RAYS;

    // ---- static data, computed once per building light and cached ----
    let c = light._ol;
    if (!c) {
        const length = light.length * 0.82;               // same as drawLightBeam
        const px = -light.ny, py = light.nx;
        const sh = light.baseWidth * 0.38 * 0.5;
        const eh = light.baseWidth * 1.15 * 0.5;
        const fan = _olNewFan(N);
        fan.sx = light.x; fan.sy = light.y; fan.range = length;
        for (let i = 0; i < N; i++) {
            const u = (i / (N - 1)) * 2 - 1;              // -1 .. 1 across the beam
            const sx = light.x + px * sh * u, sy = light.y + py * sh * u;
            const ex = light.x + light.nx * length + px * eh * u;
            const ey = light.y + light.ny * length + py * eh * u;
            const dist = Math.hypot(ex - sx, ey - sy);
            fan.ox[i] = sx; fan.oy[i] = sy;
            fan.dx[i] = (ex - sx) / dist; fan.dy[i] = (ey - sy) / dist;
            fan.full[i] = dist;
            fan.wgt[i] = 1 - Math.abs(u) * 0.7;
        }
        // buildings (static) are evaluated exactly once
        for (let i = 0; i < N; i++) {
            const orig = fan.full[i];
            fan.full[i] = _olMarchMap(fan.ox[i], fan.oy[i], fan.dx[i], fan.dy[i], orig);
            fan.lens[i] = fan.full[i];
            fan.hitB[i] = -1;
            if (fan.full[i] < orig) fan.staticShort = true;
        }
        fan.shortened = fan.staticShort;
        c = light._ol = {
            fan: fan,
            cx: light.x + light.nx * length * 0.5,
            cy: light.y + light.ny * length * 0.5,
            r: length * 0.5 + light.baseWidth * 0.8 + 6,
            pos: { x: 0, y: 0 }
        };
        c.pos.x = c.cx; c.pos.y = c.cy;
    }

    // reuse the existing entity-on-screen test via the cached beam centre
    if (!isEntityOnScreen(c.pos, c.r)) return;

    _olCastFan(c.fan, null, false, c.cx, c.cy, c.r);
    light._olFrame = O.frame;
}

// ---------------------------------------------------------------------------
// PER-FRAME ENTRY POINT  (call once, right before drawNightOverlay)
// ---------------------------------------------------------------------------
function updateObjectLighting() {
    const O = OBJLIGHT;
    O.frame++;
    O.active = false;
    O.blockerCount = 0;
    O.terrainGlowCount = 0;

    if (typeof ambientBrightness === "undefined" || ambientBrightness >= 0.75) return;
    if (typeof isInsideHouse !== "undefined" && isInsideHouse) return;
    if (typeof isInsideDealership !== "undefined" && isInsideDealership) return;
    if (!_olPrepareGrid()) return;
    O.active = true;

    // ---- 1. blockers: only entities the game already says are on screen ----
    let n = 0;
    const carList = (typeof cars !== "undefined") ? cars : null;

    if (carList) {
        for (let i = 0; i < carList.length; i++) {
            const car = carList[i];
            if (!isEntityOnScreen(car)) continue;
            const b = _olGetBlocker(n++);
            b.kind = 0; b.ref = car; b.x = car.x; b.y = car.y;
            b.ang = car.angle; b.cos = Math.cos(car.angle); b.sin = Math.sin(car.angle);
            b.hw = car.width / 2; b.hl = car.length / 2;
            b.bound = Math.hypot(b.hw, b.hl); b.gc = 0;
        }
    }
    if (typeof npcs !== "undefined") {
        for (let i = 0; i < npcs.length; i++) {
            const p = npcs[i];
            if (p.isPassenger || !isEntityOnScreen(p)) continue;
            const b = _olGetBlocker(n++);
            b.kind = 1;
            b.ref = p;
            b.x = p.x;
            b.y = p.y;
            b.ang = p.angle || 0;
            b.cos = Math.cos(b.ang);
            b.sin = Math.sin(b.ang);

            // Approximate the rendered head, torso and arms.
            b.hw = p.size * 0.52;
            b.hl = p.size * 0.34;
            b.bound = Math.hypot(b.hw, b.hl);
            b.gc = 0;
        }
    }
    if (typeof angryDrivers !== "undefined") {
        for (let i = 0; i < angryDrivers.length; i++) {
            const p = angryDrivers[i];
            if (!isEntityOnScreen(p)) continue;
            const b = _olGetBlocker(n++);
            b.kind = 1;
            b.ref = p;
            b.x = p.x;
            b.y = p.y;
            b.ang = p.angle || 0;
            b.cos = Math.cos(b.ang);
            b.sin = Math.sin(b.ang);

            // Approximate the rendered head, torso and arms.
            b.hw = p.size * 0.52;
            b.hl = p.size * 0.34;
            b.bound = Math.hypot(b.hw, b.hl);
            b.gc = 0;
        }
    }
    if (typeof player !== "undefined" && !playerCar && !player.ispassenger) {
        const b = _olGetBlocker(n++);
        // the player is drawn at the camera centre, i.e. (x,y) + size/2
        b.kind = 1;
        b.ref = player;

        // Match the camera's world-space anchor used to draw the player.
        b.x = player.x + player.size / 2;
        b.y = player.y + player.size / 2;

        b.ang = player.angle || 0;
        b.cos = Math.cos(b.ang);
        b.sin = Math.sin(b.ang);

        b.hw = player.size * 0.52;
        b.hl = player.size * 0.34;
        b.bound = Math.hypot(b.hw, b.hl);
        b.gc = 0;
    }
    O.blockerCount = n;

    // ---- 2. headlights (same activation rule as Car.drawLights) ----
    if (carList) {
        for (let i = 0; i < carList.length; i++) {
            const car = carList[i];
            if (car.isParked || car.exploded) continue;
            if (!isEntityOnScreen(car)) continue;
            _olSetupHeadlights(car);
        }
    }

    // ---- 3. building lights, only while the night sequence has them on ----
    if (typeof buildingLightsMode !== "undefined" && buildingLightsMode !== "day") {
        const lights = window.buildingLightShapes || [];
        for (let i = 0; i < lights.length; i++) {
            const l = lights[i];
            if (l.enabled) _olSetupBuildingLight(l);
        }
    }
}

// ---------------------------------------------------------------------------
// GLOW PASS (world space, after the night overlay and the beams)
// ---------------------------------------------------------------------------

function _olDrawGlows(ctx, b) {
    const O = OBJLIGHT;
    let total = 0;

    for (let g = 0; g < b.gc; g++) {
        total += Math.min(1, b.gi[g]) * O.GLOW_ALPHA;
    }

    // Preserve the existing combined brightness limit.
    const scale =
        total > O.GLOW_TOTAL_CAP
            ? O.GLOW_TOTAL_CAP / total
            : 1;

    for (let g = 0; g < b.gc; g++) {
        const a =
            Math.min(1, b.gi[g]) *
            O.GLOW_ALPHA *
            scale;

        if (a < 0.012) continue;

        const R = b.gr[g];

        ctx.save();
        ctx.translate(b.gx[g], b.gy[g]);
        ctx.rotate(b.ga[g] || 0);

        // Elongated along the lit surface, rather than a round spot.
        ctx.scale(1.8, 0.65);

        const grad = ctx.createRadialGradient(
            0, 0, 0,
            0, 0, R
        );

        grad.addColorStop(
            0,
            "rgba(255,238,175," + a.toFixed(3) + ")"
        );

        grad.addColorStop(
            0.45,
            "rgba(255,226,152," + (a * 0.45).toFixed(3) + ")"
        );

        grad.addColorStop(
            1,
            "rgba(255,215,130,0)"
        );

        ctx.fillStyle = grad;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
    }
}

function drawObjectGlows(ctx) {
    const O = OBJLIGHT;
    if (!O.active) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < O.blockerCount; i++) {
        const b = O.blockers[i];
        if (b.gc === 0) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.beginPath();
        ctx.rotate(b.ang || 0);

        if (b.kind === 0) {
            ctx.rect(
                -b.hw,
                -b.hl,
                b.hw * 2,
                b.hl * 2
            );
        } else {
            ctx.ellipse(
                0,
                0,
                b.hw,
                b.hl,
                0,
                0,
                Math.PI * 2
            );
        }
        ctx.clip();
    
        _olDrawGlows(ctx, b);
        ctx.restore();
    }

    // Building/wall contact glows from blocked headlights.
    // Draw in world space, using the same camera transform as the objects.
    for (let i = 0; i < O.terrainGlowCount; i++) {
        const intensity = O.tgi[i];
        if (intensity < 0.06) continue;

        const nx = O.tnx[i];
        const ny = O.tny[i];
        const tangentAngle =
            Math.atan2(ny, nx) + Math.PI / 2;

        const R = 16;
        const alpha = intensity * 0.28;

        ctx.save();
        ctx.translate(O.tgx[i], O.tgy[i]);
        ctx.rotate(tangentAngle);
        ctx.scale(2.3, 0.48);

        const grad = ctx.createRadialGradient(
            0, 0, 0,
            0, 0, R
        );

        grad.addColorStop(
            0,
            "rgba(255,235,170," + alpha.toFixed(3) + ")"
        );

        grad.addColorStop(
            0.5,
            "rgba(255,220,145," + (alpha * 0.45).toFixed(3) + ")"
        );

        grad.addColorStop(
            1,
            "rgba(255,210,120,0)"
        );

        ctx.fillStyle = grad;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
    }

    ctx.restore();
}    


/* =====================================================================
 * RIVER WATER  -  flowing animation overlay + spatial river sound
 *
 * Animation
 *  - The two rivers are described by flow centre-lines (RIVER_CFG.rivers),
 *    listed IN THE DIRECTION THE WATER FLOWS. Set `reverse: true` on a river
 *    to flip it. Everything else (bank-to-bank width) is measured once from
 *    the collision map using the same blue-pixel rule the game already uses
 *    for the non-walkable river (see getTerrainType in main.js).
 *  - drawRiverOverlay() is called from drawGame() right after the map is
 *    drawn, inside the camera transform, so every other object and the HUD
 *    draw on top of it.
 *  - Only the part of the river inside the viewport is processed: rivers are
 *    split into ~240px chunks, chunks outside the view circle are skipped
 *    and the remaining streaks are batched into a handful of canvas strokes.
 *    Nothing is allocated per frame.
 *
 * Sound
 *  - A looping river.MP3 plays through Web Audio. Volume, low-pass
 *    brightness and stereo pan follow the nearest river pixels (blue pixels
 *    of the collision map), taking the camera rotation into account.
 *  - The map scan for river pixels is spread over many frames at start-up.
 * ===================================================================== */
const RIVER_SOUND_URL = "https://raw.githubusercontent.com/divanshu911/My-game-assets/refs/heads/main/river.MP3";

const RIVER_CFG = {
    CHUNK: 240,            // world px of river per culling chunk
    LINES: 14,             // bright current streaks per chunk
    BANDS: 4,              // soft dark current bands per chunk
    FOAM: 8,               // bank foam dashes per chunk
    SPARKS: 6,             // twinkling glints per chunk
    MAX_HALF_WIDTH: 160,   // measuring limit (world px)
    VIEW_MARGIN: 30,       // extra radius around the viewport
    rivers: [
        // West river: from the park pond out to the left map edge.
        { name: "west", reverse: false, pts: [1597,1565,1604,1522,1579,1481,1546,1446,1500,1433,1452,1432,1405,1440,1359,1451,1313,1465,1266,1475,1218,1473,1172,1459,1134,1430,1107,1391,1094,1345,1088,1297,1086,1249,1078,1202,1063,1156,1044,1112,1018,1072,983,1039,941,1017,900,993,856,975,809,965,764,951,732,915,710,873,691,829,668,786,639,749,603,717,563,690,519,672,472,662,424,663,379,680,343,711,319,752,302,797,296,845,296,893,312,938,336,979,356,1023,368,1069,369,1117,368,1165,349,1208,314,1241,272,1263,227,1279,181,1294,138,1314,96,1338,56,1365,26,1402,17,1411] },
        // East river: from the right map edge down to the bottom map edge.
        { name: "east", reverse: false, pts: [4076,627,4039,657,4014,698,3971,719,3926,733,3879,744,3831,748,3783,748,3736,740,3688,736,3640,732,3594,721,3546,720,3498,725,3453,740,3415,769,3391,811,3381,857,3386,905,3398,951,3409,998,3412,1046,3408,1093,3408,1141,3407,1189,3383,1230,3361,1273,3336,1314,3307,1352,3273,1386,3242,1422,3213,1456,3166,1444,3120,1432,3084,1460,3045,1485,3002,1506,2962,1534,2925,1564,2894,1601,2868,1641,2849,1685,2839,1732,2839,1779,2866,1818,2857,1865,2841,1910,2870,1941,2907,1971,2939,2007,2966,2046,2984,2091,2992,2138,2992,2186,2968,2226,2950,2264] }
    ]
};

const RIVER_STATE = {
    ready: false,
    paths: [],
    sx: 0, sy: 0,          // scratch result of riverSample()
    camX: 0, camY: 0,      // scratch camera centre
    MAXB: 700,
    bufBand: new Float32Array(700 * 4),
    bufLine: new Float32Array(700 * 4),
    bufFoam: new Float32Array(700 * 4),
    bufSpark: new Float32Array(700 * 3)
};

// Same "Non-walkable Blue River" test as getTerrainType() in main.js.
function riverIsWater(x, y) {
    if (!collisionData || mapWidth === 0) return false;
    if (x < 0 || y < 0) return false;
    const ix = x | 0, iy = y | 0;
    if (ix >= mapWidth || iy >= mapHeight) return false;
    const i = (iy * mapWidth + ix) * 4;
    const b = collisionData[i + 2];
    return b > collisionData[i] + 20 && b > collisionData[i + 1] + 10;
}

function riverRand(n) {
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
}

// Distance from (x,y) to the bank, marching along (nx,ny). Tolerates a few
// stray non-blue pixels inside the water.
function riverMeasure(x, y, nx, ny) {
    if (!riverIsWater(x, y)) return 0;
    let best = 0, miss = 0;
    for (let d = 2; d <= RIVER_CFG.MAX_HALF_WIDTH; d += 2) {
        if (riverIsWater(x + nx * d, y + ny * d)) { best = d; miss = 0; }
        else if (++miss > 2) break;
    }
    return best;
}

// Position on river path P at arc length s, shifted sideways by u
// (-1 = right bank, +1 = left bank) keeping `margin` px inside the water.
// Result in RIVER_STATE.sx / sy.
function riverSample(P, s, u, margin) {
    let lo = 0, hi = P.n - 2;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (P.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    const len = P.cum[lo + 1] - P.cum[lo] || 1;
    let f = (s - P.cum[lo]) / len;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const a = lo, b = lo + 1;
    let tx = P.tx[a] + (P.tx[b] - P.tx[a]) * f;
    let ty = P.ty[a] + (P.ty[b] - P.ty[a]) * f;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const wl = P.wl[a] + (P.wl[b] - P.wl[a]) * f;
    const wr = P.wr[a] + (P.wr[b] - P.wr[a]) * f;
    let off;
    if (u >= 0) off = u * Math.max(0, wl - margin);
    else off = u * Math.max(0, wr - margin);
    RIVER_STATE.sx = P.px[a] + (P.px[b] - P.px[a]) * f - ty * off;
    RIVER_STATE.sy = P.py[a] + (P.py[b] - P.py[a]) * f + tx * off;
}

function riverInit() {
    if (RIVER_STATE.ready) return true;
    if (!collisionData || mapWidth === 0) return false;

    const CH = RIVER_CFG.CHUNK;
    const perChunk = RIVER_CFG.LINES + RIVER_CFG.BANDS + RIVER_CFG.FOAM + RIVER_CFG.SPARKS;

    for (let r = 0; r < RIVER_CFG.rivers.length; r++) {
        const def = RIVER_CFG.rivers[r];
        const n = def.pts.length >> 1;
        const P = {
            n,
            px: new Float32Array(n), py: new Float32Array(n),
            tx: new Float32Array(n), ty: new Float32Array(n),
            wl: new Float32Array(n), wr: new Float32Array(n),
            cum: new Float32Array(n),
            total: 0, chunks: 0,
            ccx: null, ccy: null, ccr: null, items: null
        };
        for (let i = 0; i < n; i++) {
            const j = def.reverse ? n - 1 - i : i;
            P.px[i] = def.pts[j * 2];
            P.py[i] = def.pts[j * 2 + 1];
        }
        for (let i = 1; i < n; i++) {
            P.cum[i] = P.cum[i - 1] + Math.hypot(P.px[i] - P.px[i - 1], P.py[i] - P.py[i - 1]);
        }
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let dx = P.px[b] - P.px[a], dy = P.py[b] - P.py[a];
            const l = Math.hypot(dx, dy) || 1;
            dx /= l; dy /= l;
            P.tx[i] = dx; P.ty[i] = dy;
            P.wl[i] = riverMeasure(P.px[i], P.py[i], -dy, dx);
            P.wr[i] = riverMeasure(P.px[i], P.py[i], dy, -dx);
        }
        P.total = P.cum[n - 1];
        P.chunks = Math.max(1, Math.ceil(P.total / CH));

        P.ccx = new Float32Array(P.chunks);
        P.ccy = new Float32Array(P.chunks);
        P.ccr = new Float32Array(P.chunks);
        P.items = new Float32Array(P.chunks * perChunk * 5);

        let o = 0;
        for (let c = 0; c < P.chunks; c++) {
            const s0 = c * CH, s1 = Math.min(P.total, s0 + CH);
            riverSample(P, (s0 + s1) / 2, 0, 0);
            P.ccx[c] = RIVER_STATE.sx;
            P.ccy[c] = RIVER_STATE.sy;
            let maxW = 0;
            for (let i = 0; i < n; i++) {
                if (P.cum[i] >= s0 - 48 && P.cum[i] <= s1 + 48) {
                    maxW = Math.max(maxW, P.wl[i], P.wr[i]);
                }
            }
            P.ccr[c] = (s1 - s0) / 2 + maxW + 50;

            const seed = (r + 1) * 7919 + c * 104729;
            let k = 0;
            const put = (type, phase, u, speed, len) => {
                P.items[o++] = type; P.items[o++] = phase; P.items[o++] = u;
                P.items[o++] = speed; P.items[o++] = len; k++;
            };
            for (let i = 0; i < RIVER_CFG.LINES; i++) {
                const q = seed + (k + 1) * 31;
                put(0, riverRand(q + 1), (riverRand(q + 2) * 2 - 1) * 0.85,
                    34 + riverRand(q + 3) * 28, 14 + riverRand(q + 4) * 22);
            }
            for (let i = 0; i < RIVER_CFG.BANDS; i++) {
                const q = seed + (k + 1) * 31;
                put(1, riverRand(q + 1), (riverRand(q + 2) * 2 - 1) * 0.6,
                    22 + riverRand(q + 3) * 18, 30 + riverRand(q + 4) * 30);
            }
            for (let i = 0; i < RIVER_CFG.FOAM; i++) {
                const q = seed + (k + 1) * 31;
                put(2, riverRand(q + 1), (i & 1) ? 1 : -1,
                    6 + riverRand(q + 3) * 8, 6 + riverRand(q + 4) * 8);
            }
            for (let i = 0; i < RIVER_CFG.SPARKS; i++) {
                const q = seed + (k + 1) * 31;
                put(3, riverRand(q + 1), (riverRand(q + 2) * 2 - 1) * 0.9,
                    14 + riverRand(q + 3) * 14, 1.5 + riverRand(q + 4) * 2.5);
            }
        }
        RIVER_STATE.paths.push(P);
    }
    RIVER_STATE.ready = true;
    return true;
}

// Camera centre in world space (same target the camera transform uses).
function riverCameraCenter() {
    const t = (player.isArrestPassenger && arrestTransportCar) ? arrestTransportCar : player;
    const h = (t.size || player.size) / 2;
    RIVER_STATE.camX = t.x + h;
    RIVER_STATE.camY = t.y + h;
}

// Called from drawGame() right after the map is drawn (world space).
function drawRiverOverlay(c) {
    if (!RIVER_STATE.ready && !riverInit()) return;

    riverCameraCenter();
    const S = RIVER_STATE;
    const camX = S.camX, camY = S.camY;
    const viewR = Math.hypot(canvas.width, canvas.height) / 2 + RIVER_CFG.VIEW_MARGIN;
    const viewR2 = viewR * viewR;
    const CH = RIVER_CFG.CHUNK;
    const t = performance.now() * 0.001;
    const PI = Math.PI;

    let nBand = 0, nLine = 0, nFoam = 0, nSpark = 0;
    const MAXB = S.MAXB;
    const bBand = S.bufBand, bLine = S.bufLine, bFoam = S.bufFoam, bSpark = S.bufSpark;
    const per = RIVER_CFG.LINES + RIVER_CFG.BANDS + RIVER_CFG.FOAM + RIVER_CFG.SPARKS;

    for (let r = 0; r < S.paths.length; r++) {
        const P = S.paths[r];
        for (let ch = 0; ch < P.chunks; ch++) {
            const cdx = P.ccx[ch] - camX, cdy = P.ccy[ch] - camY;
            const rr = viewR + P.ccr[ch];
            if (cdx * cdx + cdy * cdy > rr * rr) continue;      // chunk outside the viewport

            let o = ch * per * 5;
            for (let k = 0; k < per; k++, o += 5) {
                const type = P.items[o];
                const u = P.items[o + 2];
                let spd = P.items[o + 3];
                if (type < 2) spd *= 1.2 - 0.45 * u * u;        // faster mid-stream
                let tt = P.items[o + 1] + t * spd / CH;
                tt -= Math.floor(tt);
                const s = (ch + tt) * CH;
                if (s >= P.total) continue;
                const env = Math.sin(PI * tt);                  // fade in / out along the chunk

                if (type === 3) {                               // glint
                    const w = Math.sin(t * (1.5 + spd * 0.1) + P.items[o + 1] * 50);
                    if (w < 0.8) continue;
                    riverSample(P, s, u, 4);
                    const x = S.sx, y = S.sy;
                    const dx = x - camX, dy = y - camY;
                    if (dx * dx + dy * dy > viewR2 || !riverIsWater(x, y) || nSpark >= MAXB) continue;
                    bSpark[nSpark * 3] = x; bSpark[nSpark * 3 + 1] = y;
                    bSpark[nSpark * 3 + 2] = Math.min(1, (w - 0.8) * 5) * env;
                    nSpark++;
                    continue;
                }

                const L = P.items[o + 4] * env;
                if (L < 2) continue;
                const margin = type === 2 ? 2.5 : type === 1 ? 5 : 3;
                riverSample(P, s, u, margin);
                const hx = S.sx, hy = S.sy;
                const dx = hx - camX, dy = hy - camY;
                if (dx * dx + dy * dy > viewR2) continue;
                riverSample(P, Math.max(0, s - L), u, margin);
                const tx = S.sx, ty = S.sy;
                if (!riverIsWater(hx, hy) || !riverIsWater(tx, ty)) continue;   // bridges / banks

                if (type === 0) {
                    if (nLine >= MAXB) continue;
                    const q = nLine++ * 4;
                    bLine[q] = tx; bLine[q + 1] = ty; bLine[q + 2] = hx; bLine[q + 3] = hy;
                } else if (type === 1) {
                    if (nBand >= MAXB) continue;
                    const q = nBand++ * 4;
                    bBand[q] = tx; bBand[q + 1] = ty; bBand[q + 2] = hx; bBand[q + 3] = hy;
                } else {
                    if (nFoam >= MAXB) continue;
                    const q = nFoam++ * 4;
                    bFoam[q] = tx; bFoam[q + 1] = ty; bFoam[q + 2] = hx; bFoam[q + 3] = hy;
                }
            }
        }
    }

    if (nBand + nLine + nFoam + nSpark === 0) return;

    c.save();
    c.lineCap = "round";

    if (nBand) {                                   // soft dark current bands
        c.strokeStyle = "rgba(8, 45, 120, 0.13)";
        c.lineWidth = 7;
        c.beginPath();
        for (let i = 0; i < nBand; i++) {
            const q = i * 4;
            c.moveTo(bBand[q], bBand[q + 1]); c.lineTo(bBand[q + 2], bBand[q + 3]);
        }
        c.stroke();
    }
    if (nLine) {                                   // current streaks: soft glow + bright core
        c.strokeStyle = "rgba(170, 215, 255, 0.16)";
        c.lineWidth = 4;
        c.beginPath();
        for (let i = 0; i < nLine; i++) {
            const q = i * 4;
            c.moveTo(bLine[q], bLine[q + 1]); c.lineTo(bLine[q + 2], bLine[q + 3]);
        }
        c.stroke();
        c.strokeStyle = "rgba(225, 242, 255, 0.5)";
        c.lineWidth = 1.3;
        c.stroke();
    }
    if (nFoam) {                                   // bank foam
        c.strokeStyle = "rgba(255, 255, 255, 0.55)";
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < nFoam; i++) {
            const q = i * 4;
            c.moveTo(bFoam[q], bFoam[q + 1]); c.lineTo(bFoam[q + 2], bFoam[q + 3]);
        }
        c.stroke();
    }
    if (nSpark) {                                  // twinkling glints
        c.fillStyle = "#ffffff";
        for (let i = 0; i < nSpark; i++) {
            const q = i * 3;
            c.globalAlpha = bSpark[q + 2] * 0.9;
            c.fillRect(bSpark[q] - 1, bSpark[q + 1] - 1, 2, 2);
        }
    }
    c.restore();
}

/* ---------------------------------------------------------------------
 * River sound (spatial)
 * ------------------------------------------------------------------- */
const RIVER_SND = {
    RANGE: 420,          // audible distance from the nearest river pixel (world px)
    LOAD_RANGE: 1000,    // start downloading the sound when this close
    MAX_GAIN: 0.8,
    ac: null, lp: null, pan: null, gain: null, src: null, buffer: null,
    loading: false, failed: false, fallback: null,
    // river pixel grid (8px blocks that are mostly blue), scanned over many frames
    scanRow: 0, gridReady: false, bx: [], by: [],
    cellsW: 0, cellsH: 0, cellStart: null, cellItems: null,
    frame: 0, nearX: 0, nearY: 0, nearFound: false, quiet: 0
};

function riverScanStep() {
    const S = RIVER_SND;
    if (S.gridReady || !collisionData || mapWidth === 0) return;
    const W = mapWidth, H = mapHeight, d = collisionData;
    const blocksX = Math.floor(W / 8), blocksY = Math.floor(H / 8);

    for (let n = 0; n < 6 && S.scanRow < blocksY; n++, S.scanRow++) {
        const y0 = S.scanRow * 8;
        for (let bxi = 0; bxi < blocksX; bxi++) {
            let count = 0;
            for (let yy = 0; yy < 8; yy++) {
                let p = ((y0 + yy) * W + bxi * 8) * 4;
                for (let xx = 0; xx < 8; xx++, p += 4) {
                    const b = d[p + 2];
                    if (b > d[p] + 20 && b > d[p + 1] + 10) count++;
                }
            }
            if (count >= 32) { S.bx.push(bxi * 8 + 4); S.by.push(y0 + 4); }
        }
    }
    if (S.scanRow < blocksY) return;

    // bucket the river blocks into 64px cells (CSR layout)
    const CW = Math.ceil(W / 64), CHt = Math.ceil(H / 64), N = S.bx.length;
    const start = new Int32Array(CW * CHt + 1);
    for (let i = 0; i < N; i++) start[(S.by[i] >> 6) * CW + (S.bx[i] >> 6) + 1]++;
    for (let i = 0; i < CW * CHt; i++) start[i + 1] += start[i];
    const fill = start.slice(0, CW * CHt);
    const items = new Int32Array(N);
    for (let i = 0; i < N; i++) items[fill[(S.by[i] >> 6) * CW + (S.bx[i] >> 6)]++] = i;
    S.cellsW = CW; S.cellsH = CHt; S.cellStart = start; S.cellItems = items;
    S.gridReady = true;
}

function riverFindNearest(px, py, range) {
    const S = RIVER_SND;
    const x0 = Math.max(0, Math.floor((px - range) / 64)), x1 = Math.min(S.cellsW - 1, Math.floor((px + range) / 64));
    const y0 = Math.max(0, Math.floor((py - range) / 64)), y1 = Math.min(S.cellsH - 1, Math.floor((py + range) / 64));
    let best = range * range, found = false;
    for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
            const c = cy * S.cellsW + cx;
            for (let k = S.cellStart[c], e = S.cellStart[c + 1]; k < e; k++) {
                const i = S.cellItems[k];
                const dx = S.bx[i] - px, dy = S.by[i] - py;
                const d2 = dx * dx + dy * dy;
                if (d2 < best) { best = d2; S.nearX = S.bx[i]; S.nearY = S.by[i]; found = true; }
            }
        }
    }
    S.nearFound = found;
}

function riverSndPrepare() {
    const S = RIVER_SND;
    if (S.ac || S.loading || S.failed) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { S.failed = true; return; }
    try {
        S.ac = new AC();
        S.gain = S.ac.createGain();
        S.gain.gain.value = 0;
        S.lp = S.ac.createBiquadFilter();
        S.lp.type = "lowpass";
        S.lp.frequency.value = 800;
        S.lp.connect(S.gain);
        if (S.ac.createStereoPanner) {
            S.pan = S.ac.createStereoPanner();
            S.gain.connect(S.pan);
            S.pan.connect(S.ac.destination);
        } else {
            S.gain.connect(S.ac.destination);
        }
    } catch (e) { S.failed = true; S.ac = null; return; }

    S.loading = true;
    fetch(RIVER_SOUND_URL, { mode: "cors" })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => S.ac.decodeAudioData(ab, res, rej)))
        .then(buf => { S.buffer = buf; S.loading = false; })
        .catch(err => {
            console.warn("River sound: Web Audio load failed, using plain audio.", err);
            S.loading = false;
            S.failed = true;
            try { S.ac.close(); } catch (e) {}
            S.ac = null;
        });
}

function riverSndStop() {
    const S = RIVER_SND;
    if (S.src) {
        try { S.src.stop(); } catch (e) {}
        try { S.src.disconnect(); } catch (e) {}
        S.src = null;
    }
    if (S.fallback && !S.fallback.paused) S.fallback.pause();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) riverSndStop(); });

// Called every frame from updateGame().
function updateRiverAmbience(dt) {
    const S = RIVER_SND;
    riverScanStep();

    const outdoors = !(typeof isInsideHouse !== "undefined" && isInsideHouse) &&
                     !(typeof isInsideDealership !== "undefined" && isInsideDealership);
    const active = gameActive && outdoors && !showFullMap && !fullMapAnimating &&
                   !document.hidden && S.gridReady;

    let target = 0, cutoff = 800, panValue = 0;

    if (active) {
        riverCameraCenter();
        const cx = RIVER_STATE.camX, cy = RIVER_STATE.camY;
        if ((S.frame++ & 3) === 0) riverFindNearest(cx, cy, S.LOAD_RANGE);

        if (S.nearFound) {
            const dx = S.nearX - cx, dy = S.nearY - cy;
            const d = Math.max(0, Math.hypot(dx, dy) - 4);
            if (d < S.LOAD_RANGE) riverSndPrepare();
            if (d < S.RANGE) {
                const k = 1 - d / S.RANGE;
                target = S.MAX_GAIN * k * k;
                cutoff = 800 + 17200 * k * k;
                // world offset -> screen space (the camera is rotated by -camera.angle)
                const a = camera.angle;
                const sx = dx * Math.cos(a) + dy * Math.sin(a);
                panValue = Math.max(-1, Math.min(1, sx / (d + 60))) * 0.9;
            }
        }
    }

    if (S.buffer && S.ac) {
        if (target > 0.004) {
            S.quiet = 0;
            if (!S.src) {
                const src = S.ac.createBufferSource();
                src.buffer = S.buffer;
                src.loop = true;
                src.connect(S.lp);
                src.start(0, Math.random() * S.buffer.duration);
                S.src = src;
            }
            if (S.ac.state === "suspended") S.ac.resume().catch(() => {});
        } else if (S.src) {
            S.quiet += dt / 60;
            if (S.quiet > 1.5) riverSndStop();
        }
        if (S.src) {
            const now = S.ac.currentTime;
            S.gain.gain.setTargetAtTime(target, now, 0.12);
            S.lp.frequency.setTargetAtTime(cutoff, now, 0.12);
            if (S.pan) S.pan.pan.setTargetAtTime(panValue, now, 0.08);
        }
    } else if (S.failed && !S.ac) {
        // Fallback: plain looping audio, distance volume only (no pan).
        if (!S.fallback) {
            S.fallback = new Audio(RIVER_SOUND_URL);
            S.fallback.loop = true;
        }
        if (target > 0.004) {
            S.fallback.volume = Math.min(1, target);
            if (S.fallback.paused) S.fallback.play().catch(() => {});
        } else if (!S.fallback.paused) {
            S.fallback.pause();
        }
    }
}

const LOCATION_CHECK_INTERVAL = 15;
const locationProximityCache = Object.create(null);

function isWithinLocationRadiusCached(key, x, y, centerX, centerY, radius) {
    let cached = locationProximityCache[key];

    if (
        !cached ||
        --cached.framesUntilCheck <= 0
    ) {
        const dx = x - centerX;
        const dy = y - centerY;

        cached = locationProximityCache[key] = {
            inside: dx * dx + dy * dy < radius * radius,
            framesUntilCheck: LOCATION_CHECK_INTERVAL
        };
    }

    return cached.inside;
}