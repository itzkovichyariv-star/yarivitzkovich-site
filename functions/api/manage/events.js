// Landing pages, as an API.
//
//   GET    /api/manage/events            — list, plus the field spec
//   GET    /api/manage/events?slug=x     — one event
//   POST   /api/manage/events            — create or update (slug decides which)
//   DELETE /api/manage/events?slug=x     — remove
//
// TWO WAYS IN, on purpose:
//
//   1. The owner in a browser — the cookie/IP gate every other /manage
//      endpoint uses. This is what the editing screen talks to.
//   2. Emma, over WhatsApp — a shared secret in `x-emma-secret`. She has no
//      browser and no cookie, so the cookie gate would lock her out entirely.
//      The secret is checked against EMMA_EVENTS_SECRET and the endpoint fails
//      closed when that is unset: absent configuration means the door does not
//      exist rather than standing open.
//
// WHY THE SCHEMA IS PART OF THE RESPONSE
// --------------------------------------
// Emma is asked things like "build me a landing page for the open day". She
// cannot invent a start time or a Zoom link, and she must not guess. So a
// create that is missing anything required comes back with `missing` naming
// the fields and `fields` describing every one of them in Hebrew — enough for
// her to ask a precise question rather than a vague one. The contract lives
// here, next to the validation that enforces it, so the two cannot drift.

import { isOwner } from '../../_lib/auth.js';
import { EVENT } from '../../../src/data/event.js';

/** The field spec — served to Emma, and the single source of what is required. */
const FIELDS = {
  slug:            { required: false, label: 'מזהה לכתובת', hint: 'אנגלית, מקפים בלבד. הכתובת תהיה /e/<המזהה>. אם לא נמסר — נוצר אוטומטית. למשל: open-day-2027' },
  title:           { required: true,  label: 'כותרת הדף',   hint: 'מה שמופיע בגדול. למשל: תואר שני בייעוץ ארגוני וקהילתי' },
  date_label:      { required: true,  label: 'תאריך',        hint: 'כפי שייכתב, בעברית. למשל: יום שלישי, 8 בספטמבר 2026' },
  time_label:      { required: true,  label: 'שעה',          hint: 'למשל: 20:00' },
  kicker:          { required: false, label: 'שורת פתיחה',   hint: 'מעל הכותרת. למשל: מפגש זום פתוח' },
  organisation:    { required: false, label: 'מוסד',         hint: 'למשל: אוניברסיטת אריאל' },
  department:      { required: false, label: 'מחלקה' },
  lede:            { required: false, label: 'משפט פתיחה',   hint: 'שורה אחת מתחת לכותרת' },
  body:            { required: false, label: 'גוף ההזמנה',   hint: 'הטקסט המלא. שורה ריקה מפרידה בין פסקאות' },
  hosts:           { required: false, label: 'מנחים',        hint: 'שם אחד בכל שורה' },
  footnote:        { required: false, label: 'הערה',         hint: 'למשל מתכונת הלימודים' },
  starts_at_utc:   { required: false, label: 'מועד התחלה (UTC)', hint: 'למשל 2026-09-08T17:00:00Z. דרוש רק כדי לאפשר הוספה ליומן' },
  ends_at_utc:     { required: false, label: 'מועד סיום (UTC)' },
  timezone_note:   { required: false, label: 'הערת אזור זמן', hint: 'ברירת מחדל: שעון ישראל' },
  location_label:  { required: false, label: 'מיקום',        hint: 'ברירת מחדל: בזום' },
  join_url:        { required: false, label: 'קישור הצטרפות', hint: 'קישור הזום. לא מופיע בדף — נשלח במייל האישור ונכנס לקובץ היומן' },
  closed_message:  { required: false, label: 'הודעה כשההרשמה סגורה' },
  question_label:  { required: false, label: 'תווית שדה השאלה' },
  question_placeholder: { required: false, label: 'דוגמה בשדה השאלה' },
  og_image_url:    { required: false, label: 'תמונה לתצוגה מקדימה', hint: 'כתובת תמונה שתופיע כשמדביקים את הקישור בוואטסאפ' },
  logo_url:        { required: false, label: 'לוגו' },
  theme_bg:        { required: false, label: 'צבע רקע',   hint: 'הקסדצימלי. ברירת מחדל #122033' },
  theme_accent:    { required: false, label: 'צבע הדגשה', hint: 'הקסדצימלי. ברירת מחדל #2FA0A8' },
  theme_text:      { required: false, label: 'צבע טקסט',  hint: 'הקסדצימלי. ברירת מחדל #C1C3C6' },
  status:          { required: false, label: 'מצב', hint: "draft (טיוטה), published (פורסם) או closed (ההרשמה נסגרה). ברירת מחדל draft" },
  registration_open: { required: false, label: 'ההרשמה פתוחה', hint: '1 או 0' },
  ask_phone:       { required: false, label: 'לשאול טלפון', hint: '1 או 0' },
  ask_question:    { required: false, label: 'לשאול שאלה',  hint: '1 או 0' },
};

