import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthRole } from './AuthContextValue'
import type { Session, User } from '@supabase/supabase-js'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [role, setRole] = useState<AuthRole>(null)
  const [loading, setLoading] = useState(true)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const fetchUserDetails = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('school_id, role')
        .eq('id', userId)
        .single()
      
      if (!isMounted.current) return

      if (error) {
        console.error('Error fetching user details:', error)
        return
      }

      if (data) {
        setSchoolId(data.school_id)
        const roleValue = data.role
        if (roleValue === 'super_admin' || roleValue === 'admin' || roleValue === 'operator') {
          setRole(roleValue)
        } else {
          setRole(null)
        }
      }
    } catch (error) {
      if (!isMounted.current) return
      console.error('Unexpected error fetching user details:', error)
    }
  }

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        
        if (isMounted.current) {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) {
            await fetchUserDetails(session.user.id)
          }
          if (isMounted.current) setLoading(false)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error getting session:', error)
        if (isMounted.current) setLoading(false)
      }
    }

    initSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (isMounted.current) {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchUserDetails(session.user.id)
        } else {
          setSchoolId(null)
          setRole(null)
        }
        if (isMounted.current) setLoading(false)
      }
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
