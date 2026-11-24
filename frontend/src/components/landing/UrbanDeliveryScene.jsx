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
const routePoints = [
  new THREE.Vector3(-1.4, 0.42, -17),
  new THREE.Vector3(-1.25, 0.42, -8),
  new THREE.Vector3(-0.85, 0.42, 0),
  new THREE.Vector3(-0.45, 0.42, 9),
  new THREE.Vector3(0, 0.42, 17),
];
const cameraFrames = [
  { at: 0, position: new THREE.Vector3(7.4, 6.2, -25), target: new THREE.Vector3(-1.2, 1.1, -13) },
  { at: 0.17, position: new THREE.Vector3(5.2, 4.6, -23), target: new THREE.Vector3(-0.5, 1.2, -15.5) },
  { at: 0.34, position: new THREE.Vector3(2.4, 11.5, -15), target: new THREE.Vector3(-0.7, 0.5, -5) },
  { at: 0.49, position: new THREE.Vector3(4, 5.2, -13.5), target: new THREE.Vector3(-1.1, 1.1, -6) },
  { at: 0.66, position: new THREE.Vector3(4.2, 5.2, -1), target: new THREE.Vector3(-0.5, 1.1, 7) },
  { at: 0.82, position: new THREE.Vector3(-4.4, 5.4, 8), target: new THREE.Vector3(0, 1.1, 15) },
  { at: 1, position: new THREE.Vector3(-5.8, 4.8, 10.5), target: new THREE.Vector3(4.8, 1.4, 16) },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);

function sampleFrames(progress, property, output) {
  let upperIndex = 1;
  while (upperIndex < cameraFrames.length - 1 && progress > cameraFrames[upperIndex].at) upperIndex += 1;
  const lower = cameraFrames[upperIndex - 1];
  const upper = cameraFrames[upperIndex];
  const amount = smooth(clamp((progress - lower.at) / (upper.at - lower.at)));
  return output.lerpVectors(lower[property], upper[property], amount);
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
    <group ref={scooterRef} scale={1.15}>
      <Clone object={scene} deep={false} />
    </group>
  );
}

