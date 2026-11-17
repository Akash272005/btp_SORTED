"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/app/components/ui/Button"
import { Input } from "@/app/components/ui/Input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/app/components/ui/Card"
import { Loader2, PlusCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function AddCourse() {
  const params = useParams()
  const username = params?.username as string

  const [userId, setUserId] = useState("")
  const [cid, setCid] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  // 1️⃣ Resolve username → userId
  useEffect(() => {
    if (!username) return

    fetch(`/api/users?username=${username}`)
      .then(res => res.json())
      .then(data => {
        if (data._id) {
          setUserId(data._id)
        } else {
          setError("User not found")
        }
      })
  }, [username])

  const handleSubmit = async () => {
    if (!cid || !name || !userId) {
      setError("All fields are required")
      return
    }

    try {
      setLoading(true)
      setError("")

      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          name,
          user: userId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to add course")
        return
      }

      setSuccess(true)
      setCid("")
      setName("")
      setTimeout(() => setSuccess(false), 2000)
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-lg z-10 border-border/50 shadow-lg">
        <CardHeader>
          <div className="mb-4">
            <Link href={`/educator/${username}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
              <ArrowLeft size={16} /> Back to Dashboard
            </Link>
          </div>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <PlusCircle className="text-primary" /> Add New Course
          </CardTitle>
          <CardDescription>
            Create a course and assign it to yourself
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success && (
            <div className="bg-emerald-500/15 text-emerald-600 px-4 py-3 rounded-md text-sm font-medium border border-emerald-500/20 flex items-center gap-2">
              ✅ Course added successfully
            </div>
          )}

          {error && (
            <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md text-sm font-medium border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Course ID</label>
            <Input
              placeholder="e.g. CS101"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Course Name</label>
            <Input
              placeholder="e.g. Introduction to Computer Science"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Create Course"
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
