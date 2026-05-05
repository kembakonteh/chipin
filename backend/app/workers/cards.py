"""
Viral-growth card generation:
  generate_share_card()    — 1080×1080 milestone PNG (4 campaign-type designs)
  generate_qr_card()       — A5 PNG + optional PDF collection card
  generate_milestone_card  — ARQ task: generate → R2 → Redis cache → WhatsApp
"""

import asyncio
import base64
import io
import logging
import random
import uuid
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.r2 import upload_bytes
from app.core.redis_client import get_redis
from app.models.campaign import Campaign
from app.models.contributor import Contributor
from app.models.user import User

logger = logging.getLogger(__name__)

_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"

# Campaign-type palette: (bg_hex, text_hex, accent_hex)
_TYPE_PALETTE = {
    "general":     ("#0a110a", "#FFFFFF", "#52C47C"),
    "memorial":    ("#0f1729", "#EEE8D5", "#8BA7C9"),
    "charity":     ("#1a0f00", "#FFD700", "#FFB300"),
    "celebration": ("#1E5F3A", "#FFFFFF", "#A8FFCC"),
}


def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _font(name: str, size: int):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(str(_FONTS_DIR / name), size)
    except Exception:
        return ImageFont.load_default()


def _rounded_rect(draw, xy, radius: int, fill) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


# ---------------------------------------------------------------------------
# Share card — 1080×1080
# ---------------------------------------------------------------------------

