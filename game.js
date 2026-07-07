// game.js — エラー実績解除 本体
// 横スクロール探索 + コードパネル + バッジ収集

(() => {
"use strict";

// ---------------------------------------------------------------
// 基本設定
// ---------------------------------------------------------------
const VIEW_W = 640, VIEW_H = 360;      // 内部解像度
const GRAVITY = 0.5;
const MOVE_SPEED = 2.4;
const JUMP_POWER = -8.2;
const MAP_W = LEVEL_MAP[0].length * TILE;
const MAP_H = LEVEL_MAP.length * TILE;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// 描画ヘルパー：等倍ならドットをくっきり、縮小・拡大時だけ滑らかに
function blit(img, sx, sy, sw, sh, dx, dy, dw, dh) {
  const scaled = sw !== dw || sh !== dh;
  if (scaled) ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  if (scaled) ctx.imageSmoothingEnabled = false;
}

// 整数倍スケールでウィンドウにフィットさせる
function fitCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
  canvas.style.width = VIEW_W * scale + "px";
  canvas.style.height = VIEW_H * scale + "px";
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// ---------------------------------------------------------------
// アセット読み込み（PNGがあれば使い、なければプレースホルダ描画）
// スプライトシート優先 → 個別ファイル → プレースホルダ
// ---------------------------------------------------------------
const assets = {};   // name -> {img, frames:[{sx,sy,w,h}] } または null

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAssets() {
  // シート定義：[名前, シートファイル, コマ数]
  // ※PNGのサイズは自由。実サイズを読み取り、ゲーム内で規定サイズに縮小する
  const sheets = [
    ["player", "player.png", 4],
    ["terminal", "terminal.png", 4],
  ];
  for (const [name, file, n] of sheets) {
    const sheet = await loadImage("assets/" + file);
    if (sheet) {
      const fw = sheet.width / n, fh = sheet.height;
      assets[name] = Array.from({ length: n }, (_, i) => ({ img: sheet, sx: i * fw, sy: 0, w: fw, h: fh }));
      continue;
    }
    // 個別ファイル player-1.png ... を探す（サイズは画像の実寸を使う）
    const frames = [];
    for (let i = 1; i <= n; i++) {
      const img = await loadImage(`assets/${name}-${i}.png`);
      frames.push(img ? { img, sx: 0, sy: 0, w: img.width, h: img.height } : null);
    }
    assets[name] = frames.some(Boolean) ? frames : null;
  }
  // タイル（単体 or バリエーション2種）
  for (const base of ["tile_ground", "tile_block"]) {
    const single = await loadImage(`assets/${base}.png`);
    if (single) { assets[base] = [{ img: single, sx: 0, sy: 0, w: single.width, h: single.height }]; continue; }
    const v = [];
    for (let i = 1; i <= 2; i++) {
      const img = await loadImage(`assets/${base}-${i}.png`);
      if (img) v.push({ img, sx: 0, sy: 0, w: img.width, h: img.height });
    }
    assets[base] = v.length ? v : null;
  }
  // バッジ4種（実寸を記録して縮小表示する）
  assets.badges = [];
  for (let i = 1; i <= BADGES.length; i++) {
    const img = await loadImage(`assets/badge-${i}.png`);
    assets.badges.push(img ? { img, sx: 0, sy: 0, w: img.width, h: img.height } : null);
  }
  // 背景
  assets.bg = await loadImage("assets/bg_sky.png");
}

// ---------------------------------------------------------------
// プレースホルダ描画（PNGが無いときのピクセル模様）
// ---------------------------------------------------------------
function drawPlayerPlaceholder(x, y, frame, facing) {
  // 32x48の小さな旅人。フレームで足の形を変える
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) { ctx.translate(32, 0); ctx.scale(-1, 1); }
  const P = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  P(8, 4, 16, 14, "#d4d4aa");          // 頭（微光色）
  P(12, 8, 4, 4, "#1e1e2e");           // 目
  P(20, 8, 2, 4, "#1e1e2e");
  P(6, 18, 20, 18, "#4ec9b0");         // 胴（アクセント色）
  P(6, 20, 20, 2, "#2a2a3c");
  if (frame === 3) {                    // ジャンプ
    P(6, 36, 8, 8, "#2a2a3c"); P(18, 34, 8, 8, "#2a2a3c");
  } else if (frame === 1) {             // 歩行1
    P(4, 36, 8, 12, "#2a2a3c"); P(20, 36, 8, 10, "#2a2a3c");
  } else if (frame === 2) {             // 歩行2
    P(8, 36, 8, 10, "#2a2a3c"); P(16, 36, 8, 12, "#2a2a3c");
  } else {                              // 待機
    P(7, 36, 8, 12, "#2a2a3c"); P(17, 36, 8, 12, "#2a2a3c");
  }
  ctx.restore();
}

function drawTilePlaceholder(kind, x, y, seed) {
  ctx.fillStyle = "#3c4048";
  ctx.fillRect(x, y, 32, 32);
  ctx.fillStyle = "#565c66";
  ctx.fillRect(x, y, 32, 3);
  // 疑似乱数で小さなドット模様（コードのノイズのように）
  const rnd = (n) => ((seed * 73856093) ^ (n * 19349663)) % 97 / 97;
  ctx.fillStyle = kind === 1 ? "#33363e" : "#454a54";
  for (let i = 0; i < 5; i++) {
    const px = Math.floor(rnd(i) * 28) + 2;
    const py = Math.floor(rnd(i + 9) * 22) + 7;
    ctx.fillRect(x + px, y + py, 3, 3);
  }
}

function drawTerminalPlaceholder(x, y, theme, active, broken) {
  const P = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, w, h); };
  P(2, 8, 28, 34, "#2a2a3c");                    // 筐体
  P(0, 42, 32, 6, "#3c4048");                    // 台座
  const screen = broken ? "#f48771" : "#4ec9b0";
  P(5, 11, 22, 18, "#1e1e2e");                   // 画面枠
  // テーマごとに画面の模様を変える
  ctx.fillStyle = screen;
  if (theme === 0) { P(7, 14, 10, 2, screen); P(7, 18, 14, 2, screen); P(7, 22, 8, 2, screen); }
  if (theme === 1) { P(7, 14, 6, 2, screen); P(11, 18, 10, 2, screen); P(11, 22, 10, 2, screen); }
  if (theme === 2) { P(7, 14, 14, 2, screen); P(9, 18, 10, 2, screen); P(7, 22, 14, 2, screen); }
  if (theme === 3) { P(7, 14, 4, 4, screen); P(13, 14, 4, 4, screen); P(19, 14, 4, 4, screen); P(7, 20, 16, 2, screen); }
  if (active) {                                   // 近づくと画面がわずかに明るく
    ctx.fillStyle = "rgba(212, 212, 170, 0.15)";
    ctx.fillRect(x + 5, y + 11, 22, 18);
  }
}

