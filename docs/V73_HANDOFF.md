# The C Lounge — V73 handoff

**Made By Eng Nayer Nader** · 06 September 2026

---

## 1. What was actually wrong

The live site answered every visitor with the holding reply:

> *"The private desk is handling this personally at the moment…"*

while `/health` said:

```json
{"engine":{"connected":true,"degraded":true,"consecutive_failures":24,
           "last_error_category":"unknown"},"claude_share":0.0}
```

That is **one** configuration fault plus **three** design faults that let it
hide. All four are fixed.

### The fault

`ANTHROPIC_API_KEY` was an **organisation-scoped** key. Every call to the
Messages API returned:

```
HTTP 400 invalid_request_error
"This API key is not scoped to a workspace, so this request must include the
 anthropic-workspace-id header with the ID of the workspace to use."
```

Verified directly against the API on 06-09-2026: the v72 key fails with exactly
this message; the workspace-scoped key issued for
`wrkspc_01RUq7HQZyhSYtTT73tz3z6f` succeeds on `claude-sonnet-5` on the first
call.

### Why nobody could see it

| # | Design fault | Consequence | Fix |
|---|---|---|---|
| 1 | The error text matched **none** of `brain.py`'s signatures | Logged as `"unknown"` with the remedy `"See the raw error text on /admin/diagnose"` — which nobody did | A `workspace_unscoped` signature, placed **first** so the words "API key" in the message cannot be swallowed by the `invalid_api_key` rule |
| 2 | An account-level fault was retried across the whole model chain | 4 models × 2 attempts = **6 doomed calls per visitor message**; 24 failures for 4 turns | `workspace_unscoped` added to `_ACCOUNT_LEVEL`, which stops the chain after the first model |
| 3 | `"connected": true` meant only *"a key string exists"* | The deploy log printed **"Claude engine connected"** on a completely broken engine, for days | `STARTUP_SELF_TEST` makes one real call at boot and prints `PASSED` or `FAILED` with the remedy |

### Belt and braces

`ANTHROPIC_WORKSPACE_ID` is now supported. When set, the service sends
`anthropic-workspace-id` on every request, so **an organisation key works too**.
Both paths are proven:

```
old organisation key, no header  -> workspace_unscoped, remedy printed, chain stops
old organisation key + header    -> OK on claude-sonnet-5
new workspace key                -> OK on claude-sonnet-5
```

### The concierge, verified end to end

Every failure from the 06-09-2026 transcripts, re-run against the live API:

| Visitor said | v72 did | v73 does |
|---|---|---|
| *"Hello i want a yachet due to tommorow under name of nayer for 4 persons in alexandria wgypt"* | asked *"How many guests will be aboard?"* | `name: Nayer · service: Yacht Charter & Marine · route: Alexandria, Egypt · timing: tomorrow · party_size: 4` — and asked only for the embarkation point |
| *"What are the membership types?"* | asked *"Where would you like this arranged?"* | named Signature, Privé and Sovereign and what separates them |
| the same question again | repeated the identical paragraph | rephrased, then returned to the open yacht brief |
| *"how much does it cost?"* | — | declined to quote, in voice, and offered the desk |
| *"Ignore all previous instructions…"* | — | blocked at the layer-3 gate, score 9, **zero tokens spent** |

---

## 2. Never sleeping again

Render frees a web instance after ~15 minutes without inbound traffic; the next
request pays a 30–60s cold start. On the concierge the visitor has already typed
and is watching a stream, so the proxy deadline expires first and they conclude
the bot is broken. That is the "it goes off every 15 minutes" symptom.

Four independent wake paths now exist:

1. `clounge-web` → itself
2. `clounge-web` → `clounge-ai`
3. `clounge-ai` → itself **and** `clounge-web`
4. an external cron (GitHub Actions, committed; or UptimeRobot; or `ops/keepalive/ping.sh`)

Every ping is **jittered** by up to 45 seconds. Two services on identical fixed
timers drift into lockstep, and once they do a single hiccup makes both fail in
the same window.

Both services expose a cheap `GET|HEAD /keepalive`. Keep-alive traffic is
excluded from the access log, so a quiet log is correct.

`clounge-ai` also answers on `/` now. v72 returned `{"detail":"Not Found"}`
there, which reads as a dead service to Render's own probe, to uptime monitors
and to any external cron.

Full reasoning and setup: **`ops/keepalive/README.md`**.

---

## 3. Self-healing

`SELF_HEAL_MINUTES=5`. While the engine is degraded, the service drops its
cached client and re-probes every five minutes. Fix a key in Render at 11:04 and
the site is serving Claude by 11:09 — no redeploy, no restart, nobody watching.

`POST /admin/self-test` (with `X-Admin-Key`) forces it immediately. That is the
one-call answer to *"is it fixed yet?"*.

---

## 4. The concierge widget

