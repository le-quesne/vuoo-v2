import { supabase } from './supabase'

interface NotifyDriverRouteAssignedArgs {
  driverId: string
  routeId: string
  planName?: string | null
  planDate?: string | null
}

/**
 * Fires a push to the user linked to `driverId` announcing a route assignment.
 * Non-blocking from the caller's perspective — errors are swallowed to a
 * console warn so the main save flow never fails because a push didn't go out.
 */
export async function notifyDriverRouteAssigned({
  driverId,
  routeId,
  planName,
  planDate,
}: NotifyDriverRouteAssignedArgs): Promise<void> {
  try {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('user_id, first_name')
      .eq('id', driverId)
      .maybeSingle()

    if (error || !driver?.user_id) {
      if (error) console.warn('[notifyDriver] lookup failed', error.message)
      return
    }

    const titleBase = planName?.trim() ? `Nueva ruta: ${planName.trim()}` : 'Nueva ruta asignada'
    const bodyParts: string[] = []
    if (planDate) bodyParts.push(planDate)
    bodyParts.push('Abre la app para ver las paradas.')

    const { error: invokeError } = await supabase.functions.invoke('send-push', {
      body: {
        user_ids: [driver.user_id],
        title: titleBase,
        body: bodyParts.join(' · '),
        data: { type: 'route_assigned', routeId },
      },
    })
    if (invokeError) {
      console.warn('[notifyDriver] send-push failed', invokeError.message)
    }
  } catch (err) {
    console.warn('[notifyDriver] unexpected error', err)
  }
}

async function resolveDriverUserId(driverId: string): Promise<string | null> {
  try {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', driverId)
      .maybeSingle()

    if (error) {
      console.warn('[notifyDriver] lookup failed', error.message)
      return null
    }
    return driver?.user_id ?? null
  } catch (err) {
    console.warn('[notifyDriver] lookup unexpected error', err)
    return null
  }
}

async function sendPushToUser(args: {
  userId: string
  title: string
  body: string
  data: Record<string, unknown>
}): Promise<boolean> {
  try {
    const { error: invokeError } = await supabase.functions.invoke('send-push', {
      body: {
        user_ids: [args.userId],
        title: args.title,
        body: args.body,
        data: args.data,
      },
    })
    if (invokeError) {
      console.warn('[notifyDriver] send-push failed', invokeError.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[notifyDriver] send-push unexpected error', err)
    return false
  }
}

export async function notifyDriverStopReassigned(args: {
  fromDriverId: string | null
  toDriverId: string | null
  stopName: string
}): Promise<void> {
  const { fromDriverId, toDriverId, stopName } = args
  const tasks: Promise<unknown>[] = []

  if (fromDriverId) {
    tasks.push(
      (async () => {
        try {
          const userId = await resolveDriverUserId(fromDriverId)
          if (!userId) return
          await sendPushToUser({
            userId,
            title: 'Parada removida',
            body: `Se removio: ${stopName}`,
            data: { type: 'stop_reassigned' },
          })
        } catch (err) {
          console.warn('[notifyDriver] stop-removed unexpected error', err)
        }
      })(),
    )
  }

  if (toDriverId) {
    tasks.push(
      (async () => {
        try {
          const userId = await resolveDriverUserId(toDriverId)
          if (!userId) return
          await sendPushToUser({
            userId,
            title: 'Nueva parada',
            body: `Se añadio: ${stopName}`,
            data: { type: 'stop_reassigned' },
          })
        } catch (err) {
          console.warn('[notifyDriver] stop-added unexpected error', err)
        }
      })(),
    )
  }

  await Promise.all(tasks)
}

export async function notifyDriversCustom(args: {
  driverIds: string[]
  title: string
  body: string
}): Promise<{ sent: number; failed: number }> {
  const { driverIds, title, body } = args
  let sent = 0
  let failed = 0

  await Promise.all(
    driverIds.map(async (driverId) => {
      try {
        const userId = await resolveDriverUserId(driverId)
        if (!userId) {
          failed += 1
          return
        }
        const ok = await sendPushToUser({
          userId,
          title,
          body,
          data: { type: 'custom' },
        })
        if (ok) {
          sent += 1
        } else {
          failed += 1
        }
      } catch (err) {
        console.warn('[notifyDriver] custom push unexpected error', err)
        failed += 1
      }
    }),
  )

  return { sent, failed }
}