function drawBadgePlaceholder(x, y, index, size) {
  // 六角形風の金バッジ、中央にエラー番号のピクセル模様
  const s = size / 32;
  const P = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + px * s, y + py * s, w * s, h * s); };
  P(8, 2, 16, 4, "#dcb67a"); P(4, 6, 24, 20, "#dcb67a"); P(8, 26, 16, 4, "#dcb67a");
  P(10, 8, 12, 16, "#1e1e2e");
  ctx.fillStyle = "#dcb67a";
  const marks = [
    [[12,10,8,2],[12,14,4,2],[12,18,8,2]],           // S風
    [[15,10,2,12],[12,20,8,2]],                       // I風
    [[12,10,2,12],[18,10,2,12],[13,13,2,2],[15,15,2,2],[16,17,2,2]], // N風
    [[12,10,8,2],[15,12,2,10]],                       // T風
  ];
  if (marks[index]) {
    for (const [px, py, w, h] of marks[index]) P(px, py, w, h, "#dcb67a");
  } else {
    // 5番目以降はドットの数でバッジ番号を表す
    for (let d = 0; d < index + 1; d++) {
      P(12 + (d % 3) * 4, 10 + Math.floor(d / 3) * 4, 2, 2, "#dcb67a");
    }
  }
}

// ---------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------
const player = {
  x: 3 * TILE, y: 8 * TILE,
  vx: 0, vy: 0,
  w: 22, h: 44,          // 当たり判定（見た目より少し細く）
  onGround: false,
  facing: 1,
  animTime: 0,
};

const camera = { x: 0, y: 0 };
const keys = {};
let paused = false;          // パネルやコレクション表示中は物理を止める

const badgesUnlocked = new Set();        // errorType の集合
const droppedBadges = [];                // フィールドに落ちているバッジ
const particles = [];
let cleared = false;
let nearTerminal = null;

// 行動ログ
const log = {
  startedAt: new Date().toISOString(),
  runs: 0,
  okRuns: 0,
  errorRuns: 0,
  errorCounts: {},          // 種別ごとの発生回数
  unknownErrors: [],        // バッジ対象外のエラー発見記録
  editEvents: 0,
  badges: [],
  events: [],               // 実行ログ（時刻・端末・結果）
};

