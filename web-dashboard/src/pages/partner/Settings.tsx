import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ShieldAlert, Save, Key, Banknote } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const { user, partnerId, loading: authLoading } = useAuth()
  const [partner, setPartner] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Profile Fields
  const [companyName, setCompanyName] = useState('')
  const [region, setRegion] = useState('')
  
  // Payout Information Fields
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [routingCode, setRoutingCode] = useState('')

  const fetchSettingsData = async () => {
    try {
      setLoading(true)
      const query = supabase
        .from('partners')
        .select('*')

      const { data: partnerData, error } = partnerId
        ? await query.eq('id', partnerId).maybeSingle()
        : await query.eq('user_id', user?.id).maybeSingle()

      if (error) throw error
      if (!partnerData) return

      setPartner(partnerData)
      setCompanyName(partnerData.company_name)
      setRegion(partnerData.region)

      const payout = partnerData.payout_information || {}
      setBankName(payout.bank_name || '')
      setAccountNumber(payout.account_number || '')
      setAccountName(payout.account_name || '')
      setRoutingCode(payout.routing_code || '')
    } catch (err: any) {
      toast.error('Failed to load settings configuration')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id || partnerId) {
      fetchSettingsData()
    }
  }, [user?.id, partnerId])

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return

    try {
      setLoading(true)
      const payout_information = {
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        routing_code: routingCode
      }

      const { error } = await supabase
        .from('partners')
        .update({
          company_name: companyName,
          region,
          payout_information
        })
        .eq('id', partner.id)

      if (error) throw error
      toast.success('Partner settings updated successfully!')
      fetchSettingsData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || (loading && !partner)) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <form onSubmit={handleUpdateSettings} className="space-y-6">
        {/* Company Settings */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
            <Key className="h-5 w-5 text-violet-400" /> Distributor Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Company Name</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Sales Region</label>
              <input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Payout Settings */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
            <Banknote className="h-5 w-5 text-violet-400" /> Payout / Bank Account Info
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. JPMorgan Chase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Account Name</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. John Doe Consulting"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Account Number / IBAN</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Routing Transit Code / Swift</label>
              <input
                type="text"
                value={routingCode}
                onChange={(e) => setRoutingCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl shadow-lg hover:shadow-violet-600/10 transition-all duration-200"
          >
            <Save className="h-5 w-5" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}
