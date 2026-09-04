import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { 
  Plus, 
  Search, 
  Handshake, 
  ShieldCheck, 
  UserPlus, 
  Ban, 
  CheckCircle2, 
  Coins, 
  TrendingUp, 
  DollarSign, 
  Briefcase, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  FileSpreadsheet, 
  CreditCard,
  LogIn
} from 'lucide-react'
import { toast } from 'sonner'

type Partner = {
  id: string
  user_id: string
  company_name: string
  region: string
  tier_id: string | null
  status: 'active' | 'inactive' | 'suspended' | 'pending_approval'
  payout_information: any
  created_at: string
  email: string | null
  tier_name: string | null
  commission_rate: number | null
}

type Tier = {
  id: string
  name: string
  min_sales_volume: number
  commission_rate: number
  created_at: string
}

type Lead = {
  id: string
  partner_id: string
  school_name: string
  contact_person: string
  email: string
  phone: string | null
  status: 'new' | 'contacted' | 'qualified' | 'lost' | 'converted_to_deal'
  locked_until: string
  created_at: string
  partner_company: string
}

type Deal = {
  id: string
  lead_id: string
  partner_id: string
  amount: number
  status: 'negotiation' | 'won' | 'lost'
  closed_at: string | null
  created_at: string
  partner_company: string
  school_name: string
}

type Commission = {
  id: string
  partner_id: string
  deal_id: string
  amount: number
  status: 'pending' | 'paid'
  payout_date: string | null
  payout_ref: string | null
  created_at: string
  partner_company: string
  school_name: string
}

type Payment = {
  id: string
  deal_id: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  payment_method: string
  confirmation_ref: string | null
  created_at: string
  partner_company: string
  school_name: string
}

