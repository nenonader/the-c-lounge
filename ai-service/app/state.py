# Made By Eng Nayer Nader
"""Session memory and the honest fallback for The C Lounge Private Concierge.

v71 put a 900-line regex slot-filler here and let it answer visitors whenever
Claude was unavailable. That is what produced every reply in the 06-09-2026
screenshots. The extractor mis-assigned slots ("4 persons in alexandria wgypt"
landed in `timing`), the intent matcher missed plural phrasings, and nothing
tracked what had already been said, so the same paragraph came back three turns
running.

v72 keeps this module small and gives it two honest jobs:

1. Hold session state and history in memory, bounded and TTL'd.
2. Provide a *seed* extraction — a conservative first guess handed to Claude as
   a hint, never used to drive a conversation on its own.

When Claude cannot answer, the concierge no longer improvises an intake. It says
so plainly and routes the visitor to the desk. A visitor who is told the truth
once is better served than one led through six scripted questions that produce a
garbled brief.
"""

import re
import time
from typing import Dict, List

from . import config, security

# ---------------------------------------------------------------------------
# Session store
# ---------------------------------------------------------------------------

HISTORY: Dict[str, List[dict]] = {}
STATE: Dict[str, dict] = {}
SESSION_TOUCHED: Dict[str, float] = {}
STRIKES: Dict[str, int] = {}

EMPTY_STATE = {
    "name": "", "service": "", "route": "", "timing": "", "party_size": "",
    "preferences": "", "preferred_contact": "", "organization": "", "tier": "",
    "recap_presented": False, "handoff_confirmed": False,
}


def prune() -> None:
    """Drop expired sessions, then the oldest if we are over the ceiling."""
    now = time.time()
    for session_id, touched in list(SESSION_TOUCHED.items()):
        if now - touched > config.SESSION_TTL_SECONDS:
            _forget(session_id)
    if len(SESSION_TOUCHED) > config.MAX_SESSIONS:
        oldest = sorted(SESSION_TOUCHED.items(), key=lambda kv: kv[1])
        for session_id, _ in oldest[: len(SESSION_TOUCHED) - config.MAX_SESSIONS]:
            _forget(session_id)


def _forget(session_id: str) -> None:
    HISTORY.pop(session_id, None)
    STATE.pop(session_id, None)
    STRIKES.pop(session_id, None)
    SESSION_TOUCHED.pop(session_id, None)


def touch(session_id: str) -> None:
    SESSION_TOUCHED[session_id] = time.time()


def history_for(session_id: str) -> List[dict]:
    touch(session_id)
    return HISTORY.setdefault(session_id, [])


def state_for(session_id: str) -> dict:
    touch(session_id)
    return STATE.setdefault(session_id, dict(EMPTY_STATE))


def push_turn(session_id: str, role: str, content: str) -> None:
    history = history_for(session_id)
    history.append({"role": role, "content": str(content or "")[:4000], "at": time.time()})
    del history[: max(0, len(history) - config.MAX_HISTORY_TURNS * 2)]


def merge_state(session_id: str, updates: dict) -> dict:
    """Apply Claude's extraction. Empty values never overwrite known ones."""
    current = state_for(session_id)
    for key, value in (updates or {}).items():
        if key not in EMPTY_STATE:
            continue
        if isinstance(EMPTY_STATE[key], bool):
            current[key] = bool(value) or current.get(key, False)
        elif str(value or "").strip():
            current[key] = clean_text(value, 180)
    return current


def add_strike(session_id: str) -> int:
    STRIKES[session_id] = STRIKES.get(session_id, 0) + 1
    return STRIKES[session_id]


def strikes(session_id: str) -> int:
    return STRIKES.get(session_id, 0)


