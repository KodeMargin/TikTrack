import React, {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export interface SelectOptionItem {
  value: string
  label: string
  disabled?: boolean
  group?: string
}

export interface SelectProps {
  value?: string | number | readonly string[]
  defaultValue?: string | number
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  className?: string
  style?: React.CSSProperties
  title?: string
  placeholder?: string
  searchable?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  children?: React.ReactNode
}

function extractNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    return extractNodeText(props.children)
  }
  return ''
}

function parseOptionsFromChildren(
  children: React.ReactNode,
  group?: string,
  groupDisabled = false
): SelectOptionItem[] {
  const result: SelectOptionItem[] = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    if (child.type === Fragment) {
      const props = child.props as { children?: React.ReactNode }
      result.push(...parseOptionsFromChildren(props.children, group, groupDisabled))
      return
    }

    if (child.type === 'optgroup') {
      const props = child.props as {
        label?: string
        disabled?: boolean
        children?: React.ReactNode
      }
      result.push(
        ...parseOptionsFromChildren(
          props.children,
          props.label ?? '',
          groupDisabled || Boolean(props.disabled)
        )
      )
      return
    }

    if (child.type === 'option') {
      const props = child.props as {
        value?: string | number
        disabled?: boolean
        children?: React.ReactNode
      }
      const label = extractNodeText(props.children).replace(/\s+/g, ' ').trim()
      const value = props.value !== undefined ? String(props.value) : label
      result.push({
        value,
        label: label || value,
        disabled: groupDisabled || Boolean(props.disabled),
        group,
      })
    }
  })

  return result
}

interface MenuPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'bottom' | 'top'
}

