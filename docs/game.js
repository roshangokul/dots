"use strict";

// Distances are pixels; speeds are pixels per second. Tune the game here.
const DOT_RADIUS = 19;
const GRAVITY = 980;
const BOUNCINESS = 0.76;
const MAX_DOTS = 140;
const PHYSICS_STEP = 1 / 120;
const MERGE_DELAY = 170; // Milliseconds before a new dot can merge again.

const COLORS = [
  { name: "coral", hex: "#ff6b53" },
  { name: "butter", hex: "#eebd48" },
  { name: "sage", hex: "#8bab77" },
  { name: "sky", hex: "#78b6cf" },
  { name: "lavender", hex: "#ad9bd1" },
  { name: "rose", hex: "#e59bad" },
  { name: "tangerine", hex: "#efa15a" },
  { name: "ink", hex: "#606d87" },
];

// Find page elements once, rather than searching during every animation frame.
const canvas = document.querySelector("#canvas");
const context = canvas.getContext("2d");
const stage = document.querySelector("#stage");
const palette = document.querySelector("#palette");
const colorName = document.querySelector("#colorname");
const dotCount = document.querySelector("#dotcount");
const mergeCount = document.querySelector("#mergecount");
const hint = document.querySelector("#hint");
const soundButton = document.querySelector("#sound");
const guideCheckbox = document.querySelector("#guides");
const slowCheckbox = document.querySelector("#slow");
const toast = document.querySelector("#toast");

let width = 800;
let height = 600;
let dots = [];
let mergeRings = [];
let totalMerges = 0;
let selectedColor = 0;
let pointer = null;
let hasStarted = false;
let soundEnabled = false;
let audioContext;
let toastTimer;
let demoTimer;
let previousFrameTime = 0;
let timeToSimulate = 0;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// A dot is a plain object: position, velocity, size, color, and animation state.
function createDot(x, y, color, radius = DOT_RADIUS) {
  return {
    x,
    y,
    velocityX: 0,
    velocityY: 0,
    radius,
    color,
    createdAt: performance.now(),
    squash: 0,
  };
}

// --- Palette and player controls ---

function buildPalette() {
  COLORS.forEach((color, index) => {
    const button = document.createElement("button");
    button.className = "swatch";
    button.style.setProperty("--color", color.hex);
    button.setAttribute("aria-label", color.name);
    button.title = `${color.name} (${index + 1})`;
    button.addEventListener("click", () => selectColor(index));
    palette.append(button);
  });
  selectColor(0);
}

function selectColor(index) {
  selectedColor = index;
  palette.querySelectorAll("button").forEach((button, buttonIndex) => {
    button.setAttribute("aria-pressed", String(buttonIndex === index));
  });
  const number = String(index + 1).padStart(2, "0");
  colorName.textContent = `${number} — ${COLORS[index].name}`;
}

function updateCounters() {
  dotCount.textContent = dots.length;
  mergeCount.textContent = totalMerges;
}

function dropDot(x, y) {
  if (dots.length >= MAX_DOTS) {
    showToast("A full little universe. Start fresh to play again.");
    return;
  }

  hasStarted = true;
  clearTimeout(demoTimer);
  hint.style.opacity = 0;
  x = clamp(x, DOT_RADIUS + 1, width - DOT_RADIUS - 1);
  y = clamp(y, DOT_RADIUS + 1, height - DOT_RADIUS - 1);
  dots.push(createDot(x, y, selectedColor));
  updateCounters();
  playTone(DOT_RADIUS, 0.025);
}

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

canvas.addEventListener("pointermove", (event) => {
  pointer = pointerPosition(event);
});

canvas.addEventListener("pointerleave", () => {
  pointer = null;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  canvas.focus();
  pointer = pointerPosition(event);
  dropDot(pointer.x, pointer.y);
});

window.addEventListener("keydown", (event) => {
  // Let buttons and checkboxes keep their normal keyboard behavior.
  if (event.target.matches("input, button")) return;
  if (/^[1-8]$/.test(event.key)) selectColor(Number(event.key) - 1);
  if (event.key.toLowerCase() === "r") resetGame();
  if (event.code === "Space") {
    event.preventDefault();
    dropDot(pointer?.x ?? width / 2, pointer?.y ?? 65);
  }
});

function resetGame() {
  dots = [];
  mergeRings = [];
  totalMerges = 0;
  hasStarted = false;
  hint.style.opacity = 1;
  updateCounters();
  clearTimeout(demoTimer);
  demoTimer = setTimeout(addDemoDots, 800);
}

