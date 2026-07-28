import React, { useState } from 'react';
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

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-y-transparent border-l-transparent',
  };

  return (
    <div className="relative inline-flex items-center group">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help inline-flex items-center"
      >
        {children ? (
          children
        ) : (
          <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" />
        )}
      </div>

      {isVisible && (
        <div
          className={`absolute ${positionClasses[position]} z-50 pointer-events-none transition-all duration-200 animate-fadeIn`}
        >
          <div className="bg-panel text-white text-xs font-medium px-3 py-2 rounded-xl shadow-xl max-w-xs whitespace-normal leading-relaxed border border-slate-700">
            {badgeText && (
              <span className="inline-block px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold uppercase rounded-md mb-1 mr-1.5">
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
