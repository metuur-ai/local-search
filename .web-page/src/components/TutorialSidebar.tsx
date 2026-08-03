import React from 'react';
import { AudienceLevel, TutorialStep } from '../types';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Play,
  Lightbulb,
  Award,
  BookOpen,
  PartyPopper,
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
    <div className="bg-white rounded-card border border-rule p-5 flex flex-col h-full shadow-2xs relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-info-soft text-info-ink text-[11px] font-bold uppercase tracking-wider rounded-input border border-info/25">
          <BookOpen className="w-3 h-3" aria-hidden="true" />
          Task Guide Step {currentStep.id} of {steps.length}
        </span>
        <span className="text-xs text-ink-3 font-medium">
          ~{currentStep.estimatedMinutes} min
        </span>
      </div>

      {/* Step Selector Pills. Colour never carries the state alone: the done
          icon and the current-step underline both hold without it. */}
      <div className="flex items-center gap-1 mb-5 bg-paper-2 p-1.5 rounded-input border border-rule overflow-x-auto">
        {steps.map((step) => {
          const done = completedSteps.includes(step.id);
          const active = step.id === currentStepId;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStepId(step.id)}
              aria-label={step.title}
              aria-current={active ? 'step' : undefined}
              className={`flex-1 py-1 px-2 rounded-input text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                active
                  ? 'bg-accent text-accent-contrast shadow-2xs'
                  : done
                  ? 'bg-accent-soft text-accent-ink hover:bg-accent-soft/70'
                  : 'text-ink-3 hover:bg-paper-3'
              }`}
              title={step.title}
            >
              {done ? (
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              ) : active ? (
                <span>{step.id}</span>
              ) : (
                <Circle className="w-3 h-3" aria-hidden="true" />
              )}
              {/* Non-colour marker for the current step, so state doesn't
                  depend on the accent fill alone. */}
              <span
                aria-hidden="true"
                className={`w-1 h-1 rounded-pill ${active ? 'bg-accent-contrast' : 'bg-transparent'}`}
              />
            </button>
          );
        })}
      </div>

      {/* Title & Subtitle */}
      <div className="mb-4">
        <h2 className="text-lg font-display font-semibold text-ink leading-snug mb-1">
          {currentStep.title}
        </h2>
        <p className="text-ink-2 text-sm leading-relaxed">
          {currentStep.subtitle}
        </p>
      </div>

      {/* Audience-Specific Key Concepts */}
      <div className="space-y-2.5 mb-5 overflow-y-auto max-h-48 pr-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 mb-1">
          <Lightbulb className="w-3.5 h-3.5 text-warn" aria-hidden="true" />
          <span>Key Concepts ({audienceLevel === 'beginner' ? 'Simple Analogy' : 'Technical Specs'})</span>
        </div>

        {currentStep.keyConcepts.map((concept, idx) => (
          <div
            key={idx}
            className="p-3 rounded-card bg-paper-2 border border-rule text-sm text-ink-2 space-y-0.5 hover:border-rule-strong transition-all"
          >
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-pill bg-accent shrink-0" aria-hidden="true"></span>
              {concept.term}
            </div>
            <p className="text-ink-2 pl-3 leading-normal">
              {concept.explanation}
            </p>
          </div>
        ))}
      </div>

      {/* Task Prompt Box */}
      <div className="mt-auto pt-3 border-t border-rule">
        <div className="p-3.5 rounded-card bg-accent-soft border border-accent/25 mb-4 relative">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 bg-accent text-accent-contrast rounded-input flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <Zap className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-accent-ink mb-0.5">Current Objective</h4>
              <p className="text-sm text-accent-ink leading-relaxed font-medium">
                {currentStep.taskDescription}
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onExecuteStepAction(currentStep.id)}
              className="flex-1 min-h-11 py-2 px-3 bg-accent hover:bg-accent-ink text-accent-contrast text-sm font-semibold rounded-input shadow-2xs flex items-center justify-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Try Task Now</span>
            </button>
            {!isCompleted && (
              <button
                onClick={() => onCompleteStep(currentStep.id)}
                className="min-h-11 py-2 px-3 bg-white hover:bg-paper-2 text-ink-2 border border-rule-strong text-sm font-medium rounded-input transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                Mark Done
              </button>
            )}
          </div>
        </div>

        {/* Completion & Next Button */}
        <button
          onClick={handleNextStep}
          className={`w-full min-h-11 py-3 px-4 rounded-input font-bold text-sm shadow-2xs transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
            isCompleted
              ? 'bg-accent hover:bg-accent-ink text-accent-contrast'
              : 'bg-ink hover:bg-ink-2 text-white'
          }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              {isLastStep ? (
                <span className="inline-flex items-center gap-1.5">
                  Step Completed! <PartyPopper className="w-4 h-4" aria-hidden="true" /> Finish Tutorial
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  Step Completed! Continue <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              )}
            </>
          ) : (
            <>
              <span>Complete & Continue</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>

        {allCompleted && (
          <div className="mt-3 p-3 bg-warn-soft border border-warn/25 rounded-card text-center text-sm text-warn-ink font-semibold flex items-center justify-center gap-2">
            <Award className="w-4 h-4 text-warn shrink-0" aria-hidden="true" />
            <span>Congratulations! You mastered Local Search & Knowledge Graph!</span>
          </div>
        )}
      </div>
    </div>
  );
};
