# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- IT administrators and operations staff managing a trusted LAN fleet of up to about 20 hosts.
- `Viewer` reviews assigned hosts, `Admin` manages assigned hosts, and `Super Admin` manages fleet-wide access, approvals, and settings.

## Product Purpose

Windows Controller Fleet provides one control surface for observing and operating endpoint health in a trusted LAN. Success means operators can quickly see fleet state, investigate a host, and safely respond to defined process or watchdog incidents without leaving the web UI.

## Positioning

A Central Server connects authenticated endpoint agents with a role-scoped web UI for realtime telemetry, process operations, watchdog recovery, and desktop capture. It deliberately supports only defined commands rather than a remote shell.

## Operating Context

- Central Server serves a REST API and WebSocket connections inside a trusted LAN.
- Agents run on Windows, Linux, Synology, and Home Assistant where supported; Windows Desktop Helper handles interactive desktop actions.
- Operators work from fleet, dashboard, processes, watchdog, activity, and administration views.
- Telemetry, commands, audits, screenshots, and backups persist locally.

## Capabilities and Constraints

- Monitor host status, CPU, memory, uptime, network, disk, hardware sensors, and power data where available.
- Manage approved agents, process lists, watchdog rules, screenshots, user access, settings, and Discord notifications.
- Preserve role-scoped host access, authentication, audit trails, endpoint enrollment, and defined-command allowlists.
- Do not expose Central Server directly to the public Internet or introduce arbitrary command execution.
- The product may gain justified capabilities when they improve trusted-LAN fleet operations without weakening existing security, accessibility, or current workflows.

## Brand Commitments

- Product name: Windows Controller Fleet.
- Support Vietnamese and English.
- Preserve explicit Light/Dark selection and an operational, trustworthy tone.

## Evidence on Hand

- `README.md` documents architecture, deployment, security boundaries, and supported workflows.
- `public/index.html`, `public/css/style.css`, and `public/js/app.js` provide incumbent web UI and product copy.
- No external customer claims, benchmarks, testimonials, or visual assets are confirmed; future work must not fabricate them.

## Product Principles

- Make fleet state and safe next actions legible at a glance.
- Protect host access and command execution by default.
- Prefer realtime operational evidence over assumed state.
- Keep critical workflows usable across desktop, tablet, and mobile widths.
- Add only capabilities that serve trustworthy LAN fleet operations.

## Accessibility & Inclusion

- Keep explicit Light/Dark switching, keyboard access, focus states, reduced-motion support, responsive layout, and clear status hierarchy.
- Preserve Vietnamese and English UI support.
