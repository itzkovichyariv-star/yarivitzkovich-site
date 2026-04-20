export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const send = (msg) =>
    new Response(
      `<!doctype html><html><body><script>
      (() => {
        const msg = ${JSON.stringify(msg)};
        function receive(e) { window.opener.postMessage(msg, e.origin); }
        window.addEventListener('message', receive, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
      </script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );

  if (!code) return send('authorization:github:error:missing code');

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await res.json();
  if (data.error) return send(`authorization:github:error:${data.error_description}`);
  return send(
    `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`
  );
}
