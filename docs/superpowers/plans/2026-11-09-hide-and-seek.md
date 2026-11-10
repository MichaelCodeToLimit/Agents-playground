# Hide & Seek Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Peer-to-peer 3D multiplayer hide-and-seek (humans only) in the browser.
**Architecture:** Static ES-module site. Host browser runs cannon-es physics + rules and broadcasts ~20Hz snapshots over PeerJS; clients send inputs and render with Three.js.
**Tech Stack:** three, cannon-es, peerjs (vendored in `vendor/`), node:test.
**Spec:** docs/superpowers/specs/2026-11-09-hide-and-seek-design.md

## Global Constraints
- No build step; prep 15s, seek 90s, 4 rounds, sides swap each round.
- Only the locking team may unlock an object.

## Review Focus
- Seeker with wall between it and hider must not score; lone player / empty team can't start; late joiner mid-match is a spectator; disconnect of a client removes player and releases held objects.

---
### Task 1: rules.js (pure) — Test: tests/rules.test.js
Produces: `createMatch(players)`, `tick(match, dt, view)`, `canUnlock(obj, team)`, `canSee(seeker, hider, blocked)`, `swapSides`, phases `lobby|prep|seek|between|over`.
- [ ] Write tests (LOS blocked => no seeker score; unlock ownership; phase timings 15/90; swap; 4 rounds then over)
- [ ] Implement; run `node --test tests/`
### Task 2: sim.js (host physics) — arena, boxes/ramps/walls, player bodies, grab/lock, jump, snapshot()
### Task 3: render.js + input.js — Three.js scene from snapshots, pointer-lock FPS controls, HUD
### Task 4: net.js + lobby + main.js — PeerJS host/join by code, input/snapshot messaging, team UI
### Task 5: Verify — node tests; Playwright two-tab smoke test with a local fake-free run; README
