# Multiplayer Hide & Seek (human version of OpenAI's Multi-Agent Hide and Seek)

## Goal
Browser 3D first-person hide-and-seek where hiders build shelters from boxes/ramps/walls and seekers use ramps and box-surfing to reach them. Humans only, peer-to-peer.

## Stack
Static site, no build step. ES modules, Three.js (rendering), cannon-es (physics), PeerJS (WebRTC with public broker for handshake only). Pure rules logic in `rules.js` is testable in Node.

## Networking
Host browser is authoritative: runs physics + rules and is also a player. Clients send inputs (move axes, yaw/pitch, jump, grab, lock). Host broadcasts ~20 Hz snapshots (players, objects, phase, scores, timer). Clients interpolate. Room code = PeerJS id. Host disconnect ends match.

## Rules
- Lobby: host sees players, toggles teams, starts match.
- Prep (15s): seekers frozen/blinded; hiders build.
- Seek (90s): hiders score per tick when no seeker sees them (view cone + line-of-sight raycast), seekers score when seen.
- Sides swap each round; running scoreboard; 4 rounds default.
- Tools: grab/carry, lock/unlock (only locking team can unlock), jump.
- Arena: walls + random boxes/ramps seeded by shared seed.

## Components
net.js, sim.js (host physics), rules.js (pure), render.js, input.js, lobby/ui, main.js.

## Testing
Node unit tests for rules.js (LOS scoring, lock ownership, phases); Playwright two-tab smoke test.

## Out of scope
Voice, mobile, anti-cheat.
