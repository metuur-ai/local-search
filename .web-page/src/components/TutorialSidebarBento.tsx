import React from 'react';
import { TutorialStep, AudienceLevel } from '../types';
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Lightbulb, Sparkles, Award } from 'lucide-react';
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col justify-between shadow-xs relative overflow-hidden h-full">
      {/* Step Header & Badge */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-extrabold uppercase tracking-wider rounded-lg">
            <Sparkles className="w-3 h-3 text-blue-600" />
            Step {currentStep.id} of {totalSteps}
          </span>
          <span className="text-xs text-slate-400 font-medium">
            ~{currentStep.estimatedMinutes} min
          </span>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight mb-2">
          {currentStep.title}
        </h2>

        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-4">
          {currentStep.subtitle}
        </p>

        {/* Current Objective Box */}
        <div className={`p-4 rounded-xl mb-4 border transition-all ${
          currentStep.completed 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-blue-50/80 border-blue-100 text-blue-950'
        }`}>
          <div className="flex items-start gap-2.5">
            {currentStep.completed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {currentStep.id}
              </div>
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wide mb-1 text-blue-800">
                {currentStep.completed ? 'Step Completed!' : 'Current Task'}
              </div>
              <p className="text-xs sm:text-sm font-medium leading-normal">
                {currentStep.taskDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Key Concepts (Dynamically styled by Audience Level) */}
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {audienceLevel === 'beginner' ? '💡 Simple Explanation' : '⚙️ Technical Concepts'}
          </div>
          <div className="space-y-2">
            {currentStep.keyConcepts.map((concept, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                <span className="font-bold text-slate-800 block mb-0.5">{concept.term}</span>
                <span className="text-slate-600 leading-snug block">{concept.explanation}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step Navigation Dots & Buttons */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        {/* Dot Indicators */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSelectStep(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                idx === currentStepIndex
                  ? 'bg-blue-600 w-6'
                  : currentStepIndex > idx || currentStep.completed
                  ? 'bg-blue-300'
                  : 'bg-slate-200 hover:bg-slate-300'
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
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              currentStepIndex === 0
                ? 'opacity-40 cursor-not-allowed text-slate-400'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          {allStepsCompleted ? (
            <button
              onClick={triggerConfetti}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
            >
              <Award className="w-4 h-4" />
              <span>Tutorial Complete! 🎉</span>
            </button>
          ) : (
            <button
              onClick={onNextStep}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5"
            >
              <span>{currentStepIndex === totalSteps - 1 ? 'Finish Guide' : 'Next Step'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