// ---------------------------------------------------------------
// 入力
// ---------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  const panelOpen = !ui.panel.classList.contains("hidden");
  const collOpen = !ui.collection.classList.contains("hidden");

  if (e.key === "Tab") {                       // コレクション開閉
    e.preventDefault();
    if (!panelOpen) toggleCollection();
    return;
  }
  if (panelOpen) {
    if (e.key === "Escape") { e.preventDefault(); closePanel(); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
    return;                                    // パネル中はゲーム入力を止める
  }
  if (collOpen) {
    if (e.key === "Escape" || e.code === "Space") { e.preventDefault(); toggleCollection(); }
    return;
  }
  keys[e.code] = true;
  if (e.code === "ArrowDown" && nearTerminal) openPanel(nearTerminal);   // ↓で選択
  if (e.code === "Space") { e.preventDefault(); toggleCollection(); }    // Spaceでバッジ確認
  if (e.code === "ArrowUp" || e.code === "ArrowDown") e.preventDefault();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------
// 物理・衝突
// ---------------------------------------------------------------
function tileAt(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (ty < 0) return 0;                       // マップの上は空。バッジが降臨できる
  if (tx < 0 || tx >= LEVEL_MAP[0].length || ty >= LEVEL_MAP.length) return 1;
  return LEVEL_MAP[ty][tx];
}

function collide(x, y, w, h) {
  return tileAt(x, y) || tileAt(x + w - 1, y) || tileAt(x, y + h - 1) || tileAt(x + w - 1, y + h - 1) ||
         tileAt(x + w / 2, y) || tileAt(x + w / 2, y + h - 1);
}

let jumpHeld = 0;
function updatePlayer() {
  // 横移動
  player.vx = 0;
  if (keys.ArrowLeft)  { player.vx = -MOVE_SPEED; player.facing = -1; }
  if (keys.ArrowRight) { player.vx = MOVE_SPEED;  player.facing = 1; }

  // ジャンプ（↑キー。長押しで高さが変わる）
  const jumpKey = keys.ArrowUp;
  if (jumpKey && player.onGround) {
    player.vy = JUMP_POWER;
    player.onGround = false;
    jumpHeld = 10;
  }
  if (jumpKey && jumpHeld > 0 && player.vy < 0) {
    player.vy -= 0.28;      // 押している間だけ少し浮力を足す
    jumpHeld--;
  }
  if (!jumpKey) jumpHeld = 0;

  player.vy = Math.min(player.vy + GRAVITY, 10);

  // X方向
  let nx = player.x + player.vx;
  if (!collide(nx, player.y, player.w, player.h)) player.x = nx;
  // Y方向
  let ny = player.y + player.vy;
  if (!collide(player.x, ny, player.w, player.h)) {
    player.y = ny;
    player.onGround = false;
  } else {
    if (player.vy > 0) {
      player.y = Math.floor((player.y + player.vy + player.h) / TILE) * TILE - player.h;
      player.onGround = true;
    }
    player.vy = 0;
  }

  player.x = Math.max(0, Math.min(player.x, MAP_W - player.w));
  player.animTime += Math.abs(player.vx) > 0 ? 1 : 0;

  // 近くの端末を探す（↑キーの案内表示に使う）
  nearTerminal = null;
  for (const t of TERMINALS) {
    const tx = t.x * TILE;
    if (Math.abs(player.x + player.w / 2 - (tx + 16)) < 30) nearTerminal = t;
  }

  // 落ちているバッジを拾う
  for (const b of droppedBadges) {
    if (b.collected) continue;
    if (b.descending) {
      // 天使のようにゆっくりと降臨する
      b.y += 1.1 + Math.sin(b.t / 10) * 0.3;
      if (b.t % 3 === 0) {
        particles.push({
          x: b.x + 16 + (Math.random() - 0.5) * 30,
          y: b.y + Math.random() * 20,
          vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6,
          life: 45, color: Math.random() < 0.6 ? "#dcb67a" : "#d4d4aa",
        });
      }
      if (collide(b.x, b.y + 2, 32, 32)) {
        b.descending = false;       // 着地の瞬間、金の光が弾ける
        for (let i = 0; i < 24; i++) {
          particles.push({
            x: b.x + 16, y: b.y + 24,
            vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1,
            life: 55, color: "#dcb67a",
          });
        }
      }
      b.t++;
      continue;
    }
    b.vy = Math.min(b.vy + GRAVITY * 0.6, 8);
    if (!collide(b.x, b.y + b.vy, 32, 32)) b.y += b.vy;
    else b.vy = 0;
    b.t++;
    if (Math.abs(player.x + player.w / 2 - (b.x + 16)) < 26 &&
        Math.abs(player.y + player.h / 2 - (b.y + 16)) < 34) {
      collectBadge(b);
    }
  }
}

function updateCamera() {
  const targetX = player.x + player.w / 2 - VIEW_W / 2;
  camera.x += (targetX - camera.x) * 0.1;          // 滑らかに追従
  camera.x = Math.max(0, Math.min(camera.x, MAP_W - VIEW_W));
  camera.y = Math.max(0, MAP_H - VIEW_H);
}

// ---------------------------------------------------------------
// バッジ
// ---------------------------------------------------------------
// バッジごとの「取得の記録」（どの端末で・どんなコードで出したか）
const unlockRecords = {};   // errorType -> {theme, code, message, traceback, at}

function spawnBadge(errorType, terminal, snapshot) {
  const index = BADGES.findIndex((b) => b.error === errorType);
  if (index < 0 || badgesUnlocked.has(errorType)) return;
  if (droppedBadges.some((b) => b.error === errorType && !b.collected)) return;
  droppedBadges.push({
    error: errorType, index, snapshot,
    x: terminal.x * TILE + (Math.random() < 0.5 ? -48 : 48),
    y: -48,                       // 画面のはるか上、空から降りてくる
    vy: 0, t: 0, collected: false,
    descending: true,             // 降臨中は光の柱をまとう
  });
  // エラー色の光の粒
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: terminal.x * TILE + 16, y: 8.5 * TILE,
      vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1,
      life: 40, color: "#f48771",
    });
  }
}

