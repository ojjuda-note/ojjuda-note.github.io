// Retired endpoint: old clients receive a terminal response without reading
// secrets, contacting an AI provider, or accessing the database/repair worker.
const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);

export function createHandler() {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = {
      'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Cache-Control': 'no-store', Vary: 'Origin'
    };
    if (origin && !ORIGINS.has(origin)) {
      return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    return Response.json({ error: 'ai_meeting_retired', message: 'AI 전략회의실은 종료되었습니다.' }, {
      status: 410, headers
    });
  };
}
