"""Severity scale shared by every source.

The rules that assign a level to an event are documented in docs/severity.md and must stay
in sync with this module. Milestone 1 defines only the scale itself; the per-source rules
arrive in milestone 3.
"""

from enum import IntEnum


class Severity(IntEnum):
    """Four ordered severity levels. Higher value means more severe."""

    LOW = 1
    MODERATE = 2
    HIGH = 3
    CRITICAL = 4

    @property
    def label(self) -> str:
        """Lower-case name used in the published JSON, e.g. ``"moderate"``."""
        return self.name.lower()

    @classmethod
    def from_label(cls, label: str) -> "Severity":
        """Parse a level from its JSON label, ignoring case and surrounding spaces.

        Raises:
            ValueError: if the label is not one of the four levels.
        """
        try:
            return cls[label.strip().upper()]
        except KeyError:
            valid = ", ".join(level.label for level in cls)
            raise ValueError(f"Unknown severity {label!r}; expected one of: {valid}") from None


# Okabe-Ito colours, colourblind-safe. Keep in sync with docs/severity.md and
# frontend/src/style.css.
SEVERITY_COLORS: dict[Severity, str] = {
    Severity.LOW: "#56B4E9",
    Severity.MODERATE: "#F0E442",
    Severity.HIGH: "#E69F00",
    Severity.CRITICAL: "#D55E00",
}
