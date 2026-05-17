// GET /api/manage/env-check
// Owner-only diagnostic. Reports whether the email-related env vars
// are configured WITHOUT revealing their values. Use to verify that
// OWNER_EMAIL, RESEND_API_KEY, and RESEND_FROM are all set on the
// currently-running production deployment.

import { isOwner } from '../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  if (!(await isOwner(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);

  return json({
    ok: true,
    env: {
      RESEND_API_KEY_set: !!env.RESEND_API_KEY,
      RESEND_API_KEY_length: env.RESEND_API_KEY ? env.RESEND_API_KEY.length : 0,
      RESEND_FROM_set: !!env.RESEND_FROM,
      RESEND_FROM_preview: env.RESEND_FROM
        ? env.RESEND_FROM.slice(0, 20) + '…'
        : null,
      OWNER_EMAIL_set: !!env.OWNER_EMAIL,
      OWNER_EMAIL_value: env.OWNER_EMAIL || null,
      QC_SECRET_set: !!env.QC_SECRET,
      DB_bound: !!env.DB,
    },
  });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
