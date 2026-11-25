import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Clone, Line, useGLTF, useProgress } from '@react-three/drei';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import * as THREE from 'three';

const ASSET_ROOT = '/landing/models/';
const assets = {
  scooter: `${ASSET_ROOT}delivery-scooter-lod2.glb`,
  shops: `${ASSET_ROOT}shopping-street-light.glb`,
  restaurant: `${ASSET_ROOT}pizzeria-light.glb`,
  residence: `${ASSET_ROOT}brownstone-house.glb`,
  road: `${ASSET_ROOT}road-segment.glb`,
  streetLight: `${ASSET_ROOT}street-light.glb`,
  package: `${ASSET_ROOT}cardboard-box-stack.glb`,
};

const ORANGE = '#e7652c';
const CHALK = '#f3eee3';
const routePoints = [
  new THREE.Vector3(-0.4, 0.42, -16.4),
  new THREE.Vector3(-0.9, 0.42, -9),
  new THREE.Vector3(-0.4, 0.42, -1.5),
  new THREE.Vector3(-0.8, 0.42, 6.5),
  new THREE.Vector3(0.2, 0.42, 15.2),
];
const cameraFrames = [
  { at: 0, position: [12.5, 11.5, -34], target: [0, 1.2, -14] },
  { at: 0.14, position: [-3.5, 5.6, -22], target: [4.8, 1.3, -15.4] },
  { at: 0.26, position: [-2.8, 4.4, -19.6], target: [4.2, 1.2, -15.4] },
  { at: 0.38, position: [1.5, 17.5, -11], target: [0, 0.3, -1] },
  { at: 0.5, position: [8.2, 9.4, -6.5], target: [-0.4, 0.3, 1] },
  { at: 0.63, position: [5.1, 4.9, -4], target: [-0.6, 1, 4.5] },
  { at: 0.78, position: [-3.8, 4.2, 8.5], target: [-0.3, 1, 13] },
  { at: 0.9, position: [-5.8, 3.6, 13.5], target: [5, 1.3, 16] },
  { at: 1, position: [-8.5, 8.6, 17], target: [4.8, 1, 15.5] },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);
const range = (value, start, end) => smooth(clamp((value - start) / (end - start)));

function sampleFrames(progress, property, output) {
  let upperIndex = 1;
  while (upperIndex < cameraFrames.length - 1 && progress > cameraFrames[upperIndex].at) upperIndex += 1;
  const lower = cameraFrames[upperIndex - 1];
  const upper = cameraFrames[upperIndex];
  const amount = smooth(clamp((progress - lower.at) / (upper.at - lower.at)));
  const from = lower[property];
  const to = upper[property];
  return output.set(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  );
}

function InvalidationBridge({ onReady }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => onReady(invalidate), [invalidate, onReady]);
  return null;
}

function SceneReady({ onReady }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    onReady();
  }, [invalidate, onReady]);
  return null;
}

class SceneErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SharedModel({ url, ...props }) {
  const { scene } = useGLTF(url);
  return <Clone object={scene} deep={false} {...props} />;
}

function DeliveryScooter({ scooterRef }) {
  const gl = useThree((state) => state.gl);
  const ktx2Loader = useMemo(() => new KTX2Loader().setTranscoderPath('/landing/basis/').detectSupport(gl), [gl]);
  const { scene } = useGLTF(assets.scooter, true, true, (loader) => loader.setKTX2Loader(ktx2Loader));
  useEffect(() => () => ktx2Loader.dispose(), [ktx2Loader]);
  return (
    <group ref={scooterRef} scale={1.1}>
      <Clone object={scene} deep={false} />
    </group>
  );
}

