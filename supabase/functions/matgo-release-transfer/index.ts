// The verified artwork transfer is complete. No credentials or storage access remain.
Deno.serve(() => new Response('Transfer complete', {status:410}));
