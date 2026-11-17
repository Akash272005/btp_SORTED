

import { NextResponse } from "next/server"
import Course from "@/models/course-model"
import { connect } from "@/dbConnect/dbConnect"
import mongoose from "mongoose"
import User from "@/models/user-model"
export async function GET(req: Request) {
  try {
    await connect()

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")?.trim()

    // 🔹 If userId provided → return teacher's courses
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return NextResponse.json(
          { error: "Invalid userId" },
          { status: 400 }
        )
      }

      const teacherCourses = await Course.find({ user: userId })
      return NextResponse.json(teacherCourses)
    }

    // 🔹 If no userId → return ALL courses (for students)
    const allCourses = await Course.find({})
    return NextResponse.json(allCourses)

  } catch {
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    )
  }
}


export async function POST(req: Request) {
  try {
    await connect()

    const { cid, name, user } = await req.json()

    if (!cid || !name || !user) {
      return NextResponse.json(
        { error: "cid, name and user are required" },
        { status: 400 }
      )
    }

    if (!mongoose.Types.ObjectId.isValid(user)) {
      return NextResponse.json(
        { error: "Invalid userId" },
        { status: 400 }
      )
    }

    // Check duplicate CID
    const existing = await Course.findOne({ cid })
    if (existing) {
      return NextResponse.json(
        { error: "Course already exists" },
        { status: 409 }
      )
    }

    // Fetch teacher name
    const teacher = await User.findById(user).select("name")
    if (!teacher) {
      return NextResponse.json(
        { error: "Teacher not found" },
        { status: 404 }
      )
    }

    // 1️⃣ Create Course
    const newCourse = await Course.create({
      cid,
      name,
      faculty: teacher.name,
      user,
    })

    // 2️⃣ Push courseId into teacher.courses[]
    await User.findByIdAndUpdate(
      user,
      { $push: { courses: newCourse._id } }
    )

    return NextResponse.json(
      { message: "Course added successfully", course: newCourse },
      { status: 201 }
    )
  } catch {
    return NextResponse.json(
      { error: "Failed to add course" },
      { status: 500 }
    )
  }
}