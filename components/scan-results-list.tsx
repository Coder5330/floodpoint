"use client";

import { useState } from "react";
import { Copy, Check, GraduationCap, User } from "lucide-react";
import type { ValidClassCode } from "@/src/types";

interface ScanResultsListProps {
  results: ValidClassCode[];
}

const KNOWN_DOMAINS: Record<string, string> = {
  "mfu.ac.th": "Mae Fah Luang University",
  "moe.edu.sg": "Ministry of Education (Singapore)",
  "nus.edu.sg": "National University of Singapore",
  "ntu.edu.sg": "Nanyang Technological University",
};

function resolveSchoolName(email: string, school?: string): string {
  if (school && school.trim() !== "") return school.trim();
  if (!email || !email.includes("@")) return "Unknown Institution";

  const domain = email.split("@")[1].toLowerCase();
  if (["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domain)) {
    return "Personal Account";
  }

  return KNOWN_DOMAINS[domain] || domain.toUpperCase();
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
        const schoolName = resolveSchoolName(result.email, result.school);
        const isCopied = copiedCode === result.code;

        return (
          <div
            key={result.code}
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="space-y-1.5">
              <span className="text-2xl font-mono font-bold tracking-tight text-foreground block">
                {result.code}
              </span>

              {result.teacherName && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{result.teacherName}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span className="text-blue-400 font-medium">{schoolName}</span>
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
