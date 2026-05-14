import { supabase } from '@/application/lib/supabase'

interface NotifyDriverRouteAssignedArgs {
  driverId: string
  routeId: string
  planName?: string | null
  planDate?: string | null
}

export async function notifyDriverRouteAssigned({
  driverId,
  routeId,
  planName,
  planDate,
}: NotifyDriverRouteAssignedArgs): Promise<void> {
  try {
    const userId = await resolveDriverUserId(driverId)
    if (!userId) return

    const title = planName?.trim() ? `Nueva ruta: ${planName.trim()}` : 'Nueva ruta asignada'
    const bodyParts: string[] = []
    if (planDate) bodyParts.push(planDate)
    bodyParts.push('Abre la app para ver las paradas.')

    await sendPushToUser({
      userId,
      title,
      body: bodyParts.join(' · '),
      data: { type: 'route_assigned', routeId },
    })
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

export async function notifyDriversOnPublish(planId: string): Promise<void> {
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('name, date')
      .eq('id', planId)
      .maybeSingle()

    const { data: planRoutes } = await supabase
      .from('routes')
      .select('id, driver_id')
      .eq('plan_id', planId)
      .not('driver_id', 'is', null)

    if (!planRoutes?.length) return

    const title = plan?.name?.trim() ? `Ruta lista: ${plan.name.trim()}` : 'Ruta lista para hoy'
    const body = [plan?.date, 'Abre la app para ver tus paradas.'].filter(Boolean).join(' · ')

    await Promise.all(
      planRoutes.map(async (route) => {
        try {
          const userId = await resolveDriverUserId(route.driver_id as string)
          if (!userId) return
          await sendPushToUser({
            userId,
            title,
            body,
            data: { type: 'plan_published', planId, routeId: route.id },
          })
        } catch (err) {
          console.warn('[notifyDriver] plan-published push unexpected error', err)
        }
      }),
    )
  } catch (err) {
    console.warn('[notifyDriver] notifyDriversOnPublish unexpected error', err)
  }
}

export async function notifyDriversOnUnpublish(planId: string): Promise<void> {
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('name, date')
      .eq('id', planId)
      .maybeSingle()

    const { data: planRoutes } = await supabase
      .from('routes')
      .select('id, driver_id')
      .eq('plan_id', planId)
      .not('driver_id', 'is', null)

    if (!planRoutes?.length) return

    const title = plan?.name?.trim() ? `Ruta modificada: ${plan.name.trim()}` : 'Ruta modificada'
    const body = 'Tu ruta fue pausada. Espera instrucciones del despachador.'

    await Promise.all(
      planRoutes.map(async (route) => {
        try {
          const userId = await resolveDriverUserId(route.driver_id as string)
          if (!userId) return
          await sendPushToUser({
            userId,
            title,
            body,
            data: { type: 'plan_unpublished', planId, routeId: route.id },
          })
        } catch (err) {
          console.warn('[notifyDriver] plan-unpublished push unexpected error', err)
        }
      }),
    )
  } catch (err) {
    console.warn('[notifyDriver] notifyDriversOnUnpublish unexpected error', err)
  }
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