export default function PartnerManagement() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { impersonatePartner } = useAuth()
  const [activeTab, setActiveTab] = useState<'partners' | 'tiers' | 'leads' | 'commissions'>('partners')

  // Search & Pagination States
  const [partnerSearch, setPartnerSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState<string>('all')
  const [partnerPage, setPartnerPage] = useState(1)

  const [leadSearch, setLeadSearch] = useState('')
  const [leadPage, setLeadPage] = useState(1)

  const [commissionPage] = useState(1)

  const pageSize = 10

  // Modals / Dialogs
  const [showAddPartner, setShowAddPartner] = useState(false)
  const [newPartner, setNewPartner] = useState({
    email: '',
    password: '',
    company_name: '',
    region: '',
    tier_id: ''
  })

  const [showAddTier, setShowAddTier] = useState(false)
  const [newTier, setNewTier] = useState({
    name: '',
    min_sales_volume: 0,
    commission_rate: 10
  })

  const [showPayoutModal, setShowPayoutModal] = useState<Commission | null>(null)
  const [payoutRef, setPayoutRef] = useState('')

  const [showConfirmPayment, setShowConfirmPayment] = useState<Payment | null>(null)
  const [paymentRef, setPaymentRef] = useState('')

  // -------------------- Queries --------------------

  // Fetch Partner Tiers
  const { data: tiers = [] } = useQuery<Tier[]>({
    queryKey: ['partner_tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_tiers')
        .select('*')
        .order('min_sales_volume', { ascending: true })
      if (error) throw error
      return data || []
    }
  })

  // Fetch Partners
  const { data: partnersData } = useQuery<{ partners: Partner[]; total: number }>({
    queryKey: ['partners_list', partnerPage, partnerSearch, partnerFilter],
    queryFn: async () => {
      let query = supabase
        .from('partners')
        .select(`
          *,
          user:users (email),
          tier:partner_tiers (name, commission_rate)
        `, { count: 'exact' })

      if (partnerFilter !== 'all') {
        query = query.eq('status', partnerFilter)
      }

      if (partnerSearch.trim()) {
        query = query.ilike('company_name', `%${partnerSearch}%`)
      }

      const from = (partnerPage - 1) * pageSize
      const to = from + pageSize - 1

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const mapped = (data || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        company_name: p.company_name,
        region: p.region,
        tier_id: p.tier_id,
        status: p.status,
        payout_information: p.payout_information,
        created_at: p.created_at,
        email: p.user?.email || null,
        tier_name: p.tier?.name || null,
        commission_rate: p.tier?.commission_rate || null
      }))

      return { partners: mapped, total: count || 0 }
    }
  })

  // Fetch Leads & Deals
  const { data: leadsData } = useQuery<{ leads: Lead[]; total: number }>({
    queryKey: ['leads_admin_list', leadPage, leadSearch],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          partner:partners (company_name)
        `, { count: 'exact' })

      if (leadSearch.trim()) {
        query = query.or(`school_name.ilike.%${leadSearch}%,contact_person.ilike.%${leadSearch}%`)
      }

      const from = (leadPage - 1) * pageSize
      const to = from + pageSize - 1

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const mapped = (data || []).map((l: any) => ({
        ...l,
        partner_company: l.partner?.company_name || 'Unknown Partner'
      }))

      return { leads: mapped, total: count || 0 }
    }
  })

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ['deals_admin_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select(`
          *,
          partner:partners (company_name),
          lead:leads (school_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []).map((d: any) => ({
        ...d,
        partner_company: d.partner?.company_name || 'Unknown Partner',
        school_name: d.lead?.school_name || 'Unknown School'
      }))
    }
  })

  // Fetch Commissions
  const { data: commissionsData } = useQuery<{ commissions: Commission[]; total: number }>({
    queryKey: ['commissions_admin_list', commissionPage],
    queryFn: async () => {
      const from = (commissionPage - 1) * pageSize
      const to = from + pageSize - 1

      const { data, count, error } = await supabase
        .from('commissions')
        .select(`
          *,
          partner:partners (company_name),
          deal:deals (
            lead:leads (school_name)
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const mapped = (data || []).map((c: any) => ({
        ...c,
        partner_company: c.partner?.company_name || 'Unknown Partner',
        school_name: c.deal?.lead?.school_name || 'Unknown School'
      }))

      return { commissions: mapped, total: count || 0 }
    }
  })

  // Fetch Payments
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['payments_admin_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          deal:deals (
            partner:partners (company_name),
            lead:leads (school_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []).map((p: any) => ({
        ...p,
        partner_company: p.deal?.partner?.company_name || 'Unknown Partner',
        school_name: p.deal?.lead?.school_name || 'Unknown School'
      }))
    }
  })

  // -------------------- Mutations --------------------

  // Create Partner Mutation
  const createPartnerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_partner', {
        email_input: newPartner.email,
        password_input: newPartner.password,
        company_name_input: newPartner.company_name,
        region_input: newPartner.region,
        tier_id_input: newPartner.tier_id || null
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Partner created successfully')
      setShowAddPartner(false)
      setNewPartner({ email: '', password: '', company_name: '', region: '', tier_id: '' })
      queryClient.invalidateQueries({ queryKey: ['partners_list'] })
    },
    onError: (err: any) => {
      toast.error(`Error: ${err.message || 'Failed to create partner'}`)
    }
  })

  // Update Partner Status Mutation
  const updatePartnerStatusMutation = useMutation({
    mutationFn: async ({ id, status, tier_id }: { id: string; status: Partner['status']; tier_id?: string | null }) => {
      const updates: any = { status }
      if (tier_id !== undefined) updates.tier_id = tier_id
      
      const { error } = await supabase
        .from('partners')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Partner updated successfully')
      queryClient.invalidateQueries({ queryKey: ['partners_list'] })
    },
    onError: (err: any) => {
      toast.error(`Error updating partner: ${err.message}`)
    }
  })

  // Create Tier Mutation
  const createTierMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('partner_tiers')
        .insert([newTier])
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Commission tier created')
      setShowAddTier(false)
      setNewTier({ name: '', min_sales_volume: 0, commission_rate: 10 })
      queryClient.invalidateQueries({ queryKey: ['partner_tiers'] })
    },
    onError: (err: any) => {
      toast.error(`Error: ${err.message}`)
    }
  })

  // Pay Commission Mutation
  const payCommissionMutation = useMutation({
    mutationFn: async ({ id, ref }: { id: string; ref: string }) => {
      const { error } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          payout_ref: ref,
          payout_date: new Date().toISOString()
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Commission payout recorded')
      setShowPayoutModal(null)
      setPayoutRef('')
      queryClient.invalidateQueries({ queryKey: ['commissions_admin_list'] })
    },
    onError: (err: any) => {
      toast.error(`Error recording payout: ${err.message}`)
    }
  })

  // Complete Payment Mutation
  const completePaymentMutation = useMutation({
    mutationFn: async ({ id, ref, status }: { id: string; ref: string; status: 'completed' | 'failed' }) => {
      const { error } = await supabase
        .from('payments')
        .update({
          status,
          confirmation_ref: ref
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Payment status updated')
      setShowConfirmPayment(null)
      setPaymentRef('')
      queryClient.invalidateQueries({ queryKey: ['payments_admin_list'] })
    },
    onError: (err: any) => {
      toast.error(`Error updating payment: ${err.message}`)
    }
  })

  // Render Functions
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Partner Portal Administration</h2>
          <p className="text-sm text-muted-foreground">
            Manage international partners, approve pending applications, configure tiers, track leads, and confirm payouts.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'partners' && (
            <button
              onClick={() => setShowAddPartner(true)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add New Partner
            </button>
          )}
          {activeTab === 'tiers' && (
            <button
              onClick={() => setShowAddTier(true)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Tier
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('partners')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'partners'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Handshake className="h-4 w-4" />
          Partners
        </button>
        <button
          onClick={() => setActiveTab('tiers')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'tiers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Commission Tiers
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'leads'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Leads & Deals
        </button>
        <button
          onClick={() => setActiveTab('commissions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'commissions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Coins className="h-4 w-4" />
          Commissions & Payouts
        </button>
      </div>

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search partners by company..."
                value={partnerSearch}
                onChange={(e) => {
                  setPartnerSearch(e.target.value)
                  setPartnerPage(1)
                }}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={partnerFilter}
                onChange={(e) => {
                  setPartnerFilter(e.target.value)
                  setPartnerPage(1)
                }}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-4">Company Name & Email</th>
                  <th className="px-6 py-4">Region</th>
                  <th className="px-6 py-4">Tier / Rate</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partnersData?.partners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-muted/20">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{partner.company_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{partner.email}</div>
                    </td>
                    <td className="px-6 py-4">{partner.region}</td>
                    <td className="px-6 py-4">
                      <select
                        value={partner.tier_id || ''}
                        onChange={(e) => {
                          updatePartnerStatusMutation.mutate({
                            id: partner.id,
                            status: partner.status,
                            tier_id: e.target.value || null
                          })
                        }}
                        className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">No Tier</option>
                        {tiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.commission_rate}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        partner.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                        partner.status === 'pending_approval' ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
                        partner.status === 'suspended' ? 'bg-rose-500/10 text-rose-500' :
                        'bg-slate-500/10 text-slate-500'
                      }`}>
                        {partner.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(partner.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right flex gap-1 justify-end">
                      {partner.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: 'active' })}
                            className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-colors"
                            title="Approve Partner"
                          >
                            <ShieldCheck className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: 'inactive' })}
                            className="inline-flex items-center justify-center p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors"
                            title="Reject Partner"
                          >
                            <X className="h-4.5 w-4.5" />
                          </button>
                        </>
                      )}
                      {partner.status === 'active' && (
                        <button
                          onClick={() => {
                            impersonatePartner(partner.id, partner.user_id)
                            navigate('/partner')
                          }}
                          className="inline-flex items-center justify-center p-1.5 text-indigo-500 hover:bg-indigo-500/10 rounded-md transition-colors"
                          title="Impersonate Partner"
                        >
                          <LogIn className="h-4.5 w-4.5" />
                        </button>
                      )}
                      {partner.status === 'active' ? (
                        <button
                          onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: 'suspended' })}
                          className="inline-flex items-center justify-center p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors"
                          title="Suspend Partner"
                        >
                          <Ban className="h-4.5 w-4.5" />
                        </button>
                      ) : (
                        partner.status !== 'pending_approval' && (
                          <button
                            onClick={() => updatePartnerStatusMutation.mutate({ id: partner.id, status: 'active' })}
                            className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-colors"
                            title="Activate Partner"
                          >
                            <CheckCircle2 className="h-4.5 w-4.5" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
                {(!partnersData || partnersData.partners.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No partners found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {partnersData && partnersData.total > pageSize && (
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">
                Showing {(partnerPage - 1) * pageSize + 1} to {Math.min(partnerPage * pageSize, partnersData.total)} of {partnersData.total} partners
              </span>
              <div className="flex gap-1">
                <button
                  disabled={partnerPage === 1}
                  onClick={() => setPartnerPage(p => p - 1)}
                  className="p-1.5 rounded-md border border-border bg-card hover:bg-muted/50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={partnerPage * pageSize >= partnersData.total}
                  onClick={() => setPartnerPage(p => p + 1)}
                  className="p-1.5 rounded-md border border-border bg-card hover:bg-muted/50 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tiers Tab */}
      {activeTab === 'tiers' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-4">Tier Name</th>
                  <th className="px-6 py-4">Minimum Sales Volume required</th>
                  <th className="px-6 py-4">Commission Rate</th>
                  <th className="px-6 py-4">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-muted/20">
                    <td className="px-6 py-4 font-medium text-foreground">{tier.name}</td>
                    <td className="px-6 py-4 font-mono">${Number(tier.min_sales_volume).toLocaleString()}</td>
                    <td className="px-6 py-4 text-emerald-500 font-bold">{tier.commission_rate}%</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(tier.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leads & Deals Tab */}
      {activeTab === 'leads' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leads */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-500" />
                Active Registered Leads
              </h3>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search leads by school or contact..."
                value={leadSearch}
                onChange={(e) => {
                  setLeadSearch(e.target.value)
                  setLeadPage(1)
                }}
                className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/50 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">School & Partner</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Locked Until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leadsData?.leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{lead.school_name}</div>
                        <div className="text-xs text-muted-foreground">By: {lead.partner_company}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          lead.status === 'converted_to_deal' ? 'bg-emerald-500/10 text-emerald-500' :
                          lead.status === 'lost' ? 'bg-rose-500/10 text-rose-500' :
                          'bg-indigo-500/10 text-indigo-500'
                        }`}>
                          {lead.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(lead.locked_until).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deals */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-indigo-500" />
                Active Sales Deals
              </h3>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/50 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">School / Partner</th>
                    <th className="px-4 py-3">Deal Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{deal.school_name}</div>
                        <div className="text-xs text-muted-foreground">Partner: {deal.partner_company}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">${Number(deal.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          deal.status === 'won' ? 'bg-emerald-500/10 text-emerald-500' :
                          deal.status === 'lost' ? 'bg-rose-500/10 text-rose-500' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>
                          {deal.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Commissions & Payouts Tab */}
      {activeTab === 'commissions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Commissions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-500" />
              Partner Commissions
            </h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/50 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Partner & School</th>
                    <th className="px-4 py-3">Commission</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissionsData?.commissions.map((comm) => (
                    <tr key={comm.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{comm.partner_company}</div>
                        <div className="text-xs text-muted-foreground">{comm.school_name}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-500">${Number(comm.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          comm.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {comm.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {comm.status === 'pending' && (
                          <button
                            onClick={() => setShowPayoutModal(comm)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2.5 py-1 text-xs font-medium transition-colors shadow-sm"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments (Incoming / Client Payments to confirm) */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-500" />
              Incoming Client Payments (Confirmations)
            </h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/50 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Partner & School</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((pmt) => (
                    <tr key={pmt.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{pmt.school_name}</div>
                        <div className="text-xs text-muted-foreground">By partner: {pmt.partner_company} ({pmt.payment_method})</div>
                      </td>
                      <td className="px-4 py-3 font-semibold">${Number(pmt.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          pmt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                          pmt.status === 'failed' ? 'bg-rose-500/10 text-rose-500' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>
                          {pmt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pmt.status === 'pending' && (
                          <button
                            onClick={() => setShowConfirmPayment(pmt)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2.5 py-1 text-xs font-medium transition-colors shadow-sm"
                          >
                            Verify
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {showAddPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card rounded-xl border border-border p-6 shadow-xl relative">
            <button
              onClick={() => setShowAddPartner(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add Partner Account
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Company Email</label>
                <input
                  type="email"
                  value={newPartner.email}
                  onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                  placeholder="partner@company.com"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
                <input
                  type="password"
                  value={newPartner.password}
                  onChange={(e) => setNewPartner({ ...newPartner, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Company Name</label>
                <input
                  type="text"
                  value={newPartner.company_name}
                  onChange={(e) => setNewPartner({ ...newPartner, company_name: e.target.value })}
                  placeholder="Global Sales Ltd"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Operating Region</label>
                <input
                  type="text"
                  value={newPartner.region}
                  onChange={(e) => setNewPartner({ ...newPartner, region: e.target.value })}
                  placeholder="Western Europe"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Initial Tier</label>
                <select
                  value={newPartner.tier_id}
                  onChange={(e) => setNewPartner({ ...newPartner, tier_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No Tier</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.commission_rate}%)
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => createPartnerMutation.mutate()}
                disabled={createPartnerMutation.isPending}
                className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createPartnerMutation.isPending ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tier Modal */}
      {showAddTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card rounded-xl border border-border p-6 shadow-xl relative">
            <button
              onClick={() => setShowAddTier(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Add Commission Tier
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tier Name</label>
                <input
                  type="text"
                  value={newTier.name}
                  onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                  placeholder="Platinum"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Minimum Volume ($)</label>
                <input
                  type="number"
                  value={newTier.min_sales_volume}
                  onChange={(e) => setNewTier({ ...newTier, min_sales_volume: Number(e.target.value) })}
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Commission Rate (%)</label>
                <input
                  type="number"
                  value={newTier.commission_rate}
                  onChange={(e) => setNewTier({ ...newTier, commission_rate: Number(e.target.value) })}
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={() => createTierMutation.mutate()}
                disabled={createTierMutation.isPending}
                className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createTierMutation.isPending ? 'Creating Tier...' : 'Create Tier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commission Payout Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card rounded-xl border border-border p-6 shadow-xl relative">
            <button
              onClick={() => setShowPayoutModal(null)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Confirm Commission Payout
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Recording payout of <strong className="text-foreground">${Number(showPayoutModal.amount).toLocaleString()}</strong> to partner <strong>{showPayoutModal.partner_company}</strong>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reference / TX ID</label>
                <input
                  type="text"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder="BANK-TX-998877"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={() => payCommissionMutation.mutate({ id: showPayoutModal.id, ref: payoutRef })}
                disabled={payCommissionMutation.isPending || !payoutRef}
                className="w-full bg-emerald-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                Record Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Payment Modal */}
      {showConfirmPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card rounded-xl border border-border p-6 shadow-xl relative">
            <button
              onClick={() => setShowConfirmPayment(null)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-500" />
              Verify Client Payment
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Verify payment of <strong className="text-foreground">${Number(showConfirmPayment.amount).toLocaleString()}</strong> for <strong>{showConfirmPayment.school_name}</strong> submitted by partner <strong>{showConfirmPayment.partner_company}</strong>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Confirmation / Check Ref</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="CONF-12345"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => completePaymentMutation.mutate({ id: showConfirmPayment.id, ref: paymentRef, status: 'completed' })}
                  disabled={completePaymentMutation.isPending || !paymentRef}
                  className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => completePaymentMutation.mutate({ id: showConfirmPayment.id, ref: paymentRef, status: 'failed' })}
                  disabled={completePaymentMutation.isPending || !paymentRef}
                  className="flex-1 bg-rose-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-rose-755 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
