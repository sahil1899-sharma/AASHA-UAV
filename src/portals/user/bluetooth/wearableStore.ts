import { create } from 'zustand'
import { useNotificationsStore } from '../../../shared/state/notificationsStore'
import {
  AASHA_CUSTOM_SERVICE_UUID,
  BATTERY_LEVEL_CHAR_UUID,
  BATTERY_SERVICE_UUID,
  HEART_RATE_MEASUREMENT_CHAR_UUID,
  HEART_RATE_SERVICE_UUID,
  OPTIONAL_SERVICES,
  PAIRING_FILTER_SERVICES,
} from './constants'

/**
 * Wearable link state. Handles the real Web Bluetooth pairing flow
 * (Battery Service 0x180F + Heart Rate Service 0x180D, both standard on most
 * fitness bands) and a clearly-labeled simulation mode for demos.
 *
 * Bluetooth objects live in module scope — they are not serializable and
 * must never enter React state.
 */

export type WearableStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

interface WearableState {
  status: WearableStatus
  deviceName: string | null
  battery: number | null
  heartRate: number | null
  lastReadingAt: number | null
  /** True when readings come from the simulator — never real hardware. */
  isSimulated: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
  reconnect: () => Promise<void>
  startSimulation: () => void
  stopSimulation: () => void
  dismissError: () => void
}

let device: BluetoothDevice | null = null
let manualDisconnect = false
let simTimer: number | null = null
let simBattery = 87

/** Standard Heart Rate Measurement (0x2A37) parsing. */
function parseHeartRate(dv: DataView): number {
  const flags = dv.getUint8(0)
  const is16Bit = (flags & 0x01) !== 0
  return is16Bit ? dv.getUint16(1, true) : dv.getUint8(1)
}

function readValueOf(e: Event): DataView | null {
  const t = e.target as BluetoothRemoteGATTCharacteristic | null
  return t?.value ?? null
}

async function subscribeGatt(): Promise<void> {
  if (!device?.gatt) throw new Error('No wearable selected.')
  const server = await device.gatt.connect()

  // Battery — optional; many bands expose it without advertising it.
  try {
    const svc = await server.getPrimaryService(BATTERY_SERVICE_UUID)
    const char = await svc.getCharacteristic(BATTERY_LEVEL_CHAR_UUID)
    const initial = await char.readValue()
    useWearableStore.setState({
      battery: initial.getUint8(0),
      lastReadingAt: Date.now(),
    })
    await char.startNotifications()
    char.addEventListener('characteristicvaluechanged', (e) => {
      const dv = readValueOf(e)
      if (dv) {
        useWearableStore.setState({ battery: dv.getUint8(0), lastReadingAt: Date.now() })
      }
    })
  } catch {
    // Battery service not exposed by this device — heart rate is enough.
  }

  // Heart rate — the core wearable signal.
  try {
    const svc = await server.getPrimaryService(HEART_RATE_SERVICE_UUID)
    const char = await svc.getCharacteristic(HEART_RATE_MEASUREMENT_CHAR_UUID)
    await char.startNotifications()
    char.addEventListener('characteristicvaluechanged', (e) => {
      const dv = readValueOf(e)
      if (dv) {
        useWearableStore.setState({
          heartRate: parseHeartRate(dv),
          lastReadingAt: Date.now(),
        })
      }
    })
  } catch {
    // Heart rate service missing — stay connected on whatever we have.
  }
}

function handleUnexpectedDisconnect() {
  if (manualDisconnect) return
  useWearableStore.setState({
    status: 'disconnected',
    heartRate: null,
    battery: null,
    error: 'Connection lost — the wearable went out of range or was turned off.',
  })
  useNotificationsStore.getState().push({
    title: 'Wearable disconnected',
    body: 'The Bluetooth link dropped. Reconnect when the device is nearby.',
    kind: 'wearable',
  })
}

function stopSimulationTimer() {
  if (simTimer !== null) {
    window.clearInterval(simTimer)
    simTimer = null
  }
}

export const useWearableStore = create<WearableState>((set, get) => ({
  status: 'disconnected',
  deviceName: null,
  battery: null,
  heartRate: null,
  lastReadingAt: null,
  isSimulated: false,
  error: null,

  connect: async () => {
    if (get().isSimulated) get().stopSimulation()
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      set({ status: 'unsupported' })
      return
    }
    set({ status: 'connecting', error: null })
    try {
      const picked = await navigator.bluetooth.requestDevice({
        filters: PAIRING_FILTER_SERVICES.map((services) => ({ services: [services] })),
        optionalServices: [...OPTIONAL_SERVICES, AASHA_CUSTOM_SERVICE_UUID],
      })
      device = picked
      manualDisconnect = false
      picked.addEventListener('gattserverdisconnected', handleUnexpectedDisconnect)
      await subscribeGatt()
      set({
        status: 'connected',
        deviceName: picked.name ?? 'Unknown device',
        error: null,
      })
      useNotificationsStore.getState().push({
        title: 'Wearable connected',
        body: `${picked.name ?? 'Device'} paired — live vitals streaming.`,
        kind: 'wearable',
      })
    } catch (err) {
      const cancelled = err instanceof Error && err.name === 'NotFoundError'
      set({ status: 'disconnected', error: cancelled ? null : 'Pairing failed. Make sure the wearable is nearby and advertising.' })
    }
  },

  disconnect: () => {
    get().stopSimulation()
    manualDisconnect = true
    try {
      device?.gatt?.disconnect()
    } catch {
      // Already gone — nothing to do.
    }
    set({ status: 'disconnected', heartRate: null, battery: null, error: null })
  },

  reconnect: async () => {
    if (!device?.gatt) {
      await get().connect()
      return
    }
    set({ status: 'connecting', error: null })
    try {
      manualDisconnect = false
      await subscribeGatt()
      set({ status: 'connected', error: null })
    } catch {
      set({
        status: 'disconnected',
        error: 'Reconnect failed — the wearable may be out of range.',
      })
    }
  },

  startSimulation: () => {
    stopSimulationTimer()
    manualDisconnect = true
    try {
      device?.gatt?.disconnect()
    } catch {
      // Ignore — simulation takes over.
    }
    device = null
    simBattery = 87
    let hr = 72
    set({
      status: 'connected',
      isSimulated: true,
      deviceName: 'AASHA Demo Band',
      battery: simBattery,
      heartRate: hr,
      lastReadingAt: Date.now(),
      error: null,
    })
    simTimer = window.setInterval(() => {
      hr = Math.round(hr + (Math.random() * 6 - 3))
      hr = Math.min(104, Math.max(62, hr))
      if (Math.random() < 0.06) hr = Math.min(118, hr + 12)
      if (Math.random() < 0.1) simBattery = Math.max(5, simBattery - 1)
      useWearableStore.setState({
        heartRate: hr,
        battery: simBattery,
        lastReadingAt: Date.now(),
      })
    }, 1500)
  },

  stopSimulation: () => {
    stopSimulationTimer()
    set({
      status: 'disconnected',
      isSimulated: false,
      deviceName: null,
      heartRate: null,
      battery: null,
    })
  },

  dismissError: () => set({ error: null }),
}))