function collectBadge(b) {
  b.collected = true;
  badgesUnlocked.add(b.error);
  if (b.snapshot) unlockRecords[b.error] = b.snapshot;
  log.badges.push({ error: b.error, at: new Date().toISOString(), record: b.snapshot ?? null });
  const def = BADGES[b.index];
  showToast(`実績解除\n${def.name}（${def.error}）`, def.lesson);
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: b.x + 16, y: b.y + 16,
      vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 5,
      life: 50, color: "#dcb67a",
    });
  }
  updateHUD();
  if (badgesUnlocked.size >= BADGES.length && !cleared) {
    cleared = true;
    setTimeout(() => ui.clear.classList.remove("hidden"), 900);
    setTimeout(() => ui.clear.classList.add("hidden"), 7000);
  }
}

// ---------------------------------------------------------------
// 描画
// ---------------------------------------------------------------
function drawBackground() {
  // 暗いグラデーション
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#1e1e2e");
  g.addColorStop(1, "#24243a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (assets.bg) {
    // 横シームレス背景をパララックスで敷く
    const off = -((camera.x * 0.3) % 640);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(assets.bg, off, 0, VIEW_W, VIEW_H);
    ctx.drawImage(assets.bg, off + VIEW_W, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = false;
    return;
  }
  // プレースホルダ：遠景パネルとまばらな微光
  ctx.fillStyle = "#2a2a3c";
  for (let i = 0; i < 8; i++) {
    const px = ((i * 260 - camera.x * 0.3) % (VIEW_W + 200)) - 100;
    ctx.fillRect(px, 90 + (i % 3) * 40, 90, 180);
  }
  ctx.fillStyle = "#d4d4aa";
  for (let i = 0; i < 20; i++) {
    const px = ((i * 137 - camera.x * 0.5) % (VIEW_W + 40) + VIEW_W + 40) % (VIEW_W + 40) - 20;
    const py = (i * 71) % 200 + 20;
    const tw = (Math.sin(perfNow / 700 + i) + 1) / 2;
    ctx.globalAlpha = 0.15 + tw * 0.25;
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawTiles() {
  const x0 = Math.floor(camera.x / TILE), x1 = Math.ceil((camera.x + VIEW_W) / TILE);
  for (let y = 0; y < LEVEL_MAP.length; y++) {
    for (let x = x0; x <= x1 && x < LEVEL_MAP[0].length; x++) {
      const k = LEVEL_MAP[y][x];
      if (!k) continue;
      const sx = Math.round(x * TILE - camera.x);
      const sy = Math.round(y * TILE - camera.y);
      const name = k === 1 ? "tile_ground" : "tile_block";
      const variants = assets[name];
      if (variants) {
        const f = variants[(x + y) % variants.length];
        blit(f.img, f.sx, f.sy, f.w, f.h, sx, sy, 32, 32);
      } else {
        drawTilePlaceholder(k, sx, sy, x * 31 + y * 7 + 1);
      }
    }
  }
}

function drawTerminals() {
  for (const t of TERMINALS) {
    const sx = Math.round(t.x * TILE - camera.x);
    const sy = Math.round(8.5 * TILE - camera.y);   // 地面(y=10)の上に置く
    const active = nearTerminal === t;
    const frames = assets.terminal;
    if (frames && frames[t.id]) {
      const f = frames[t.id];
      blit(f.img, f.sx, f.sy, f.w, f.h, sx, sy, 32, 48);
      if (active) {
        ctx.fillStyle = "rgba(212, 212, 170, 0.12)";
        ctx.fillRect(sx, sy, 32, 48);
      }
    } else {
      drawTerminalPlaceholder(sx, sy, t.id, active, t.justBroke > 0);
    }
    if (t.justBroke > 0) t.justBroke--;
    // 近づいたときの操作ガイド
    if (active) {
      ctx.font = "10px DotGothic16, sans-serif";
      ctx.fillStyle = "#d4d4aa";
      ctx.textAlign = "center";
      ctx.fillText("[↓] " + t.theme, sx + 16, sy - 8);
      ctx.textAlign = "left";
    }
  }
}

function drawDroppedBadges() {
  for (const b of droppedBadges) {
    if (b.collected) continue;
    const bob = b.descending ? 0 : Math.sin(b.t / 12) * 2;
    const sx = Math.round(b.x - camera.x);
    const sy = Math.round(b.y - camera.y + bob);
    if (b.descending) {
      // 天から差す光の柱
      const beam = ctx.createLinearGradient(0, 0, 0, sy + 32);
      beam.addColorStop(0, "rgba(220, 182, 122, 0.35)");
      beam.addColorStop(1, "rgba(220, 182, 122, 0.05)");
      ctx.fillStyle = beam;
      const w = 44 + Math.sin(b.t / 6) * 6;
      ctx.fillRect(sx + 16 - w / 2, 0, w, sy + 28);
      // 放射状の後光
      ctx.save();
      ctx.translate(sx + 16, sy + 16);
      ctx.rotate(b.t / 40);
      ctx.fillStyle = "rgba(212, 212, 170, 0.18)";
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.fillRect(-2, -34, 4, 20);
      }
      ctx.restore();
    }
    const a = assets.badges[b.index];
    // 金の淡い光
    ctx.fillStyle = b.descending ? "rgba(220, 182, 122, 0.25)" : "rgba(220, 182, 122, 0.12)";
    ctx.beginPath();
    ctx.arc(sx + 16, sy + 16, 22 + Math.sin(b.t / 8) * 3, 0, Math.PI * 2);
    ctx.fill();
    if (a) blit(a.img, a.sx, a.sy, a.w, a.h, sx, sy, 32, 32);
    else drawBadgePlaceholder(sx, sy, b.index, 32);
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - camera.x), Math.round(p.y - camera.y), 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const sx = player.x - 5 - camera.x;   // 見た目32pxに合わせて少しずらす
  const sy = player.y - 4 - camera.y;
  let frame = 0;
  if (!player.onGround) frame = 3;
  else if (Math.abs(player.vx) > 0) frame = 1 + (Math.floor(player.animTime / 8) % 2);
  const frames = assets.player;
  if (frames && frames[frame]) {
    const f = frames[frame];
    ctx.save();
    if (player.facing < 0) {
      ctx.translate(Math.round(sx) + 32, Math.round(sy));
      ctx.scale(-1, 1);
      blit(f.img, f.sx, f.sy, f.w, f.h, 0, 0, 32, 48);
    } else {
      blit(f.img, f.sx, f.sy, f.w, f.h, Math.round(sx), Math.round(sy), 32, 48);
    }
    ctx.restore();
  } else {
    drawPlayerPlaceholder(sx, sy, frame, player.facing);
  }
}

// ---------------------------------------------------------------
// UI（HTML側）
// ---------------------------------------------------------------
const ui = {
  panel: document.getElementById("panel"),
  panelTitle: document.getElementById("panel-title"),
  panelDesc: document.getElementById("panel-desc"),
  code: document.getElementById("code"),
  gutter: document.getElementById("gutter"),
  highlight: document.getElementById("highlight"),
  result: document.getElementById("result"),
  resultBody: document.getElementById("result-body"),
  tracebackBox: document.getElementById("traceback-box"),
  traceback: document.getElementById("traceback"),
  pyStatus: document.getElementById("py-status"),
  toast: document.getElementById("toast"),
  hudBadges: document.getElementById("hud-badges"),
  hudTime: document.getElementById("hud-time"),
  collection: document.getElementById("collection"),
  badgeList: document.getElementById("badge-list"),
  logSummary: document.getElementById("log-summary"),
  clear: document.getElementById("clear"),
};

let currentTerminal = null;

function openPanel(t) {
  currentTerminal = t;
  paused = true;
  ui.panelTitle.textContent = `TERMINAL ${t.id + 1} — ${t.theme}`;
  ui.panelDesc.textContent = t.desc;
  ui.code.value = t.savedCode ?? t.code;
  ui.result.classList.add("hidden");
  ui.panel.classList.remove("hidden");
  refreshDiff();
  ui.code.focus();
}

function closePanel() {
  if (currentTerminal) currentTerminal.savedCode = ui.code.value;
  ui.panel.classList.add("hidden");
  paused = false;
  currentTerminal = null;
  canvas.focus?.();
}

// 変更行のハイライトとマーカー
function refreshDiff() {
  if (!currentTerminal) return;
  const origLines = currentTerminal.code.replace(/\n$/, "").split("\n");
  const nowLines = ui.code.value.replace(/\n$/, "").split("\n");
  let gutterHTML = "", hlHTML = "";
  for (let i = 0; i < nowLines.length; i++) {
    const changed = nowLines[i] !== (origLines[i] ?? "\u0000");
    gutterHTML += changed ? "▶\n" : "\u00A0\n";
    hlHTML += `<span class="line${changed ? " changed" : ""}">${escapeHTML(nowLines[i]) || " "}</span>`;
  }
  ui.gutter.textContent = "";
  ui.gutter.innerText = gutterHTML;
  ui.highlight.innerHTML = hlHTML;
  syncScroll();
}
function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function syncScroll() {
  ui.highlight.scrollTop = ui.code.scrollTop;
  ui.highlight.scrollLeft = ui.code.scrollLeft;
  ui.gutter.scrollTop = ui.code.scrollTop;
}
ui.code.addEventListener("scroll", syncScroll);
ui.code.addEventListener("input", () => {
  log.editEvents++;
  refreshDiff();
});
// Tabキーはコレクション開閉に使うので、エディタ内ではスペース4つを入れる
ui.code.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const s = ui.code.selectionStart;
    ui.code.setRangeText("    ", s, ui.code.selectionEnd, "end");
    log.editEvents++;
    refreshDiff();
  }
});

