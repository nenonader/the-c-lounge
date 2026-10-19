# Made By Eng Nayer Nader
"""Claude engine for The C Lounge Private Concierge (v72).

Responsibilities
----------------
* Own the Anthropic client.
* Run the single-call turn contract and validate the JSON envelope.
* Self-heal across a model fallback chain rather than dying on one bad model id.
* Never raise into the request path; every failure is recorded and classified.

What changed from v71's engine.py
---------------------------------
v71 reported "connected" whenever an API key was present, which said nothing
about whether calls actually succeeded. An invalid key, an exhausted balance or
a model the account cannot reach all produced a healthy-looking service that
silently served scripted replies to every visitor for days. Three things fix
that here: a model fallback chain that tries the next model instead of giving
up, a first-failure classification that names the remedy, and telemetry that
records the served path on every single turn.
"""

import json
import re
import time
from typing import Dict, List, Optional

from . import config, security
from .persona import ROUTING_PROMPT, TURN_CONTRACT, system_prompt

_client = None
_last_client_error: Optional[str] = None
_last_completion_error: Optional[str] = None
_consecutive_failures = 0
DEGRADED_AFTER_FAILURES = 3

# The model that last answered successfully. Set by the fallback chain so the
# process stops paying for a doomed first attempt on every turn.
_active_model: Optional[str] = None


def _load_client():
    global _client, _last_client_error
    if _client is not None:
        return _client
    if not config.ANTHROPIC_API_KEY:
        _last_client_error = "ANTHROPIC_API_KEY is not set"
        return None
    try:
        from anthropic import Anthropic

        kwargs = {
            "api_key": config.ANTHROPIC_API_KEY,
            "timeout": config.ANTHROPIC_TIMEOUT_SECONDS,
            "max_retries": config.ANTHROPIC_MAX_RETRIES,
        }
        if config.ANTHROPIC_BASE_URL:
            kwargs["base_url"] = config.ANTHROPIC_BASE_URL
        # v73: an organisation-scoped key MUST name a workspace on every call.
        # A workspace-scoped key ignores the header, so sending it is always
        # safe and never wrong.
        if config.ANTHROPIC_WORKSPACE_ID:
            kwargs["default_headers"] = {
                "anthropic-workspace-id": config.ANTHROPIC_WORKSPACE_ID,
            }
        _client = Anthropic(**kwargs)
        _last_client_error = None
    except Exception as error:  # pragma: no cover - import guard
        _last_client_error = f"Anthropic client unavailable: {error}"
        _client = None
    return _client


def available() -> bool:
    return _load_client() is not None


def degraded() -> bool:
    return _consecutive_failures >= DEGRADED_AFTER_FAILURES


def active_model() -> str:
    return _active_model or config.ANTHROPIC_MODEL


# ---------------------------------------------------------------------------
# Model capability matrix
# ---------------------------------------------------------------------------
# Newer Claude families changed the Messages API contract. Sending a parameter a
# model no longer accepts returns HTTP 400 — and because this service is written
# to swallow provider errors, that 400 is invisible and the visitor silently
# gets a scripted reply. Encode the rules once, here.
#
#   * Non-default temperature/top_p/top_k -> 400 on Sonnet 5, Opus 4.7+, Opus 5,
#     and the Fable/Mythos tier.
#   * Assistant prefilling -> 400 from Sonnet 4.6 onwards.
#   * Adaptive thinking is ON by default on those families; pass
#     thinking={"type": "disabled"} to turn it off. Never pass "enabled".

_NO_SAMPLING_PREFIXES = (
    "claude-sonnet-5", "claude-opus-4-7", "claude-opus-4-8",
    "claude-opus-5", "claude-fable", "claude-mythos",
)
_NO_PREFILL_PREFIXES = _NO_SAMPLING_PREFIXES + ("claude-sonnet-4-6",)


def _name(model: str) -> str:
    return str(model or "").strip().lower()


def omits_sampling(model: str) -> bool:
    return _name(model).startswith(_NO_SAMPLING_PREFIXES)


def supports_prefill(model: str) -> bool:
    return not _name(model).startswith(_NO_PREFILL_PREFIXES)


def thinking_is_default_on(model: str) -> bool:
    return _name(model).startswith(_NO_SAMPLING_PREFIXES)


