"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import { ArrowLeft, Bot, Sparkles } from "lucide-react"
import Link from "next/link"

type Lecture = {
  _id: string
  title: string
  videoUrl: string
}

type Note = {
  _id: string
  name: string
  link: string
}

type Quiz = {
  _id: string
  title: string
  maxMarks: number
}

export default function StudentHome() {

  const params = useParams()
  const username = params.username as string

  const [lectures, setLectures] = useState<Lecture[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const res = await fetch(
          `/api/student-content?username=${username}`
        )

        if (!res.ok) throw new Error("Failed")

        const data = await res.json()

        setLectures(data.lectures || [])
        setNotes(data.notes || [])
        setQuizzes(data.quizzes || [])
      } catch {
        setError("Unable to load content")
      } finally {
        setLoading(false)
      }
    }

    fetchContent()
  }, [username])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading content...</p>
      </main>
    )
  }

  return (
    <>
  
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <Link
            href={`/student/${username}`}
            className="text-sm text-slate-500 hover:text-emerald-600 flex items-center gap-1 w-fit mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-semibold">
            Your Learning Dashboard
          </h1>
        </div>

        <Link
          href={`/student/${username}/ppt-learning`}
          className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-700 p-6 text-white shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-4">
            <span className="rounded-xl bg-white/15 p-3"><Sparkles size={22} /></span>
            <div>
              <h2 className="font-semibold">AI PPT Learning</h2>
              <p className="mt-1 text-sm text-violet-100">Learn from an AI teacher who presents slides, answers questions, and gives quizzes.</p>
            </div>
          </div>
          <span className="w-fit rounded-lg bg-white px-4 py-2 text-sm font-semibold text-violet-800">Start learning →</span>
        </Link>

        <a
          href={process.env.NEXT_PUBLIC_AI_TUTOR_URL || "http://localhost:3782"}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm transition hover:border-indigo-400 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-4">
            <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><Bot size={22} /></span>
            <div>
              <h2 className="font-semibold text-slate-900">Open the AI Tutor</h2>
              <p className="mt-1 text-sm text-slate-600">Chat, guided learning, question practice, research, and more.</p>
            </div>
          </div>
          <span className="w-fit rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Launch AI Tutor ↗</span>
        </a>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        {/* Lectures */}
        {lectures.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              🎥 Recorded Lectures
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {lectures.map(lec => (
                <div
                  key={lec._id}
                  className="bg-white p-5 rounded-xl border shadow-sm"
                >
                  <h3 className="font-medium">{lec.title}</h3>
                  <a
                    href={lec.videoUrl}
                    target="_blank"
                    className="text-sm text-emerald-600 mt-2 block"
                  >
                    Watch Lecture →
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              📝 Notes
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map(note => (
                <div
                  key={note._id}
                  className="bg-white p-5 rounded-xl border shadow-sm"
                >
                  <h3 className="font-medium">{note.name}</h3>
                  <a
                    href={note.link}
                    target="_blank"
                    className="text-sm text-emerald-600 mt-2 block"
                  >
                    View Notes →
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quizzes */}
        {quizzes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              🧠 Live Quizzes
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map(quiz => (
                <div
                  key={quiz._id}
                  className="bg-white p-5 rounded-xl border shadow-sm"
                >
                  <h3 className="font-medium">{quiz.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Max Marks: {quiz.maxMarks}
                  </p>
                  <button className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-sm transition-colors">
                    Attempt Quiz
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {lectures.length === 0 &&
          notes.length === 0 &&
          quizzes.length === 0 && (
            <p className="text-slate-500 text-sm">
              No content available yet.
            </p>
          )}

      </div>
    </main>
    </>
  )
}
