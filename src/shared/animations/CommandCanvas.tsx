import { useEffect, useRef } from 'react'

/**
 * CommandCanvas — "The Response".
 *
 * A living incident-response scene, not a radar screensaver. The AASHA-UAV
 * story plays out behind the page on a loop:
 *
 *   wearable SOS beacon → signal wavefront → dispatch hub flash →
 *   UAVs launch on arcing intercept paths → holding orbit (overwatch) →
 *   resolve and fade.
 *
 * Interaction:
 *   - Click anywhere (not on a control) to raise a new incident there and
 *     watch the full response unfold.
 *   - The cursor carries a soft light and drives subtle parallax depth.
 *
 * Portal-aware: every element tints from the `--accent` CSS variable.
 * 30fps paint cap, visibility pause, reduced-motion static frame.
 */

const TAU = Math.PI * 2
const UAV_COUNT = 3
const MAX_INCIDENTS = 3
const TRAIL_LEN = 46

type IncidentState = 'alert' | 'dispatch' | 'respond' | 'overwatch' | 'resolve'

interface Incident {
  id: number
  x: number
  y: number
  born: number
  state: IncidentState
  waveR: number
  hubDist: number
  dispatched: boolean
  respondT0: number
  alpha: number
  shock: number // click shockwave 0..1 (1 = finished)
  seed: number
}

type UAVMode = 'stage' | 'enroute' | 'orbit' | 'return'

