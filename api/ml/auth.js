// Redirige al usuario a la pantalla de autorización de Mercado Libre.
export default function handler(req, res) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID,
    redirect_uri: process.env.ML_REDIRECT_URI,
  })
  res.writeHead(302, { Location: `https://auth.mercadolibre.com.ar/authorization?${params}` })
  res.end()
}
