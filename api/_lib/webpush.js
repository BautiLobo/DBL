import webpush from 'web-push'
import { supabaseAdmin } from './supabaseAdmin.js'

let configured = false

async function ensureConfigured(db) {
  if (configured) return true
  const { data: rows } = await db.from('push_config').select('*')
  const map = {}
  for (const row of rows || []) map[row.key] = row.value
  if (!map.vapid_public_key || !map.vapid_private_key) return false
  webpush.setVapidDetails(map.vapid_subject || 'mailto:soporte@example.com', map.vapid_public_key, map.vapid_private_key)
  configured = true
  return true
}

// Manda una notificacion push a todos los dispositivos suscriptos.
// Si un endpoint quedo invalido (410/404) lo borra de la tabla.
export async function sendPushToAll(payload) {
  const db = supabaseAdmin()
  const ok = await ensureConfigured(db)
  if (!ok) return

  const { data: subs } = await db.from('push_subscriptions').select('*')
  if (!subs || subs.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        )
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('Error enviando push', sub.id, e.message)
        }
      }
    })
  )
}
