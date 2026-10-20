// Retired with the house/album feature on 2026-10-21. No storage or database access.
Deno.serve(() => new Response(JSON.stringify({error:"feature_retired"}), {status:410,headers:{"content-type":"application/json","cache-control":"no-store"}}));