def _request(model: str, max_tokens: int, system: list, messages: List[dict],
             temperature: Optional[float]) -> dict:
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    if thinking_is_default_on(model):
        payload["thinking"] = {"type": "disabled"}
    if not omits_sampling(model):
        payload["temperature"] = config.TEMPERATURE if temperature is None else temperature
    return payload


def _system_blocks(extra: str = "") -> List[dict]:
    text = system_prompt(security.CANARY)
    if extra:
        text = f"{text}\n\n{extra}"
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

_ERROR_SIGNATURES = (
    # v73, and the actual cause of the 06-09-2026 outage. Kept at the top of the
    # ladder because its message also contains the word "key", which would
    # otherwise be swallowed by the invalid_api_key signature below.
    ("workspace_unscoped",
     ("not scoped to a workspace", "anthropic-workspace-id", "workspace_id"),
     "The ANTHROPIC_API_KEY is an organisation key, not a workspace key. Either "
     "issue a workspace-scoped key in the Anthropic Console (Settings -> API keys "
     "-> select the workspace), or set ANTHROPIC_WORKSPACE_ID in Render so every "
     "request names the workspace. Nothing else in this project is at fault."),
    ("empty_completion",
     ("empty completion",),
     "The model returned no text. Almost always max_tokens exhausted before the "
     "JSON envelope closed: raise MAX_NEW_TOKENS, or lower MAX_OUTPUT_CHARS."),
    ("credit_exhausted",
     ("credit balance is too low", "insufficient credit", "plans & billing", "billing"),
     "The Anthropic account has no credit. Add credits at console.anthropic.com -> "
     "Plans & Billing. The key is valid; nothing in this project needs changing."),
    ("invalid_api_key",
     ("invalid x-api-key", "authentication_error", "invalid api key",
      "could not be authenticated", "permission_error"),
     "ANTHROPIC_API_KEY is wrong, revoked, or missing in Render. Set the current "
     "key in Render -> clounge-ai -> Environment, then redeploy."),
    ("rate_limited",
     ("rate_limit_error", "rate limit", "429", "overloaded"),
     "Anthropic is rate limiting or overloaded. Retry, or raise account limits."),
    ("model_not_found",
     ("not_found_error", "does not exist", "model:", "invalid model"),
     "ANTHROPIC_MODEL names a model this account cannot reach. The fallback chain "
     "will try the next model; set MODEL_FALLBACK_CHAIN to control the order."),
    ("model_rejected_parameter",
     ("temperature", "not supported", "unexpected keyword", "thinking", "top_p"),
     "The model rejected a request parameter. Check brain.py's capability matrix "
     "against the model's current documentation."),
    ("refused",
     ("stop_reason=refusal", "refusal"),
     "The model refused this request. Not a configuration fault."),
    ("timeout",
     ("timeout", "timed out", "read timeout", "connection"),
     "The provider call exceeded ANTHROPIC_TIMEOUT_SECONDS or the network failed."),
)


def classify_error(detail: Optional[str]) -> dict:
    if not detail:
        return {"category": None, "remedy": None}
    lowered = detail.lower()
    for category, needles, remedy in _ERROR_SIGNATURES:
        if any(needle in lowered for needle in needles):
            return {"category": category, "remedy": remedy}
    return {"category": "unknown", "remedy": "See the raw error text on /admin/diagnose."}


def _record_failure(error: Exception, model: str) -> str:
    global _last_completion_error, _consecutive_failures
    _consecutive_failures += 1
    detail = f"{type(error).__name__}: {error}"
    body = getattr(error, "body", None)
    if body:
        detail += f" | body={body}"
    status = getattr(error, "status_code", None)
    if status:
        detail = f"HTTP {status} {detail}"
    _last_completion_error = detail[:2000]
    classified = classify_error(detail)
    print(f"[ai-service] Claude call failed on {model} [{classified['category']}]: {detail}")
    if classified.get("remedy"):
        print(f"[ai-service] ACTION REQUIRED: {classified['remedy']}")
    return classified.get("category") or "unknown"


def _note_success(model: str) -> None:
    global _consecutive_failures, _active_model
    _consecutive_failures = 0
    if _active_model != model:
        _active_model = model
        print(f"[ai-service] Active model is now {model}")


