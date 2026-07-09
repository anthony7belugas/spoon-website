/* ============================================================
   Spoon USC — hero 3D spoon (v7: choreographed entrance)
   On load the spoon fades in from below with a sweeping turn and a
   soft settle, timed with the hero copy staggering in (CSS in
   index.html). Scrolling away tips it forward as it drifts off.
   One continuous lofted surface: a slim handle with a rounded,
   blunt tip flowing into a rounded, scooped oval bowl. Warm
   ivory ceramic, soft studio lighting. Rests facing forward and
   tracks the cursor responsively. Falls back to the static SVG
   spoon if WebGL is unavailable or motion is reduced.
   ------------------------------------------------------------
   Easy knobs: SPOON_COLOR / METALNESS / ROUGHNESS below, and
   toneMappingExposure a few lines down (higher = brighter).
   Motion knobs: TRACK (responsiveness), MOUSE_TURN (throw).
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

const SPOON_COLOR = 0xf3e9d8;  // warm ivory. try 0xe9d6ac + METALNESS 1 for champagne metal
const METALNESS   = 0.0;       // 0 = ceramic, 1 = metal
const ROUGHNESS   = 0.30;      // lower = glossier

/* ---- motion ---- */
const TRACK = 0.12;            // cursor catch-up speed (higher = snappier)
const MOUSE_TURN = 1.0;        // how far it turns toward the cursor (radians across half-screen)
const IDLE_TURN = 0.07;        // gentle idle sway amplitude

/* ---- entrance ---- */
const INTRO_MS   = 1500;       // entrance length (ms). 0 = no entrance
const INTRO_TURN = 1.15;       // how far it sweeps around while arriving (radians)
const INTRO_RISE = 1.5;        // how far below rest it starts (world units)

/* ---- scroll exit ---- */
const SCROLL_TIP = 0.5;        // forward tip as you scroll away (radians at full scroll)

/* ---- spoon shape params ---- */
const Y_TIP = -2.15, Y_TOP = 1.9;    // handle tip (bottom) -> bowl top
const T_HANDLE = 0.075;              // handle half-thickness (thin, flat)
const SCOOP = 0.32, UNDER = 0.48;    // bowl scoop depth / underside bulge
const BEND  = 0.30;                  // gentle lengthwise curve (bowl tips forward)
const BOWL_VC = 0.72, BOWL_VR = 0.28, BOWL_W = 0.70; // bowl oval: center / half-length / half-width
const HANDLE_W = 0.15;               // handle half-width (fuller = less spindly)

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const stage = document.getElementById('spoonStage');
if (stage) init(stage);

