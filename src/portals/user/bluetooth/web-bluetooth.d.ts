/**
 * Minimal Web Bluetooth API declarations for the AASHA-UAV wearable pairing.
 *
 * Only the surface we actually use is declared here (device picker, GATT
 * connect, service/characteristic reads and notifications). Kept local
 * rather than pulling @types/web-bluetooth so the build has no extra
 * dependency for a single integration.
 */

type BluetoothServiceUUID = number | string
type BluetoothCharacteristicUUID = number | string

interface BluetoothLEScanFilter {
  services?: BluetoothServiceUUID[]
  name?: string
  namePrefix?: string
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[]
  optionalServices?: BluetoothServiceUUID[]
  acceptAllDevices?: boolean
}

interface BluetoothDevice extends EventTarget {
  readonly id: string
  readonly name?: string
  readonly gatt?: BluetoothRemoteGATTServer
}

interface BluetoothRemoteGATTServer extends EventTarget {
  readonly device: BluetoothDevice
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>
}

interface BluetoothRemoteGATTService extends EventTarget {
  readonly uuid: string
  getCharacteristic(
    characteristic: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string
  readonly value?: DataView
  readValue(): Promise<DataView>
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
}

interface Bluetooth extends EventTarget {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>
  getAvailability?(): Promise<boolean>
}

interface Navigator {
  readonly bluetooth?: Bluetooth
}
