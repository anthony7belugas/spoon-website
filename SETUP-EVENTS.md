# Events sign-up — one-time setup (~10 minutes)

The events page works like this: the event list is a small array you edit
at the top of `events.js`; sign-ups are saved to Firestore; the "N going"
counter reads back from Firestore. Free events only, no payments. You (or
whoever runs the door) read the sign-up list straight from the Firebase
console — no admin page needed.

Until you finish these steps, the page still works — event cards render,
the form just says "sign-ups open soon." So you can push everything now
and wire Firebase whenever.

## 1. Create the Firebase project (separate from Besties)

1. Go to https://console.firebase.google.com → **Add project** → name it
   `spoon-usc` → Google Analytics off → Create.
   (Keep it separate from Besties so club data never mixes with your company's.)
2. In the project: **Build → Firestore Database → Create database** →
   Start in **production mode** → location `us-west1` (or nam5) → Enable.
3. Project overview → the **`</>` (Web)** icon → nickname `spoon-website`
   → Register (no hosting needed) → it shows a `firebaseConfig` object.
4. Copy those six values into `FIREBASE_CONFIG` at the top of `events.js`.

## 2. Paste the security rules (this is what makes it safe)

Firestore → **Rules** tab → replace everything with this → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // one doc per (event, email). create-only:
    // nobody can read the list (emails stay private),
    // nobody can edit or delete, duplicates are rejected.
    match /signups/{id} {
      allow create: if
        request.resource.data.keys().hasOnly(['event','name','email','ts']) &&
        request.resource.data.event is string &&
        request.resource.data.event.size() > 0 &&
        request.resource.data.event.size() < 60 &&
        request.resource.data.name is string &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.name.size() < 100 &&
        request.resource.data.email is string &&
        request.resource.data.email.matches('[^@\\s]+@usc\\.edu') &&
        request.resource.data.ts == request.time &&
        id == request.resource.data.event + '__' + request.resource.data.email;
      allow read, update, delete: if false;
    }

    // Public "N going" counter. IMPORTANT: it's written in the SAME atomic
    // batch as the signup, so a rule that denied a write here would also
    // kill the signup. It's only a cosmetic number, so keep it permissive
    // — it must never be able to block a real signup. Worst case someone
    // sets a wrong count; the private door list (signups) stays locked.
    // Only deletion is blocked.
    match /counts/{eventId} {
      allow read: if true;
      allow create, update: if request.resource.data.count is int
                            && request.resource.data.count > 0;
      allow delete: if false;
    }
  }
}
```

Notes:
- Sign-ups require an `@usc.edu` email (enforced server-side, not just in
  the form). If an event ever allows non-USC guests, loosen the `matches`
  line to `'[^@\\s]+@[^@\\s]+\\.[^@\\s]+'`.
- You can't lock Firestore to one website by rules alone, but these rules
  mean the worst anyone can do is add a fake name+email row — same as any
  public form. Fine for a club.

## 3. Add / edit events

Open `events.js`, edit the `EVENTS` array at the top (there's a commented
example), commit, push. Vercel redeploys. Events disappear on their own
the day after their date. Never reuse an `id`.

## 4. The door list (who signed up)

Firebase console → Firestore → `signups` collection. Each doc is one
person: event, name, email, timestamp. For an event, filter by field
`event == cra-night-2026` (Filter button above the table). Whoever's at
the door can check names off against that list on a phone — that's the
whole "manual check" flow.

Want a spreadsheet instead? Select the docs aren't exportable from the
console directly, so easiest is: ask me to generate a tiny one-off script,
or just keep using the console list — for club-sized events it's plenty.

## 5. Free tier

Firestore free tier: 50K reads / 20K writes per day. A big Spoon event is
a few hundred writes total. You will never hit the limit.
