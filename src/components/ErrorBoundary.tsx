'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#0d1117] p-8">
          <div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center backdrop-blur-sm">
            <div className="mb-4 text-4xl">💥</div>
            <h2 className="mb-2 text-lg font-semibold text-red-300">Something went wrong</h2>
            <p className="mb-4 text-sm text-white/50">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/20"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/30"
              >
                Reload Page
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-white/30 hover:text-white/50">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] text-white/40">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
