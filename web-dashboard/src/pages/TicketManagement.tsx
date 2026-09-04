import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Ticket, Plus, MessageSquare, Clock, Filter, Search, Loader2 } from 'lucide-react'

interface TicketItem {
  id: string
  ticket_number: number
  school_id: string | null
  reporter_id: string
  title: string
  description: string
  type: 'bug' | 'feature_request' | 'support'
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'wont_fix'
  error_stack?: string
  created_at: string
  updated_at: string
  resolved_at?: string
  schools?: { name: string }
}

interface CommentItem {
  id: string
  ticket_id: string
  user_id: string
  message: string
  is_internal: boolean
  created_at: string
  users?: { full_name: string; role: string }
}

interface SchoolOption {
  id: string
  name: string
}

export default function TicketManagement() {
  const { role, schoolId } = useAuth()
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Form State for new ticket
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newType, setNewType] = useState<'bug' | 'feature_request' | 'support'>('bug')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('')
  const [targetDeviceId, setTargetDeviceId] = useState<string>('')
  const [schoolDevices, setSchoolDevices] = useState<{ id: string; name: string; mac_address: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('tickets')
        .select('*, schools(name)')
        .order('created_at', { ascending: false })

      if (role !== 'super_admin' && schoolId) {
        query = query.eq('school_id', schoolId)
      }

      const { data, error } = await query
      if (error) throw error
      setTickets((data as TicketItem[]) || [])
    } catch (err) {
      console.error('Failed to fetch tickets:', err)
    } finally {
      setLoading(false)
    }
  }, [role, schoolId])

  const fetchSchools = useCallback(async () => {
    if (role !== 'super_admin') return
    try {
      const { data } = await supabase.from('schools').select('id, name').order('name')
      if (data) setSchools(data as SchoolOption[])
    } catch (err) {
      console.error('Failed to fetch schools:', err)
    }
  }, [role])

  const fetchDevices = useCallback(async () => {
    const targetSchoolId = schoolId || selectedSchoolId
    if (!targetSchoolId) {
      setSchoolDevices([])
      return
    }
    try {
      const { data } = await supabase.from('bell_devices').select('id, name, mac_address').eq('school_id', targetSchoolId).order('name')
      if (data) setSchoolDevices(data as { id: string; name: string; mac_address: string }[])
    } catch (err) {
      console.error('Failed to fetch devices for ticket:', err)
    }
  }, [schoolId, selectedSchoolId])

  useEffect(() => {
    fetchTickets()
    fetchSchools()
    fetchDevices()
  }, [fetchTickets, fetchSchools, fetchDevices])

  const fetchComments = async (ticketId: string) => {
    try {
      // 1. Try fetching with foreign key join to public.users
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*, users!ticket_comments_user_id_fkey(full_name, role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setComments(data as unknown as CommentItem[])
        return
      }

      // 2. Fallback query if join fails
      const { data: fallbackData } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

      if (fallbackData) {
        setComments(fallbackData as CommentItem[])
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    }
  }

  const handleSelectTicket = (t: TicketItem) => {
    setSelectedTicket(t)
    setErrorMsg(null)
    fetchComments(t.id)
  }

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newDescription.trim()) return

    setSubmitting(true)
    setErrorMsg(null)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id

      const targetSchoolId = schoolId || (selectedSchoolId ? selectedSchoolId : null)

      let finalDescription = newDescription.trim()
      if (targetDeviceId) {
        const dev = schoolDevices.find(d => d.id === targetDeviceId)
        if (dev) {
          finalDescription = `[Target Hardware: ${dev.name} (MAC: ${dev.mac_address || 'N/A'})]\n\n${finalDescription}`
        }
      }

      const { error } = await supabase.from('tickets').insert({
        school_id: targetSchoolId,
        reporter_id: userId,
        title: newTitle.trim(),
        description: finalDescription,
        type: newType,
        priority: newPriority,
        status: 'open',
      })

      if (error) throw error

      setNewTitle('')
      setNewDescription('')
      setTargetDeviceId('')
      setShowCreateModal(false)
      fetchTickets()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error creating ticket'
      setErrorMsg(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !newComment.trim()) return

    setSubmittingComment(true)
    setErrorMsg(null)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id

      if (!userId) {
        throw new Error('User authentication session lost. Please sign in again.')
      }

      const { error } = await supabase.from('ticket_comments').insert({
        ticket_id: selectedTicket.id,
        user_id: userId,
        message: newComment.trim(),
        is_internal: false,
      })

      if (error) throw error

      setNewComment('')
      await fetchComments(selectedTicket.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post comment'
      console.error('Add comment error:', err)
      setErrorMsg(message)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleUpdateStatus = async (ticketId: string, status: TicketItem['status']) => {
    try {
      const updates: Partial<TicketItem> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'resolved' || status === 'closed') {
        updates.resolved_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', ticketId)

      if (error) throw error

      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, ...updates } : null))
      }
      fetchTickets()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating status'
      setErrorMsg(message)
    }
  }

  const isOverSLA = (createdAt: string, status: string) => {
    if (status === 'resolved' || status === 'closed') return false
    const diffMs = Date.now() - new Date(createdAt).getTime()
    return diffMs > 48 * 60 * 60 * 1000 // 48 hours SLA rule
  }

  const filteredTickets = tickets.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        String(t.ticket_number).includes(q)
      )
    }
    return true
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Ticket className="w-7 h-7 text-indigo-400" />
            Support & Feature Ticketing
          </h1>
          <p className="text-sm text-slate-400">Track bugs, feature requests, and system support inquiries.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          Create New Ticket
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-300 px-4 py-3 rounded-xl text-xs font-semibold flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets by title or # ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter className="w-4 h-4" />
          <span>Type:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="bug">Bug / Error</option>
            <option value="feature_request">Feature Request</option>
            <option value="support">Support</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[650px]">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
            <span>Tickets ({filteredTickets.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No matching tickets found.</div>
            ) : (
              filteredTickets.map((t) => {
                const overSLA = isOverSLA(t.created_at, t.status)
                const isSelected = selectedTicket?.id === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTicket(t)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-950/40 border-l-4 border-indigo-500' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-slate-400">#{t.ticket_number}</span>
                      <div className="flex items-center gap-1.5">
                        {overSLA && (
                          <span className="bg-red-950 text-red-400 border border-red-800 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold">
                            <Clock className="w-2.5 h-2.5" /> SLA Breach (&gt;48h)
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold capitalize ${
                          t.priority === 'critical' ? 'bg-red-950 text-red-400 border border-red-800' :
                          t.priority === 'high' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {t.priority}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xs font-bold text-slate-100 line-clamp-1">{t.title}</h3>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{t.description}</p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-3">
                      <span className="capitalize">{t.type.replace('_', ' ')}</span>
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Ticket Details & Thread */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[650px]">
          {selectedTicket ? (
            <div className="flex flex-col h-full">
              {/* Ticket Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono text-indigo-400 font-semibold">
                      Ticket #{selectedTicket.ticket_number}
                    </span>
                    <h2 className="text-lg font-bold text-slate-100">{selectedTicket.title}</h2>
                    {selectedTicket.schools?.name && (
                      <p className="text-xs text-slate-400">School: {selectedTicket.schools.name}</p>
                    )}
                  </div>

                  {/* Status Dropdown / Buttons */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as TicketItem['status'])}
                      className="bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="wont_fix">Won't Fix</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>

                {selectedTicket.error_stack && (
                  <div className="bg-red-950/50 border border-red-900/50 rounded-lg p-3 font-mono text-[11px] text-red-300 overflow-x-auto max-h-32">
                    <p className="font-bold mb-1">Attached Error Traceback:</p>
                    <pre>{selectedTicket.error_stack}</pre>
                  </div>
                )}
              </div>

              {/* Activity Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Comments & Activity Thread
                </h4>

                {comments.length === 0 ? (
                  <p className="text-xs text-slate-500">No comments yet. Start the conversation below.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-indigo-300">
                          {c.users?.full_name || (c.users?.role ? `User (${c.users.role})` : 'User')}
                        </span>
                        <span className="text-slate-500">{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{c.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* New Comment Input */}
              <form onSubmit={handleAddComment} className="p-4 border-t border-slate-800 bg-slate-950 flex gap-2">
                <input
                  type="text"
                  placeholder="Type a comment or update..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={submittingComment}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submittingComment}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submittingComment ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    'Post Comment'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Select a ticket from the left column to view details and activity.
            </div>
          )}
        </div>
      </div>

      {/* Modal for Creating New Ticket */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-100">Create New Support Ticket</h2>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="Short summary of the issue or feature request"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {role === 'super_admin' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Target School (Optional)</label>
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="">Global / Unassigned</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as TicketItem['type'])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="bug">Bug / Error</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="support">General Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketItem['priority'])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {schoolDevices.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Target Bell Hardware (Optional)</label>
                  <select
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="">General / All School Bells</option>
                    {schoolDevices.map((d) => (
                      <option key={d.id} value={d.id}>🔔 {d.name} ({d.mac_address || 'No MAC'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detailed description of what happened or what feature you need..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
                >
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
