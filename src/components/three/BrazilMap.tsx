import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import geo from "../../data/brazil-geo.json";
import { markerWeight } from "../../lib/map-projection";
import { unitCountLabel } from "../../lib/network-units";
import type { NetworkMapCity } from "../../types";
import { useTheme } from "../../theme";

// O dataset estático segue sendo a base do desenho do território — contorno e
// nuvem de pontos, em coordenadas de cena. As cidades não vêm mais daqui: elas
// chegam por prop, já projetadas a partir da latitude/longitude que o backend
// resolveu (ver `lib/map-projection.ts`).
const dots = geo.dots as Array<[number, number]>;
const outline = geo.outline as Array<[number, number]>;

// Nuvem de pontos do território — instanciada para render leve.
function DotMatrix({ dark }: { dark: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => dots.map(([x, y]) => new THREE.Vector3(x, y, 0)), []);
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => { m.makeTranslation(p.x, p.y, 0); ref.current!.setMatrixAt(i, m); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    positions.forEach((p, i) => {
      const wave = Math.sin(t * 0.9 + p.x * 0.9 + p.y * 0.6) * 0.5 + 0.5;
      const z = wave * 0.12;
      s.setScalar(0.75 + wave * 0.45);
      m.compose(new THREE.Vector3(p.x, p.y, z), new THREE.Quaternion(), s);
      ref.current!.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]}>
      <circleGeometry args={[0.075, 10]} />
      <meshBasicMaterial color={dark ? "#52667a" : "#b9c5d0"} transparent opacity={0.95} />
    </instancedMesh>
  );
}

function Outline({ dark }: { dark: boolean }) {
  const geometry = useMemo(() => {
    const pts = outline.map(([x, y]) => new THREE.Vector3(x, y, 0.02));
    pts.push(pts[0].clone());
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return <lineLoop geometry={geometry}><lineBasicMaterial color={dark ? "#7d93a8" : "#8a9aa8"} transparent opacity={0.7} /></lineLoop>;
}

const GOLD = "#e9ad3f";
const RED = "#d8443a";

function Marker({ city, index, weight, hovered, setHovered }: {
  city: NetworkMapCity;
  index: number;
  weight: number;
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  // Dourado só para a sede; todo o resto da rede é vermelho. A sede fica no
  // mesmo ponto geográfico das suas unidades — não é um marcador extra nem
  // soma +1 na contagem.
  const color = city.isHeadquarters ? GOLD : RED;
  const size = 0.1 + weight * 0.2;
  const height = 0.16 + weight * 1.15;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + index * 0.37;
    if (ringRef.current) {
      const s = 1 + ((t * 0.9) % 1.6);
      ringRef.current.scale.setScalar(s);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - (s - 1) * 0.32);
    }
    if (ref.current) ref.current.position.z = 0.02 + Math.sin(t * 1.6) * 0.02;
  });
  const active = hovered === city.key;
  return (
    <group ref={ref} position={[city.x, city.y, 0.02]}>
      <mesh position={[0, 0, height / 2]} onPointerOver={(e) => { e.stopPropagation(); setHovered(city.key); }} onPointerOut={() => setHovered(null)}>
        <cylinderGeometry args={[size * 0.5, size * 0.7, height, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.4 : 0.7} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, height + 0.02]}>
        <sphereGeometry args={[size * 0.55, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2 : 1.1} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0, 0.01]}>
        <ringGeometry args={[size * 0.8, size * 1.05, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Halo fixo: a sede se distingue pela forma, não só pela cor dourada. */}
      {city.isHeadquarters && (
        <mesh position={[0, 0, 0.012]}>
          <ringGeometry args={[size * 1.5, size * 1.75, 48]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
      {active && (
        <Html position={[0, 0, height + 0.5]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div className="map-tip">
            <strong>{city.city} · {city.state}</strong>
            {city.isHeadquarters && <em>Sede</em>}
            <span>{unitCountLabel(city.unitCount)}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Rig() {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(-1.2, -0.3, 0));
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouse.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }; };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const aspect = size.width / Math.max(1, size.height);
    const dist = aspect < 1.2 ? 22 : aspect < 1.8 ? 19 : 17;
    const cx = aspect < 1.5 ? 2.2 : -1.2;
    target.current.set(cx, -0.3, 0);
    const x = Math.sin(t * 0.08) * 1.4 + mouse.current.x * 0.7 + cx;
    const y = -dist * 0.5 - mouse.current.y * 0.5 - 0.3;
    const z = dist * 0.86 + Math.cos(t * 0.08) * 0.4;
    camera.position.lerp(new THREE.Vector3(x, y, z), 0.04);
    camera.lookAt(target.current);
  });
  return null;
}

export function BrazilMap({ cities }: { cities: NetworkMapCity[] }) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [hovered, setHovered] = useState<string | null>(null);
  // A maior cidade da rede define a escala das outras: o tamanho é relativo ao
  // conjunto recebido, não a um número fixo.
  const maxUnits = useMemo(() => cities.reduce((max, city) => Math.max(max, city.unitCount), 0), [cities]);
  return (
    <div className="hero-canvas" aria-hidden>
      <Canvas dpr={[1, 1.75]} camera={{ position: [2.4, -8, 13], fov: 38, near: 0.1, far: 100 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Suspense fallback={null}>
          <ambientLight intensity={dark ? 0.9 : 1.4} />
          <directionalLight position={[6, 4, 12]} intensity={dark ? 1.6 : 1.1} color="#fff2d6" />
          <pointLight position={[-8, -6, 8]} intensity={dark ? 24 : 8} color={RED} distance={40} />
          <pointLight position={[8, 6, 6]} intensity={dark ? 22 : 8} color={GOLD} distance={40} />
          <group rotation={[0.22, 0, 0]} position={[2.2, 0.2, 0]}>
            <DotMatrix dark={dark} />
            <Outline dark={dark} />
            {cities.map((city, i) => (
              <Marker
                key={city.key}
                city={city}
                index={i}
                weight={markerWeight(city.unitCount, maxUnits)}
                hovered={hovered}
                setHovered={setHovered}
              />
            ))}
          </group>
          <Rig />
        </Suspense>
      </Canvas>
    </div>
  );
}