/**
 * TEMPLATES — everything that repeats from one event to the next.
 *
 * Yariv, after seeing the 28-field form: "יש הרבה פרטים שחוזרים על עצמם". He is
 * right. The institution, the department, the two hosts, the logo, his Zoom
 * room and the campaign colours are the same for every session he will ever
 * run; only the date, the time and the reason for meeting change. A template
 * carries the constant part, so a new page needs three facts, not thirty.
 *
 * The September page is the first and, for now, only template. Its stable
 * facts are read from EVENT so they cannot drift from the frozen page; its
 * copy (lede, body, footnote) is restated here because it lives in the .astro
 * page, not in the data file. The copy is a STARTING POINT: Emma rewrites the
 * kicker, title, lede and body for whatever the new session is about, in the
 * same register, and shows the result before anything is saved.
 */
const TEMPLATES = {
  september: {
    label: 'מפגש המידע לתואר השני, ספטמבר 2026',
    note: 'מוסד, מחלקה, מנחים, לוגו, זום וצבעים מגיעים מכאן כמו שהם. הכותרת, שורת הפתיחה וגוף ההזמנה הם נקודת פתיחה — מנוסחים מחדש לפי המטרה של המפגש.',
    fields: () => ({
      kicker: EVENT.kicker,
      title: EVENT.programme,
      organisation: EVENT.university,
      department: EVENT.department,
      lede: 'זאת הזדמנות נוספת לקבל החלטה מושכלת, רגע לפני שמתחילה השנה החדשה.',
      body: [
        'שלום רב,',
        'שמחים להזמינך למפגש זום בנושא תכנית לתואר שני במחלקה לסוציולוגיה ולאנתרופולוגיה, עם התמחות בייעוץ ארגוני וקהילתי.',
        'במפגש נציג את התכנית מקרוב — מבנה הלימודים, ההתמחות בייעוץ ארגוני וקהילתי, ומה בוגרת או בוגר של התכנית יודעים לעשות בסופה; נדבר על היתרונות שבה — מה מייחד אותה ולמי היא מתאימה, כולל השילוב עם עבודה; ונקיים שיחה פתוחה. אפשר לשלוח שאלה מראש בטופס ההרשמה, ונתייחס אליה במפגש.',
      ].join('\n\n'),
      hosts: EVENT.hosts.join('\n'),
      footnote: `מתכונת הלימודים ${EVENT.academicYear}: ימי שלישי משעה 15:00 (לימודים פרונטליים) וימי שישי בזום.`,
      timezone_note: EVENT.timezoneNote,
      location_label: 'בזום',
      join_url: EVENT.zoomUrl,
      logo_url: '/images/ariel-logo-light.png',
      theme_bg: '#122033',
      theme_accent: '#2FA0A8',
      theme_text: '#C1C3C6',
      ask_phone: 1,
      ask_question: 1,
    }),
  },
};