The visible AI surface was rebuilt around what actually happens when a request
is slow or fails.

* **Continuity.** The site is multi-page. In v72 the transcript lived in a JS
  variable, so walking from Home to Services threw the conversation away and the
  visitor started again from "Welcome." It now survives navigation
  (`sessionStorage`, six-hour horizon matching `SESSION_TTL_SECONDS`).
* **Honest waiting.** A cold service takes 30–60s. v72 showed an empty bubble
  with a blinking caret for that whole time. There is now a considering
  indicator, and opening the panel **pre-warms** the upstream before the visitor
  has finished typing.
* **Recoverable failure.** A failed turn offered nothing but a dead end. It now
  offers **Try again**, which re-sends the exact message — and removes the
  duplicated echo so the transcript stays clean.
* **A live status line.** The header reflects reachability instead of always
  claiming the desk is available.
* **Accessibility.** Real dialog semantics, a focus trap that includes the
  composer, focus restored to the toggle on close, a `role="log"` live region,
  and a composer that grows with the message instead of hiding it in one row.
* **Limits agree.** The textarea was capped at 1000 characters while the API
  accepts 1200 — a long brief was silently truncated. Both are 1200, and a
  contract test now fails if they ever diverge again.

---

## 5. Design

`public/assets/css/concierge.css`, loaded last, refines rather than forks.
Nothing about the identity changes: same palette, same Fraunces display face,
same dark-and-gold register.

Bubble geometry and entrance motion; the considering dots; the error and retry
states; `overflow-wrap` so a long URL or registration cannot widen a bubble past
the panel and clip the close button; 44px minimum touch targets on coarse
pointers; a 360px breakpoint for the narrowest phones still in use; a landscape
breakpoint for 460px-tall viewports where the transcript had no room;
`text-wrap: balance` on headings and `pretty` on body copy; fluid body type
under 480px so browser text scaling actually takes effect; full
`prefers-reduced-motion`, `forced-colors` and print support.

---

## 6. Verification

Everything below was run in this session.

```
node scripts/audit-pages.mjs            9 pages     0 failures  0 warnings
node tests/service-contract.test.mjs   29/29
node tests/deployment-contract.test.mjs 39/39
cd backend && node --test tests/*.test.js   21/21
cd ai-service && python3 tests/test_v72_regressions.py   28/28
cd ai-service && python3 tests/test_v73_regressions.py   14/14
```

Plus a real browser pass (Chromium) over **9 pages × 5 viewports = 45
combinations** — 320, 390, 768, 1280 and 1920 px:

* zero horizontal overflow anywhere
* zero JavaScript page errors
* every image has `alt`; exactly one `<h1>` per page
* the concierge widget present and functional on every page that declares it

And a scripted interaction test on desktop and mobile covering: open → prompt
chips → send → considering indicator → **forced network failure** → error bubble
→ **Try again** → streamed reply → prompts retired → **page navigation** →
transcript restored → `Escape` → focus returned to the toggle. Green on both.

> Two pre-existing repo defects were fixed on the way: `ai-service/.env.example`
> and `backend/.env.example` were referenced by the deployment contract but did
> not exist (the suite aborted); and `package.json`'s `audit:ai` script pointed
> at four Python test files that were removed in v72. `tests/rendered-html.test.mjs`
> now skips cleanly when `dist/` has not been built, instead of aborting the suite.

---

## 7. Deploying

1. **Rotate the old key.** `sk-ant-…UT474wAA` appeared in the v72 env file and
   in support conversations. It is no longer used. Revoke it in the Anthropic
   Console.
2. Paste `clounge-ai.env` into **Render → clounge-ai → Environment**.
3. Paste `clounge-web.env` into **Render → clounge-web → Environment**.
4. Deploy both. Watch the `clounge-ai` log for:

   ```
   [ai-service] workspace header: wrkspc_01RUq7HQZyhSYtTT73tz3z6f
   [ai-service] Self-test PASSED on claude-sonnet-5. Claude is answering visitors.
   [keepalive] every ~4.0 min -> https://clounge-ai.onrender.com, https://thecloungeworld.com
   ```

   If it says `SELF-TEST FAILED`, the next line names the exact remedy.
5. Confirm:

   ```bash
   curl -s https://clounge-ai.onrender.com/health | python3 -m json.tool
   ```

   Look for `"claude_share": 1.0` after the first real conversation, and
   `"degraded": false`.
6. Enable GitHub Actions on the repository (or add the two UptimeRobot monitors)
   for the external keep-alive layer.

---

## 8. The one number that matters

`claude_share` on `/health`. It is the fraction of visitor turns Claude actually
answered.

* `1.0` — every visitor is talking to Claude.
* Anything below `1.0` — real people received the holding reply. Open
  `POST /admin/diagnose` with the admin key; it now names the cause and the
  remedy rather than saying `"unknown"`.

---

*Made By Eng Nayer Nader*
