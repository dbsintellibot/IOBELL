import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthRole = 'super_admin' | 'admin' | 'operator' | 'partner' | null

export type AuthContextType = {
  session: Session | null
  user: User | null
  schoolId: string | null
  role: AuthRole
  ttsEnabled: boolean
  otaEnabled: boolean
  loading: boolean
  signOut: () => Promise<void>
  impersonatedSchoolId: string | null
  partnerId: string | null
  impersonatedPartnerId: string | null
  impersonatePartner: (targetPartnerId: string, targetUserId: string) => void
  isImpersonating: boolean
  impersonateSchool: (targetSchoolId: string) => void
  stopImpersonation: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
