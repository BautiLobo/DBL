import { sendPushToAll } from './_lib/webpush.js'

// Manda una notificacion de prueba a todos los dispositivos suscriptos,
// para poder verificar que las push funcionan sin esperar una venta o pregunta real.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    await sendPushToAll({
      title: '✅ Notificaciones activadas',
      body: 'Así se van a ver los avisos de ventas y preguntas nuevas de Mercado Libre.',
      url: '/',
    })
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Error enviando push de prueba', e)
    res.status(500).json({ error: 'No se pudo enviar la notificación de prueba' })
  }
}
