import Link from "next/link";

/** Shared loading placeholder for student quiz routes. */
export function QuizLoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

/** Inline banner for errors during an active attempt (keeps question UI visible). */
export function QuizErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Shared error + retry UI for student quiz routes. */
export function QuizErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-red-100 bg-red-50 p-4 text-center sm:p-6">
      <p className="text-sm text-red-700">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        ) : null}
        <Link
          href="/student/quizzes"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to quizzes
        </Link>
      </div>
    </div>
  );
}