document.getElementById("btn-run").addEventListener("click", runCode);
// ヒント：まだ取っていないバッジの出し方を1つ教える
document.getElementById("btn-hint").addEventListener("click", () => {
  const missing = BADGES.filter((b) => !badgesUnlocked.has(b.error));
  ui.result.classList.remove("hidden");
  ui.tracebackBox.classList.add("hidden");
  if (missing.length === 0) {
    ui.resultBody.innerHTML =
      `<span class="ok">すべてのバッジを集めた。もうヒントは必要ない。</span>`;
    return;
  }
  const b = missing[Math.floor(Math.random() * missing.length)];
  ui.resultBody.innerHTML =
    `<span class="note">ヒント（??? のうちの1つ）</span>` +
    `<pre>${escapeHTML(b.hint)}</pre>` +
    `<span class="note">書き換えたら Ctrl+Enter で実行。失敗しても「修復」でいつでも戻せる。</span>`;
});
document.getElementById("btn-repair").addEventListener("click", () => {
  if (!currentTerminal) return;
  ui.code.value = currentTerminal.code;
  refreshDiff();
  ui.result.classList.add("hidden");
});
document.getElementById("btn-close").addEventListener("click", closePanel);
document.getElementById("btn-savelog").addEventListener("click", saveLog);
document.getElementById("btn-collection-close").addEventListener("click", toggleCollection);

