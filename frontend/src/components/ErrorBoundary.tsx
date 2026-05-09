import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ChipIn] Uncaught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <p className="text-3xl mb-4">⚠️</p>
            <p className="text-white font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-400 text-sm mb-6">
              Please reload the page. If this keeps happening, try clearing your browser data.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white
                hover:bg-brand-500 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
