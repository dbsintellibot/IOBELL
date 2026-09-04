import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ShieldAlert } from 'lucide-react'

export function ImpersonationBanner() {
  const { isImpersonating, stopImpersonation, schoolId, impersonatedSchoolId, impersonatedPartnerId, partnerId } = useAuth()
  const navigate = useNavigate()

  const { data: school } = useQuery({
    queryKey: ['school_name', schoolId],
    enabled: !!schoolId && !!impersonatedSchoolId && isImpersonating,
    queryFn: async () => {
      const { data } = await supabase
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single()
      return data
    }
  })

  const { data: partner } = useQuery({
    queryKey: ['partner_name', partnerId],
    enabled: !!partnerId && !!impersonatedPartnerId && isImpersonating,
    queryFn: async () => {
      const { data } = await supabase
        .from('partners')
        .select('company_name')
        .eq('id', partnerId)
        .single()
      return data
    }
  })

  if (!isImpersonating) return null

  const handleReturn = async () => {
    const isPartner = !!impersonatedPartnerId
    await stopImpersonation()
    if (isPartner) {
      navigate('/super-admin/partners')
    } else {
      navigate('/super-admin/schools')
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex h-10 items-center justify-between bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-md border-b border-amber-600/30">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-900 animate-pulse" />
        {impersonatedPartnerId ? (
          <span>
            ⚠️ Impersonating <span className="underline font-bold">{partner?.company_name || 'Partner'}</span>. You are viewing the dashboard as a partner distributor.
          </span>
        ) : (
          <span>
            ⚠️ Impersonating <span className="underline font-bold">{school?.name || 'School'}</span>. You are viewing the dashboard as a school administrator.
          </span>
        )}
      </div>
      <button
        onClick={handleReturn}
        className="rounded bg-amber-950 px-3 py-1 text-xs font-bold text-amber-50 hover:bg-amber-900 transition-colors shadow-sm"
      >
        Return to Super Admin Panel
      </button>
    </div>
  )
}
