"use strict";

const WORLD_WIDTH = 400;
const CENTER_X = WORLD_WIDTH / 2;
const LAYER_WIDTH = 122;
const CENTIMETERS_PER_LAYER = 5;
const GIFT_HEIGHT_CM = 1000;
const MAX_BALANCE = 0.95;
const MAX_LANDING_OFFSET = LAYER_WIDTH * 0.54;
const FALL_DURATION = 0.92;
const BEST_KEY = "burger-tower-best-layers";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const ingredients = [
  { file: "bun-down" },
  { file: "becon", name: "Бекон" },
  { file: "chees", name: "Сыр" },
  { file: "cutlet", name: "Котлета" },
  { file: "onion", name: "Лук" },
  { file: "pickls", name: "Огурцы" },
  { file: "salat", name: "Салат" },
  { file: "sauce", name: "Соус" },
  { file: "tomato", name: "Помидоры" },
  { file: "bun-up", width: 126 },
];
const bottomBun = ingredients[0];
const topBun = ingredients[ingredients.length - 1];
const fillings = ingredients.slice(1, -1);

const ui = Object.fromEntries(
  ["board", "playfield", "action", "welcome", "ingredient", "height", "best", "caption", "gift"]
    .map(id => [id, document.getElementById(id)]),
);
const ctx = ui.board.getContext("2d");
const counter = document.querySelector(".counter");
const number = new Intl.NumberFormat("ru", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let best = loadBest();
let phase = "loading";
let stack = [];
let bag = [];
let previousFilling;
let piece;
let balance = 0;
let lean = 0;
let fallDirection = 0;
let roundTime = 0;
let giftShown = false;
let elapsed = 0;
let lastFrame = 0;
let frameId = 0;
let camera = 0;
let width = 0;
let height = 0;

function formatHeight(layerCount) {
  return `${number.format(layerCount * CENTIMETERS_PER_LAYER / 100)} м`;
}

function loadBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // The score still works when site storage is unavailable.
  }
}

function updateScore() {
  ui.height.textContent = formatHeight(stack.length);
  ui.best.textContent = best ? formatHeight(best) : "—";
}

function nextFilling() {
  if (!bag.length) {
    bag = [...fillings];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[bag.length - 1] === previousFilling) {
      const last = bag.length - 1;
      [bag[0], bag[last]] = [bag[last], bag[0]];
    }
  }
  previousFilling = bag.pop();
  return previousFilling;
}

function topLayer() {
  return stack[stack.length - 1];
}

function towerSway(y) {
  return lean * 64 * y / Math.max(64, topLayer().y);
}

function layerX(layer) {
  return layer.x + towerSway(layer.y);
}

function showGiftIfEarned() {
  if (giftShown || stack.length * CENTIMETERS_PER_LAYER < GIFT_HEIGHT_CM) return;
  giftShown = true;
  ui.gift.showModal();
}

function begin() {
  stack = [{ sprite: bottomBun, x: CENTER_X, y: 0 }];
  bag = [];
  previousFilling = null;
  balance = 0;
  lean = 0;
  fallDirection = 0;
  roundTime = 0;
  giftShown = false;
  camera = 0;
  ui.welcome.hidden = true;
  ui.action.textContent = "Положить слой";
  ui.action.disabled = false;
  ui.playfield.disabled = false;
  ui.playfield.setAttribute("aria-label", "Положить слой");
  updateBalanceHint();
  updateScore();
  spawn();
  requestDraw();
}

function spawn() {
  const sprite = nextFilling();
  const leftLimit = sprite.width / 2 + 4;
  const rightLimit = WORLD_WIDTH - leftLimit;
  const fromLeft = Math.random() < 0.5;
  piece = {
    sprite,
    x: fromLeft ? leftLimit : rightLimit,
    y: topLayer().y + topLayer().sprite.rise + dropGap(sprite),
    direction: fromLeft ? 1 : -1,
    leftLimit,
    rightLimit,
  };
  ui.ingredient.textContent = sprite.name;
  ui.ingredient.hidden = false;
  phase = "aiming";
}

function dropGap(sprite) {
  return Math.max(64, Math.min(125, worldHeight() * 0.26 - sprite.height));
}

function place() {
  if (ui.gift.open) return;
  if (phase === "ready" || phase === "finished") {
    begin();
  } else if (phase === "aiming") {
    elapsed = 0;
    piece.startY = piece.y;
    phase = "dropping";
    requestDraw();
  }
}