// ---------------------------------------------------------------
// コード実行
// ---------------------------------------------------------------
let running = false;
async function runCode() {
  if (!currentTerminal || running) return;
  running = true;
  const t = currentTerminal;
  const code = ui.code.value;
  const res = await PY.run(code, t);
  running = false;

  log.runs++;
  log.events.push({
    at: new Date().toISOString(),
    terminal: t.theme,
    ok: res.ok,
    errorType: res.errorType ?? null,
    engine: res.engine,
  });

  ui.result.classList.remove("hidden");
  ui.tracebackBox.classList.add("hidden");

  if (res.ok) {
    log.okRuns++;
    ui.resultBody.innerHTML =
      `<span class="ok">正常に実行できました。これが本来の動きです。</span>` +
      `<pre>${escapeHTML(res.output || "(出力なし)")}</pre>` +
      `<span class="note">壊さないと、何も始まらない。</span>`;
  } else {
    log.errorRuns++;
    log.errorCounts[res.errorType] = (log.errorCounts[res.errorType] || 0) + 1;
    t.justBroke = 40;   // 端末画面を一瞬エラー色に

    const badgeDef = BADGES.find((b) => b.error === res.errorType);
    if (badgeDef) {
      const isNew = !badgesUnlocked.has(res.errorType) &&
                    !droppedBadges.some((b) => b.error === res.errorType && !b.collected);
      // 「なぜ取れたか」を後から見られるように、壊した瞬間を記録する
      spawnBadge(res.errorType, t, {
        theme: t.theme,
        code,
        message: `${res.errorType}: ${res.message || ""}`,
        traceback: res.traceback || "",
        at: new Date().toISOString(),
      });
      ui.resultBody.innerHTML =
        `<span class="err">${escapeHTML(res.errorType)}: ${escapeHTML(res.message || "")}</span>` +
        (isNew
          ? `<pre>空からバッジが降りてくる。外に出て迎えよう。</pre>`
          : `<pre>このエラーの実績は解除済み。</pre>`) +
        `<span class="note">${escapeHTML(badgeDef.lesson)}</span>`;
    } else {
      // バッジ対象外のエラー → 未知のエラー発見として記録
      if (!log.unknownErrors.some((u) => u.errorType === res.errorType)) {
        log.unknownErrors.push({ errorType: res.errorType, at: new Date().toISOString() });
      }
      ui.resultBody.innerHTML =
        `<span class="err">${escapeHTML(res.errorType)}: ${escapeHTML(res.message || "")}</span>` +
        `<pre>未知のエラーを発見した（バッジ対象外・ログに記録）</pre>`;
    }
    if (res.traceback) {
      ui.traceback.textContent = res.traceback;
      ui.tracebackBox.classList.remove("hidden");
      ui.tracebackBox.open = false;
    }
  }
}

