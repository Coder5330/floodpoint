"use client";

import { useState } from "react";
import { Send, HelpCircle, CheckCircle2 } from "lucide-react";
import type { ClassActivity } from "@/src/types";

interface ActivityAnswerCardProps {
  activity: ClassActivity | null;
  onSubmitAnswer: (activityId: string, answer: string) => Promise<void>;
}

export function ActivityAnswerCard({ activity, onSubmitAnswer }: ActivityAnswerCardProps) {
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [textInput, setTextInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  if (!activity || !activity.isLive) {
    return (
      <div className="p-6 text-center text-slate-400 border border-white/10 rounded-xl bg-[#0B0F17]">
        <HelpCircle className="h-8 w-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm">No active question at the moment. Waiting for host...</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    const finalAnswer = activity.activityType === "MultipleChoice" ? selectedOption : textInput;
    if (!finalAnswer.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmitAnswer(activity.activityId, finalAnswer);
      setHasSubmitted(true);
    } catch (err) {
      console.error("Failed to submit response:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 rounded-xl border border-white/10 bg-[#0B0F17] text-white space-y-5 shadow-lg">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          {activity.activityType}
        </span>
        {hasSubmitted && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Submitted
          </span>
        )}
      </div>

      {activity.questionText && (
        <h3 className="text-lg font-medium text-slate-100">{activity.questionText}</h3>
      )}

      {activity.activityType === "MultipleChoice" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(activity.options || ["A", "B", "C", "D"]).map((optionText, idx) => {
            const optionKey = String.fromCharCode(65 + idx);
            const isSelected = selectedOption === optionKey;

            return (
              <button
                key={optionKey}
                onClick={() => {
                  setSelectedOption(optionKey);
                  setHasSubmitted(false);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all font-medium ${
                  isSelected
                    ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-500/10"
                    : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                <span
                  className={`flex items-center justify-center h-7 w-7 rounded-md text-xs font-bold ${
                    isSelected ? "bg-blue-500 text-white" : "bg-white/10 text-slate-400"
                  }`}
                >
                  {optionKey}
                </span>
                <span className="text-sm">{optionText}</span>
              </button>
            );
          })}
        </div>
      )}

      {(activity.activityType === "ShortAnswer" || activity.activityType === "WordCloud") && (
        <div>
          <textarea
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value);
              setHasSubmitted(false);
            }}
            placeholder="Type your answer here..."
            className="w-full h-28 p-3 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors text-sm resize-none"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
          (activity.activityType === "MultipleChoice" ? !selectedOption : !textInput.trim())
        }
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-600/20"
      >
        <Send className="h-4 w-4" />
        {isSubmitting ? "Submitting..." : hasSubmitted ? "Resubmit Answer" : "Submit Answer"}
      </button>
    </div>
  );
}
