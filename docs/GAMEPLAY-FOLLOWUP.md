# Play feedback — 2026-11-16

The owner reported hard-to-see last moves, sides distinguished mainly by hue, a surprising draw while evading repeated checks, and a bot that sometimes captures a defended horse with its cannon in the opening.

## Delivered changes

- Replace the tiny last-move tick with a dashed origin ring, boxed destination, moved-piece outline and text description. Labels include origin/destination for assistive technology. Markers follow the displayed timeline, board orientation and undo; they clear at the opening position.
- Light Red faces and dark Black faces, with matching player tokens, provide a luminance cue even without distinguishing the colors. Legal destinations, selection, check and keyboard focus remain separate signals. This is not a claim of a complete accessibility audit.
- Keep the owner's reconfirmed casual repetition rules. Warn at the second occurrence of the same board and side to move, and explicitly explain that the third is a draw even during checks. No perpetual-check/chase adjudication, recording-format change or migration.
- Extend leaf search through captures and legal check escapes, capped at four additional plies and the existing computation deadline. Static evaluation in the middle of an exchange could previously count a captured horse without the opponent's rook recapturing the cannon.
- Prefer less visited positions only when their evaluated scores tie. Resolve alpha-beta bounds before treating them as equal; keep draws available when otherwise losing. Search respects mate/stalemate priority over repetition and the 600-ply cap.
- Footer version comes from the installed package rather than a stale literal. Runtime remains GyosJS 0.5.6.

## Validation

20 engine/game/Worker/search tests pass. New deterministic depth-one tests cover the opening exchange, repetition tie-break and a deadline that expires before completing an iteration. No Elo or broad playing-strength improvement is claimed.

Production browser suite: 48 passed across Chromium, Firefox and WebKit; 6 existing development-only skips. Includes real Worker operation, CSP, stale replies, storage/replay, drag/touch and the new origin/destination/history/undo and repetition-warning journeys. Desktop and mobile screenshots inspected. After the final package-version display change and rebuild, the focused Chromium board suite passed 5 cases with 1 development-only skip.

## Proposed next milestone: private online rooms

Update: this milestone is now implemented. See [setup and deployment](ONLINE.md), [API contract](ONLINE-API.md) and [verification](ONLINE-VALIDATION.md). The proposal below is retained as the original scope.

This is a proposal, not an implemented multiplayer service. Start with two players sharing a room link; defer matchmaking, accounts, ranking and spectators.

Use one server-authoritative rules/state path. A small JavaScript server can reuse the existing pure rules engine; client moves are requests, never authoritative board updates. Each accepted move has a room revision and request ID. Duplicate requests, wrong turns and stale revisions must be rejected or acknowledged idempotently. Reconnect obtains a canonical snapshot plus validated move history.

Before implementation, settle hosting, room/seat credentials, durable storage and room expiry. Test two independent browsers, disconnect during a move, reload/rejoin, duplicate/out-of-order messages, simultaneous actions, reset/draw negotiation, expired rooms and server restart. Start without clocks until reconnect/abandonment policy is explicit. Keep the current casual repetition policy visible to both players.

GyosJS questions should come from those flows: subscription cleanup, stale async results, batched snapshot application and consistent UI after reconnect. Do not add a framework networking API until a reproducible gap appears. Current findings are application UX/search work, not core defects.
