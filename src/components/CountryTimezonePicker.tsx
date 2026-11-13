import { useState, useRef, useEffect, useMemo } from 'react'
import {
  getAllCountries,
  getTimezoneOptionsForCountry,
  type CountryItem,
} from '@/lib/countryTimezones'

export interface CountryTimezoneValue {
  countryCode: string
  countryName: string
  dialCode: string
  timezone: string
}

interface CountryTimezonePickerProps {
  countryCode: string
  timezone: string
  onChange: (value: CountryTimezoneValue) => void
  disabled?: boolean
  showTimezone?: boolean
  showDialCode?: boolean
  compact?: boolean
}

export function CountryTimezonePicker({
  countryCode,
  timezone,
  onChange,
  disabled = false,
  showTimezone = true,
  showDialCode = true,
  compact = false,
}: CountryTimezonePickerProps) {
  const countries = useMemo(() => getAllCountries(), [])

  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === countryCode) || countries.find((c) => c.code === 'LK') || countries[0],
    [countries, countryCode]
  )

  const availableTimezones = useMemo(
    () => getTimezoneOptionsForCountry(selectedCountry?.code),
    [selectedCountry]
  )

  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false)
  const [tzSearch, setTzSearch] = useState('')

  const countryRef = useRef<HTMLDivElement>(null)
  const tzRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus search input when country dropdown opens
  useEffect(() => {
    if (countryDropdownOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setCountrySearch('')
    }
  }, [countryDropdownOpen])

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false)
      }
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setTzDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countries
    const query = countrySearch.toLowerCase().trim()
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query) ||
        c.dialCode.includes(query)
    )
  }, [countries, countrySearch])

  // Filter timezones based on search
  const filteredTimezones = useMemo(() => {
    if (!tzSearch.trim()) return availableTimezones
    const query = tzSearch.toLowerCase().trim()
    return availableTimezones.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.label.toLowerCase().includes(query)
    )
  }, [availableTimezones, tzSearch])

  function handleSelectCountry(c: CountryItem) {
    const nextTz = c.timezones.includes(timezone) ? timezone : c.defaultTimezone
    onChange({
      countryCode: c.code,
      countryName: c.name,
      dialCode: c.dialCode,
      timezone: nextTz,
    })
    setCountryDropdownOpen(false)
  }

  function handleSelectTimezone(tzName: string) {
    if (!selectedCountry) return
    onChange({
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      dialCode: selectedCountry.dialCode,
      timezone: tzName,
    })
    setTzDropdownOpen(false)
  }

  return (
    <div className={`space-y-3 ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Country Selector */}
      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
          Country / Region {showDialCode && selectedCountry?.dialCode && (
            <span className="text-slate-400 font-mono text-[10px]">({selectedCountry.dialCode})</span>
          )}
        </label>
        <div className="relative" ref={countryRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCountryDropdownOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs hover:border-slate-400 dark:hover:border-white/20 transition cursor-pointer disabled:opacity-50 text-left"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-base shrink-0 leading-none">{selectedCountry?.flag || '🌐'}</span>
              <span className="truncate font-medium">{selectedCountry?.name || 'Select Country'}</span>
              {showDialCode && selectedCountry?.dialCode && (
                <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                  {selectedCountry.dialCode}
                </span>
              )}
            </div>
            <svg
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 shrink-0 ml-1.5 ${
                countryDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {countryDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-full max-h-64 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111623] shadow-2xl p-1.5 z-50 flex flex-col">
              {/* Search box */}
              <div className="p-1.5 border-b border-slate-100 dark:border-white/5">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search country or code (e.g. Sri Lanka, +94)..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Country list */}
              <div className="overflow-y-auto flex-1 py-1 space-y-0.5">
                {filteredCountries.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    No matching countries found
                  </div>
                ) : (
                  filteredCountries.map((c) => {
                    const isSelected = c.code === selectedCountry?.code
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleSelectCountry(c)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer text-left ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-base shrink-0 leading-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {c.dialCode && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {c.dialCode}
                            </span>
                          )}
                          {isSelected && (
                            <svg className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timezone Selector */}
      {showTimezone && (
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
            Timezone
          </label>
          <div className="relative" ref={tzRef}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setTzDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs hover:border-slate-400 dark:hover:border-white/20 transition cursor-pointer disabled:opacity-50 text-left"
            >
              <span className="truncate font-medium">
                {availableTimezones.find((t) => t.name === timezone)?.label || timezone}
              </span>
              <svg
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 shrink-0 ml-1.5 ${
                  tzDropdownOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {tzDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full max-h-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111623] shadow-2xl p-1.5 z-50 flex flex-col">
                {availableTimezones.length > 5 && (
                  <div className="p-1.5 border-b border-slate-100 dark:border-white/5">
                    <input
                      type="text"
                      placeholder="Search timezones..."
                      value={tzSearch}
                      onChange={(e) => setTzSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
                <div className="overflow-y-auto flex-1 py-1 space-y-0.5">
                  {filteredTimezones.map((tz) => {
                    const isSelected = tz.name === timezone
                    return (
                      <button
                        key={tz.name}
                        type="button"
                        onClick={() => handleSelectTimezone(tz.name)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer text-left ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{tz.label}</span>
                        {isSelected && (
                          <svg className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

