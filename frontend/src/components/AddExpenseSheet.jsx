import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Scan, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../api/client'
import { formatMoney } from '../utils/currency'

const CURRENCIES = ['PHP', 'USD', 'SGD', 'EUR']

export default function AddExpenseSheet({ group, onClose, onAdded }) {
  const allParticipants = [
    ...(group.members || []).map((m) => ({
      participant_key: `uid:${m.user_id}`,
      display_name: m.username,
    })),
    ...(group.guests || []).map((g) => ({
      participant_key: `gid:${g.guest_id}`,
      display_name: g.display_name,
    })),
  ]

  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: group.default_currency || 'PHP',
    split_type: 'equal',
    date: new Date().toISOString().split('T')[0],
  })

  // Payers (multi-payer support)
  const [payers, setPayers] = useState([
    { participant_key: allParticipants[0]?.participant_key || '', display_name: allParticipants[0]?.display_name || '', amount: '' },
  ])
  const [multiPayer, setMultiPayer] = useState(false)

  // Equal split participants
  const [equalParticipants, setEqualParticipants] = useState(allParticipants.map((p) => p.participant_key))

  // Percentage allocations
  const [percentages, setPercentages] = useState(() => {
    const even = allParticipants.length > 0 ? (100 / allParticipants.length).toFixed(2) : '0'
    return Object.fromEntries(allParticipants.map((p) => [p.participant_key, even]))
  })

  // Itemized
  const [items, setItems] = useState([{ name: '', price: '', consumer_keys: [] }])

  // Discounts
  const [discounts, setDiscounts] = useState({})
  const [showDiscounts, setShowDiscounts] = useState(false)

  // Tax / tip / rounding
  const [taxRate, setTaxRate] = useState(12)
  const [tipRate, setTipRate] = useState(0)
  const [roundToPeso, setRoundToPeso] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  const pctTotal = Object.values(percentages).reduce((s, v) => s + parseFloat(v || 0), 0)
  const payersTotal = payers.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const subtotal = parseFloat(form.amount || 0)
  const taxAmt = subtotal * (taxRate / 100)
  const tipAmt = subtotal * (tipRate / 100)
  const grandTotal = roundToPeso ? Math.round(subtotal + taxAmt + tipAmt) : subtotal + taxAmt + tipAmt

  const perPersonEqual =
    equalParticipants.length > 0 ? (grandTotal / equalParticipants.length).toFixed(2) : '—'

  const buildSplitSpec = () => {
    if (form.split_type === 'equal') {
      return {
        participants: allParticipants.filter((p) => equalParticipants.includes(p.participant_key)),
      }
    }
    if (form.split_type === 'percentage') {
      return {
        allocations: allParticipants
          .filter((p) => parseFloat(percentages[p.participant_key] || 0) > 0)
          .map((p) => ({ ...p, percentage: parseFloat(percentages[p.participant_key]) })),
      }
    }
    if (form.split_type === 'itemized') {
      return {
        items: items
          .filter((i) => i.name && parseFloat(i.price) > 0)
          .map((i) => ({ name: i.name, price: parseFloat(i.price), consumer_keys: i.consumer_keys })),
      }
    }
  }

  const handleScan = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    try {
      const result = await api.uploadReceipt(file)
      setForm((f) => ({ ...f, amount: String(result.total), description: 'Receipt', split_type: 'itemized' }))
      setItems(
        result.line_items.map((li) => ({ name: li.description, price: String(li.amount), consumer_keys: [] }))
      )
    } catch {
      setError('Failed to scan receipt')
    } finally {
      setScanning(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const payerList = multiPayer
      ? payers.filter((p) => p.participant_key && parseFloat(p.amount) > 0)
      : null

    if (multiPayer && Math.abs(payersTotal - subtotal) > 0.02) {
      return setError(`Payers total (${formatMoney(payersTotal, form.currency)}) must equal amount (${formatMoney(subtotal, form.currency)})`)
    }

    const discountList = Object.entries(discounts)
      .filter(([, amt]) => parseFloat(amt) > 0)
      .map(([participant_key, amount]) => ({ participant_key, amount: parseFloat(amount) }))

    const spec = buildSplitSpec()
    setLoading(true)
    try {
      const payload = {
        description: form.description,
        amount: subtotal,
        currency: form.currency,
        paid_by: payers[0]?.participant_key?.split(':')[1] || '',
        split_type: form.split_type,
        split_spec: spec,
        tax_rate: taxRate / 100,
        tip_rate: tipRate / 100,
        round_to_peso: roundToPeso,
        transaction_date: form.date,
      }
      if (payerList) payload.payers = payerList
      if (discountList.length > 0) payload.discounts = discountList

      const expense = await api.post(`/groups/${group.id}/expenses`, payload)
      onAdded(expense)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[94vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-2 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Add Expense</h2>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer flex items-center gap-1 text-indigo-600 text-sm font-medium hover:text-indigo-800">
              <Scan size={14} />
              {scanning ? 'Scanning…' : 'Scan receipt'}
              <input type="file" accept="image/*" onChange={handleScan} className="hidden" />
            </label>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-4 space-y-5 pb-10">
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Dinner, groceries, taxi…"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input
                type="number" step="0.01" min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Paid by */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Paid by</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={multiPayer} onChange={(e) => setMultiPayer(e.target.checked)} className="accent-indigo-600" />
                Multiple payers
              </label>
            </div>

            {!multiPayer ? (
              <select
                value={payers[0]?.participant_key || ''}
                onChange={(e) => {
                  const p = allParticipants.find((x) => x.participant_key === e.target.value)
                  setPayers([{ participant_key: e.target.value, display_name: p?.display_name || '', amount: form.amount }])
                }}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {allParticipants.map((p) => (
                  <option key={p.participant_key} value={p.participant_key}>{p.display_name}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                {payers.map((payer, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select
                      value={payer.participant_key}
                      onChange={(e) => {
                        const p = allParticipants.find((x) => x.participant_key === e.target.value)
                        const next = [...payers]
                        next[idx] = { ...next[idx], participant_key: e.target.value, display_name: p?.display_name || '' }
                        setPayers(next)
                      }}
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {allParticipants.map((p) => (
                        <option key={p.participant_key} value={p.participant_key}>{p.display_name}</option>
                      ))}
                    </select>
                    <input
                      type="number" step="0.01" min="0"
                      value={payer.amount}
                      onChange={(e) => {
                        const next = [...payers]
                        next[idx].amount = e.target.value
                        setPayers(next)
                      }}
                      placeholder="Amount"
                      className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {payers.length > 1 && (
                      <button type="button" onClick={() => setPayers(payers.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setPayers([...payers, { participant_key: allParticipants[0]?.participant_key || '', display_name: allParticipants[0]?.display_name || '', amount: '' }])}
                    className="flex items-center gap-1 text-indigo-600 text-sm font-medium">
                    <Plus size={13} /> Add payer
                  </button>
                  <span className={`text-xs font-medium ${Math.abs(payersTotal - subtotal) > 0.02 ? 'text-red-500' : 'text-emerald-600'}`}>
                    Total: {formatMoney(payersTotal, form.currency)} / {formatMoney(subtotal, form.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Split type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Split</label>
            <div className="flex gap-2">
              {['equal', 'percentage', 'itemized'].map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, split_type: t })}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    form.split_type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                  }`}>
                  {t === 'equal' ? 'Equal' : t === 'percentage' ? '%' : 'Items'}
                </button>
              ))}
            </div>
          </div>

          {/* Equal split detail */}
          {form.split_type === 'equal' && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-xs text-slate-500 font-medium mb-2">
                Each person pays {formatMoney(parseFloat(perPersonEqual), form.currency)}
                {(taxRate > 0 || tipRate > 0) && ` (incl. tax/tip)`}
              </p>
              {allParticipants.map((p) => (
                <label key={p.participant_key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={equalParticipants.includes(p.participant_key)}
                    onChange={() => setEqualParticipants((prev) =>
                      prev.includes(p.participant_key) ? prev.filter((id) => id !== p.participant_key) : [...prev, p.participant_key]
                    )} className="w-4 h-4 accent-indigo-600" />
                  <span className="text-sm text-slate-700">{p.display_name}</span>
                  {p.participant_key.startsWith('gid:') && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">guest</span>
                  )}
                </label>
              ))}
            </div>
          )}

          {/* Percentage split */}
          {form.split_type === 'percentage' && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Assign percentages</span>
                <span className={pctTotal !== 100 ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {pctTotal.toFixed(1)}%
                </span>
              </div>
              {allParticipants.map((p) => (
                <div key={p.participant_key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-24 truncate">{p.display_name}</span>
                  <input type="number" step="0.1" min="0" max="100"
                    value={percentages[p.participant_key] || ''}
                    onChange={(e) => setPercentages({ ...percentages, [p.participant_key]: e.target.value })}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-400 w-4">%</span>
                </div>
              ))}
            </div>
          )}

          {/* Itemized split */}
          {form.split_type === 'itemized' && (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={item.name} onChange={(e) => { const next = [...items]; next[idx].name = e.target.value; setItems(next) }}
                      placeholder="Item name"
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input type="number" step="0.01" value={item.price}
                      onChange={(e) => { const next = [...items]; next[idx].price = e.target.value; setItems(next) }}
                      placeholder="Price"
                      className="w-24 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allParticipants.map((p) => (
                      <label key={p.participant_key} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox"
                          checked={item.consumer_keys.some((c) => c.participant_key === p.participant_key)}
                          onChange={() => {
                            const next = [...items]
                            const cks = next[idx].consumer_keys
                            const exists = cks.some((c) => c.participant_key === p.participant_key)
                            next[idx].consumer_keys = exists
                              ? cks.filter((c) => c.participant_key !== p.participant_key)
                              : [...cks, p]
                            setItems(next)
                          }} className="accent-indigo-600" />
                        {p.display_name}
                        {p.participant_key.startsWith('gid:') && <span className="text-amber-500">*</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setItems([...items, { name: '', price: '', consumer_keys: [] }])}
                className="flex items-center gap-1 text-indigo-600 text-sm font-medium hover:text-indigo-800">
                <Plus size={14} /> Add item
              </button>
            </div>
          )}

          {/* Advanced: Tax, Tip, Discounts, Rounding */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100">
              <span>Tax, Tip & Discounts</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showAdvanced && (
              <div className="p-4 space-y-4">
                {/* Tax / Tip */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">VAT / Tax (%)</label>
                    <input type="number" step="0.5" min="0" max="100" value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-slate-400 mt-0.5">PH default: 12%</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Service Charge (%)</label>
                    <input type="number" step="0.5" min="0" max="100" value={tipRate}
                      onChange={(e) => setTipRate(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-slate-400 mt-0.5">Common: 10%</p>
                  </div>
                </div>

                {/* Tax/tip summary */}
                {(taxRate > 0 || tipRate > 0) && subtotal > 0 && (
                  <div className="bg-indigo-50 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span><span>{formatMoney(subtotal, form.currency)}</span>
                    </div>
                    {taxRate > 0 && <div className="flex justify-between text-slate-600">
                      <span>VAT ({taxRate}%)</span><span>+{formatMoney(taxAmt, form.currency)}</span>
                    </div>}
                    {tipRate > 0 && <div className="flex justify-between text-slate-600">
                      <span>Service ({tipRate}%)</span><span>+{formatMoney(tipAmt, form.currency)}</span>
                    </div>}
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-indigo-100 pt-1">
                      <span>Total</span><span>{formatMoney(grandTotal, form.currency)}</span>
                    </div>
                    <p className="text-indigo-500 mt-1">Distributed proportionally to each person's share</p>
                  </div>
                )}

                {/* Round to peso */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={roundToPeso} onChange={(e) => setRoundToPeso(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                  <span className="text-sm text-slate-700">Round to nearest peso</span>
                </label>

                {/* Discounts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-600">Discounts (e.g. senior citizen, voucher)</label>
                    <button type="button" onClick={() => setShowDiscounts(!showDiscounts)} className="text-xs text-indigo-600 font-medium">
                      {showDiscounts ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showDiscounts && (
                    <div className="space-y-2">
                      {allParticipants.map((p) => (
                        <div key={p.participant_key} className="flex items-center gap-2">
                          <span className="text-sm text-slate-700 w-24 truncate">{p.display_name}</span>
                          <input type="number" step="0.01" min="0" placeholder="₱0.00"
                            value={discounts[p.participant_key] || ''}
                            onChange={(e) => setDiscounts({ ...discounts, [p.participant_key]: e.target.value })}
                            className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition-colors">
            {loading ? 'Adding…' : `Add Expense · ${formatMoney(grandTotal, form.currency)}`}
          </button>
        </form>
      </div>
    </>
  )
}
