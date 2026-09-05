// Renders a landing page from an `events` row.
//
// Plain string templating rather than a framework: this runs inside a Pages
// Function on every request, and the whole point of keeping events in D1 is
// that an edit is live immediately — which rules out anything that needs a
// build step. It is the same visual language as /he/ma-info, but every value
// comes from the row instead of a config file.
//
// EVERY event page carries noindex, published or not. This is a personal
// academic site, and a departmental open-day invitation should not surface in
// search results beside the publication list. The page is not linked from
// anywhere on the site, carries none of its navigation, and is not an Astro
// page so it never reaches the sitemap either — noindex closes the last door,
// the one a shared link would otherwise open. Deliberately noindex rather than
// a robots.txt Disallow: a disallowed crawler never fetches the page, so it
// never reads the directive and the URL can still be indexed from an inbound
// link. Allowing the crawl and refusing the index is what actually keeps it out.
//
// Colours arrive from the database, so they are validated as hex before they
// reach the stylesheet: a stored value like `red; } body { display:none` would
// otherwise be CSS injection with an owner-only write as its only gate — thin
// protection for something this cheap to close.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A stored colour is used only if it really is a hex colour. */
function hex(value, fallback) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;
}

/** Blank-line-separated text becomes paragraphs; single newlines become breaks. */
function paragraphs(text, className) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p class="${className}">${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function lines(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
}

/** "20260908T170000Z" — what both ICS and Google Calendar want. */
export function calendarStamp(iso) {
  return String(iso || '').replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(event, origin) {
  if (!event.starts_at_utc) return '';
  const details = [
    [event.department, event.organisation].filter(Boolean).join(', '),
    '',
    `פרטים: ${origin}/e/${event.slug}`,
  ].join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: calendarStamp(event.starts_at_utc) + '/' + calendarStamp(event.ends_at_utc || event.starts_at_utc),
    details,
    location: event.location_label || '',
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

export function renderEventPage(event, { origin, buildStamp = '' } = {}) {
  const bg = hex(event.theme_bg, '#122033');
  const accent = hex(event.theme_accent, '#2FA0A8');
  const text = hex(event.theme_text, '#C1C3C6');

  const hostList = lines(event.hosts);
  const pageUrl = `${origin}/e/${event.slug}`;
  const ogImage = event.og_image_url || '';
  const closed = !event.registration_open || event.status === 'closed';

  const facts = [
    event.date_label && { label: 'מועד', value: event.date_label },
    event.time_label && { label: 'שעה', value: event.time_label, sub: event.timezone_note },
    event.location_label && { label: 'איפה', value: event.location_label, sub: 'הקישור נשלח במייל' },
  ].filter(Boolean);

  // The letterhead: who is inviting, stated before what the invitation is for.
  // An academic invitation is read partly as a credential — the institution is
  // the reason a stranger opens it — so the logo and the department go above
  // the headline rather than being left to the footer. Both are optional; with
  // neither, the hero simply starts at the kicker.
  const institution = [event.organisation, event.department].filter(Boolean).join(' · ');
  const letterhead = event.logo_url || institution
    ? `<div class="head">` +
      (event.logo_url ? `<img src="${esc(event.logo_url)}" alt="${esc(event.organisation || '')}">` : '') +
      (institution ? `<div class="org">${esc(institution)}</div>` : '') +
      `</div>`
    : '';

  const description = [event.date_label, event.time_label && `בשעה ${event.time_label}`, event.lede]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(event.title)}${event.organisation ? ' — ' + esc(event.organisation) : ''}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="${esc(event.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:locale" content="he_IL">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
<meta name="robots" content="noindex, nofollow">
<style>
  :root { --bg:${bg}; --accent:${accent}; --text:${text}; --line:rgba(193,195,198,0.16); --muted:#9CA0A5; --light:#F1F2F3; --ink:#132238; }
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Rubik','Heebo',-apple-system,'Segoe UI',system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  .narrow{max-width:720px;margin:0 auto;padding:0 24px}
  .hero{padding:72px 0 64px;position:relative;overflow:hidden}
  .draft{background:#8A6D1F;color:#fff;font-size:13px;font-weight:600;text-align:center;padding:10px 16px}
  .head{display:flex;align-items:center;gap:14px;margin-bottom:26px}
  .head img{height:46px;width:auto;display:block}
  .head .org{font-size:14px;line-height:1.45;color:var(--muted)}
  .kicker{font-size:13px;font-weight:600;letter-spacing:.08em;color:var(--accent);margin-bottom:22px}
  h1{font-size:clamp(2rem,7vw,4.2rem);font-weight:800;line-height:1.08;letter-spacing:-.015em;margin-bottom:22px}
  .lede{font-size:clamp(1.05rem,2.4vw,1.35rem);font-weight:300;max-width:36ch;margin-bottom:38px}
  .facts{display:grid;grid-template-columns:repeat(${facts.length || 1},1fr);border:1px solid var(--line);border-radius:14px;background:rgba(193,195,198,.05);max-width:720px;overflow:hidden}
  .fact{padding:22px 20px}
  .fact+.fact{border-inline-start:1px solid var(--line)}
  .fact .l{font-size:11px;letter-spacing:.12em;color:var(--muted);margin-bottom:10px}
  .fact .v{font-size:clamp(1.2rem,3.4vw,1.8rem);font-weight:700;line-height:1.2;color:#fff}
  .fact .s{font-size:13px;color:var(--muted);margin-top:6px}
  .cta{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin-top:36px}
  .btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:16px 34px;border-radius:999px;font-size:15px;font-weight:600;border:0;cursor:pointer;font-family:inherit}
  .btn:hover{opacity:.88}
  .note{font-size:14px;color:var(--muted)}
  .band{background:var(--light);color:var(--ink);padding:64px 0}
  .band p{font-size:clamp(1rem,2.2vw,1.15rem);line-height:1.75;margin-bottom:16px}
  .marker{font-size:12px;font-weight:600;letter-spacing:.14em;color:var(--accent);margin-bottom:18px}
  .hosts{display:flex;flex-wrap:wrap;gap:24px;margin-top:30px}
  .host{display:flex;align-items:center;gap:12px;font-size:16px}
  .badge{width:44px;height:44px;border-radius:999px;background:var(--bg);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0}
  .reg{padding:64px 0;scroll-margin-top:20px}
  .card{background:rgba(193,195,198,.06);border:1px solid var(--line);border-radius:20px;overflow:hidden}
  .card .accent{height:5px;background:var(--accent)}
  .card .in{padding:32px 26px}
  h2{font-size:clamp(1.4rem,4vw,2rem);font-weight:800;color:#fff;margin-bottom:12px}
  .sub{font-size:1rem;color:var(--text);margin-bottom:26px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .f{margin-bottom:16px}
  .f label{display:block;font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--muted);margin-bottom:8px}
  .f input,.f textarea{width:100%;background:rgba(12,23,39,.5);border:1px solid var(--line);border-radius:12px;padding:14px 16px;color:#fff;font-size:16px;font-family:inherit;outline:none}
  .f input:focus,.f textarea:focus{border-color:var(--accent)}
  .f textarea{resize:vertical;line-height:1.6}
  .hp{position:absolute;left:-9999px;top:-9999px}
  .msg{font-size:14px;margin-top:14px}
  .fine{font-size:12px;color:var(--muted);margin-top:20px}
  .box{background:rgba(12,23,39,.5);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:24px}
  .box a{color:var(--accent);word-break:break-all;font-family:ui-monospace,monospace;font-size:.95rem}
  .btns{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
  .ghost{flex:1 1 180px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:13px 18px;font-size:14px;color:var(--text);text-decoration:none;background:transparent;cursor:pointer;font-family:inherit}
  .ghost:hover{border-color:var(--accent);color:#fff}
  footer{padding:36px 0 48px;font-size:14px;color:var(--muted)}
  @media(max-width:760px){.facts,.row{grid-template-columns:1fr}.fact+.fact{border-inline-start:0;border-top:1px solid var(--line)}.btn{width:100%;text-align:center}}
</style>
</head>
<body>
  ${event.status === 'draft' ? '<div class="draft">טיוטה — הדף עדיין לא פורסם. אפשר להראות אותו לבדיקה, אבל עדיף לא להפיץ עדיין.</div>' : ''}
  <section class="hero"><div class="wrap">
    ${letterhead}
    ${event.kicker ? `<div class="kicker">${esc(event.kicker)}</div>` : ''}
    <h1>${esc(event.title)}</h1>
    ${event.lede ? `<p class="lede">${esc(event.lede)}</p>` : ''}
    ${facts.length ? `<div class="facts">${facts
      .map((f) => `<div class="fact"><div class="l">${esc(f.label)}</div><div class="v">${esc(f.value)}</div>${f.sub ? `<div class="s">${esc(f.sub)}</div>` : ''}</div>`)
      .join('')}</div>` : ''}
    <div class="cta">
      <a class="btn" href="#registration">${closed ? 'לפרטים' : 'להרשמה'}</a>
      ${!closed ? '<span class="note">ההשתתפות ללא עלות · הקישור יישלח אליכם במייל</span>' : ''}
    </div>
  </div></section>

  ${event.body || hostList.length ? `<section class="band"><div class="narrow">
    ${event.body ? `<div class="marker">ההזמנה</div>${paragraphs(event.body, '')}` : ''}
    ${event.footnote ? `<p style="color:#4A5567">${esc(event.footnote)}</p>` : ''}
    ${hostList.length ? `<div class="hosts">${hostList
      .map((h) => `<div class="host"><span class="badge">${esc(firstLetter(h))}</span><span>${esc(h)}</span></div>`)
      .join('')}</div>` : ''}
  </div></section>` : ''}

  <section class="reg" id="registration"><div class="narrow">
    <div class="card"><div class="accent"></div><div class="in">
      ${closed ? `
        <h2>ההרשמה סגורה</h2>
        <p class="sub">${esc(event.closed_message || 'ההרשמה למפגש הזה נסגרה. תודה על ההתעניינות.')}</p>
      ` : `
      <div id="form-panel">
        <div class="marker">הרשמה</div>
        <h2>נשמח לראותכם.</h2>
        <p class="sub">מלאו את הפרטים ותקבלו מיד מייל אישור עם קישור ההצטרפות.</p>
        <form id="reg-form" novalidate>
          <div class="row">
            <div class="f"><label for="n">שם מלא *</label><input id="n" type="text" required autocomplete="name" maxlength="120"></div>
            <div class="f"><label for="e">אימייל *</label><input id="e" type="email" required autocomplete="email" dir="ltr" maxlength="200" style="text-align:start"></div>
          </div>
          ${event.ask_phone ? '<div class="f"><label for="p">טלפון (לא חובה)</label><input id="p" type="tel" autocomplete="tel" dir="ltr" maxlength="40" style="text-align:start"></div>' : ''}
          ${event.ask_question ? `<div class="f"><label for="q">${esc(event.question_label || 'שאלה שתרצו שנתייחס אליה (לא חובה)')}</label><textarea id="q" rows="3" maxlength="1000" placeholder="${esc(event.question_placeholder || '')}"></textarea></div>` : ''}
          <div class="hp" aria-hidden="true"><label for="w">אל תמלאו</label><input id="w" type="text" tabindex="-1" autocomplete="off"></div>
          <button class="btn" type="submit" id="go" style="width:100%;margin-top:12px">אישור הרשמה</button>
          <p class="msg" id="msg" style="display:none" aria-live="polite"></p>
          <p class="fine">הפרטים משמשים אך ורק למפגש הזה. לא נצרף אתכם לשום רשימת תפוצה.</p>
        </form>
      </div>
      <div id="done" style="display:none">
        <div class="marker">ההרשמה נקלטה</div>
        <h2>נרשמתם. נתראה.</h2>
        <p class="sub" id="done-note"></p>
        <div class="box" id="join-box" style="display:none">
          <div class="l" style="font-size:11px;letter-spacing:.12em;color:var(--muted);margin-bottom:10px">קישור המפגש</div>
          <a id="join" href="#" target="_blank" rel="noopener noreferrer" dir="ltr"></a>
        </div>
        <div class="btns" id="cal" style="display:none">
          <a class="ghost" id="gcal" target="_blank" rel="noopener noreferrer">Google Calendar</a>
          <a class="ghost" id="ics" href="/api/event-ics?event=${encodeURIComponent(event.slug)}">Outlook / Apple</a>
        </div>
        <div class="btns">
          <a class="ghost" id="wa" target="_blank" rel="noopener noreferrer">שליחה בוואטסאפ</a>
          <a class="ghost" id="mail">שליחה במייל</a>
        </div>
      </div>`}
    </div></div>
  </div></section>

  <footer><div class="narrow">
    ${[event.department, event.organisation].filter(Boolean).map(esc).join(' · ')}
  </div></footer>

<script>
(function(){
  var slug = ${JSON.stringify(event.slug)};
  var share = ${JSON.stringify(`${event.title}\n${[event.date_label, event.time_label].filter(Boolean).join(', ')}\nפרטים והרשמה: ${pageUrl}`)};
  var form = document.getElementById('reg-form');
  if (!form) return;
  var src = ''; try { src = new URLSearchParams(location.search).get('from') || ''; } catch (e) {}
  var msg = document.getElementById('msg'), go = document.getElementById('go');
  function say(t, bad){ msg.textContent = t; msg.style.display='block'; msg.style.color = bad ? '#ff9b8a' : 'var(--muted)'; }
  function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var name = val('n'), email = val('e');
    if (name.length < 2) return say('נשמח לשם המלא.', true);
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) return say('כתובת המייל לא נראית תקינה.', true);
    go.disabled = true; go.style.opacity = '.6'; say('רגע…');
    fetch('/api/event-register', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ event: slug, name:name, email:email, phone:val('p'), question:val('q'), website:val('w'), source:src })
    }).then(function(r){ return r.json().then(function(j){ return {s:r.status, b:j}; }); })
      .then(function(res){
        go.disabled = false; go.style.opacity = '';
        if (res.s !== 200 || !res.b.ok) return say('משהו השתבש. אפשר לנסות שוב עוד רגע.', true);
        msg.style.display = 'none';
        document.getElementById('form-panel').style.display = 'none';
        var done = document.getElementById('done'); done.style.display = '';
        document.getElementById('done-note').textContent =
          res.b.email_send === 'failed'
            ? 'שמרנו את ההרשמה, אבל מייל האישור לא יצא כרגע. הפרטים מופיעים כאן למטה.'
            : (res.b.status === 'already_registered'
                ? 'כבר הייתם רשומים — שלחנו לכם שוב את מייל האישור.'
                : 'שלחנו לכם מייל אישור. אם הוא לא הגיע תוך כמה דקות, כדאי לבדוק בספאם.');
        if (res.b.join_url) {
          var box = document.getElementById('join-box'), a = document.getElementById('join');
          a.href = res.b.join_url; a.textContent = res.b.join_url; box.style.display = '';
        }
        if (res.b.google_calendar_url) {
          document.getElementById('cal').style.display = '';
          document.getElementById('gcal').href = res.b.google_calendar_url;
        }
        document.getElementById('wa').href = 'https://wa.me/?text=' + encodeURIComponent(share);
        document.getElementById('mail').href = 'mailto:?subject=' + encodeURIComponent(${JSON.stringify(event.title)}) + '&body=' + encodeURIComponent(share);
        done.scrollIntoView({behavior:'smooth', block:'center'});
      })
      .catch(function(){ go.disabled = false; go.style.opacity=''; say('לא הצלחנו להגיע לשרת. נסו שוב.', true); });
  });
})();
</script>
${buildStamp ? `<!-- ${esc(buildStamp)} -->` : ''}
</body></html>`;
}

/** Initial for the host badge, skipping a Hebrew academic title. */
function firstLetter(name) {
  const words = String(name || '').trim().split(/\s+/);
  const titles = ["פרופ'", 'פרופ', 'ד"ר', 'דר', "ד'ר", 'מר', 'גב׳', "גב'"];
  const first = titles.includes(words[0]) && words.length > 1 ? words[1] : words[0];
  return (first || '?').charAt(0);
}
