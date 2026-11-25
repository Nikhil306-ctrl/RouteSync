import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Bike, ChefHat, RadioTower, UserRound } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useDocumentTitle } from '../hooks/useAsyncData.js';
import { AnimatedGroup, ScrollProgress, TextEffect, TextMorph, TransitionPanel } from '../components/landing/MotionPrimitives.jsx';
import './HomePage.css';

const UrbanDeliveryCanvas = lazy(() =>
  import('../components/landing/UrbanDeliveryScene.jsx').then((module) => ({ default: module.UrbanDeliveryCanvas })),
);

gsap.registerPlugin(ScrollTrigger);

const storyStages = [
  { number: '01', label: 'The neighborhood', title: 'A city that moves together.', body: 'RouteSync brings kitchens, riders and doorsteps into one live delivery picture.' },
  { number: '02', label: 'The kitchen', title: 'Orders land clean.', body: 'Restaurants see what to prepare next, with timings that match real rider pickup.' },
  { number: '03', label: 'The handoff', title: 'Pickup, without the wait.', body: 'The rider arrives as the order leaves the kitchen. One clear handoff, no guesswork.' },
  { number: '04', label: 'The network', title: 'Every route has options.', body: 'RouteSync weighs the live network and finds a path that fits this delivery.' },
  { number: '05', label: 'The decision', title: 'One route wins.', body: 'A single route is chosen, shared and kept current for everyone involved.' },
  { number: '06', label: 'The journey', title: 'Watch it move.', body: 'Follow the scooter through the neighborhood as the order moves through each stage.' },
  { number: '07', label: 'The doorstep', title: 'Delivered, everyone in the loop.', body: 'The final handoff is clear, and customers, restaurants and dispatch stay updated.' },
];

const stageBounds = [0, 0.12, 0.28, 0.38, 0.5, 0.62, 0.84];

const roles = [
  { id: 'customer', name: 'Customer', icon: UserRound, title: 'Order with clarity.', body: 'Browse restaurants, manage a cart and follow every order stage.', action: 'Browse restaurants', to: '/customer' },
  { id: 'restaurant', name: 'Restaurant', icon: ChefHat, title: 'Run the kitchen calmly.', body: 'Manage incoming orders, preparation and menu availability in one place.', action: 'Open restaurant portal', to: '/login' },
  { id: 'rider', name: 'Delivery partner', icon: Bike, title: 'Stay on the right route.', body: 'Review assignments, pickup details and planned stops on the move.', action: 'Open rider portal', to: '/login' },
  { id: 'admin', name: 'Dispatcher', icon: RadioTower, title: 'Coordinate the network.', body: 'See orders, rider capacity and restaurant activity together.', action: 'Open dispatch portal', to: '/login' },
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
          .fromTo('.intro-path', { strokeDasharray: 170, strokeDashoffset: 170 }, { strokeDashoffset: 0, duration: 0.58 })
          .fromTo('.intro-node', { scale: 0 }, { scale: 1, duration: 0.22, stagger: 0.07 }, 0.26)
          .fromTo('.intro-name', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, 0.36);
      }, ref);
    });
    return () => { active = false; context?.revert(); };
  }, []);

  useLayoutEffect(() => {
    if (!revealComplete || !sceneReady) return undefined;
    const tween = gsap.to(ref.current, { opacity: 0, duration: 0.28, ease: 'power2.inOut', onComplete: onFinish });
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
      <div className="static-journey-intro"><RouteMark /><span>Delivery journey</span></div>
      {storyStages.map((stage) => (
        <section key={stage.number}>
          <span>{stage.number}</span>
          <h2>{stage.title}</h2>
          <p>{stage.body}</p>
        </section>
      ))}
    </div>
  );
}

function RolePreview({ role }) {
  const Icon = role.icon;
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="portal-frame" aria-label={`${role.name} portal screenshot`}>
      <div className="portal-frame-bar"><span className="portal-window-dots" aria-hidden="true"><i /><i /><i /></span><span>RouteSync / {role.name}</span></div>
      {imageFailed ? (
        <div className="portal-frame-fallback"><Icon aria-hidden="true" /><p>Live interface capture unavailable.</p><span>Sign in to see the {role.name.toLowerCase()} portal.</span></div>
      ) : (
        <img src={`/screenshots/${role.id}.png`} alt={`${role.name} portal interface`} loading="lazy" onError={() => setImageFailed(true)} />
      )}
    </div>
  );
}

function RoleShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <section className="network-section" id="roles" aria-labelledby="network-title">
      <div className="network-heading"><h2 id="network-title">One connected network.</h2><p>Four focused portals, connected to the same delivery journey.</p></div>
      <div className="role-tabs" role="tablist" aria-label="RouteSync portals">
        {roles.map((role, index) => (
          <button type="button" role="tab" aria-selected={activeIndex === index} key={role.id} onClick={() => setActiveIndex(index)}>{role.name}</button>
        ))}
      </div>
      <TransitionPanel activeIndex={activeIndex} className="role-transition">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <div className="role-panel" role="tabpanel" key={role.id}>
              <RolePreview role={role} />
              <div className="role-details"><Icon aria-hidden="true" /><h3>{role.title}</h3><p>{role.body}</p><Link to={role.to}>{role.action}<ArrowRight aria-hidden="true" /></Link></div>
            </div>
          );
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
  const [introVisible, setIntroVisible] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && supportsWebGL());
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneLoadProgress, setSceneLoadProgress] = useState(0);

  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const handleInvalidateReady = useCallback((invalidate) => { invalidateRef.current = invalidate; invalidate(); }, []);
  const handleSceneReady = useCallback(() => { setSceneReady(true); setSceneLoadProgress(100); }, []);
  const handleSceneError = useCallback(() => { setSceneFailed(true); setWebglAvailable(false); }, []);
  const handleLoadProgress = useCallback((progress) => setSceneLoadProgress(progress), []);

  const jumpToStage = useCallback((index) => {
    const story = storyRef.current;
    if (!story || !webglAvailable || reducedMotion) return;
    const bounds = story.getBoundingClientRect();
    const scrollLength = bounds.height - window.innerHeight;
    const top = window.scrollY + bounds.top + scrollLength * stageBounds[index];
    window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion, webglAvailable]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      setCanvasVisible(entry.isIntersecting && !document.hidden);
    }, { rootMargin: '180px' });
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
          let nextStage = 0;
          for (let index = 1; index < stageBounds.length; index += 1) {
            if (self.progress >= stageBounds[index]) nextStage = index;
          }
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
      <header className="site-header">
        <Logo />
        <nav aria-label="Primary"><a href="#experience">Experience</a><a href="#roles">Portals</a><Link to="/login">Sign in</Link></nav>
        <Link className="header-cta" to="/register">Create account<ArrowRight aria-hidden="true" /></Link>
      </header>
      <main id="main">
        <section className={`webgl-story${reducedMotion || !webglAvailable ? ' webgl-story--static' : ''}`} id="experience" ref={storyRef} aria-label="RouteSync product journey">
          {reducedMotion || !webglAvailable ? <StaticJourney /> : (
            <div className="webgl-stage">
              <div className={`scene-loading${sceneReady ? ' scene-loading--ready' : ''}`} aria-live="polite"><RouteMark /><span>Building your delivery route</span><i><span style={{ transform: `scaleX(${sceneLoadProgress / 100})` }} /></i></div>
              {canvasVisible ? (
                <Suspense fallback={null}>
                  <UrbanDeliveryCanvas progressRef={progressRef} onInvalidateReady={handleInvalidateReady} onReady={handleSceneReady} onError={handleSceneError} onLoadProgress={handleLoadProgress} />
                </Suspense>
              ) : null}
              <div className="material-vignette" aria-hidden="true" />
              <div className="stage-meta"><span>{storyStages[stageIndex].number}</span><TextMorph>{storyStages[stageIndex].label}</TextMorph></div>
              <TransitionPanel activeIndex={stageIndex} className="story-copy-transition">
                {storyStages.map((stage, index) => (
                  <div className="story-copy" key={stage.number}>
                    {index === 0 ? <TextEffect as="h1">{stage.title}</TextEffect> : <h2>{stage.title}</h2>}
                    <p>{stage.body}</p>
                    {index === 0 ? (
                      <AnimatedGroup className="hero-actions" delay={0.1}>
                        <Link className="primary-button" to="/customer">Browse restaurants<ArrowRight aria-hidden="true" /></Link>
                        <Link to="/login">Sign in</Link>
                      </AnimatedGroup>
                    ) : null}
                  </div>
                ))}
              </TransitionPanel>
              <div className="scene-progress" aria-label="Delivery stages">
                {storyStages.map((stage, index) => (
                  <button type="button" key={stage.number} className={index === stageIndex ? 'is-active' : ''} onClick={() => jumpToStage(index)} aria-label={`Go to stage ${stage.number}: ${stage.label}`}><span style={{ transform: `scaleY(${index < stageIndex ? 1 : index === stageIndex ? 0.45 + progressRef.current * 0.1 : 0.04})` }} /></button>
                ))}
              </div>
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
