# Made By Eng Nayer Nader
"""The C Lounge — Private Concierge AI service (v72, Claude powered).

Endpoints
---------
GET  /health                liveness, engine status and the Claude-share ratio
GET  /api/chat/suggestions  curated opening prompts
POST /api/chat/stream       NDJSON concierge stream (the visitor path)
POST /api/route             internal desk-routing controller
POST /admin/diagnose        admin-key: one real call per model, names the cause
GET  /admin/turns           admin-key: the recent per-turn telemetry buffer

Only the Node backend speaks to this service, authenticated with a shared
service key. Nothing here is exposed to a browser directly.
"""

import asyncio
import json
import random
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import brain, config, security, state, telemetry
from .persona import SUGGESTED_PROMPTS

STARTED_AT = time.time()
LAST_SELF_TEST: Dict[str, Any] = {"at": None, "ok": None, "category": None, "remedy": None}
KEEPALIVE: Dict[str, Any] = {"enabled": False, "targets": [], "last_ok_at": None,
                             "last_error": None, "pings": 0, "failures": 0}


# ---------------------------------------------------------------------------
# Background tasks (new in v73)
# ---------------------------------------------------------------------------


async def _ping(url: str) -> bool:
    """One cheap GET. Never raises; the caller only needs the verdict."""
    try:
        import httpx  # ships with the Anthropic SDK

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(
                url, headers={"User-Agent": "clounge-ai-keepalive/73"})
            return response.status_code < 500
    except Exception as error:  # pragma: no cover - network guard
        KEEPALIVE["last_error"] = f"{type(error).__name__}: {error}"[:200]
        return False


async def _keepalive_loop() -> None:
    """Keep this service and its peer out of Render's idle spin-down.

    Render frees an idle instance after roughly 15 minutes and the next caller
    waits 30-60 seconds for a cold boot. A visitor will not. So both services
    ping themselves AND each other, on a jittered sub-window interval, and an
    external cron (ops/keepalive) provides a third independent path in case the
    pair ever sleeps at the same moment.
    """
    targets = [t for t in (config.SELF_URL, config.PEER_URL) if t]
    KEEPALIVE["targets"] = targets
    if not targets:
        print("[keepalive] no SELF_URL / PEER_URL configured; loop not started.")
        return
    KEEPALIVE["enabled"] = True
    base = max(60.0, config.KEEPALIVE_MINUTES * 60.0)
    print(f"[keepalive] every ~{base / 60:.1f} min -> {', '.join(targets)}")
    # Stagger the very first sweep so a redeploy of both services does not put
    # them permanently in lockstep.
    await asyncio.sleep(random.uniform(5, 20))
    while True:
        for target in targets:
            url = f"{target.rstrip('/')}/health" if target == config.SELF_URL \
                else f"{target.rstrip('/')}/api/health"
            ok = await _ping(url)
            KEEPALIVE["pings"] += 1
            if ok:
                KEEPALIVE["last_ok_at"] = time.time()
            else:
                KEEPALIVE["failures"] += 1
                # A cold peer needs a second knock, not a whole cycle of waiting.
                await asyncio.sleep(20)
                if await _ping(url):
                    KEEPALIVE["last_ok_at"] = time.time()
                else:
                    print(f"[keepalive] {url} unreachable: {KEEPALIVE['last_error']}")
        await asyncio.sleep(base + random.uniform(0, config.KEEPALIVE_JITTER_SECONDS))


def _log_self_test(result: dict) -> None:
    LAST_SELF_TEST.update({"at": time.time(), **result})
    if result.get("ok"):
        print(f"[ai-service] Self-test PASSED on {result.get('model')}. "
              "Claude is answering visitors.")
    else:
        print("[ai-service] *** SELF-TEST FAILED — VISITORS WILL GET THE HOLDING "
              f"REPLY *** category={result.get('category')}")
        if result.get("remedy"):
            print(f"[ai-service] ACTION REQUIRED: {result['remedy']}")


