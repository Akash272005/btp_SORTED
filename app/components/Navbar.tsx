import Link from "next/link"
import { Phone, Gift } from "lucide-react"

export default function Navbar() {
  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Left: Logo + Exam */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              L
            </div>
            <span className="font-semibold">Learnix</span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-sm text-gray-600">
            <Link href="#" className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">
              Get started
            </Link>
            <Link href="#">Educators</Link>
            
            <Link href="#">About exam</Link>
          </nav>
        </div>

        {/* Center: Search */}
        <div className="hidden lg:block w-[380px]">
          <input
            type="text"
            placeholder="Search courses, test series and educators"
            className="w-full px-4 py-2 text-sm border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Right: Contact + Icons */}
        <div className="flex items-center gap-4 text-sm">
          <div className="hidden md:flex items-center gap-1 text-gray-600">
            <Phone size={16} />
            <span>+91-8585858585</span>
          </div>

          <button className="p-2 rounded-full hover:bg-gray-100">
            <Gift size={18} />
          </button>

          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-semibold">
            C
          </div>
        </div>

      </div>
    </header>
  )
}