export function Select({
  value,
  defaultValue,
  onChange,
  onValueChange,
  disabled = false,
  required = false,
  id,
  name,
  className = '',
  style,
  title,
  placeholder,
  searchable,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  onClick,
  children,
}: SelectProps) {
  const options = useMemo(() => parseOptionsFromChildren(children), [children])
  const isControlled = value !== undefined

  const [internalValue, setInternalValue] = useState<string>(() => {
    if (defaultValue !== undefined) return String(defaultValue)
    const firstEnabled = options.find((o) => !o.disabled)
    return firstEnabled?.value ?? options[0]?.value ?? ''
  })

  const currentValue = isControlled
    ? Array.isArray(value)
      ? String(value[0] ?? '')
      : String(value ?? '')
    : internalValue

  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)

  const isOpen = open && !disabled

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typeaheadRef = useRef<{ buffer: string; timer: number | null }>({
    buffer: '',
    timer: null,
  })

  const listboxId = useId()
  const showSearch = searchable ?? options.length >= 12

  const selectedOption = useMemo(
    () => options.find((o) => o.value === currentValue) ?? options[0] ?? null,
    [options, currentValue]
  )

  const filteredOptions = useMemo(() => {
    if (!showSearch || !searchQuery.trim()) return options
    const q = searchQuery.toLowerCase().trim()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.group && o.group.toLowerCase().includes(q))
    )
  }, [options, showSearch, searchQuery])

  const closeMenu = useCallback(() => {
    setOpen(false)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    const selectedIdx = options.findIndex(
      (o) => o.value === currentValue && !o.disabled
    )
    const fallbackIdx = options.findIndex((o) => !o.disabled)
    setSearchQuery('')
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : fallbackIdx)
    setOpen(true)
  }, [disabled, options, currentValue])

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const gap = 6
    const preferredMaxH = 280
    const spaceBelow = viewportH - rect.bottom - gap - 12
    const spaceAbove = rect.top - gap - 12

    const openTop = spaceBelow < 180 && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      120,
      Math.min(preferredMaxH, openTop ? spaceAbove : spaceBelow)
    )

    const width = Math.max(rect.width, 160)
    const clampedWidth = Math.min(width, viewportW - 16)
    let left = rect.left
    if (left + clampedWidth > viewportW - 8) {
      left = Math.max(8, viewportW - clampedWidth - 8)
    }

    const top = openTop ? rect.top - gap : rect.bottom + gap

    setMenuPos({
      top,
      left,
      width: clampedWidth,
      maxHeight,
      placement: openTop ? 'top' : 'bottom',
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    computePosition()
  }, [isOpen, computePosition, filteredOptions.length])

  useEffect(() => {
    if (!isOpen) return

    const handleReposition = (e: Event) => {
      // Allow scrolling inside the menu itself without closing or jumping
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return
      }
      computePosition()
    }

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      closeMenu()
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    document.addEventListener('mousedown', handlePointerDown, true)

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
      document.removeEventListener('mousedown', handlePointerDown, true)
    }
  }, [isOpen, computePosition, closeMenu])

  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => {
      if (showSearch) {
        searchInputRef.current?.focus()
      }
      if (highlightedIndex >= 0) {
        optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, showSearch, highlightedIndex])

  const emitChange = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }
      if (onChange) {
        const syntheticEvent = {
          target: { value: nextValue, name: name ?? '', id: id ?? '' },
          currentTarget: { value: nextValue, name: name ?? '', id: id ?? '' },
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.ChangeEvent<HTMLSelectElement>
        onChange(syntheticEvent)
      }
      onValueChange?.(nextValue)
    },
    [isControlled, onChange, onValueChange, name, id]
  )

  const handleSelectOption = useCallback(
    (opt: SelectOptionItem) => {
      if (opt.disabled) return
      closeMenu()
      if (opt.value !== currentValue) {
        emitChange(opt.value)
      }
      triggerRef.current?.focus()
    },
    [closeMenu, currentValue, emitChange]
  )

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (filteredOptions.length === 0) return
      let idx = highlightedIndex
      for (let i = 0; i < filteredOptions.length; i += 1) {
        idx = (idx + direction + filteredOptions.length) % filteredOptions.length
        if (!filteredOptions[idx].disabled) {
          setHighlightedIndex(idx)
          return
        }
      }
    },
    [filteredOptions, highlightedIndex]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeMenu()
        triggerRef.current?.focus()
        break
      case 'Tab':
        closeMenu()
        break
      case 'ArrowDown':
        e.preventDefault()
        moveHighlight(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveHighlight(-1)
        break
      case 'Home': {
        e.preventDefault()
        const first = filteredOptions.findIndex((o) => !o.disabled)
        if (first >= 0) setHighlightedIndex(first)
        break
      }
      case 'End': {
        e.preventDefault()
        for (let i = filteredOptions.length - 1; i >= 0; i -= 1) {
          if (!filteredOptions[i].disabled) {
            setHighlightedIndex(i)
            break
          }
        }
        break
      }
      case 'Enter':
      case ' ': {
        if (e.key === ' ' && showSearch && document.activeElement === searchInputRef.current) {
          return
        }
        e.preventDefault()
        const opt = filteredOptions[highlightedIndex]
        if (opt && !opt.disabled) {
          handleSelectOption(opt)
        }
        break
      }
      default: {
        if (
          !showSearch &&
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          const state = typeaheadRef.current
          state.buffer += e.key.toLowerCase()
          if (state.timer !== null) window.clearTimeout(state.timer)
          state.timer = window.setTimeout(() => {
            state.buffer = ''
            state.timer = null
          }, 500)
          const matchIdx = filteredOptions.findIndex(
            (o) => !o.disabled && o.label.toLowerCase().startsWith(state.buffer)
          )
          if (matchIdx >= 0) {
            setHighlightedIndex(matchIdx)
          }
        }
      }
    }
  }

  const displayLabel = selectedOption?.label ?? placeholder ?? ''
  const isMutedDisplay =
    !selectedOption ||
    (selectedOption.value === '' &&
      (selectedOption.disabled || options.length <= 1))

  const triggerButton = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={isOpen ? listboxId : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-dp-select-trigger="true"
      data-open={isOpen ? 'true' : 'false'}
      disabled={disabled}
      title={title ?? displayLabel}
      style={style}
      onClick={(e) => {
        onClick?.(e)
        if (!disabled) {
          if (isOpen) closeMenu()
          else openMenu()
        }
      }}
      onKeyDown={handleKeyDown}
      className={`dp-select-trigger ${className}`}
    >
      <span
        className={`truncate flex-1 text-left ${
          isMutedDisplay ? 'text-zinc-400 dark:text-zinc-500 font-normal' : ''
        }`}
      >
        {displayLabel}
      </span>
      <svg
        aria-hidden="true"
        className={`dp-select-chevron shrink-0 w-4 h-4 transition-transform duration-150 ${
          isOpen
            ? 'rotate-180 text-[#6d25da] dark:text-[#a87ce9]'
            : 'text-zinc-400 dark:text-zinc-500'
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )

  const menuPortal =
    isOpen && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            data-dp-select-menu="true"
            data-placement={menuPos.placement}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: menuPos.placement === 'bottom' ? menuPos.top : undefined,
              bottom:
                menuPos.placement === 'top'
                  ? window.innerHeight - menuPos.top
                  : undefined,
              left: menuPos.left,
              minWidth: menuPos.width,
              maxWidth: Math.min(window.innerWidth - 16, Math.max(menuPos.width, 360)),
              zIndex: 9999,
            }}
            className={`dp-select-menu ${
              menuPos.placement === 'top'
                ? 'dp-select-enter-up'
                : 'dp-select-enter-down'
            }`}
          >
            {showSearch && (
              <div className="p-1.5 border-b border-zinc-200/70 dark:border-white/[0.08]">
                <div className="relative">
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setHighlightedIndex(0)
                    }}
                    placeholder="Filter options..."
                    className="dp-select-search w-full pl-8 pr-2.5 py-1.5 rounded-lg text-xs"
                  />
                </div>
              </div>
            )}

            <div
              className="overflow-y-auto p-1.5 space-y-0.5"
              style={{ maxHeight: menuPos.maxHeight }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const prevGroup = idx > 0 ? filteredOptions[idx - 1].group : undefined
                  const showGroupHeader = Boolean(opt.group) && opt.group !== prevGroup
                  const isSelected = opt.value === currentValue
                  const isHighlighted = idx === highlightedIndex

                  return (
                    <Fragment key={`${opt.group ?? ''}::${opt.value}::${idx}`}>
                      {showGroupHeader && (
                        <div
                          className={`px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none ${
                            idx > 0
                              ? 'mt-1 border-t border-zinc-200/70 dark:border-white/[0.07]'
                              : ''
                          }`}
                        >
                          {opt.group}
                        </div>
                      )}
                      <button
                        ref={(el) => {
                          optionRefs.current[idx] = el
                        }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        data-selected={isSelected ? 'true' : 'false'}
                        data-highlighted={isHighlighted ? 'true' : 'false'}
                        onMouseEnter={() => {
                          if (!opt.disabled) setHighlightedIndex(idx)
                        }}
                        onMouseDown={(e) => {
                          // Prevent trigger blur before selection runs
                          e.preventDefault()
                        }}
                        onClick={() => handleSelectOption(opt)}
                        className="dp-select-option"
                      >
                        <span className="truncate flex-1 text-left">{opt.label}</span>
                        {isSelected && (
                          <svg
                            aria-hidden="true"
                            className="w-4 h-4 shrink-0 text-[#6d25da] dark:text-[#a87ce9]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    </Fragment>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null

  if (required) {
    return (
      <span className="relative inline-flex w-full">
        {triggerButton}
        <input
          type="text"
          name={name}
          tabIndex={-1}
          aria-hidden="true"
          required
          value={currentValue}
          onChange={() => {}}
          className="sr-only pointer-events-none"
        />
        {menuPortal}
      </span>
    )
  }

  return (
    <>
      {triggerButton}
      {menuPortal}
    </>
  )
}
