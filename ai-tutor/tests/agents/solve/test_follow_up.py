"""Tests for Smart Solver follow-up session helpers."""

from src.agents.solve.follow_up import (
    format_conversation_for_prompt,
    get_prior_output_dir,
    is_follow_up_session,
)


def test_is_follow_up_session_false_for_first_message():
    assert not is_follow_up_session([{"role": "user", "content": "Find OB"}])


def test_is_follow_up_session_true_after_first_answer():
    # Simulates: first question answered, then "give me steps for above".
    messages = [
        {"role": "user", "content": "Find OB in the diagram"},
        {"role": "assistant", "content": "OB = 5 cm using Pythagoras."},
        {"role": "user", "content": "can you give steps?"},
    ]
    assert is_follow_up_session(messages)


def test_format_conversation_includes_roles():
    text = format_conversation_for_prompt(
        [
            {"role": "user", "content": "Find OB"},
            {"role": "assistant", "content": "Answer here"},
        ]
    )
    assert "Student: Find OB" in text
    assert "Tutor: Answer here" in text


def test_get_prior_output_dir_from_last_assistant():
    messages = [
        {"role": "user", "content": "Q"},
        {"role": "assistant", "content": "A", "output_dir": "solve_20260101_120000"},
        {"role": "user", "content": "follow up"},
    ]
    assert get_prior_output_dir(messages) == "solve_20260101_120000"
