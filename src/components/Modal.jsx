export default function Modal({ title, onClose, children, actions }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2>{title}</h2>
        <div style={{ marginTop: 14 }}>{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}
