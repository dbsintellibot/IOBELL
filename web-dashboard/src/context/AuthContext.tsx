import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthRole } from './AuthContextValue'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [role, setRole] = useState<AuthRole>(null)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [otaEnabled, setOtaEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const isMounted = useRef(true)
  const queryClient = useQueryClient()

  const [impersonatedSchoolId, setImpersonatedSchoolId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('impersonatedSchoolId')
    }
    return null
  })

  const [dbPartnerId, setDbPartnerId] = useState<string | null>(null)
  const [impersonatedPartnerId, setImpersonatedPartnerId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('impersonatedPartnerId')
    }
    return null
  })



  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const fetchUserDetails = useCallback(async (userId: string) => {
    try {
      // Add timeout to prevent hanging
      const queryPromise = supabase
        .from('users')
        .select('school_id, role, tts_enabled, ota_enabled')
        .eq('id', userId)
        .single()
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      )

      type UserDetailsRow = {
        school_id: string | null
        role: AuthRole
        tts_enabled: boolean | null
        ota_enabled: boolean | null
      }

      type UserDetailsResponse = {
        data: UserDetailsRow | null
        error: unknown
      }

      const { data, error } = (await Promise.race([
        queryPromise,
        timeoutPromise,
      ])) as UserDetailsResponse

      if (!isMounted.current) return

      if (error) {
        console.error('Error fetching user details:', error)
        // Don't clear role/schoolId on error, just return to keep previous state if any
        return
      }

      if (data) {
        // Only update if changed to prevent re-renders
        setSchoolId(prev => prev !== data.school_id ? data.school_id : prev)
        // Update TTS enabled status
        setTtsEnabled(!!data.tts_enabled)
        // Update OTA enabled status
        setOtaEnabled(!!data.ota_enabled)
        
        const roleValue = data.role
        if (roleValue === 'super_admin' || roleValue === 'admin' || roleValue === 'operator' || roleValue === 'partner') {
          setRole(prev => prev !== roleValue ? roleValue : prev)
          if (roleValue === 'partner') {
            const { data: partnerData } = await supabase
              .from('partners')
              .select('id')
              .eq('user_id', userId)
              .maybeSingle()
            if (partnerData) {
              setDbPartnerId(partnerData.id)
            } else {
              setDbPartnerId(null)
            }
          } else {
            setDbPartnerId(null)
          }
        } else {
          setRole(null)
          setDbPartnerId(null)
        }
      }
    } catch (error) {
      if (!isMounted.current) return
      console.error('Unexpected error fetching user details:', error)
    }
  }, [])

  const impersonateSchool = useCallback((targetSchoolId: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('impersonatedSchoolId', targetSchoolId)
    }
    setImpersonatedSchoolId(targetSchoolId)
  }, [])

  const impersonatePartner = useCallback((targetPartnerId: string, _targetUserId: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('impersonatedPartnerId', targetPartnerId)
    }
    setImpersonatedPartnerId(targetPartnerId)
  }, [])

  const stopImpersonation = useCallback(async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('impersonatedSchoolId')
      sessionStorage.removeItem('impersonatedPartnerId')
    }
    setImpersonatedSchoolId(null)
    setImpersonatedPartnerId(null)
    if (user) {
      await fetchUserDetails(user.id)
    }
  }, [user, fetchUserDetails])

  useEffect(() => {
    let mounted = true
    
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        
        if (mounted) {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) {
            await fetchUserDetails(session.user.id)
          }
        }
      } catch (error) {
        // Ignore AbortError
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error getting session:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event)
      if (mounted) {
        if (event === 'SIGNED_OUT' || !session?.user) {
          queryClient.clear()
        }
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
            // Only fetch details if we don't have them or if it's a new login
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                await fetchUserDetails(session.user.id)
            } else if (event === 'TOKEN_REFRESHED') {
                // Optional: Don't re-fetch details on refresh unless needed
            }
        } else {
          setSchoolId(null)
          setRole(null)
        }
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchUserDetails, queryClient])

  // Memoize value to prevent consumers from re-rendering unnecessarily
  const value = useMemo(() => ({
    session,
    user,
    schoolId: impersonatedSchoolId ?? schoolId,
    role: impersonatedSchoolId ? 'admin' : (impersonatedPartnerId ? 'partner' : role),
    partnerId: impersonatedPartnerId ?? dbPartnerId,
    ttsEnabled,
    otaEnabled,
    loading,
    signOut: async () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('impersonatedSchoolId')
        sessionStorage.removeItem('impersonatedPartnerId')
      }
      await supabase.auth.signOut()
      setSession(null)
      setUser(null)
      setSchoolId(null)
      setRole(null)
      setTtsEnabled(false)
      setOtaEnabled(false)
      setImpersonatedSchoolId(null)
      setImpersonatedPartnerId(null)
      setDbPartnerId(null)
      queryClient.clear()
    },
    impersonatedSchoolId,
    impersonatedPartnerId,
    isImpersonating: !!impersonatedSchoolId || !!impersonatedPartnerId,
    impersonateSchool,
    impersonatePartner,
    stopImpersonation
  }), [
    session,
    user,
    schoolId,
    role,
    dbPartnerId,
    impersonatedPartnerId,
    ttsEnabled,
    otaEnabled,
    loading,
    impersonatedSchoolId,
    impersonateSchool,
    impersonatePartner,
    stopImpersonation,
    queryClient
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
