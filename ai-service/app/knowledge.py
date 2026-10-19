# Made By Eng Nayer Nader
"""The C Lounge — authoritative product knowledge for the Private Concierge.

Why this file exists
--------------------
In v71 the concierge could not answer "what are the membership types?" — it
deflected with the same paragraph three times in a row (see the 06-09-2026
session screenshots). The answer was on the website the whole time: Signature,
Prive and Sovereign. The knowledge simply lived in `membership.html` where the
model could never reach it.

Everything below is transcribed from the live thecloungeworld.com copy. Nothing
here is invented. When the website copy changes, change it here in the same
commit — this file is the single source of truth the model is allowed to state
as fact.

RULE FOR EDITORS: never add a price, an availability claim, a partner name, a
supplier, an aircraft tail number or a testimonial to this file. The concierge
is permitted to state anything in here verbatim, so anything in here must be
true and safe to publish.
"""

from typing import Dict, List

BRAND = {
    "name": "The C Lounge",
    "tagline": "Beyond Access. Beyond Borders.",
    "positioning": (
        "A private concierge and aviation authority. Nine disciplines composed as one "
        "continuous operation, with one trusted desk accountable from brief to delivery."
    ),
    "headquarters": (
        "Villa 35 Mohamed Darwish, Ismailia Street, Kafr Abdou, Alexandria, Egypt"
    ),
    "reach": [
        "More than 1,000 airports",
        "45+ countries",
        "24/7 global desk",
        "One point of contact",
    ],
    # Who is who — keep these two roles separate so the concierge never
    # confuses them. Mohamed Nabil owns the company; Nayer Nader only built
    # the website and this AI system.
    "owner": "Mohamed Nabil",
    "owner_role": "CEO and Owner of The C Lounge",
    "engineer": "Nayer Nader",
    "engineer_role": "the engineer who built the C Lounge website and concierge AI (not the owner, not the CEO)",
    "desks": {
        "private": "Private@TheCLoungeWorld.com",
        "executive": "Executive@TheCLoungeWorld.com",
        "concierge": "Concierge@TheCLoungeWorld.com",
    },
}


# ---------------------------------------------------------------------------
# The nine disciplines
# ---------------------------------------------------------------------------

