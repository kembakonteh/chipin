from slowapi import Limiter
from starlette.requests import Request


def _real_client_ip(request: Request) -> str:
    """Extract the real client IP when running behind a reverse proxy like Traefik.

    Traefik sets X-Forwarded-For; fall back to X-Real-IP, then the direct connection.
    The leftmost value in X-Forwarded-For is always the originating client.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=_real_client_ip)