function Neighborhood() {
  const roadTiles = [
    { url: assets.road, position: [0, 0, -17.7] },
    { url: assets.road, position: [0, 0, -5.9] },
    { url: assets.road, position: [0, 0, 5.9] },
    { url: assets.road, position: [0, 0, 17.7] },
  ];
  const lights = [
    [-5.9, 0.18, -16, Math.PI], [5.9, 0.18, -7, 0],
    [-5.9, 0.18, 5, Math.PI], [5.9, 0.18, 16, 0],
  ];

  return (
    <>
      <mesh position={[0, -0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[72, 72]} />
        <meshStandardMaterial color="#70766f" roughness={1} />
      </mesh>
      {roadTiles.map((tile, index) => <SharedModel key={`${tile.url}-${index}`} url={tile.url} position={tile.position} />)}
      <SharedModel url={assets.restaurant} position={[10.9, 0.1, -13.5]} rotation={[0, -Math.PI / 2, 0]} scale={0.82} />
      <SharedModel url={assets.shops} position={[-12.4, 0.1, -3]} rotation={[0, Math.PI / 2, 0]} scale={0.82} />
      <SharedModel url={assets.residence} position={[11, 0.1, 15.5]} rotation={[0, -Math.PI / 2, 0]} scale={0.85} />
      {lights.map(([x, y, z, rotation], index) => (
        <SharedModel key={`street-light-${index}`} url={assets.streetLight} position={[x, y, z]} rotation={[0, rotation, 0]} scale={0.9} />
      ))}
    </>
  );
}

function DeliveryWorld({ progressRef, onReady }) {
  const scooterRef = useRef(null);
  const scooterShadowRef = useRef(null);
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
  const routeCurve = useMemo(() => new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0.2), []);
  const selectedPoints = useMemo(() => routeCurve.getPoints(64), [routeCurve]);
  const candidateOnePoints = useMemo(() => routePoints.map((point, index) => point.clone().setX(index % 2 ? 1.5 : 1.9)), []);
  const candidateTwoPoints = useMemo(() => routePoints.map((point, index) => point.clone().setX(index === 2 ? -2 : -2.25)), []);
  const routePoint = useMemo(() => new THREE.Vector3(), []);
  const routeTangent = useMemo(() => new THREE.Vector3(), []);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const packagePosition = useMemo(() => new THREE.Vector3(), []);
  const pickupStart = useMemo(() => new THREE.Vector3(5.35, 1.2, -15.4), []);
  const pickupEnd = useMemo(() => routePoints[0].clone().add(new THREE.Vector3(0, 1.42, -0.15)), []);
  const deliveredEnd = useMemo(() => new THREE.Vector3(5.45, 0.62, 16.2), []);
  const packageOffset = useMemo(() => new THREE.Vector3(0, 1.42, -0.15), []);

  useFrame((state, delta) => {
    const targetProgress = progressRef.current;
    const progress = THREE.MathUtils.damp(dampedProgress.current, targetProgress, 7.5, Math.min(delta, 0.1));
    dampedProgress.current = progress;
    if (Math.abs(targetProgress - progress) > 0.0004) invalidate();

    const driveProgress = smooth(clamp((progress - 0.49) / 0.33));
    routeCurve.getPointAt(driveProgress, routePoint);
    routeCurve.getTangentAt(Math.min(0.999, driveProgress + 0.002), routeTangent);
    const scooter = scooterRef.current;
    scooter.position.copy(routePoint);
    scooter.rotation.y = Math.atan2(routeTangent.x, routeTangent.z);
    scooterShadowRef.current.position.set(routePoint.x, 0.22, routePoint.z);
    scooterShadowRef.current.rotation.z = -scooter.rotation.y;

    const pickupProgress = smooth(clamp((progress - 0.18) / 0.13));
    const deliveryProgress = smooth(clamp((progress - 0.84) / 0.12));
    packageRef.current.visible = progress >= 0.17;
    if (progress < 0.49) {
      packagePosition.lerpVectors(pickupStart, pickupEnd, pickupProgress);
    } else {
      packagePosition.copy(routePoint).add(packageOffset).lerp(deliveredEnd, deliveryProgress);
    }
    packageRef.current.position.copy(packagePosition);
    packageRef.current.rotation.y = scooter.rotation.y;

    const candidatesOpacity = clamp(1 - Math.abs(progress - 0.405) / 0.095);
    candidateOne.current.material.opacity = candidatesOpacity * 0.62;
    candidateTwo.current.material.opacity = candidatesOpacity * 0.62;
    selectedRoute.current.material.opacity = clamp((progress - 0.4) / 0.07) * (1 - clamp((progress - 0.94) / 0.06));
    pickupRing.current.material.opacity = clamp(1 - Math.abs(progress - 0.235) / 0.09) * 0.8;
    pickupRing.current.scale.setScalar(0.85 + pickupProgress * 0.45);
    destinationRing.current.material.opacity = deliveryProgress * 0.9;
    destinationRing.current.scale.setScalar(0.7 + deliveryProgress * 0.65);
    restaurantLight.current.intensity = 0.4 + clamp(1 - Math.abs(progress - 0.24) / 0.14) * 2.6;
    residenceLight.current.intensity = 0.25 + deliveryProgress * 3;

    sampleFrames(progress, 'position', cameraPosition);
    sampleFrames(progress, 'target', lookTarget);
    camera.position.copy(cameraPosition);
    camera.lookAt(lookTarget);
  });

  return (
    <>
      <color attach="background" args={['#aab8b6']} />
      <fog attach="fog" args={['#aab8b6', 38, 68]} />
      <ambientLight intensity={0.55} color="#dce7e3" />
      <hemisphereLight args={['#edf5f2', '#65594e', 1.45]} />
      <directionalLight position={[-10, 16, -8]} intensity={2.35} color="#ffe2b5" />
      <directionalLight position={[12, 9, 9]} intensity={0.85} color="#9ec4d0" />
      <pointLight ref={restaurantLight} position={[5.4, 3.1, -15.2]} intensity={0.4} distance={11} decay={2} color="#ffad68" />
      <pointLight ref={residenceLight} position={[5.3, 2.8, 16]} intensity={0.25} distance={10} decay={2} color="#ffc27e" />
      <Neighborhood />
      <Line ref={candidateOne} points={candidateOnePoints} color="#f4f6f3" lineWidth={1.4} transparent opacity={0} dashed dashScale={5} dashSize={0.45} gapSize={0.34} />
      <Line ref={candidateTwo} points={candidateTwoPoints} color="#f4f6f3" lineWidth={1.4} transparent opacity={0} dashed dashScale={5} dashSize={0.45} gapSize={0.34} />
      <Line ref={selectedRoute} points={selectedPoints} color={ORANGE} lineWidth={3} transparent opacity={0} />
      <mesh ref={scooterShadowRef} rotation={[-Math.PI / 2, 0, 0]} scale={[1.15, 0.62, 1]}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#18201f" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <DeliveryScooter scooterRef={scooterRef} />
      <group ref={packageRef} scale={0.24}>
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
      camera={{ fov: 42, near: 0.15, far: 90, position: [7.4, 6.2, -25] }}
      dpr={1}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = false;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
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
