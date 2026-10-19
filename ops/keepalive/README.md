# Keeping The C Lounge awake

Made By Eng Nayer Nader

## The problem, precisely

Render frees a web instance after roughly **15 minutes without inbound HTTP
traffic**. The instance is not deleted — it is spun down, and the next request
pays a cold start of 30–60 seconds while the container is scheduled, the image
is unpacked and the process boots.

For `clounge-web` that shows up as a slow first page. For `clounge-ai` it is
worse: the visitor has already typed a message, the browser is waiting on a
stream, and the proxy's own deadline (`AI_STREAM_COLD_TIMEOUT_MS`) expires
before the service finishes waking. The visitor sees the holding reply and
concludes the concierge is broken.

This is the "it goes off every 15 minutes and I have to re-render" symptom.

## The four layers

Each layer is independent, so no single failure reopens the idle window.

| # | Wake path | Lives in | Interval |
|---|-----------|----------|----------|
| 1 | `clounge-web` pings **itself** | `backend/server.js` → `startKeepAlive()` | ~4 min + jitter |
| 2 | `clounge-web` pings `clounge-ai` | same | ~4 min + jitter |
| 3 | `clounge-ai` pings **itself** and `clounge-web` | `ai-service/app/main.py` → `_keepalive_loop()` | ~4 min + jitter |
| 4 | An **external** cron pings both | this folder | 10 min |

Layers 1–3 cover every ordinary case. Layer 4 exists for the one case they
cannot cover: if both services are asleep at the same moment, nothing inside
Render can wake either of them.

The jitter matters. Two services on identical fixed timers drift into lockstep;
when they do, a single network hiccup makes *both* pings fail in the same
window. A random offset of up to 45 seconds decorrelates them.

## Setting up layer 4

Pick **one**. All three are free.

### GitHub Actions (already committed)

`.github/workflows/keepalive.yml` runs every 10 minutes on GitHub's scheduler.
Nothing to configure — push the repository and enable Actions. GitHub's
scheduler is best-effort and can run several minutes late under load, which is
why the interval is 10 and not 14.

> Note: GitHub disables scheduled workflows in a repository with no activity for
> 60 days. It emails you first, and a single commit re-enables it.

### UptimeRobot

1. <https://uptimerobot.com> → **Add New Monitor**
2. Monitor type: **HTTP(s)**
3. URL: `https://thecloungeworld.com/keepalive` — interval **5 minutes**
4. Repeat for `https://clounge-ai.onrender.com/keepalive`

This has a second benefit: it also tells you when a service is genuinely down.

### Any machine with cron

```bash
chmod +x ops/keepalive/ping.sh
crontab -e
*/10 * * * * /full/path/to/ops/keepalive/ping.sh >> /var/log/clounge-keepalive.log 2>&1
```

## Checking it works

```bash
curl -s https://thecloungeworld.com/keepalive | python3 -m json.tool
curl -s https://clounge-ai.onrender.com/keepalive | python3 -m json.tool
```

Both report `awakeForSeconds` / `awake_for_seconds` and a `keepalive` block with
`pings` and `failures`. Two healthy signs:

* `awake_for_seconds` keeps climbing across a quiet night — the instance never
  slept.
* `failures` stays at or near `0`. A rising `failures` count with a healthy
  `pings` count means the *peer* is unreachable, not this service.

Keep-alive requests are deliberately excluded from the access log, so a quiet
log is expected and correct.

## The honest alternative

A paid Render instance never spins down. If the desk starts depending on the
concierge commercially, that is the right answer and these four layers become a
belt-and-braces safety net rather than the mechanism. They cost nothing to
leave in place.
