"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Volume2 } from "lucide-react"
import TalkingAvatar from "./TalkingAvatar"
import { tutorRequest, type Language, type QuizItem, type Slide } from "./types"

type Difficulty = "recall" | "standard" | "application"

export default function TeachingSlide({ slide, language, difficulty, onScore }: {
  slide: Slide
  language: Language
  difficulty: Difficulty
  onScore: (score: number) => void
}) {
  const [audioUrl, setAudioUrl] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [busy, setBusy] = useState<"narration" | "question" | "quiz" | null>(null)
  const [error, setError] = useState("")
  const [question, setQuestion] = useState("")
  const [exchanges, setExchanges] = useState<{ question: string; answer: string }[]>([])
  const [quiz, setQuiz] = useState<QuizItem[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const audio = useRef<HTMLAudioElement>(null)
  const audioObject = useRef("")
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => {
    activeRequest.current?.abort()
    if (audioObject.current) URL.revokeObjectURL(audioObject.current)
  }, [])

  useEffect(() => {
    const player = audio.current
    return () => player?.pause()
  }, [audioUrl])

  async function run(action: "narration" | "question" | "quiz", work: (signal: AbortSignal) => Promise<void>) {
    if (activeRequest.current) return
    const controller = new AbortController()
    activeRequest.current = controller
    setBusy(action)
    setError("")
    try {
      await work(controller.signal)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "The Tutor couldn’t complete this request.")
      }
    } finally {
      activeRequest.current = null
      if (!controller.signal.aborted) setBusy(null)
    }
  }

  function startNarration() {
    void run("narration", async (signal) => {
      const response = await tutorRequest("narration", { text: slide.narration, language }, signal)
      const clip = await response.blob()
      if (signal.aborted) return
      audioObject.current = URL.createObjectURL(clip)
      setAudioUrl(audioObject.current)
    })
  }

  function askTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const asked = question.trim()
    if (!asked) return
    audio.current?.pause()
    void run("question", async (signal) => {
      const response = await tutorRequest("question", { slide, language, question: asked }, signal)
      const { answer } = await response.json()
      if (signal.aborted) return
      setExchanges((current) => [...current, { question: asked, answer }])
      setQuestion("")
    })
  }

  function startQuiz() {
    audio.current?.pause()
    void run("quiz", async (signal) => {
      const response = await tutorRequest("quiz", { slide, language, difficulty }, signal)
      const { items } = await response.json()
      if (signal.aborted) return
      setQuiz(items)
      setAnswers({})
    })
  }

  function chooseAnswer(index: number, option: number) {
    if (answers[index] !== undefined) return
    const next = { ...answers, [index]: option }
    setAnswers(next)
    if (Object.keys(next).length === quiz.length) {
      onScore(quiz.filter((item, questionIndex) => next[questionIndex] === item.correct_index).length / quiz.length)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <article className="space-y-5 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm sm:p-9">
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">{slide.title}</h2>
        <ul className="list-disc space-y-4 pl-5 text-base leading-7 text-slate-700 marker:text-indigo-600">
          {slide.points.map((point, index) => <li key={index}>{point}</li>)}
        </ul>
        {slide.example && (
          <div className="rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
            <h3 className="mb-1 font-semibold">Example</h3>
            <p>{slide.example}</p>
          </div>
        )}
      </article>

      <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <TalkingAvatar isPlaying={isPlaying} size={68} />
          <div>
            <h3 className="font-semibold text-slate-950">AI Teacher</h3>
            <p className="text-sm text-slate-600">{isPlaying ? "Teaching this slide" : "Ready to explain"}</p>
          </div>
        </div>
        {audioUrl ? (
          <audio
            ref={audio}
            src={audioUrl}
            controls
            autoPlay
            className="w-full"
            aria-label="Slide narration"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => {
              setIsPlaying(false)
              URL.revokeObjectURL(audioObject.current)
              audioObject.current = ""
              setAudioUrl("")
              setError("Narration playback failed. Try again or read the transcript.")
            }}
          />
        ) : (
          <button type="button" onClick={startNarration} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Volume2 size={16} /> {busy === "narration" ? "Preparing voice…" : "Play teacher narration"}
          </button>
        )}
        <details className="text-sm text-slate-700">
          <summary className="cursor-pointer font-medium">Narration transcript</summary>
          <p className="mt-2 whitespace-pre-wrap leading-6">{slide.narration}</p>
        </details>
      </aside>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-950">Ask the teacher</h3>
        <div aria-live="polite" className="space-y-3">
          {exchanges.map((exchange, index) => (
            <div key={index} className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              <p className="font-medium">{exchange.question}</p>
              <p className="mt-1 whitespace-pre-wrap">{exchange.answer}</p>
            </div>
          ))}
        </div>
        <form onSubmit={askTeacher} className="flex flex-wrap items-start gap-2">
          <label htmlFor="teacher-question" className="sr-only">Question about this slide</label>
          <input id="teacher-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="Ask a question about this slide" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={!question.trim() || busy !== null} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "question" ? "Asking…" : "Ask"}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-950">Check your understanding</h3>
        {quiz.length === 0 ? (
          <button type="button" onClick={startQuiz} disabled={busy !== null} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-50">
            {busy === "quiz" ? "Preparing quiz…" : "Start quiz"}
          </button>
        ) : quiz.map((item, index) => {
          const selected = answers[index]
          return (
            <fieldset key={index} className="space-y-2 text-sm">
              <legend className="mb-2 font-medium text-slate-950">{item.question}</legend>
              {item.options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-slate-700">
                  <input type="radio" name={`question-${index}`} checked={selected === optionIndex} disabled={selected !== undefined} onChange={() => chooseAnswer(index, optionIndex)} className="mt-1" />
                  {option}
                </label>
              ))}
              {selected !== undefined && (
                <p role="status" className="text-sm text-slate-700">
                  {selected === item.correct_index ? "Correct. " : `Correct answer: ${item.options[item.correct_index]}. `}
                  {item.explanation}
                </p>
              )}
            </fieldset>
          )
        })}
      </section>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 lg:col-span-2">{error}</p>}
    </div>
  )
}
