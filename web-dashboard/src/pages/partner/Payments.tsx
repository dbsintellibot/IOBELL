import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Plus, ShieldAlert, CheckCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface Payment {
  id: string
  deal_id: string
  amount: number
  status: string
  payment_method: string
  confirmation_ref: string
  created_at: string
  deal: {
    lead: {
      school_name: string
    }
  }
}

interface Deal {
  id: string
  lead: {
    school_name: string
  }
}

export default function Payments() {
  const { partnerId, loading: authLoading } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Payment Form Fields
  const [selectedDealId, setSelectedDealId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [confirmationRef, setConfirmationRef] = useState('')

  const fetchPaymentsAndDeals = async () => {
    if (!partnerId) return
    try {
      setLoading(true)

      // Fetch payments matching partner
      const { data: paymentsData, error: paymentsErr } = await supabase
        .from('payments')
        .select(`
          id, deal_id, amount, status, payment_method, confirmation_ref, created_at,
          deal:deals!inner(partner_id, lead:leads(school_name))
        `)
        .eq('deal.partner_id', partnerId)
        .order('created_at', { ascending: false })

      if (paymentsErr) throw paymentsErr
      setPayments(paymentsData as any || [])

      // Fetch active deals to link payments
      const { data: dealsData } = await supabase
        .from('deals')
        .select('id, lead:leads(school_name)')
        .eq('partner_id', partnerId)

      setDeals(dealsData as any || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch payments data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (partnerId) {
      fetchPaymentsAndDeals()
    }
  }, [partnerId])

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDealId || !amount || !paymentMethod) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('payments')
        .insert({
          deal_id: selectedDealId,
          amount: parseFloat(amount),
          status: 'pending',
          payment_method: paymentMethod,
          confirmation_ref: confirmationRef || null
        })

      if (error) throw error

      toast.success('Payment logged! Awaiting super-admin confirmation.')
      setIsModalOpen(false)
      setSelectedDealId('')
      setAmount('')
      setConfirmationRef('')
      fetchPaymentsAndDeals()
    } catch (err: any) {
      toast.error(err.message || 'Failed to register payment')
    } finally {
      setLoading(false)
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
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold tracking-tight text-white">Payment Confirmation registry</h3>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-750 text-white font-medium rounded-xl transition-all duration-200"
        >
          <Plus className="h-5 w-5" /> Log Client Payment
        </button>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 shadow-xl">
        {payments.length === 0 ? (
          <div className="text-center py-12 text-slate-550 text-sm">
            No registered payments found. Track payments from your deals here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 uppercase text-[10px] tracking-wider font-bold">
                  <th className="pb-3">Deal / School</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3">Confirmation Ref</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Date logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350">
                {payments.map((pmt) => (
                  <tr key={pmt.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-3.5 font-semibold text-white">{pmt.deal?.lead?.school_name}</td>
                    <td className="py-3.5 font-semibold text-violet-400">${pmt.amount.toLocaleString()}</td>
                    <td className="py-3.5 capitalize">{pmt.payment_method.replace('_', ' ')}</td>
                    <td className="py-3.5 font-mono text-xs">{pmt.confirmation_ref || 'N/A'}</td>
                    <td className="py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        pmt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        pmt.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {pmt.status === 'completed' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {pmt.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-xs">{new Date(pmt.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-white mb-2">Log Client Payment</h3>
            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Linked Deal / School</label>
                <select
                  required
                  value={selectedDealId}
                  onChange={(e) => setSelectedDealId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">-- Choose Deal --</option>
                  {deals.map(d => (
                    <option key={d.id} value={d.id}>{d.lead?.school_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Amount Paid ($)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g. 1500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="paypal">PayPal</option>
                    <option value="stripe">Stripe</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-450 mb-2">Transaction ID / Confirmation Ref</label>
                <input
                  type="text"
                  value={confirmationRef}
                  onChange={(e) => setConfirmationRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g. TXN-928189"
                />
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
                  Register Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