function templateList() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, note: t.note }));
}

const WRITABLE = Object.keys(FIELDS);
const REQUIRED = WRITABLE.filter((k) => FIELDS[k].required);
const INTEGERS = ['registration_open', 'ask_phone', 'ask_question'];
const STATUSES = ['draft', 'published', 'closed'];

// Columns the schema declares NOT NULL with a default. The editing screen posts
// every field it knows about, blanks included, so a cleared box arrives as ''.
// Writing that through as NULL fails the constraint; dropping the column
// instead lets the default apply on insert and leaves the stored value alone on
// update, which is what "I left this alone" should mean either way.
const DEFAULTED = ['status', ...INTEGERS];

/** Emma's server-to-server door. Fails closed when the secret is not set. */
function isEmma(request, env) {
  const secret = env.EMMA_EVENTS_SECRET;
  if (!secret) return false;
  const presented = request.headers.get('x-emma-secret');
  return !!presented && presented === secret;
}

async function allowed(request, env) {
  return isEmma(request, env) || (await isOwner(request, env));
}

/**
 * The one failure that is certain to happen once, to him, on the first click.
 *
 * The code ships with the deploy; the table arrives only when the migration is
 * run by hand. So between merging this and running it, every endpoint here
 * fails on a missing table — and "D1_ERROR: no such table" tells him nothing
 * about what to do next. This turns that one error into the instruction.
 */
function migrationNeeded(err) {
  return /no such table/i.test(String(err?.message || err));
}

const MIGRATION_HELP = {
  ok: false,
  error: 'migration_needed',
  message: 'הטבלה של דפי הנחיתה עדיין לא קיימת. הרץ את המיגרציה פעם אחת ואז רענן.',
  command: 'npx wrangler d1 migrations apply yarivitzkovich-events --remote',
};

export const onRequestGet = async (context) => {
  try {
    return await onRequestGetInner(context);
  } catch (err) {
    if (migrationNeeded(err)) return json(MIGRATION_HELP, 503);
    throw err;
  }
};

