import { useEffect, useRef, useState } from 'react'
import './App.css'
import { initializeApp } from 'firebase/app'
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
} from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)

function App() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const cursorRef = useRef(null)
  const ctxRef = useRef(null)
  const strokesRefRef = useRef(null)
  const strokesMapRef = useRef({})
  const pendingRenderRef = useRef(false)
  const pendingFlushRef = useRef(false)
  const deviceRatioRef = useRef(window.devicePixelRatio || 1)
  const canvasSizeRef = useRef({ width: 0, height: 0 })

  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('room') || ''
  })
  const [joined, setJoined] = useState(false)
  const [color, setColor] = useState('#0b6cf0')
  const [size, setSize] = useState(4)
  const [eraser, setEraser] = useState(false)
  const drawingRef = useRef(false)
  const localStrokeIdRef = useRef(null)
  const localPointsRef = useRef([])
  const lastPosRef = useRef(null)
  const clientId = useRef(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const key = 'wb:clientId'
    let id = localStorage.getItem(key)
    if (!id) {
      id = Math.random().toString(36).slice(2, 9)
      localStorage.setItem(key, id)
    }
    clientId.current = id
  }, [])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    deviceRatioRef.current = ratio
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    canvas.width = Math.floor(rect.width * ratio)
    canvas.height = Math.floor(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
    canvasSizeRef.current = { width: rect.width, height: rect.height }
    scheduleRender()
  }

  function scheduleRender() {
    if (pendingRenderRef.current) return
    pendingRenderRef.current = true
    requestAnimationFrame(() => {
      pendingRenderRef.current = false
      redrawAll()
    })
  }

  function redrawAll() {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!ctx || !canvas) return
    const { width, height } = canvasSizeRef.current
    ctx.clearRect(0, 0, width, height)
    Object.values(strokesMapRef.current).forEach((stroke) => {
      drawStroke(stroke, ctx)
    })
  }

  function drawStroke(stroke, ctx) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return
    ctx.save()
    ctx.lineWidth = stroke.size || 4
    if (stroke.eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color || '#000'
    }
    ctx.beginPath()
    const pts = stroke.points
    ctx.moveTo(pts[0].x, pts[0].y)
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y)
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const curr = pts[i]
        const next = pts[i + 1]
        const midX = (curr.x + next.x) / 2
        const midY = (curr.y + next.y) / 2
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY)
      }
      const last = pts[pts.length - 1]
      ctx.lineTo(last.x, last.y)
    }
    ctx.stroke()
    ctx.restore()
  }

  function screenToLocal(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = ('clientX' in e ? e.clientX : e.touches && e.touches[0] && e.touches[0].clientX) - rect.left
    const y = ('clientY' in e ? e.clientY : e.touches && e.touches[0] && e.touches[0].clientY) - rect.top
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) }
  }

  function updateCursor(pos) {
    const el = cursorRef.current
    if (!el || !pos) return
    el.style.display = 'block'
    el.style.left = `${pos.x}px`
    el.style.top = `${pos.y}px`
    el.style.width = `${Math.max(6, size)}px`
    el.style.height = `${Math.max(6, size)}px`
    if (eraser) {
      el.style.background = 'transparent'
      el.style.border = '2px solid rgba(0,0,0,0.6)'
    } else {
      el.style.background = color
      el.style.border = '2px solid rgba(255,255,255,0.6)'
    }
  }

  function hideCursor() {
    const el = cursorRef.current
    if (el) el.style.display = 'none'
  }

  function handlePointerDown(e) {
    if (!joined) return
    drawingRef.current = true
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId) } catch {}
    const pos = screenToLocal(e)
    lastPosRef.current = pos
    updateCursor(pos)
    startNewStroke(pos)
  }

  function startNewStroke(pos) {
    const strokesRef = ref(db, `rooms/${roomId}/strokes`)
    strokesRefRef.current = strokesRef
    const newRef = push(strokesRef)
    const id = newRef.key
    localStrokeIdRef.current = id
    localPointsRef.current = [pos]
    set(newRef, {
      color,
      size,
      eraser,
      completed: false,
      createdAt: Date.now(),
      clientId: clientId.current,
      points: localPointsRef.current,
    }).catch(console.error)
    strokesMapRef.current[id] = { color, size, eraser, createdAt: Date.now(), clientId: clientId.current, points: [...localPointsRef.current] }
    scheduleRender()
    scheduleFlush()
  }

  function scheduleFlush() {
    if (pendingFlushRef.current) return
    pendingFlushRef.current = true
    setTimeout(() => {
      pendingFlushRef.current = false
      flushPoints()
    }, 60)
  }

  function flushPoints() {
    const id = localStrokeIdRef.current
    if (!id) return
    const path = `rooms/${roomId}/strokes/${id}`
    const strokeRef = ref(db, path)
    update(strokeRef, { points: localPointsRef.current }).catch(console.error)
  }

  function handlePointerMove(e) {
    const pos = screenToLocal(e)
    updateCursor(pos)
    if (!drawingRef.current) return
    const last = lastPosRef.current
    if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 1) {
      localPointsRef.current.push(pos)
      const id = localStrokeIdRef.current
      if (id) {
        strokesMapRef.current[id] = {
          ...(strokesMapRef.current[id] || {}),
          color,
          size,
          eraser,
          points: [...localPointsRef.current],
        }
      }
      lastPosRef.current = pos
      scheduleRender()
      scheduleFlush()
    }
  }

  function handlePointerUp(e) {
    if (!drawingRef.current) return
    drawingRef.current = false
    try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId) } catch {}
    const id = localStrokeIdRef.current
    if (id) {
      const path = `rooms/${roomId}/strokes/${id}`
      const strokeRef = ref(db, path)
      update(strokeRef, { points: localPointsRef.current, completed: true }).catch(console.error)
    }
    localStrokeIdRef.current = null
    localPointsRef.current = []
    lastPosRef.current = null
    hideCursor()
  }

  useEffect(() => {
    if (!joined) return
    const strokesRef = ref(db, `rooms/${roomId}/strokes`)
    strokesRefRef.current = strokesRef
    const unsubAdded = onChildAdded(strokesRef, (snap) => {
      const data = snap.val()
      if (!data) return
      strokesMapRef.current[snap.key] = data
      scheduleRender()
    })
    const unsubChanged = onChildChanged(strokesRef, (snap) => {
      const data = snap.val()
      if (!data) return
      strokesMapRef.current[snap.key] = data
      scheduleRender()
    })
    const unsubRemoved = onChildRemoved(strokesRef, (snap) => {
      delete strokesMapRef.current[snap.key]
      scheduleRender()
    })
    return () => {
      try { unsubAdded && unsubAdded() } catch {}
      try { unsubChanged && unsubChanged() } catch {}
      try { unsubRemoved && unsubRemoved() } catch {}
    }
  }, [joined, roomId])

  function joinRoom() {
    let id = roomId.trim()
    if (!id) {
      id = Math.random().toString(36).slice(2, 9)
      const url = new URL(window.location.href)
      url.searchParams.set('room', id)
      window.history.replaceState({}, '', url.toString())
      setRoomId(id)
    }
    setJoined(true)
  }

  function clearBoard() {
    if (!joined) return
    if (!confirm('Clear the board for everyone in this room?')) return
    const strokesRef = ref(db, `rooms/${roomId}/strokes`)
    remove(strokesRef).catch(console.error)
    strokesMapRef.current = {}
    scheduleRender()
  }

  function copyRoomLink() {
    if (!roomId) {
      joinRoom()
    }
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  function undoLast() {
    if (!joined) return
    const own = Object.entries(strokesMapRef.current).filter(([id, s]) => s && s.clientId === clientId.current)
    if (!own.length) return
    const last = own.reduce((a, b) => ( (a[1].createdAt || 0) > (b[1].createdAt || 0) ? a : b ))
    const id = last[0]
    remove(ref(db, `rooms/${roomId}/strokes/${id}`)).catch(console.error)
    delete strokesMapRef.current[id]
    scheduleRender()
  }

  const palette = ['#0b6cf0', '#ff5858', '#ffb648', '#ffd166', '#06d6a0', '#8338ec', '#000000', '#ffffff']

  return (
    <div className="app">
      <div className="toolbar">
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <label className="room-label">Room</label>
          <input className="room-input" value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="room id or leave blank" />
          <button className="btn" onClick={joinRoom} disabled={joined}>{joined ? 'Joined' : 'Join'}</button>
        </div>

        <div className="palette" style={{display:'flex',gap:8,alignItems:'center'}}>
          {palette.map(c => (
            <button
              key={c}
              className={`swatch ${c === color ? 'selected' : ''}`}
              onClick={() => setColor(c)}
              style={{background: c}} aria-label={`color ${c}`}
            />
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{marginLeft:8}} />
        </div>

        <div className="size-control" style={{display:'flex',alignItems:'center',gap:8}}>
          <input className="size-slider" type="range" min="1" max="80" value={size} onChange={e => setSize(Number(e.target.value))} />
          <div className="size-pill">{size}px</div>
          <button className={`btn ghost ${eraser ? 'selected' : ''}`} onClick={() => setEraser(!eraser)} style={{marginLeft:8}}>{eraser ? 'Pen' : 'Eraser'}</button>
        </div>

        <div className="meta">
          <button className="btn ghost" onClick={undoLast}>Undo</button>
          <button className="btn ghost" onClick={copyRoomLink}>{copied ? 'Copied!' : 'Copy Link'}</button>
          <button className="btn" onClick={clearBoard}>Clear</button>
        </div>
      </div>

      <div className="canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <div ref={cursorRef} className="cursor-indicator" />
      </div>
    </div>
  )
}

export default App