async def _self_heal_loop() -> None:
    """Re-probe Claude while degraded so a fixed key recovers without a deploy."""
    interval = max(60.0, config.SELF_HEAL_MINUTES * 60.0)
    while True:
        await asyncio.sleep(interval)
        if not brain.degraded() and LAST_SELF_TEST.get("ok"):
            continue
        brain.reset_client()
        _log_self_test(await asyncio.to_thread(brain.self_test))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print(f"[ai-service] {config.SIGNATURE}")
    print(f"[ai-service] build={config.SERVICE_VERSION} env={config.ENVIRONMENT} "
          f"model={config.ANTHROPIC_MODEL}")
    if config.ANTHROPIC_WORKSPACE_ID:
        print(f"[ai-service] workspace header: {config.ANTHROPIC_WORKSPACE_ID}")
    if brain.available():
        print("[ai-service] Anthropic client initialised.")
    else:
        print("[ai-service] *** CLAUDE ENGINE NOT CONNECTED ***")
        print(f"[ai-service] reason: {brain.status().get('detail')}")

    tasks = []
    if config.STARTUP_SELF_TEST and brain.available():
        # One real call before the first visitor. v72 printed "Claude engine
        # connected" purely because a key string existed, which is precisely how
        # a fully broken engine looked healthy in the deploy log for days.
        _log_self_test(await asyncio.to_thread(brain.self_test))
    if config.KEEPALIVE_ENABLED:
        tasks.append(asyncio.create_task(_keepalive_loop()))
    tasks.append(asyncio.create_task(_self_heal_loop()))

    yield

    for task in tasks:
        task.cancel()
    print("[ai-service] Private concierge stopped.")


app = FastAPI(
    title="The C Lounge Private Concierge",
    version=config.SERVICE_VERSION,
    docs_url=None if config.IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if config.IS_PRODUCTION else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Service-Key", "X-Admin-Key", "X-Request-Id"],
    max_age=86400,
)


@app.middleware("http")
async def hardening(request: Request, call_next):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.MAX_BODY_BYTES:
        return JSONResponse({"detail": "Payload too large."}, status_code=413)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["X-Signature"] = config.SIGNATURE
    if config.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def require_service_key(value: str) -> None:
    if not security.service_key_valid(value):
        raise HTTPException(status_code=401, detail="Invalid service credentials.")


def require_admin_key(value: str) -> None:
    if not security.admin_key_valid(value):
        raise HTTPException(status_code=401, detail="Invalid administrative credentials.")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=100)
    message: str = Field(min_length=1, max_length=config.MAX_MESSAGE_CHARS)
    visitor_id: Optional[str] = Field(default=None, max_length=120)
    analytics_session_id: Optional[str] = Field(default=None, max_length=120)


class RouteRequest(BaseModel):
    inquiry: Dict[str, Any]


# ---------------------------------------------------------------------------
# Health, suggestions, diagnostics
# ---------------------------------------------------------------------------


@app.get("/")
@app.head("/")
def root():
    """A real root document.

    v72 answered `{"detail":"Not Found"}` on GET / and 404 on HEAD /. Render's
    own probes, uptime monitors and any external keepalive cron all knock on the
    root first, and a 404 there reads as a broken service to every one of them.
    """
    return {
        "service": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "status": "ok",
        "endpoints": ["/health", "/keepalive", "/api/chat/suggestions",
                      "/api/chat/stream", "/api/route"],
        "signature": config.SIGNATURE,
    }


@app.get("/keepalive")
@app.head("/keepalive")
def keepalive():
    """The cheapest possible wake target: no engine work, no session scan."""
    return {
        "ok": True,
        "awake_for_seconds": round(time.time() - STARTED_AT, 1),
        "keepalive": KEEPALIVE,
        "signature": config.SIGNATURE,
    }


@app.get("/health")
@app.head("/health")
def health():
    """Unauthenticated liveness probe. In production the raw provider error is
    replaced with a coarse code so an outsider learns nothing about the account.
    """
    engine_status = dict(brain.status())
    if config.IS_PRODUCTION and engine_status.get("detail"):
        engine_status["detail"] = "unavailable"
    snapshot = telemetry.snapshot()
    return {
        "ok": True,
        "service": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        # The single number that answers "is the bot actually thinking?".
        # Anything below 1.0 means real visitors received a holding reply.
        "claude_share": snapshot["claude_share"],
        "engine": engine_status,
        "counters": snapshot,
        "active_sessions": len(state.SESSION_TOUCHED),
        "self_test": {k: v for k, v in LAST_SELF_TEST.items()
                      if k != "remedy" or not config.IS_PRODUCTION},
        "keepalive": {"enabled": KEEPALIVE["enabled"], "pings": KEEPALIVE["pings"],
                      "failures": KEEPALIVE["failures"]},
        "signature": config.SIGNATURE,
    }


@app.get("/api/chat/suggestions")
def suggestions(x_service_key: str = Header(default="")):
    require_service_key(x_service_key)
    return {"suggestions": SUGGESTED_PROMPTS}