function addDemoDots() {
  if (hasStarted) return;
  const demo = [
    { position: 0.25, color: 0, velocity: 35 },
    { position: 0.43, color: 1, velocity: -25 },
    { position: 0.59, color: 2, velocity: 20 },
    { position: 0.75, color: 4, velocity: -30 },
    { position: 0.35, color: 3, velocity: 15 },
  ];
  demo.forEach((item, index) => {
    const dot = createDot(
      width * item.position,
      height - 40 - index * 13,
      item.color,
      25 + (index % 3) * 8,
    );
    dot.velocityX = item.velocity;
    dot.velocityY = -160 - index * 20;
    dot.createdAt -= 1000;
    dots.push(dot);
  });
  updateCounters();
}

document.querySelector("#reset").addEventListener("click", resetGame);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  soundButton.style.color = soundEnabled ? "#ff6b53" : "#6e7167";
  if (soundEnabled) playTone(30);
});

// --- Physics: movement, walls, merging, and collisions ---

function moveDot(dot, seconds) {
  dot.velocityY += GRAVITY * seconds;
  dot.x += dot.velocityX * seconds;
  dot.y += dot.velocityY * seconds;
  dot.velocityX *= Math.pow(0.995, seconds * 60);
  dot.squash *= 0.88;

  if (dot.x < dot.radius) {
    dot.x = dot.radius;
    dot.velocityX = Math.abs(dot.velocityX) * BOUNCINESS;
  }
  if (dot.x > width - dot.radius) {
    dot.x = width - dot.radius;
    dot.velocityX = -Math.abs(dot.velocityX) * BOUNCINESS;
  }
  if (dot.y < dot.radius) {
    dot.y = dot.radius;
    dot.velocityY = Math.abs(dot.velocityY) * BOUNCINESS;
  }
  if (dot.y > height - dot.radius) {
    dot.y = height - dot.radius;
    const impact = Math.abs(dot.velocityY);
    dot.velocityY = impact < 28 ? 0 : -impact * BOUNCINESS;
    dot.velocityX *= 0.985;
    if (impact > 100) {
      dot.squash = Math.min(0.15, impact / 3500);
      playTone(dot.radius, 0.012);
    }
  }
}

function canMerge(first, second, now) {
  // Keep the existing size limit so a single circle cannot fill the entire stage.
  const combinedRadius = Math.hypot(first.radius, second.radius);
  return first.color === second.color
    && now - first.createdAt > MERGE_DELAY
    && now - second.createdAt > MERGE_DELAY
    && combinedRadius <= Math.min(width, height) * 0.43;
}

function mergeDots(first, second, now) {
  // Area is proportional to radius squared. Adding areas conserves material;
  // using area as mass also lets larger dots carry more momentum. Pi cancels out.
  const firstMass = first.radius ** 2;
  const secondMass = second.radius ** 2;
  const totalMass = firstMass + secondMass;
  const average = (a, b) => (a * firstMass + b * secondMass) / totalMass;
  const radius = Math.sqrt(totalMass);
  const merged = createDot(
    clamp(average(first.x, second.x), radius, width - radius),
    clamp(average(first.y, second.y), radius, height - radius),
    first.color,
    radius,
  );
  merged.velocityX = average(first.velocityX, second.velocityX);
  merged.velocityY = Math.min(-110, average(first.velocityY, second.velocityY) - 105);
  merged.createdAt = now;
  merged.squash = 0.18;

  // The upward kick and expanding ring give each merge a little pop.
  mergeRings.push({ x: merged.x, y: merged.y, radius, color: merged.color, life: 1 });
  totalMerges++;
  playTone(radius, 0.06);
  return merged;
}

function bounceDots(first, second, distance, offsetX, offsetY) {
  // The normal points between the centers. Choose a horizontal normal when
  // centers coincide, since dividing by zero would corrupt the simulation.
  const normalX = distance > 0.001 ? offsetX / distance : 1;
  const normalY = distance > 0.001 ? offsetY / distance : 0;
  const inverseMassFirst = 1 / first.radius ** 2;
  const inverseMassSecond = 1 / second.radius ** 2;
  const inverseMassTotal = inverseMassFirst + inverseMassSecond;

  // Push overlapping dots apart, moving the smaller (lighter) dot farther.
  const overlap = first.radius + second.radius - distance;
  const correction = Math.max(0, overlap - 0.05) * 0.8 / inverseMassTotal;
  first.x -= normalX * correction * inverseMassFirst;
  first.y -= normalY * correction * inverseMassFirst;
  second.x += normalX * correction * inverseMassSecond;
  second.y += normalY * correction * inverseMassSecond;

  const approachSpeed = (second.velocityX - first.velocityX) * normalX
    + (second.velocityY - first.velocityY) * normalY;
  if (approachSpeed >= 0) return; // Already separating; no extra bounce needed.

  const impulse = -(1 + BOUNCINESS) * approachSpeed / inverseMassTotal;
  first.velocityX -= impulse * normalX * inverseMassFirst;
  first.velocityY -= impulse * normalY * inverseMassFirst;
  second.velocityX += impulse * normalX * inverseMassSecond;
  second.velocityY += impulse * normalY * inverseMassSecond;
}

