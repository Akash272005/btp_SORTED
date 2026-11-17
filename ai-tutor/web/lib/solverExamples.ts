import type { SolverInputMode } from "@/components/solver/types";

/** Example prompts shown on the empty AiChat tab (K-12 vs college). */

const COLLEGE_EXAMPLES = [
  "solver.example_convolution",
  "solver.example_backprop",
  "solver.example_diffeq",
] as const;

const DEFAULT_STUDENT_EXAMPLES = [
  "solver.example_train_speed",
  "solver.example_balance",
  "solver.example_circle_area",
] as const;

const SUBJECT_EXAMPLE_KEYS: Record<string, readonly string[]> = {
  mathematics: [
    "solver.example_circle_area",
    "solver.example_pythagoras",
    "solver.example_train_speed",
  ],
  science: [
    "solver.example_balance",
    "solver.example_photosynthesis",
    "solver.example_train_speed",
  ],
  physics: [
    "solver.example_train_speed",
    "solver.example_newton",
    "solver.example_circle_area",
  ],
  chemistry: [
    "solver.example_balance",
    "solver.example_moles",
    "solver.example_acid_base",
  ],
  biology: [
    "solver.example_photosynthesis",
    "solver.example_cell",
    "solver.example_train_speed",
  ],
  english: [
    "solver.example_grammar",
    "solver.example_essay",
    "solver.example_train_speed",
  ],
  hindi: [
    "solver.example_hindi_grammar",
    "solver.example_essay",
    "solver.example_train_speed",
  ],
  history: [
    "solver.example_history",
    "solver.example_train_speed",
    "solver.example_circle_area",
  ],
  geography: [
    "solver.example_geography",
    "solver.example_train_speed",
    "solver.example_circle_area",
  ],
  civics: [
    "solver.example_civics",
    "solver.example_train_speed",
    "solver.example_history",
  ],
  economics: [
    "solver.example_economics",
    "solver.example_train_speed",
    "solver.example_circle_area",
  ],
};

export function getSolverExampleQuestions(
  studentMode: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
  subject = "science",
  _classLevel = "10",
): string[] {
  if (!studentMode) {
    return COLLEGE_EXAMPLES.map((key) => t(key));
  }

  const keys =
    SUBJECT_EXAMPLE_KEYS[subject] ?? DEFAULT_STUDENT_EXAMPLES;
  return keys.slice(0, 3).map((key) => t(key));
}

export function defaultSolverInputMode(
  isStudentPortal: boolean,
): SolverInputMode {
  // Students land on Upload Photo; pass true everywhere for the same UX.
  return isStudentPortal ? "upload" : "type";
}
