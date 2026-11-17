"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"
import TeachingSlide from "./TeachingSlide"
import { tutorRequest, type Chapter, type Language, type Lesson } from "./types"

const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"

export default function AvatarLearning({ backHref }: { backHref: string }) {
  const [source, setSource] = useState<"chapter" | "notes">("chapter")
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState("")
  const [grade, setGrade] = useState("")
  const [subject, setSubject] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [title, setTitle] = useState("")
  const [material, setMaterial] = useState("")
  const [language, setLanguage] = useState<Language>("en")
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [results, setResults] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    tutorRequest("chapters", undefined, controller.signal)
      .then((response) => response.json())
      .then((items: Chapter[]) => setChapters(items))
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogError("The NCERT catalog is unavailable. You can choose Lesson notes instead.")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })
    return () => controller.abort()
  }, [])

  const grades = [...new Set(chapters.map((chapter) => chapter.grade))].sort((a, b) => a - b)
  const gradeChapters = chapters.filter((chapter) => String(chapter.grade) === grade)
  const subjects = [...new Set(gradeChapters.map((chapter) => chapter.subject))]
  const subjectChapters = gradeChapters.filter((chapter) => chapter.subject === subject)
  const lastScore = results[slideIndex - 1]
  const difficulty = lastScore === undefined ? "standard" : lastScore === 1 ? "application" : "recall"

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const payload = source === "chapter"
        ? { chapter_id: chapterId, language }
        : { title: title.trim(), material: material.trim(), language }
      const response = await tutorRequest("lesson", payload)
      const nextLesson: Lesson = await response.json()
      setLesson(nextLesson)
      setSlideIndex(0)
      setResults({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The teacher couldn’t prepare the lesson.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-700">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>

        {lesson ? (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-indigo-700">AI PPT Learning</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{lesson.title}</h1>
              </div>
              <button type="button" onClick={() => setLesson(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">
                New lesson
              </button>
            </header>
            <nav aria-label="Lesson slides" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <button type="button" disabled={slideIndex === 0} onClick={() => setSlideIndex((index) => index - 1)} className="inline-flex items-center gap-1 px-2 py-1 text-sm font-semibold text-indigo-800 disabled:opacity-40">
                <ChevronLeft size={18} /> Previous
              </button>
              <p role="status" className="text-sm text-slate-600">Slide {slideIndex + 1} of {lesson.slides.length}</p>
              <button type="button" disabled={slideIndex === lesson.slides.length - 1} onClick={() => setSlideIndex((index) => index + 1)} className="inline-flex items-center gap-1 px-2 py-1 text-sm font-semibold text-indigo-800 disabled:opacity-40">
                Next <ChevronRight size={18} />
              </button>
            </nav>
            <TeachingSlide
              key={slideIndex}
              slide={lesson.slides[slideIndex]}
              language={language}
              difficulty={difficulty}
              onScore={(score) => setResults((current) => ({ ...current, [slideIndex]: score }))}
            />
            {slideIndex === lesson.slides.length - 1 && (
              <p className="text-center text-sm text-slate-600">Last slide · {Object.keys(results).length} of {lesson.slides.length} slide quizzes completed</p>
            )}
          </>
        ) : (
          <>
            <header className="rounded-3xl bg-gradient-to-br from-indigo-800 to-violet-700 p-7 text-white md:p-10">
              <h1 className="text-3xl font-bold md:text-4xl">AI PPT Learning</h1>
              <p className="mt-3 max-w-xl text-indigo-100">Pick a chapter or add your lesson notes. The AI teacher will explain each slide, answer questions, and quiz you as you go.</p>
            </header>
            <form onSubmit={createLesson} className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Lesson source
                  <select className={inputClass} value={source} disabled={busy} onChange={(event) => { setSource(event.target.value as typeof source); setError("") }}>
                    <option value="chapter">NCERT chapter</option>
                    <option value="notes">Lesson notes</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Teaching language
                  <select className={inputClass} value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value as Language)}>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                  </select>
                </label>
              </div>

              {source === "chapter" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Class
                    <select className={inputClass} value={grade} disabled={busy || catalogLoading} required onChange={(event) => { setGrade(event.target.value); setSubject(""); setChapterId("") }}>
                      <option value="">{catalogLoading ? "Loading classes…" : "Select a class"}</option>
                      {grades.map((grade) => <option key={grade} value={grade}>Class {grade}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Subject
                    <select className={inputClass} value={subject} disabled={busy || !grade} required onChange={(event) => { setSubject(event.target.value); setChapterId("") }}>
                      <option value="">Select a subject</option>
                      {subjects.map((subject) => <option key={subject} value={subject}>{subject.replaceAll("-", " ")}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Chapter
                    <select className={inputClass} value={chapterId} disabled={busy || !subject} required onChange={(event) => setChapterId(event.target.value)}>
                      <option value="">Select a chapter</option>
                      {subjectChapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title} ({chapter.medium})</option>
                      ))}
                    </select>
                  </label>
                  {catalogError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{catalogError}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold">
                    Lesson title
                    <input className={inputClass} required maxLength={180} value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className="block text-sm font-semibold">
                    Lesson notes
                    <textarea className={inputClass} rows={7} required minLength={50} maxLength={24000} value={material} disabled={busy} onChange={(event) => setMaterial(event.target.value)} />
                  </label>
                </div>
              )}

              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy || (source === "chapter" && !chapterId)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
                {busy && <LoaderCircle size={18} className="animate-spin" />}
                {busy ? "Preparing your lesson…" : "Start AI lesson"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
