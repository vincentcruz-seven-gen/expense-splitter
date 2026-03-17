// Hardcoded rates relative to PHP (1 PHP = X currency)
// Updated periodically; replace with live frankfurter.app call if needed
export const SUPPORTED_CURRENCIES = ['PHP', 'USD', 'SGD', 'EUR']

const RATES_FROM_PHP = {
  PHP: 1,
  USD: 0.01742,   // 1 PHP ≈ 0.0174 USD  (1 USD ≈ 57.4 PHP)
  SGD: 0.02320,   // 1 PHP ≈ 0.0232 SGD  (1 SGD ≈ 43.1 PHP)
  EUR: 0.01604,   // 1 PHP ≈ 0.0160 EUR  (1 EUR ≈ 62.3 PHP)
}

export function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount
  const inPHP = amount / RATES_FROM_PHP[fromCurrency]
  return inPHP * RATES_FROM_PHP[toCurrency]
}

export function formatMoney(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function currencySymbol(currency) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? currency
}
