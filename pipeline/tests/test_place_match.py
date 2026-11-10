"""Matching map places to Wikidata items, on made-up places only."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

from place_match import Candidate, distance_km, sole_match

LINE = [[10.0, 50.0], [11.0, 50.0], [12.0, 50.0]]


def test_one_nearby_candidate_is_a_match() -> None:
    assert sole_match(LINE, [Candidate("Q1", 11.0, 50.5)], 150) == "Q1"


def test_a_namesake_too_far_away_is_no_match() -> None:
    assert sole_match(LINE, [Candidate("Q1", 40.0, 10.0)], 150) is None


def test_of_two_nearby_candidates_the_one_with_an_article_wins() -> None:
    found = [Candidate("Q1", 11.0, 50.5), Candidate("Q2", 12.0, 50.5, has_article=True)]
    assert sole_match(LINE, found, 150) == "Q2"


def test_two_nearby_candidates_with_articles_leave_the_place_unmatched() -> None:
    found = [
        Candidate("Q1", 11.0, 50.5, has_article=True),
        Candidate("Q2", 12.0, 50.5, has_article=True),
    ]
    assert sole_match(LINE, found, 150) is None


def test_two_nearby_candidates_leave_the_place_unmatched() -> None:
    found = [Candidate("Q1", 11.0, 50.5), Candidate("Q2", 12.0, 50.5)]
    assert sole_match(LINE, found, 150) is None


def test_one_item_with_several_positions_is_still_one_match() -> None:
    found = [Candidate("Q1", 10.0, 50.1), Candidate("Q1", 12.0, 50.1)]
    assert sole_match(LINE, found, 150) == "Q1"


def test_only_the_near_one_counts_when_a_namesake_is_far() -> None:
    found = [Candidate("Q1", 11.0, 50.5), Candidate("Q2", 100.0, 0.0)]
    assert sole_match(LINE, found, 150) == "Q1"


def test_no_candidates_is_no_match() -> None:
    assert sole_match(LINE, [], 150) is None


def test_distance_is_about_111_km_per_degree() -> None:
    assert 110 < distance_km(0, 0, 0, 1) < 112
