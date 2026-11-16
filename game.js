"use strict";

const WORLD_WIDTH = 400;
const LAYER_WIDTH = 122;
const CENTIMETERS_PER_LAYER = 5;
const GIFT_HEIGHT_CM = 100;
const ALIGNMENT_TOLERANCE = 7;
const SCRAP_DURATION = 0.44;
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
  ["board", "playfield", "action", "welcome", "ingredient", "height", "best", "caption", "gift", "giftContinue"]
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
let scraps = [];
let roundTime = 0;
let giftShown = false;
let elapsed = 0;
let lastFrame = 0;
let frameId = 0;
let camera = 0;
let zoom = 1;
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

function fullLayer(sprite, x, y) {
  return { sprite, x, y, left: x - sprite.width / 2, right: x + sprite.width / 2 };
}

function centerOf(layer) {
  return (layer.left + layer.right) / 2;
}

function showGiftIfEarned() {
  if (giftShown || stack.length * CENTIMETERS_PER_LAYER < GIFT_HEIGHT_CM) return;
  giftShown = true;
  ui.giftContinue.textContent = phase === "finished" ? "К результату" : "Продолжить игру";
  ui.gift.showModal();
}

function begin() {
  stack = [fullLayer(bottomBun, WORLD_WIDTH / 2, 0)];
  bag = [];
  previousFilling = null;
  scraps = [];
  roundTime = 0;
  giftShown = false;
  zoom = 1;
  camera = 0;
  ui.welcome.hidden = true;
  ui.action.textContent = "Положить слой";
  ui.playfield.disabled = false;
  ui.playfield.setAttribute("aria-label", "Положить слой");
  ui.caption.textContent = "Коснись, когда слой окажется над башней";
  updateScore();
  spawn();
  requestDraw();
}

