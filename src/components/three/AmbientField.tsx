import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "../../theme";

// Pano de fundo 3D que vive uma vez em todo o app (montado no Shell, fora das telas que
// trocam) — continua girando devagar enquanto o usuário navega entre visões, e a câmera
// segue o mouse em paralaxe sutil. É a camada "persiste durante o uso do sistema".
const COUNT = 26;
const PALETTE_DARK = ["#d8443a", "#e9ad3f", "#5ab4ff", "#9b7bff", "#3ccd8f"];
const PALETTE_LIGHT = ["#b3301f", "#c88a19", "#1f7fd6", "#6a4de0", "#1f9e6a"];

function seedShapes() {
  let seed = 91827;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  return Array.from({ length: COUNT }, (_, i) => ({
    pos: new THREE.Vector3((rand() - 0.5) * 34, (rand() - 0.5) * 20, -6 - rand() * 20),
    scale: 0.5 + rand() * 1.1,
    speed: 0.06 + rand() * 0.1,
    phase: rand() * Math.PI * 2,
    axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    colorIndex: i % PALETTE_DARK.length,
    kind: rand() > 0.35 ? "tetra" : "point",
  }));
}
const shapes = seedShapes();

function Field({ dark }: { dark: boolean }) {
  const group = useRef<THREE.Group>(null);
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const s = shapes[i];
      if (!s) return;
      child.position.y = s.pos.y + Math.sin(t * s.speed + s.phase) * 1.4;
      child.position.x = s.pos.x + Math.cos(t * s.speed * 0.7 + s.phase) * 0.9;
      child.rotation.x += 0.0012 + s.speed * 0.002;
      child.rotation.y += 0.0018 + s.speed * 0.0016;
    });
  });
  return (
    <group ref={group}>
      {shapes.map((s, i) => (
        <mesh key={i} position={s.pos} scale={s.kind === "point" ? s.scale * 0.34 : s.scale}>
          {s.kind === "point" ? <sphereGeometry args={[1, 8, 8]} /> : <tetrahedronGeometry args={[1, 0]} />}
          <meshStandardMaterial color={palette[s.colorIndex]} emissive={palette[s.colorIndex]} emissiveIntensity={dark ? 0.55 : 0.18} roughness={0.45} metalness={0.2} transparent opacity={dark ? 0.5 : 0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Rig() {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouse.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }; };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const x = mouse.current.x * 1.6 + Math.sin(t * 0.04) * 0.6;
    const y = -mouse.current.y * 1.1 + Math.cos(t * 0.035) * 0.4;
    camera.position.lerp(new THREE.Vector3(x, y, 14), 0.02);
    camera.lookAt(0, 0, -8);
  });
  return null;
}

export function AmbientField() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  if (reduced) return null;
  return (
    <div className="ambient-3d" aria-hidden>
      <Canvas dpr={[1, 1.4]} camera={{ position: [0, 0, 14], fov: 42, near: 1, far: 60 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}>
        <Suspense fallback={null}>
          <ambientLight intensity={dark ? 0.7 : 1.2} />
          <directionalLight position={[6, 8, 10]} intensity={dark ? 0.9 : 0.7} color="#fff2d6" />
          <Field dark={dark} />
          <Rig />
        </Suspense>
      </Canvas>
    </div>
  );
}
