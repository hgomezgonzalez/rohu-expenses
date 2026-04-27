"""CLI script to run bill payment reminders.
Called by Heroku Scheduler (not APScheduler) to ensure execution
even when the dyno is sleeping."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.jobs.notification_jobs import check_and_send_reminders


async def main():
    print("Running bill payment reminders...")
    sent = await check_and_send_reminders()
    print(f"Done. Sent {sent} notifications.")


if __name__ == "__main__":
    asyncio.run(main())
