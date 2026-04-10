import { useState, useEffect, useCallback } from 'react';

/**
 * A second cursor that moves autonomously across the page,
 * occasionally hovering over posts as if "reading" them.
 */
export function GhostCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);
  const [clicking, setClicking] = useState(false);

  const moveToRandom = useCallback(() => {
    const x = Math.random() * (window.innerWidth - 40) + 20;
    const y = Math.random() * Math.min(window.innerHeight * 2, document.body.scrollHeight) - window.scrollY;
    setPos({ x, y: Math.max(20, Math.min(y, window.innerHeight - 20)) });
  }, []);

  useEffect(() => {
    // Appear after 30-60 seconds
    const appearDelay = Math.random() * 30000 + 30000;
    const timer = setTimeout(() => {
      setVisible(true);
      moveToRandom();
    }, appearDelay);
    return () => clearTimeout(timer);
  }, [moveToRandom]);

  useEffect(() => {
    if (!visible) return;

    const moveInterval = setInterval(() => {
      moveToRandom();
      // Occasionally "click"
      if (Math.random() < 0.15) {
        setClicking(true);
        setTimeout(() => setClicking(false), 200);
      }
    }, 3000 + Math.random() * 4000);

    // Disappear and reappear
    const hideInterval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setVisible(true);
        moveToRandom();
      }, 8000 + Math.random() * 15000);
    }, 45000 + Math.random() * 30000);

    return () => {
      clearInterval(moveInterval);
      clearInterval(hideInterval);
    };
  }, [visible, moveToRandom]);

  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[90] transition-all duration-[2500ms] ease-in-out"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Ghost cursor SVG */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className={`opacity-30 ${clicking ? 'scale-90' : ''} transition-transform`}
      >
        <path
          d="M5.65 5.65L12 3L18.35 5.65L21 12L18.35 18.35L12 21L5.65 18.35L3 12L5.65 5.65Z"
          fill="currentColor"
          className="text-green-500"
        />
      </svg>
      {/* Label that appears briefly */}
      {clicking && (
        <span className="absolute top-5 left-3 font-mono text-[8px] text-green-500 opacity-50 whitespace-nowrap">
          [leyendo...]
        </span>
      )}
    </div>
  );
}