@app.post("/admin/diagnose")
def admin_diagnose(request: Request, x_admin_key: str = Header(default="")):
    """Make one real Claude call per model in the chain and report the cause.

        curl -s -X POST https://clounge-ai.onrender.com/admin/diagnose \
             -H "X-Admin-Key: $ADMIN_API_KEY" | python -m json.tool
    """
    require_admin_key(x_admin_key)
    if security.rate_limited(f"diagnose:{client_ip(request)}", 6):
        raise HTTPException(status_code=429, detail="Please slow down.")
    return {
        "stream_word_delay_ms": config.STREAM_WORD_DELAY_MS,
        "max_new_tokens": config.MAX_NEW_TOKENS,
        "max_output_chars": config.MAX_OUTPUT_CHARS,
        "honest_fallback": config.HONEST_FALLBACK,
        **brain.diagnose(),
    }


@app.post("/admin/self-test")
def admin_self_test(x_admin_key: str = Header(default="")):
    """Force a fresh probe and reset the client. The one-call answer to
    "is it fixed yet?" after changing a key in Render."""
    require_admin_key(x_admin_key)
    brain.reset_client()
    result = brain.self_test()
    LAST_SELF_TEST.update({"at": time.time(), **result})
    return {**result, "signature": config.SIGNATURE}


@app.get("/admin/turns")
def admin_turns(limit: int = 50, x_admin_key: str = Header(default="")):
    require_admin_key(x_admin_key)
    return {
        "counters": telemetry.snapshot(),
        "turns": telemetry.recent(min(max(limit, 1), 200)),
        "signature": config.SIGNATURE,
    }


# ---------------------------------------------------------------------------
# Desk routing controller
# ---------------------------------------------------------------------------

ALLOWED_INQUIRY_KEYS = (
    "request_type", "organization", "service", "destination",
    "date", "urgency", "tier", "country", "message",
)


