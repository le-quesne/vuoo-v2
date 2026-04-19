import { useEffect, useRef } from 'react'
import { MessageCircle, Phone, Send } from 'lucide-react'

interface ContactDriverMenuProps {
  driver: { id: string; name: string; phone: string | null }
  onClose: () => void
  onPush?: () => void
  anchorClassName?: string
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

function ContactDriverMenu({
  driver,
  onClose,
  onPush,
  anchorClassName,
}: ContactDriverMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const hasPhone = driver.phone !== null && driver.phone.trim().length > 0
  const cleanPhone = hasPhone ? sanitizePhone(driver.phone as string) : ''

  const baseBtn =
    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors'
  const enabledBtn = 'text-gray-700 hover:bg-gray-50'
  const disabledBtn = 'text-gray-400 cursor-not-allowed'

  const className =
    anchorClassName ??
    'absolute right-0 top-full mt-1 w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-1'

  return (
    <div ref={menuRef} className={className}>
      <button
        type="button"
        disabled={!hasPhone}
        onClick={() => {
          if (!hasPhone) return
          window.open(`https://wa.me/${cleanPhone}`, '_blank', 'noopener,noreferrer')
          onClose()
        }}
        className={`${baseBtn} ${hasPhone ? enabledBtn : disabledBtn}`}
      >
        <MessageCircle size={14} />
        WhatsApp
      </button>

      <button
        type="button"
        disabled={!hasPhone}
        onClick={() => {
          if (!hasPhone) return
          window.location.href = `tel:${cleanPhone}`
          onClose()
        }}
        className={`${baseBtn} ${hasPhone ? enabledBtn : disabledBtn}`}
      >
        <Phone size={14} />
        Llamar
      </button>

      <button
        type="button"
        onClick={() => {
          onPush?.()
          onClose()
        }}
        className={`${baseBtn} ${enabledBtn}`}
      >
        <Send size={14} />
        Enviar push
      </button>
    </div>
  )
}

export default ContactDriverMenu
