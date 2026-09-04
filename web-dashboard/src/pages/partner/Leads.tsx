import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Plus, Search, ShieldAlert, Lock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Lead {
  id: string
  school_name: string
  contact_person: string
  email: string
  phone: string
  status: string
  locked_until: string
  created_at: string
}

export default function Leads() {
  const { partnerId, loading: authLoading } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form Fields
  const [schoolName, setSchoolName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const fetchLeads = async () => {
    if (!partnerId) return
    try {
      setLoading(true)
      const { data: leadsData, error } = await supabase
        .from('leads')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLeads(leadsData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (partnerId) {
      fetchLeads()
    }
  }, [partnerId])

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partnerId) {
      toast.error('Partner profile not loaded')
      return
    }

    try {
      setLoading(true)
      // Check if lead with active school name already exists to prevent duplicate locking
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('school_name', schoolName)
        .not('status', 'in', '("lost","converted_to_deal")')
        .maybeSingle()

      if (existingLead) {
        toast.error('This school is already locked by another partner!')
        return
      }

      const { error } = await supabase
        .from('leads')
        .insert({
          partner_id: partnerId,
          school_name: schoolName,
          contact_person: contactPerson,
          email,
          phone,
          status: 'new'
        })

      if (error) throw error

      toast.success(`Deal Locked! ${schoolName} is locked for your region for 90 days.`)
      setIsModalOpen(false)
      // Reset form
      setSchoolName('')
      setContactPerson('')
      setEmail('')
      setPhone('')
      fetchLeads()
    } catch (err: any) {
      toast.error(err.message || 'Failed to register lead')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLead = async (id: string) => {
    if (!confirm('Are you sure you want to release this locked lead? Other partners will be able to claim it.')) return

    try {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error

      toast.success('Lead released successfully.')
      fetchLeads()
    } catch (err: any) {
      toast.error(err.message || 'Failed to release lead')
    }
  }

  const filteredLeads = leads.filter(lead => 
    lead.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.contact_person.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
        <p className="mt-1 text-xs text-slate-400">Please go to Overview to setup your profile first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-550 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-medium rounded-xl shadow-lg shadow-violet-600/10 transition-all duration-200"
        >
          <Plus className="h-5 w-5" /> Register & Lock Lead
        </button>
      </div>

      {/* Leads List */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl">
        {filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            {searchTerm ? 'No leads match your search criteria.' : 'No registered leads yet. Start expanding your network!'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLeads.map((lead) => {
              const daysLeft = Math.ceil(
                (new Date(lead.locked_until).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
              )
              const isExpiringSoon = daysLeft > 0 && daysLeft <= 15
              const isExpired = daysLeft <= 0

              let lockBadgeClass = "bg-violet-950/20 text-violet-400 border border-violet-850"
              if (isExpiringSoon) {
                lockBadgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/25 animate-pulse"
              } else if (isExpired) {
                lockBadgeClass = "bg-rose-500/10 text-rose-450 border border-rose-500/25"
              }

              return (
                <div key={lead.id} className="relative group bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-white text-base leading-snug">{lead.school_name}</h4>
                      <p className="text-xs text-slate-450 mt-0.5">Contact: {lead.contact_person}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                      lead.status === 'new' ? 'bg-blue-500/10 text-blue-400' :
                      lead.status === 'contacted' ? 'bg-amber-500/10 text-amber-400' :
                      lead.status === 'qualified' ? 'bg-violet-500/10 text-violet-400' :
                      lead.status === 'converted_to_deal' ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-slate-850 text-slate-450'
                    }`}>
                      {lead.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-400 border-t border-slate-800/60 pt-4 mb-4">
                    <p className="flex items-center gap-1.5"><span className="text-slate-500 font-medium">Email:</span> {lead.email}</p>
                    {lead.phone && <p className="flex items-center gap-1.5"><span className="text-slate-500 font-medium">Phone:</span> {lead.phone}</p>}
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-800/60 pt-4">
                    <div className={`flex items-center gap-1.5 font-semibold px-2 py-1 rounded-lg ${lockBadgeClass}`}>
                      <Lock className="h-3.5 w-3.5" />
                      <span>{isExpired ? 'Lock Expired (Unlocked)' : isExpiringSoon ? `${daysLeft} Days Left (Expiring)` : `${daysLeft} Days Locked`}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteLead(lead.id)}
                      className="p-1.5 bg-slate-950 hover:bg-red-950/40 text-slate-500 hover:text-red-400 rounded-lg transition-all duration-200"
                      title="Release Lead"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-white mb-1">Register School & Lock Deal</h3>
            <p className="text-xs text-slate-400 mb-6">
              Locking prevents other distributors from claiming this school/institution for the next 90 days.
            </p>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">School/Institution Name</label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g. Oakridge High School"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Contact Person</label>
                  <input
                    type="text"
                    required
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="+1 555-0199"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="johndoe@school.edu"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-800/80 pt-6 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-950 hover:bg-slate-850 text-slate-300 font-medium rounded-lg text-sm transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg text-sm transition-all duration-200"
                >
                  Confirm & Lock Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
