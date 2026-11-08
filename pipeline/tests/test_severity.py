import re
from pathlib import Path

import pytest

from globe_pipeline.severity import SEVERITY_COLORS, Severity

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_levels_are_ordered() -> None:
    assert Severity.LOW < Severity.MODERATE < Severity.HIGH < Severity.CRITICAL


@pytest.mark.parametrize("label", ["low", " Moderate ", "HIGH", "critical"])
def test_from_label_round_trips(label: str) -> None:
    level = Severity.from_label(label)
    assert level.label == label.strip().lower()


def test_from_label_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="Unknown severity"):
        Severity.from_label("extreme")


def test_every_level_has_a_color() -> None:
    assert set(SEVERITY_COLORS) == set(Severity)


def test_colors_match_docs_and_frontend() -> None:
    """The palette is defined in four places; they must agree."""
    docs = (REPO_ROOT / "docs" / "severity.md").read_text(encoding="utf-8")
    frontend = REPO_ROOT / "frontend" / "src"
    css = (frontend / "style.css").read_text(encoding="utf-8")
    styles = (frontend / "severity.ts").read_text(encoding="utf-8")
    for level, color in SEVERITY_COLORS.items():
        assert color.lower() in docs.lower(), f"{level.label} colour missing from docs"
        match = re.search(rf"--sev-{level.label}:\s*(#[0-9a-fA-F]{{6}})", css)
        assert match, f"--sev-{level.label} missing from style.css"
        plain = (REPO_ROOT / "frontend" / "public" / "news.css").read_text(encoding="utf-8")
        assert f"--sev-{level.label}: {SEVERITY_COLORS[level]}".lower() in plain.lower()
        assert match.group(1).lower() == color.lower()
        match = re.search(rf'\b{level.label}:\s*\{{[^}}]*color:\s*"(#[0-9a-fA-F]{{6}})"', styles)
        assert match, f"{level.label} missing from severity.ts"
        assert match.group(1).lower() == color.lower()