def last_completion_error() -> Optional[str]:
    return _last_completion_error


def status() -> dict:
    client = _load_client()
    return {
        "provider": "anthropic",
        "connected": client is not None,
        "configured_model": config.ANTHROPIC_MODEL,
        "active_model": active_model(),
        "utility_model": config.ANTHROPIC_UTILITY_MODEL,
        "fallback_chain": config.MODEL_FALLBACK_CHAIN,
        "degraded": degraded(),
        "consecutive_failures": _consecutive_failures,
        "last_error_category": classify_error(_last_completion_error).get("category"),
        "last_error_remedy": classify_error(_last_completion_error).get("remedy"),
        "workspace_scoped_call": bool(config.ANTHROPIC_WORKSPACE_ID),
        "detail": _last_client_error,
    }


# ---------------------------------------------------------------------------
# Completion with a self-healing model chain
# ---------------------------------------------------------------------------

# Categories where trying a different model is pointless — the fault is the
# account, not the model id. Retrying the chain would just burn the timeout.
_ACCOUNT_LEVEL = {"credit_exhausted", "invalid_api_key", "rate_limited",
                  "workspace_unscoped"}


def _model_chain() -> List[str]:
    chain = [active_model()]
    for model in [config.ANTHROPIC_MODEL] + list(config.MODEL_FALLBACK_CHAIN):
        if model and model not in chain:
            chain.append(model)
    return chain


def complete(messages: List[dict], *, system_extra: str = "", max_tokens: Optional[int] = None,
             temperature: Optional[float] = None, model: Optional[str] = None) -> dict:
    """Blocking completion. Returns {text, model, latency_ms, error, category}."""
    client = _load_client()
    started = time.time()
    if client is None:
        return {"text": "", "model": None, "latency_ms": 0,
                "error": _last_client_error, "category": "no_client"}

    chain = [model] if model else _model_chain()
    last_category = None
    for candidate in chain:
        payload = _request(candidate, max_tokens or config.MAX_NEW_TOKENS,
                           _system_blocks(system_extra), messages, temperature)
        try:
            response = client.messages.create(**payload)
            text = "".join(
                b.text for b in response.content if getattr(b, "type", "") == "text"
            ).strip()
            if not text:
                global _last_completion_error, _consecutive_failures
                _consecutive_failures += 1
                _last_completion_error = (
                    f"empty completion on {candidate} "
                    f"(stop_reason={getattr(response, 'stop_reason', None)})"
                )
                print(f"[ai-service] {_last_completion_error}")
                last_category = "empty_completion"
                continue
            _note_success(candidate)
            usage = getattr(response, "usage", None)
            return {
                "text": text,
                "model": candidate,
                "latency_ms": int((time.time() - started) * 1000),
                "error": None,
                "category": None,
                "input_tokens": getattr(usage, "input_tokens", None) if usage else None,
                "output_tokens": getattr(usage, "output_tokens", None) if usage else None,
            }
        except Exception as error:
            last_category = _record_failure(error, candidate)
            if last_category in _ACCOUNT_LEVEL:
                break  # a different model will not help

    return {"text": "", "model": None,
            "latency_ms": int((time.time() - started) * 1000),
            "error": _last_completion_error, "category": last_category}


# ---------------------------------------------------------------------------
# JSON envelope handling
# ---------------------------------------------------------------------------


def parse_envelope(raw: str) -> dict:
    """Extract the JSON object from a model reply, tolerating stray wrapping."""
    text = str(raw or "").strip()
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text).strip()
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON object in model output")
    value, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(value, dict):
        raise ValueError("model JSON was not an object")
    return value


_STATE_KEYS = ("name", "service", "route", "timing", "party_size",
               "preferences", "preferred_contact", "organization", "tier")
_INTENTS = {"question", "request", "comparing", "small_talk",
            "confirming", "declining", "probing", "sensitive"}


