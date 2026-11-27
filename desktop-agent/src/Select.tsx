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

interface OptionItem {
  value: string
  label: string
  disabled?: boolean
}

export interface DesktopSelectProps {
  id?: string
  value: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onChange: (e: { target: { value: string } }) => void
  children: React.ReactNode
}

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    return extractText(props.children)
  }
  return ''
}

function parseOptions(children: React.ReactNode): OptionItem[] {
  const out: OptionItem[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === Fragment) {
      const props = child.props as { children?: React.ReactNode }
      out.push(...parseOptions(props.children))
      return
    }
    if (child.type === 'option') {
      const props = child.props as {
        value?: string | number
        disabled?: boolean
        children?: React.ReactNode
      }
      const label = extractText(props.children).replace(/\s+/g, ' ').trim()
      const value = props.value !== undefined ? String(props.value) : label
      out.push({
        value,
        label: label || value,
        disabled: Boolean(props.disabled),
      })
    }
  })
  return out
}

interface MenuPos {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'bottom' | 'top'
}

export function Select({
  id,
  value,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  onChange,
  children,
}: DesktopSelectProps) {
  const options = useMemo(() => parseOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)

  const isOpen = open && !disabled
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? options[0] ?? null,
    [options, value]
  )

  const closeMenu = useCallback(() => {
    setOpen(false)
    setHighlightedIndex(-1)
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    const idx = options.findIndex((o) => o.value === value && !o.disabled)
    const fallback = options.findIndex((o) => !o.disabled)
    setHighlightedIndex(idx >= 0 ? idx : fallback)
    setOpen(true)
  }, [disabled, options, value])

  const computePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 6
    const spaceBelow = vh - rect.bottom - gap - 10
    const spaceAbove = rect.top - gap - 10
    const openTop = spaceBelow < 150 && spaceAbove > spaceBelow
    const maxHeight = Math.max(100, Math.min(220, openTop ? spaceAbove : spaceBelow))
    const width = Math.min(Math.max(rect.width, 160), vw - 16)
    const left = Math.min(rect.left, Math.max(8, vw - width - 8))
    const top = openTop ? rect.top - gap : rect.bottom + gap
    setMenuPos({
      top,
      left,
      width,
      maxHeight,
      placement: openTop ? 'top' : 'bottom',
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    computePosition()
  }, [isOpen, computePosition])

  useEffect(() => {
    if (!isOpen) return
    const onScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return
      }
      computePosition()
    }
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      closeMenu()
    }
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    document.addEventListener('mousedown', onOutside, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
      document.removeEventListener('mousedown', onOutside, true)
    }
  }, [isOpen, computePosition, closeMenu])

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, highlightedIndex])

  const selectOption = useCallback(
    (opt: OptionItem) => {
      if (opt.disabled) return
      closeMenu()
      if (opt.value !== value) {
        onChange({ target: { value: opt.value } })
      }
      triggerRef.current?.focus()
    },
    [closeMenu, value, onChange]
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
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      let idx = highlightedIndex
      for (let i = 0; i < options.length; i += 1) {
        idx = (idx + dir + options.length) % options.length
        if (!options[idx].disabled) {
          setHighlightedIndex(idx)
          break
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[highlightedIndex]
      if (opt && !opt.disabled) selectOption(opt)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        data-open={isOpen ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`tt-select-trigger ${className}`}
      >
        <span className="tt-select-label">{selectedOption?.label ?? ''}</span>
        <svg
          aria-hidden="true"
          className={`tt-select-chevron ${isOpen ? 'tt-select-chevron--open' : ''}`}
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

      {isOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={handleKeyDown}
            className="tt-select-menu"
            style={{
              position: 'fixed',
              top: menuPos.placement === 'bottom' ? menuPos.top : undefined,
              bottom: menuPos.placement === 'top' ? window.innerHeight - menuPos.top : undefined,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: 9999,
            }}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value
              const isHighlighted = idx === highlightedIndex
              return (
                <button
                  key={`${opt.value}::${idx}`}
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
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(opt)}
                  className="tt-select-option"
                >
                  <span className="tt-select-option-label">{opt.label}</span>
                  {isSelected && (
                    <svg
                      aria-hidden="true"
                      className="tt-select-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
