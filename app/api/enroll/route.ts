import { NextResponse } from "next/server"
import { connect } from "@/dbConnect/dbConnect"
import User from "@/models/user-model"
import mongoose from "mongoose"

export async function POST(req: Request) {
  try {
    await connect()

    const { username, courseIds } = await req.json()

    if (!username || !courseIds || courseIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    // Convert to ObjectIds safely
    const validCourseIds = courseIds
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
      .map((id: string) => new mongoose.Types.ObjectId(id))

    await User.findByIdAndUpdate(student._id, {
      $addToSet: { courses: { $each: validCourseIds } },
    })

    return NextResponse.json({ message: "Enrollment successful" })
  } catch {
    return NextResponse.json(
      { error: "Enrollment failed" },
      { status: 500 }
    )
  }
}