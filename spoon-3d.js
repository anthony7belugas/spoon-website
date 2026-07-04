/* ============================================================
   Spoon USC — hero 3D spoon (Week 2)
   A dimensional version of the actual logo spoon, floating on
   the red hero. Reacts to pointer + scroll. Falls back to the
   static SVG spoon if WebGL is unavailable or motion is reduced.
   ============================================================ */
import * as THREE from 'three';

const stage = document.getElementById('spoonStage');
if (stage) init(stage);

function init(stage) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- renderer (transparent so the red hero shows through) ---
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // no WebGL -> keep the SVG fallback already in the DOM
  }
  if (!renderer) return;

  // WebGL is good: hide the flat SVG fallback and mount the canvas
  const fallback = stage.querySelector('.hero-spoon');
  if (fallback) fallback.style.display = 'none';

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;      // nudge up if you ever want the spoon brighter
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 7.6);

  // --- lighting: warm key + honey rim on the deep red ---
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4a0a0a, 1.2));
  const key  = new THREE.DirectionalLight(0xfff1dd, 2.6); key.position.set(3, 4.5, 5);   scene.add(key);
  const rim  = new THREE.DirectionalLight(0xffcf85, 2.4); rim.position.set(-4.5, 2, -3.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-2.5, -1.5, 3); scene.add(fill);

  // --- the spoon (ivory ceramic) ---
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf5ecdd, metalness: 0.0, roughness: 0.34,
    clearcoat: 0.7, clearcoatRoughness: 0.28
  });
  const mesh = new THREE.Mesh(buildSpoon(), material);
  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  const BASE_RY = 0.30, BASE_RX = -0.12; // resting tilt so it never looks perfectly flat

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(stage);

  // --- interaction targets ---
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
    group.rotation.y = BASE_RY + Math.sin(time * 0.32) * 0.28 + curX * 0.5;
    group.rotation.x = BASE_RX + Math.sin(time * 0.24) * 0.10 + curY * 0.35;
    group.position.y = Math.sin(time * 0.6) * 0.10 - scrollF * 0.4;   // float + drift up as you scroll
    group.scale.setScalar(1 - scrollF * 0.12);
    renderer.render(scene, camera);
  }

  // paint one static, tilted frame immediately (also the reduced-motion end state)
  group.rotation.set(BASE_RX, BASE_RY, 0);
  renderer.render(scene, camera);
  if (reduceMotion) return;

  // --- animation loop, paused when off-screen or tab hidden ---
  let raf = 0, running = false;
  const loop = (t) => { if (!running) return; drawFrame(t); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop  = () => { running = false; if (raf) cancelAnimationFrame(raf); };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: 0.01 }).observe(stage);
  start();
}

/* Build the logo spoon as 3D geometry: an elliptical bowl + a
   tapered handle, extruded with soft beveled edges. Proportions
   match spoon-logo.svg (bowl rx/ry 12.5/16.5, handle to y~80). */
function buildSpoon() {
  const bowl = new THREE.Shape();
  bowl.absellipse(0, 0.0, 0.76, 1.0, 0, Math.PI * 2, false);

  const handle = new THREE.Shape();
  const topY = -0.90, tipY = -2.78, halfTop = 0.255, halfTip = 0.10, round = 0.13;
  handle.moveTo(-halfTop, topY);
  handle.lineTo(-halfTip, tipY + round);
  handle.quadraticCurveTo(-halfTip, tipY, 0, tipY);        // rounded tip
  handle.quadraticCurveTo(halfTip, tipY, halfTip, tipY + round);
  handle.lineTo(halfTop, topY);
  handle.quadraticCurveTo(0, topY - 0.10, -halfTop, topY); // blends up under the bowl (hidden in overlap)

  const geometry = new THREE.ExtrudeGeometry([bowl, handle], {
    depth: 0.34, bevelEnabled: true, bevelThickness: 0.10,
    bevelSize: 0.09, bevelSegments: 5, curveSegments: 72
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}
