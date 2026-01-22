import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  session: Session | null
  user: User | null
  schoolId: string | null
  role: 'super_admin' | 'admin' | 'operator' | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [role, setRole] = useState<'super_admin' | 'admin' | 'operator' | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserDetails = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('school_id, role')
        .eq('id', userId)
        .single()
      
      if (error) {
        console.error('Error fetching user details:', error)
        return
      }

      if (data) {
        setSchoolId(data.school_id)
        setRole(data.role as any)
      }
    } catch (error) {
      console.error('Unexpected error fetching user details:', error)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchUserDetails(session.user.id)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchUserDetails(session.user.id)
      } else {
        setSchoolId(null)
        setRole(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSchoolId(null)
    setRole(null)
  }

  const value = {
    session,
    user,
    schoolId,
    role,
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
