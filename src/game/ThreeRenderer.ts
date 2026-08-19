import * as THREE from 'three';
import type { GameEngine, PlayerRenderState } from './GameEngine';
import type { Coin, Obstacle, PowerUpItem } from './types';

// Lane spacing sized to the chase-cam distance below — wide enough to read as
// 3 distinct lanes at this distance, narrow enough that a side lane stays
// fully on screen on a portrait phone frame. Obstacle/rail widths are scaled
// to match so nothing from an adjacent lane visually overlaps.
const LANE_X_POSITIONS = [-1.7, 0, 1.7];
// Camera height is a real tradeoff, not a stylistic choice: with the player only ~8 world units
// from the camera and standing ~2.6 units tall, a same-lane "duck" hurdle (only ~1 unit tall) is
// geometrically swallowed by the player's own silhouette unless the camera sits well above the
// player's head height. Below ~3.5 the hurdle is only a fraction-of-a-pixel sliver even when it's
// still far away — not a usable warning. This value keeps a duck obstacle visibly poking above the
// player for a meaningful stretch of its approach, not just in the final instant before collision.
// (Now safe to raise without re-breaking the "two side-by-side obstacles black out a 3rd lane"
// case — that was actually caused by the camera never following the player's lane, fixed below.)
const CAMERA_HEIGHT = 4.6;
const CAMERA_WORLD_Z = 1.5; // Pulled well back from the runner so the character reads small against a wide forward view, not filling the frame
const PLAYER_WORLD_Z = -6.5; // Player positioned 8 world units in front of the camera
const CAMERA_LOOKAT_Y = -3.2; // Downward tilt target height
const CAMERA_LOOKAT_Z = -18.0; // Downward tilt target distance
const HORIZON_WORLD_Z = -80.0; // Far horizon position for oncoming obstacles
const JUMP_VISUAL_HEIGHT = 1.4; // Peak jump rise in world units — tall enough to read as a jump, short enough to stay in frame

// This is a portrait mobile runner. camera.fov below is a VERTICAL field of
// view, so on a wide desktop browser window (e.g. a 1920px-wide tab strip
// with a short viewport) the derived horizontal FOV balloons into an extreme
// wide-angle lens, visually squashing anything close to the camera — the
// player included. Clamp the aspect ratio actually used for the camera/canvas
// to a portrait-ish range and letterbox/pillarbox the rest, same as any
// mobile game does when played in a non-phone-shaped window, instead of
// stretching the lens to fill it.
const MIN_RENDER_ASPECT = 0.5; // guard against extreme-tall phones
const MAX_RENDER_ASPECT = 0.62; // guard against wide desktop windows

// --- PROCEDURAL TEXTURE GENERATORS ---

function createTrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Silver Roof
  ctx.fillStyle = '#b0bec5';
  ctx.fillRect(0, 0, 512, 100);

  // Roof Grills
  ctx.fillStyle = '#78909c';
  for (let x = 40; x < 480; x += 60) {
    ctx.fillRect(x, 20, 40, 60);
  }

  // Red Main Body
  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(0, 100, 512, 412);

  // Windows Stripe
  ctx.fillStyle = '#004d40';
  ctx.fillRect(0, 160, 512, 130);

  // Glass Windows with White Reflections
  for (let x = 30; x < 480; x += 110) {
    ctx.fillStyle = '#00838f';
    ctx.fillRect(x, 175, 85, 100);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(x + 10, 175);
    ctx.lineTo(x + 50, 175);
    ctx.lineTo(x + 10, 275);
    ctx.closePath();
    ctx.fill();
  }

  // White Accent Stripe
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 310, 512, 20);

  // Silver Nose Grill
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(40, 360, 432, 120);

  ctx.fillStyle = '#37474f';
  for (let x = 70; x < 430; x += 30) {
    ctx.fillRect(x, 380, 15, 80);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createChevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = '#ffffff';
  const chevronW = 40;
  for (let x = -40; x < 560; x += chevronW * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + chevronW, 64);
    ctx.lineTo(x, 128);
    ctx.lineTo(x - chevronW * 0.6, 128);
    ctx.lineTo(x + chevronW * 0.4, 64);
    ctx.lineTo(x - chevronW * 0.6, 0);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Power-up icon textures — drawn once and reused on a camera-facing sprite
// per power-up (see createPowerUpMesh), so magnet/shield/star are readable
// as distinct symbols rather than three same-shaped glowing spheres that
// only differ by color.
function createMagnetIconTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;

  ctx.lineCap = 'round';
  ctx.lineWidth = 16;

  // Silver horseshoe body.
  ctx.strokeStyle = '#e8eaf0';
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 34);
  ctx.lineTo(cx - 26, cy + 4);
  ctx.arc(cx, cy + 4, 26, Math.PI, 0, false);
  ctx.lineTo(cx + 26, cy - 34);
  ctx.stroke();

  // Red pole tips.
  ctx.strokeStyle = '#ff3b30';
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 34);
  ctx.lineTo(cx - 26, cy - 16);
  ctx.moveTo(cx + 26, cy - 34);
  ctx.lineTo(cx + 26, cy - 16);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

function createShieldIconTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 40);
  ctx.bezierCurveTo(cx + 24, cy - 34, cx + 36, cy - 30, cx + 36, cy - 18);
  ctx.bezierCurveTo(cx + 36, cy + 8, cx + 24, cy + 30, cx, cy + 42);
  ctx.bezierCurveTo(cx - 24, cy + 30, cx - 36, cy + 8, cx - 36, cy - 18);
  ctx.bezierCurveTo(cx - 36, cy - 30, cx - 24, cy - 34, cx, cy - 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#00838f';
  ctx.lineWidth = 4;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

function createStarIconTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;
  const spikes = 5;
  const outerR = 38;
  const innerR = 16;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerR;
    let y = cy + Math.sin(rot) * outerR;
    ctx.lineTo(x, y);
    rot += step;
    x = cx + Math.cos(rot) * innerR;
    y = cy + Math.sin(rot) * innerR;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e65100';
  ctx.lineWidth = 3;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

export class ThreeRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private playerGroup: THREE.Group;
  private playerLeftLeg: THREE.Mesh;
  private playerRightLeg: THREE.Mesh;
  private playerShieldAura: THREE.Mesh;

  private trackGroup: THREE.Group;
  private environmentGroup: THREE.Group;
  private obstacleMeshes: Map<number, THREE.Group> = new Map();
  private coinMeshes: Map<number, THREE.Mesh> = new Map();
  private powerUpMeshes: Map<number, THREE.Group> = new Map();

  // Cached Textures
  private trainTexture = createTrainTexture();
  private chevronTexture = createChevronTexture();
  private magnetIconTexture = createMagnetIconTexture();
  private shieldIconTexture = createShieldIconTexture();
  private starIconTexture = createStarIconTexture();

  private clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private engine: GameEngine;
  private resizeObserver: ResizeObserver;

  // Reports a user-visible, non-DevTools-only signal when the 3D view stops
  // rendering (blank clear-color canvas) — either a WebGL context loss that
  // doesn't auto-restore, or the per-frame update throwing repeatedly. Pass
  // null to clear a previously-reported issue.
  private onRenderIssue: ((message: string | null) => void) | null;
  private contextLostTimeoutId: number | null = null;
  private consecutiveRenderErrors = 0;
  private lastReportedRenderError: string | null = null;
  // TEMPORARY diagnostic — see the comment on .hud-debug-panel in HUD.tsx.
  // No banner appeared during a reported blank-canvas occurrence, ruling out
  // both webglcontextlost and repeated render exceptions, which points back
  // to a sizing issue — but the earlier ResizeObserver fix (97a9a17) only
  // re-corrects size on an actual *change*; if the container is wrong from
  // the very first layout and then stays stable at that wrong size, it'd
  // never fire again. Reports the real numbers on every size computation so
  // the next occurrence is diagnosable from a screenshot instead of guessed.
  private onSizeReport: ((info: string) => void) | null;

  constructor(
    container: HTMLElement,
    engine: GameEngine,
    onRenderIssue?: (message: string | null) => void,
    onSizeReport?: (info: string) => void,
  ) {
    this.container = container;
    this.engine = engine;
    this.onRenderIssue = onRenderIssue ?? null;
    this.onSizeReport = onSizeReport ?? null;

    // 1. Scene & Atmosphere Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#29b6f6'); // Bright Sunny Sky (Image 2 Reference)
    this.scene.fog = new THREE.FogExp2('#29b6f6', 0.006);

    // 2. Camera Setup — close low chase-cam behind the runner (Subway Surfers style:
    // camera trails just above/behind the character with a shallow tilt, not a
    // high steep-down security-cam angle, so the runner always reads on screen).
    const { width: renderWidth, height: renderHeight } = this.computeRenderSize();
    this.camera = new THREE.PerspectiveCamera(65, renderWidth / renderHeight, 0.1, 1000);
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_WORLD_Z);
    this.camera.lookAt(0, CAMERA_LOOKAT_Y, CAMERA_LOOKAT_Z);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(renderWidth, renderHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.centerCanvas();
    container.appendChild(this.renderer.domElement);
    this.reportSize(renderWidth, renderHeight);
    // Without calling preventDefault() here, a lost WebGL context (a known
    // mobile-Chrome occurrence under memory/GPU pressure) is unrecoverable —
    // the canvas renders nothing but its own clear color for the rest of the
    // page's life, while everything GPU-independent (game logic, pose
    // tracking, HUD) keeps running normally. This is what let the browser
    // attempt automatic context restoration instead.
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost — attempting restoration');
      // Restoration is usually near-instant when it happens at all — if it
      // hasn't within a few seconds, it isn't going to, and the blank canvas
      // needs a real page reload rather than sitting frozen indefinitely
      // with no signal a non-technical player would ever notice.
      this.contextLostTimeoutId = window.setTimeout(() => {
        this.onRenderIssue?.('The 3D view lost its graphics connection and couldn\'t reconnect.');
      }, 4000);
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.warn('WebGL context restored');
      if (this.contextLostTimeoutId !== null) {
        window.clearTimeout(this.contextLostTimeoutId);
        this.contextLostTimeoutId = null;
      }
      this.onRenderIssue?.(null);
    });

    // 4. Lighting Setup
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.95);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#81d4fa', '#e0c088', 0.85);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#ffffff', 2.0);
    dirLight.position.set(10, 30, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    this.scene.add(dirLight);

    // 5. Build Environment & Tracks
    this.trackGroup = new THREE.Group();
    this.environmentGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this.scene.add(this.environmentGroup);

    this.buildTrackEnvironment();

    // 6. Build 3D Jake Player Model
    const { playerGroup, playerLeftLeg, playerRightLeg, playerShieldAura } = this.create3DJakePlayer();
    this.playerGroup = playerGroup; // Attach the populated THREE.Group containing all player meshes!
    this.playerLeftLeg = playerLeftLeg;
    this.playerRightLeg = playerRightLeg;
    this.playerShieldAura = playerShieldAura;

    // Anchor player at Z = -6.5, sized in world units directly (no extra scale-up —
    // the close chase-cam already reads the character at full size).
    this.playerGroup.position.set(0, 0, PLAYER_WORLD_Z);
    this.scene.add(this.playerGroup);

    // 7. Handle Resize & Start Loop
    // A plain `window: resize` listener isn't enough on Android WebViews:
    // right after cold start the container can still be 0x0 (or mid-layout)
    // when this constructor runs, and the WebView often never dispatches a
    // `resize` DOM event once its own layout/insets settle — so the renderer
    // was getting stuck at its garbage initial size (or the constructor's
    // `|| 1` fallback), rendering nothing but its flat blue clear color
    // forever. ResizeObserver fires whenever the container's actual box
    // changes for any reason, including that first post-layout settle.
    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.onWindowResize);
    this.animate();
  }

  private buildTrackEnvironment() {
    // Warm Sand Ballast Bed Ground (Image 2)
    const groundGeo = new THREE.PlaneGeometry(140, 250);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#e0c088',
      roughness: 0.85,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -50;
    ground.receiveShadow = true;
    this.trackGroup.add(ground);

    // 3D Wooden Sleepers (Cross-Ties)
    const sleeperGeo = new THREE.BoxGeometry(6.0, 0.2, 0.45);
    const sleeperMat = new THREE.MeshStandardMaterial({
      color: '#5d4037',
      roughness: 0.8,
    });

    for (let z = -130; z <= 20; z += 2.2) {
      const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
      sleeper.position.set(0, 0.1, z);
      sleeper.receiveShadow = true;
      this.trackGroup.add(sleeper);
    }

    // 3D Metallic Steel Rails (3 Lanes x 2 Rails)
    const railGeo = new THREE.BoxGeometry(0.16, 0.32, 160);
    const railMat = new THREE.MeshStandardMaterial({
      color: '#cfd8dc',
      metalness: 0.9,
      roughness: 0.2,
    });

    for (const laneX of LANE_X_POSITIONS) {
      for (const sideOffset of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(laneX + sideOffset, 0.32, -50);
        rail.castShadow = true;
        this.trackGroup.add(rail);
      }
    }

    // Left & Right Side Environment
    this.buildSideEnvironment();
  }

  private buildSideEnvironment() {
    const houseGeo = new THREE.BoxGeometry(10, 16, 10);
    const houseMat = new THREE.MeshStandardMaterial({ color: '#d7ccc8', roughness: 0.7 });
    const roofGeo = new THREE.ConeGeometry(7, 5, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });

    for (let z = -120; z <= 15; z += 20) {
      for (const side of [-1, 1]) {
        const houseGroup = new THREE.Group();
        const house = new THREE.Mesh(houseGeo, houseMat);
        house.position.y = 8;
        house.castShadow = true;
        houseGroup.add(house);

        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 18.5;
        roof.rotation.y = Math.PI / 4;
        houseGroup.add(roof);

        houseGroup.position.set(side * 20, 0, z); // Positioned outward at x = ±20
        this.environmentGroup.add(houseGroup);

        // 3D Palm Trees
        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 9, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: '#6d4c41' });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(side * 12.5, 4.5, z + 10);
        trunk.castShadow = true;
        this.environmentGroup.add(trunk);

        const leavesGeo = new THREE.ConeGeometry(4.5, 3.5, 6);
        const leavesMat = new THREE.MeshStandardMaterial({ color: '#2e7d32' });
        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.set(side * 12.5, 9.5, z + 10);
        this.environmentGroup.add(leaves);
      }
    }
  }

  private create3DJakePlayer() {
    const playerGroup = new THREE.Group();

    // 1. Torso / White Hoodie — one chunky bold-colored box (back view facing
    // down the track). Bigger and simpler than a multi-part torso so the
    // silhouette reads instantly at chase-cam distance.
    const torsoGeo = new THREE.BoxGeometry(0.95, 1.1, 0.6);
    const torsoMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const playerTorso = new THREE.Mesh(torsoGeo, torsoMat);
    playerTorso.position.y = 1.35;
    playerTorso.castShadow = true;
    playerGroup.add(playerTorso);

    // Backpack — flat solid color, no procedural texture needed for a shape this small.
    const packGeo = new THREE.BoxGeometry(0.6, 0.65, 0.28);
    const packMat = new THREE.MeshStandardMaterial({ color: '#29b6f6' });
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, 1.35, 0.34);
    playerGroup.add(pack);

    // 2. Head & Skin Tone
    const headGeo = new THREE.SphereGeometry(0.36, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: '#ffdbac', roughness: 0.6 });
    const playerHead = new THREE.Mesh(headGeo, headMat);
    playerHead.position.y = 2.15;
    playerHead.castShadow = true;
    playerGroup.add(playerHead);

    // 3. Backwards Red Baseball Cap — the single most recognizable silhouette cue.
    const capGeo = new THREE.SphereGeometry(0.39, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({ color: '#e53935' });
    const playerCap = new THREE.Mesh(capGeo, capMat);
    playerCap.position.y = 2.24;
    playerGroup.add(playerCap);

    // Cap Visor (Facing camera/backwards)
    const visorGeo = new THREE.BoxGeometry(0.5, 0.06, 0.34);
    const visorMat = new THREE.MeshStandardMaterial({ color: '#c62828' });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 2.22, 0.4);
    playerGroup.add(visor);

    // 4. Legs / Blue Denim Jeans — kept as two separate boxes so the run-cycle
    // leg swing below actually reads as running, not a static block.
    const legGeo = new THREE.BoxGeometry(0.34, 0.85, 0.38);
    const legMat = new THREE.MeshStandardMaterial({ color: '#1976d2' });

    const playerLeftLeg = new THREE.Mesh(legGeo, legMat);
    playerLeftLeg.position.set(-0.24, 0.42, 0);
    playerLeftLeg.castShadow = true;
    playerGroup.add(playerLeftLeg);

    const playerRightLeg = new THREE.Mesh(legGeo, legMat);
    playerRightLeg.position.set(0.24, 0.42, 0);
    playerRightLeg.castShadow = true;
    playerGroup.add(playerRightLeg);

    // 5. Shield Power-up Aura
    const auraGeo = new THREE.SphereGeometry(1.5, 24, 24);
    const auraMat = new THREE.MeshStandardMaterial({
      color: '#00f0ff',
      transparent: true,
      opacity: 0.35,
      wireframe: true,
    });
    const playerShieldAura = new THREE.Mesh(auraGeo, auraMat);
    playerShieldAura.position.y = 1.35;
    playerShieldAura.visible = false;
    playerGroup.add(playerShieldAura);

    return {
      playerGroup, // <--- Crucial fix: return populated player group!
      playerTorso,
      playerHead,
      playerCap,
      playerLeftLeg,
      playerRightLeg,
      playerShieldAura,
    };
  }

  // --- 3D OBSTACLE MESH CREATORS WITH TEXTURES ---

  private createSubwayTrainMesh(): THREE.Group {
    const group = new THREE.Group();

    // Metallic Grey Curved Roof
    const roofGeo = new THREE.BoxGeometry(1.15, 0.5, 6.0);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#90a4ae', metalness: 0.8, roughness: 0.3 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.6;
    roof.castShadow = true;
    group.add(roof);

    // Main Red Train Body with Detailed Texture Map — kept lower than the
    // elevated chase-cam height so two side-by-side trains still leave a
    // clear sightline over the top to whatever's further down the track.
    const bodyGeo = new THREE.BoxGeometry(1.15, 2.3, 6.0);
    const bodyMat = new THREE.MeshStandardMaterial({ map: this.trainTexture, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    group.add(body);

    // Silver Nose Front (Facing Player)
    const noseGeo = new THREE.BoxGeometry(1.05, 1.8, 1.2);
    const noseMat = new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.7 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.9, 3.0);
    group.add(nose);

    // Glowing Headlights
    const lightGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fff59d' });
    const lightL = new THREE.Mesh(lightGeo, lightMat);
    lightL.position.set(-0.35, 0.9, 3.6);
    group.add(lightL);

    const lightR = new THREE.Mesh(lightGeo, lightMat);
    lightR.position.set(0.35, 0.9, 3.6);
    group.add(lightR);

    return group;
  }

  private createDuckWarningBarrierMesh(): THREE.Group {
    const group = new THREE.Group();

    // This is the 'high' obstacle type — cleared by ducking, not by jumping
    // or switching lanes. Ducking scales the player group to 0.6x height
    // around its y=0 base, so a ducking player's head sits at roughly
    // 2.15 * 0.6 ≈ 1.3; standing head height is ~2.15-2.24. The posts and
    // panel below are sized to leave open space under y≈1.6 (clear for a
    // ducking player) while blocking y≈1.6-2.2 (hits a standing player).
    //
    // Styled as a railway warning barrier rather than a plain beam — the
    // red/white chevron panel (reusing the same texture as the 'low'
    // hurdle) and end lights read as "hazard, duck now" at a glance, and
    // the wide flat panel gives it a distinct silhouette from the 'full'
    // obstacle's train-car shape even at a distance.
    const postGeo = new THREE.BoxGeometry(0.22, 1.6, 0.22);
    const postMat = new THREE.MeshStandardMaterial({ color: '#3e3e42', metalness: 0.4, roughness: 0.6 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-0.62, 0.8, 0);
    group.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(0.62, 0.8, 0);
    group.add(postR);

    // Red/white chevron warning panel — bottom edge at y≈1.6.
    const panelGeo = new THREE.BoxGeometry(1.15, 0.6, 0.22);
    const panelMat = new THREE.MeshStandardMaterial({ map: this.chevronTexture, roughness: 0.4 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.y = 1.9;
    panel.castShadow = true;
    group.add(panel);

    // Round warning lights at each end of the panel.
    const lightGeo = new THREE.SphereGeometry(0.13, 16, 16);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
    const lightL = new THREE.Mesh(lightGeo, lightMat);
    lightL.position.set(-0.62, 1.9, 0.13);
    group.add(lightL);

    const lightR = new THREE.Mesh(lightGeo, lightMat);
    lightR.position.set(0.62, 1.9, 0.13);
    group.add(lightR);

    return group;
  }

  private createRedWhiteHurdleMesh(): THREE.Group {
    const group = new THREE.Group();

    // Wooden Posts
    const postGeo = new THREE.BoxGeometry(0.2, 1.0, 0.2);
    const postMat = new THREE.MeshStandardMaterial({ color: '#5d4037' });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-0.62, 0.5, 0);
    group.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(0.62, 0.5, 0);
    group.add(postR);

    // Red & White Chevron Board with Texture Map
    const boardGeo = new THREE.BoxGeometry(1.15, 0.65, 0.15);
    const boardMat = new THREE.MeshStandardMaterial({ map: this.chevronTexture, roughness: 0.4 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 0.65;
    board.castShadow = true;
    group.add(board);

    return group;
  }

  private create3DGoldCoinMesh(): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffd700',
      metalness: 0.95,
      roughness: 0.1,
    });
    const coin = new THREE.Mesh(geo, mat);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    return coin;
  }

  private createPowerUpMesh(type: string): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.7, 20, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: type === 'shield' ? '#00f0ff' : type === 'magnet' ? '#ff0055' : '#ffea00',
      emissive: type === 'shield' ? '#00f0ff' : type === 'magnet' ? '#ff0055' : '#ffea00',
      emissiveIntensity: 0.5,
      metalness: 0.5,
    });
    const sphere = new THREE.Mesh(geo, mat);
    group.add(sphere);

    // Camera-facing icon so the three power-ups read as distinct symbols
    // (magnet/shield/star) at a glance, not just three same-shaped glowing
    // spheres that only differ by color. A Sprite always faces the camera
    // regardless of the group's rotation. Positioned just in front of the
    // sphere's surface (radius 0.7) so the sphere's own near-facing
    // geometry doesn't occlude it.
    const iconTexture =
      type === 'shield'
        ? this.shieldIconTexture
        : type === 'magnet'
          ? this.magnetIconTexture
          : this.starIconTexture;
    const iconMat = new THREE.SpriteMaterial({ map: iconTexture, transparent: true, depthWrite: false });
    const icon = new THREE.Sprite(iconMat);
    icon.scale.set(0.85, 0.85, 1);
    icon.position.z = 0.72;
    group.add(icon);

    return group;
  }

  // --- RENDER LOOP & STATE SYNCHRONIZATION ---

  public updateAndRender() {
    const timeDelta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    const playerState: PlayerRenderState = this.engine.getPlayerRenderState();
    const obstacles: Obstacle[] = this.engine.getObstacles();
    const coins: Coin[] = this.engine.getCoins();
    const powerUps: PowerUpItem[] = this.engine.getPowerUps();

    // 1. Synchronize 3D Jake Player Position & Animations
    const targetX = LANE_X_POSITIONS[Math.round(playerState.displayLane)];
    this.playerGroup.position.x = THREE.MathUtils.lerp(this.playerGroup.position.x, targetX, 0.3);

    // Follow the player's lane with the camera. Without this the camera stays
    // nailed to world X=0 forever — so switching to a side lane still looks
    // straight down the CENTER lane, meaning obstacles in lanes that aren't
    // even the player's own can dominate the frame and black out the view.
    this.camera.position.x = this.playerGroup.position.x;
    this.camera.lookAt(this.playerGroup.position.x, CAMERA_LOOKAT_Y, CAMERA_LOOKAT_Z);
    this.playerGroup.position.z = PLAYER_WORLD_Z; // Anchored at Z = -6.5 (4.5 units in front of camera at Z = -2.0)

    // Jump Arc & Duck Crouch
    if (playerState.state === 'jumping') {
      const jumpArc = Math.sin(Math.PI * playerState.jumpProgress);
      this.playerGroup.position.y = jumpArc * JUMP_VISUAL_HEIGHT;
      this.playerGroup.scale.set(1, 1, 1);
    } else if (playerState.state === 'ducking') {
      this.playerGroup.position.y = 0;
      this.playerGroup.scale.set(1, 0.6, 1);
    } else {
      this.playerGroup.position.y = 0;
      this.playerGroup.scale.set(1, 1, 1);
    }

    // Running Leg Swing Animation
    const legSwing = Math.sin(elapsedTime * 16) * 0.45;
    this.playerLeftLeg.rotation.x = legSwing;
    this.playerRightLeg.rotation.x = -legSwing;

    // Shield Aura Status
    this.playerShieldAura.visible = playerState.activePowerUps.shield;

    // 2. Synchronize 3D Obstacles (Mapped from HORIZON_WORLD_Z to PLAYER_WORLD_Z)
    const currentObstacleIds = new Set(obstacles.map((o) => o.id));
    for (const [id, mesh] of this.obstacleMeshes) {
      if (!currentObstacleIds.has(id)) {
        this.scene.remove(mesh);
        this.obstacleMeshes.delete(id);
      }
    }

    for (const o of obstacles) {
      if (o.z < -0.05 || o.z > 1.05) continue;
      let mesh = this.obstacleMeshes.get(o.id);
      if (!mesh) {
        mesh =
          o.type === 'low'
            ? this.createRedWhiteHurdleMesh()
            : o.type === 'high'
              ? this.createDuckWarningBarrierMesh()
              : this.createSubwayTrainMesh();
        this.scene.add(mesh);
        this.obstacleMeshes.set(o.id, mesh);
      }

      // Clamp so an obstacle never renders closer to the camera than the player
      // stands — without this, o.z briefly overshooting 1 (by design, for a
      // smooth pass-by instead of an abrupt pop) puts the obstacle IN FRONT of
      // the player from the camera's point of view, blacking out the character
      // behind a wall of freight-car geometry right as it matters most.
      const worldZ = THREE.MathUtils.lerp(HORIZON_WORLD_Z, PLAYER_WORLD_Z, Math.min(o.z, 1));
      const worldX = LANE_X_POSITIONS[o.lane];
      mesh.position.set(worldX, 0, worldZ);
    }

    // 3. Synchronize 3D Gold Coins
    const currentCoinIds = new Set(coins.filter((c) => !c.collected).map((c) => c.id));
    for (const [id, mesh] of this.coinMeshes) {
      if (!currentCoinIds.has(id)) {
        this.scene.remove(mesh);
        this.coinMeshes.delete(id);
      }
    }

    for (const c of coins) {
      if (c.collected || c.z < -0.05 || c.z > 1.05) continue;
      let mesh = this.coinMeshes.get(c.id);
      if (!mesh) {
        mesh = this.create3DGoldCoinMesh();
        this.scene.add(mesh);
        this.coinMeshes.set(c.id, mesh);
      }

      const worldZ = THREE.MathUtils.lerp(HORIZON_WORLD_Z, PLAYER_WORLD_Z, Math.min(c.z, 1));
      const worldX = LANE_X_POSITIONS[c.lane];
      mesh.position.set(worldX, 1.4, worldZ);
      mesh.rotation.y += timeDelta * 4;
    }

    // 4. Synchronize 3D PowerUps
    const currentPowerUpIds = new Set(powerUps.filter((p) => !p.collected).map((p) => p.id));
    for (const [id, mesh] of this.powerUpMeshes) {
      if (!currentPowerUpIds.has(id)) {
        this.scene.remove(mesh);
        this.powerUpMeshes.delete(id);
      }
    }

    for (const p of powerUps) {
      if (p.collected || p.z < -0.05 || p.z > 1.05) continue;
      let mesh = this.powerUpMeshes.get(p.id);
      if (!mesh) {
        mesh = this.createPowerUpMesh(p.type);
        this.scene.add(mesh);
        this.powerUpMeshes.set(p.id, mesh);
      }

      const worldZ = THREE.MathUtils.lerp(HORIZON_WORLD_Z, PLAYER_WORLD_Z, Math.min(p.z, 1));
      const worldX = LANE_X_POSITIONS[p.lane];
      const bobY = Math.sin(elapsedTime * 5 + p.id) * 0.3;
      mesh.position.set(worldX, 1.8 + bobY, worldZ);
    }

    // Render WebGL Frame
    this.renderer.render(this.scene, this.camera);
  }

  private animate = () => {
    try {
      this.updateAndRender();
      if (this.consecutiveRenderErrors > 0) {
        // Recovered — clear whatever error banner a prior bad frame reported.
        this.consecutiveRenderErrors = 0;
        this.lastReportedRenderError = null;
        this.onRenderIssue?.(null);
      }
    } catch (err) {
      console.error('updateAndRender threw:', err);
      this.consecutiveRenderErrors++;
      // A handful of consecutive throws (not one, which could be a one-off
      // transient) means the frame loop is never reaching render() —
      // that's exactly what a silent, permanently blank canvas looks like.
      // Surface it visibly (not just to DevTools a non-technical player
      // will never open) with the actual error, so it's diagnosable from a
      // screenshot instead of guessed at again.
      if (this.consecutiveRenderErrors >= 5) {
        const message = err instanceof Error ? err.message : String(err);
        if (message !== this.lastReportedRenderError) {
          this.lastReportedRenderError = message;
          this.onRenderIssue?.(`3D view crashed: ${message}`);
        }
      }
    }
    this.animFrameId = requestAnimationFrame(this.animate);
  };

  // Clamp the render target to a portrait-ish aspect ratio so a wide desktop
  // browser window doesn't balloon the horizontal FOV into a wide-angle lens.
  // Excess space is left to the container to letterbox/pillarbox around the
  // centered canvas (see centerCanvas).
  private computeRenderSize(): { width: number; height: number } {
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const aspect = cw / ch;
    if (aspect > MAX_RENDER_ASPECT) {
      return { width: ch * MAX_RENDER_ASPECT, height: ch };
    }
    if (aspect < MIN_RENDER_ASPECT) {
      return { width: cw, height: cw / MIN_RENDER_ASPECT };
    }
    return { width: cw, height: ch };
  }

  private centerCanvas() {
    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = 'translate(-50%, -50%)';
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const { width, height } = this.computeRenderSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.centerCanvas();
    this.reportSize(width, height);
  };

  private reportSize(renderWidth: number, renderHeight: number) {
    this.onSizeReport?.(
      `container ${this.container.clientWidth}x${this.container.clientHeight} → ` +
        `canvas ${renderWidth.toFixed(0)}x${renderHeight.toFixed(0)} dpr=${window.devicePixelRatio}`,
    );
  }

  public destroy() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    if (this.contextLostTimeoutId !== null) window.clearTimeout(this.contextLostTimeoutId);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
