import { createContext, useContext, useState } from 'react'
import { SUPPORTED_CURRENCIES, convertAmount, formatMoney } from '../utils/currency'

const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem('display_currency') || 'PHP'
  )

  const setCurrency = (c) => {
    localStorage.setItem('display_currency', c)
    setDisplayCurrency(c)
  }

  const display = (amount, sourceCurrency = 'PHP') => {
    const converted = convertAmount(amount, sourceCurrency, displayCurrency)
    return formatMoney(converted, displayCurrency)
  }

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setCurrency, display, SUPPORTED_CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)
