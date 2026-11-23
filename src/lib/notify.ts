import { toast } from 'sonner'

export const TOAST_DURATION_MS = 3000

export function notifyFeedback(res: {
  ok: boolean
  text?: string
  message?: string
}) {
  const text = (res.text ?? res.message ?? '').trim()
  if (!text) return
  if (res.ok) {
    toast.success(text, { duration: TOAST_DURATION_MS })
  } else {
    toast.error(text, { duration: TOAST_DURATION_MS })
  }
}

export function notifySuccess(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  toast.success(trimmed, { duration: TOAST_DURATION_MS })
}

export function notifyError(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  toast.error(trimmed, { duration: TOAST_DURATION_MS })
}

export function notifyInfo(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  toast.info(trimmed, { duration: TOAST_DURATION_MS })
}

export { toast }
