import type { DeliveryFeedback } from '@/data/types/database'

export type DeliveryFeedbackRow = DeliveryFeedback

// Row con join de stop + driver, según el query en feedback.services.ts.
export interface DeliveryFeedbackWithContext extends DeliveryFeedback {
  driver: { id: string; first_name: string; last_name: string } | null
  plan_stop: {
    id: string
    stop: { customer_name: string | null; name: string; address: string | null } | null
  } | null
}
