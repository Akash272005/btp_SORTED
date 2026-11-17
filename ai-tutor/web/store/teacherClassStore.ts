"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TeacherClassState {
  classId: string;
  setClassId: (id: string) => void;
}

/** Persisted selected class for teacher portal (quizzes, papers, dashboard). */
export const useTeacherClassStore = create<TeacherClassState>()(
  persist(
    (set) => ({
      classId: "",
      setClassId: (classId) => set({ classId }),
    }),
    { name: "vidyasetu-teacher-class" },
  ),
);