DISCIPLINES: List[Dict] = [
    {
        "id": "airport",
        "number": "01",
        "name": "Airport Meet & Assist",
        "summary": "Fast-track immigration, private terminals, more than 1,000 airports.",
        "detail": (
            "A fully personalised arrival, departure and transit experience. Liveried "
            "representatives meet you before immigration, escort you through private "
            "security and fast-track clearance, and deliver you to your vehicle."
        ),
        "capabilities": [
            "VIP and VVIP meet and assist",
            "Fast-track immigration and security",
            "Worldwide lounge access",
            "Private terminal (FBO) coordination",
            "Departure, arrival and transit handling",
            "24/7 airport concierge support",
        ],
        "intake": ["airport", "date", "arrival_or_departure", "party_size", "flight_details"],
        "desk": "CONCIERGE",
    },
    {
        "id": "aviation",
        "number": "02",
        "name": "Private Aviation",
        "summary": "Jets, helicopters, empty legs and global slot handling.",
        "detail": (
            "On-demand private jet and helicopter charter, arranged worldwide for planned "
            "and time-critical departures. The aviation desk compares the right aircraft "
            "for each mission — from light jets to heavy cabins — and coordinates ground "
            "handling."
        ),
        "capabilities": [
            "Private jet charter, worldwide",
            "Helicopter charter and urban transfers",
            "Empty-leg opportunities",
            "Group and executive charters",
            "Aircraft sourcing and comparison",
            "Airport slots and ground handling",
        ],
        "intake": ["route", "date", "party_size", "preferences"],
        "desk": "EXECUTIVE",
    },
    {
        "id": "ground",
        "number": "03",
        "name": "Luxury Ground Transportation",
        "summary": "Chauffeurs, executive fleets and discreet convoys.",
        "detail": (
            "Chauffeured mobility in hand-selected executive vehicles — Mercedes S-Class, "
            "BMW 7 Series, Range Rover and beyond. From airport to residence, from gala to "
            "boardroom."
        ),
        "capabilities": [
            "Professional chauffeur services",
            "Executive airport transfers",
            "Luxury fleet and vehicle rentals",
            "VIP event transportation",
            "Convoy and discreet security vehicles",
            "Corporate transportation solutions",
        ],
        "intake": ["city", "date", "pickup_and_drop", "party_size"],
        "desk": "CONCIERGE",
    },
    {
        "id": "accommodation",
        "number": "04",
        "name": "Luxury Accommodation",
        "summary": "Palace suites, private villas and branded residences.",
        "detail": (
            "Reservations at remarkable addresses — palace-level hotel suites, private "
            "villas and branded residences, arranged through the desk."
        ),
        "capabilities": [
            "Palace and suite reservations",
            "Private villa and residence sourcing",
            "Branded residences",
            "Extended stays",
        ],
        "intake": ["city", "dates", "party_size", "preferences"],
        "desk": "CONCIERGE",
    },
    {
        "id": "lifestyle",
        "number": "05",
        "name": "Concierge & Lifestyle Management",
        "summary": "Michelin reservations, private shopping, tailor-made requests.",
        "detail": (
            "Day-to-day lifestyle management handled by one desk: restaurants, private "
            "shopping, gifting, personal logistics and the requests that do not fit a "
            "category."
        ),
        "capabilities": [
            "Restaurant and Michelin reservations",
            "Private shopping and personal styling",
            "Gifting and personal logistics",
            "Tailor-made requests",
        ],
        "intake": ["what", "city", "date", "party_size"],
        "desk": "CONCIERGE",
    },
    {
        "id": "yacht",
        "number": "06",
        "name": "Yacht Charter & Marine",
        "summary": "Mediterranean and Red Sea crewed charters, private islands.",
        "detail": (
            "Crewed yacht charter across the Mediterranean and Red Sea, with private "
            "island access arranged through the marine desk."
        ),
        "capabilities": [
            "Crewed yacht charter",
            "Mediterranean and Red Sea itineraries",
            "Private island access",
            "Day charters and extended cruises",
        ],
        "intake": ["port_or_city", "dates", "party_size", "preferences"],
        "desk": "EXECUTIVE",
    },
    {
        "id": "events",
        "number": "07",
        "name": "Events, Access & Experiences",
        "summary": "F1, fashion weeks, galas and private concerts.",
        "detail": (
            "Access to events that are difficult to reach independently, arranged and "
            "confirmed by the desk."
        ),
        "capabilities": [
            "Motorsport and F1 access",
            "Fashion weeks",
            "Galas and private concerts",
            "Private experiences",
        ],
        "intake": ["event", "date", "party_size", "preferences"],
        "desk": "CONCIERGE",
    },
    {
        "id": "corporate",
        "number": "08",
        "name": "Corporate & Executive Travel",
        "summary": "Boards, family offices and multi-destination itineraries.",
        "detail": (
            "Coordinated travel for boards, executive teams and family offices, including "
            "multi-destination itineraries handled end to end."
        ),
        "capabilities": [
            "Board and executive team travel",
            "Family office coordination",
            "Multi-destination itineraries",
            "Group logistics",
        ],
        "intake": ["organization", "route", "dates", "party_size"],
        "desk": "EXECUTIVE",
    },
    {
        "id": "membership",
        "number": "09",
        "name": "Private Membership",
        "summary": "Signature, Prive and Sovereign — standing access, by invitation.",
        "detail": (
            "Membership is by application and invitation only. Each tier establishes a "
            "standing service relationship between the desk and your private office — "
            "designed for continuity, not one-off transactions."
        ),
        "capabilities": [
            "Three tiers: Signature, Prive, Sovereign",
            "Confidential application or private introduction",
            "One accountable desk across every discipline",
        ],
        "intake": ["tier_interest", "country", "scope"],
        "desk": "PRIVATE",
    },
]

DISCIPLINE_BY_ID = {d["id"]: d for d in DISCIPLINES}
DISCIPLINE_NAMES = [d["name"] for d in DISCIPLINES]


# ---------------------------------------------------------------------------
# Membership — the answer v71 could not give
# ---------------------------------------------------------------------------

MEMBERSHIP_TIERS: List[Dict] = [
    {
        "numeral": "I",
        "name": "Signature",
        "positioning": "The individual traveller.",
        "summary": (
            "Priority airport handling and a dedicated concierge line for the individual "
            "traveller."
        ),
        "includes": [
            "Priority airport coordination",
            "Dedicated concierge line",
            "Preferred chauffeur rates",
            "Lounge access on demand",
            "24/7 email desk",
        ],
        "fees": "Rates upon private consultation.",
    },
    {
        "numeral": "II",
        "name": "Prive",
        "positioning": "Private-world access for you and your family office.",
        "summary": (
            "Private-world access across aviation, lounges and lifestyle concierge for you "
            "and your family office."
        ),
        "includes": [
            "Everything in Signature",
            "Private jet and helicopter priority",
            "Family office lifestyle desk",
            "Events, access and experiences",
            "Yacht and accommodation priority",
            "Named senior concierge",
        ],
        "fees": "Rates upon private consultation.",
    },
    {
        "numeral": "III",
        "name": "Sovereign",
        "positioning": "A standing mandate for principals, executive teams and private offices.",
        "summary": (
            "A standing corporate mandate for principals, executive teams and private "
            "offices."
        ),
        "includes": [
            "Everything in Prive",
            "Priority security coordination",
            "Private ground movement planning",
            "Named account director",
            "Global contingency desk",
        ],
        "fees": "By private consultation only.",
    },
]

