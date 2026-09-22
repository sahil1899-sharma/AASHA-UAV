/**
 * Bluetooth GATT identifiers for the AASHA-UAV wearable link.
 *
 * We pair against the standard services that most wearables / fitness bands
 * already expose, so real hardware works during testing without custom
 * firmware:
 *   - Battery Service (0x180F) → Battery Level (0x2A19)
 *   - Heart Rate Service (0x180D) → Heart Rate Measurement (0x2A37)
 *
 * AASHA_CUSTOM_SERVICE_UUID is reserved for future AASHA-UAV-specific
 * wearable firmware. It is a placeholder 128-bit UUID — replace it with the
 * real firmware UUID when the hardware exists.
 */

export const BATTERY_SERVICE_UUID = 0x180f
export const BATTERY_LEVEL_CHAR_UUID = 0x2a19

export const HEART_RATE_SERVICE_UUID = 0x180d
export const HEART_RATE_MEASUREMENT_CHAR_UUID = 0x2a37

export const AASHA_CUSTOM_SERVICE_UUID = '7e4f1a2b-3c5d-4e6f-8a9b-0c1d2e3f4a5b'

/** Services we filter for in the device picker. */
export const PAIRING_FILTER_SERVICES = [HEART_RATE_SERVICE_UUID, BATTERY_SERVICE_UUID]

/** Everything we want access to once paired. */
export const OPTIONAL_SERVICES = [
  BATTERY_SERVICE_UUID,
  HEART_RATE_SERVICE_UUID,
  AASHA_CUSTOM_SERVICE_UUID,
]
