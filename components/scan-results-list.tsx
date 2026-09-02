"use client";

import { useState } from "react";
import { Copy, Check, GraduationCap } from "lucide-react";
import type { ValidClassCode } from "@/src/types";

interface ScanResultsListProps {
  results: ValidClassCode[];
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
]);

function getDomainDisplay(email: string): string {
  if (!email || !email.includes("@")) return "UNKNOWN";
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return "UNKNOWN";
  if (PERSONAL_DOMAINS.has(domain)) return "Personal Account";
  return domain.toUpperCase();
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
        const domainText = getDomainDisplay(result.email);
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

              <div className="flex items-center gap-2 text-xs font-semibold text-[#3B82F6]">
                <GraduationCap className="h-4 w-4 shrink-0" />
                <span className="tracking-wide">{domainText}</span>
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