def generate_share_card(
    *,
    title: str,
    emoji: str,
    campaign_type: str,
    milestone_pct: int,
    total_raised: float,
    currency: str,
    goal_amount: float,
    paid_count: int,
) -> bytes:
    """Return raw PNG bytes for a 1080×1080 milestone share card."""
    from PIL import Image, ImageDraw

    W, H = 1080, 1080
    bg_hex, txt_hex, acc_hex = _TYPE_PALETTE.get(campaign_type, _TYPE_PALETTE["general"])

    img = Image.new("RGB", (W, H), _hex_rgb(bg_hex))
    draw = ImageDraw.Draw(img)

    if campaign_type == "celebration":
        # Vertical gradient #2D6A4F → #40916C
        for y in range(H):
            t = y / H
            r = int(45 + (64 - 45) * t)
            g = int(106 + (145 - 106) * t)
            b = int(79 + (108 - 79) * t)
            draw.line([(0, y), (W, y)], fill=(r, g, b))
        rng = random.Random(7)
        confetti = ["#FFD700", "#FF6B6B", "#4FC3F7", "#FFFFFF", "#A8FFCC", "#FF9FF3"]
        for _ in range(70):
            cx, cy = rng.randint(0, W), rng.randint(0, H)
            r_size = rng.randint(4, 14)
            draw.ellipse(
                (cx - r_size, cy - r_size, cx + r_size, cy + r_size),
                fill=rng.choice(confetti),
            )

    f_emoji = _font("Roboto-Bold.ttf", 76)
    f_title = _font("Roboto-Bold.ttf", 50)
    f_pct   = _font("Roboto-Bold.ttf", 210)
    f_label = _font("Roboto-Regular.ttf", 34)
    f_stat  = _font("Roboto-Bold.ttf", 42)
    f_cta   = _font("Roboto-Regular.ttf", 30)

    # Emoji
    y = 80
    draw.text((W // 2, y), emoji, font=f_emoji, fill=txt_hex, anchor="mt")
    y += 108

    # Title (truncate)
    t_display = title if len(title) <= 30 else title[:28] + "…"
    draw.text((W // 2, y), t_display, font=f_title, fill=txt_hex, anchor="mt")
    y += 90

    # Thin separator
    sep_color = (*_hex_rgb(acc_hex), 80)
    draw.line([(160, y), (W - 160, y)], fill=acc_hex, width=2)
    y += 30

    # Large percentage
    pct_text = f"{milestone_pct}%"
    draw.text((W // 2, y), pct_text, font=f_pct, fill=acc_hex, anchor="mt")
    y += 230

    draw.text((W // 2, y), "funded", font=f_label, fill=txt_hex, anchor="mt")
    y += 60

    draw.line([(80, y), (W - 80, y)], fill=acc_hex, width=2)
    y += 36

    # Stats row
    amount_fmt = f"{currency} {total_raised:,.2f}"
    draw.text((W // 4, y), amount_fmt, font=f_stat, fill=txt_hex, anchor="mt")
    draw.text((W // 4, y + 50), "raised", font=f_label, fill=txt_hex, anchor="mt")

    draw.text((3 * W // 4, y), str(paid_count), font=f_stat, fill=txt_hex, anchor="mt")
    draw.text((3 * W // 4, y + 50), "paid", font=f_label, fill=txt_hex, anchor="mt")
    y += 120

    # Progress bar
    bar_x0, bar_x1 = 80, W - 80
    bar_h = 18
    _rounded_rect(draw, (bar_x0, y, bar_x1, y + bar_h), radius=9, fill=(60, 80, 60))
    bar_filled = int((bar_x1 - bar_x0) * min(milestone_pct / 100, 1.0))
    if bar_filled > 0:
        _rounded_rect(
            draw, (bar_x0, y, bar_x0 + bar_filled, y + bar_h),
            radius=9, fill=_hex_rgb(acc_hex),
        )
    y += 50

    # CTA
    draw.text((W // 2, y), "Chip in at chipin.kafotech.io", font=f_cta, fill=txt_hex, anchor="mt")
    y += 48
    draw.text((W // 2, y), "ChipIn · Made with ♥ by KafoTech", font=f_cta, fill=txt_hex, anchor="mt")

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# QR collection card — A5 (1748×2480 @ 300 dpi)
# ---------------------------------------------------------------------------

def generate_qr_card(
    *,
    title: str,
    emoji: str,
    slug: str,
    campaign_url: str,
    as_pdf: bool = False,
) -> bytes:
    """Return A5 PNG bytes (or PDF bytes when as_pdf=True)."""
    import qrcode
    import qrcode.constants
    from PIL import Image, ImageDraw

    W, H = 1748, 2480

    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Brand header
    draw.rectangle((0, 0, W, 240), fill=_hex_rgb("#2D6A4F"))
    f_brand   = _font("Roboto-Bold.ttf", 84)
    f_tagline = _font("Roboto-Regular.ttf", 40)
    draw.text((W // 2, 44), "ChipIn", font=f_brand, fill=(255, 255, 255), anchor="mt")
    draw.text((W // 2, 152), "Group contributions, made simple", font=f_tagline, fill=(180, 230, 200), anchor="mt")

    # Emoji + title
    f_emoji    = _font("Roboto-Bold.ttf", 148)
    f_title    = _font("Roboto-Bold.ttf", 96)
    f_subtitle = _font("Roboto-Regular.ttf", 56)

    y = 300
    draw.text((W // 2, y), emoji, font=f_emoji, fill="#2D6A4F", anchor="mt")
    y += 185
    t_display = title if len(title) <= 26 else title[:24] + "…"
    draw.text((W // 2, y), t_display, font=f_title, fill="#1a2e1a", anchor="mt")
    y += 130
    draw.text((W // 2, y), "Scan to chip in", font=f_subtitle, fill="#40916C", anchor="mt")
    y += 90

    # QR code
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=2,
    )
    qr.add_data(campaign_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#1a2e1a", back_color="white").convert("RGB")

    qr_size = 940
    qr_img = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    qr_x = (W - qr_size) // 2
    img.paste(qr_img, (qr_x, y))
    y += qr_size + 70

    # URL
    f_url   = _font("Roboto-Regular.ttf", 50)
    f_small = _font("Roboto-Regular.ttf", 38)
    draw.text((W // 2, y), campaign_url, font=f_url, fill="#2D6A4F", anchor="mt")
    y += 100

    draw.line([(120, y), (W - 120, y)], fill=(200, 220, 200), width=3)
    y += 44
    draw.text(
        (W // 2, y),
        "chipin.kafotech.io  ·  Print and display at collection points",
        font=f_small, fill="#999999", anchor="mt",
    )

    if not as_pdf:
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    # PDF via reportlab
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas

    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")
    png_buf.seek(0)

    pdf_buf = io.BytesIO()
    c = rl_canvas.Canvas(pdf_buf, pagesize=A5)
    pw, ph = A5
    c.drawImage(ImageReader(png_buf), 0, 0, width=pw, height=ph, preserveAspectRatio=False)
    c.save()
    return pdf_buf.getvalue()


# ---------------------------------------------------------------------------
# ARQ task — generate, upload, cache, notify
# ---------------------------------------------------------------------------

async def generate_milestone_card(ctx: dict, *, campaign_id: str, milestone_pct: int) -> None:
    """Generate a milestone share card, upload to R2, cache in Redis, WhatsApp to organiser."""
    async with AsyncSessionLocal() as db:
        campaign = await db.get(Campaign, uuid.UUID(campaign_id))
        if not campaign:
            logger.warning("generate_milestone_card: campaign %s not found", campaign_id)
            return

        total_result = await db.execute(
            select(func.sum(Contributor.amount)).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        total_raised: Decimal = total_result.scalar_one_or_none() or Decimal("0")

        paid_result = await db.execute(
            select(func.count()).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        paid_count = paid_result.scalar_one()

        owner = await db.get(User, campaign.owner_id)
        campaign_type = (
            campaign.campaign_type.value
            if hasattr(campaign.campaign_type, "value")
            else str(campaign.campaign_type)
        )

    # Generate in thread pool (CPU-bound Pillow work)
    png_bytes = await asyncio.to_thread(
        generate_share_card,
        title=campaign.title,
        emoji=campaign.emoji or "🎯",
        campaign_type=campaign_type,
        milestone_pct=milestone_pct,
        total_raised=float(total_raised),
        currency=campaign.currency,
        goal_amount=float(campaign.goal_amount),
        paid_count=paid_count,
    )

    # Cache base64 in Redis (TTL 10 min — serves the public endpoint if queried soon)
    redis = await get_redis()
    cache_key = f"chipin:sharecard:{campaign.slug}:{milestone_pct}"
    await redis.set(cache_key, base64.b64encode(png_bytes).decode(), ex=600)

    # Upload to R2 for a stable public URL
    r2_key = f"chipin/share-cards/{campaign_id}/{milestone_pct}.png"
    card_url = await upload_bytes(r2_key, png_bytes, "image/png")

    # Send WhatsApp image to organiser (non-template)
    if owner and owner.phone and card_url:
        from app.workers.whatsapp import send_image as _wa_image
        caption = (
            f"🎉 {milestone_pct}% funded! '{campaign.title}' has hit a milestone. "
            f"Share this card to keep the momentum going!"
        )
        await _wa_image(owner.phone, card_url, caption)

    logger.info(
        "Milestone card generated: campaign=%s milestone=%d%%",
        campaign.slug, milestone_pct,
    )
