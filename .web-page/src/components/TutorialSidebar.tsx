import React from 'react';
import { AudienceLevel, TutorialStep } from '../types';
import {
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  Play,
  Lightbulb,
  Award,
  BookOpen,
  ChevronRight,
  Zap,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TutorialSidebarProps {
  steps: TutorialStep[];
  currentStepId: number;
  setCurrentStepId: (id: number) => void;
  completedSteps: number[];
  onCompleteStep: (stepId: number) => void;
  onExecuteStepAction: (stepId: number) => void;
  audienceLevel: AudienceLevel;
}

export const TutorialSidebar: React.FC<TutorialSidebarProps> = ({
  steps,
  currentStepId,
  setCurrentStepId,
  completedSteps,
  onCompleteStep,
  onExecuteStepAction,
  audienceLevel,
}) => {
  const currentStep = steps.find((s) => s.id === currentStepId) || steps[0];
  const isCompleted = completedSteps.includes(currentStep.id);
  const isLastStep = currentStep.id === steps.length;
  const allCompleted = completedSteps.length === steps.length;

  const handleNextStep = () => {
    if (!isCompleted) {
      onCompleteStep(currentStep.id);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
      });
    }

    if (!isLastStep) {
      setCurrentStepId(currentStep.id + 1);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col h-full shadow-xs relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-blue-200/60">
          <BookOpen className="w-3 h-3" />
          Task Guide Step {currentStep.id} of {steps.length}
        </span>
        <span className="text-xs text-slate-400 font-medium">
          ~{currentStep.estimatedMinutes} min
        </span>
      </div>

      {/* Step Selector Pills */}
      <div className="flex items-center gap-1 mb-5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 overflow-x-auto">
        {steps.map((step) => {
          const done = completedSteps.includes(step.id);
          const active = step.id === currentStepId;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStepId(step.id)}
              className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                active
                  ? 'bg-blue-600 text-white shadow-xs'
                  : done
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'text-slate-500 hover:bg-slate-200/60'
              }`}
              title={step.title}
            >
              {done ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <span>{step.id}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Title & Subtitle */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 leading-snug mb-1">
          {currentStep.title}
        </h2>
        <p className="text-slate-600 text-xs leading-relaxed">
          {currentStep.subtitle}
        </p>
      </div>

      {/* Audience-Specific Key Concepts */}
      <div className="space-y-2.5 mb-5 overflow-y-auto max-h-48 pr-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          <span>Key Concepts ({audienceLevel === 'beginner' ? 'Simple Analogy' : 'Technical Specs'})</span>
        </div>

        {currentStep.keyConcepts.map((concept, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 space-y-0.5 hover:border-slate-300 transition-all"
          >
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              {concept.term}
            </div>
            <p className="text-slate-600 pl-3 leading-normal">
              {concept.explanation}
            </p>
          </div>
        ))}
      </div>

      {/* Task Prompt Box */}
      <div className="mt-auto pt-3 border-t border-slate-100">
        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200/80 mb-4 relative">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-900 mb-0.5">Current Objective</h4>
              <p className="text-xs text-blue-800 leading-relaxed font-medium">
                {currentStep.taskDescription}
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onExecuteStepAction(currentStep.id)}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Try Task Now</span>
            </button>
            {!isCompleted && (
              <button
                onClick={() => onCompleteStep(currentStep.id)}
                className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium rounded-lg transition-all"
              >
                Mark Done
              </button>
            )}
          </div>
        </div>

        {/* Completion & Next Button */}
        <button
          onClick={handleNextStep}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
            isCompleted
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
              : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200'
          }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Step Completed! {isLastStep ? '🎉 Finish Tutorial' : 'Continue →'}</span>
            </>
          ) : (
            <>
              <span>Complete & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {allCompleted && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-900 font-semibold flex items-center justify-center gap-2">
            <Award className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Congratulations! You mastered Local Search & Knowledge Graph!</span>
          </div>
        )}
      </div>
    </div>
  );
};
