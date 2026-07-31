
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
    if (car.lastX === undefined || car.lastY === undefined) {
        car.lastX = car.x;
        car.lastY = car.y;
        car.lastAngle = car.angle;
        return;
    }

    // Measure movement distance since last frame
    const dx = car.x - car.lastX;
    const dy = car.y - car.lastY;
    const distSq = dx * dx + dy * dy;

    // Skip drawing if car teleported/respawned (> 50px) or is stationary (< 0.2px)
    if (distSq > 2500 || distSq < 0.04) {
        car.lastX = car.x;
        car.lastY = car.y;
        car.lastAngle = car.angle;
        return;
    }

    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const prevCos = Math.cos(car.lastAngle !== undefined ? car.lastAngle : car.angle);
    const prevSin = Math.sin(car.lastAngle !== undefined ? car.lastAngle : car.angle);

    const rw = car.width / 2 - 2;
    const rl = car.length / 2 - 4;

    // Calculate current rear wheel coordinates
    const lrX = car.x + (-rw * cos - rl * sin);
    const lrY = car.y + (-rw * sin + rl * cos);
    const rrX = car.x + (rw * cos - rl * sin);
    const rrY = car.y + (rw * sin + rl * cos);

    // Calculate previous rear wheel coordinates using last frame position & angle
    const prevLrX = car.lastX + (-rw * prevCos - rl * prevSin);
    const prevLrY = car.lastY + (-rw * prevSin + rl * prevCos);
    const prevRrX = car.lastX + (rw * prevCos - rl * prevSin);
    const prevRrY = car.lastY + (rw * prevSin + rl * prevCos);

    tyreMarks.push(
        { x1: prevLrX, y1: prevLrY, x2: lrX, y2: lrY, alpha: 0.5, life: 500 },
        { x1: prevRrX, y1: prevRrY, x2: rrX, y2: rrY, alpha: 0.5, life: 500 }
    );

    // Update position memory for next frame
    car.lastX = car.x;
    car.lastY = car.y;
    car.lastAngle = car.angle;
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