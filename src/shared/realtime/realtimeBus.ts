import { useEffect } from 'react'
import type { ActiveIncident, IncidentStageId } from '../state/incidentStore'

/**
 * Shared realtime layer for the AASHA-UAV platform (Phase 6).
 *
 * Uses the BroadcastChannel API so every open tab/window on this origin —
 * user, police, and hospital dashboards side by side — reacts to the same
 * events without a backend. A tab never receives its own broadcasts (the
 * singleton channel below posts and listens on one object), and every
 * message carries a source tab id as a second line of defence.
 *
 * Message contract (all payloads are JSON-serializable):
 *  - sos:triggered     { incident: ActiveIncident, userName: string }
 *  - sos:stood-down    { id: string }
 *  - police:ack        { id: string }                       → user timeline: dispatch acknowledged
 *  - police:uav-onscene { id: string }                      → user timeline: UAV on scene
 *  - police:responding { id: string, unit: string }         → user timeline: responder en route
 *  - police:resolved   { id: string, kind: 'resolved' | 'false-alarm' }
 */

const CHANNEL_NAME = 'aasha-uav-realtime'

export const tabId: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.floor(Math.random() * 1e9)}`

export type BusMessageType =
  | 'sos:triggered'
  | 'sos:stood-down'
  | 'police:ack'
  | 'police:uav-onscene'
  | 'police:responding'
  | 'police:resolved'

export interface BusEnvelope {
  type: BusMessageType
  payload: unknown
  at: number
  source: string
}

export interface SosTriggeredPayload {
  incident: ActiveIncident
  userName: string
}

export interface PoliceRespondingPayload {
  id: string
  unit: string
}

export interface PoliceResolvedPayload {
  id: string
  kind: 'resolved' | 'false-alarm'
}

type Handler = (envelope: BusEnvelope) => void

const handlers = new Map<BusMessageType, Set<Handler>>()
let channel: BroadcastChannel | null = null
let busAvailable = true

function getChannel(): BroadcastChannel | null {
  if (!busAvailable) return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent<BusEnvelope>) => {
        const env = event.data
        if (!env || typeof env !== 'object' || env.source === tabId) return
        const set = handlers.get(env.type)
        if (set) {
          for (const h of [...set]) {
            try {
              h(env)
            } catch {
              // A failing subscriber must never break the bus.
            }
          }
        }
      }
    } catch {
      busAvailable = false
      return null
    }
  }
  return channel
}

/** Publish an event to every other tab on this origin. */
export function emit(type: BusMessageType, payload: unknown): void {
  const ch = getChannel()
  if (!ch) return
  const envelope: BusEnvelope = { type, payload, at: Date.now(), source: tabId }
  try {
    ch.postMessage(envelope)
  } catch {
    // Non-fatal: local state already updated.
  }
}

/** Subscribe to one message type. Returns an unsubscribe function. */
export function on<T = unknown>(type: BusMessageType, handler: (payload: T, envelope: BusEnvelope) => void): () => void {
  getChannel() // ensure the listener is attached
  const wrapped: Handler = (env) => handler(env.payload as T, env)
  let set = handlers.get(type)
  if (!set) {
    set = new Set()
    handlers.set(type, set)
  }
  set.add(wrapped)
  return () => {
    set!.delete(wrapped)
  }
}

/** React hook: subscribe to bus message types while mounted. */
export function useBusEffect(
  type: BusMessageType | BusMessageType[],
  handler: (payload: never, envelope: BusEnvelope) => void,
): void {
  useEffect(() => {
    const types = Array.isArray(type) ? type : [type]
    const unsubs = types.map((t) => on(t, handler))
    return () => {
      for (const u of unsubs) u()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(type)])
}

export type { IncidentStageId }
