import { NextResponse } from "next/server"
import { connect } from "@/dbConnect/dbConnect"
import User from "@/models/user-model"
import Notes from "@/models/notes-model"
import Quiz from "@/models/quiz-model"
import RecordedLecture from "@/models/lecture-model"

export async function GET(req: Request) {
  try {
    await connect()

    const { searchParams } = new URL(req.url)
    const username = searchParams.get("username")

    if (!username) {
      return NextResponse.json(
        { error: "Username required" },
        { status: 400 }
      )
    }

    const student = await User.findOne({ username })

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      )
    }

    const courseIds = student.courses

    const lectures = await RecordedLecture.find({
      course: { $in: courseIds },
    })

    const notes = await Notes.find({
      course: { $in: courseIds },
    })

    const quizzes = await Quiz.find({
      course: { $in: courseIds },
      isLive: true,
    })

    return NextResponse.json({
      lectures,
      notes,
      quizzes,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    )
  }
}