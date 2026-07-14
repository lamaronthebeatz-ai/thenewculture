"""Recommendations — section 7 (Recommendation Engine) output.

`related_articles` here means OTHER StoryCandidates already known to
Editorial Intelligence (from the same collection run/pool), NOT real
content/articles/*.md — this module has no access to and never reads
the actual site content, same independence rule as every other part of
Editorial Intelligence."""
from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class Recommendations:
    related_profiles: List[str] = field(default_factory=list)
    related_articles: List[str] = field(default_factory=list)  # other StoryCandidates' titles, not site articles
    related_series: List[str] = field(default_factory=list)
    internal_links: List[str] = field(default_factory=list)