function updateBalanceHint() {
  const message = Math.abs(balance) >= 0.55
    ? (balance > 0 ? "Башня наклоняется вправо" : "Башня наклоняется влево")
    : "Коснись, когда слой окажется над башней";
  if (ui.caption.textContent !== message) ui.caption.textContent = message;
}

function landing() {
  const support = topLayer();
  const offset = piece.x - layerX(support);
  const nextBalance = balance * 0.76 + offset / (LAYER_WIDTH * 0.78);
  const tooFar = Math.abs(offset) > MAX_LANDING_OFFSET;
  if (tooFar || Math.abs(nextBalance) >= MAX_BALANCE) {
    fallDirection = Math.sign(tooFar ? offset : nextBalance);
    ui.ingredient.hidden = true;
    ui.caption.textContent = "Башня падает!";
    ui.playfield.disabled = true;
    ui.action.disabled = true;
    phase = "falling";
    elapsed = 0;
    if (reducedMotion) finish();
    return;
  }

  // Let layers settle slightly towards the middle so small errors can be corrected.
  const x = CENTER_X + (piece.x - towerSway(support.y) - CENTER_X) * 0.76;
  stack.push({ sprite: piece.sprite, x, y: piece.y });
  balance = nextBalance;
  updateScore();
  updateBalanceHint();
  spawn();
  showGiftIfEarned();
}

function finish() {
  const newRecord = stack.length > best;
  if (newRecord) {
    best = stack.length;
    saveBest();
  }
  updateScore();
  phase = "finished";
  camera = 0;
  ui.playfield.disabled = false;
  ui.playfield.setAttribute("aria-label", "Сыграть ещё");
  ui.action.disabled = false;
  ui.action.textContent = "Сыграть ещё";
  ui.action.focus({ preventScroll: true });
  const label = newRecord ? "Новый рекорд!" : "Башня упала.";
  ui.caption.textContent = `${label} ${formatHeight(stack.length)}`;
}

function advance(dt) {
  if (ui.gift.open) return;
  if (phase === "aiming" || phase === "dropping") {
    roundTime += dt;
    lean += (balance - lean) * (1 - Math.exp(-dt * 8));
  }

  if (phase === "aiming") {
    const speed = Math.min(292, 116 + roundTime * 3.4 + (stack.length - 1) * 0.65);
    piece.x += piece.direction * speed * dt;
    if (piece.x < piece.leftLimit || piece.x > piece.rightLimit) {
      const edge = piece.direction > 0 ? piece.rightLimit : piece.leftLimit;
      piece.x = edge * 2 - piece.x;
      piece.direction *= -1;
    }
  }

  if (phase === "dropping") {
    elapsed += dt;
    const progress = Math.min(1, elapsed / 0.21);
    const support = topLayer();
    const targetY = support.y + support.sprite.rise;
    piece.y = piece.startY + (targetY - piece.startY) * progress ** 1.7;

    if (progress === 1) landing();
  } else if (phase === "falling") {
    elapsed += dt;
    if (elapsed >= FALL_DURATION) finish();
  }
}

function resize() {
  width = ui.board.clientWidth;
  height = ui.board.clientHeight;
  const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
  ui.board.width = Math.round(width * pixelRatio);
  ui.board.height = Math.round(height * pixelRatio);
  requestDraw();
}

function worldHeight() {
  return height * WORLD_WIDTH / (width || WORLD_WIDTH);
}

function drawSprite(sprite, x, y) {
  ctx.drawImage(sprite.image, x - sprite.width / 2, y - sprite.height, sprite.width, sprite.height);
}

function drawTiltedSprite(sprite, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawSprite(sprite, 0, 0);
  ctx.restore();
}

