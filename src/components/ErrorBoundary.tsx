import { Component, type ErrorInfo, type ReactNode } from 'react'
import { APP_NAME } from '@shared/brand'

type Props = { children: ReactNode }
type State = { message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : 'Something went wrong.' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.message) return this.props.children
    return (
      <div className="flex h-full min-h-0 flex-col bg-aubergine">
        <div className="chrome-inset app-drag h-10 shrink-0 bg-[#1a0014]" />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-lg font-semibold">{APP_NAME} hit a problem</h1>
          <p className="max-w-md text-sm text-white/65">{this.state.message}</p>
          <button type="button" className="ui-btn-primary app-no-drag" onClick={() => this.setState({ message: '' })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
