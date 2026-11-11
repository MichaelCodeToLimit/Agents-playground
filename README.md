# Hide & Seek Arena

Human-only, peer-to-peer 3D multiplayer version of OpenAI's "Multi-Agent Hide and Seek".
Hiders get a head start to build a fort from boxes, walls and ramps (and lock them in place);
seekers then try to find them, using ramps and box-surfing to get over walls.

## Play
```bash
npm install
npm start          # serves http://localhost:8080
```
Host clicks **Host a game** and shares the 4-letter code; friends click **Join**.
Any static host (GitHub Pages, Netlify...) works too: serve the `public/` folder. Gameplay is direct
browser-to-browser (WebRTC); the free public PeerJS broker is used only for the initial handshake.
Strict NATs/corporate networks may fail to connect (no TURN relay).

Controls: WASD move · mouse look · Space jump · E / left-click grab & release · F / right-click lock & unlock.

## Single player
On the menu, click **Solo: I'll hide** or **Solo: I'll seek** to play alone against a built-in bot in the small arena (one object).
No network, server or API key is used. The bot follows the same rules as you (same speed cap, view cone and line of sight; it is a little slower):
as hider it locks the object and keeps it between itself and the seeker; as seeker it circles the object, chases anything it sees and checks the last place it saw you.
Sides swap each round over 4 rounds; **Play again** restarts. **Exit** returns to the menu.

## Locks, grabbing and effects
- **E / left-click** grabs what you are aiming at: a glowing beam links your hands to it, your arms come up, and it slows you down in proportion to its weight.
  **F / right-click** locks it where it is (a padlock appears in your team's colour); only the team that locked it can unlock it.
  Aim at an object and a hint tells you what you can do with it.
- Objects: boxes, long planks, walls and ramps. They fall asleep when still so stacks stay put.
- Characters lean into runs, tuck on jumps, squash on landing and carry things with both arms. Landings shake the camera, running widens the view, and dust puffs fly when things land.
- Sound is synthesized in the browser (footsteps, jumps, landings, thuds, lock/unlock clicks, grab, a "you've been seen" alert, round chimes, a light breeze), panned and attenuated by distance. **M** mutes.

## Arena modes
The host picks the arena in the lobby: **Full arena** (divider wall with a doorway, many boxes, walls and ramps) or
**Small arena** (a tiny room with exactly one movable object, a different one each round: box, ramp, wall, box), or
**Random arena** (like the video's later stages: 12-21 m wide, a divider with a doorway, extra rooms and loose walls, and a random pile of boxes, planks, walls and ramps, new every round; the two sides are always connected).
For uneven teams, the host can add free built-in bots to either team in the lobby.

## AI players (bring your own Anthropic API key)
Host-only, optional. In the lobby open "Add an AI player", paste your key, pick a model and team, click **Add AI player**.
- The key stays in the host's browser (optionally remembered in localStorage) and is used only to call
  `api.anthropic.com` directly. It is never sent to other players. Billed to your account, roughly one request per second per AI while a round is live.
- The AI only gets what a player on its team could see (line-of-sight rules); its short "thought" for each plan shows in a host-only panel.
- Models: Haiku 5.5 (default, cheap/fast), Sonnet 5.5, Opus 5.5. Requests use low effort so the bots stay responsive.
- The bot stops itself after an invalid key or repeated API errors, and says so in the panel.

## Rules
Teams Orange vs Blue, 4 rounds, sides swap each round. 15s prep (seekers frozen & blind), then 90s seek.
While any hider is visible to a seeker (view cone + line of sight) seekers score; otherwise hiders score.
Only the team that locked an object can unlock it. Host's browser runs the simulation: if the host leaves, the match ends.
Keep the host tab in the foreground.

## Dev
`npm test` (rules, physics, built-in bot, AI module with a faked API; Node). The AI path is tested against a mocked API, not a live key. End-to-end: `npm run signal` then
`NODE_PATH=$(npm root -g) node tests/e2e/two-players.mjs` or `.../ai-small.mjs`, `.../features.mjs` (random arena, bots, locks, effects); `npm start` then `.../solo.mjs` for single player (needs Playwright).
