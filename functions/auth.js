export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('scope', 'repo,user');
  githubUrl.searchParams.set('redirect_uri', `${url.origin}/callback`);
  return Response.redirect(githubUrl.toString(), 302);
}
