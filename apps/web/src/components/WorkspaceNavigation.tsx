import { useLayoutEffect, useRef } from "react";

export type WorkspaceView = "workbench" | "verification" | "library";
const destinations: Array<{ id: WorkspaceView; label: string }> = [
  { id: "workbench", label: "Workbench" },
  { id: "verification", label: "Verification" },
  { id: "library", label: "Skill library" }
];

/** Critically damped springs retain their current position and velocity when retargeted. */
export function WorkspaceNavigation({ view, onChange }: { view: WorkspaceView; onChange: (view: WorkspaceView) => void }) {
  const navigation = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const motion = useRef({ x: 0, width: 0, vx: 0, vw: 0, initialized: false });
  useLayoutEffect(() => {
    const nav = navigation.current;
    const surface = indicator.current;
    if (!nav || !surface) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let targetX = 0, targetWidth = 0;
    const paint = () => {
      surface.style.transform = `translate3d(${motion.current.x}px,0,0)`;
      surface.style.width = motion.current.width + "px";
      surface.style.opacity = "1";
    };
    const settle = () => {
      Object.assign(motion.current, { x: targetX, width: targetWidth, vx: 0, vw: 0, initialized: true });
      paint();
    };
    const advance = (position: number, velocity: number, target: number, dt: number) => {
      const omega = 2 * Math.PI / 0.35;
      const displacement = position - target;
      const momentum = velocity + omega * displacement;
      const decay = Math.exp(-omega * dt);
      return { position: target + (displacement + momentum * dt) * decay, velocity: (velocity - omega * momentum * dt) * decay };
    };
    const tick = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
      previous = now;
      const state = motion.current;
      const x = advance(state.x, state.vx, targetX, dt);
      const width = advance(state.width, state.vw, targetWidth, dt);
      Object.assign(state, { x: x.position, vx: x.velocity, width: width.position, vw: width.velocity });
      paint();
      if (Math.abs(state.x - targetX) + Math.abs(state.width - targetWidth) < 0.05 && Math.abs(state.vx) + Math.abs(state.vw) < 0.1) { frame = 0; settle(); }
      else frame = requestAnimationFrame(tick);
    };
    const retarget = () => {
      const active = nav.querySelector<HTMLButtonElement>(`button[data-view="${view}"]`);
      if (!active) return;
      targetX = active.offsetLeft; targetWidth = active.offsetWidth;
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      if (reduced.matches || !motion.current.initialized) settle();
      else frame = requestAnimationFrame(tick);
    };
    retarget();
    const resize = new ResizeObserver(retarget);
    resize.observe(nav);
    reduced.addEventListener("change", retarget);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); reduced.removeEventListener("change", retarget); };
  }, [view]);
  return <nav ref={navigation} className="view-switch" aria-label="Skill compilation views">
    <span ref={indicator} className="view-switch-indicator" aria-hidden="true" />
    {destinations.map((destination) => <button key={destination.id} data-view={destination.id} type="button" className={view === destination.id ? "view-switch__active" : ""} aria-current={view === destination.id ? "page" : undefined} onClick={() => onChange(destination.id)}>{destination.label}</button>)}
  </nav>;
}