function RoadMarkings() {
  const dashes = useMemo(() => Array.from({ length: 18 }, (_, index) => -28 + index * 3.3), []);
  const crossings = useMemo(() => [-15.4, 16.2].flatMap((z) => [-2.6, -1.7, -0.8, 0.1, 1, 1.9].map((x) => [x, z])), []);
  return (
    <group>
      {dashes.map((z) => (
        <mesh key={`dash-${z}`} position={[0, 0.206, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 1.5]} />
          <meshBasicMaterial color={CHALK} transparent opacity={0.48} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
      {crossings.map(([x, z]) => (
        <mesh key={`cross-${x}-${z}`} position={[x, 0.208, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.45, 1.8]} />
          <meshBasicMaterial color={CHALK} transparent opacity={0.58} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
    </group>
  );
}

function Neighborhood() {
  const roadTiles = useMemo(
    () => [-29.5, -17.7, -5.9, 5.9, 17.7, 29.5].map((z) => ({ position: [0, 0, z] })),
    [],
  );
  const lights = useMemo(
    () => [
      [-5.9, 0.18, -16, Math.PI],
      [5.9, 0.18, -7, 0],
      [-5.9, 0.18, 5, Math.PI],
      [5.9, 0.18, 16, 0],
    ],
    [],
  );

  return (
    <group>
      <mesh position={[0, -0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[82, 96]} />
        <meshStandardMaterial color="#858f88" roughness={1} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 72]} />
        <meshStandardMaterial color="#3b423f" roughness={1} />
      </mesh>
      {[-6.2, 6.2].map((x) => (
        <mesh key={`walk-${x}`} position={[x, 0.175, 0]}>
          <boxGeometry args={[2.4, 0.35, 84]} />
          <meshStandardMaterial color="#b9bdb5" roughness={0.96} />
        </mesh>
      ))}
      {roadTiles.map((tile, index) => <SharedModel key={`road-${index}`} url={assets.road} position={tile.position} />)}
      <RoadMarkings />
      <SharedModel url={assets.restaurant} position={[11.1, 0.1, -14.4]} rotation={[0, -Math.PI / 2, 0]} scale={0.82} />
      <SharedModel url={assets.shops} position={[-12.5, 0.1, -3]} rotation={[0, Math.PI / 2, 0]} scale={0.82} />
      <SharedModel url={assets.residence} position={[11.2, 0.1, 15.8]} rotation={[0, -Math.PI / 2, 0]} scale={0.85} />
      {lights.map(([x, y, z, rotation], index) => (
        <SharedModel key={`light-${index}`} url={assets.streetLight} position={[x, y, z]} rotation={[0, rotation, 0]} scale={0.9} />
      ))}
    </group>
  );
}

function DeliveryWorld({ progressRef, onReady }) {
  const scooterRef = useRef(null);
  const shadowRef = useRef(null);
  const packageRef = useRef(null);
  const candidateOne = useRef(null);
  const candidateTwo = useRef(null);
  const selectedRoute = useRef(null);
  const pickupRing = useRef(null);
  const destinationRing = useRef(null);
  const restaurantLight = useRef(null);
  const residenceLight = useRef(null);
  const dampedProgress = useRef(0);
  const { camera, invalidate } = useThree();

  const routeCurve = useMemo(() => new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0.16), []);
  const selectedPoints = useMemo(() => routeCurve.getPoints(80), [routeCurve]);
  const candidateOnePoints = useMemo(() => routePoints.map((point, index) => point.clone().setX(index % 2 ? 2.3 : 2.7)), []);
  const candidateTwoPoints = useMemo(() => routePoints.map((point, index) => point.clone().setX(index === 2 ? -2.4 : -2.9)), []);
  const routePoint = useMemo(() => new THREE.Vector3(), []);
  const routeTangent = useMemo(() => new THREE.Vector3(), []);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const packagePosition = useMemo(() => new THREE.Vector3(), []);
  const parkedScooter = useMemo(() => new THREE.Vector3(4.1, 0.42, -15.1), []);
  const pickupStart = useMemo(() => new THREE.Vector3(5.4, 1.25, -15.2), []);
  const pickupEnd = useMemo(() => new THREE.Vector3(-0.4, 1.42, -16.2), []);
  const deliveredEnd = useMemo(() => new THREE.Vector3(5.5, 0.66, 16.3), []);
  const packageOffset = useMemo(() => new THREE.Vector3(0, 1.42, -0.15), []);

  useFrame((_, delta) => {
    const targetProgress = progressRef.current;
    const progress = THREE.MathUtils.damp(dampedProgress.current, targetProgress, 8, Math.min(delta, 0.1));
    dampedProgress.current = progress;
    if (Math.abs(targetProgress - progress) > 0.0004) invalidate();

    const depart = range(progress, 0.3, 0.48);
    const drive = range(progress, 0.48, 0.86);
    routeCurve.getPointAt(drive, routePoint);
    routeCurve.getTangentAt(Math.min(0.999, drive + 0.002), routeTangent);

    const scooter = scooterRef.current;
    scooter.position.copy(parkedScooter).lerp(routePoint, depart);
    scooter.rotation.y = depart > 0.01 ? Math.atan2(routeTangent.x, routeTangent.z) : -Math.PI / 2;
    shadowRef.current.position.set(scooter.position.x, 0.22, scooter.position.z);
    shadowRef.current.rotation.z = -scooter.rotation.y;

    const collect = range(progress, 0.18, 0.31);
    const deliver = range(progress, 0.86, 0.96);
    packageRef.current.visible = progress >= 0.16;
    if (progress < 0.48) {
      packagePosition.lerpVectors(pickupStart, pickupEnd, collect);
    } else {
      packagePosition.copy(routePoint).add(packageOffset).lerp(deliveredEnd, deliver);
    }
    packageRef.current.position.copy(packagePosition);
    packageRef.current.rotation.y = scooter.rotation.y;

    const candidatesOpacity = clamp(1 - Math.abs(progress - 0.41) / 0.1);
    candidateOne.current.material.opacity = candidatesOpacity * 0.5;
    candidateTwo.current.material.opacity = candidatesOpacity * 0.5;
    selectedRoute.current.material.opacity = range(progress, 0.43, 0.53) * (1 - range(progress, 0.95, 1));
    pickupRing.current.material.opacity = clamp(1 - Math.abs(progress - 0.24) / 0.1) * 0.85;
    pickupRing.current.scale.setScalar(0.85 + collect * 0.4);
    destinationRing.current.material.opacity = deliver * 0.9;
    destinationRing.current.scale.setScalar(0.7 + deliver * 0.6);
    restaurantLight.current.intensity = 0.4 + clamp(1 - Math.abs(progress - 0.23) / 0.13) * 2.4;
    residenceLight.current.intensity = 0.25 + deliver * 2.8;

    sampleFrames(progress, 'position', cameraPosition);
    sampleFrames(progress, 'target', lookTarget);
    camera.position.copy(cameraPosition);
    camera.lookAt(lookTarget);
  });

  return (
    <>
      <color attach="background" args={['#aab8b5']} />
      <fog attach="fog" args={['#aab8b5', 40, 76]} />
      <ambientLight intensity={0.5} color="#dce7e3" />
      <hemisphereLight args={['#edf5f2', '#6a5c4e', 1.35]} />
      <directionalLight position={[-12, 18, -9]} intensity={2.1} color="#ffe3bd" />
      <directionalLight position={[14, 10, 10]} intensity={0.75} color="#a8c6d2" />
      <pointLight ref={restaurantLight} position={[5.4, 3.1, -15.2]} intensity={0.4} distance={11} decay={2} color="#ffad68" />
      <pointLight ref={residenceLight} position={[5.3, 2.8, 16]} intensity={0.25} distance={10} decay={2} color="#ffc27e" />
      <Neighborhood />
      <Line ref={candidateOne} points={candidateOnePoints} color={CHALK} lineWidth={1.4} transparent opacity={0} dashed dashScale={5} dashSize={0.45} gapSize={0.34} />
      <Line ref={candidateTwo} points={candidateTwoPoints} color={CHALK} lineWidth={1.4} transparent opacity={0} dashed dashScale={5} dashSize={0.45} gapSize={0.34} />
      <Line ref={selectedRoute} points={selectedPoints} color={ORANGE} lineWidth={3} transparent opacity={0} />
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 0.6, 1]}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#18201f" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <DeliveryScooter scooterRef={scooterRef} />
      <group ref={packageRef} scale={0.24} visible={false}>
        <SharedModel url={assets.package} />
      </group>
      <mesh ref={pickupRing} rotation={[-Math.PI / 2, 0, 0]} position={[5.25, 0.22, -15.3]}>
        <ringGeometry args={[0.55, 0.68, 28]} />
        <meshBasicMaterial color="#fff1d5" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={destinationRing} rotation={[-Math.PI / 2, 0, 0]} position={[5.05, 0.22, 16.1]}>
        <ringGeometry args={[0.72, 0.88, 28]} />
        <meshBasicMaterial color={ORANGE} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <SceneReady onReady={onReady} />
    </>
  );
}

export function UrbanDeliveryCanvas({ progressRef, onInvalidateReady, onReady, onError, onLoadProgress }) {
  const { progress } = useProgress();
  useEffect(() => onLoadProgress(progress), [onLoadProgress, progress]);

  return (
    <Canvas
      className="urban-canvas"
      camera={{ fov: 44, near: 0.15, far: 100, position: cameraFrames[0].position }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = false;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
      }}
    >
      <InvalidationBridge onReady={onInvalidateReady} />
      <SceneErrorBoundary onError={onError}>
        <Suspense fallback={null}>
          <DeliveryWorld progressRef={progressRef} onReady={onReady} />
        </Suspense>
      </SceneErrorBoundary>
    </Canvas>
  );
}
