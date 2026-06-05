import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-6">
          <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
            <p className="text-2xl mb-3">⚠️</p>
            <p className="text-gray-800 font-semibold mb-1">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
