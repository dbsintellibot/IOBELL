import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ShieldAlert, Award, PiggyBank, BadgeCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Commission {
  id: string
  amount: number
  status: string
  payout_date: string
  payout_ref: string
  created_at: string
  deal: {
    amount: number
    lead: {
      school_name: string
    }
  }
}

export default function Commissions() {
  const { user, partnerId, loading: authLoading } = useAuth()
  const [partner, setPartner] = useState<any>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCommissionsData = async () => {
    try {
      setLoading(true)
      const query = supabase
        .from('partners')
        .select(`
          id,
          tier:partner_tiers(name, commission_rate)
        `)

      const { data: partnerData } = partnerId
        ? await query.eq('id', partnerId).maybeSingle()
        : await query.eq('user_id', user?.id).maybeSingle()

      if (!partnerData) return
      setPartner(partnerData)

      const { data: commsData, error } = await supabase
        .from('commissions')
        .select(`
          id, amount, status, payout_date, payout_ref, created_at,
          deal:deals(amount, lead:leads(school_name))
        `)
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCommissions(commsData as any || [])
    } catch (err: any) {
      toast.error('Failed to load commissions telemetry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id || partnerId) {
      fetchCommissionsData()
    }
  }, [user?.id, partnerId])

  if (authLoading || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-violet-500" />
      </div>
    )
  }

  if (!partner && !loading && !authLoading) {
    return (
      <div className="text-center py-10">
        <ShieldAlert className="mx-auto h-12 w-12 text-slate-500" />
        <h3 className="mt-2 text-sm font-bold text-white">Partner profile not found</h3>
      </div>
    )
  }

  const pendingComms = commissions.filter(c => c.status === 'pending').reduce((acc, curr) => acc + Number(curr.amount), 0)
  const paidComms = commissions.filter(c => c.status === 'paid').reduce((acc, curr) => acc + Number(curr.amount), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Commission Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 shadow-lg flex items-center justify-between">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Partner Tier</span>
            <span className="text-2xl font-bold text-white flex items-center gap-1.5">
              <Award className="h-5 w-5 text-violet-400" />
              {partner.tier?.name} ({partner.tier?.commission_rate}%)
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 shadow-lg flex items-center justify-between">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Pending Payout</span>
            <span className="text-2xl font-bold text-amber-400 flex items-center gap-1.5">
              <PiggyBank className="h-5 w-5" />
              ${pendingComms.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 shadow-lg flex items-center justify-between">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Paid Out</span>
            <span className="text-2xl font-bold text-emerald-400 flex items-center gap-1.5">
              <BadgeCheck className="h-5 w-5" />
              ${paidComms.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Commissions table list */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white mb-6">Commission Ledger</h3>
        {commissions.length === 0 ? (
          <p className="text-sm text-slate-550 text-center py-8">No commissions earned yet. Keep locking those school deals!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 uppercase text-[10px] tracking-wider font-bold">
                  <th className="pb-3">Deal Destination</th>
                  <th className="pb-3">Deal Volume</th>
                  <th className="pb-3">Earned Commission</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Payout Details</th>
                  <th className="pb-3">Date Calculated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-355">
                {commissions.map((comm) => (
                  <tr key={comm.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-3.5 font-semibold text-white">{comm.deal?.lead?.school_name}</td>
                    <td className="py-3.5">${comm.deal?.amount.toLocaleString()}</td>
                    <td className="py-3.5 font-bold text-violet-400">${comm.amount.toLocaleString()}</td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        comm.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {comm.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-xs font-mono">
                      {comm.status === 'paid' ? (
                        <div>
                          <p className="text-slate-300">Ref: {comm.payout_ref || 'N/A'}</p>
                          <p className="text-[10px] text-slate-500">{new Date(comm.payout_date).toLocaleDateString()}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">Processing next cycle</span>
                      )}
                    </td>
                    <td className="py-3.5 text-xs text-slate-450">{new Date(comm.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
