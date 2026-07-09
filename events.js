/* ============================================================
   Spoon USC — events + sign-ups (free events, no payments)
   ------------------------------------------------------------
   HOW IT WORKS
   - Events live in the EVENTS list right below. To add an event,
     add an entry, commit, push. Past events hide themselves.
   - Sign-ups are saved to Firestore (collection "signups", one doc
     per person per event) and a public counter ("counts") powers
     the "N going" label. One batch write; duplicates are rejected
     by the security rules, not by trusting the browser.
   - To see who signed up (the door list): Firebase console ->
     Firestore -> signups. Full steps in SETUP-EVENTS.md.
   - Until FIREBASE_CONFIG is filled in, the page still renders;
     forms just say sign-ups open soon.
   ============================================================ */

/* ---- 1. THE EVENTS. Edit this list, push, done. ---------------
   id:    short + unique, never reuse ("cra-night-2026")
   date:  "YYYY-MM-DD" (hides automatically the day after)
   time / where / blurb: shown on the card                         */
const EVENTS = [
  {
    id:    "cra-night-2026",
    title: "Crazy Rich Asians Night",
    date:  "2026-09-10",
    time:  "7:00 PM",
    where: "Location TBA",
    blurb: "Movie night with themed food. Free for USC students — sign up so we know how much to bring.",
  },
  // {
  //   id:    "welcome-social-2026",
  //   title: "Welcome Back Social",
  //   date:  "2026-08-28",
  //   time:  "6:00 PM",
  //   where: "McCarthy Quad",
  //   blurb: "Kick off the semester with us. Free eats, obviously.",
  // },
];

/* ---- 2. FIREBASE CONFIG. Paste yours from the Firebase console
   (Project settings -> Your apps -> Web app -> Config).
   Full setup steps: SETUP-EVENTS.md                               */
const FIREBASE_CONFIG = {
  apiKey:            "PASTE_YOUR_API_KEY",
  authDomain:        "PASTE.firebaseapp.com",
  projectId:         "PASTE_PROJECT_ID",
  storageBucket:     "PASTE.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId:             "PASTE_APP_ID",
};

/* ================= no edits needed below this line ============= */

const CONFIGURED = !FIREBASE_CONFIG.apiKey.startsWith("PASTE");

/* Firebase loads lazily AFTER the cards render, so the events list
   never depends on the Firebase CDN being reachable. */
let fb = null;
async function firestore() {
  if (fb) return fb;
  const [{ initializeApp }, fs] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
  ]);
  fb = { db: fs.getFirestore(initializeApp(FIREBASE_CONFIG)), ...fs };
  return fb;
}

const list  = document.getElementById("eventsList");
const empty = document.getElementById("eventsEmpty");

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

/* upcoming = today or later (event day counts as upcoming) */
const today = new Date(); today.setHours(0, 0, 0, 0);
const upcoming = EVENTS
  .filter((e) => new Date(e.date + "T23:59:59") >= today)
  .sort((a, b) => a.date.localeCompare(b.date));

if (upcoming.length === 0) {
  empty.hidden = false;
} else {
  list.innerHTML = upcoming.map(cardHTML).join("");
  const nodes = list.querySelectorAll(".event");   // same order as `upcoming`
  upcoming.forEach((e, i) => wireCard(e, nodes[i]));
  if (CONFIGURED) upcoming.forEach((e, i) => loadCount(e, nodes[i]));
}

