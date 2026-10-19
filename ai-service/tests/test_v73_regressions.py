# Made By Eng Nayer Nader
"""Regression tests for The C Lounge Private Concierge v73.

Each test here is written against the outage of 06-09-2026, in which the live
site served the honest holding reply to every visitor while /health reported
`"connected": true`. The cause was one line of configuration, but three
independent defects let it hide for days. All three are pinned below.

Run:  cd ai-service && python -m pytest tests -q
      (or: python tests/test_v73_regressions.py  for a dependency-free run)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import brain, config  # noqa: E402


# The verbatim Anthropic response that took the concierge down. Kept as a
# string literal so this test keeps meaning even if the SDK changes shape.
WORKSPACE_ERROR = (
    "HTTP 400 BadRequestError: Error code: 400 - {'type': 'error', 'error': "
    "{'type': 'invalid_request_error', 'message': 'This API key is not scoped "
    "to a workspace, so this request must include the anthropic-workspace-id "
    "header with the ID of the workspace to use. Add the header, or use an API "
    "key that is scoped to a workspace.'}}"
)


class TestOutageRootCause:
    """Defect 1 — the error was unclassifiable, so nothing named the cause."""

    def test_the_workspace_error_is_named_not_unknown(self):
        verdict = brain.classify_error(WORKSPACE_ERROR)
        assert verdict["category"] == "workspace_unscoped", verdict
        assert "workspace" in verdict["remedy"].lower()

    def test_the_remedy_points_at_the_key_not_at_the_code(self):
        remedy = brain.classify_error(WORKSPACE_ERROR)["remedy"]
        assert "ANTHROPIC_WORKSPACE_ID" in remedy
        assert "Nothing else in this project is at fault." in remedy

    def test_a_workspace_fault_stops_the_model_chain_immediately(self):
        """v72 retried four models twice per turn against an account-level
        fault: 24 doomed API calls for four visitor messages."""
        assert "workspace_unscoped" in brain._ACCOUNT_LEVEL

    def test_the_workspace_signature_outranks_the_api_key_signature(self):
        """The message contains the words "API key", which would otherwise be
        swallowed by the invalid_api_key rule and send the operator to the
        wrong remedy."""
        categories = [entry[0] for entry in brain._ERROR_SIGNATURES]
        assert categories.index("workspace_unscoped") < categories.index("invalid_api_key")


class TestSilentDegradation:
    """Defect 2 — an empty completion was recorded as category "unknown"."""

    def test_an_empty_completion_is_named(self):
        detail = "empty completion on claude-sonnet-5 (stop_reason=max_tokens)"
        assert brain.classify_error(detail)["category"] == "empty_completion"

    def test_every_recorded_category_carries_a_remedy(self):
        for category, needles, remedy in brain._ERROR_SIGNATURES:
            assert remedy and remedy.strip(), category
            assert needles, category


class TestHealthIsHonest:
    """Defect 3 — /health said "connected" because a key string existed."""

    def test_status_reports_whether_the_workspace_header_is_sent(self):
        assert "workspace_scoped_call" in brain.status()

    def test_status_carries_the_remedy_for_the_operator(self):
        assert "last_error_remedy" in brain.status()

    def test_a_self_test_entry_point_exists(self):
        """Startup now makes one real call instead of trusting a key string."""
        assert callable(brain.self_test)
        assert callable(brain.reset_client)


class TestAvailability:
    """The 15-minute sleep the visitor experienced as "the AI is off again"."""

    def test_keepalive_interval_sits_inside_renders_idle_window(self):
        assert 0 < config.KEEPALIVE_MINUTES * 60 < 15 * 60

    def test_keepalive_is_jittered(self):
        """Two services on identical timers drift into lockstep and then miss
        together. A jitter window breaks the correlation."""
        assert config.KEEPALIVE_JITTER_SECONDS > 0

    def test_self_heal_recovers_without_a_redeploy(self):
        assert 0 < config.SELF_HEAL_MINUTES * 60 <= 15 * 60


class TestModelChain:
    def test_the_configured_model_is_first_and_the_chain_has_a_cheap_floor(self):
        chain = brain._model_chain()
        assert chain[0] == brain.active_model()
        assert any("haiku" in model for model in chain), chain

    def test_no_duplicate_models_in_the_chain(self):
        chain = brain._model_chain()
        assert len(chain) == len(set(chain)), chain


def _run():
    failures = 0
    total = 0
    for cls in (TestOutageRootCause, TestSilentDegradation, TestHealthIsHonest,
                TestAvailability, TestModelChain):
        instance = cls()
        for name in sorted(n for n in dir(cls) if n.startswith("test_")):
            total += 1
            try:
                getattr(instance, name)()
                print(f"  PASS  {cls.__name__}.{name}")
            except Exception as error:
                failures += 1
                print(f"  FAIL  {cls.__name__}.{name}: {error}")
    print(f"\n{total - failures}/{total} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run() else 0)
