# Rivergate — cờ tướng qua sông

GyosJS dogfood application, initially delivered on 0.5.1 and now using published 0.5.2. Repository: `hohphu8/rivergate`. No backend, accounts, telemetry or multiplayer service. Incremental Git commits; hosting is managed by the owner.

## Accepted scope

- Vietnamese UI; responsive 9×10 intersection board, red/black pieces, mouse/touch/keyboard, legal targets, check/last-move feedback, reduced motion.
- Pure immutable rules: seven piece types, palace/river, horse leg, elephant eye, cannon screen, facing generals, self-check, checkmate and stalemate loss.
- User approved casual repetition: same board and side-to-move three times is a draw. No tournament perpetual check/chase adjudication. Explicit in help and versioned recordings. No automatic no-progress draw; players can agree a draw. Recording limit 600 plies ends a casual draw rather than silently truncating saves.
- Two humans on one device, or human Red against basic Black bot. Iterative deepening alpha-beta in a real module Worker. Bounded thinking, progress, cancellation by termination, generation/position guards, worker errors and retry/local fallback.
- Undo (return to human turn versus bot), new game confirmation, switch mode without losing position, flip board, history navigation/replay, validated JSON export/import, local save/resume including mode. Viewing history never changes the live save.
- Tests for rules, reconstruction, stale results, cancellation, errors, user flows, blocked storage, production Worker and teardown. Record evidence, limits and any core findings.

## Boundaries

Bot is a casual opponent, no strength/rating claim. No opening book, clocks, puzzles, online opponents, full WXF repetition rulings or engine plugin API in v1. Rules reference: WXF, *2018 World Xiangqi Rules*, Articles 1–4, https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf. Casual repetition is our agreed deviation, not a claim of tournament compliance.

## Delivery order

1. Rules + reconstruction + fixture/property tests.
2. Search + Worker client lifetime/concurrency tests.
3. Reactive UI, save/replay and accessible interaction.
4. Browser/production verification, visual QA and dogfood report.