interface UAV {
  id: number
  label: string
  x: number
  y: number
  px: number
  py: number
  mode: UAVMode
  incident: Incident | null
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  t: number
  dur: number
  trail: { x: number; y: number }[]
  orbitA: number
  orbitRx: number
  orbitRy: number
  orbitSpd: number
  stageOX: number
  stageOY: number
  bob: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const quad = (p0: number, pc: number, p1: number, t: number) =>
  (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * pc + t * t * p1

function toRGBA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function CommandCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    let w = 0
    let h = 0
    let hubX = 0
    let hubY = 0
    let accent = '#ff3b47'
    let raf = 0
    let lastPaint = 0
    let lastUpdate = 0
    let hubFlash = -1e9
    let lastAmbient = 0
    let nextId = 1

    const incidents: Incident[] = []
    const uavs: UAV[] = []
    const particles: { x: number; y: number; s: number; v: number; p: number }[] = []
    const mouse = { x: 0, y: 0, cx: 0, cy: 0, seen: false }

    const STAGE = [
      { x: -58, y: -36 },
      { x: 50, y: -52 },
      { x: -10, y: 62 },
    ]

    const readAccent = () => {
      const v = getComputedStyle(canvas).getPropertyValue('--accent').trim()
      if (v) accent = v
    }

    /* ---------------- world ---------------- */

    const layout = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      hubX = w * 0.62
      hubY = h * 0.46
      readAccent()
      for (const inc of incidents) {
        inc.x = clamp(inc.x, 40, w - 40)
        inc.y = clamp(inc.y, 60, h - 40)
        inc.hubDist = Math.hypot(inc.x - hubX, inc.y - hubY)
      }
      // Phase 13: scale ambient particle count with viewport area, capped.
      // 70 was fixed regardless of screen size; now 40–120 based on area.
      const target = clamp(Math.round((w * h) / 25000), 40, 120)
      while (particles.length < target) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          s: rand(0.7, 1.9),
          v: rand(4, 14),
          p: rand(0, TAU),
        })
      }
      if (particles.length > target) particles.length = target
    }

    const startBezier = (u: UAV, x1: number, y1: number, dur: number) => {
      u.x0 = u.x
      u.y0 = u.y
      u.x1 = x1
      u.y1 = y1
      const mx = (u.x + x1) / 2
      const my = (u.y + y1) / 2
      const dx = x1 - u.x
      const dy = y1 - u.y
      const len = Math.hypot(dx, dy) || 1
      const side = Math.random() < 0.5 ? 1 : -1
      const off = rand(110, 230) * side
      u.cx = mx + (-dy / len) * off
      u.cy = my + (dx / len) * off
      u.t = 0
      u.dur = dur
    }

    const releaseUAVs = (inc: Incident) => {
      for (const u of uavs) {
        if (u.incident === inc && (u.mode === 'orbit' || u.mode === 'enroute')) {
          u.incident = null
          u.mode = 'return'
          const sx = hubX + u.stageOX
          const sy = hubY + u.stageOY
          startBezier(u, sx, sy, clamp(Math.hypot(sx - u.x, sy - u.y) / 420, 1.2, 2.4))
        }
      }
    }

    const assignUAVs = (inc: Incident) => {
      const free = uavs.filter((u) => u.mode === 'stage').slice(0, 2)
      for (const u of free) {
        u.incident = inc
        u.mode = 'enroute'
        const ang = rand(0, TAU)
        const tx = inc.x + Math.cos(ang) * u.orbitRx
        const ty = inc.y + Math.sin(ang) * u.orbitRy
        startBezier(u, tx, ty, clamp(Math.hypot(tx - u.x, ty - u.y) / 380, 1.4, 2.8))
      }
    }

    const spawnIncident = (
      x: number,
      y: number,
      ageOffsetMs: number,
      shock: boolean,
      now: number,
    ) => {
      if (incidents.length >= MAX_INCIDENTS) {
        const old = incidents.shift()
        if (old) releaseUAVs(old)
      }
      const ix = clamp(x, 40, w - 40)
      const iy = clamp(y, 70, h - 40)
      incidents.push({
        id: nextId++,
        x: ix,
        y: iy,
        born: now - ageOffsetMs,
        state: 'alert',
        waveR: 0,
        hubDist: Math.hypot(ix - hubX, iy - hubY),
        dispatched: false,
        respondT0: 0,
        alpha: 1,
        shock: shock ? 0 : 1,
        seed: rand(0, TAU),
      })
    }

    const spawnAmbient = (now: number) => {
      for (let tries = 0; tries < 14; tries++) {
        const x = rand(w * 0.08, w * 0.92)
        const y = rand(h * 0.14, h * 0.86)
        if (Math.hypot(x - hubX, y - hubY) < 200) continue
        if (incidents.some((i) => Math.hypot(i.x - x, i.y - y) < 240)) continue
        spawnIncident(x, y, 0, false, now)
        return
      }
    }

    const pushTrail = (u: UAV) => {
      u.trail.push({ x: u.x, y: u.y })
      if (u.trail.length > TRAIL_LEN) u.trail.shift()
    }

    /* ---------------- simulation ---------------- */

    const step = (dt: number, now: number) => {
      for (let i = incidents.length - 1; i >= 0; i--) {
        const inc = incidents[i]
        const age = (now - inc.born) / 1000
        if (inc.shock < 1) inc.shock = Math.min(1, inc.shock + dt * 1.4)

        if (inc.state === 'alert' && age > 1.4) {
          inc.state = 'dispatch'
          inc.waveR = 0
        } else if (inc.state === 'dispatch') {
          inc.waveR += dt * (inc.hubDist / 1.15)
          if (inc.waveR >= inc.hubDist && !inc.dispatched) {
            inc.dispatched = true
            hubFlash = now
            assignUAVs(inc)
            inc.state = 'respond'
            inc.respondT0 = now
          }
        } else if (inc.state === 'respond') {
          if (now - inc.respondT0 > 3400) inc.state = 'overwatch'
        } else if (inc.state === 'overwatch') {
          if (age > 15) inc.state = 'resolve'
        } else if (inc.state === 'resolve') {
          inc.alpha -= dt / 1.8
          if (inc.alpha <= 0) {
            releaseUAVs(inc)
            incidents.splice(i, 1)
          }
        }
      }

      if (!reduced && now - lastAmbient > 9500 && incidents.length < 2) {
        lastAmbient = now
        spawnAmbient(now)
      }

      for (const u of uavs) {
        u.px = u.x
        u.py = u.y
        if (u.mode === 'stage') {
          u.x = hubX + u.stageOX + Math.sin(now / 900 + u.bob) * 5
          u.y = hubY + u.stageOY + Math.cos(now / 1150 + u.bob) * 5
          if (u.trail.length) u.trail.shift()
        } else if (u.mode === 'enroute' || u.mode === 'return') {
          u.t += dt / u.dur
          const t = Math.min(u.t, 1)
          const e = easeInOut(t)
          u.x = quad(u.x0, u.cx, u.x1, e)
          u.y = quad(u.y0, u.cy, u.y1, e)
          pushTrail(u)
          if (t >= 1) {
            if (u.mode === 'enroute' && u.incident) {
              u.mode = 'orbit'
              u.orbitA = Math.atan2(u.y - u.incident.y, u.x - u.incident.x)
            } else {
              u.mode = 'stage'
            }
          }
        } else if (u.mode === 'orbit') {
          const inc = u.incident
          if (!inc || !incidents.includes(inc)) {
            u.incident = null
            u.mode = 'return'
            const sx = hubX + u.stageOX
            const sy = hubY + u.stageOY
            startBezier(u, sx, sy, 1.8)
          } else {
            u.orbitA += u.orbitSpd * dt
            u.x = inc.x + Math.cos(u.orbitA) * u.orbitRx
            u.y = inc.y + Math.sin(u.orbitA) * u.orbitRy
            pushTrail(u)
          }
        }
      }

      for (const p of particles) {
        p.y -= p.v * dt
        p.x += Math.sin(now / 2400 + p.p) * 0.12
        if (p.y < -10) {
          p.y = h + 10
          p.x = Math.random() * w
        }
      }

      if (mouse.seen) {
        mouse.cx += (mouse.x - mouse.cx) * 0.1
        mouse.cy += (mouse.y - mouse.cy) * 0.1
      }
    }

    /* ---------------- paint ---------------- */

    const hexPath = (x: number, y: number, r: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        const px = x + Math.cos(a) * r
        const py = y + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
    }

    const paintBackground = (now: number) => {
      const g = ctx.createRadialGradient(hubX, hubY, 0, hubX, hubY, Math.max(w, h) * 0.55)
      g.addColorStop(0, toRGBA(accent, 0.055))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      const px = mouse.seen ? (mouse.cx - w / 2) / (w / 2) : 0
      const py = mouse.seen ? (mouse.cy - h / 2) / (h / 2) : 0

      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      const gap = 46
      for (let gx = gap / 2 + px * 8; gx < w; gx += gap) {
        for (let gy = gap / 2 + py * 8; gy < h; gy += gap) {
          ctx.beginPath()
          ctx.arc(gx, gy, 1.1, 0, TAU)
          ctx.fill()
        }
      }

      ctx.strokeStyle = toRGBA(accent, 0.05)
      ctx.lineWidth = 1
      for (const r of [130, 215, 300]) {
        ctx.beginPath()
        ctx.arc(hubX, hubY, r, 0, TAU)
        ctx.stroke()
      }

      for (const p of particles) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.04 * Math.sin(now / 1500 + p.p)})`
        ctx.beginPath()
        ctx.arc(p.x + px * 16, p.y + py * 16, p.s, 0, TAU)
        ctx.fill()
      }
    }

    const paintHub = (now: number) => {
      ctx.save()
      ctx.strokeStyle = toRGBA(accent, 0.35)
      ctx.lineWidth = 1
      ctx.setLineDash([5, 11])
      ctx.lineDashOffset = -now / 70
      ctx.beginPath()
      ctx.arc(hubX, hubY, 56, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      const sa = now / 2600
      ctx.fillStyle = toRGBA(accent, 0.9)
      ctx.beginPath()
      ctx.arc(hubX + Math.cos(sa) * 56, hubY + Math.sin(sa) * 56, 2.4, 0, TAU)
      ctx.fill()
      ctx.restore()

      hexPath(hubX, hubY, 30)
      ctx.strokeStyle = toRGBA(accent, 0.85)
      ctx.lineWidth = 1.6
      ctx.stroke()
      hexPath(hubX, hubY, 40)
      ctx.strokeStyle = toRGBA(accent, 0.22)
      ctx.lineWidth = 1
      ctx.stroke()

      const fAge = (now - hubFlash) / 1000
      if (fAge < 1) {
        const fp = fAge / 1
        ctx.strokeStyle = toRGBA(accent, 0.7 * (1 - fp))
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(hubX, hubY, 34 + fp * 90, 0, TAU)
        ctx.stroke()
      }

      const glow = ctx.createRadialGradient(hubX, hubY, 0, hubX, hubY, 26)
      glow.addColorStop(0, 'rgba(255,255,255,0.95)')
      glow.addColorStop(0.35, toRGBA(accent, 0.85))
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(hubX, hubY, 26, 0, TAU)
      ctx.fill()

      ctx.fillStyle = 'rgba(235,240,248,0.5)'
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('AASHA DISPATCH', hubX, hubY + 74)
    }

    const paintIncident = (inc: Incident, now: number) => {
      const age = (now - inc.born) / 1000
      ctx.save()
      ctx.globalAlpha = clamp(inc.alpha, 0, 1)
      const A = (a: number) => toRGBA(accent, a)

      if (inc.shock < 1) {
        ctx.strokeStyle = A(0.55 * (1 - inc.shock))
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(inc.x, inc.y, 10 + inc.shock * 130, 0, TAU)
        ctx.stroke()
      }

      const pulse = inc.state === 'overwatch' ? 0.45 : 1
      for (const off of [0, 0.5]) {
        const p = (((age * 0.9 + off) % 1) + 1) % 1
        ctx.strokeStyle = A(0.5 * (1 - p) * pulse)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(inc.x, inc.y, 10 + p * 52, 0, TAU)
        ctx.stroke()
      }

      ctx.save()
      ctx.translate(inc.x, inc.y)
      ctx.rotate(now / 2400 + inc.seed)
      ctx.strokeStyle = A(0.6)
      ctx.lineWidth = 1.5
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2)
        ctx.beginPath()
        ctx.moveTo(0, -20)
        ctx.lineTo(0, -26)
        ctx.stroke()
      }
      ctx.restore()

      if (inc.dispatched && inc.state !== 'resolve') {
        ctx.strokeStyle = A(0.28)
        ctx.lineWidth = 1
        ctx.setLineDash([4, 7])
        ctx.beginPath()
        ctx.moveTo(inc.x, inc.y)
        ctx.lineTo(hubX, hubY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (inc.state === 'overwatch' || inc.state === 'respond') {
        ctx.strokeStyle = A(inc.state === 'overwatch' ? 0.4 : 0.18)
        ctx.lineWidth = 1
        ctx.setLineDash([10, 8])
        ctx.lineDashOffset = -now / 90
        ctx.beginPath()
        ctx.ellipse(inc.x, inc.y, 84, 52, 0, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
      }

      const blink = inc.state === 'alert' ? (Math.sin(now / 130) > 0 ? 1 : 0.35) : 0.9
      const core = ctx.createRadialGradient(inc.x, inc.y, 0, inc.x, inc.y, 20)
      core.addColorStop(0, `rgba(255,255,255,${0.95 * blink})`)
      core.addColorStop(0.4, A(0.8 * blink))
      core.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(inc.x, inc.y, 20, 0, TAU)
      ctx.fill()

      ctx.fillStyle = A(0.75)
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(inc.state === 'overwatch' ? 'SCENE HELD' : 'SOS', inc.x, inc.y - 34)

      ctx.restore()
    }

    const paintUAV = (u: UAV, now: number) => {
      const n = u.trail.length
      if (n > 1) {
        ctx.lineCap = 'round'
        for (let i = 1; i < n; i++) {
          ctx.strokeStyle = toRGBA(accent, (i / n) * 0.45)
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(u.trail[i - 1].x, u.trail[i - 1].y)
          ctx.lineTo(u.trail[i].x, u.trail[i].y)
          ctx.stroke()
        }
      }

      const ang = Math.atan2(u.y - u.py, u.x - u.px)
      const nearCursor =
        mouse.seen && Math.hypot(u.x - mouse.cx, u.y - mouse.cy) < 130

      ctx.save()
      ctx.translate(u.x, u.y)
      ctx.rotate(Number.isFinite(ang) ? ang : 0)

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16)
      g.addColorStop(0, toRGBA(accent, 0.5))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, 16, 0, TAU)
      ctx.fill()

      ctx.fillStyle = 'rgba(240,244,250,0.95)'
      ctx.beginPath()
      ctx.moveTo(8, 0)
      ctx.lineTo(-5.5, 5)
      ctx.lineTo(-2.8, 0)
      ctx.lineTo(-5.5, -5)
      ctx.closePath()
      ctx.fill()

      if ((now / 550 + u.id) % 2 < 1) {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(-3.5, 0, 1.6, 0, TAU)
        ctx.fill()
      }
      ctx.restore()

      ctx.fillStyle = nearCursor ? 'rgba(240,244,250,0.95)' : 'rgba(240,244,250,0.5)'
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(u.label, u.x + 12, u.y - 10)
    }

    const paintCursor = () => {
      if (!mouse.seen) return
      const g = ctx.createRadialGradient(mouse.cx, mouse.cy, 0, mouse.cx, mouse.cy, 240)
      g.addColorStop(0, toRGBA(accent, 0.045))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(mouse.cx - 240, mouse.cy - 240, 480, 480)
    }

    const paintVignette = () => {
      const g = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.42,
        w / 2, h / 2, Math.max(w, h) * 0.78,
      )
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(2,4,8,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    const paint = (now: number) => {
      ctx.clearRect(0, 0, w, h)
      paintBackground(now)
      paintHub(now)
      for (const inc of incidents) paintIncident(inc, now)
      for (const u of uavs) paintUAV(u, now)
      paintCursor()
      paintVignette()
    }

    /* ---------------- boot ---------------- */

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      if (!mouse.seen) {
        mouse.cx = e.clientX
        mouse.cy = e.clientY
        mouse.seen = true
      }
    }

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('a,button,input,textarea,select,[role="button"]')) return
      spawnIncident(e.clientX, e.clientY, 0, true, performance.now())
    }

    const onResize = () => layout()

    layout()

    // Phase 13: particle count is now viewport-scaled inside layout() (40–120),
    // not a fixed 70. layout() already populated it.

    for (let i = 0; i < UAV_COUNT; i++) {
      const s = STAGE[i % STAGE.length]
      uavs.push({
        id: i,
        label: `UAV-0${i + 1}`,
        x: hubX + s.x,
        y: hubY + s.y,
        px: hubX + s.x,
        py: hubY + s.y,
        mode: 'stage',
        incident: null,
        x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0,
        t: 0, dur: 1,
        trail: [],
        orbitA: rand(0, TAU),
        orbitRx: 66 + (i % 2) * 26,
        orbitRy: 40 + (i % 2) * 16,
        orbitSpd: (0.55 + i * 0.12) * (i % 2 === 0 ? 1 : -1),
        stageOX: s.x,
        stageOY: s.y,
        bob: rand(0, TAU),
      })
    }

    const t0 = performance.now()
    // open mid-response so the first paint already tells the story —
    // parked top-right, clear of the hero headline
    spawnIncident(w * 0.82, h * 0.24, 2900, false, t0)
    lastAmbient = t0

    if (reduced) {
      for (let i = 0; i < 200; i++) step(1 / 30, t0 + i * 33)
      paint(t0 + 200 * 33)
      return
    }

    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('click', onClick)
    window.addEventListener('resize', onResize)

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) {
        lastUpdate = now
        return
      }
      const dt = clamp((now - lastUpdate) / 1000 || 0.016, 0.001, 0.05)
      lastUpdate = now
      step(dt, now)
      if (now - lastPaint < 33) return
      lastPaint = now
      paint(now)
    }
    lastUpdate = performance.now()
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('click', onClick)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  )
}
