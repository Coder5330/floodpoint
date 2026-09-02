"use client";

import { useState } from "react";
import { Copy, Check, GraduationCap, Mail } from "lucide-react";
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

  const getOrganization = (email: string, school?: string) => {
    if (school && school.trim() !== "") return school;
    if (!email) return "Unknown";

    const domain = email.split("@")[1];
    if (!domain) return "Unknown";

    if (["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domain.toLowerCase())) {
      return "Personal Account";
    }

    return domain;
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
        const orgName = getOrganization(result.email, result.school);
        const isCopied = copiedCode === result.code;

        return (
          <div
            key={result.code}
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-bold tracking-tight text-foreground">
                  {result.code}
                </span>
                {orgName !== "Personal Account" && orgName !== "Unknown" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
                    <GraduationCap className="h-3 w-3" />
                    {orgName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="font-mono text-xs">{result.email}</span>
              </div>
            </div>

            <button
              onClick={() => handleCopy(result.code)}
              className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground hover:text-foreground"
              title="Copy Class Code"
              aria-label="Copy class code"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