function spawn() {
  const sprite = nextFilling();
  const leftLimit = 38;
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

function addScrap(layer, left, right, direction) {
  if (right <= left) return;
  scraps.push({ ...layer, left, right, direction, age: 0 });
}

function landing() {
  const support = topLayer();
  const center = centerOf(support);
  const x = Math.abs(piece.x - center) <= ALIGNMENT_TOLERANCE ? center : piece.x;
  const layer = fullLayer(piece.sprite, x, piece.y);
  const left = Math.max(layer.left, support.left);
  const right = Math.min(layer.right, support.right);
  if (right > left) {
    stack.push({ ...layer, left, right });
    addScrap(layer, layer.left, left, -1);
    addScrap(layer, right, layer.right, 1);
    updateScore();
    spawn();
    showGiftIfEarned();
    return;
  }

  addScrap(layer, layer.left, layer.right, Math.sign(piece.x - center));
  const targetY = support.y + support.sprite.rise;
  const capWidth = Math.min(topBun.width, Math.max(LAYER_WIDTH * 0.30, support.right - support.left + 8));
  const cap = { ...topBun, width: capWidth, height: topBun.height * capWidth / topBun.width };
  piece = {
    sprite: cap,
    x: center,
    y: targetY + 84,
    startY: targetY + 84,
  };
  ui.ingredient.hidden = true;
  ui.caption.textContent = "Промах! Закрываем бургер…";
  phase = "closing";
  elapsed = 0;
}

function finish() {
  stack.push(fullLayer(piece.sprite, piece.x, piece.y));
  const newRecord = stack.length > best;
  if (newRecord) {
    best = stack.length;
    saveBest();
  }
  updateScore();
  phase = "finished";
  ui.playfield.setAttribute("aria-label", "Сыграть ещё");
  ui.action.textContent = "Сыграть ещё";
  const label = newRecord ? "Новый рекорд!" : "Бургер готов!";
  ui.caption.textContent = `${label} ${formatHeight(stack.length)}`;
  showGiftIfEarned();
}

function advance(dt) {
  if (ui.gift.open) return;
  for (const scrap of scraps) scrap.age += dt;
  scraps = scraps.filter(scrap => scrap.age < SCRAP_DURATION);
  if (phase === "aiming" || phase === "dropping") roundTime += dt;

  if (phase === "aiming") {
    const speed = Math.min(350, 116 + roundTime * 6 + (stack.length - 1) * 2);
    piece.x += piece.direction * speed * dt;
    if (piece.x < piece.leftLimit || piece.x > piece.rightLimit) {
      const edge = piece.direction > 0 ? piece.rightLimit : piece.leftLimit;
      piece.x = edge * 2 - piece.x;
      piece.direction *= -1;
    }
  }

  if (phase === "dropping" || phase === "closing") {
    elapsed += dt;
    const duration = phase === "closing" ? 0.44 : 0.21;
    const progress = Math.min(1, elapsed / duration);
    const support = topLayer();
    const targetY = support.y + support.sprite.rise;
    piece.y = piece.startY + (targetY - piece.startY) * progress ** 1.7;

    if (progress === 1) {
      if (phase === "closing") finish();
      else landing();
    }
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

function drawLayer(layer) {
  const { sprite, x, y, left, right } = layer;
  const visibleWidth = right - left;
  const imageScale = sprite.image.naturalWidth / sprite.width;
  const sourceX = (left - x + sprite.width / 2) * imageScale;
  ctx.drawImage(sprite.image, sourceX, 0, visibleWidth * imageScale, sprite.image.naturalHeight,
    left, -y - sprite.height, visibleWidth, sprite.height);
}

function drawArrow(support) {
  ctx.save();
  ctx.translate(centerOf(support), -support.y - support.sprite.height - 7);
  ctx.fillStyle = "#245444";
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(7, -7);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScraps() {
  if (reducedMotion) return;
  for (const scrap of scraps) {
    const x = centerOf(scrap);
    const y = -scrap.y - scrap.sprite.height / 2;
    ctx.save();
    ctx.translate(x + scrap.direction * scrap.age * 86, y + scrap.age ** 2 * 1400);
    ctx.rotate(scrap.direction * scrap.age * 4.5);
    ctx.translate(-x, -y);
    ctx.globalAlpha = 1 - scrap.age / SCRAP_DURATION;
    drawLayer(scrap);
    ctx.restore();
  }
}

function draw(dt) {
  if (!stack.length || !width || !height) return false;

  const field = worldHeight();
  const base = field * 0.80;
  const head = topLayer().y + topLayer().sprite.height;
  const playing = phase === "aiming" || phase === "dropping" || phase === "closing";
  const desiredZoom = phase === "finished" ? Math.min(1, (base - 50) / head) : 1;
  const desiredCamera = playing ? Math.max(0, head - field * 0.34) : 0;
  const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
  zoom += (desiredZoom - zoom) * blend;
  camera += (desiredCamera - camera) * blend;

  const scale = ui.board.width / WORLD_WIDTH;
  const floor = base + camera;
  counter.style.transform = `translateY(${camera * width / WORLD_WIDTH}px)`;
  ctx.setTransform(scale, 0, 0, ui.board.height / field, 0, 0);
  ctx.clearRect(0, 0, WORLD_WIDTH, field);
  ctx.translate(WORLD_WIDTH * (1 - zoom) / 2, floor);
  ctx.scale(zoom, zoom);

  ctx.fillStyle = "#673d2480";
  ctx.beginPath();
  ctx.ellipse(WORLD_WIDTH / 2, -1, LAYER_WIDTH * 0.54, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Old layers can scroll below the screen as the camera follows the top.
  let firstVisible = stack.length - 1;
  while (firstVisible > 0 && floor - stack[firstVisible].y * zoom < field + 80) {
    firstVisible--;
  }
  for (let i = firstVisible; i < stack.length; i++) {
    drawLayer(stack[i]);
  }

  if (phase === "aiming") drawArrow(topLayer());
  drawScraps();
  if (playing) drawSprite(piece.sprite, piece.x, -piece.y);

  return (!ui.gift.open && (playing || scraps.length > 0))
    || Math.abs(zoom - desiredZoom) > 0.001 || Math.abs(camera - desiredCamera) > 0.1;
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
  stack = [fullLayer(bottomBun, WORLD_WIDTH / 2, 0)];
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
