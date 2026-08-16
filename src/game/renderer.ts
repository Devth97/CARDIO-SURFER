import type { Coin, Obstacle, PowerUpItem } from './types';
import type { PlayerRenderState } from './GameEngine';

// Perspective projection parameters tuned to match Subway Surfers FOV (Image 2)
const NEAR = 140;
const FAR = 850;
const LANE_WORLD_WIDTH = 260; // Wide track spacing matching reference image

function depthAt(z: number) {
  return FAR - z * (FAR - NEAR);
}

function scaleAt(z: number) {
  return NEAR / depthAt(z);
}

interface Viewport {
  width: number;
  height: number;
  horizonY: number;
  playerY: number;
  centerX: number;
}

export function getViewport(width: number, height: number): Viewport {
  return {
    width,
    height,
    horizonY: height * 0.40,
    playerY: height * 0.90,
    centerX: width / 2,
  };
}

function projectY(vp: Viewport, z: number) {
  return vp.horizonY + (vp.playerY - vp.horizonY) * scaleAt(z);
}

function projectX(vp: Viewport, lane: number, z: number) {
  const laneOffset = (lane - 1) * LANE_WORLD_WIDTH;
  return vp.centerX + laneOffset * scaleAt(z);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  player: PlayerRenderState,
  obstacles: Obstacle[],
  coins: Coin[],
  powerUps: PowerUpItem[],
  skyOffset: number,
) {
  const { width, height } = vp;
  ctx.clearRect(0, 0, width, height);

  // 1. Bright Sunny Mediterranean Sky & Buildings (Image 2 Reference)
  drawSkyAndEnvironment(ctx, vp, skyOffset);

  // 2. Sand/Tan Ballast Track Bed & 3D Steel Railroad Tracks
  drawSubwayTrackBed(ctx, vp, skyOffset);

  // 3. Decorative Festive Overhead Arches (Image 2)
  drawOverheadFestiveArches(ctx, vp, skyOffset);

  // 4. Depth-sort and draw 3D Trains, Barriers, Coins, Power-ups
  const drawables: { z: number; draw: () => void }[] = [];

  for (const o of obstacles) {
    if (o.z < -0.05) continue;
    drawables.push({ z: o.z, draw: () => draw3DObstacle(ctx, vp, o) });
  }
  for (const c of coins) {
    if (c.collected || c.z < -0.05) continue;
    drawables.push({ z: c.z, draw: () => drawSubwayCoin(ctx, vp, c, skyOffset) });
  }
  for (const p of powerUps) {
    if (p.collected || p.z < -0.05) continue;
    drawables.push({ z: p.z, draw: () => drawPowerUpItem(ctx, vp, p, skyOffset) });
  }

  drawables.sort((a, b) => a.z - b.z);
  for (const d of drawables) d.draw();

  // 5. Draw Jake Runner Character (Image 2 Back View)
  drawJakePlayer(ctx, vp, player, skyOffset);
}

// --- 1. SKY & MEDITERRANEAN BUILDINGS (Matching Image 2 Reference) ---
function drawSkyAndEnvironment(ctx: CanvasRenderingContext2D, vp: Viewport, offset: number) {
  // Vibrant Blue Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, vp.horizonY);
  skyGrad.addColorStop(0, '#29b6f6');
  skyGrad.addColorStop(0.7, '#4fc3f7');
  skyGrad.addColorStop(1, '#81d4fa');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, vp.width, vp.horizonY);

  // Distant Mountain Peaks & Clouds at Horizon
  ctx.fillStyle = '#26c6da';
  ctx.beginPath();
  ctx.moveTo(0, vp.horizonY);
  ctx.lineTo(vp.width * 0.2, vp.horizonY - 35);
  ctx.lineTo(vp.width * 0.4, vp.horizonY);
  ctx.lineTo(vp.width * 0.7, vp.horizonY - 45);
  ctx.lineTo(vp.width, vp.horizonY - 15);
  ctx.lineTo(vp.width, vp.horizonY);
  ctx.closePath();
  ctx.fill();

  // Left Side Terracotta Buildings & Roofs (Image 2)
  const bldgWidthL = vp.width * 0.32;
  ctx.fillStyle = '#b71c1c'; // Terracotta roof
  ctx.fillRect(0, 0, bldgWidthL, vp.horizonY);
  ctx.fillStyle = '#d7ccc8'; // Wall facade
  ctx.fillRect(0, vp.horizonY * 0.35, bldgWidthL * 0.85, vp.horizonY * 0.65);

  // Windows & Architectural Insets on Left Wall
  ctx.fillStyle = '#8d6e63';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(20 + i * 45, vp.horizonY * 0.45, 25, 35);
  }

  // Right Side Terracotta Buildings & Walls (Image 2)
  const rightX = vp.width * 0.68;
  ctx.fillStyle = '#c62828';
  ctx.fillRect(rightX, 0, vp.width - rightX, vp.horizonY);
  ctx.fillStyle = '#bcaaa4';
  ctx.fillRect(rightX + 20, vp.horizonY * 0.3, vp.width - rightX - 20, vp.horizonY * 0.7);

  // Sand/Tan Ground Track Surface below Horizon (Image 2)
  ctx.fillStyle = '#d7ccc8';
  ctx.fillRect(0, vp.horizonY, vp.width, vp.height - vp.horizonY);
}

