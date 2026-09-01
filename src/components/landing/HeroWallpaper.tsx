"use client";

import { useEffect, useRef, useState } from "react";

export function HeroWallpaper() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    function handleMove(event: MouseEvent) {
      setPos({ x: event.clientX, y: event.clientY });
      setMoved(true);
    }
    function handleLeave(event: MouseEvent) {
      if (!event.relatedTarget) setMoved(false);
    }
    window.addEventListener("mousemove", handleMove);
    document.documentElement.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.documentElement.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <div ref={ref} className="fixed inset-0 z-0 overflow-hidden bg-gradient-to-br from-brand-50 via-neutral-50 to-brand-100">
      {                                                              }
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--color-brand-500) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {                                                                
                                                                   }
      <svg className="absolute inset-0 h-full w-full mix-blend-overlay" aria-hidden="true">
        <filter id="wallpaper-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#wallpaper-grain)" opacity="0.06" />
      </svg>

      {                                                                    
                                                                }
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-[var(--ease-rz)]"
        style={{
          opacity: moved ? 1 : 0,
          backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 55%, transparent) 1.5px, transparent 1.5px)",
          backgroundSize: "38px 38px",
          WebkitMaskImage: `radial-gradient(280px 280px at ${pos.x}px ${pos.y}px, black 0%, black 35%, transparent 72%)`,
          maskImage: `radial-gradient(280px 280px at ${pos.x}px ${pos.y}px, black 0%, black 35%, transparent 72%)`,
        }}
      />

      {                                                                   
                                                                           }
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-[var(--ease-rz)]"
        style={{
          opacity: moved ? 0.5 : 0,
          background: `radial-gradient(320px 320px at ${pos.x}px ${pos.y}px, color-mix(in srgb, var(--color-brand-400) 35%, transparent), transparent 70%)`,
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/0 via-white/0 to-white/40" />
    </div>
  );
}
