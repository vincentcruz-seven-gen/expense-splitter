import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Wallet, QrCode } from 'lucide-react'
import { BASE } from '../api/client'

export default function PayPage() {
  const { userId } = useParams()
  const [profile, setProfile] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${BASE}/pay/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p) => {
        setProfile(p)
        if (p.has_gcash_qr) {
          return fetch(`${BASE}/pay/${userId}/qr`)
            .then((r) => r.json())
            .then((d) => setQrUrl(d.data_url))
        }
      })
      .catch(() => setError('Payment page not found'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 px-4">
        <QrCode size={40} className="text-slate-300" />
        <p className="text-slate-500 font-medium">This payment page doesn't exist</p>
        <a href="/" className="text-sm text-indigo-600 hover:underline">Go to SplitEase</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-100 flex flex-col items-center justify-center px-4 py-12">
      {/* Card */}
      <div className="w-full max-w-xs bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 text-white text-3xl font-bold flex items-center justify-center mx-auto mb-3">
            {profile.username[0].toUpperCase()}
          </div>
          <h1 className="text-white text-xl font-bold">{profile.username}</h1>
          <p className="text-blue-100 text-sm mt-0.5">GCash Payment</p>
        </div>

        {/* QR area */}
        <div className="px-6 py-8 flex flex-col items-center gap-4">
          {qrUrl ? (
            <>
              <div className="bg-white p-3 rounded-2xl shadow-inner border border-slate-100">
                <img
                  src={qrUrl}
                  alt={`${profile.username} GCash QR`}
                  className="w-56 h-56 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <p className="text-sm text-slate-500 text-center leading-snug">
                Open <span className="font-semibold text-blue-600">GCash</span> → Scan QR<br />
                then enter the amount and send
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <QrCode size={48} className="text-slate-200" />
              <p className="text-slate-400 text-sm text-center">
                {profile.username} hasn't uploaded a GCash QR yet
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-center gap-1.5">
          <Wallet size={13} className="text-indigo-400" />
          <span className="text-xs text-slate-400">Powered by <span className="font-semibold text-indigo-600">SplitEase</span></span>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Scan the QR with your GCash app to send payment
      </p>
    </div>
  )
}
