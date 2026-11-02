import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector } from 'barcode-detector/ponyfill'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix']
const SAME_CODE_COOLDOWN_MS = 1500

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1200
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
    osc.onended = () => ctx.close()
  } catch { /* sin audio */ }
}

// Escáner con la cámara del celular. Queda abierto para escanear varios seguidos
// (continuous) o se cierra solo después del primer código (single).
// onDetect(code) puede devolver un texto para mostrar como resultado del último escaneo.
export default function BarcodeScanner({ onDetect, onClose, continuous = true, title = 'Escanear código' }) {
  const videoRef = useRef(null)
  const onDetectRef = useRef(onDetect)
  const onCloseRef = useRef(onClose)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null) // { text, ok }
  const [manual, setManual] = useState('')

  useEffect(() => { onDetectRef.current = onDetect; onCloseRef.current = onClose }, [onDetect, onClose])

  useEffect(() => {
    let stream = null
    let stopped = false
    let timer = null
    let last = { code: '', at: 0 }
    const detector = new BarcodeDetector({ formats: FORMATS })

    async function handle(code) {
      const now = Date.now()
      if (code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS) return
      last = { code, at: now }
      beep()
      if (navigator.vibrate) navigator.vibrate(60)
      const result = await onDetectRef.current(code)
      if (result) setFeedback(typeof result === 'string' ? { text: result, ok: true } : result)
      if (!continuous) onCloseRef.current()
    }

    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video)
          if (codes.length > 0 && codes[0].rawValue) await handle(codes[0].rawValue.trim())
        } catch { /* frame inválido, se reintenta */ }
      }
      if (!stopped) timer = setTimeout(tick, 200)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Probá con Chrome o Safari actualizados.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        tick()
      } catch (e) {
        setError(e?.name === 'NotAllowedError'
          ? 'No se dio permiso para usar la cámara. Habilitalo en los ajustes del navegador para este sitio.'
          : 'No se pudo abrir la cámara: ' + (e?.message || e))
      }
    }

    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [continuous])

  async function submitManual(e) {
    e.preventDefault()
    const code = manual.trim()
    if (!code) return
    setManual('')
    const result = await onDetectRef.current(code)
    if (result) setFeedback(typeof result === 'string' ? { text: result, ok: true } : result)
    if (!continuous) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>{title}</h2>
        <div style={{ marginTop: 12 }}>
          {error ? (
            <div style={{ color: 'var(--danger)', fontSize: 13.5, marginBottom: 12 }}>{error}</div>
          ) : (
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', left: '10%', right: '10%', top: '35%', bottom: '35%', border: '2px solid rgba(255,255,255,0.85)', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
            </div>
          )}

          {feedback && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, background: feedback.ok ? 'var(--accent-soft)' : 'transparent', color: feedback.ok ? 'var(--text)' : 'var(--danger)', border: '1px solid var(--border)' }}>
              {feedback.text}
            </div>
          )}

          <form onSubmit={submitManual} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input className="input" inputMode="numeric" placeholder="O escribí el código a mano" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button type="submit" className="btn">OK</button>
          </form>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>{continuous ? 'Listo' : 'Cancelar'}</button>
        </div>
      </div>
    </div>
  )
}
