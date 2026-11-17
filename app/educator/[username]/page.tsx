import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/Card"
import { PlusCircle, Radio, Video, FileText, HelpCircle, Presentation } from "lucide-react"

import { connect } from "@/dbConnect/dbConnect"
import User from "@/models/user-model"
import RecordedLecture from "@/models/lecture-model"
import Notes from "@/models/notes-model"
import Quiz from "@/models/quiz-model"
import ContentList from "@/app/components/ContentList"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const teacher = decodeURIComponent(username)

  await connect()
  const userDoc = await User.findOne({ username: teacher })

  let recentUploads: any[] = []

  if (userDoc) {
    const [lectures, notes, quizzes] = await Promise.all([
      RecordedLecture.find({ user: userDoc._id }).sort({ createdAt: -1 }).limit(5).lean(),
      Notes.find({ user: userDoc._id }).sort({ createdAt: -1 }).limit(5).lean(),
      Quiz.find({ user: userDoc._id }).sort({ createdAt: -1 }).limit(5).lean()
    ])

    const formattedLectures = lectures.map((l: any) => ({
      _id: l._id.toString(),
      title: l.title,
      createdAt: l.createdAt.toISOString(),
      type: 'lecture'
    }))

    const formattedNotes = notes.map((n: any) => ({
      _id: n._id.toString(),
      title: n.name,
      createdAt: n.createdAt.toISOString(),
      type: 'note'
    }))

    const formattedQuizzes = quizzes.map((q: any) => ({
      _id: q._id.toString(),
      title: q.title,
      createdAt: q.createdAt.toISOString(),
      type: 'quiz'
    }))

    recentUploads = [...formattedLectures, ...formattedNotes, ...formattedQuizzes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5) // Top 5 overall
  }

  const actions = [
    {
      title: "AI PPT Learning",
      description: "Turn lesson notes or an NCERT chapter into a narrated class",
      href: `/educator/${encodeURIComponent(teacher)}/ppt-learning`,
      icon: Presentation,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
    {
      title: "Add Course",
      description: "Create a new course",
      href: `/educator/${teacher}/add-course`,
      icon: PlusCircle,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Live Lectures",
      description: "Start and manage live classes",
      href: `/educator/${teacher}/live-lectures`,
      icon: Radio,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Recorded Lectures",
      description: "Upload and manage recorded videos",
      href: `/educator/${teacher}/upload-lec`,
      icon: Video,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Notes",
      description: "Upload notes and study material",
      href: `/educator/${teacher}/upload-notes`,
      icon: FileText,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Quiz",
      description: "Create quizzes and upload results",
      href: `/educator/${teacher}/upload-quiz`,
      icon: HelpCircle,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ]

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome, <span className="text-primary">{teacher}</span>
          </h1>
          <p className="text-muted-foreground">
            Manage your classes, lectures, and students from one central hub.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {actions.map((item) => (
            <Link key={item.title} href={item.href} className="group block h-full">
              <Card className="h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50 bg-card hover:bg-accent/5">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.bgColor} transition-colors group-hover:bg-opacity-20`}>
                    <item.icon className={`h-6 w-6 ${item.color}`} />
                  </div>
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {item.title}
                  </CardTitle>
                  <CardDescription>
                    {item.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent Uploads */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Recent Uploads</h2>
          <ContentList items={recentUploads} />
        </div>
      </div>
    </main>
  )
}
