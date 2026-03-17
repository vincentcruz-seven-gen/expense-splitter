import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, QrCode, Check, User, Mail, Link, Copy } from 'lucide-react'
import Navbar from '../components/Navbar'
import { api, BASE } from '../api/client'
import { useAuth } from '../context/AuthContext'

/**
 * Auto-crops a GCash screenshot to just the QR code.
 * Strategy: find the white-background region (GCash QR card), then
 * isolate the bounding box of dark pixels (the QR pattern) within it.
 */
async function autoCropQR(file) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth
      const H = img.naturalHeight

      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, W, H)

      const lum = (x, y) => {
        const i = (y * W + x) * 4
        return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      }

      // Find the vertical extent of the white card region by scanning
      // the center column outward from center
      const checkWhiteRow = (y) => {
        let whites = 0
        const step = Math.max(1, Math.floor(W / 60))
        for (let x = Math.floor(W * 0.15); x < W * 0.85; x += step) {
          if (lum(x, y) > 210) whites++
        }
        return whites / (W * 0.7 / step) > 0.65
      }

      let top = Math.floor(H / 2)
      while (top > 0 && checkWhiteRow(top)) top--
      let bottom = Math.floor(H / 2)
      while (bottom < H - 1 && checkWhiteRow(bottom)) bottom++

      // Fallback: use full image if detection fails
      if (bottom - top < H * 0.1) { top = 0; bottom = H }

      // Within that white region, find bounding box of dark pixels
      let minX = W, maxX = 0, minY = H, maxY = 0
      const darkThreshold = 90
      for (let y = top; y <= bottom; y++) {
        for (let x = 0; x < W; x++) {
          if (lum(x, y) < darkThreshold) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      if (maxX <= minX || maxY <= minY) {
        resolve(file) // fallback: no crop
        return
      }

      // Pad by 4% of the detected size, then square-ify
      const pad = Math.round(Math.min(maxX - minX, maxY - minY) * 0.04)
      const x1 = Math.max(0, minX - pad)
      const y1 = Math.max(0, minY - pad)
      const x2 = Math.min(W, maxX + pad)
      const y2 = Math.min(H, maxY + pad)
      const w = x2 - x1
      const h = y2 - y1
      const side = Math.max(w, h)
      const ox = Math.max(0, x1 + w / 2 - side / 2)
      const oy = Math.max(0, y1 + h / 2 - side / 2)

      const out = document.createElement('canvas')
      const size = 600
      out.width = size
      out.height = size
      const outCtx = out.getContext('2d')
      outCtx.fillStyle = 'white'
      outCtx.fillRect(0, 0, size, size)
      outCtx.drawImage(img, ox, oy, Math.min(side, W - ox), Math.min(side, H - oy), 0, 0, size, size)

      out.toBlob((blob) => resolve(blob ?? file), 'image/png', 0.95)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [hasQr, setHasQr] = useState(false)
  const [qrPreview, setQrPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/auth/me').then((u) => {
      setHasQr(u.has_gcash_qr)
      if (u.has_gcash_qr) {
        fetch(`${BASE}/pay/${u.id}/qr`)
          .then((r) => r.json())
          .then((d) => setQrPreview(d.data_url))
          .catch(() => {})
      }
    })
  }, [])

  const flash = (msg, isError = false) => {
    if (isError) setError(msg)
    else setSuccess(msg)
    setTimeout(() => { setSuccess(''); setError('') }, 3000)
  }

  const payLink = user ? `${window.location.origin}/pay/${user.id}` : ''

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { flash('Please select an image file', true); return }

    setProcessing(true)
    const cropped = await autoCropQR(file)
    setProcessing(false)

    // Show local preview of the cropped result immediately
    const previewUrl = URL.createObjectURL(cropped)
    setQrPreview(previewUrl)

    setUploading(true)
    try {
      const token = localStorage.getItem('access_token')
      const form = new FormData()
      form.append('file', new File([cropped], 'qr.png', { type: 'image/png' }))
      const res = await fetch(`${BASE}/auth/gcash-qr`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) throw new Error()
      setHasQr(true)
      flash('GCash QR saved!')
    } catch {
      flash('Upload failed — try again', true)
      setQrPreview(null)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async () => {
    if (!confirm('Remove your GCash QR?')) return
    try {
      await api.delete('/auth/gcash-qr')
      setHasQr(false)
      setQrPreview(null)
      flash('QR removed')
    } catch {
      flash('Could not remove QR', true)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(payLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  const isBusy = uploading || processing

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Profile & Settings</h1>

        {/* User info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 text-2xl font-bold flex items-center justify-center">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-400" />
                <p className="font-semibold text-slate-800">{user?.username}</p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Mail size={14} className="text-slate-400" />
                <p className="text-sm text-slate-500">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* GCash QR */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <QrCode size={16} className="text-blue-600" />
            <h2 className="font-semibold text-slate-800">GCash QR Code</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Upload your GCash QR — it will be auto-cropped. Others can then scan it or open your payment link.
          </p>

          {qrPreview ? (
            <div className="space-y-4">
              {/* QR preview */}
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm inline-block">
                  <img
                    src={qrPreview}
                    alt="Your GCash QR"
                    className="w-52 h-52 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              </div>

              {/* Payment link */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-400 font-medium mb-1.5">Your payment link</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-slate-600 truncate font-mono">{payLink}</p>
                  <button
                    onClick={copyLink}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                      linkCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <Upload size={14} />
                  {processing ? 'Processing…' : uploading ? 'Uploading…' : 'Replace QR'}
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} /> Remove
                </button>
                <a
                  href={payLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Link size={14} /> Preview
                </a>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
              <QrCode size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500 font-medium mb-0.5">Upload your GCash QR screenshot</p>
              <p className="text-xs text-slate-400 mb-4">We'll auto-crop to just the QR code</p>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >
                <Upload size={14} />
                {processing ? 'Processing…' : uploading ? 'Uploading…' : 'Upload GCash QR'}
              </button>
              <p className="text-xs text-slate-300 mt-2">PNG, JPG · max 2 MB · screenshots work fine</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-1.5 mt-3 text-emerald-600 text-sm">
              <Check size={14} /> {success}
            </div>
          )}
          {error && <p className="mt-3 text-red-500 text-sm">{error}</p>}
        </div>
      </main>
    </div>
  )
}
