import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Receipt, GitMerge, UserPlus, Trash2, Activity, UserX, Copy, Check, QrCode, X, ExternalLink } from 'lucide-react'
import Navbar from '../components/Navbar'
import AddExpenseSheet from '../components/AddExpenseSheet'
import { api, BASE } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { formatMoney } from '../utils/currency'

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { displayCurrency } = useCurrency()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState({ debts: [], balances: {} })
  const [auditLogs, setAuditLogs] = useState([])
  const [tab, setTab] = useState('expenses')
  const [showSheet, setShowSheet] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddGuest, setShowAddGuest] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [qrModal, setQrModal] = useState(null) // { username, userId, dataUrl, amount }

  const load = async () => {
    try {
      const [g, e, s] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/expenses`),
        api.get(`/groups/${groupId}/settlements`),
      ])
      setGroup(g)
      setExpenses(e)
      setSettlements(s)
    } catch {
      setError('Failed to load group')
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = () =>
    api.get(`/groups/${groupId}/audit-logs`).then(setAuditLogs).catch(() => {})

  useEffect(() => {
    load()
  }, [groupId])

  useEffect(() => {
    if (tab === 'activity') loadAuditLogs()
  }, [tab])

  const handleMarkPaid = async (debt) => {
    try {
      await api.post(`/groups/${groupId}/settlements`, {
        from_participant_key: debt.from_participant_key,
        to_participant_key: debt.to_participant_key,
        amount: debt.amount,
      })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Delete this expense?')) return
    await api.delete(`/groups/${groupId}/expenses/${expenseId}`)
    setExpenses(expenses.filter((e) => e.id !== expenseId))
    const s = await api.get(`/groups/${groupId}/settlements`)
    setSettlements(s)
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    try {
      const updated = await api.post(`/groups/${groupId}/members`, { email: memberEmail })
      setGroup(updated)
      setMemberEmail('')
      setShowAddMember(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAddGuest = async (e) => {
    e.preventDefault()
    try {
      const updated = await api.post(`/groups/${groupId}/guests`, { display_name: guestName })
      setGroup(updated)
      setGuestName('')
      setShowAddGuest(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemoveGuest = async (guestId) => {
    if (!confirm('Remove this guest?')) return
    try {
      await api.delete(`/groups/${groupId}/guests/${guestId}`)
      setGroup({ ...group, guests: group.guests.filter((g) => g.guest_id !== guestId) })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleShowQr = async (userId, username, amount) => {
    try {
      const res = await fetch(`${BASE}/pay/${userId}/qr`)
      if (!res.ok) throw new Error()
      const { data_url } = await res.json()
      setLinkCopied(false)
      setQrModal({ username, userId, dataUrl: data_url, amount })
    } catch {
      setError(`${username} hasn't set up a GCash QR yet`)
      setTimeout(() => setError(''), 3000)
    }
  }

  const copyQrLink = () => {
    const link = `${window.location.origin}/pay/${qrModal.userId}`
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  const handleGCash = (debt, idx) => {
    const toKey = debt.to_participant_key
    const toUserId = toKey?.startsWith('uid:') ? toKey.split(':')[1] : null
    const payLink = toUserId ? ` Scan my QR here: ${window.location.origin}/pay/${toUserId}` : ''
    const msg = `Hi ${debt.from_username}! You owe me ${formatMoney(debt.amount, group?.default_currency || 'PHP')} for "${group?.name}". Please send via GCash.${payLink} Salamat! 🙏`
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  const isOwner = group && user && group.owner_id === user.id
  const myBalance = group && user ? settlements.balances?.[user.username] ?? 0 : 0

  const ACTION_LABELS = {
    'expense.create': 'added expense',
    'expense.delete': 'deleted expense',
    'member.add': 'added member',
    'member.remove': 'removed member',
    'guest.add': 'added guest',
    'guest.remove': 'removed guest',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <p className="text-center text-slate-500 mt-20">Group not found</p>
      </div>
    )
  }

  const cur = group.default_currency || 'PHP'

  const now = new Date()
  const daysToMonday = now.getDay() === 0 ? 6 : now.getDay() - 1
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - daysToMonday)
  startOfWeek.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const nonSettlements = expenses.filter((e) => !e.is_settlement)
  const weekTotal = nonSettlements
    .filter((e) => new Date(e.transaction_date || e.created_at) >= startOfWeek)
    .reduce((sum, e) => sum + e.amount, 0)
  const monthTotal = nonSettlements
    .filter((e) => new Date(e.transaction_date || e.created_at) >= startOfMonth)
    .reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Back + currency switcher */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-sm">
            <ArrowLeft size={15} /> Back
          </button>
        </div>

        {/* Group header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{group.name}</h1>
              {group.description && <p className="text-slate-400 text-sm mt-0.5">{group.description}</p>}
            </div>
            {isOwner ? (
              <select
                value={cur}
                onChange={async (e) => {
                  const updated = await api.patch(`/groups/${groupId}`, { default_currency: e.target.value })
                  setGroup(updated)
                }}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {['PHP', 'USD', 'SGD', 'EUR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{cur}</span>
            )}
          </div>

          {/* Balance chip */}
          <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-sm font-medium ${
            myBalance > 0.01 ? 'bg-emerald-50 text-emerald-700' :
            myBalance < -0.01 ? 'bg-red-50 text-red-700' :
            'bg-slate-100 text-slate-500'
          }`}>
            {myBalance > 0.01
              ? `You are owed ${formatMoney(myBalance, cur)}`
              : myBalance < -0.01
              ? `You owe ${formatMoney(Math.abs(myBalance), cur)}`
              : "You're all settled up"}
          </div>

          {/* Members */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {group.members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center">
                  {m.username[0].toUpperCase()}
                </div>
                <span className="text-xs text-slate-700">{m.username}</span>
                {m.role === 'owner' && <span className="text-xs text-indigo-400">★</span>}
              </div>
            ))}
            {/* Guests */}
            {(group.guests || []).map((g) => (
              <div key={g.guest_id} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                <span className="text-xs text-amber-700">{g.display_name}</span>
                <span className="text-xs text-amber-400">guest</span>
                {isOwner && (
                  <button onClick={() => handleRemoveGuest(g.guest_id)} className="text-amber-300 hover:text-red-400 ml-0.5">
                    <UserX size={11} />
                  </button>
                )}
              </div>
            ))}

            {/* Add member / guest buttons */}
            {isOwner && (
              <button onClick={() => { setShowAddMember(!showAddMember); setShowAddGuest(false) }}
                className="flex items-center gap-1 text-indigo-600 text-xs font-medium hover:text-indigo-800 border border-dashed border-indigo-300 rounded-full px-3 py-1">
                <UserPlus size={11} /> Add member
              </button>
            )}
            <button onClick={() => { setShowAddGuest(!showAddGuest); setShowAddMember(false) }}
              className="flex items-center gap-1 text-amber-600 text-xs font-medium hover:text-amber-800 border border-dashed border-amber-300 rounded-full px-3 py-1">
              <Plus size={11} /> Add guest
            </button>
          </div>

          {showAddMember && (
            <form onSubmit={handleAddMember} className="flex gap-2 mt-3">
              <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="Email address" type="email" required
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">Add</button>
            </form>
          )}
          {showAddGuest && (
            <form onSubmit={handleAddGuest} className="flex gap-2 mt-3">
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest name (e.g. Juan)" required
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="submit" className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium">Add</button>
            </form>
          )}

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
          {[
            ['expenses', 'Expenses', Receipt],
            ['settlements', 'Settlements', GitMerge],
            ['activity', 'Activity', Activity],
          ].map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Expenses tab */}
        {tab === 'expenses' && (
          <div className="space-y-3">
            {nonSettlements.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-400 font-medium">This week</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{formatMoney(weekTotal, cur)}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-400 font-medium">This month</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{formatMoney(monthTotal, cur)}</p>
                </div>
              </div>
            )}
            {expenses.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p>No expenses yet</p>
              </div>
            ) : (
              expenses.map((exp) => {
                const myKey = `uid:${user?.id}`
                const mySplit = exp.splits.find((s) => s.participant_key === myKey)
                const multiPay = exp.payers && exp.payers.length > 1
                return (
                  <div key={exp.id} className={`bg-white rounded-2xl border p-4 ${exp.is_settlement ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800 truncate">{exp.description}</p>
                          {exp.is_settlement && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">settled</span>}
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{exp.split_type}</span>
                          {(exp.tax_rate > 0 || exp.tip_rate > 0) && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                              {exp.tax_rate > 0 ? `+${(exp.tax_rate * 100).toFixed(0)}% VAT` : ''}
                              {exp.tip_rate > 0 ? ` +${(exp.tip_rate * 100).toFixed(0)}% svc` : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 mt-0.5">
                          {multiPay ? (
                            <span>Split payment by {exp.payers.map((p) => p.display_name).join(', ')}</span>
                          ) : (
                            <span>Paid by <span className="text-slate-600 font-medium">{exp.paid_by_username}</span></span>
                          )}
                          {mySplit && (
                            <span className="ml-2 text-indigo-600">· your share: {formatMoney(mySplit.share, exp.currency)}</span>
                          )}
                          {exp.transaction_date && (
                            <span className="ml-2">· {new Date(exp.transaction_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: new Date(exp.transaction_date).getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <p className="font-semibold text-slate-800">{formatMoney(exp.amount, exp.currency)}</p>
                        {(user?.id === exp.paid_by || isOwner) && !exp.is_settlement && (
                          <button onClick={() => handleDeleteExpense(exp.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <button onClick={() => setShowSheet(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 rounded-2xl py-4 text-sm font-medium transition-colors">
              <Plus size={16} /> Add expense
            </button>
          </div>
        )}

        {/* Settlements tab */}
        {tab === 'settlements' && (
          <div className="space-y-3">
            {settlements.debts.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <GitMerge size={32} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium text-slate-500">All settled up!</p>
                <p className="text-sm mt-1">No outstanding debts</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Minimum transactions needed</p>
                {settlements.debts.map((debt, i) => {
                  const isMe = debt.from_username === user?.username
                  const iAmCreditor = debt.to_username === user?.username
                  const toUserId = debt.to_participant_key?.startsWith('uid:') ? debt.to_participant_key.split(':')[1] : null
                  return (
                    <div key={i} className={`bg-white rounded-2xl border p-4 ${isMe ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-800">
                            <span className={isMe ? 'text-red-600' : ''}>{debt.from_username}</span>
                            <span className="text-slate-400 mx-2">owes</span>
                            <span className={iAmCreditor ? 'text-emerald-600' : ''}>{debt.to_username}</span>
                          </p>
                          <p className="text-2xl font-bold text-slate-800 mt-0.5">{formatMoney(debt.amount, cur)}</p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          {isMe && (
                            <button onClick={() => handleMarkPaid(debt)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                              Mark paid
                            </button>
                          )}
                          {isMe && toUserId && (
                            <button onClick={() => handleShowQr(toUserId, debt.to_username, debt.amount)}
                              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
                              <QrCode size={13} /> Scan GCash QR
                            </button>
                          )}
                          <button onClick={() => handleGCash(debt, i)}
                            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
                            {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                            {copiedIdx === i ? 'Copied!' : 'Request via GCash'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* Activity / Audit log tab */}
        {tab === 'activity' && (
          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Activity size={32} className="mx-auto mb-2 opacity-40" />
                <p>No activity yet</p>
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {log.actor_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{log.actor_name}</span>
                      {' '}{ACTION_LABELS[log.action] || log.action}{' '}
                      <span className="font-medium">"{log.target_name}"</span>
                      {log.metadata?.amount && (
                        <span className="text-slate-500"> · {formatMoney(log.metadata.amount, log.metadata.currency || cur)}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(log.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {showSheet && (
        <AddExpenseSheet
          group={group}
          onClose={() => setShowSheet(false)}
          onAdded={(exp) => {
            setExpenses([exp, ...expenses])
            api.get(`/groups/${groupId}/settlements`).then(setSettlements)
          }}
        />
      )}

      {/* GCash QR modal */}
      {qrModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h3 className="font-semibold text-slate-800">Pay {qrModal.username}</h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  {formatMoney(qrModal.amount, cur)} · via GCash
                </p>
              </div>
              <button onClick={() => setQrModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* QR */}
            <div className="px-5 py-4 bg-slate-50 flex justify-center">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                <img
                  src={qrModal.dataUrl}
                  alt={`${qrModal.username} GCash QR`}
                  className="w-56 h-56 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 space-y-2">
              <button
                onClick={copyQrLink}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  linkCopied
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                {linkCopied ? 'Link copied!' : 'Copy payment link'}
              </button>
              <a
                href={`/pay/${qrModal.userId}`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <ExternalLink size={14} /> Open full screen
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