// ---------------------------------------------------------------
// トースト・HUD・コレクション・ログ保存
// ---------------------------------------------------------------
let toastTimer = null;
function showToast(title, sub) {
  ui.toast.innerHTML = escapeHTML(title).replace(/\n/g, "<br>") +
    (sub ? `<span class="sub">${escapeHTML(sub)}</span>` : "");
  ui.toast.classList.remove("hidden");
  ui.toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.style.opacity = "0"; }, 4200);
  setTimeout(() => ui.toast.classList.add("hidden"), 4800);
}

function updateHUD() {
  ui.hudBadges.textContent = `BADGE ${badgesUnlocked.size}/${BADGES.length}`;
}

function toggleCollection() {
  const open = ui.collection.classList.contains("hidden");
  if (open) {
    renderCollection();
    ui.collection.classList.remove("hidden");
    paused = true;
  } else {
    ui.collection.classList.add("hidden");
    paused = !ui.panel.classList.contains("hidden") ? true : false;
  }
}

function renderCollection() {
  let html = "";
  BADGES.forEach((b, i) => {
    const got = badgesUnlocked.has(b.error);
    const rec = unlockRecords[b.error];
    html += `<div class="badge-entry">
      <div class="badge-row ${got ? "clickable" : "locked"}" data-error="${b.error}">
        <canvas class="badge-icon" data-i="${i}" data-got="${got}" width="32" height="32"></canvas>
        <div>
          <div class="badge-name">${got ? escapeHTML(b.name) : "???"}</div>
          <div class="badge-info">${got ? escapeHTML(b.error) + " — " + escapeHTML(b.lesson) : "ヒント：" + escapeHTML(b.hint)}</div>
          ${got ? `<div class="badge-more">クリックで取得の記録を見る</div>` : ""}
        </div>
        <div class="badge-rarity rarity-${b.rarity.toLowerCase()}">${b.rarity}</div>
      </div>
      ${got && rec ? `<div class="badge-record hidden" data-record="${b.error}">
        <div class="record-head">取得の記録 — 端末「${escapeHTML(rec.theme)}」（${escapeHTML(rec.at.slice(0, 19).replace("T", " "))}）</div>
        <div class="record-label">このコードで壊した：</div>
        <pre class="record-code">${escapeHTML(rec.code)}</pre>
        <div class="record-msg">${escapeHTML(rec.message)}</div>
      </div>` : ""}
    </div>`;
  });
  ui.badgeList.innerHTML = html;
  // 取得済みバッジをクリック → 記録の開閉
  ui.badgeList.querySelectorAll(".badge-row.clickable").forEach((row) => {
    row.addEventListener("click", () => {
      const rec = ui.badgeList.querySelector(`.badge-record[data-record="${row.dataset.error}"]`);
      if (rec) rec.classList.toggle("hidden");
    });
  });
  // アイコンを描画（取得済みは金、未取得はシルエット）
  ui.badgeList.querySelectorAll("canvas.badge-icon").forEach((c) => {
    const i = +c.dataset.i;
    const got = c.dataset.got === "true";
    const cctx = c.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    const a = assets.badges[i];
    if (a) cctx.drawImage(a.img, a.sx, a.sy, a.w, a.h, 0, 0, 32, 32);
    else {
      const save = ctx;
      // プレースホルダ描画関数はメインctx依存なので一時差し替え
      window.__tmpDraw(cctx, i);
    }
    if (!got) {
      cctx.globalCompositeOperation = "source-atop";
      cctx.fillStyle = "#3c4048";
      cctx.fillRect(0, 0, 32, 32);
    }
  });
  // ログ要約
  const secs = Math.floor((performance.now() - startTime) / 1000);
  ui.logSummary.innerHTML =
    `実行 ${log.runs}回（正常 ${log.okRuns} / エラー ${log.errorRuns}）　編集 ${log.editEvents}回<br>` +
    `エラー内訳：${Object.entries(log.errorCounts).map(([k, v]) => `${k}×${v}`).join("、") || "なし"}<br>` +
    (log.unknownErrors.length
      ? `未知のエラー発見：${log.unknownErrors.map((u) => u.errorType).join("、")}<br>` : "") +
    `セッション時間 ${fmtTime(secs)}`;
}