MEMBERSHIP_FAQ: List[Dict] = [
    {
        "q": "How does membership begin?",
        "a": (
            "Every relationship begins with a confidential application or a private "
            "introduction. The desk reviews the required level of support, geographic scope "
            "and preferred way of working before proposing the appropriate arrangement."
        ),
    },
    {
        "q": "What separates the three tiers?",
        "a": (
            "Signature is designed around individual travel support. Prive extends across "
            "family-office aviation and lifestyle requirements. Sovereign creates a standing "
            "mandate for principals, executive teams and complex global movement."
        ),
    },
    {
        "q": "Are fees published?",
        "a": (
            "No. Scope, usage and service structure differ for every member. Fees, supplier "
            "costs and any minimum commitments are stated privately and confirmed in writing "
            "before activation."
        ),
    },
    {
        "q": "Does membership guarantee every request?",
        "a": (
            "Membership creates priority, continuity and one accountable desk. Supplier "
            "availability, regulation and local conditions still apply; the desk confirms "
            "what is secured before any commitment is treated as final."
        ),
    },
    {
        "q": "Can the arrangement cover a family or office?",
        "a": (
            "Yes, where agreed. Prive and Sovereign can be structured around authorised "
            "travellers, family-office teams or executive groups with clear contact, "
            "approval and confidentiality protocols."
        ),
    },
    {
        "q": "How is discretion protected?",
        "a": (
            "Information is limited to the people and vetted suppliers required to fulfil a "
            "request. Sensitive details, authorised contacts and communication channels are "
            "agreed at the beginning of the relationship."
        ),
    },
]


# ---------------------------------------------------------------------------
# Compiled knowledge block injected into the system prompt
# ---------------------------------------------------------------------------


def _discipline_block() -> str:
    lines = []
    for d in DISCIPLINES:
        caps = "; ".join(d["capabilities"])
        lines.append(
            f"{d['number']} {d['name']} — {d['summary']}\n"
            f"    {d['detail']}\n"
            f"    Handles: {caps}\n"
            f"    Usually needs from the visitor: {', '.join(d['intake'])}\n"
            f"    Routed to: {d['desk']} desk"
        )
    return "\n".join(lines)


def _membership_block() -> str:
    lines = [
        "Membership is by application and invitation only. There are exactly three tiers.",
        "",
    ]
    for t in MEMBERSHIP_TIERS:
        lines.append(
            f"{t['numeral']}. {t['name']} — {t['positioning']}\n"
            f"    {t['summary']}\n"
            f"    Includes: {'; '.join(t['includes'])}\n"
            f"    Fees: {t['fees']}"
        )
    lines.append("")
    lines.append("Frequently resolved before a private consultation:")
    for item in MEMBERSHIP_FAQ:
        lines.append(f"  Q: {item['q']}\n  A: {item['a']}")
    return "\n".join(lines)


def knowledge_block() -> str:
    """The full factual brief handed to the model on every turn."""
    return f"""
C LOUNGE FACTS YOU MAY STATE (this is the only body of fact you may assert)

Brand
  {BRAND['name']} — {BRAND['tagline']}
  {BRAND['positioning']}
  Reach: {', '.join(BRAND['reach'])}
  Headquarters: {BRAND['headquarters']}
  CEO / Owner: {BRAND['owner']} — {BRAND['owner_role']}
  Engineer: {BRAND['engineer']} (Nayer) — {BRAND['engineer_role']}
  IMPORTANT: these are two different people with two different roles. Never
  call Nayer the owner, CEO or founder, and never call Mohamed Nabil the
  engineer or developer. If asked who owns or runs The C Lounge, the answer is
  Mohamed Nabil. No further biography exists for either — do not invent one.

THE NINE DISCIPLINES
{_discipline_block()}

PRIVATE MEMBERSHIP
{_membership_block()}

BOUNDARY OF FACT
Anything not written above is not a fact you may assert. Specifically you do not
know, and must never state or estimate: prices, rates, fees, availability,
aircraft or yacht names, hotel or supplier names, partners, member names,
testimonials, response times, or whether anything is booked or confirmed.
Those belong to the human desk. Say so plainly and offer to have the desk answer.
""".strip()
