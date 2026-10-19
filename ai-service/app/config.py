# Made By Eng Nayer Nader
"""Central configuration for The C Lounge Private Concierge (v72).

Every value is environment-driven so that no secret is ever committed.

v72 change of philosophy
------------------------
v71 treated a Claude outage as a normal operating mode and quietly swapped in a
scripted intake. That is why the live site answered "How many guests will be
aboard?" to a visitor who had already written "for 4 persons": the scripted
intake, not Claude, was answering every single turn and nobody could tell.

From v72 the deterministic path is an *honest* holding reply, never a fake
intake, and FALLBACK_IS_LOUD makes the degradation visible on /health, in the
telemetry stream and (optionally) to the operator.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _bool(name: str, default: bool) -> bool:
    return str(os.getenv(name, str(default))).strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list:
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


# ----------------------------------------------------------------------------
# Environment
# ----------------------------------------------------------------------------
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
SERVICE_NAME = "the-c-lounge-private-concierge"
SERVICE_VERSION = "73.0.0"
SIGNATURE = "Made By Eng Nayer Nader"

# ----------------------------------------------------------------------------
# Anthropic / Claude
# ----------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip().strip('"').strip("'")

# v73 ROOT CAUSE FIX.
# ------------------------------------------------------------------------
# The v72 production key was an *organisation* key, not a workspace-scoped
# key. Every single Messages call came back:
#
#   HTTP 400 invalid_request_error - "This API key is not scoped to a
#   workspace, so this request must include the anthropic-workspace-id
#   header with the ID of the workspace to use."
#
# That message matched none of brain.py's error signatures, so it was
# recorded as category "unknown", the model chain retried it three times
# per attempt, and every visitor silently received the holding reply while
# /health cheerfully reported `connected: true`.
#
# Two independent guards now exist:
#   1. Prefer a workspace-scoped key (what Nayer issued for
#      wrkspc_01RUq7HQZyhSYtTT73tz3z6f). Nothing extra is needed for it.
#   2. If ANTHROPIC_WORKSPACE_ID is set, send it as a default header on
#      every request, so an organisation-scoped key also works.
ANTHROPIC_WORKSPACE_ID = os.getenv("ANTHROPIC_WORKSPACE_ID", "").strip()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5").strip()
ANTHROPIC_UTILITY_MODEL = (
    os.getenv("ANTHROPIC_UTILITY_MODEL")
    or os.getenv("ANTHROPIC_FAST_MODEL")
    or "claude-haiku-4-5-20251001"
).strip()
# Optional override for self-hosted gateways. The SDK appends its own /v1 path.
ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "").strip().rstrip("/")
if ANTHROPIC_BASE_URL.endswith("/v1"):
    ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL[:-3].rstrip("/")
ANTHROPIC_TIMEOUT_SECONDS = _float("ANTHROPIC_TIMEOUT_SECONDS", 40.0)
ANTHROPIC_MAX_RETRIES = _int("ANTHROPIC_MAX_RETRIES", 2)

# A comma-separated ladder tried in order when the primary model is rejected by
# the account (wrong id, no access, capacity). The first one that answers wins
# and is remembered for the life of the process. This is the single most common
# cause of "the bot went scripted" and it now self-heals instead of failing.
MODEL_FALLBACK_CHAIN = _list(
    "MODEL_FALLBACK_CHAIN",
    "claude-sonnet-5,claude-opus-4-8,claude-sonnet-4-6,claude-haiku-4-5-20251001",
)

# ----------------------------------------------------------------------------
# Generation
# ----------------------------------------------------------------------------
MAX_HISTORY_TURNS = _int("MAX_HISTORY_TURNS", 10)
MAX_MESSAGE_CHARS = _int("MAX_MESSAGE_CHARS", 1200)
# The turn contract asks for a JSON envelope (reply + extracted state + intent),
# so the budget must cover the envelope, not just the prose.
MAX_NEW_TOKENS = _int("MAX_NEW_TOKENS", 1400)
TEMPERATURE = _float("TEMPERATURE", 0.4)
MAX_OUTPUT_CHARS = _int("MAX_OUTPUT_CHARS", 1100)

STREAM_WORD_DELAY_MS = _int("STREAM_WORD_DELAY_MS", 14)

# ----------------------------------------------------------------------------
# Behaviour
# ----------------------------------------------------------------------------
# When true the deterministic path NEVER pretends to run an intake. It gives one
# honest holding sentence and routes the visitor to the desk. Turning this off
# restores v71 behaviour and is not recommended.
HONEST_FALLBACK = _bool("HONEST_FALLBACK", True)
# Print a loud operator warning every time a visitor is served a non-Claude reply.
FALLBACK_IS_LOUD = _bool("FALLBACK_IS_LOUD", True)
# Retries of the turn contract before giving up on Claude for this turn.
GENERATION_ATTEMPTS = _int("GENERATION_ATTEMPTS", 2)

# ----------------------------------------------------------------------------
# Safety / abuse control
# ----------------------------------------------------------------------------
RATE_LIMIT_PER_MIN = _int("RATE_LIMIT_PER_MIN", 20)
SESSION_RATE_LIMIT_PER_MIN = _int("SESSION_RATE_LIMIT_PER_MIN", 12)
SESSION_TTL_SECONDS = _int("SESSION_TTL_SECONDS", 6 * 60 * 60)
MAX_SESSIONS = _int("MAX_SESSIONS", 5000)
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "").strip()
# Separate, stronger key for the diagnostics/telemetry endpoints. Falls back to
# the service key so an existing deploy keeps working.
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip() or SERVICE_API_KEY
ALLOWED_ORIGINS = _list("ALLOWED_ORIGINS", "http://localhost:3001")
MAX_BODY_BYTES = _int("MAX_BODY_BYTES", 32 * 1024)
REQUIRE_SERVICE_KEY = _bool("REQUIRE_SERVICE_KEY", True)

# An injection score at or above this blocks the turn outright.
INJECTION_BLOCK_SCORE = _int("INJECTION_BLOCK_SCORE", 3)
# A per-session strike count that ends the session's AI privileges.
INJECTION_MAX_STRIKES = _int("INJECTION_MAX_STRIKES", 4)

# ----------------------------------------------------------------------------
# Observability
# ----------------------------------------------------------------------------
LOG_PROMPTS = _bool("LOG_PROMPTS", False)  # never enable in production
TELEMETRY_BUFFER = _int("TELEMETRY_BUFFER", 400)


# ----------------------------------------------------------------------------
# Availability (new in v73)
# ----------------------------------------------------------------------------
# Render spins a web service down after ~15 minutes without inbound traffic, and
# the next visitor pays a 30-60s cold start — longer than the browser is willing
# to wait, which is exactly why the concierge appeared "off" every quarter hour.
#
# v73 makes the pair mutually self-sustaining: this service pings the web service
# AND itself, the web service pings this one AND itself, both on a jittered
# interval comfortably inside the idle window, and an external cron (see
# ops/keepalive) provides a third, independent wake path.
KEEPALIVE_ENABLED = _bool("KEEPALIVE_ENABLED", True)
KEEPALIVE_MINUTES = _float("KEEPALIVE_MINUTES", 4.0)
KEEPALIVE_JITTER_SECONDS = _int("KEEPALIVE_JITTER_SECONDS", 45)
# Public URL of this service, used for the self-ping. Render injects
# RENDER_EXTERNAL_URL automatically, so this normally needs no configuration.
SELF_URL = (os.getenv("SELF_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
# Public URL of the Node site/API, so the two services keep each other awake.
PEER_URL = (os.getenv("PEER_URL") or os.getenv("WEB_SERVICE_URL") or "").strip().rstrip("/")

# One real Claude call at boot. It turns "the bot is scripted" from a mystery a
# visitor discovers into a line in the deploy log.
STARTUP_SELF_TEST = _bool("STARTUP_SELF_TEST", True)
# Re-probe Claude on this cadence while degraded, so a fixed key or a restored
# balance recovers on its own instead of waiting for the next visitor.
SELF_HEAL_MINUTES = _float("SELF_HEAL_MINUTES", 5.0)