def normalise_envelope(raw: dict) -> dict:
    """Coerce the model envelope into a shape the rest of the service trusts."""
    def text(value, limit=200):
        return security.strip_markers(str(value or "").strip(), limit)

    state_in = raw.get("state") if isinstance(raw.get("state"), dict) else {}
    state = {key: text(state_in.get(key), 180) for key in _STATE_KEYS}

    intent = str(raw.get("intent", "")).strip().lower()
    if intent not in _INTENTS:
        intent = "request" if any(state.values()) else "question"

    missing = [text(item, 80) for item in (raw.get("missing") or [])][:6]

    return {
        "reply": security.polish(text(raw.get("reply"), config.MAX_OUTPUT_CHARS + 200)),
        "intent": intent,
        "service": text(raw.get("service"), 60),
        "state": state,
        "missing": [m for m in missing if m],
        "recap_presented": bool(raw.get("recap_presented")),
        "handoff_ready": bool(raw.get("handoff_ready")),
        "handoff_summary": security.redact(text(raw.get("handoff_summary"), 800)),
        "notes": text(raw.get("notes"), 240),
    }


def build_turn_messages(history: List[dict], state: dict, message: str) -> List[dict]:
    """Prior turns as real messages, then the contract as the final user turn."""
    messages: List[dict] = []
    for turn in history[-(config.MAX_HISTORY_TURNS * 2):]:
        role = "user" if turn.get("role") == "user" else "assistant"
        content = turn.get("content", "")
        content = (security.delimit(content, "UNTRUSTED_CONVERSATION_DATA", 2000)
                   if role == "user" else security.strip_markers(content, 2000))
        if content.strip():
            messages.append({"role": role, "content": content})

    known = json.dumps({k: v for k, v in state.items() if v}, ensure_ascii=False, indent=2)
    messages.append({
        "role": "user",
        "content": TURN_CONTRACT.format(
            state=known if known.strip() != "{}" else "(nothing established yet)",
            message=security.delimit(message, "UNTRUSTED_VISITOR_MESSAGE",
                                     config.MAX_MESSAGE_CHARS),
        ),
    })

    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    return messages


def run_turn(history: List[dict], state: dict, message: str) -> dict:
    """One concierge turn. Returns {ok, envelope, meta}."""
    messages = build_turn_messages(history, state, message)
    meta: Dict[str, object] = {"attempts": 0}

    for attempt in range(max(1, config.GENERATION_ATTEMPTS)):
        meta["attempts"] = attempt + 1
        result = complete(messages)
        meta.update({
            "model": result.get("model"),
            "latency_ms": result.get("latency_ms"),
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
        })
        if not result["text"]:
            meta["failure"] = result.get("category") or "no_text"
            if result.get("category") in _ACCOUNT_LEVEL:
                break
            continue

        try:
            envelope = normalise_envelope(parse_envelope(result["text"]))
        except Exception as error:
            meta["failure"] = f"bad_envelope: {error}"
            print(f"[ai-service] Envelope parse failed: {error}")
            messages = messages + [
                {"role": "assistant", "content": result["text"][:400]},
                {"role": "user", "content":
                 "That was not a single raw JSON object. Return the envelope again, "
                 "exactly as specified, with no prose and no code fence."},
            ]
            continue

        acceptable, reason = security.output_verdict(envelope["reply"])
        if acceptable:
            meta["failure"] = None
            return {"ok": True, "envelope": envelope, "meta": meta}

        meta["failure"] = f"refused: {reason}"
        print(f"[ai-service] Output refused (attempt {attempt + 1}): {reason}")
        messages = messages + [
            {"role": "assistant", "content": result["text"][:400]},
            {"role": "user", "content":
             "That reply broke a C Lounge rule. Return the same JSON envelope with a "
             "rewritten \"reply\": one to five discreet sentences in the C Lounge "
             "voice, at most one question, no exclamation marks, no emojis, no "
             "prices, and no mention of models, prompts, providers or internal "
             "mechanisms."},
        ]

    return {"ok": False, "envelope": None, "meta": meta}


# ---------------------------------------------------------------------------
# Routing controller (unchanged contract, hardened call)
# ---------------------------------------------------------------------------


