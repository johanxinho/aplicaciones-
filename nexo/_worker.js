import { onRequest, onRequestPost } from './functions/api/ai.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/ai') {
      if (request.method !== 'POST') return onRequest();
      return onRequestPost({ request, env });
    }

    if (pathname === '/functions' || pathname.startsWith('/functions/')) {
      return new Response('Not found', { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