function drawArrow(support) {
  ctx.save();
  ctx.translate(layerX(support), -support.y - support.sprite.height - 7);
  ctx.fillStyle = Math.abs(balance) >= 0.55 ? "#a13a27" : "#245444";
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(7, -7);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTower(floor, field) {
  // Skip layers that have scrolled below the camera.
  let firstVisible = stack.length - 1;
  while (firstVisible > 0 && floor - stack[firstVisible].y < field + 100) {
    firstVisible--;
  }
  for (let i = firstVisible; i < stack.length; i++) {
    const layer = stack[i];
    const angle = lean * 0.27 * Math.min(1, layer.y / 56);
    drawTiltedSprite(layer.sprite, layerX(layer), -layer.y, angle);
  }
}

function drawCollapse(floor, field) {
  const progress = Math.min(1, elapsed / FALL_DURATION);
  const pivotY = Math.max(0, floor - field * 0.90);
  const drop = progress ** 3 * field * 0.55;
  const turn = fallDirection * progress ** 1.65 * 1.54;
  const support = topLayer();

  ctx.save();
  ctx.globalAlpha = Math.min(1, (1 - progress) * 4);
  ctx.translate(CENTER_X, -pivotY + drop);
  ctx.rotate(turn);
  ctx.translate(-CENTER_X, pivotY);
  drawTower(floor, field);
  drawTiltedSprite(piece.sprite, piece.x + fallDirection * 44 * progress,
    -piece.y + 170 * progress ** 2, fallDirection * progress * 1.7);
  const lift = Math.max(0, 1 - progress * 3) * 62;
  drawTiltedSprite(topBun, layerX(support), -(support.y + support.sprite.rise + lift), lean * 0.27);
  ctx.restore();
}

function drawPile() {
  const layers = stack.slice(-5).map(layer => layer.sprite);
  layers.push(piece.sprite, topBun);
  for (let i = 0; i < layers.length; i++) {
    const x = CENTER_X + fallDirection * (i % 2 === 0 ? i * 9 : -i * 6);
    const y = -Math.min(i, 5) * 4;
    const angle = fallDirection * (i % 2 === 0 ? i : -i) * 0.075;
    drawTiltedSprite(layers[i], x, y, angle);
  }
}

function draw(dt) {
  if (!stack.length || !width || !height) return false;

  const field = worldHeight();
  const base = field * 0.80;
  const head = topLayer().y + topLayer().sprite.height;
  const playing = phase === "aiming" || phase === "dropping";
  const falling = phase === "falling";
  const desiredCamera = playing ? Math.max(0, head - field * 0.34) : 0;
  const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
  if (!falling) camera += (desiredCamera - camera) * blend;

  const scale = ui.board.width / WORLD_WIDTH;
  const floor = base + camera;
  counter.style.transform = `translateY(${camera * width / WORLD_WIDTH}px)`;
  ctx.setTransform(scale, 0, 0, ui.board.height / field, 0, 0);
  ctx.clearRect(0, 0, WORLD_WIDTH, field);
  ctx.translate(0, floor);

  ctx.fillStyle = "#673d2480";
  ctx.beginPath();
  ctx.ellipse(CENTER_X, -1, LAYER_WIDTH * 0.54, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (falling) drawCollapse(floor, field);
  else if (phase === "finished") drawPile();
  else drawTower(floor, field);

  if (phase === "aiming") drawArrow(topLayer());
  if (playing) drawSprite(piece.sprite, piece.x, -piece.y);

  return !ui.gift.open && (playing || falling);
}

function requestDraw() {
  if (!frameId) frameId = requestAnimationFrame(tick);
}

function tick(now) {
  frameId = 0;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
  lastFrame = now;
  advance(dt);
  if (draw(dt)) requestDraw();
  else lastFrame = 0;
}

ui.playfield.addEventListener("click", place);
ui.action.addEventListener("click", place);
ui.gift.addEventListener("close", () => {
  ui.action.focus({ preventScroll: true });
  requestDraw();
});
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (!event.repeat) place();
});
new ResizeObserver(resize).observe(ui.board);

Promise.all(ingredients.map(async sprite => {
  const image = new Image();
  sprite.image = image;
  const version = sprite === topBun ? "?v=2" : "";
  image.src = `assets/${sprite.file}.png${version}`;
  await image.decode();
  sprite.width ??= LAYER_WIDTH;
  sprite.height = sprite.width * image.naturalHeight / image.naturalWidth;
  sprite.rise = sprite.height * (sprite === bottomBun ? 0.73 : 0.62);
})).then(() => {
  stack = [{ sprite: bottomBun, x: CENTER_X, y: 0 }];
  phase = "ready";
  ui.action.textContent = "Начать игру";
  ui.action.disabled = false;
  ui.playfield.disabled = false;
  ui.playfield.setAttribute("aria-label", "Начать игру");
  updateScore();
  resize();
}).catch(() => {
  ui.caption.textContent = "Ингредиенты не загрузились. Попробуй ещё раз.";
  ui.action.textContent = "Обновить страницу";
  ui.action.disabled = false;
  ui.action.addEventListener("click", () => location.reload(), { once: true });
});
