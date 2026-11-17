export type Language = "en" | "hi"

export type Chapter = {
  id: string
  grade: number
  subject: string
  medium: string
  title: string
  number: number
}

export type Slide = {
  title: string
  points: string[]
  example: string
  narration: string
}

export type Lesson = { title: string; slides: Slide[] }

export type QuizItem = {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export async function tutorRequest(action: string, payload?: object, signal?: AbortSignal) {
  const response = await fetch(`/api/avatar-learning/${action}`, {
    signal,
    ...(payload && {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || "The Tutor couldn’t complete this request.")
  }
  return response
}
