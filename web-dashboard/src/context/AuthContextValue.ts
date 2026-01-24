import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthRole = 'super_admin' | 'admin' | 'operator' | null

export type AuthContextType = {
  session: Session | null
  user: User | null
  schoolId: string | null
  role: AuthRole
  loading: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
