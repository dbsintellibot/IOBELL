import { supabase } from '@/lib/supabase'

export interface LogEntry {
  id?: string
  level: 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
  correlationId?: string
  timestamp: string
  stack?: string
}

class EnterpriseLogger {
  private correlationId: string

  constructor() {
    this.correlationId = this.generateCorrelationId()
    this.setupGlobalListeners()
  }

  private generateCorrelationId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return 'corr_' + Math.random().toString(36).substring(2, 11)
  }

  public getCorrelationId(): string {
    return this.correlationId
  }

  public renewCorrelationId(): string {
    this.correlationId = this.generateCorrelationId()
    return this.correlationId
  }

  private setupGlobalListeners(): void {
    if (typeof window === 'undefined') return

    window.addEventListener('error', (event) => {
      this.error('Uncaught Window Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        errorStack: event.error?.stack,
      })
    })

    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: String(event.reason?.message || event.reason),
        stack: event.reason?.stack,
      })
    })
  }

  public async log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      level,
      message,
      context,
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      stack: context?.errorStack ? String(context.errorStack) : undefined,
    }

    // Structured JSON log output to console
    const structuredOutput = JSON.stringify(entry)
    if (level === 'error') {
      console.error(`[ENTERPRISE_LOG]`, structuredOutput)
    } else if (level === 'warn') {
      console.warn(`[ENTERPRISE_LOG]`, structuredOutput)
    } else {
      console.log(`[ENTERPRISE_LOG]`, structuredOutput)
    }

    // If level is error, attempt to submit audit log / DB log entry
    if (level === 'error') {
      try {
        await supabase.rpc('log_audit_event', {
          p_action: 'SYSTEM_ERROR',
          p_resource_type: 'WEB_DASHBOARD',
          p_resource_id: this.correlationId,
          p_details: {
            message,
            context,
            timestamp: entry.timestamp,
          },
        })
      } catch (err) {
        // Fallback quiet error ignore to prevent recursive error loops
      }
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  public async autoReportTicket(title: string, errorDetails: string, errorStack?: string): Promise<boolean> {
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      if (!userId) return false

      const { data: userProfile } = await supabase
        .from('users')
        .select('school_id')
        .eq('id', userId)
        .single()

      const schoolId = userProfile?.school_id

      if (!schoolId) return false

      const { error } = await supabase.from('tickets').insert({
        school_id: schoolId,
        reporter_id: userId,
        title: `[AUTO-ERROR] ${title.slice(0, 100)}`,
        description: errorDetails,
        type: 'bug',
        priority: 'high',
        status: 'open',
        error_stack: errorStack,
        metadata: {
          correlationId: this.correlationId,
          userAgent: navigator.userAgent,
          url: window.location.href,
        },
      })

      return !error
    } catch {
      return false
    }
  }
}

export const logger = new EnterpriseLogger()
