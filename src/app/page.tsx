import Link from "next/link"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Ad Creator
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          Create scroll-stopping social media ads in 7 structured steps.
          Concept first, then visual, then copy.
        </p>
        <Link
          href="/create"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
        >
          Start New Ad
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
      <div className="mt-16 grid max-w-2xl grid-cols-7 gap-2 text-center text-xs text-zinc-500">
        {["Concept", "Format", "Prompts", "Upload", "Copy", "Compose", "Export"].map(
          (step, i) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                {i + 1}
              </div>
              <span>{step}</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