function init(stage) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  } catch (e) {
    return; // no WebGL -> keep the SVG fallback already in the DOM
  }
  if (!renderer) return;

  const fallback = stage.querySelector('.hero-spoon');
  if (fallback) fallback.style.display = 'none';

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  // soft studio reflections (procedural, no image files)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmrem.dispose();

  // shaped light on top of the IBL: warm key + honey rim
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4a0a0a, 0.35));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.7); key.position.set(3, 4.5, 5);   scene.add(key);
  const rim = new THREE.DirectionalLight(0xffcf85, 1.6); rim.position.set(-4.5, 2, -3.5); scene.add(rim);

  const material = new THREE.MeshPhysicalMaterial({
    color: SPOON_COLOR, metalness: METALNESS, roughness: ROUGHNESS,
    clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 0.85,
    side: THREE.DoubleSide   // so the inside of the scoop renders too
  });

  const geo = new ParametricGeometry(spoonSurface, 110, 240);
  geo.center();
  geo.computeVertexNormals();
  const spoon = new THREE.Mesh(geo, material);

  const pivot = new THREE.Group();
  pivot.add(spoon);
  pivot.scale.setScalar(0.95);
  scene.add(pivot);

  const BASE_RY = 0.0, BASE_RX = -0.2; // faces forward (even turn) + tipped to show the scoop

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(stage);

  let ptrX = 0, ptrY = 0, curX = 0, curY = 0, scrollF = 0;
  window.addEventListener('pointermove', (e) => {
    ptrX = e.clientX / window.innerWidth - 0.5;
    ptrY = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  window.addEventListener('scroll', () => {
    scrollF = Math.min((window.scrollY || 0) / 500, 1);
  }, { passive: true });

  // entrance easing: fast arrival, tiny overshoot, soft settle
  let t0 = -1;
  const easeOutBack = (x) => { const c = 1.35; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  function drawFrame(t) {
    if (t0 < 0) t0 = t;
    curX += (ptrX - curX) * TRACK;   // snappy cursor catch-up
    curY += (ptrY - curY) * TRACK;
    const time = t * 0.001;

    // entrance: 0 -> 1 over INTRO_MS, then it's just 1 forever
    const lin  = INTRO_MS > 0 ? clamp((t - t0) / INTRO_MS, 0, 1) : 1;
    const intro = easeOutBack(lin);
    const fade  = smooth(clamp(lin * 1.6, 0, 1));           // opacity leads the motion

    // fade the whole canvas (not the material): a double-sided mesh can't
    // depth-sort against itself, so fading material.opacity would show the
    // bowl's underside through its top. Canvas opacity avoids that entirely.
    renderer.domElement.style.opacity = fade;

    // cursor is the dominant motion; idle is a subtle breathe underneath
    pivot.rotation.y = BASE_RY + (1 - intro) * INTRO_TURN
                     + curX * MOUSE_TURN + Math.sin(time * 0.28) * IDLE_TURN;
    pivot.rotation.x = BASE_RX + scrollF * SCROLL_TIP
                     + curY * (MOUSE_TURN * 0.5) + Math.sin(time * 0.22) * (IDLE_TURN * 0.6);
    pivot.position.y = -(1 - intro) * INTRO_RISE
                     + Math.sin(time * 0.55) * 0.08 - scrollF * 0.4;
    pivot.scale.setScalar(0.95 * (0.6 + 0.4 * intro) * (1 - scrollF * 0.12));
    renderer.render(scene, camera);
  }

  pivot.rotation.set(BASE_RX, BASE_RY, 0);
  if (reduceMotion) { renderer.render(scene, camera); return; }  // static spoon, no entrance

  renderer.domElement.style.opacity = '0';  // start invisible; the loop fades it in

  let raf = 0, running = false, inView = true;
  const loop = (t) => { if (!running) return; drawFrame(t); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop  = () => { running = false; if (raf) cancelAnimationFrame(raf); };

  // only render when the hero is both visible and on-screen (saves battery)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (inView) start();
  });
  new IntersectionObserver(([en]) => {
    inView = en.isIntersecting;
    if (inView && !document.hidden) start(); else stop();
  }, { threshold: 0.01 }).observe(stage);
  start();
}

/* ---- the spoon as one continuous surface --------------------
   v (0..1): tip -> bowl-top along the length.
   u (0..1): around the cross-section — front (scoop) for u<=0.5,
   back (underside) for u>0.5.                                    */
function spoonSurface(u, v, target) {
  const hw = halfWidth(v);
  const b  = shapeB(v);                 // 0 = thin handle lens, 1 = scooped bowl shell
  const te = thickEnv(v);               // closes thickness at both ends
  const yy = lerp(Y_TIP, Y_TOP, v);
  const bz = BEND * smooth(clamp((v - 0.4) / 0.6, 0, 1));

  let s, off;
  if (u <= 0.5) {
    s = -1 + 4 * u;
    const e = Math.sqrt(Math.max(0, 1 - s * s));
    off = (T_HANDLE * (1 - b) - SCOOP * b) * e * te;   // front: handle bulge / bowl scoop
  } else {
    s = 1 - 4 * (u - 0.5);
    const e = Math.sqrt(Math.max(0, 1 - s * s));
    off = (-T_HANDLE * (1 - b) - UNDER * b) * e * te;  // back: handle bulge / bowl underside
  }
  target.set(s * hw, yy, bz + off);
}

// outline half-width: slim handle (rounded blunt tip) OR rounded oval bowl, whichever is wider
function halfWidth(v) {
  return Math.max(handleProfile(v), bowlEllipse(v));
}
function handleProfile(v) {
  if (v > 0.56) return 0;
  const cap = 0.04;                        // rounded end-cap length (in v)
  if (v < cap) {
    const t = v / cap;                     // 0..1 over the cap
    return HANDLE_W * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));  // semicircle -> blunt rounded end
  }
  return lerp(HANDLE_W, 0.16, clamp((v - cap) / 0.5, 0, 1));          // slight flare toward the neck
}
function bowlEllipse(v) {
  const t = (v - BOWL_VC) / BOWL_VR;      // -1..1 across the bowl
  if (t <= -1 || t >= 1) return 0;
  return BOWL_W * Math.sqrt(1 - t * t);   // rounded oval -> domes over at the top
}
// handle lens (0) vs bowl shell (1); stays 1 through the bowl so the top is a rounded bowl dome
function shapeB(v) {
  return smooth(clamp((v - 0.44) / 0.12, 0, 1));
}
// ease thickness to zero at both ends (rounded caps), full in the middle
function thickEnv(v) {
  return Math.sqrt(clamp(v / 0.05, 0, 1)) * Math.sqrt(clamp((1 - v) / 0.09, 0, 1));
}
