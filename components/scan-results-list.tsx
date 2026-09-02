"use client";

import { useState } from "react";
import { Copy, Check, User } from "lucide-react";
import type { ValidClassCode } from "@/src/types";

interface ScanResultsListProps {
  results: ValidClassCode[];
}

export function ScanResultsList({ results }: ScanResultsListProps) {
  const [copiedCode, setCopiedCode] = useState<number | null>(null);

  const handleCopy = (code: number) => {
    navigator.clipboard.writeText(code.toString());
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
        <p className="text-sm">No active class codes discovered yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-[#0B0F17] text-white shadow-sm overflow-hidden">
      {results.map((result) => {
        // Display extracted teacher name, or fallback to full email
        const teacherDisplay = result.teacherName || result.email || "Unknown Teacher";
        const isCopied = copiedCode === result.code;

        return (
          <div
            key={result.code}
            className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/[0.02]"
          >
            <div className="space-y-1">
              <span className="text-2xl font-bold tracking-tight text-white block font-mono">
                {result.code}
              </span>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <User className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="tracking-wide text-slate-300 font-medium">
                  {teacherDisplay}
                </span>
              </div>
            </div>

            <button
              onClick={() => handleCopy(result.code)}
              className="p-2 text-slate-400 hover:text-white transition-colors rounded-md"
              title="Copy Class Code"
              aria-label="Copy class code"
            >
              {isCopied ? (
                <Check className="h-5 w-5 text-emerald-400" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
