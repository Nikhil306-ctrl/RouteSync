import { Children } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'motion/react';

const easing = [0.22, 1, 0.36, 1];

export function TextEffect({ children, as = 'p', className = '', delay = 0 }) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as] ?? motion.p;
  const words = children.split(' ');

  return (
    <Component
      className={className}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      variants={{ visible: { transition: { delayChildren: delay, staggerChildren: 0.055 } } }}
    >
      {words.map((word, index) => (
        <motion.span
          className="motion-word"
          key={`${word}-${index}`}
          variants={{
            hidden: { opacity: 0, y: '0.45em', filter: 'blur(7px)' },
            visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.65, ease: easing } },
          }}
        >
          {word}{index < words.length - 1 ? '\u00a0' : ''}
        </motion.span>
      ))}
    </Component>
  );
}

export function AnimatedGroup({ children, className = '', delay = 0 }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      variants={{ visible: { transition: { delayChildren: delay, staggerChildren: 0.1 } } }}
    >
      {Children.map(children, (child) => (
        <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easing } } }}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

export function TransitionPanel({ activeIndex, children, className = '' }) {
  const panels = Children.toArray(children);
  const reduceMotion = useReducedMotion();
  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeIndex}
          initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(5px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.3, ease: easing }}
        >
          {panels[activeIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.25 });
  return <motion.div className="landing-scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

export function TextMorph({ children, className = '' }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className={className} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          className="text-morph-value"
          key={children}
          initial={reduceMotion ? false : { opacity: 0, y: 5, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, filter: 'blur(4px)' }}
          transition={{ duration: 0.24, ease: easing }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
