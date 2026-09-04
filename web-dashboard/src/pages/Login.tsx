import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Loader2, Mail, Lock, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockoutTime, setLockoutTime] = useState<number>(0)
  const navigate = useNavigate()
  const { user, role, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!user || authLoading) return
    if (role === 'super_admin') {
      navigate('/super-admin', { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [user, role, authLoading, navigate])

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTime <= 0) return
    const timer = setInterval(() => {
      setLockoutTime((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutTime])

  if (user) {
    return null
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockoutTime > 0) return

    setLoading(true)
    setError(null)

    // Password Policy Check
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      const nextAttempts = failedAttempts + 1
      setFailedAttempts(nextAttempts)

      // Lockout logic after 5 failed attempts
      if (nextAttempts >= 5) {
        setLockoutTime(60) // 60s lockout
        setError('Too many failed login attempts. Account temporarily locked for 60 seconds.')
        setFailedAttempts(0)
      } else {
        setError(`${authError.message} (${5 - nextAttempts} attempts remaining before temporary lockout)`)
      }
    } else {
      setFailedAttempts(0)
      navigate('/')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side with Marketing Image */}
      <div className="hidden lg:block lg:w-1/2 relative bg-white border-r border-border overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <img 
            src="/marketing-banner.jpg" 
            alt="AutoBell System" 
            className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl"
          />
        </div>
      </div>

      {/* Right side with Login Form */}
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-background via-muted to-background px-4 sm:px-6 lg:px-8 relative">
        {/* Abstract Background Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-[40%] -right-[10%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-3xl" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8 rounded-3xl bg-card/80 backdrop-blur-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.20)] border border-border relative z-10"
        >
          <div className="flex flex-col items-center text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-3 flex items-center justify-center p-2"
            >
              <img
                src="/logo.png"
                alt="AutoBell Logo"
                className="h-32 w-auto max-w-full object-contain rounded-2xl drop-shadow-md"
              />
            </motion.div>
            
            <h2 className="mt-1 text-sm font-medium text-muted-foreground max-w-xs">
              New Generation WiFi Based Public Addressing System
            </h2>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive border border-destructive/20 text-center flex items-center gap-2 justify-center"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {lockoutTime > 0 && (
              <div className="rounded-lg bg-warning/15 p-3 text-xs text-warning border border-warning/20 text-center font-mono font-semibold">
                Account locked. Try again in {lockoutTime} seconds.
              </div>
            )}

            <div className="space-y-4">
              <div className="relative">
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-primary/60" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={lockoutTime > 0}
                  className="block w-full rounded-xl border border-border bg-background/60 pl-10 pr-3 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm transition-all"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-primary/60" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={lockoutTime > 0}
                  className="block w-full rounded-xl border border-border bg-background/60 pl-10 pr-3 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm transition-all"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end">
                <div className="text-sm">
                  <a href="#" className="font-medium text-primary/80 hover:text-primary transition-colors">
                    Forgot your password?
                  </a>
                </div>
              </div>
            </div>

            <div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || lockoutTime > 0}
                className="group relative flex w-full justify-center rounded-xl border border-transparent bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </motion.button>
            </div>

            <div className="text-center mt-4">
              <p className="text-sm text-muted-foreground">
                Access is restricted to authorized personnel only.
              </p>
            </div>
          </form>
        </motion.div>
        
        <footer className="absolute bottom-4 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by AutoBell &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  )
}