function resolveCollisions(now) {
  for (let firstIndex = 0; firstIndex < dots.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < dots.length; secondIndex++) {
      const first = dots[firstIndex];
      const second = dots[secondIndex];
      const offsetX = second.x - first.x;
      const offsetY = second.y - first.y;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance >= first.radius + second.radius) continue;

      if (canMerge(first, second, now)) {
        dots[firstIndex] = mergeDots(first, second, now);
        dots.splice(secondIndex, 1);
        updateCounters();
        break; // Check the replacement dot on the next collision pass.
      }
      bounceDots(first, second, distance, offsetX, offsetY);
    }
  }
}

function updatePhysics(seconds) {
  const now = performance.now();
  dots.forEach((dot) => moveDot(dot, seconds));
  // Repeat collision resolution to help stacks settle without sinking together.
  for (let pass = 0; pass < 3; pass++) resolveCollisions(now);
  mergeRings.forEach((ring) => { ring.life -= seconds * 2; });
  mergeRings = mergeRings.filter((ring) => ring.life > 0);
}

// --- Drawing ---

function drawCircle(x, y, radius) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawDropGuide() {
  if (!pointer || !guideCheckbox.checked) return;
  const x = clamp(pointer.x, DOT_RADIUS, width - DOT_RADIUS);
  const y = clamp(pointer.y, DOT_RADIUS, height - DOT_RADIUS);
  context.save();
  context.setLineDash([3, 7]);
  context.strokeStyle = COLORS[selectedColor].hex + "45";
  context.beginPath();
  context.moveTo(x, y + DOT_RADIUS);
  context.lineTo(x, height - 12);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 0.22;
  context.fillStyle = COLORS[selectedColor].hex;
  drawCircle(x, y, DOT_RADIUS);
  context.restore();
}

function drawMergeRings() {
  context.save();
  for (const ring of mergeRings) {
    context.beginPath();
    context.arc(ring.x, ring.y, ring.radius + (1 - ring.life) * 40, 0, Math.PI * 2);
    context.strokeStyle = COLORS[ring.color].hex;
    context.globalAlpha = ring.life * 0.35;
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

function drawDot(dot, now) {
  const age = Math.min(1, (now - dot.createdAt) / 180);
  const pop = 1 + 0.12 * Math.sin(age * Math.PI);
  context.save();
  context.translate(dot.x, dot.y);
  // Briefly stretch sideways and squash vertically after an impact.
  context.scale((1 + dot.squash) * pop, (1 - dot.squash) * pop);
  context.fillStyle = COLORS[dot.color].hex;
  drawCircle(0, 0, dot.radius);
  context.restore();
}

function draw() {
  context.clearRect(0, 0, width, height);
  drawDropGuide();
  drawMergeRings();
  const now = performance.now();
  dots.forEach((dot) => drawDot(dot, now));
}

function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  width = stage.clientWidth;
  height = stage.clientHeight;
  // Extra canvas pixels keep circles sharp on Retina screens.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  for (const dot of dots) {
    dot.x = clamp(dot.x * width / oldWidth, dot.radius, width - dot.radius);
    dot.y = clamp(dot.y * height / oldHeight, dot.radius, height - dot.radius);
  }
}

// --- Optional sound and short status messages ---

function playTone(size, volume = 0.05) {
  if (!soundEnabled) return;
  try {
    // Browsers require a user gesture before starting audio.
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(230 + 900 / (size / 10 + 1), now);
    oscillator.frequency.exponentialRampToValueAtTime(130, now + 0.16);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(now + 0.23);
  } catch {
    // Audio is optional; an unavailable device should never stop play.
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = 0; }, 1800);
}

// Fixed physics steps keep motion consistent across screen refresh rates.
// Cap elapsed time so returning from a background tab doesn't cause a huge jump.
function animate(timestamp) {
  const elapsed = Math.min((timestamp - (previousFrameTime || timestamp)) / 1000, 0.04);
  previousFrameTime = timestamp;
  timeToSimulate += elapsed * (slowCheckbox.checked ? 0.35 : 1);
  while (timeToSimulate >= PHYSICS_STEP) {
    updatePhysics(PHYSICS_STEP);
    timeToSimulate -= PHYSICS_STEP;
  }
  draw();
  requestAnimationFrame(animate);
}

buildPalette();
resizeCanvas();
new ResizeObserver(resizeCanvas).observe(stage);
demoTimer = setTimeout(addDemoDots, 500);
requestAnimationFrame(animate);
