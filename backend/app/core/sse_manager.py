from collections import defaultdict

MAX_SSE_CONNECTIONS = 100
_counts: dict[str, int] = defaultdict(int)


def can_connect(campaign_id: str) -> bool:
    return _counts[campaign_id] < MAX_SSE_CONNECTIONS


def register(campaign_id: str) -> None:
    _counts[campaign_id] += 1


def unregister(campaign_id: str) -> None:
    if _counts[campaign_id] > 0:
        _counts[campaign_id] -= 1
