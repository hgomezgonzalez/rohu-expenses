"""CLI script to generate monthly income entries from active templates.
Called by Heroku Scheduler daily; the underlying job is a no-op except on
day 1 of the month, so it is safe to run at the same cadence as the
reminders job."""

import asyncio
import sys
import os
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.jobs.income_jobs import generate_monthly_income_entries


async def main():
    today = datetime.now(ZoneInfo("America/Bogota")).date()
    if today.day != 1:
        print(f"Skipped: today is {today.isoformat()}, monthly income runs only on day 1.")
        return
    print("Generating monthly income entries...")
    result = await generate_monthly_income_entries()
    print(f"Done. Generated {result['generated']}, skipped {result['skipped']}, users {result['users']}.")


if __name__ == "__main__":
    asyncio.run(main())
