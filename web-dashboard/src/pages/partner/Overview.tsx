import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Link } from 'react-router-dom'
import { Users, Handshake, DollarSign, ArrowUpRight, TrendingUp, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface PartnerProfile {
  id: string
  company_name: string
  region: string
  status: string
  tier: {
    name: string
    commission_rate: number
  } | null
}

export default function PartnerOverview() {
  const { user, partnerId, loading: authLoading } = useAuth()
  const [partner, setPartner] = useState<PartnerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupMode, setSetupMode] = useState(false)
  
  // Stats
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeDeals: 0,
    earnedCommission: 0,
    recentLeads: [] as any[],
  })

  // Setup form fields
  const [companyName, setCompanyName] = useState('')
  const [region, setRegion] = useState('')

  const fetchPartnerData = async () => {
    try {
      setLoading(true)
      const query = supabase
        .from('partners')
        .select(`
          id, company_name, region, status,
          tier:partner_tiers(name, commission_rate)
        `)

      const { data: partnerData, error: partnerError } = partnerId
        ? await query.eq('id', partnerId).maybeSingle()
        : await query.eq('user_id', user?.id).maybeSingle()

      if (partnerError) throw partnerError

      if (!partnerData) {
        setSetupMode(true)
        return
      }

      setPartner(partnerData as any)

      // Fetch stats
      const [leadsRes, dealsRes, commissionRes, recentLeadsRes] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('partner_id', partnerData.id),
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('partner_id', partnerData.id).eq('status', 'negotiation'),
        supabase.from('commissions').select('amount').eq('partner_id', partnerData.id),
        supabase.from('leads').select('*').eq('partner_id', partnerData.id).order('created_at', { ascending: false }).limit(5)
      ])

      const totalEarned = (commissionRes.data || []).reduce((acc, curr) => acc + Number(curr.amount), 0)

      setStats({
        totalLeads: leadsRes.count || 0,
        activeDeals: dealsRes.count || 0,
        earnedCommission: totalEarned,
        recentLeads: recentLeadsRes.data || [],
      })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to load partner details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id || partnerId) {
      fetchPartnerData()
    }
  }, [user?.id, partnerId])

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName || !region) {
      toast.error('Please fill in all fields')
      return
    }

    try {
      setLoading(true)
      
      // Get Default Tier (Bronze)
      const { data: tierData } = await supabase
        .from('partner_tiers')
        .select('id')
        .eq('name', 'Bronze')
        .single()

      const { error } = await supabase
        .from('partners')
        .insert({
          user_id: user?.id,
          company_name: companyName,
          region: region,
          tier_id: tierData?.id,
          status: 'active'
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Partner profile initialized successfully!')
      setSetupMode(false)
      fetchPartnerData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to initialize partner profile')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  if (setupMode) {
    return (
      <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md mt-10">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Welcome to AutoBell Partners</h2>
        <p className="text-slate-400 text-sm mb-6">
          To start selling AutoBell, locking deals, and earning commissions, please complete your partner registration.
        </p>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Acme Distributions"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Selling Region/Territory
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. North America, Germany"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg shadow-lg hover:shadow-violet-600/20 transition-all duration-200"
          >
            Initialize Partner Account
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-6 bg-gradient-to-r from-violet-900/40 via-indigo-900/20 to-slate-950 border border-violet-850/30 rounded-2xl">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{partner?.company_name}</h2>
          <p className="text-slate-400 text-sm mt-1">Authorized AutoBell distributor for <span className="text-violet-300 font-semibold">{partner?.region}</span></p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
            <ShieldCheck className="h-5 w-5 text-violet-400" />
            <div className="text-left">
              <span className="block text-[10px] uppercase font-bold text-slate-450">Current Tier</span>
              <span className="text-sm font-bold text-violet-300">{partner?.tier?.name || 'Bronze'} ({partner?.tier?.commission_rate || 10}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {/* Total Leads */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 flex items-center justify-between shadow-lg">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Leads Registered</span>
            <span className="text-3xl font-bold text-white">{stats.totalLeads}</span>
          </div>
          <div className="p-3 bg-violet-600/10 text-violet-400 rounded-xl">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Active Deals */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 flex items-center justify-between shadow-lg">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Active Pipeline Deals</span>
            <span className="text-3xl font-bold text-white">{stats.activeDeals}</span>
          </div>
          <div className="p-3 bg-blue-600/10 text-blue-400 rounded-xl">
            <Handshake className="h-6 w-6" />
          </div>
        </div>

        {/* Total Earned */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 flex items-center justify-between shadow-lg">
          <div>
            <span className="block text-xs uppercase font-bold tracking-wider text-slate-450 mb-1">Total Commission Earned</span>
            <span className="text-3xl font-bold text-white">${stats.earnedCommission.toLocaleString()}</span>
          </div>
          <div className="p-3 bg-emerald-600/10 text-emerald-400 rounded-xl">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Leads / Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold tracking-tight text-white">Recent Registered Leads</h3>
            <Link to="/partner/leads" className="text-violet-400 hover:text-violet-300 text-sm font-semibold flex items-center gap-1 transition-all duration-200">
              View All <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            {stats.recentLeads.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No registered leads yet. Start by creating a lead.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-450 uppercase text-[10px] tracking-wider font-bold">
                    <th className="pb-3">School</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Locked Until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {stats.recentLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 font-semibold text-white">{lead.school_name}</td>
                      <td className="py-3.5">{lead.contact_person}</td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          lead.status === 'new' ? 'bg-blue-500/10 text-blue-400' :
                          lead.status === 'contacted' ? 'bg-amber-500/10 text-amber-400' :
                          lead.status === 'qualified' ? 'bg-violet-500/10 text-violet-400' :
                          lead.status === 'converted_to_deal' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {lead.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs font-mono text-slate-450">
                        {new Date(lead.locked_until).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Commission Growth Card */}
        <div className="bg-gradient-to-b from-slate-900/60 to-slate-950 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-violet-400" />
              <h3 className="text-base font-bold text-white">Tier Progress</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Grow your sales volume to move to Silver or Gold tiers, unlocking higher commissions up to 20% per confirmed deal.
            </p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400 font-bold mb-1">
                  <span>Bronze (10%)</span>
                  <span>Silver (15%)</span>
                </div>
                <div className="w-full bg-slate-850 rounded-full h-2">
                  <div 
                    className="bg-violet-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min((stats.earnedCommission / 5000) * 100, 100)}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  ${stats.earnedCommission.toLocaleString()} / $5,000 Volume Target
                </span>
              </div>
            </div>
          </div>
          <Link
            to="/partner/deals"
            className="w-full text-center py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-medium rounded-xl text-sm transition-all duration-200 mt-6"
          >
            View Active Pipeline
          </Link>
        </div>
      </div>
    </div>
  )
}
