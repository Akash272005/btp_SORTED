import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
} from "@/lib/persistence";
import { debounce } from "@/lib/debounce";
import type { StepQuizScore } from "../types";

export type GuideQuizUiPayload = {
  selectedAnswers: (number | null)[];
  quizSubmitted: boolean;
};

type PersistedShape = {
  session_id: string;
  attempted: number[];
  scores: Record<string, StepQuizScore>;
  quiz_ui?: Record<string, GuideQuizUiPayload>;
};

function normalizeScores(
  raw: Record<string, StepQuizScore>,
): Record<number, StepQuizScore> {
  const out: Record<number, StepQuizScore> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(k);
    if (!Number.isFinite(n)) continue;
    out[n] = v;
  }
  return out;
}

function normalizeQuizUi(
  raw: Record<string, GuideQuizUiPayload> | undefined,
): Record<number, GuideQuizUiPayload> {
  const out: Record<number, GuideQuizUiPayload> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(k);
    if (!Number.isFinite(n) || !Array.isArray(v?.selectedAnswers)) continue;
    out[n] = {
      selectedAnswers: [...v.selectedAnswers],
      quizSubmitted: Boolean(v.quizSubmitted),
    };
  }
  return out;
}

function quizUiPayloadEqual(
  a: GuideQuizUiPayload | undefined,
  b: GuideQuizUiPayload,
): boolean {
  if (!a) return false;
  if (a.quizSubmitted !== b.quizSubmitted) return false;
  if (a.selectedAnswers.length !== b.selectedAnswers.length) return false;
  return a.selectedAnswers.every((v, i) => Object.is(v, b.selectedAnswers[i]));
}

/**
 * Persists per-step quiz attempts and scores for the current guided session (localStorage).
 */
export function useGuideStepProgress(sessionId: string | null) {
  const [attempted, setAttempted] = useState<number[]>([]);
  const [scores, setScores] = useState<Record<number, StepQuizScore>>({});
  const [quizUiByStep, setQuizUiByStep] = useState<
    Record<number, GuideQuizUiPayload>
  >({});
  const [hydrated, setHydrated] = useState(false);
  const persistInitialized = useRef(false);

  useEffect(() => {
    persistInitialized.current = false;
    setHydrated(false);
    if (typeof window === "undefined") return;

    if (!sessionId) {
      setAttempted([]);
      setScores({});
      setQuizUiByStep({});
      setHydrated(true);
      return;
    }

    const raw = loadFromStorage<PersistedShape | null>(
      STORAGE_KEYS.GUIDE_STEP_PROGRESS,
      null,
    );

    if (raw && raw.session_id === sessionId) {
      setAttempted([...(raw.attempted || [])].sort((a, b) => a - b));
      setScores(normalizeScores(raw.scores || {}));
      setQuizUiByStep(normalizeQuizUi(raw.quiz_ui));
    } else {
      setAttempted([]);
      setScores({});
      setQuizUiByStep({});
    }

    setHydrated(true);
  }, [sessionId]);

  const persistDebounced = useMemo(
    () =>
      debounce((payload: PersistedShape) => {
        saveToStorage(STORAGE_KEYS.GUIDE_STEP_PROGRESS, payload);
      }, 450),
    [],
  );

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    if (!persistInitialized.current) {
      persistInitialized.current = true;
      return;
    }

    const scoresOut: Record<string, StepQuizScore> = {};
    for (const [k, v] of Object.entries(scores)) {
      scoresOut[String(k)] = v;
    }

    const quizUiOut: Record<string, GuideQuizUiPayload> = {};
    for (const [k, v] of Object.entries(quizUiByStep)) {
      quizUiOut[String(k)] = v;
    }

    persistDebounced({
      session_id: sessionId,
      attempted: [...attempted].sort((a, b) => a - b),
      scores: scoresOut,
      quiz_ui: quizUiOut,
    });
  }, [hydrated, sessionId, attempted, scores, quizUiByStep, persistDebounced]);

  const attemptedSet = useMemo(() => new Set(attempted), [attempted]);

  const setAttemptedForStep = useCallback(
    (stepIndex: number, attemptedFlag: boolean) => {
      setAttempted((prev) => {
        const next = new Set(prev);
        if (attemptedFlag) next.add(stepIndex);
        else next.delete(stepIndex);
        return [...next].sort((a, b) => a - b);
      });
      if (!attemptedFlag) {
        setScores((prev) => {
          if (!(stepIndex in prev)) return prev;
          const copy = { ...prev };
          delete copy[stepIndex];
          return copy;
        });
        setQuizUiByStep((prev) => {
          if (!(stepIndex in prev)) return prev;
          const copy = { ...prev };
          delete copy[stepIndex];
          return copy;
        });
      }
    },
    [],
  );

  const mergeQuizUiStep = useCallback(
    (stepIndex: number, payload: GuideQuizUiPayload) => {
      const snapshot: GuideQuizUiPayload = {
        selectedAnswers: [...payload.selectedAnswers],
        quizSubmitted: payload.quizSubmitted,
      };
      setQuizUiByStep((prev) => {
        const cur = prev[stepIndex];
        if (quizUiPayloadEqual(cur, snapshot)) return prev;
        return { ...prev, [stepIndex]: snapshot };
      });
    },
    [],
  );

  const recordQuizScore = useCallback(
    (stepIndex: number, score: StepQuizScore) => {
      setScores((prev) => ({ ...prev, [stepIndex]: score }));
      setAttempted((prev) =>
        prev.includes(stepIndex)
          ? prev
          : [...prev, stepIndex].sort((a, b) => a - b),
      );
    },
    [],
  );

  const clearProgress = useCallback(() => {
    setAttempted([]);
    setScores({});
    persistInitialized.current = false;
    saveToStorage(STORAGE_KEYS.GUIDE_STEP_PROGRESS, {
      session_id: "",
      attempted: [],
      scores: {},
      quiz_ui: {},
    });
    setQuizUiByStep({});
  }, [persistDebounced]);

  return {
    attemptedSet,
    scoresByStep: scores,
    quizUiByStep,
    mergeQuizUiStep,
    setAttemptedForStep,
    recordQuizScore,
    clearProgress,
  };
}