// --- 2. SUBWAY TRACK BED & 3D RAILS (Image 2 Reference) ---
function drawSubwayTrackBed(ctx: CanvasRenderingContext2D, vp: Viewport, offset: number) {
  // Center Gravel Track Bed (Sand/Tan Gravel matching Image 2)
  const topBedL = projectX(vp, -0.7, 0);
  const topBedR = projectX(vp, 2.7, 0);
  const botBedL = projectX(vp, -0.7, 1);
  const botBedR = projectX(vp, 2.7, 1);

  ctx.fillStyle = '#cfb997'; // Warm beige track gravel
  ctx.beginPath();
  ctx.moveTo(topBedL, vp.horizonY);
  ctx.lineTo(topBedR, vp.horizonY);
  ctx.lineTo(botBedR, vp.playerY + 60);
  ctx.lineTo(botBedL, vp.playerY + 60);
  ctx.closePath();
  ctx.fill();

  // Thick Wooden Cross-Ties (Sleepers)
  const tieCount = 18;
  for (let i = 0; i < tieCount; i++) {
    const z = (i / tieCount + offset) % 1;
    const y = projectY(vp, z);
    const scale = scaleAt(z);
    const tieHeight = Math.max(3, 10 * scale);

    const xL = projectX(vp, -0.65, z);
    const xR = projectX(vp, 2.65, z);

    // Dark Wood Sleeper Block
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(xL, y, xR - xL, tieHeight);

    // Sleeper Highlight
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(xL, y, xR - xL, Math.max(1, 3 * scale));
  }

  // Dual 3D Steel Rails for all 3 Lanes
  const lanes = [0, 1, 2];
  for (const lane of lanes) {
    for (const side of [-0.36, 0.36]) {
      const railOffset = lane + side;
      const topX = projectX(vp, railOffset, 0);
      const botX = projectX(vp, railOffset, 1);

      // Steel Rail Shadow
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(topX, vp.horizonY);
      ctx.lineTo(botX, vp.playerY + 60);
      ctx.stroke();

      // Metallic Steel Rail Body
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(topX, vp.horizonY);
      ctx.lineTo(botX, vp.playerY + 60);
      ctx.stroke();

      // Rail Top Reflection (White Highlight Line)
      ctx.strokeStyle = '#eceff1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(topX, vp.horizonY);
      ctx.lineTo(botX, vp.playerY + 60);
      ctx.stroke();
    }
  }
}

