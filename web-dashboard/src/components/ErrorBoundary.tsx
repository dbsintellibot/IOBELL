import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '@/lib/errorLogger'
import { AlertTriangle, RefreshCw, Send } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  reported: boolean
  isReporting: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    reported: false,
    isReporting: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      reported: false,
      isReporting: false,
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    logger.error('React Component Crash Caught by ErrorBoundary', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  private handleReportTicket = async (): Promise<void> => {
    if (this.state.reported || this.state.isReporting || !this.state.error) return

    this.setState({ isReporting: true })
    const success = await logger.autoReportTicket(
      this.state.error.message || 'React Component Crash',
      `Uncaught UI Error: ${this.state.error.message}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || 'N/A'}`,
      this.state.error.stack
    )

    this.setState({
      isReporting: false,
      reported: success,
    })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center space-x-3 text-red-500">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h1 className="text-xl font-bold text-slate-100">Something went wrong</h1>
                <p className="text-sm text-slate-400">An unexpected system error occurred in the application UI.</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-red-400 overflow-x-auto max-h-48">
              <p className="font-semibold">{this.state.error?.name}: {this.state.error?.message}</p>
              {this.state.error?.stack && (
                <pre className="mt-2 text-slate-500 whitespace-pre-wrap">{this.state.error.stack}</pre>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>

              <button
                onClick={this.handleReportTicket}
                disabled={this.state.reported || this.state.isReporting}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  this.state.reported
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Send className="w-4 h-4" />
                {this.state.isReporting
                  ? 'Reporting...'
                  : this.state.reported
                  ? 'Ticket Created'
                  : 'Report Issue to Support'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
