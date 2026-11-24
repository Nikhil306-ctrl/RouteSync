import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Bike, ChefHat, RadioTower, UserRound } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useDocumentTitle } from '../hooks/useAsyncData.js';
import { AnimatedGroup, ScrollProgress, TextEffect, TextMorph, TransitionPanel } from '../components/landing/MotionPrimitives.jsx';
import { UrbanDeliveryCanvas } from '../components/landing/UrbanDeliveryScene.jsx';
import './HomePage.css';

gsap.registerPlugin(ScrollTrigger);

const storyStages = [
  { number: '02', label: 'Delivery, in sync.', title: 'Dinner, moving together.', body: 'From kitchen to doorstep, every handoff stays in sync.' },
  { number: '03', label: 'Ready for pickup.', title: 'Ready for pickup.', body: 'The rider arrives as your order leaves the kitchen.' },
  { number: '04', label: 'A route that fits.', title: 'A route that fits.', body: 'RouteSync chooses a clear path for this delivery.' },
  { number: '05', label: 'On the way.', title: 'Right on time.', body: 'Follow the order as it moves through the neighborhood.' },
  { number: '06', label: 'At your door.', title: 'At your door.', body: 'The final handoff is clear, and everyone stays updated.' },
];

const roles = [
  { id: 'customer', name: 'Customer', icon: UserRound, title: 'Order with clarity.', body: 'Browse restaurants, manage a cart and follow order status.', action: 'Create customer account', to: '/register' },
  { id: 'restaurant', name: 'Restaurant', icon: ChefHat, title: 'Prepare every handoff.', body: 'Manage incoming orders, preparation and menu availability.', action: 'Restaurant sign in', to: '/login' },
  { id: 'rider', name: 'Delivery partner', icon: Bike, title: 'Stay on the right route.', body: 'Review assignments, pickup details and planned stops.', action: 'Delivery partner sign in', to: '/login' },
  { id: 'dispatcher', name: 'Dispatcher', icon: RadioTower, title: 'Coordinate the network.', body: 'See orders, rider capacity and restaurant activity together.', action: 'Dispatcher sign in', to: '/login' },
];

