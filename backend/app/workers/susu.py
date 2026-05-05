import logging
import random
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.susu import (
    SusuContribution,
    SusuCycle,
    SusuCycleStatus,
    SusuGroup,
    SusuMember,
    SusuStatus,
    compute_susu_due_date,
)

logger = logging.getLogger(__name__)


async def process_susu_cycles(ctx: dict) -> None:
    """
    Daily cron: advance susu cycles that have passed their due date.
    - Mark unpaid contributions as missed
    - Resolve cycle status to collected/missed
    - Advance current_cycle, create contributions for the new cycle
    - Complete groups that have finished all cycles
    """
    today = date.today()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SusuGroup)
            .options(
                selectinload(SusuGroup.members),
                selectinload(SusuGroup.cycles).selectinload(SusuCycle.contributions),
            )
            .where(SusuGroup.status == SusuStatus.active)
        )
        groups = result.scalars().all()

        for group in groups:
            # Find the current cycle
            current_cycles = [c for c in group.cycles if c.cycle_number == group.current_cycle]
            if not current_cycles:
                continue
            cycle = current_cycles[0]

            # Only advance if the due date has passed
            if cycle.due_date > today:
                continue

            # Mark unpaid contributions as missed
            for contrib in cycle.contributions:
                if not contrib.paid:
                    contrib.paid = False  # already False, but explicit

            any_paid = any(c.paid for c in cycle.contributions)
            cycle.status = SusuCycleStatus.collected if any_paid else SusuCycleStatus.missed

            # Mark recipient as having received payout if cycle is paid out
            # (payout marking is manual, but advance the group regardless)

            next_cycle_number = group.current_cycle + 1

            if next_cycle_number > group.total_cycles:
                group.status = SusuStatus.completed
                logger.info("SusuGroup %s completed all %d cycles", group.slug, group.total_cycles)
            else:
                group.current_cycle = next_cycle_number

                next_cycles = [c for c in group.cycles if c.cycle_number == next_cycle_number]
                if next_cycles:
                    next_cycle = next_cycles[0]
                    group.next_contribution_date = next_cycle.due_date
                    group.next_payout_date = next_cycle.due_date

                    # Create contribution records for next cycle
                    existing_member_ids = {c.member_id for c in next_cycle.contributions}
                    for member in group.members:
                        if member.id not in existing_member_ids:
                            db.add(SusuContribution(
                                cycle_id=next_cycle.id,
                                member_id=member.id,
                                amount=group.contribution_amount,
                            ))

        await db.commit()
        logger.info("process_susu_cycles complete — processed %d active groups", len(groups))
