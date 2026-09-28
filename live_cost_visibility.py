#!/usr/bin/env python3
"""Live cost-visibility check. Laboratory only.

A real model chooses the next call. One condition shows the price and the
remaining budget. The other describes the tiers and hides both. The budget
and the halt are ours. The choice is the model's.

Twelve calls maximum (six tasks, two conditions). Gemini Flash through the
estate vault. No key is printed. Nothing outside this folder is written.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/Users/gch2021/Dev/context-engine-studio/tools")
from vault import call  # noqa: E402

HERE = Path(__file__).resolve().parent
STATE = HERE / "live_cost_visibility_state.json"
REPORT = HERE / "LIVE_COST_VISIBILITY.md"

PROVIDER = "gemini"
MODEL = "gemini-3.8-flash"
BUDGET = 100
TASKS = 6
TIERS = {
    "compact": {"cost": 15, "blurb": "a short adequate job"},
    "standard": {"cost": 35, "blurb": "a solid job"},
    "exhaustive": {"cost": 90, "blurb": "a long job, only a little better than a solid one"},
}
SCHEMA = {
    "type": "object",
    "properties": {"tier": {"type": "string", "enum": ["compact", "standard", "exhaustive"]}},
    "required": ["tier"],
}


def choose(visible: bool, remaining: int, left: int) -> str:
    if visible:
        lines = "\n".join(
            f"- {name}: costs {spec['cost']} of the budget. {spec['blurb']}."
            for name, spec in TIERS.items()
        )
        user = (
            f"Remaining budget: {remaining}. Tasks still to do, including this one: {left}.\n"
            f"Tiers:\n{lines}\n"
            "Buy one tier for this task. Reply with the tier only."
        )
    else:
        lines = "\n".join(f"- {name}: {spec['blurb']}." for name, spec in TIERS.items())
        user = (
            f"Tasks still to do, including this one: {left}.\n"
            f"Tiers:\n{lines}\n"
            "Buy one tier for this task. Reply with the tier only."
        )
    raw = call(
        PROVIDER,
        MODEL,
        "You are buying the next unit of work. Answer with the schema only.",
        user,
        schema=SCHEMA,
        max_tokens=2048,
        retries=2,
    )
    if isinstance(raw, dict) and "tier" in raw:
        tier = raw["tier"]
    elif isinstance(raw, dict) and isinstance(raw.get("result"), dict):
        tier = raw["result"]["tier"]
    else:
        raise RuntimeError(f"unreadable choice: {type(raw).__name__}")
    if tier not in TIERS:
        raise RuntimeError(f"tier not allowed: {tier}")
    return tier


def run(visible: bool) -> dict:
    remaining = BUDGET
    burned = 0
    done = []
    halt = None
    for n in range(1, TASKS + 1):
        tier = choose(visible, remaining, TASKS - n + 1)
        cost = TIERS[tier]["cost"]
        if remaining < cost:
            halt = {
                "task": n,
                "attempted": tier,
                "cost": cost,
                "remaining_before": remaining,
                "burned": burned,
                "line": (
                    f"[HALTED] Task {n}, tried to buy {tier} at {cost}. "
                    f"Burned {burned}. Remaining {remaining}. "
                    f"A person must top up or close."
                ),
            }
            break
        remaining -= cost
        burned += cost
        done.append({"task": n, "tier": tier, "cost": cost, "remaining": remaining})
    return {
        "visible": visible,
        "model": f"{PROVIDER}/{MODEL}",
        "budget": BUDGET,
        "tasks_completed": len(done),
        "burned": burned,
        "remaining": remaining,
        "choices": done,
        "halt": halt,
    }


def main() -> None:
    visible = run(True)
    hidden = run(False)
    payload = {
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "Live model choices. Prior laboratory runs were scripted arithmetic.",
        "visible": visible,
        "hidden": hidden,
    }
    STATE.write_text(json.dumps(payload, indent=2) + "\n")
    halt_v = visible["halt"]["line"] if visible["halt"] else "Finished the six tasks."
    halt_h = hidden["halt"]["line"] if hidden["halt"] else "Finished the six tasks."
    REPORT.write_text(
        "\n".join(
            [
                "# Live cost visibility",
                "",
                f"Model: `{PROVIDER}/{MODEL}` through the estate vault. Budget {BUDGET}. Up to {TASKS} tasks.",
                "The model chose the tier. This script only deducted the price and halted when the next choice did not fit.",
                "Compact costs 15, standard 35, exhaustive 90. Exhaustive is only a little better than standard, and much more expensive.",
                "",
                "## Cost visible",
                "",
                f"Tasks completed: {visible['tasks_completed']}. Burned: {visible['burned']}. Remaining: {visible['remaining']}.",
                "Choices: " + ", ".join(c["tier"] for c in visible["choices"]),
                halt_v,
                "",
                "## Cost hidden",
                "",
                f"Tasks completed: {hidden['tasks_completed']}. Burned: {hidden['burned']}. Remaining: {hidden['remaining']}.",
                "Choices: " + ", ".join(c["tier"] for c in hidden["choices"]),
                halt_h,
                "",
                "Nothing outside this folder was written. The agent was not deleted.",
                "",
            ]
        )
    )
    print(REPORT.read_text())


if __name__ == "__main__":
    main()