function RouteMark({ className = '' }) {
  return (
    <span className={`route-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 54 54"><path d="M9 41c8-15 15-7 22-20 4-7 9-10 15-10" /><circle cx="9" cy="41" r="3.5" /><circle cx="46" cy="11" r="3.5" /></svg>
    </span>
  );
}

function Logo({ light = true }) {
  return <Link to="/" className={`site-logo${light ? ' site-logo--light' : ''}`} aria-label="RouteSync home"><RouteMark /><span>RouteSync</span></Link>;
}

function Intro({ loadProgress, sceneReady, onFinish }) {
  const ref = useRef(null);
  const [revealComplete, setRevealComplete] = useState(false);
  useLayoutEffect(() => {
    let active = true;
    let context;
    queueMicrotask(() => {
      if (!active) return;
      context = gsap.context(() => {
        gsap.timeline({ onComplete: () => setRevealComplete(true), defaults: { ease: 'expo.out' } })
          .fromTo('.intro-path', { strokeDasharray: 170, strokeDashoffset: 170 }, { strokeDashoffset: 0, duration: 0.72 })
          .fromTo('.intro-node', { scale: 0 }, { scale: 1, duration: 0.26, stagger: 0.08 }, 0.34)
          .fromTo('.intro-name', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.46 }, 0.44)
          .call(() => {}, [], '+=0.18');
      }, ref);
    });
    return () => { active = false; context?.revert(); };
  }, []);

  useLayoutEffect(() => {
    if (!revealComplete || !sceneReady) return undefined;
    const tween = gsap.to(ref.current, { opacity: 0, duration: 0.32, ease: 'power2.inOut', onComplete: onFinish });
    return () => tween.kill();
  }, [onFinish, revealComplete, sceneReady]);

  return (
    <div className="brand-intro" ref={ref} role="dialog" aria-label="RouteSync introduction">
      <button type="button" onClick={onFinish}>Skip intro</button>
      <div className="intro-lockup"><svg viewBox="0 0 180 92"><path className="intro-path" d="M12 75C42 20 68 77 96 30c18-30 42-18 71-19" /><circle className="intro-node" cx="12" cy="75" r="5" /><circle className="intro-node intro-node--end" cx="167" cy="11" r="5" /></svg><span className="intro-name">RouteSync</span></div>
      <div className="intro-status" aria-live="polite"><span>{sceneReady ? 'Your route is ready' : `Preparing the neighborhood ${Math.round(loadProgress)}%`}</span><i><span style={{ transform: `scaleX(${loadProgress / 100})` }} /></i></div>
    </div>
  );
}

function StaticJourney() {
  return (
    <div className="static-journey" aria-label="RouteSync delivery journey">
      <div className="static-journey-intro"><RouteMark /><span>Journey overview</span></div>
      {storyStages.map((stage) => <section key={stage.number}><span>{stage.number}</span><h2>{stage.title}</h2><p>{stage.body}</p></section>)}
    </div>
  );
}

function RolePreview({ role }) {
  const Icon = role.icon;
  return (
    <div className="portal-reservation" aria-label={`${role.name} portal screenshot reserved`}>
      <div className="reservation-mark"><Icon aria-hidden="true" /></div>
      <span>Portal screenshot reserved</span>
      <p>The functional {role.name.toLowerCase()} interface will be documented here after development.</p>
    </div>
  );
}

function RoleShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <section className="network-section" id="roles" aria-labelledby="network-title">
      <div className="network-heading"><span>07</span><h2 id="network-title">One connected network.</h2><p>Four focused portals, connected to the same delivery journey.</p></div>
      <div className="role-tabs" role="tablist" aria-label="RouteSync portals">
        {roles.map((role, index) => <button type="button" role="tab" aria-selected={activeIndex === index} key={role.id} onClick={() => setActiveIndex(index)}>{role.name}</button>)}
      </div>
      <TransitionPanel activeIndex={activeIndex} className="role-transition">
        {roles.map((role) => {
          const Icon = role.icon;
          return <div className="role-panel" role="tabpanel" key={role.id}><RolePreview role={role} /><div className="role-details"><Icon aria-hidden="true" /><h3>{role.title}</h3><p>{role.body}</p><Link to={role.to}>{role.action}<ArrowRight aria-hidden="true" /></Link></div></div>;
        })}
      </TransitionPanel>
      <div className="network-close"><h2>Good food.<br />Smarter delivery.</h2><div><Link className="primary-button" to="/customer">Browse restaurants<ArrowRight aria-hidden="true" /></Link><Link to="/register">Create account</Link><Link to="/login">Sign in</Link></div></div>
    </section>
  );
}

function supportsWebGL() {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('webgl') === '0') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

export default function HomePage() {
  useDocumentTitle('Delivery, in sync');
  const reducedMotion = useReducedMotion();
  const pageRef = useRef(null);
  const storyRef = useRef(null);
  const progressRef = useRef(0);
  const invalidateRef = useRef(() => {});
  const visibleRef = useRef(true);
  const [stageIndex, setStageIndex] = useState(0);
  const [webglAvailable, setWebglAvailable] = useState(supportsWebGL);
  const [canvasVisible, setCanvasVisible] = useState(true);
  const [introVisible, setIntroVisible] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneLoadProgress, setSceneLoadProgress] = useState(0);

  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const handleInvalidateReady = useCallback((invalidate) => { invalidateRef.current = invalidate; invalidate(); }, []);
  const handleSceneReady = useCallback(() => { setSceneReady(true); setSceneLoadProgress(100); }, []);
  const handleSceneError = useCallback(() => { setSceneFailed(true); setWebglAvailable(false); }, []);
  const handleLoadProgress = useCallback((progress) => setSceneLoadProgress(progress), []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { visibleRef.current = entry.isIntersecting; setCanvasVisible(entry.isIntersecting && !document.hidden); }, { rootMargin: '180px' });
    if (storyRef.current) observer.observe(storyRef.current);
    const onVisibility = () => setCanvasVisible(!document.hidden && visibleRef.current);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useLayoutEffect(() => {
    if (reducedMotion || !webglAvailable) return undefined;
    let currentStage = 0;
    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: storyRef.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate(self) {
          progressRef.current = self.progress;
          const nextStage = self.progress < 0.17 ? 0 : self.progress < 0.34 ? 1 : self.progress < 0.49 ? 2 : self.progress < 0.82 ? 3 : 4;
          if (nextStage !== currentStage) { currentStage = nextStage; setStageIndex(nextStage); }
          invalidateRef.current();
        },
      });
    }, pageRef);
    return () => context.revert();
  }, [reducedMotion, webglAvailable]);

  return (
    <div className="landing-3d" ref={pageRef}>
      {introVisible ? <Intro loadProgress={sceneLoadProgress} sceneReady={sceneReady || sceneFailed} onFinish={finishIntro} /> : null}
      <ScrollProgress />
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header"><Logo /><nav aria-label="Primary"><a href="#experience">Experience</a><a href="#roles">Portals</a><Link to="/login">Sign in</Link></nav><Link className="header-cta" to="/register">Create account<ArrowRight aria-hidden="true" /></Link></header>
      <main id="main">
        <section className={`webgl-story${reducedMotion || !webglAvailable ? ' webgl-story--static' : ''}`} id="experience" ref={storyRef} aria-label="RouteSync product journey">
          {reducedMotion || !webglAvailable ? <StaticJourney /> : (
            <div className="webgl-stage">
              <div className={`scene-loading${sceneReady ? ' scene-loading--ready' : ''}`} aria-live="polite"><RouteMark /><span>Building your delivery route</span><i><span style={{ transform: `scaleX(${sceneLoadProgress / 100})` }} /></i></div>
              {canvasVisible ? <UrbanDeliveryCanvas progressRef={progressRef} onInvalidateReady={handleInvalidateReady} onReady={handleSceneReady} onError={handleSceneError} onLoadProgress={handleLoadProgress} /> : null}
              <div className="material-vignette" aria-hidden="true" />
              <div className="stage-meta"><span>{storyStages[stageIndex].number}</span><TextMorph>{storyStages[stageIndex].label}</TextMorph></div>
              <TransitionPanel activeIndex={stageIndex} className="story-copy-transition">
                {storyStages.map((stage, index) => <div className="story-copy" key={stage.number}>{index === 0 ? <TextEffect as="h1">{stage.title}</TextEffect> : <h2>{stage.title}</h2>}<p>{stage.body}</p>{index === 0 ? <AnimatedGroup className="hero-actions" delay={0.1}><Link className="primary-button" to="/customer">Browse restaurants<ArrowRight aria-hidden="true" /></Link><Link to="/login">Sign in</Link></AnimatedGroup> : null}</div>)}
              </TransitionPanel>
              <div className="scene-progress" aria-hidden="true"><span style={{ transform: `scaleY(${Math.max(0.03, (stageIndex + 1) / 5)})` }} /></div>
              <div className="scroll-direction"><ArrowDown aria-hidden="true" /><span>Scroll to drive the journey</span></div>
              <p className="scene-note">Licensed 3D neighborhood</p>
            </div>
          )}
        </section>
        <RoleShowcase />
      </main>
      <footer className="site-footer"><Logo /><p>Intelligent food delivery coordination.</p><p>© {new Date().getFullYear()} RouteSync</p></footer>
    </div>
  );
}
