"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import QuizResultView from "@/components/lms/student/QuizResultView";
import {
  QuizErrorState,
  QuizLoadingState,
} from "@/components/lms/student/QuizPageStates";
import { loadQuizResult } from "@/lib/quizResultStorage";
import {
  fetchAssignmentResult,
  fetchStudentAssignment,
  type AssignmentItem,
  type AssignmentResult,
} from "@/services/lmsApi";

/**
 * Post-submit result page — prefers API (persistent), falls back to session cache.
 */
export default function QuizResultPage() {
  const params = useParams();
  const assignmentId = String(params.assignmentId ?? "");

  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [assignment, setAssignment] = useState<AssignmentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [apiResult, detail] = await Promise.all([
          fetchAssignmentResult(assignmentId).catch(() => null),
          fetchStudentAssignment(assignmentId).catch(() => null),
        ]);

        if (cancelled) return;

        if (detail) setAssignment(detail.assignment);

        if (apiResult && apiResult.attempt_id) {
          setResult(apiResult);
          setLoading(false);
          return;
        }

        // Fallback right after submit before navigating away from session cache.
        const cached = loadQuizResult(assignmentId);
        if (cached) {
          setResult({
            assignment_id: assignmentId,
            title: cached.title,
            attempt_id: cached.attempt_id,
            score: cached.score,
            max_score: cached.max_score,
            percentage: cached.percentage,
            feedback: cached.feedback,
            answers: [],
            questions: Object.entries(cached.feedback).map(([id, fb]) => ({
              id,
              feedback: fb,
            })),
            attempt_number: 1,
            time_taken_mins: null,
          });
          setLoading(false);
          return;
        }

        setError("No result found. Complete the quiz first.");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load result");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  return (
    <ProtectedRoute roles={["student"]}>
      <div className="min-h-full bg-[#F9FAFB]">
        <div className="mx-auto max-w-[640px] px-6 py-6 lg:px-8 lg:py-8">
          {loading ? <QuizLoadingState label="Loading result…" /> : null}
          {!loading && error && !result ? (
            <QuizErrorState message={error} />
          ) : null}
          {!loading && result ? (
            <QuizResultView result={result} assignment={assignment} />
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
