import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Wallet, BarChart2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { displayCurrency, setCurrency, SUPPORTED_CURRENCIES } = useCurrency()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-800">
          <Wallet size={20} className="text-indigo-600" />
          SplitEase
        </Link>
        {user && (
          <div className="flex items-center gap-2">
            <Link
              to="/analytics"
              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title="Analytics"
            >
              <BarChart2 size={17} />
            </Link>
            <select
              value={displayCurrency}
              onChange={(e) => setCurrency(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            >
              {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <Link
              to="/profile"
              className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center hover:bg-indigo-200 transition-colors"
              title="Profile & Settings"
            >
              {user.username[0].toUpperCase()}
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
