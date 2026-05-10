import json

from starlette.types import ASGIApp, Receive, Scope, Send

_1MB = 1 * 1024 * 1024

# Routes whose paths end with one of these suffixes carry file uploads and
# are exempt from the 1 MB body limit.
_UPLOAD_SUFFIXES = (
    "/beneficiary",     # POST/PATCH /api/v1/campaigns/{slug}/beneficiary
    "/logo",            # POST /api/v1/orgs/{slug}/logo
    "/import-csv",      # POST /api/v1/orgs/{slug}/members/import-csv
)


class LimitBodySizeMiddleware:
    """
    Reject HTTP requests whose body exceeds max_body bytes with 413.

    Two-stage check:
    1. Content-Length header — instant rejection before reading any bytes.
    2. Streaming buffer — accumulate chunks and reject if the running total
       exceeds the limit (catches clients that omit Content-Length).

    File-upload routes are exempt (matched by path suffix).
    """

    def __init__(self, app: ASGIApp, max_body: int = _1MB) -> None:
        self.app = app
        self.max_body = max_body

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if path.endswith(_UPLOAD_SUFFIXES):
            await self.app(scope, receive, send)
            return

        # --- Stage 1: Content-Length fast path ---
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > self.max_body:
                        await _send_413(send)
                        return
                except ValueError:
                    pass
                break

        # --- Stage 2: Buffer streaming body and check ---
        full_body = b""
        while True:
            message = await receive()
            if message.get("type") != "http.request":
                # Disconnect or other non-body event — pass through unchanged.
                break
            full_body += message.get("body", b"")
            if len(full_body) > self.max_body:
                await _send_413(send)
                return
            if not message.get("more_body", False):
                break

        # Replay the buffered body to the application.
        body_sent = False

        async def replay() -> dict:
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": full_body, "more_body": False}
            # Any subsequent receive call (e.g. disconnect) is forwarded live.
            return await receive()

        await self.app(scope, replay, send)


async def _send_413(send: Send) -> None:
    body = json.dumps(
        {"detail": "Request body too large. Maximum allowed size is 1 MB."}
    ).encode()
    await send({
        "type": "http.response.start",
        "status": 413,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body, "more_body": False})