// --- 3. OVERHEAD FESTIVE ARCHES (Image 2 Reference) ---
function drawOverheadFestiveArches(ctx: CanvasRenderingContext2D, vp: Viewport, offset: number) {
  const archZList = [0.15, 0.45, 0.75];
  for (const zBase of archZList) {
    const z = (zBase + offset * 0.5) % 1;
    const scale = scaleAt(z);
    const y = projectY(vp, z);

    const leftX = projectX(vp, -0.6, z);
    const rightX = projectX(vp, 2.6, z);
    const archH = 140 * scale;

    // Pink / Magenta Festive Arch Ribbons (Matching Image 2)
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.quadraticCurveTo(vp.centerX, y - archH, rightX, y);
    ctx.stroke();

    // Gold Lanterns on Arch
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(vp.centerX, y - archH * 0.88, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- 4. 3D TRAINS & OBSTACLES (Matching Image 2 Reference) ---
function draw3DObstacle(ctx: CanvasRenderingContext2D, vp: Viewport, o: Obstacle) {
  const scale = scaleAt(o.z);
  const x = projectX(vp, o.lane, o.z);
  const y = projectY(vp, o.z);
  const w = 180 * scale;

  if (o.type === 'low') {
    // Red & White Chevron Hurdle Barrier (Image 2 Center Obstacle)
    const h = 55 * scale;
    const boardH = 34 * scale;
    const boardY = y - h;

    // Wooden Support Legs
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x - w / 2 + 12 * scale, y - h, 12 * scale, h);
    ctx.fillRect(x + w / 2 - 24 * scale, y - h, 12 * scale, h);

    // Red & White Diagonal Chevron Pattern Barrier (Image 2)
    ctx.fillStyle = '#d32f2f';
    roundRect(ctx, x - w / 2, boardY, w, boardH, 6 * scale);
    ctx.fill();

    // White Chevrons
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x - w / 2, boardY, w, boardH, 6 * scale);
    ctx.clip();

    const chevronW = 20 * scale;
    for (let cx = -w; cx < w * 2; cx += chevronW * 2) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + cx, boardY);
      ctx.lineTo(x - w / 2 + cx + chevronW, boardY + boardH / 2);
      ctx.lineTo(x - w / 2 + cx, boardY + boardH);
      ctx.lineTo(x - w / 2 + cx - chevronW * 0.6, boardY + boardH);
      ctx.lineTo(x - w / 2 + cx + chevronW * 0.4, boardY + boardH / 2);
      ctx.lineTo(x - w / 2 + cx - chevronW * 0.6, boardY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (o.type === 'high') {
    // Orange Freight Car Container Train (Image 2 Right Obstacle)
    const trainH = 200 * scale;
    const trainY = y - trainH;

    // Deep Orange Corrugated Container Body (Image 2)
    ctx.fillStyle = '#e65100';
    roundRect(ctx, x - w / 2, trainY, w, trainH, 8 * scale);
    ctx.fill();

    // Vertical Rib Corrugation Lines
    ctx.fillStyle = '#f57c00';
    for (let rx = 10 * scale; rx < w - 10 * scale; rx += 18 * scale) {
      ctx.fillRect(x - w / 2 + rx, trainY + 8 * scale, 6 * scale, trainH - 16 * scale);
    }

    // Container Top Rim & Corner Reinforcements
    ctx.fillStyle = '#bf360c';
    ctx.fillRect(x - w / 2, trainY, w, 12 * scale);
    ctx.fillRect(x - w / 2, trainY + trainH - 12 * scale, w, 12 * scale);
  } else {
    // Red & Silver Curved Passenger Subway Train (Image 2 Left Obstacle)
    const trainH = 210 * scale;
    const trainY = y - trainH;

    // Curved Metallic Grey Roof Top (Image 2)
    ctx.fillStyle = '#90a4ae';
    roundRect(ctx, x - w / 2, trainY, w, 40 * scale, 16 * scale);
    ctx.fill();

    // Red Side Body Panel (Image 2)
    ctx.fillStyle = '#c62828';
    ctx.fillRect(x - w / 2, trainY + 30 * scale, w, trainH - 30 * scale);

    // Dark Teal Windows Line (Image 2)
    ctx.fillStyle = '#006064';
    ctx.fillRect(x - w / 2 + 8 * scale, trainY + 55 * scale, w - 16 * scale, 45 * scale);

    // White Divider Stripe (Image 2)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 2, trainY + 105 * scale, w, 8 * scale);

    // Silver Front Nose Cone
    ctx.fillStyle = '#cfd8dc';
    roundRect(ctx, x - w / 2 + 10 * scale, trainY + 120 * scale, w - 20 * scale, 75 * scale, 12 * scale);
    ctx.fill();

    // Dual Headlights
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.arc(x - w / 2 + 25 * scale, trainY + 155 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.arc(x + w / 2 - 25 * scale, trainY + 155 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- 5. COINS & POWERUPS ---
function drawSubwayCoin(ctx: CanvasRenderingContext2D, vp: Viewport, c: Coin, offset: number) {
  const scale = scaleAt(c.z);
  const x = projectX(vp, c.lane, c.z);
  const y = projectY(vp, c.z) - 65 * scale;
  const r = 20 * scale;

  const spin = Math.sin(offset * 14 + c.id);
  const coinW = Math.max(5 * scale, Math.abs(spin) * r);

  // Shiny Gold Coin
  const coinGrad = ctx.createLinearGradient(x - coinW, y - r, x + coinW, y + r);
  coinGrad.addColorStop(0, '#ffee55');
  coinGrad.addColorStop(0.5, '#ffb703');
  coinGrad.addColorStop(1, '#e65100');

  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.ellipse(x, y, coinW, r, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.stroke();
}

function drawPowerUpItem(ctx: CanvasRenderingContext2D, vp: Viewport, p: PowerUpItem, offset: number) {
  const scale = scaleAt(p.z);
  const x = projectX(vp, p.lane, p.z);
  const bobY = Math.sin(offset * 10 + p.id) * 8 * scale;
  const y = projectY(vp, p.z) - 80 * scale + bobY;
  const size = 26 * scale;

  ctx.save();
  ctx.translate(x, y);

  ctx.shadowColor = p.type === 'shield' ? '#00f0ff' : p.type === 'magnet' ? '#ff0055' : '#ffea00';
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = p.type === 'shield' ? '#00f0ff' : p.type === 'magnet' ? '#ff0055' : '#ffea00';
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.font = `bold ${Math.floor(16 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.type === 'shield' ? '🛡️' : p.type === 'magnet' ? '🧲' : '⭐', 0, 0);

  ctx.restore();
}

// --- 6. JAKE RUNNER PLAYER (Matching Image 2 Reference Back View) ---
function drawJakePlayer(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  player: PlayerRenderState,
  offset: number,
) {
  const scale = scaleAt(1);
  const x = projectX(vp, player.displayLane, 1);
  let y = projectY(vp, 1);

  // Jump Arc
  if (player.state === 'jumping') {
    const arc = Math.sin(Math.PI * player.jumpProgress);
    y -= arc * 150 * scale;
  }

  const isDucking = player.state === 'ducking';
  const bodyW = 44 * scale;
  const bodyH = (isDucking ? 40 : 80) * scale;

  // Running Shadow on Track
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x, projectY(vp, 1) + 4 * scale, bodyW * 0.7, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // White Hoodie (Image 2 Reference)
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - bodyW / 2, y - bodyH, bodyW, bodyH * 0.55, 10 * scale);
  ctx.fill();

  // Colorful Backpack Logo on Back (Image 2)
  ctx.fillStyle = '#29b6f6';
  roundRect(ctx, x - bodyW * 0.3, y - bodyH + 8 * scale, bodyW * 0.6, bodyH * 0.35, 6 * scale);
  ctx.fill();

  ctx.fillStyle = '#ffb703';
  ctx.font = `bold ${Math.floor(10 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CS', x, y - bodyH + 20 * scale);

  // Blue Jeans Pants (Image 2)
  ctx.fillStyle = '#1e88e5';
  roundRect(ctx, x - bodyW * 0.4, y - bodyH * 0.45, bodyW * 0.8, bodyH * 0.45, 6 * scale);
  ctx.fill();

  // White Sneakers (Image 2)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - bodyW * 0.38, y - 6 * scale, 14 * scale, 8 * scale);
  ctx.fillRect(x + bodyW * 0.1, y - 6 * scale, 14 * scale, 8 * scale);

  // Backwards Red Cap (Image 2)
  const headR = 15 * scale;
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(x, y - bodyH - headR * 0.5, headR, 0, Math.PI * 2);
  ctx.fill();

  // Cap Visor (Backwards rim)
  ctx.fillStyle = '#c62828';
  ctx.fillRect(x - headR * 0.8, y - bodyH - headR * 0.2, headR * 1.6, 5 * scale);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
