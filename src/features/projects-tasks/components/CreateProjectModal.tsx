import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { notifyError } from '@/lib/notify'

export function CreateProjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    code: string
    name: string
    clientName: string
    description: string
  }) => { ok: boolean; message: string }
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleNameChange(nextName: string) {
    setName(nextName)
    if (!code) {
      const suggested = nextName
        .trim()
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5)
      if (suggested.length >= 2) {
        setCode(suggested)
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !name.trim() || !clientName.trim()) {
      notifyError('Project Key, Name, and Client Organization are required.')
      return
    }
    const res = onCreate({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      clientName: clientName.trim(),
      description: description.trim(),
    })
    if (!res.ok) {
      return
    }
    setCode('')
    setName('')
    setClientName('')
    setDescription('')
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dp-popover-enter w-full max-w-lg rounded-2xl bg-white dark:bg-[#13131b] shadow-(--dp-shadow-popover) overflow-hidden"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Create Software Project
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Set up a new board, backlog, and billable client workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.07] dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Project Name *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Core Billing API"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Project Key *
              </label>
              <input
                type="text"
                required
                maxLength={10}
                placeholder="e.g. CORE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Client Organization *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Acme FinTech Ltd."
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Scope &amp; Deliverable Summary
            </label>
            <textarea
              rows={3}
              placeholder="Outline key milestones, architecture scope, or SLA expectations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] font-semibold text-white cursor-pointer"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
