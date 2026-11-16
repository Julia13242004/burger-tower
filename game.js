"use strict";

const WORLD_WIDTH = 400;
const CENTIMETERS_PER_LAYER = 5;
const BEST_KEY = "burger-tower-best-layers";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const ingredients = [
  { file: "bun-down", width: 184 },
  { file: "becon", name: "Бекон", width: 174 },
  { file: "chees", name: "Сыр", width: 178 },
  { file: "cutlet", name: "Котлета", width: 172 },
  { file: "onion", name: "Лук", width: 165 },
  { file: "pickls", name: "Огурцы", width: 165 },
  { file: "salat", name: "Салат", width: 182 },
  { file: "sauce", name: "Соус", width: 159 },
  { file: "tomato", name: "Помидоры", width: 173 },
  { file: "bun-up", name: "Верхняя булочка", width: 191 },
];
const bottomBun = ingredients[0];
const topBun = ingredients[ingredients.length - 1];
const fillings = ingredients.slice(1, -1);

const ui = Object.fromEntries(
  ["board", "playfield", "action", "welcome", "ingredient", "height", "best", "caption"]
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
let fallen;
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

function begin() {
  stack = [{ sprite: bottomBun, x: WORLD_WIDTH / 2, y: 0 }];
  bag = [];
  previousFilling = null;
  fallen = null;
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
  const left = sprite.width / 2 + 8;
  const right = WORLD_WIDTH - left;
  const fromLeft = Math.random() < 0.5;
  piece = {
    sprite,
    x: fromLeft ? left : right,
    y: topLayer().y + topLayer().sprite.rise + dropGap(sprite),
    direction: fromLeft ? 1 : -1,
    left,
    right,
  };
  ui.ingredient.textContent = sprite.name;
  ui.ingredient.hidden = false;
  phase = "aiming";
}

function dropGap(sprite) {
  return Math.max(64, Math.min(125, worldHeight() * 0.26 - sprite.height));
}

function place() {
  if (phase === "ready" || phase === "finished") {
    begin();
  } else if (phase === "aiming") {
    elapsed = 0;
    piece.startY = piece.y;
    phase = "dropping";
    requestDraw();
  }
}

function landsOnStack(x, sprite, support, fillingCount) {
  const offset = x - support.x;
  const tolerance = Math.max(21, 43 - fillingCount * 1.15);
  const insideCounter = x - sprite.width / 2 > 4 && x + sprite.width / 2 < WORLD_WIDTH - 4;
  return Math.abs(offset) <= tolerance && insideCounter;
}

function landing() {
  const support = topLayer();
  if (landsOnStack(piece.x, piece.sprite, support, stack.length - 1)) {
    const offset = piece.x - support.x;
    const center = Math.abs(offset) <= 8 ? support.x : support.x + offset * 0.58;
    const margin = topBun.width / 2 + 4;
    const x = Math.max(margin, Math.min(WORLD_WIDTH - margin, center));
    stack.push({ sprite: piece.sprite, x, y: piece.y });
    updateScore();
    spawn();
    return;
  }

  fallen = { ...piece, direction: Math.sign(piece.x - support.x) || 1 };
  const targetY = support.y + support.sprite.rise;
  piece = {
    sprite: topBun,
    x: support.x,
    y: targetY + 84,
    startY: targetY + 84,
  };
  ui.ingredient.hidden = true;
  ui.caption.textContent = "Промах! Закрываем бургер…";
  phase = "closing";
  elapsed = 0;
}

function finish() {
  stack.push({ sprite: topBun, x: piece.x, y: piece.y });
  const newRecord = stack.length > best;
  if (newRecord) {
    best = stack.length;
    saveBest();
  }
  updateScore();
  fallen = null;
  phase = "finished";
  ui.playfield.setAttribute("aria-label", "Сыграть ещё");
  ui.action.textContent = "Сыграть ещё";
  const label = newRecord ? "Новый рекорд!" : "Бургер готов!";
  ui.caption.textContent = `${label} ${formatHeight(stack.length)}`;
}

function advance(dt) {
  if (phase === "aiming") {
    const speed = Math.min(355, 154 + (stack.length - 1) * 12);
    piece.x += piece.direction * speed * dt;
    if (piece.x < piece.left || piece.x > piece.right) {
      const edge = piece.direction > 0 ? piece.right : piece.left;
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

function drawArrow(support) {
  ctx.save();
  ctx.translate(support.x, -support.y - support.sprite.height - 7);
  ctx.fillStyle = "#245444";
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(7, -7);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  ctx.ellipse(WORLD_WIDTH / 2, -1, 102, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Old layers can scroll below the screen as the camera follows the top.
  let firstVisible = stack.length - 1;
  while (firstVisible > 0 && floor - stack[firstVisible].y * zoom < field + 80) {
    firstVisible--;
  }
  for (let i = firstVisible; i < stack.length; i++) {
    const layer = stack[i];
    drawSprite(layer.sprite, layer.x, -layer.y);
  }

  if (phase === "aiming") drawArrow(topLayer());
  if (fallen) {
    const x = fallen.x + fallen.direction * elapsed * 116;
    const y = -fallen.y + elapsed ** 2 * 1400;
    ctx.save();
    ctx.translate(x, y - fallen.sprite.height / 2);
    ctx.rotate(fallen.direction * elapsed * 4.5);
    ctx.globalAlpha = 1 - Math.min(1, elapsed / 0.42);
    drawSprite(fallen.sprite, 0, fallen.sprite.height / 2);
    ctx.restore();
  }
  if (playing) drawSprite(piece.sprite, piece.x, -piece.y);

  return playing || Math.abs(zoom - desiredZoom) > 0.001 || Math.abs(camera - desiredCamera) > 0.1;
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
  image.src = `assets/${sprite.file}.png`;
  await image.decode();
  sprite.height = sprite.width * image.naturalHeight / image.naturalWidth;
  sprite.rise = sprite.height * (sprite === bottomBun ? 0.73 : 0.62);
})).then(() => {
  stack = [{ sprite: bottomBun, x: WORLD_WIDTH / 2, y: 0 }];
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
