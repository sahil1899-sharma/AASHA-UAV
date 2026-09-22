import { useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import { VirtuosoGrid } from 'react-virtuoso'
import {
  AlertTriangle,
  Battery,
  Camera,
  CheckCircle2,
  Copy,
  Gauge,
  Link2,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'
import { EvidenceThumb } from './EvidenceThumb'
import { uavIcon } from './uavIcon'
import { UAV_BASE, usePoliceStore } from '../incidents/policeIncidentStore'
import type { EvidenceItem, PoliceIncident, UavDeployment } from '../incidents/policeIncidentStore'
import {
  EVIDENCE_GENESIS,
  verifyEvidenceChain,
  verifyEvidenceItem,
} from '../../../shared/evidence/evidenceIntegrity'

const DEPLOY_META: Record<UavDeployment, { label: string; chip: string }> = {
  standby: { label: 'Standby', chip: 'border-white/15 bg-white/[0.06] text-ink-400' },
  dispatched: { label: 'Dispatched', chip: 'border-amber-400/50 bg-amber-400/15 text-amber-200' },
  'en-route': { label: 'En Route', chip: 'border-blue-400/50 bg-blue-400/15 text-blue-200' },
  'on-scene': { label: 'On Scene', chip: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' },
  returning: { label: 'Returning', chip: 'border-indigo-400/50 bg-indigo-400/15 text-indigo-200' },
}

const sceneIcon = L.divIcon({
  className: 'aasha-scene-marker',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#ff3b47;border:2px solid #fff;box-shadow:0 0 12px #ff3b47;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
}

type ChainState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'pass'; checked: number }
  | { status: 'fail'; detail: string }

/** Verifies the full evidence chain for an incident and reports the result. */
function ChainVerifyButton({ items }: { items: EvidenceItem[] }) {
  const [state, setState] = useState<ChainState>({ status: 'idle' })
  const unsealed = items.some((i) => !i.sealed)

  const run = async () => {
    setState({ status: 'checking' })
    const result = await verifyEvidenceChain(items)
    setState(
      result.ok
        ? { status: 'pass', checked: result.checked }
        : { status: 'fail', detail: result.detail },
    )
  }

  return (
    <div className="flex items-center gap-2">
      {state.status === 'pass' && (
        <p className="flex items-center gap-1 font-mono text-[10px] text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Chain verified · {state.checked}/{state.checked} links intact
        </p>
      )}
      {state.status === 'fail' && (
        <p className="max-w-[320px] font-mono text-[10px] leading-snug text-red-300">
          <span className="mr-1 inline-flex items-center gap-1 align-middle"><ShieldX className="h-3.5 w-3.5" /> Chain broken</span>
          <span className="text-red-300/75">— {state.detail}</span>
        </p>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={unsealed || state.status === 'checking'}
        title={unsealed ? 'Waiting for items to seal…' : 'Re-hash every link in this incident\u2019s chain'}
        className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] text-accent-200 transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.status === 'checking' ? 'Verifying…' : 'Verify chain'}
      </button>
    </div>
  )
}

type VerifyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'pass' }
  | { status: 'fail'; actual: string }

function EvidenceDetail({
  item,
  incidentId,
  chainPosition,
  chainLength,
  onClose,
}: {
  item: EvidenceItem
  incidentId: string
  chainPosition: number
  chainLength: number
  onClose: () => void
}) {
  const tamperEvidenceItem = usePoliceStore((s) => s.tamperEvidenceItem)
  const restoreEvidenceItem = usePoliceStore((s) => s.restoreEvidenceItem)
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  const runVerify = async () => {
    setVerify({ status: 'checking' })
    const result = await verifyEvidenceItem(item)
    setVerify(result.ok ? { status: 'pass' } : { status: 'fail', actual: result.actual })
  }

  const corrupted = (item.byteMutations?.length ?? 0) > 0
  const prevLabel =
    item.prevHash === EVIDENCE_GENESIS
      ? 'Genesis (first item in this incident\u2019s chain)'
      : `sha256:${item.prevHash.slice(0, 24)}\u2026`

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Evidence detail">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-base-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div>
            <p className="text-sm font-bold text-ink-50">{item.label}</p>
            <p className="font-mono text-[10px] text-ink-500">{item.id} · {item.kind.toUpperCase()}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence detail" className="rounded-lg border border-white/10 p-1.5 text-ink-400 hover:text-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <EvidenceThumb item={item} onOpen={() => {}} />
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Chain of custody
            </p>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Captured</dt><dd className="font-mono text-ink-200">{formatClock(item.capturedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">UAV ID</dt><dd className="font-mono text-ink-200">{item.uavId}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">GPS at capture</dt><dd className="font-mono text-ink-200">{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Chain link</dt><dd className="font-mono text-[10px] text-ink-200">Item {chainPosition} of {chainLength}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-ink-500"><Link2 className="h-3 w-3" /> Links to</dt>
                <dd className="max-w-[220px] truncate font-mono text-[10px] text-ink-200" title={item.prevHash}>{prevLabel}</dd>
              </div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Custodian</dt><dd className="text-ink-200">AASHA-UAV dispatch vault</dd></div>
            </dl>
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">Integrity hash (SHA-256)</p>
                {item.sealed && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(item.integrity)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1200)
                    }}
                    className="flex items-center gap-1 font-mono text-[10px] text-ink-400 hover:text-ink-100"
                    aria-label="Copy full hash"
                  >
                    <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              {item.sealed ? (
                <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink-200">{item.integrity}</p>
              ) : (
                <p className="mt-1 font-mono text-[10px] text-amber-300">Sealing hash — one moment…</p>
              )}
            </div>
          </div>

          {/* Integrity verification */}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Integrity check</p>
              <button
                type="button"
                onClick={() => void runVerify()}
                disabled={!item.sealed || verify.status === 'checking'}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-200 transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verify.status === 'checking' ? 'Verifying…' : 'Verify Integrity'}
              </button>
            </div>
            {verify.status === 'pass' && (
              <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong>Integrity verified.</strong> Re-hashed bytes match the sealed SHA-256.</span>
              </p>
            )}
            {verify.status === 'fail' && (
              <div className="mt-2.5 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                <p className="flex items-start gap-2">
                  <ShieldX className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><strong>INTEGRITY FAILURE.</strong> Current bytes do not match the sealed hash — this item has been altered.</span>
                </p>
                <p className="mt-1.5 break-all font-mono text-[10px] text-red-300/80">recomputed: {verify.actual}</p>
              </div>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
              Re-hashes this item's current bytes with SHA-256 and compares against the sealed value.
            </p>
          </div>

          {/* Demo tamper affordance — clearly labelled, never production functionality */}
          <div className="mt-3 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/[0.04] p-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/90">
              <AlertTriangle className="h-3.5 w-3.5" /> Tamper demo
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Demonstration only — flips bytes in this mock item's file content so you can watch
              integrity verification catch it.
            </p>
            <div className="mt-2.5 flex gap-2">
              {!corrupted ? (
                <button
                  type="button"
                  onClick={() => {
                    tamperEvidenceItem(incidentId, item.id)
                    setVerify({ status: 'idle' })
                  }}
                  className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
                >
                  Corrupt mock bytes
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    restoreEvidenceItem(incidentId, item.id)
                    setVerify({ status: 'idle' })
                  }}
                  className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-white/10"
                >
                  Restore original bytes
                </button>
              )}
            </div>
            {corrupted && (
              <p className="mt-2 font-mono text-[10px] text-amber-300">
                {item.byteMutations!.length} bytes altered — run Verify Integrity to see it fail.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * UAV section for the selected incident: live telemetry, mini-map tracking
 * the airframe against the scene, and the timestamped evidence gallery with
 * chain-of-custody metadata per item.
 */
export function UavPanel({ incident }: { incident: PoliceIncident }) {
  const [openItem, setOpenItem] = useState<EvidenceItem | null>(null)
  const plan = usePoliceStore((s) => s.plans[incident.id])
  const u = incident.uav
  const dep = DEPLOY_META[u.deployment]
  const lowBattery = u.battery <= 20
  const evidenceReversed = useMemo(() => [...incident.evidence].reverse(), [incident.evidence])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Telemetry + mini-map */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Navigation className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-50">{u.id}</p>
              <p className="font-mono text-[10px] text-ink-500">Deterrence airframe</p>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${dep.chip}`}>
            {dep.label}
          </span>
        </div>

        <div className="relative z-0 mb-4 h-44 overflow-hidden rounded-xl border border-white/10">
          <MapContainer
            center={[u.lat, u.lng]}
            zoom={15}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
            attributionControl={false}
            style={{ height: '100%', width: '100%', background: '#0a0f16' }}
          >
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
            <Polyline positions={[[u.lat, u.lng], [UAV_BASE[0], UAV_BASE[1]]]} pathOptions={{ color: '#38bdf8', weight: 1, dashArray: '4 6', opacity: 0.5 }} />
            {plan && plan.reachable && plan.waypoints.length >= 2 ? (
              <Polyline
                positions={plan.waypoints.map((w) => [w.lat, w.lng] as [number, number])}
                pathOptions={{ color: '#7dd3fc', weight: 2.5, dashArray: '8 6', opacity: 0.9, className: 'aasha-flow-path' }}
              />
            ) : (
              <Polyline positions={[[u.lat, u.lng], [incident.lat, incident.lng]]} pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.8 }} />
            )}
            <Marker position={[u.lat, u.lng]} icon={uavIcon} interactive={false} />
            <Marker position={[incident.lat, incident.lng]} icon={sceneIcon} interactive={false} />
          </MapContainer>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
            <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
              <Battery className={`h-3 w-3 ${lowBattery ? 'text-red-300' : 'text-emerald-300'}`} /> Battery
            </p>
            <p className={`text-lg font-bold ${lowBattery ? 'text-red-300' : 'text-ink-50'}`}>{Math.round(u.battery)}%</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${lowBattery ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${u.battery}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
            <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
              <MapPin className="h-3 w-3 text-accent" /> Position
            </p>
            <p className="font-mono text-[11px] leading-5 text-ink-100">{u.lat.toFixed(4)}<br />{u.lng.toFixed(4)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
            <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
              <Gauge className="h-3 w-3 text-accent" /> Speed / Alt
            </p>
            <p className="text-lg font-bold text-ink-50">{Math.round(u.speed)} <span className="text-[10px] font-medium text-ink-500">m/s</span></p>
            <p className="font-mono text-[10px] text-ink-400">{Math.round(u.altitude)} m AGL</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
            <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
              <Camera className="h-3 w-3 text-accent" /> Captures
            </p>
            <p className="text-lg font-bold text-ink-50">{incident.evidence.length}</p>
            <p className="font-mono text-[10px] text-ink-400">items logged</p>
          </div>
        </div>
      </div>

      {/* Flight plan */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-1 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">Flight plan</p>
          {plan && plan.reachable && (
            <span className="rounded-full border border-sky-400/50 bg-sky-400/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">
              Route locked
            </span>
          )}
        </div>
        {!plan || u.deployment === 'standby' ? (
          <p className="mt-3 text-xs text-ink-500">No flight plan — the airframe is on standby at the dispatch hub.</p>
        ) : !plan.reachable ? (
          <p className="mt-3 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">
            No flyable route through the current airspace restrictions — the airframe is holding for clearance.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-500">Optimal route to the scene — replans instantly if airspace restrictions change.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
                <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
                  <Route className="h-3 w-3 text-sky-300" /> Route
                </p>
                <p className="text-lg font-bold text-ink-50">{(plan.pathLengthM / 1000).toFixed(2)} <span className="text-[10px] font-medium text-ink-500">km</span></p>
                <p className="font-mono text-[10px] text-ink-400">{plan.waypoints.length} waypoints</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
                <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
                  <Gauge className="h-3 w-3 text-sky-300" /> Progress
                </p>
                <p className="text-lg font-bold text-ink-50">{Math.round((plan.progressM / Math.max(plan.totalM, 1)) * 100)}<span className="text-[10px] font-medium text-ink-500">%</span></p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${(plan.progressM / Math.max(plan.totalM, 1)) * 100}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">Search</p>
                <p className="text-lg font-bold text-ink-50">{plan.nodesExpanded}</p>
                <p className="font-mono text-[10px] text-ink-400">nodes · {plan.computeMs.toFixed(1)} ms</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">Replans</p>
                <p className="text-lg font-bold text-ink-50">{plan.replanCount}</p>
                <p className="font-mono text-[10px] text-ink-400">
                  {plan.replanCount > 0 ? `airspace replan · ${plan.lastReplanMs.toFixed(1)} ms` : 'none yet'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Evidence gallery */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">UAV evidence</p>
          <div className="flex items-center gap-3">
            <p className="font-mono text-[10px] text-ink-500">{incident.evidence.length} items</p>
            {incident.evidence.length > 0 && <ChainVerifyButton items={incident.evidence} />}
          </div>
        </div>
        <p className="mb-4 text-xs text-ink-500">
          Timestamped captures with chain-of-custody metadata. Each item's SHA-256 links to the
          previous item — verify any item, or the whole chain. Click any item for its custody record.
        </p>
        {incident.evidence.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
            <Camera className="mb-2 h-6 w-6 text-ink-600" />
            <p className="text-xs text-ink-500">
              {u.deployment === 'standby'
                ? 'No airframe tasked to this incident yet.'
                : 'Airframe is positioning — captures will appear here.'}
            </p>
          </div>
        ) : (
          <VirtuosoGrid
            style={{ height: 380 }}
            data={evidenceReversed}
            overscan={6}
            computeItemKey={(_index, item) => item.id}
            listClassName="grid grid-cols-2 gap-3 pr-1"
            itemContent={(_index, item) => (
              <EvidenceThumb item={item} onOpen={() => setOpenItem(item)} />
            )}
          />
        )}
      </div>

      {openItem && (
        <EvidenceDetail
          key={openItem.id}
          item={incident.evidence.find((e) => e.id === openItem.id) ?? openItem}
          incidentId={incident.id}
          chainPosition={incident.evidence.findIndex((e) => e.id === openItem.id) + 1}
          chainLength={incident.evidence.length}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  )
}
