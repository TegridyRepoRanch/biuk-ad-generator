import Link from "next/link"

const steps = [
  { label: "Concept", desc: "AI generates angles from your brief" },
  { label: "Format", desc: "Pick platform + layout zones" },
  { label: "Prompts", desc: "AI writes image gen prompts" },
  { label: "Upload", desc: "Generate or upload your image" },
  { label: "Copy", desc: "AI writes headlines for your image" },
  { label: "Compose", desc: "Drag text, style, preview" },
  { label: "Export", desc: "Render PNG at exact dimensions" },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
          BIUK Creative
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white">
          Ad Creator
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-400">
          Create scroll-stopping social media ads in 7 structured steps.
          Concept first, then visual, then copy that complements your image.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Start New Ad
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Step overview */}
      <div className="mt-16 w-full max-w-3xl">
        <div className="grid grid-cols-7 gap-1">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                {i + 1}
              </div>
              {i < 6 && (
                <div className="mt-0.5 mb-0.5 h-0 w-full border-t border-dashed border-zinc-800" />
              )}
              <span className="mt-1.5 text-xs font-medium text-zinc-300">
                {step.label}
              </span>
              <span className="mt-0.5 hidden text-[10px] leading-tight text-zinc-600 sm:block">
                {step.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center text-xs text-zinc-600">
        Powered by Claude + Nano Banana Pro
      </div>
    </div>
  )
}
