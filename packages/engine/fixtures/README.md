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

## M1 scenarios

| File | Demonstrates |
| --- | --- |
| `complete-voyage.json` | Four-player schedule, cargo/dock payouts, insurance, automatic next voyage |
| `pirate-boarding-and-plunder.json` | Boarding, promotion, staying aboard, plunder and port destination |
| `pilots-push-past-13.json` | Both pilots push into port before the last roll; docked punts stay put |
| `insurance-bankruptcy.json` | Forced collateral, insurer payment and five-peso bank top-up |

Every scenario starts with `createGame(config)`; there are no injected intermediate
states. `replay(config, actions)` returns events grouped by action for animation.
`test/scenarios.ts` discovers every JSON file, replays it twice and checks dot-path
expectations; `test/fixtures.test.ts` additionally checks the promised event beats.

Each funding leg emits exactly one transfer event: `payout` when a player
receives the money, or `repair-paid` when the bank receives it. Apply the event's
full debit and credit once. Bankruptcy can split a payment into an insurer-funded
portion and a bank-funded remainder. An insurer paying itself emits one `payout`
with matching source/recipient and zero net cash change.
