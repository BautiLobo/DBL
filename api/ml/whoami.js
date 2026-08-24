import { mlFetch } from '../_lib/mlToken.js'

// Devuelve la identidad de la cuenta de Mercado Libre conectada (con el token ya autenticado).
export default async function handler(req, res) {
  try {
    const me = await mlFetch('/users/me')
    res.status(200).json({
      id: me.id,
      nickname: me.nickname,
      email: me.email,
      site_id: me.site_id,
      first_name: me.first_name,
      last_name: me.last_name,
      seller_reputation: me.seller_reputation
        ? { level_id: me.seller_reputation.level_id, power_seller_status: me.seller_reputation.power_seller_status }
        : null,
      permalink: me.permalink,
    })
  } catch (e) {
    console.error('Error consultando /users/me ML', e)
    res.status(502).json({ error: 'No se pudo consultar la cuenta conectada' })
  }
}
