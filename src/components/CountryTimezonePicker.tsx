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
    if (!countryDropdownOpen) return
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [countryDropdownOpen])

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false)
        setCountrySearch('')
      }
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setTzDropdownOpen(false)
        setTzSearch('')
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
            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">({selectedCountry.dialCode})</span>
          )}
        </label>
        <div className="relative" ref={countryRef}>
          <button
            type="button"
            disabled={disabled}
            data-open={countryDropdownOpen ? 'true' : 'false'}
            onClick={() => setCountryDropdownOpen((prev) => !prev)}
            className="dp-select-trigger w-full text-xs"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-base shrink-0 leading-none">{selectedCountry?.flag || '🌐'}</span>
              <span className="truncate font-medium">{selectedCountry?.name || 'Select Country'}</span>
              {showDialCode && selectedCountry?.dialCode && (
                <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px]">
                  {selectedCountry.dialCode}
                </span>
              )}
            </div>
            <svg
              className={`h-4 w-4 transition-transform duration-150 shrink-0 ml-1.5 ${
                countryDropdownOpen
                  ? 'rotate-180 text-[#6d25da] dark:text-[#a87ce9]'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {countryDropdownOpen && (
            <div className="dp-select-menu dp-select-enter-down absolute left-0 top-full mt-1.5 w-full max-h-64 p-1.5 z-50 flex flex-col">
              {/* Search box */}
              <div className="p-1 border-b border-zinc-200/70 dark:border-white/[0.08]">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search country or code (e.g. Sri Lanka, +94)..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs"
                />
              </div>

              {/* Country list */}
              <div className="overflow-y-auto flex-1 py-1 space-y-0.5">
                {filteredCountries.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    No matching countries found
                  </div>
                ) : (
                  filteredCountries.map((c) => {
                    const isSelected = c.code === selectedCountry?.code
                    return (
                      <button
                        key={c.code}
                        type="button"
                        data-selected={isSelected ? 'true' : 'false'}
                        onClick={() => handleSelectCountry(c)}
                        className="dp-select-option text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-base shrink-0 leading-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {c.dialCode && (
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                              {c.dialCode}
                            </span>
                          )}
                          {isSelected && (
                            <svg className="h-4 w-4 text-[#6d25da] dark:text-[#a87ce9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
            Timezone
          </label>
          <div className="relative" ref={tzRef}>
            <button
              type="button"
              disabled={disabled}
              data-open={tzDropdownOpen ? 'true' : 'false'}
              onClick={() => setTzDropdownOpen((prev) => !prev)}
              className="dp-select-trigger w-full text-xs"
            >
              <span className="truncate font-medium">
                {availableTimezones.find((t) => t.name === timezone)?.label || timezone}
              </span>
              <svg
                className={`h-4 w-4 transition-transform duration-150 shrink-0 ml-1.5 ${
                  tzDropdownOpen
                    ? 'rotate-180 text-[#6d25da] dark:text-[#a87ce9]'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {tzDropdownOpen && (
              <div className="dp-select-menu dp-select-enter-down absolute left-0 top-full mt-1.5 w-full max-h-56 p-1.5 z-50 flex flex-col">
                {availableTimezones.length > 5 && (
                  <div className="p-1 border-b border-zinc-200/70 dark:border-white/[0.08]">
                    <input
                      type="text"
                      placeholder="Search timezones..."
                      value={tzSearch}
                      onChange={(e) => setTzSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs"
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
                        data-selected={isSelected ? 'true' : 'false'}
                        onClick={() => handleSelectTimezone(tz.name)}
                        className="dp-select-option text-xs"
                      >
                        <span className="truncate">{tz.label}</span>
                        {isSelected && (
                          <svg className="h-4 w-4 text-[#6d25da] dark:text-[#a87ce9] shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