// コレクション用のバッジプレースホルダ（別canvasに描く版）
window.__tmpDraw = (cctx, index) => {
  const P = (px, py, w, h, c) => { cctx.fillStyle = c; cctx.fillRect(px, py, w, h); };
  P(8, 2, 16, 4, "#dcb67a"); P(4, 6, 24, 20, "#dcb67a"); P(8, 26, 16, 4, "#dcb67a");
  P(10, 8, 12, 16, "#1e1e2e");
  const marks = [
    [[12,10,8,2],[12,14,4,2],[12,18,8,2]],
    [[15,10,2,12],[12,20,8,2]],
    [[12,10,2,12],[18,10,2,12],[14,14,2,2],[16,16,2,2]],
    [[12,10,8,2],[15,12,2,10]],
  ];
  if (marks[index]) {
    for (const [px, py, w, h] of marks[index]) P(px, py, w, h, "#dcb67a");
  } else {
    for (let d = 0; d < index + 1; d++) {
      P(12 + (d % 3) * 4, 10 + Math.floor(d / 3) * 4, 2, 2, "#dcb67a");
    }
  }
};

function saveLog() {
  const data = {
    ...log,
    sessionSeconds: Math.floor((performance.now() - startTime) / 1000),
    badgesUnlocked: [...badgesUnlocked],
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "error-achievements-log.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ---------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------
let startTime = performance.now();
let perfNow = 0;
let lastHudSec = -1;

function frame(now) {
  perfNow = now;
  if (!paused) updatePlayer();
  updateCamera();

  drawBackground();
  drawTiles();
  drawTerminals();
  drawDroppedBadges();
  drawPlayer();
  drawParticles();

  // 経過時間HUD（1秒ごとに更新）
  const secs = Math.floor((now - startTime) / 1000);
  if (secs !== lastHudSec) {
    lastHudSec = secs;
    ui.hudTime.textContent = fmtTime(secs);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------
// 起動
// ---------------------------------------------------------------
(async () => {
  updateHUD();
  ui.pyStatus.textContent = "Python実行環境（Pyodide）を読み込み中…";
  loadAssets().then(() => {});
  PY.init().then((ok) => {
    ui.pyStatus.textContent = ok
      ? "Pyodide 準備完了：本物のPythonで実行します"
      : "Pyodideを読み込めませんでした：簡易実行モード（フォールバック）で動作中";
  });
  requestAnimationFrame(frame);
})();

})();
