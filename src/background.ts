import * as THREE from 'three';

const GREEN = 0x3ddc84;
const GOLD = 0xffb547;
const POINT_COUNT = 720;

export type StopBackground = () => void;

/**
 * A slow field of drifting, additive-blended data points in the brand greens and golds.
 * Deliberately cheap: one buffer geometry, one draw call, no per-frame allocation.
 * Falls back to the CSS gradient when WebGL is unavailable.
 */
export function mountBackground(canvas: HTMLCanvasElement): StopBackground {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'low-power'
    });
  } catch (error) {
    return () => {};
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 0, 16);

  const positions = new Float32Array(POINT_COUNT * 3);
  const colors = new Float32Array(POINT_COUNT * 3);
  const green = new THREE.Color(GREEN);
  const gold = new THREE.Color(GOLD);
  const mix = new THREE.Color();

  for (let i = 0; i < POINT_COUNT; i += 1) {
    const i3 = i * 3;
    const radius = 6 + Math.random() * 16;
    const angle = Math.random() * Math.PI * 2;

    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = (Math.random() - 0.5) * 22;
    positions[i3 + 2] = Math.sin(angle) * radius * 0.6;

    mix.copy(green).lerp(gold, Math.random() * 0.85);
    colors[i3] = mix.r;
    colors[i3 + 1] = mix.g;
    colors[i3 + 2] = mix.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.16,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth || 1;
    const height = canvas.clientHeight || window.innerHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  function onPointerMove(event: PointerEvent): void {
    targetX = ((event.clientX / Math.max(window.innerWidth, 1)) - 0.5) * 1.6;
    targetY = ((event.clientY / Math.max(window.innerHeight, 1)) - 0.5) * 1.2;
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  let frame = 0;
  let elapsed = 0;
  let last = performance.now();

  function draw(now: number): void {
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += delta;

    pointerX += (targetX - pointerX) * 0.045;
    pointerY += (targetY - pointerY) * 0.045;

    points.rotation.y += delta * 0.035;
    points.rotation.x = Math.sin(elapsed * 0.08) * 0.12;
    camera.position.x = pointerX;
    camera.position.y = -pointerY;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  }

  function onVisibility(): void {
    if (reduceMotion) return;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }

  if (reduceMotion) {
    renderer.render(scene, camera);
  } else {
    frame = requestAnimationFrame(draw);
  }
  document.addEventListener('visibilitychange', onVisibility);

  return function stop(): void {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibility);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}

export function startBackground(): StopBackground {
  const canvas = document.getElementById('bg-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return () => {};
  return mountBackground(canvas);
}
