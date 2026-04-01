import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-[#0d1117]/80 px-4 backdrop-blur-lg">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-sm font-semibold text-teal-300 no-underline hover:bg-teal-500/20 transition"
      >
        <span className="h-2 w-2 rounded-full bg-teal-400" />
        E57 Viewer
      </Link>
    </header>
  )
}