const onRequestGetInner = async ({ request, env }) => {
  if (!(await allowed(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const url = new URL(request.url);
  const origin = url.origin;
  const slug = url.searchParams.get('slug');

  const templateId = url.searchParams.get('template');
  if (templateId) {
    const t = TEMPLATES[templateId];
    if (!t) return json({ ok: false, error: 'unknown_template', templates: templateList() }, 404);
    return json({ ok: true, id: templateId, label: t.label, note: t.note, template: t.fields(), fields: FIELDS });
  }

  if (slug) {
    const row = await env.DB.prepare(`SELECT * FROM landing_events WHERE slug = ?`).bind(slug).first();
    if (!row) return json({ ok: false, error: 'not_found', fields: FIELDS }, 404);
    return json({ ok: true, event: row, url: `${origin}/e/${row.slug}`, fields: FIELDS });
  }

  const rows = await env.DB
    .prepare(
      `SELECT e.slug, e.title, e.status, e.date_label, e.time_label, e.registration_open, e.updated_at,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_slug = e.slug) AS registrations
       FROM landing_events e ORDER BY e.updated_at DESC`
    )
    .all();

  return json({
    ok: true,
    events: (rows.results || []).map((r) => ({ ...r, url: `${origin}/e/${r.slug}` })),
    templates: templateList(),
    fields: FIELDS,
    required: REQUIRED,
  });
};

export const onRequestPost = async (context) => {
  try {
    return await onRequestPostInner(context);
  } catch (err) {
    if (migrationNeeded(err)) return json(MIGRATION_HELP, 503);
    throw err;
  }
};

const onRequestPostInner = async ({ request, env }) => {
  if (!(await allowed(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  // A supplied slug must be well-formed; an absent one is not an error. Emma is
  // asked for an event, not for a URL, and making her invent one would have her
  // asking Yariv a question he has no reason to have an answer to. So: if she
  // sends a slug we honour it, otherwise we mint one below.
  const rawSlug = String(body?.slug || '').trim().toLowerCase();
  if (rawSlug && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(rawSlug)) {
    return json({
      ok: false,
      error: 'invalid_slug',
      message: 'המזהה חייב להיות באנגלית קטנה, ספרות ומקפים בלבד.',
      fields: FIELDS,
    }, 400);
  }

  const existing = rawSlug
    ? await env.DB.prepare(`SELECT slug FROM landing_events WHERE slug = ?`).bind(rawSlug).first()
    : null;

  // On create, everything required must be present — and the whole list comes
  // back at once. Emma gets one round trip over WhatsApp, not one per field.
  // On update only the supplied fields are touched, so a partial edit cannot
  // blank the rest.
  if (!existing) {
    const missing = REQUIRED.filter((k) => k !== 'slug' && !String(body?.[k] ?? '').trim());
    if (missing.length) {
      return json({
        ok: false,
        error: 'missing_fields',
        missing,
        message: 'חסרים פרטים כדי לבנות את הדף: ' + missing.map((k) => FIELDS[k].label).join(', '),
        fields: FIELDS,
      }, 400);
    }
  }

  if (body?.status != null && String(body.status).trim() !== '' && !STATUSES.includes(String(body.status).trim())) {
    return json({
      ok: false,
      error: 'invalid_status',
      message: `מצב הדף חייב להיות אחד מאלה: ${STATUSES.join(', ')}.`,
      fields: FIELDS,
    }, 400);
  }

  const slug = rawSlug || (await mintSlug(env, body));

  const now = Math.floor(Date.now() / 1000);
  const supplied = WRITABLE.filter((k) => body[k] !== undefined);

  const values = {};
  for (const key of supplied) {
    let v = body[key];

    // Three different things a caller can mean, told apart on purpose:
    //   absent  — "I am not talking about this field"      → untouched
    //   ''      — the editing screen's blank box            → untouched (defaulted) / cleared (optional)
    //   null    — "there is deliberately nothing here"       → cleared
    // The third exists for the template: the September page carries the MA
    // timetable as a footnote, and a page for a different programme must be
    // able to drop it, not just overwrite it. A required or defaulted column
    // cannot be cleared, so null there means "leave it".
    if (v === null) {
      if (REQUIRED.includes(key) || DEFAULTED.includes(key)) continue;
      values[key] = null;
      continue;
    }

    if (INTEGERS.includes(key)) {
      if (String(v).trim() === '') continue;   // not answered — keep the default
      v = truthy(v);
    } else {
      v = String(v).trim();
      if (v === '' && DEFAULTED.includes(key)) continue;
      v = v === '' ? null : v;
    }
    values[key] = v;
  }
  values.slug = slug;

  if (existing) {
    const cols = Object.keys(values).filter((k) => k !== 'slug');
    if (cols.length) {
      await env.DB
        .prepare(`UPDATE landing_events SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE slug = ?`)
        .bind(...cols.map((c) => values[c]), now, slug)
        .run();
    }
  } else {
    const cols = Object.keys(values);
    await env.DB
      .prepare(
        `INSERT INTO landing_events (${cols.join(', ')}, created_at, updated_at)
         VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`
      )
      .bind(...cols.map((c) => values[c]), now, now)
      .run();
  }

  const saved = await env.DB.prepare(`SELECT * FROM landing_events WHERE slug = ?`).bind(slug).first();
  const origin = new URL(request.url).origin;
  // Say plainly what state the page is in. A draft renders exactly like a live
  // page apart from its banner, so "saved" on its own would let someone walk
  // away believing they had published something they had not — and Emma, who
  // only has this response to go on, would tell them the same.
  const notice = saved.status === 'draft'
    ? (existing ? 'נשמר — הדף עדיין טיוטה. כדי להפיץ אותו יש לשנות את המצב ל-published.'
                : 'נוצר כטיוטה. אפשר לפתוח ולבדוק; כדי להפיץ יש לשנות את המצב ל-published.')
    : saved.status === 'closed'
      ? 'נשמר. ההרשמה סגורה — הדף מוצג בלי הטופס.'
      : (existing ? 'נשמר. השינוי כבר בדף.' : 'נוצר. הדף חי עכשיו.');

  return json({
    ok: true,
    status: existing ? 'updated' : 'created',
    published: saved.status === 'published',
    notice,
    event: saved,
    url: `${origin}/e/${slug}`,
    share_text: shareText(saved, origin),
  });
};

export const onRequestDelete = async (context) => {
  try {
    return await onRequestDeleteInner(context);
  } catch (err) {
    if (migrationNeeded(err)) return json(MIGRATION_HELP, 503);
    throw err;
  }
};

const onRequestDeleteInner = async ({ request, env }) => {
  if (!(await allowed(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'no_db_binding' }, 500);

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return json({ ok: false, error: 'no_slug' }, 400);

  // Registrations outlive the page they came from: deleting the event must not
  // silently take the list of people with it.
  const count = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM event_registrations WHERE event_slug = ?`)
    .bind(slug)
    .first();
  if ((count?.n || 0) > 0) {
    return json({
      ok: false,
      error: 'has_registrations',
      registrations: count.n,
      message: count.n === 1
        ? 'לאירוע הזה נרשם אדם אחד. עדיף לסגור את ההרשמה במקום למחוק את הדף, כדי לא לאבד אותו.'
        : `לאירוע הזה נרשמו ${count.n} אנשים. עדיף לסגור את ההרשמה במקום למחוק את הדף, כדי לא לאבד אותם.`,
    }, 409);
  }

  await env.DB.prepare(`DELETE FROM landing_events WHERE slug = ?`).bind(slug).run();
  return json({ ok: true, status: 'deleted' });
};

/**
 * A yes/no from whoever is calling.
 *
 * Emma fills these from a conversation, so a flag can arrive as 1, "1", true,
 * "false", "no" or "לא". A bare `v ? 1 : 0` would read the string "0" as true
 * and open a registration the caller asked to close, so the false-ish spellings
 * are named explicitly and anything else falls back to JavaScript's own answer.
 */
function truthy(v) {
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (['0', 'false', 'no', 'off', '', 'לא', 'סגור', 'סגורה'].includes(t)) return 0;
    return 1;
  }
  return v ? 1 : 0;
}

/**
 * A URL for an event nobody named one for.
 *
 * Hebrew titles do not transliterate into a slug anyone would want to read, so
 * rather than mangling one we mint a short, unambiguous handle: the event month
 * (from its start instant when we have one, otherwise today) plus four random
 * characters. Readability is not what this URL is for — it gets pasted as a
 * link, never typed — but it does have to be unique, so we retry on collision
 * and fall back to the timestamp if the improbable happens.
 */
async function mintSlug(env, body) {
  const iso = String(body?.starts_at_utc || '').trim();
  const when = /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7).replace('-', '') : (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes
  for (let attempt = 0; attempt < 6; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const tail = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    const candidate = `e${when}-${tail}`;
    const clash = await env.DB.prepare(`SELECT 1 FROM landing_events WHERE slug = ?`).bind(candidate).first();
    if (!clash) return candidate;
  }
  return `e${when}-${Date.now().toString(36)}`;
}

/** Ready to paste into WhatsApp — the thing Emma is actually asked to produce. */
function shareText(event, origin) {
  return [
    event.kicker ? `*${event.kicker}*` : null,
    `*${event.title}*`,
    [event.organisation, event.department].filter(Boolean).join(' · ') || null,
    '',
    event.lede || null,
    '',
    `*${[event.date_label, event.time_label].filter(Boolean).join(', ')}*`,
    '',
    'לפרטים ולהרשמה:',
    `${origin}/e/${event.slug}`,
  ].filter((l) => l !== null).join('\n');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
