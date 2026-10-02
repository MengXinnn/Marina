# Shared scenario fixtures

Each `*.json` file here is a `Scenario` (see `src/contract/types.ts`):

```json
{
  "name": "pirates-plunder-jade",
  "description": "Jade punt ends round 3 on space 13; captain alone takes 36.",
  "config": { "players": [...], "seed": 7, "debug": { "dice": [{ "jade": 4, "silk": 2, "ginseng": 6 }] } },
  "actions": [ { "type": "bid", "playerId": "p1", "amount": 3 }, ... ],
  "expect": { "players.0.cash": 42, "phase": "auction" }
}
```

- **Engine agent** writes them and replays every file in `test/fixtures.test.ts`.
- **Web agent** can load any fixture in the dev menu (`?scenario=<name>`) to preview animations.
- Use `config.debug.dice` / `config.debug.deal` to make scenarios deterministic and readable.
- `expect` keys are dot-paths into the final `GameState`.
