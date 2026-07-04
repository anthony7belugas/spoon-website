/* ============================================================
   Spoon USC — hero 3D spoon (v2, refined)
   A real spoon: an elongated, scooped bowl + a slim tapered
   handle, in warm ivory ceramic under soft studio lighting
   (image-based reflections). Reacts to pointer + scroll.
   Falls back to the static SVG spoon if WebGL is unavailable
   or motion is reduced.
   ------------------------------------------------------------
   Easy knobs: SPOON_COLOR / METALNESS / ROUGHNESS below, and
   toneMappingExposure a few lines down (higher = brighter).
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SPOON_COLOR = 0xf3e9d8;  // warm ivory. try 0xe9d6ac + METALNESS 1 for champagne metal
const METALNESS   = 0.0;       // 0 = ceramic, 1 = metal
const ROUGHNESS   = 0.28;      // lower = glossier

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

  // --- soft studio reflections (procedural, no image files) ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmrem.dispose();

  // --- shaped light on top of the IBL: warm key + honey rim ---
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4a0a0a, 0.35));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.7); key.position.set(3, 4.5, 5);   scene.add(key);
  const rim = new THREE.DirectionalLight(0xffcf85, 1.6); rim.position.set(-4.5, 2, -3.5); scene.add(rim);

  // --- material + spoon ---
  const material = new THREE.MeshPhysicalMaterial({
    color: SPOON_COLOR, metalness: METALNESS, roughness: ROUGHNESS,
    clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 0.85,
    side: THREE.DoubleSide   // so the inside of the scoop renders too
  });

  const spoon = buildSpoon(material);
  spoon.scale.setScalar(0.9);
  const pivot = new THREE.Group();
  pivot.add(spoon);
  scene.add(pivot);

  const BASE_RY = 0.35, BASE_RX = -0.18; // resting pose: turned + tipped to show the scoop

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
    pivot.rotation.y = BASE_RY + Math.sin(time * 0.32) * 0.32 + curX * 0.5;
    pivot.rotation.x = BASE_RX + Math.sin(time * 0.24) * 0.09 + curY * 0.32;
    pivot.position.y = Math.sin(time * 0.6) * 0.10 - scrollF * 0.4;
    pivot.scale.setScalar(0.9 * (1 - scrollF * 0.12));
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

/* ---- geometry ------------------------------------------------ */

function buildSpoon(material) {
  const spoon = new THREE.Group();

  const bowl = new THREE.Mesh(makeBowl(), material);
  bowl.position.y = 0.9;
  spoon.add(bowl);

  const handle = new THREE.Mesh(makeHandle(), material);
  spoon.add(handle);

  // recenter the whole thing so it rotates about its middle
  const box = new THREE.Box3().setFromObject(spoon);
  const c = new THREE.Vector3(); box.getCenter(c);
  bowl.position.sub(c);
  handle.position.sub(c);
  return spoon;
}

// Elongated, scooped bowl. A lathe profile (outer underside -> rim ->
// inner scoop) gives a real concave bowl; then we squash it to an oval.
function makeBowl() {
  const V = THREE.Vector2;
  const profile = [
    new V(0.00, 0.00),  // underside center (back of bowl)
    new V(0.30, 0.02),
    new V(0.58, 0.09),
    new V(0.80, 0.22),
    new V(0.94, 0.40),
    new V(1.00, 0.52),  // rim outer
    new V(1.00, 0.55),  // rim lip
    new V(0.90, 0.52),  // rim inner
    new V(0.72, 0.44),
    new V(0.48, 0.34),
    new V(0.24, 0.28),
    new V(0.00, 0.26),  // scoop center (front, faces viewer)
  ];
  const geo = new THREE.LatheGeometry(profile, 96);
  geo.scale(0.85, 0.85, 1.15);   // width, scoop depth, length
  geo.rotateX(Math.PI / 2);      // scoop opens toward camera (+Z); length -> vertical
  geo.computeVertexNormals();
  return geo;
}

// Slim, gently tapered handle with a rounded tip, softly beveled.
function makeHandle() {
  const w0 = 0.26, w1 = 0.12, top = 0.15, tip = -2.55, r = 0.12;
  const s = new THREE.Shape();
  s.moveTo(-w0, top);
  s.lineTo(-w1, tip + r);
  s.quadraticCurveTo(-w1, tip, 0, tip);   // rounded tip
  s.quadraticCurveTo(w1, tip, w1, tip + r);
  s.lineTo(w0, top);
  s.quadraticCurveTo(0, top + 0.10, -w0, top); // blends up under the bowl (hidden in overlap)

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.08,
    bevelSize: 0.07, bevelSegments: 4, curveSegments: 24
  });
  geo.translate(0, 0, -0.15);   // roughly center the handle's front-back depth
  geo.computeVertexNormals();
  return geo;
}
