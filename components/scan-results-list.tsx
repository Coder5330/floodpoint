"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
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
        <p className="text-xs text-muted-foreground/70 mt-1">
          Start a scan to search for live sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      {results.map((result) => {
        const isCopied = copiedCode === result.code;

        return (
          <div
            key={result.code}
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="space-y-1">
              <span className="text-2xl font-mono font-bold tracking-tight text-foreground block">
                {result.code}
              </span>
              
              <div className="text-sm text-muted-foreground font-mono">
                {result.teacherName ? (
                  <span>{result.teacherName} ({result.email})</span>
                ) : (
                  <span>{result.email}</span>
                )}
              </div>
            </div>

            <button
              onClick={() => handleCopy(result.code)}
              className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground hover:text-foreground"
              title="Copy Class Code"
              aria-label="Copy class code"
            >
              {isCopied ? (
                <Check className="h-5 w-5 text-emerald-500" />
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
