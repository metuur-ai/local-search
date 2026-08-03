import React, { useId, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  badgeText?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  badgeText,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-panel border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-panel border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-panel border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-panel border-y-transparent border-l-transparent',
  };

  return (
    <div className="relative inline-flex items-center group">
      {/* Trigger responds to hover AND focus/Escape so the tooltip is reachable
          and dismissible from the keyboard, not just the mouse. */}
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsVisible(false);
        }}
        tabIndex={children ? undefined : 0}
        aria-describedby={isVisible ? tooltipId : undefined}
        className="cursor-help inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 rounded-input"
      >
        {children ? (
          children
        ) : (
          <HelpCircle className="w-4 h-4 text-ink-3 hover:text-info transition-colors" aria-hidden="true" />
        )}
      </div>

      {isVisible && (
        <div
          role="tooltip"
          id={tooltipId}
          className={`absolute ${positionClasses[position]} z-50 pointer-events-none transition-all duration-200 motion-reduce:transition-none animate-fadeIn`}
        >
          <div className="bg-panel text-panel-ink text-sm font-medium px-3 py-2 rounded-card shadow-2xs max-w-xs whitespace-normal leading-relaxed border border-panel-edge">
            {badgeText && (
              <span className="inline-block px-1.5 py-0.5 bg-info text-white text-[10px] font-bold uppercase rounded-input mb-1 mr-1.5">
                {badgeText}
              </span>
            )}
            {content}
          </div>
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
};
