"use client"

import { Component, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = "/create")}
                className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
