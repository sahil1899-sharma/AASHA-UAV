# AASHA-UAV — Emergency Response Platform

AASHA-UAV is a three-tier personal emergency-response system:

1. **Wearable** — manual SOS trigger and automatic distress detection.
2. **Dispatch** — central coordination server with live geolocation.
3. **UAV** — autonomous deterrence drone that holds the scene with live
   video/photo evidence until responders arrive.

This repository is the web platform: three role-specific dashboards
(**User**, **Police / Security**, **Hospital Authority**) sharing one
design system.

## Running the project

Prerequisites: Node.js 20+ and npm.

```bash
cd aasha-uav
npm install
npm run dev      # local dev server (hot reload)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
npm run lint     # fast lint
```

Routes:

| Route             | What it is                             |
| ----------------- | -------------------------------------- |
| `/`               | Landing page                           |
| `/login/user`     | User access terminal                   |
| `/login/police`   | Police / Security access terminal      |
| `/login/hospital` | Hospital Authority access terminal     |
| `/user`           | User safety dashboard                  |
| `/police`         | Police / Security operations dashboard |
| `/hospital`       | Hospital Authority receiving dashboard |

Sign-in is a mock access terminal (name + role credential, no password)
standing in for the real auth module — the auth store
(`src/shared/state/authStore.ts`) is the seam where real authentication
swaps in.

## Browser support for Bluetooth features

The **Wearable link** panel on the User dashboard uses the Web Bluetooth
API to pair with a real BLE wearable (standard GATT services:
Battery `0x180F`, Heart Rate `0x180D`).

- **Supported:** Chrome and Edge, served over **HTTPS or localhost**.
  Pairing must be triggered by a user gesture (the "Pair wearable"
  button).
- **Not supported:** Firefox, Safari, and any insecure (`http://`)
  origin. The panel detects this and explains it, offering the
  alternative below instead of failing silently.

**Simulation mode:** the clearly-labeled "Simulate wearable" button
generates demo vitals so the full dashboard — SOS with vitals attached,
live timeline, hospital handoff — can be explored in any browser.

## Demoing the three portals together

The dashboards sync live with each other: an SOS raised on the User
dashboard appears instantly on the Police and Hospital dashboards, and
police actions (acknowledge, unit assignment, UAV on-scene, resolution)
advance the timeline on the user's phone in real time. This uses the
browser's `BroadcastChannel` transport, so it works across **tabs and
windows of the same browser on the same origin** — no backend needed.

Suggested demo script:

1. Start the dev server (`npm run dev`).
2. Open three tabs: `/login/user`, `/login/police`, `/login/hospital`.
   Sign in on each (any name; add a badge number / department where asked).
3. Arrange them side by side, or share one screen while the audience
   watches the other two.
4. On the **User** tab: press and hold the **SOS** button for 2 seconds.
   - **Police** tab: the incident lands live in the feed and on the
     operations map with a UAV auto-tasked. Acknowledge it, assign the
     nearest unit, watch the UAV fly the intercept.
   - **Hospital** tab: the same incident arrives as a live health alert
     with transmitted vitals; dispatch an ambulance and message the
     police coordination channel.
   - **User** tab: the SOS timeline advances at each step —
     "Dispatch acknowledged", "Responder en route" (with the unit's
     callsign), "UAV on scene".
5. On the **User** tab, tap "I'm safe — stand down" twice: the police
   incident resolves and the hospital alert clears everywhere.

Tips:

- Use **simulation mode** for the wearable if the demo browser lacks
  Web Bluetooth (see above).
- The landing-page background is a live incident-response scene — click
  anywhere on it to trigger a simulated response flyover.
- Keyboard users: the SOS trigger also works by holding **Space** or
  **Enter**; every feed row and control is reachable by Tab.

## Tech notes

- React 19 + Vite + TypeScript, Tailwind CSS v4, react-router,
  zustand, react-leaflet, framer-motion, lucide-react.
- The cross-tab event bus lives in
  `src/shared/realtime/realtimeBus.ts`. The shared incident model that
  all three portals read from is in `src/shared/state/incidentStore.ts`.
- Map tiles: Esri World Dark Gray basemap (online).

### Evidence integrity (tamper-evident chain) — demo scope

Each UAV evidence item is sealed with a real SHA-256 digest (browser
SubtleCrypto) over its file bytes plus custody metadata (capture time, UAV
ID, GPS), chained to the previous item's hash for the same incident. The
Police dashboard offers per-item "Verify Integrity" and per-incident
"Verify chain", plus a clearly-labelled demo affordance that corrupts a
mock item's bytes so tamper detection can be watched firing.

This is a **client-side integrity demonstration, not a production
cryptographic evidence system**. It shows what "tamper-evident" means —
altering any earlier item visibly invalidates every later link — but it is
not legally admissible chain of custody. A production system would need
server-side capture signing (the UAV or an ingestion service signing each
item with a private key at capture time), hashes anchored in append-only
server storage, authenticated access, and audit logging. Here everything
runs in the browser against mock media bytes, so treat a green "verified"
as "the bytes in this demo session still match what was sealed in this
demo session" — nothing more.
