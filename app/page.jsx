"use client";

import { useRouter } from "next/navigation";
import { Button } from "./components/ui/Button";
import { Card, CardContent } from "./components/ui/Card";
import { GraduationCap, BookOpen, ArrowRight } from "lucide-react";
export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[100px]" />
      </div>

      <div className="z-10 w-full max-w-5xl px-6 grid md:grid-cols-2 gap-12 items-center">
        {/* Hero Text */}
        <div className="space-y-6 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-secondary text-secondary-foreground text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Platform Live
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-tight">
            Master Your Future with <span className="text-primary">Learnix</span>
          </h1>

          <p className="text-muted-foreground text-lg max-w-md mx-auto md:mx-0">
            A premium platform designed for focused learning and seamless teaching experiences. Join thousands of students and educators today.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
            {/* We can have a primary CTA here if needed, but the main actions are below or to the side */}
          </div>
        </div>

        {/* Role Selection Cards */}
        <div className="grid gap-6">
          <Card className="group relative overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-pointer bg-card/50 backdrop-blur-sm"
            onClick={() => router.push("/auth/student")}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="p-6 flex items-center gap-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
                <GraduationCap size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Continue as Student</h3>
                <p className="text-sm text-muted-foreground">Access courses, track progress, and learn securely.</p>
              </div>
              <ArrowRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" size={20} />
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-border/50 hover:border-secondary/50 transition-all duration-300 hover:shadow-lg hover:shadow-secondary/5 cursor-pointer bg-card/50 backdrop-blur-sm"
            onClick={() => router.push("/auth/educator")}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="p-6 flex items-center gap-6">
              <div className="h-12 w-12 rounded-full bg-secondary/30 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform duration-300">
                <BookOpen size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Continue as Educator</h3>
                <p className="text-sm text-muted-foreground">Manage courses, upload content, and guide students.</p>
              </div>
              <ArrowRight className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-300" size={20} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center w-full">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Learnix. All rights reserved.
        </p>
      </div>
    </main>
  );
}
