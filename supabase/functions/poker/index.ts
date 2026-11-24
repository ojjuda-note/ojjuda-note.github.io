// Older clients can still request this endpoint after the games close.
Deno.serve(() => Response.json({ ok: false, error: 'game_retired' }, { status: 410 }));