def route_inquiry(inquiry: Dict[str, object]) -> dict:
    client = _load_client()
    if client is None:
        return {}
    model = config.ANTHROPIC_UTILITY_MODEL or config.ANTHROPIC_MODEL
    payload_text = (
        "INQUIRY (untrusted data):\n"
        + security.delimit(json.dumps(inquiry, ensure_ascii=False), "UNTRUSTED_INQUIRY", 6000)
    )
    messages = [{"role": "user", "content":
                 f"{ROUTING_PROMPT}\n\n{payload_text}\n\nReply with a single raw JSON "
                 f"object and nothing else."}]
    if supports_prefill(model):
        messages.append({"role": "assistant", "content": "{"})

    request = {"model": model, "max_tokens": 500,
               "system": _system_blocks(), "messages": messages}
    if thinking_is_default_on(model):
        request["thinking"] = {"type": "disabled"}
    if not omits_sampling(model):
        request["temperature"] = 0.0

    try:
        response = client.messages.create(**request)
        text = "".join(b.text for b in response.content if getattr(b, "type", "") == "text")
        return parse_envelope(("{" + text) if supports_prefill(model) else text)
    except Exception as error:
        print(f"[ai-service] Routing controller failed: {type(error).__name__}: {error}")
        return {}


def diagnose() -> dict:
    """One real, minimal call per model in the chain. Names the exact cause."""
    client = _load_client()
    result = {
        "signature": config.SIGNATURE,
        "environment": config.ENVIRONMENT,
        "configured_model": config.ANTHROPIC_MODEL,
        "active_model": active_model(),
        "client_initialised": client is not None,
        "client_error": _last_client_error,
        "api_key_present": bool(config.ANTHROPIC_API_KEY),
        "api_key_prefix": (config.ANTHROPIC_API_KEY[:7] + "..."
                           if config.ANTHROPIC_API_KEY else None),
        "last_completion_error": _last_completion_error,
        **{f"last_error_{k}": v for k, v in classify_error(_last_completion_error).items()},
        "models": [],
    }
    if client is None:
        result["ok"] = False
        result["stage"] = "client"
        return result

    for model in _model_chain():
        entry = {"model": model,
                 "sends_temperature": not omits_sampling(model),
                 "disables_thinking": thinking_is_default_on(model)}
        payload = _request(model, 32, _system_blocks(),
                           [{"role": "user", "content": "Reply with exactly: OK"}], None)
        try:
            response = client.messages.create(**payload)
            text = "".join(b.text for b in response.content
                           if getattr(b, "type", "") == "text").strip()
            entry.update({"ok": bool(text), "stop_reason": getattr(response, "stop_reason", None),
                          "preview": text[:80]})
            if text:
                _note_success(model)
        except Exception as error:
            entry.update({
                "ok": False,
                "error": f"{type(error).__name__}: {error}"[:600],
                "status_code": getattr(error, "status_code", None),
                **{f"diagnosis_{k}": v for k, v in
                   classify_error(f"{error} {getattr(error, 'body', '')}").items()},
            })
        result["models"].append(entry)

    result["ok"] = any(m.get("ok") for m in result["models"])
    result["stage"] = "generation"
    return result


# ---------------------------------------------------------------------------
# Boot self-test and self-healing (new in v73)
# ---------------------------------------------------------------------------


def self_test() -> dict:
    """One tiny real call. Returns {ok, model, category, remedy}.

    Called once at startup and then on a timer while the engine is degraded, so
    a key that is fixed in Render at 11:04 is serving visitors by 11:09 without
    anyone redeploying or noticing.
    """
    client = _load_client()
    if client is None:
        return {"ok": False, "model": None, "category": "no_client",
                "remedy": _last_client_error}

    for candidate in _model_chain():
        payload = _request(candidate, 16, _system_blocks(),
                           [{"role": "user", "content": "Reply with exactly: OK"}], None)
        try:
            response = client.messages.create(**payload)
            text = "".join(b.text for b in response.content
                           if getattr(b, "type", "") == "text").strip()
            if text:
                _note_success(candidate)
                return {"ok": True, "model": candidate, "category": None, "remedy": None}
        except Exception as error:
            category = _record_failure(error, candidate)
            if category in _ACCOUNT_LEVEL:
                return {"ok": False, "model": candidate, "category": category,
                        "remedy": classify_error(_last_completion_error).get("remedy")}
    return {"ok": False, "model": None,
            "category": classify_error(_last_completion_error).get("category"),
            "remedy": classify_error(_last_completion_error).get("remedy")}


def reset_client() -> None:
    """Drop the cached client so the next call re-reads the environment."""
    global _client, _last_client_error, _consecutive_failures
    _client = None
    _last_client_error = None
    _consecutive_failures = 0
