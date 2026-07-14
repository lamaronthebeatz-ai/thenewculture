"""DashboardStats — section 8 (Dashboard Data) output."""
from dataclasses import dataclass


@dataclass(frozen=True)
class DashboardStats:
    pending: int
    high_priority: int
    low_confidence: int
    duplicate: int
    published: int
    rejected: int
