import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Notebook, ShieldAlert, BadgeDollarSign, Lock } from 'lucide-react'
import { toast } from 'sonner'

interface Deal {
  id: string
  lead_id: string
  amount: number
  status: string
  closed_at: string
  created_at: string
  s3_quantity?: number
  mini_quantity?: number
  lead: {
    school_name: string
    contact_person: string
    locked_until?: string
  }
}

interface Lead {
  id: string
  school_name: string
}

export default function Deals() {
  const { user, partnerId, loading: authLoading } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [unconvertedLeads, setUnconvertedLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFollowupOpen, setIsFollowupOpen] = useState(false)

  // Deal Form
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [dealAmount, setDealAmount] = useState('')
  const [s3Quantity, setS3Quantity] = useState('0')
  const [miniQuantity, setMiniQuantity] = useState('0')

  // Follow-up Form
  const [selectedDealId, setSelectedDealId] = useState('')
  const [followupNotes, setFollowupNotes] = useState('')
  const [followupDate, setFollowupDate] = useState('')
  const [recentFollowups, setRecentFollowups] = useState<any[]>([])

  const fetchDealsAndLeads = async () => {
    if (!partnerId) return
    try {
      setLoading(true)

      // Fetch Deals
      const { data: dealsData, error: dealsErr } = await supabase
        .from('deals')
        .select(`
          id, lead_id, amount, status, closed_at, created_at, s3_quantity, mini_quantity,
          lead:leads(school_name, contact_person, locked_until)
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })

      if (dealsErr) throw dealsErr
      setDeals(dealsData as any || [])

      // Fetch Unconverted Leads (to convert to deal)
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, school_name')
        .eq('partner_id', partnerId)
        .in('status', ['new', 'contacted', 'qualified'])

      setUnconvertedLeads(leadsData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch deals')
    } finally {
      setLoading(false)
    }
  }

  const loadFollowups = async (dealId: string) => {
    try {
      const { data, error } = await supabase
        .from('deal_followups')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRecentFollowups(data || [])
    } catch (err: any) {
      toast.error('Failed to load follow-up timeline')
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchDealsAndLeads()
    }
  }, [user?.id])

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partnerId || !selectedLeadId || !dealAmount) return

    try {
      setLoading(true)
      // Call RPC to convert lead to deal atomically
      const { error } = await supabase.rpc('convert_lead_to_deal', {
        p_lead_id: selectedLeadId,
        p_amount: parseFloat(dealAmount),
        p_s3_quantity: parseInt(s3Quantity) || 0,
        p_mini_quantity: parseInt(miniQuantity) || 0
      })

      if (error) throw error

      toast.success('Lead converted to deal pipeline!')
      setIsModalOpen(false)
      setSelectedLeadId('')
      setDealAmount('')
      setS3Quantity('0')
      setMiniQuantity('0')
      fetchDealsAndLeads()
    } catch (err: any) {
      toast.error(err.message || 'Failed to initialize deal')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateDealStatus = async (dealId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus }
      if (newStatus === 'won' || newStatus === 'lost') {
        updates.closed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', dealId)

      if (error) throw error

      toast.success(`Deal marked as ${newStatus}!`)
      fetchDealsAndLeads()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update deal status')
    }
  }

  const handleAddFollowup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDealId || !followupNotes) return

    try {
      const { error } = await supabase
        .from('deal_followups')
        .insert({
          deal_id: selectedDealId,
          notes: followupNotes,
          follow_up_date: followupDate ? new Date(followupDate).toISOString() : null
        })

      if (error) throw error

      toast.success('Followup note logged successfully')
      setFollowupNotes('')
      setFollowupDate('')
      loadFollowups(selectedDealId)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add follow-up')
    }
  }

  if (authLoading || (loading && !partnerId)) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  if (!partnerId && !loading && !authLoading) {
    return (
      <div className="text-center py-10">
        <ShieldAlert className="mx-auto h-12 w-12 text-slate-500" />
        <h3 className="mt-2 text-sm font-bold text-white">Partner profile not found</h3>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold tracking-tight text-white">Deals Pipeline</h3>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={unconvertedLeads.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-750 disabled:bg-slate-800 disabled:text-slate-550 text-white font-medium rounded-xl transition-all duration-200"
        >
          <BadgeDollarSign className="h-5 w-5" /> Convert Lead to Deal
        </button>
      </div>

      {/* Pipeline View */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl">
        {deals.length === 0 ? (
          <div className="text-center py-12 text-slate-550 text-sm">
            No active deals. Complete a lead and convert it to start tracking deals.
          </div>
        ) : (
          <div className="space-y-4">
            {deals.map((deal) => {
              const daysLeft = deal.lead?.locked_until
                ? Math.ceil((new Date(deal.lead.locked_until).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 0
              const isExpiringSoon = daysLeft > 0 && daysLeft <= 15
              const isExpired = daysLeft <= 0

              let lockBadgeClass = "bg-violet-950/20 text-violet-400 border border-violet-850"
              if (isExpiringSoon) {
                lockBadgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/25 animate-pulse"
              } else if (isExpired) {
                lockBadgeClass = "bg-rose-500/10 text-rose-450 border border-rose-500/25"
              }

              return (
                <div key={deal.id} className="flex flex-col lg:flex-row lg:items-center justify-between p-5 bg-slate-900 border border-slate-800 rounded-xl gap-4 hover:border-slate-700/80 transition-all duration-300">
                  <div>
                    <h4 className="font-bold text-white text-base leading-snug">{deal.lead?.school_name}</h4>
                    <p className="text-xs text-slate-450 mt-1">Lead Contact: {deal.lead?.contact_person}</p>
                    <div className="flex flex-wrap items-center gap-4 mt-2">
                      <p className="text-sm font-bold text-violet-400">Deal Volume: ${deal.amount.toLocaleString()}</p>
                      <span className="text-xs text-slate-400">
                        Packages: {deal.s3_quantity || 0} S3, {deal.mini_quantity || 0} Mini
                      </span>
                      {deal.lead?.locked_until && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${lockBadgeClass}`}>
                          <Lock className="h-3 w-3 animate-none" />
                          {isExpired ? 'Lock Expired' : isExpiringSoon ? `${daysLeft} Days Left (Expiring)` : `${daysLeft} Days Locked`}
                        </span>
                      )}
                    </div>
                  </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    deal.status === 'negotiation' ? 'bg-amber-500/10 text-amber-400' :
                    deal.status === 'won' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-red-500/10 text-red-400'
                  }`}>
                    {deal.status}
                  </span>

                  <button
                    onClick={() => {
                      setSelectedDealId(deal.id)
                      setIsFollowupOpen(true)
                      loadFollowups(deal.id)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-850 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 transition-colors"
                  >
                    <Notebook className="h-3.5 w-3.5" /> Followups
                  </button>

                  {deal.status === 'negotiation' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateDealStatus(deal.id, 'won')}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Won
                      </button>
                      <button
                        onClick={() => handleUpdateDealStatus(deal.id, 'lost')}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Lost
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Convert Lead to Deal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-white mb-2">Convert Lead to Deal</h3>
            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Select Locked Lead</label>
                <select
                  required
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">-- Choose School --</option>
                  {unconvertedLeads.map(l => (
                    <option key={l.id} value={l.id}>{l.school_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Estimated Deal Amount ($)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g. 2500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">S3 Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={s3Quantity}
                    onChange={(e) => setS3Quantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Mini Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={miniQuantity}
                    onChange={(e) => setMiniQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-950 hover:bg-slate-850 text-slate-300 font-medium rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-750 text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Convert & Start Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Followups timeline modal */}
      {isFollowupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsFollowupOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-white mb-4">Deal Follow-ups & Notes</h3>
            
            {/* Notes timeline log */}
            <div className="max-h-60 overflow-y-auto space-y-3 mb-6 bg-slate-950 p-3 rounded-lg border border-slate-800/60">
              {recentFollowups.length === 0 ? (
                <p className="text-xs text-slate-550 text-center py-4">No followups logged yet. Add your first note below.</p>
              ) : (
                recentFollowups.map(f => (
                  <div key={f.id} className="text-xs border-b border-slate-900 pb-2 mb-2 last:border-0 last:pb-0">
                    <p className="text-slate-300 leading-normal">{f.notes}</p>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>Logged: {new Date(f.created_at).toLocaleDateString()}</span>
                      {f.follow_up_date && <span className="text-violet-400 font-medium">Next contact: {new Date(f.follow_up_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add note form */}
            <form onSubmit={handleAddFollowup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Followup Notes / Logs</label>
                <textarea
                  required
                  rows={3}
                  value={followupNotes}
                  onChange={(e) => setFollowupNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g. Sent sample device to client, scheduling zoom call..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Next Follow-up Date (Optional)</label>
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsFollowupOpen(false)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 font-medium rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Log Followup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