@app.post("/api/route")
def route_inquiry(payload: RouteRequest, request: Request, x_service_key: str = Header(default="")):
    require_service_key(x_service_key)
    if security.rate_limited(f"route:{client_ip(request)}", config.RATE_LIMIT_PER_MIN):
        raise HTTPException(status_code=429, detail="Please slow down.")

    allowed = {
        key: state.clean_text(payload.inquiry.get(key), 600)
        for key in ALLOWED_INQUIRY_KEYS if payload.inquiry.get(key)
    }
    result = brain.route_inquiry(allowed)
    desk = str(result.get("desk", "")).upper()
    if desk not in {"CONCIERGE", "EXECUTIVE", "PRIVATE"}:
        raise HTTPException(status_code=502,
                            detail="The routing recommendation could not be completed.")
    try:
        confidence = max(0.0, min(1.0, float(result.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    priority = str(result.get("priority", "routine")).lower()
    if priority not in {"routine", "priority", "immediate"}:
        priority = "routine"
    return {
        "desk": desk,
        "confidence": confidence,
        "priority": priority,
        "summary": security.redact(state.clean_text(result.get("summary"), 1200)),
        "rationale": state.clean_text(result.get("rationale"), 240),
    }


# ---------------------------------------------------------------------------
# Concierge chat
# ---------------------------------------------------------------------------


def _event(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _human_summary(session_state: dict) -> str:
    """One readable sentence for the desk, never a dump of the session dict."""
    service = session_state.get("service") or "private coordination"
    name = session_state.get("name")
    sentence = (f"{name} has asked the desk to arrange {str(service).lower()}"
                if name else f"A visitor has asked the desk to arrange {str(service).lower()}")
    if session_state.get("route"):
        sentence += f" for {session_state['route']}"
    if session_state.get("timing"):
        sentence += f", {session_state['timing']}"
    if session_state.get("party_size"):
        sentence += f", for {session_state['party_size']} guest(s)"
    sentence += "."
    extras = session_state.get("preferences")
    if extras and str(extras).lower() not in ("none specified", "no", "none"):
        sentence += f" Requirements: {extras}."
    if session_state.get("preferred_contact"):
        sentence += f" Preferred reply: {session_state['preferred_contact']}."
    return security.redact(state.clean_text(sentence, 800))


def _handoff_event(session_state: dict, envelope: dict) -> dict:
    fields = {key: state.clean_text(session_state.get(key), 180)
              for key in ("name", "service", "route", "timing", "party_size",
                          "preferences", "preferred_contact")
              if session_state.get(key)}
    return {
        "ready": True,
        "confidence": 0.85,
        "summary": envelope.get("handoff_summary") or _human_summary(session_state),
        "fields": fields,
        "missing": [],
    }


@app.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request,
                      x_service_key: str = Header(default="")):
    require_service_key(x_service_key)
    ip = client_ip(request)
    if security.rate_limited(f"ip:{ip}", config.RATE_LIMIT_PER_MIN):
        raise HTTPException(status_code=429, detail="Please slow down.")
    if security.rate_limited(f"session:{payload.session_id}", config.SESSION_RATE_LIMIT_PER_MIN):
        raise HTTPException(status_code=429, detail="Please slow down.")

    state.prune()
    message = security.strip_markers(payload.message.strip(), config.MAX_MESSAGE_CHARS)
    if not message:
        raise HTTPException(status_code=400, detail="A message is required.")

    session_id = payload.session_id
    session_state = state.state_for(session_id)
    scan = security.injection_scan(message)

    async def stream():
        started = time.time()
        served_by = "fallback"
        failure = None
        envelope = None
        handoff = None

        # --- Layer 3 gate: refuse before a single token is spent on an attack.
        if scan["blocked"]:
            strikes = state.add_strike(session_id)
            telemetry.bump("injection_blocked")
            reply = security.security_boundary_response()
            if strikes >= config.INJECTION_MAX_STRIKES:
                telemetry.bump("sessions_locked")
                reply = ("I am not able to continue along these lines. If you have a "
                         "genuine C Lounge request, the private desk will be glad to "
                         "assist you directly.")
            print(f"[ai-service] Injection blocked (score={scan['score']} "
                  f"labels={scan['labels']} strikes={strikes})")
            for chunk in _word_chunks(reply):
                yield _event({"type": "token", "text": chunk})
                await asyncio.sleep(config.STREAM_WORD_DELAY_MS / 1000)
            state.push_turn(session_id, "user", "[request declined by policy]")
            state.push_turn(session_id, "assistant", reply)
            telemetry.record_turn(session_id=session_id, served_by="policy",
                                  failure="injection_blocked",
                                  injection_score=scan["score"],
                                  injection_labels=scan["labels"],
                                  latency_ms=int((time.time() - started) * 1000))
            yield _event({"type": "done"})
            return

        # --- Seed the state so Claude starts from a sensible first guess.
        state.merge_state(session_id, state.seed_extract(message))
        history = list(state.history_for(session_id))
        state.push_turn(session_id, "user", message)

        result = await asyncio.to_thread(
            brain.run_turn, history, state.state_for(session_id), message)

        if result["ok"]:
            envelope = result["envelope"]
            served_by = "claude"
            merged = state.merge_state(session_id, envelope["state"])
            if envelope.get("recap_presented"):
                merged["recap_presented"] = True
            if envelope.get("handoff_ready") and merged.get("recap_presented"):
                merged["handoff_confirmed"] = True
                handoff = _handoff_event(merged, envelope)
            reply = envelope["reply"]
        else:
            failure = result["meta"].get("failure")
            if "bad_envelope" in str(failure):
                telemetry.bump("envelope_parse_failures")
            if "refused" in str(failure):
                telemetry.bump("outputs_refused")
            if config.FALLBACK_IS_LOUD:
                print(f"[ai-service] *** DEGRADED *** A visitor received a holding reply. "
                      f"Cause: {failure}. Provider: "
                      f"{brain.last_completion_error() or 'none recorded'}")
            reply = state.fallback_response(message, state.state_for(session_id))

        for chunk in _word_chunks(reply):
            yield _event({"type": "token", "text": chunk})
            if config.STREAM_WORD_DELAY_MS:
                await asyncio.sleep(config.STREAM_WORD_DELAY_MS / 1000)

        state.push_turn(session_id, "assistant", reply)

        if handoff:
            yield _event({"type": "handoff", **handoff})

        telemetry.record_turn(
            session_id=session_id,
            visitor_id=payload.visitor_id,
            analytics_session_id=payload.analytics_session_id,
            served_by=served_by,
            failure=failure,
            model=result["meta"].get("model"),
            attempts=result["meta"].get("attempts"),
            provider_latency_ms=result["meta"].get("latency_ms"),
            input_tokens=result["meta"].get("input_tokens"),
            output_tokens=result["meta"].get("output_tokens"),
            intent=(envelope or {}).get("intent"),
            service=(envelope or {}).get("service"),
            missing=(envelope or {}).get("missing"),
            handoff_ready=bool(handoff),
            injection_score=scan["score"],
            injection_labels=scan["labels"],
            reply_chars=len(reply),
            latency_ms=int((time.time() - started) * 1000),
        )

        # The backend mirrors this into Firestore so degradation is auditable
        # long after the in-memory buffer has rolled over.
        yield _event({
            "type": "telemetry",
            "served_by": served_by,
            "model": result["meta"].get("model"),
            "intent": (envelope or {}).get("intent"),
            "service": (envelope or {}).get("service"),
            "failure": failure,
            "injection_score": scan["score"],
            "latency_ms": int((time.time() - started) * 1000),
        })
        yield _event({"type": "done"})

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _word_chunks(text: str):
    words = str(text or "").split(" ")
    for index, word in enumerate(words):
        yield word if index == 0 else " " + word
