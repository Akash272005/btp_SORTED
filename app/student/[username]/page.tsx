"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/app/components/ui/Button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/Card"
import { BookOpen, CheckCircle, Loader2 } from "lucide-react"

type Course = {
  _id: string
  cid: string
  name: string
  faculty: string
}

export default function Dashboard() {
  const router = useRouter()
  const params = useParams()
  const student = params.username as string

  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 🔹 Fetch all courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/api/courses")
        if (!res.ok) throw new Error("Failed to fetch courses")

        const data = await res.json()
        setCourses(data)
      } catch {
        setError("Unable to load courses")
      } finally {
        setLoading(false)
      }
    }

    fetchCourses()
  }, [])

  // 🔹 Toggle selection
  const toggleEnroll = (courseId: string) => {
    setSelectedCourses(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
    setError("")
  }

  // 🔹 Submit enrollment
  const handleContinue = async () => {
    if (selectedCourses.length === 0) {
      setError("Please select at least one course")
      return
    }

    try {
      setSubmitting(true)

      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: student,
          courseIds: selectedCourses,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Enrollment failed")
        return
      }

      // ✅ Redirect after success
      router.push(`/student/${student}/home`)
    } catch {
      setError("Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome back, <span className="text-primary">{student}</span>
            </h1>
            <p className="text-muted-foreground">
              Select the courses you want to enroll in to start learning.
            </p>
          </div>
          <Button
            onClick={handleContinue}
            disabled={submitting || selectedCourses.length === 0}
            size="lg"
            className={selectedCourses.length === 0 ? "opacity-50 cursor-not-allowed" : ""}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Continue (${selectedCourses.length})`
            )}
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading courses...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm font-medium border border-destructive/20">
            {error}
          </div>
        )}

        {/* Courses Grid */}
        {!loading && courses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => {
              const isSelected = selectedCourses.includes(course._id)

              return (
                <Card
                  key={course._id}
                  className={`cursor-pointer transition-all duration-200 border-2 ${isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-transparent hover:border-border hover:shadow-sm"
                    }`}
                  onClick={() => toggleEnroll(course._id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="p-2 bg-secondary/10 rounded-lg">
                        <BookOpen className="h-5 w-5 text-secondary" />
                      </div>
                      {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                    </div>
                    <CardTitle className="pt-2 text-lg">{course.name}</CardTitle>
                    <CardDescription>ID: {course.cid}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-muted-foreground">
                      Faculty: <span className="text-foreground">{course.faculty}</span>
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant={isSelected ? "destructive" : "secondary"}
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEnroll(course._id);
                      }}
                    >
                      {isSelected ? "Remove" : "Enroll"}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}

        {!loading && courses.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            No courses available at the moment.
          </div>
        )}
      </div>
    </main>
  )
}
