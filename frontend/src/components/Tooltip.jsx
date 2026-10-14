import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Top-level Portal Tooltip.
 * Renders into document.body with z-[99999] so it is always on top
 * and never clipped by overflow-hidden or hidden behind sticky table headers.
 * Automatically strips native HTML `title` to prevent double tooltips.
 */
export default function Tooltip({
  text,
  children,
  position = 'top',
  className = '',
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState(null);
  const targetRef = useRef(null);
  const tooltipRef = useRef(null);

  const calculatePosition = () => {
    if (!targetRef.current) return;
    const rect = targetRef.current.getBoundingClientRect();

    // Auto-flip if too close to top of viewport (e.g. navbar / table header)
    let effectivePos = position;
    if (position === 'top' && rect.top < 80) {
      effectivePos = 'bottom';
    } else if (position === 'bottom' && rect.bottom + 45 > window.innerHeight) {
      effectivePos = 'top';
    }

    let top = 0;
    let left = 0;
    const gap = 6;

    if (effectivePos === 'top') {
      top = rect.top - gap;
      left = rect.left + rect.width / 2;
    } else if (effectivePos === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2;
    } else if (effectivePos === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - gap;
    } else if (effectivePos === 'right') {
      top = rect.top + rect.height / 2;
      left = rect.right + gap;
    }

    setCoords({ top, left, effectivePos });
  };

  const handleMouseEnter = () => {
    if (!text) return;
    calculatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible) return;
    const handleUpdate = () => calculatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible, position]);

  // Boundary check: adjust horizontal position so tooltip doesn't bleed off screen edges
  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current || !coords) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 10;
    if (tooltipRect.right > window.innerWidth - padding) {
      const diff = tooltipRect.right - (window.innerWidth - padding);
      tooltipRef.current.style.left = `${coords.left - diff}px`;
    } else if (tooltipRect.left < padding) {
      const diff = padding - tooltipRect.left;
      tooltipRef.current.style.left = `${coords.left + diff}px`;
    }
  }, [isVisible, coords]);

  const getTransform = (pos) => {
    if (pos === 'top') return 'translate(-50%, -100%)';
    if (pos === 'bottom') return 'translate(-50%, 0)';
    if (pos === 'left') return 'translate(-100%, -50%)';
    if (pos === 'right') return 'translate(0, -50%)';
    return 'translate(-50%, -100%)';
  };

  if (!text) return children;

  // Clone child to remove `title` attribute so browser never renders native HTML tooltip
  const childElement = React.isValidElement(children)
    ? React.cloneElement(children, {
        title: undefined,
        'aria-label': children.props['aria-label'] || children.props.title || text,
      })
    : children;

  return (
    <>
      <span
        ref={targetRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        className={`inline-flex items-center ${className}`}
      >
        {childElement}
      </span>
      {isVisible && text && coords && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed pointer-events-none z-[99999] select-none transition-opacity duration-100 ease-out"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: getTransform(coords.effectivePos),
          }}
        >
          <div className="bg-slate-900/95 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-xl border border-slate-700/60 whitespace-nowrap">
            {text}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
