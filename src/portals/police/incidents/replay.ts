import type { IncidentStatus, PoliceIncident } from './policeIncidentStore'

/**
 * Phase 12 — incident replay.
 *
 * Adapts the timestamped data the incident already captures (startedAt,
 * acknowledgedAt / assignedAt / uavOnSceneAt / resolvedAt, the comms log,
 * evidence captures) into a scrubbable lifecycle. No new data model: every
 * event here is derived from fields the incident lifecycle already records.
 */

export type ReplayEventKind = 'trigger' | 'ack' | 'unit' | 'uav' | 'evidence' | 'resolved'

export interface ReplayEvent {
  t: number
  kind: ReplayEventKind
  label: string
  detail?: string
}

/** Lifecycle events for an incident, oldest first. */
export function buildReplayEvents(inc: PoliceIncident): ReplayEvent[] {
  const events: ReplayEvent[] = [
    {
      t: inc.startedAt,
      kind: 'trigger',
      label: 'SOS triggered',
      detail: `${inc.area} · ${inc.triggerSource === 'auto' ? 'auto-detected' : 'manual SOS'}`,
    },
  ]
  if (inc.acknowledgedAt) {
    events.push({
      t: inc.acknowledgedAt,
      kind: 'ack',
      label: 'Dispatch acknowledged',
      detail: 'Police dispatch accepted the alert',
    })
  }
  if (inc.assignedAt && inc.assignedUnit) {
    events.push({
      t: inc.assignedAt,
      kind: 'unit',
      label: `Unit ${inc.assignedUnit} responding`,
      detail: inc.officerStatus ? `Officer status: ${inc.officerStatus}` : undefined,
    })
  }
  if (inc.uavOnSceneAt) {
    events.push({
      t: inc.uavOnSceneAt,
      kind: 'uav',
      label: `${inc.uav.id} on scene`,
      detail: 'Deterrence airframe overhead',
    })
  }
  for (const e of inc.evidence) {
    events.push({
      t: e.capturedAt,
      kind: 'evidence',
      label: e.label,
      detail: `${e.id} · ${e.kind}`,
    })
  }
  if (inc.resolvedAt) {
    events.push({
      t: inc.resolvedAt,
      kind: 'resolved',
      label: inc.status === 'false-alarm' ? 'Closed as false alarm' : 'Incident resolved',
      detail: inc.resolutionNote ?? undefined,
    })
  }
  return events.sort((a, b) => a.t - b.t)
}

/** Incident status as it was at time `at`, derived from the lifecycle timestamps. */
export function statusAt(inc: PoliceIncident, at: number): IncidentStatus {
  if (inc.resolvedAt && at >= inc.resolvedAt) return inc.status
  if (inc.assignedAt && at >= inc.assignedAt) return 'responding'
  if (inc.acknowledgedAt && at >= inc.acknowledgedAt) return 'acknowledged'
  return 'new'
}

export function formatReplayClock(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function formatReplayFull(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${formatReplayClock(ts)}`
}
