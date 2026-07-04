/* ============================================================
   Spoon USC — hero 3D spoon (v3, single seamless surface)
   The spoon is ONE continuous lofted surface (bowl flows into
   the handle, no seam), with a real scooped bowl, in warm ivory
   ceramic under soft studio lighting. Rests facing forward and
   turns evenly toward the cursor. Falls back to the static SVG
   spoon if WebGL is unavailable or motion is reduced.
   ------------------------------------------------------------
   Easy knobs: SPOON_COLOR / METALNESS / ROUGHNESS below, and
   toneMappingExposure a few lines down (higher = brighter).
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

const SPOON_COLOR = 0xf3e9d8;  // warm ivory. try 0xe9d6ac + METALNESS 1 for champagne metal
const METALNESS   = 0.0;       // 0 = ceramic, 1 = metal
const ROUGHNESS   = 0.30;      // lower = glossier

/* ---- spoon shape params ---- */
const Y_TIP = -2.35, Y_TOP = 1.85;   // handle tip (bottom) -> bowl top
const NECK  = 0.5;                    // where handle meets bowl (0..1 along length)
const T_HANDLE = 0.075;              // handle half-thickness (thin, flat)
const SCOOP = 0.30, UNDER = 0.46;    // bowl scoop depth / underside bulge
const BEND  = 0.30;                  // gentle lengthwise curve (bowl tips forward)

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const stage = document.getElementById('spoonStage');
if (stage) init(stage);

function init(stage) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
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

  const geo = new ParametricGeometry(spoonSurface, 100, 220);
  geo.center();
  geo.computeVertexNormals();
  const spoon = new THREE.Mesh(geo, material);

  const pivot = new THREE.Group();
  pivot.add(spoon);
  pivot.scale.setScalar(0.95);
  scene.add(pivot);

  const BASE_RY = 0.0, BASE_RX = -0.14; // faces forward -> turns evenly both ways

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

  function drawFrame(t) {
    curX += (ptrX - curX) * 0.05;
    curY += (ptrY - curY) * 0.05;
    const time = t * 0.001;
    pivot.rotation.y = BASE_RY + Math.sin(time * 0.3) * 0.30 + curX * 0.7;
    pivot.rotation.x = BASE_RX + Math.sin(time * 0.23) * 0.08 + curY * 0.3;
    pivot.position.y = Math.sin(time * 0.6) * 0.10 - scrollF * 0.4;
    pivot.scale.setScalar(0.95 * (1 - scrollF * 0.12));
    renderer.render(scene, camera);
  }

  // one static frame first (also the reduced-motion end state)
  pivot.rotation.set(BASE_RX, BASE_RY, 0);
  renderer.render(scene, camera);
  if (reduceMotion) return;

  let raf = 0, running = false;
  const loop = (t) => { if (!running) return; drawFrame(t); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop  = () => { running = false; if (raf) cancelAnimationFrame(raf); };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: 0.01 }).observe(stage);
  start();
}

/* ---- the spoon as one continuous surface --------------------
   v (0..1) runs tip -> bowl-top along the length.
   u (0..1) runs around the cross-section: front (scoop) surface
   for u in [0,0.5], back (underside) for [0.5,1]. Handle stations
   are a thin flat lens; bowl stations are a scooped shell. Both
   ends pinch to a rounded point so the surface is closed.        */
function spoonSurface(u, v, target) {
  const cap = endCap(v);
  const hw  = halfWidth(v) * cap;      // half-width across the spoon
  const b   = bowlFactor(v);           // 0 in handle, 1 in bowl
  const yy  = lerp(Y_TIP, Y_TOP, v);
  const bend = BEND * smooth(clamp((v - 0.4) / 0.6, 0, 1));

  let s, off;
  if (u <= 0.5) {
    s = -1 + 4 * u;                                  // -1 -> +1 across the front
    const e = Math.sqrt(Math.max(0, 1 - s * s));
    off = (T_HANDLE * (1 - b) - SCOOP * b) * e * cap; // front: handle bulge / bowl scoop
  } else {
    s = 1 - 4 * (u - 0.5);                            // +1 -> -1 across the back
    const e = Math.sqrt(Math.max(0, 1 - s * s));
    off = (-T_HANDLE * (1 - b) - UNDER * b) * e * cap; // back: handle bulge / bowl underside
  }
  target.set(s * hw, yy, bend + off);
}

function halfWidth(v) {
  if (v < NECK) {
    return lerp(0.05, 0.17, smooth(v / NECK));        // handle: rounded tip -> neck
  }
  const tb = (v - NECK) / (1 - NECK);                 // 0..1 across the bowl
  const base = lerp(0.17, 0.045, smooth(tb));
  const bulge = Math.pow(Math.sin(Math.PI * tb), 1.2) * 0.50; // oval bowl lobe
  return base + bulge;
}

function bowlFactor(v) {
  const ramp = smooth(clamp((v - 0.46) / 0.12, 0, 1));   // handle -> bowl
  const tb = clamp((v - NECK) / (1 - NECK), 0, 1);
  const tipTaper = smooth(clamp((1 - tb) / 0.15, 0, 1)); // ease bowl closed at its tip
  return ramp * tipTaper;
}

// pinch both ends to a rounded point so the surface closes (no open tube ends)
function endCap(v) {
  return smooth(clamp(v / 0.04, 0, 1)) * smooth(clamp((1 - v) / 0.04, 0, 1));
}