def clean_text(value, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def conversation_text(history: List[dict], limit: int = 12) -> str:
    lines = []
    for turn in history[-limit:]:
        who = "Visitor" if turn.get("role") == "user" else "Concierge"
        lines.append(f"{who}: {clean_text(turn.get('content'), 500)}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Seed extraction — a hint for Claude, never a conversation driver
# ---------------------------------------------------------------------------

_SERVICE_HINTS = (
    ("Private Aviation", r"\b(jet|aviation|aircraft|charter a plane|flight|fly|helicopter|heli|empty leg)\b"),
    ("Yacht Charter & Marine", r"\b(yacht|yatch|yachet|boat|catamaran|marine|sail|cruise)\b"),
    ("Airport Meet & Assist", r"\b(airport|meet (?:and|&) assist|fast.?track|immigration|terminal|fbo|lounge access)\b"),
    ("Luxury Ground Transportation", r"\b(chauffeur|driver|car service|transfer|limousine|limo|convoy|fleet)\b"),
    ("Luxury Accommodation", r"\b(hotel|suite|villa|residence|accommodation|stay|resort)\b"),
    ("Events, Access & Experiences", r"\b(event|concert|gala|f1|formula one|fashion week|match|festival|ticket)\b"),
    ("Corporate & Executive Travel", r"\b(corporate|executive team|board|family office|business trip)\b"),
    ("Private Membership", r"\b(member|membership|signature|priv[eé]|sovereign|join|tier)\b"),
    ("Concierge & Lifestyle Management", r"\b(restaurant|reservation|table|michelin|shopping|gift|lifestyle)\b"),
)

_PARTY_RE = re.compile(
    r"\b(?:for\s+)?(\d{1,3})\s*(?:pax|persons?|people|guests?|passengers?|adults?|of us)\b|"
    r"\b(?:party|group)\s+of\s+(\d{1,3})\b", re.I)

# NOTE: every alternative ends on a word, never a space -- the `\s+` that
# follows does the separating. An earlier version wrote "name (?:of )?" and then
# required `\s+`, so "under name of nayer" needed two spaces to match and the
# name was silently dropped on the exact message that exposed this bug.
_NAME_RE = re.compile(
    r"\b(?:under\s+(?:the\s+)?name\s+(?:of)?|in\s+the\s+name\s+(?:of)?|"
    r"name\s+is|my\s+name(?:'s)?(?:\s+is)?|this\s+is|i\s+am|i'm|"
    r"book(?:ed|ing)?\s+(?:it\s+)?for|reserve(?:d)?\s+(?:it\s+)?for)"
    r"\s+([A-Za-z][A-Za-z'\-]{1,20}(?:\s+[A-Za-z][A-Za-z'\-]{1,20}){0,2})\b", re.I)

# Words that follow a name-introducing phrase but are plainly not a name. Without
# this "under name of nayer for 4 persons" yields the name "Nayer For".
_NOT_A_NAME = {
    "for", "with", "and", "on", "at", "in", "to", "from", "the", "a", "an",
    "please", "thanks", "thank", "looking", "interested", "trying", "here",
    "sure", "ok", "okay", "yes", "no", "we", "our", "my", "me", "us", "it",
    "tomorrow", "today", "tonight", "next", "this",
}

_TIMING_RE = re.compile(
    r"\b(today|tonight|tomorrow|tommorow|tomorow|day after tomorrow|"
    r"this (?:morning|afternoon|evening|weekend|week|month)|"
    r"next (?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"(?:on\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|"
    r"\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|"
    r"\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})\b", re.I)

# Common misspellings seen in real traffic. Normalised quietly, never corrected
# back at the visitor.
_TYPOS = {
    "wgypt": "Egypt", "egpyt": "Egypt", "eygpt": "Egypt",
    "tommorow": "tomorrow", "tomorow": "tomorrow", "tommorrow": "tomorrow",
    "alexandira": "Alexandria", "alexandira,": "Alexandria",
    "yatch": "yacht", "yachet": "yacht", "yaght": "yacht",
    "dubia": "Dubai", "londin": "London", "pariss": "Paris",
}


def normalise(text: str) -> str:
    out = str(text or "")
    for wrong, right in _TYPOS.items():
        out = re.sub(rf"\b{re.escape(wrong)}\b", right, out, flags=re.I)
    return out


def seed_extract(message: str) -> dict:
    """A conservative first pass. Only fields we are confident about."""
    text = normalise(message)
    seed = {}

    for name, pattern in _SERVICE_HINTS:
        if re.search(pattern, text, re.I):
            seed["service"] = name
            break

    party = _PARTY_RE.search(text)
    if party:
        seed["party_size"] = party.group(1) or party.group(2)

    timing = _TIMING_RE.search(text)
    if timing:
        seed["timing"] = timing.group(0)

    name = _NAME_RE.search(text)
    if name:
        words = [w for w in name.group(1).split() if w.lower() not in _NOT_A_NAME]
        if words:
            seed["name"] = " ".join(words[:3]).title()

    return {k: clean_text(v, 120) for k, v in seed.items() if v}


# ---------------------------------------------------------------------------
# Honest fallback — used only when Claude cannot answer at all
# ---------------------------------------------------------------------------

_DEGRADED_LINE = (
    "The private desk is handling this personally at the moment. Tell me what you "
    "would like arranged and I will make certain it reaches them \u2014 or place your "
    "brief directly and a member of the desk will respond to you in confidence."
)


def fallback_response(message: str, session_state: dict) -> str:
    """One honest holding reply. Never a scripted intake, never a fake answer.

    This deliberately does NOT try to run a conversation. v71 did, and the result
    was a bot that re-asked answered questions, echoed garbled recaps and gave
    the same paragraph three turns in a row. If the concierge cannot think, the
    right thing is to say so once and hand the visitor to a human.
    """
    if security.is_protected_request(message):
        return security.security_boundary_response()

    if not config.HONEST_FALLBACK:  # legacy behaviour, not recommended
        return _DEGRADED_LINE

    service = session_state.get("service") or seed_extract(message).get("service")
    if service:
        return (
            f"Understood \u2014 {service.lower()}. The private desk is coordinating "
            "personally just now, so let me place this with them directly rather than "
            "keep you waiting. Continue on WhatsApp or leave a private brief and they "
            "will come back to you in confidence."
        )
    return _DEGRADED_LINE
