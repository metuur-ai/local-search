import React from 'react';
import { TutorialStep, AudienceLevel } from '../types';
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Lightbulb, Settings, Sparkles, Award, PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';

interface TutorialSidebarBentoProps {
  currentStep: TutorialStep;
  currentStepIndex: number;
  totalSteps: number;
  audienceLevel: AudienceLevel;
  onNextStep: () => void;
  onPrevStep: () => void;
  onSelectStep: (index: number) => void;
  onExecuteShortcut?: (action: string) => void;
  allStepsCompleted: boolean;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export const TutorialSidebarBento: React.FC<TutorialSidebarBentoProps> = ({
  currentStep,
  currentStepIndex,
  totalSteps,
  audienceLevel,
  onNextStep,
  onPrevStep,
  onSelectStep,
  onExecuteShortcut,
  allStepsCompleted,
}) => {
  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  return (
    <div className="bg-white rounded-card border border-rule p-5 sm:p-6 flex flex-col justify-between shadow-2xs relative overflow-hidden h-full">
      {/* Step Header & Badge */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-info-soft text-info-ink text-xs font-extrabold uppercase tracking-wider rounded-input">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Step {currentStep.id} of {totalSteps}
          </span>
          <span className="text-xs text-ink-3 font-medium">
            ~{currentStep.estimatedMinutes} min
          </span>
        </div>

        <h2 className="text-lg sm:text-xl font-display font-semibold text-ink leading-tight mb-2">
          {currentStep.title}
        </h2>

        <p className="text-ink-2 text-sm leading-relaxed mb-4">
          {currentStep.subtitle}
        </p>

        {/* Current Objective Box */}
        <div className={`p-4 rounded-card mb-4 border transition-all ${
          currentStep.completed
            ? 'bg-accent-soft border-accent/25 text-accent-ink'
            : 'bg-info-soft border-info/20 text-info-ink'
        }`}>
          <div className="flex items-start gap-2.5">
            {currentStep.completed ? (
              <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-info text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {currentStep.id}
              </div>
            )}
            <div>
              <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${currentStep.completed ? 'text-accent-ink' : 'text-info-ink'}`}>
                {currentStep.completed ? 'Step Completed!' : 'Current Task'}
              </div>
              <p className="text-sm font-medium leading-normal">
                {currentStep.taskDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Key Concepts (Dynamically styled by Audience Level) */}
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2 flex items-center gap-1.5">
            {audienceLevel === 'beginner' ? (
              <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {audienceLevel === 'beginner' ? 'Simple Explanation' : 'Technical Concepts'}
          </div>
          <div className="space-y-2">
            {currentStep.keyConcepts.map((concept, idx) => (
              <div key={idx} className="p-2.5 bg-paper-2 border border-rule rounded-card text-sm">
                <span className="font-bold text-ink block mb-0.5">{concept.term}</span>
                <span className="text-ink-2 leading-snug block">{concept.explanation}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step Navigation Dots & Buttons */}
      <div className="mt-auto pt-4 border-t border-rule">
        {/* Dot Indicators */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSelectStep(idx)}
              aria-label={`Go to Step ${idx + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-all ${FOCUS_RING} ${
                idx === currentStepIndex
                  ? 'bg-accent w-6'
                  : currentStepIndex > idx || currentStep.completed
                  ? 'bg-accent/40'
                  : 'bg-rule hover:bg-rule-strong'
              }`}
              title={`Go to Step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Next / Previous Buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onPrevStep}
            disabled={currentStepIndex === 0}
            className={`px-3 py-2 rounded-card text-xs font-bold flex items-center gap-1 transition-all min-h-11 ${FOCUS_RING} ${
              currentStepIndex === 0
                ? 'opacity-40 cursor-not-allowed text-ink-3'
                : 'bg-paper-3 text-ink-2 hover:bg-rule'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Previous
          </button>

          {allStepsCompleted ? (
            <button
              onClick={triggerConfetti}
              className={`flex-1 py-2.5 bg-accent text-accent-contrast rounded-card text-xs font-bold shadow-2xs hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5 min-h-11 ${FOCUS_RING}`}
            >
              <Award className="w-4 h-4" aria-hidden="true" />
              <span>Tutorial Complete!</span>
              <PartyPopper className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={onNextStep}
              className={`flex-1 py-2.5 bg-accent text-accent-contrast rounded-card text-xs font-bold shadow-2xs hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5 min-h-11 ${FOCUS_RING}`}
            >
              <span>{currentStepIndex === totalSteps - 1 ? 'Finish Guide' : 'Next Step'}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
