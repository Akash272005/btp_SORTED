"use client";

/** Link from question papers to Smart Solver with the question pre-filled. */

import Link from "next/link";
import { Calculator } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildSolverQuestionUrl } from "@/lib/solverLinks";

interface SolverPaperHelpLinkProps {
  question: string;
  className?: string;
}

export default function SolverPaperHelpLink({
  question,
  className = "",
}: SolverPaperHelpLinkProps) {
  const { t } = useTranslation();
  const trimmed = question.trim();
  if (!trimmed) return null;

  return (
    <Link
      href={buildSolverQuestionUrl(trimmed)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 ${className}`}
    >
      <Calculator className="h-3.5 w-3.5" />
      {t("solver.paper_get_help")}
    </Link>
  );
}