function cardHTML(e) {
  const d = new Date(e.date + "T12:00:00");
  return `
  <article class="event" id="ev-${esc(e.id)}">
    <div class="event-top">
      <div class="date"><div class="d">${d.getDate()}</div><div class="m">${MONTHS[d.getMonth()]}</div></div>
      <div>
        <h3>${esc(e.title)}</h3>
        <div class="sub">${esc(e.time)} &middot; ${esc(e.where)}</div>
        <p class="desc">${esc(e.blurb)}</p>
      </div>
      <div class="side">
        <div class="going" data-count></div>
        <button class="btn btn-red" type="button" data-toggle aria-expanded="false" aria-controls="rsvp-${esc(e.id)}">Sign up</button>
      </div>
    </div>
    <div class="rsvp" id="rsvp-${esc(e.id)}">
      ${CONFIGURED ? `
      <form novalidate>
        <div><label for="name-${esc(e.id)}">Name</label>
          <input id="name-${esc(e.id)}" name="name" type="text" autocomplete="name" maxlength="80" required placeholder="Tommy Trojan" /></div>
        <div><label for="email-${esc(e.id)}">USC email</label>
          <input id="email-${esc(e.id)}" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" required placeholder="ttrojan@usc.edu" /></div>
        <button class="btn btn-ink" type="submit">Save my spot</button>
        <div class="note" data-note aria-live="polite"></div>
      </form>` : `
      <div class="note">Sign-ups open soon &mdash; follow <a href="https://instagram.com/spoon_usc" target="_blank" rel="noopener" style="text-decoration:underline">@spoon_usc</a> for the link.</div>`}
    </div>
  </article>`;
}

function wireCard(e, card) {
  const toggle = card.querySelector("[data-toggle]");
  toggle.addEventListener("click", () => {
    const open = card.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) card.querySelector("input")?.focus();
  });

  const form = card.querySelector("form");
  if (!form) return;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    submitSignup(e, card, form);
  });
}

async function loadCount(e, card) {
  try {
    const { db, doc, getDoc } = await firestore();
    const snap = await getDoc(doc(db, "counts", e.id));
    const n = snap.exists() ? snap.data().count : 0;
    if (n > 0) setCount(card, n);
  } catch { /* count is decoration; fail silently */ }
}

function setCount(card, n) {
  const el = card.querySelector("[data-count]");
  if (el) el.innerHTML = `<strong>${n}</strong> going`;
}

async function submitSignup(e, card, form) {
  const note  = form.querySelector("[data-note]");
  const btn   = form.querySelector('[type="submit"]');
  if (btn.disabled) return;                       // guard against double-submit (e.g. double Enter)

  // unambiguous field access: `form.name` is spec-ambiguous (name is also a
  // reflected form property), so query the inputs directly for cross-browser safety.
  const name  = form.querySelector('input[name="name"]').value.trim();
  const email = form.querySelector('input[name="email"]').value.trim().toLowerCase();

  const say = (msg, cls) => { note.textContent = msg; note.className = "note " + (cls || ""); };

  if (!name)                       return say("Add your name so we know who's coming.", "err");
  if (!/^[a-z0-9._%+-]+@usc\.edu$/.test(email)) return say("Use your @usc.edu email.", "err");

  btn.disabled = true;
  say("Saving\u2026");

  try {
    const { db, doc, writeBatch, increment, serverTimestamp } = await firestore();
    // one person per event: the doc id IS the (event, email) pair,
    // and rules forbid updates — so a second try is rejected server-side.
    const signupId = e.id + "__" + email;
    const batch = writeBatch(db);
    batch.set(doc(db, "signups", signupId), {
      event: e.id, name, email, ts: serverTimestamp(),
    });
    batch.set(doc(db, "counts", e.id), { count: increment(1) }, { merge: true });
    await batch.commit();

    say("You're in. See you there \uD83E\uDD44", "ok");
    form.querySelectorAll("input").forEach((i) => (i.disabled = true));
    const cur = parseInt(card.querySelector("[data-count] strong")?.textContent || "0", 10);
    setCount(card, cur + 1);
  } catch (err) {
    btn.disabled = false;
    if (err?.code === "permission-denied") {
      say("Looks like this email is already signed up for this event.", "err");
    } else {
      say("Couldn't save that \u2014 check your connection and try again.", "err");
    }
  }
}
