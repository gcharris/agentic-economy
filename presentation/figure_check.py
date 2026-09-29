#!/usr/bin/env python3
"""The figure check: every figure the presentation prints is compared with the raw record, in code.

Run by build.py before it writes index.html; exits 1 on any disagreement. Copy agents edit prose; this
script owns the numbers. Three kinds of check:

  1. CLAIMS   a regex over the templates whose captured figures must equal a value computed from
              output/ael_experiment_results.json, to the precision printed (half a unit in the last
              printed digit). A claim that no longer matches anything fails too, so the list cannot rot.
  2. SEEDED   figures known to be wrong (engine/docs/workflow/facts.md D1, D2, D6). One may appear only
              on a line that also prints its correction, as the provenance box does.
  3. RUNWAY 1 ENERGETIC_RUNWAY_EXPERIMENTS.md has no JSON; its derived figures are recomputed from the
              table's base figures, so the corrections in SEEDED are arithmetic, not typed-in literals.

    python3 figure_check.py              check the templates
    python3 figure_check.py --self-test  prove the check bites: the seeded figures are found in the source
                                         documents facts.md names, and a mutated template fails
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
TEMPLATES = ["index.template.html", "part2.template.html", "part3.template.html"]
RECORD = json.loads((ROOT / "output/ael_experiment_results.json").read_text())
B1 = RECORD["benchmark_1_coasean_boundary"]
B2 = RECORD["benchmark_2_epistemic_drift"]
B3 = RECORD["benchmark_3_door_integrity"]
ROWS = {"House staff": B1["house_staff"], "Coasean market": B1["coasean_market"], "Federated guild": B1["federated_guild"]}
UNCAL = [g["confidence"] for g in B2["history_uncalibrated"]]
CAL = [g["confidence"] for g in B2["history_calibrated"]]
WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "ten": 10, "twenty": 20, "sixty": 60, "twentieth": 20}

# Runway experiment 1 (ENERGETIC_RUNWAY_EXPERIMENTS.md table, lines 30-34): the base figures, and what they imply.
R1 = {"tasks_visible": 10, "tasks_hidden": 3, "burn_visible": 290.0, "burn_hidden": 270.0, "value_visible": 340.0, "value_hidden": 150.0}
R1_VALUE_GAIN = R1["value_visible"] - R1["value_hidden"]                                   # 190.0, not 210.0
R1_VALUE_GAIN_PCT = 100 * R1_VALUE_GAIN / R1["value_hidden"]                                # 126.7 %, not 140 %
R1_EFF_RATIO = (R1["value_visible"] / R1["burn_visible"]) / (R1["value_hidden"] / R1["burn_hidden"])  # 2.11, not 1.9
R1_TASK_RATIO = R1["tasks_visible"] / R1["tasks_hidden"]                                   # 3.33, not 2.3


def num(s):
    s = s.replace(",", "")
    return float(WORDS[s.lower()]) if s.lower() in WORDS else float(s)


def agrees(printed, value):
    """A printed figure agrees with the record if it is the record rounded to the digits printed."""
    decimals = len(printed.split(".")[1]) if "." in printed else 0
    return abs(num(printed) - value) <= 0.5 * 10 ** -decimals + 1e-9


# (name, regex, expected(match) -> list of values, one per captured group). Values in printed units.
def row_values(m):
    r = ROWS[m.group(1)]
    return [r["tasks_completed"], r["total_burned"], r["spent_on_coordination"], r.get("coordination_overhead_pct", 0.0), 100 * r["final_confidence"]]


CLAIMS = [
    ("benchmark 1 table (part2)",
     r"<tr><td>(House staff|Coasean market|Federated guild)</td><td>(\d+) / 15</td><td>(\d[\d,]*(?:\.\d+)?) cr</td><td>(\d[\d,]*(?:\.\d+)?) cr \((\d[\d,]*(?:\.\d+)?)%\)</td><td>(\d[\d,]*(?:\.\d+)?)%</td></tr>",
     row_values),
    ("benchmark 1 chart data (part3)",
     r"\{ name: '(House staff|Coasean market|Federated guild)', tasks: (\d+), burned: (\d[\d,]*(?:\.\d+)?), coord: (\d[\d,]*(?:\.\d+)?), coordPct: (\d[\d,]*(?:\.\d+)?), phi: (\d[\d,]*(?:\.\d+)?),",
     row_values),
    ("benchmark 1 halted flags (part3)",
     r"\{ name: '(House staff|Coasean market|Federated guild)'.*?halted: (true|false) \}",
     lambda m: [1.0 if ROWS[m.group(1)]["halted"] else 0.0]),
    ("the market's coordination share", r"(?:that|the JSON's) (\d[\d,]*(?:\.\d+)?)%", lambda m: [B1["coasean_market"]["coordination_overhead_pct"]]),
    ("the market's side ledger", r"(\d[\d,]*(?:\.\d+)?) spent on work and (\d[\d,]*(?:\.\d+)?) on coordination against (\d[\d,]*(?:\.\d+)?) burned",
     lambda m: [B1["coasean_market"]["spent_on_work"], B1["coasean_market"]["spent_on_coordination"], B1["coasean_market"]["total_burned"]]),
    ("the guild's phantom reclaim", r"“(\d[\d,]*(?:\.\d+)?) credits reclaimed”", lambda m: [B1["federated_guild"]["penny_reclaimed"]]),
    ("the guild's reserve", r"guild's (\d+)% reserve", lambda m: [100 * (1 - B1["federated_guild"]["total_burned"] / B1["initial_budget"])]),
    ("drift chart, uncalibrated (part3)", r"uncal: \[([\d., ]+)\]", lambda m: None),
    ("drift chart, calibrated (part3)", r"\bcal: \[([\d., ]+)\]", lambda m: None),
    ("drift caption", r"confidence fell to (\d[\d,]*(?:\.\d+)?)% by the (\w+) handover", lambda m: [100 * B2["final_confidence_uncalibrated"], B2["generations"]]),
    ("oracle calls", r"(\w+) oracle calls, (\w+) credits in all",
     lambda m: [sum(1 for g in B2["history_calibrated"] if g.get("calibrated")), B2["total_calibration_spend"]]),
    ("drift end label (part3)", r"y\((0\.\d+)\) \+ 4, '(\d[\d,]*(?:\.\d+)?)%'", lambda m: [B2["final_confidence_uncalibrated"], 100 * B2["final_confidence_uncalibrated"]]),
    ("drift aria label (part3)", r"uncalibrated falls to (\d[\d,]*(?:\.\d+)?) percent", lambda m: [100 * B2["final_confidence_uncalibrated"]]),
    ("engine test quote (part3)", r"'(\d[\d,]*(?:\.\d+)?), (\d[\d,]*(?:\.\d+)?), (\d[\d,]*(?:\.\d+)?) … (\d[\d,]*(?:\.\d+)?), to four decimals'", lambda m: [UNCAL[0], UNCAL[4], UNCAL[9], UNCAL[19]]),
    ("credits at the door", r"(\d[\d,]*(?:\.\d+)?) cr were still in the purse", lambda m: [B3["credits_at_door"]]),
    ("door benchmark, the JSON side", r"the raw JSON says (\d[\d,]*(?:\.\d+)?) and (\d[\d,]*(?:\.\d+)?)", lambda m: [B3["burned_before_door"], B3["post_approval_remaining_credits"]]),
]
LISTS = {"drift chart, uncalibrated (part3)": UNCAL, "drift chart, calibrated (part3)": CAL}

# Known-wrong figures (facts.md). Each may appear only on a line that also carries its correction.
SEEDED = [
    ("D1", r"\b33\.0\b", f"{B3['burned_before_door']:.1f}", "pre-door burn: the foundations table, not the JSON"),
    ("D1", r"\b467\.0\b", f"{B3['post_approval_remaining_credits']:.1f}", "post-approval runway: the foundations table, not the JSON"),
    ("D1", r"\b417\.0\b", f"{B3['post_approval_remaining_credits'] - B3['idle_burn_in_busy_polling']:.1f}", "busy-poll runway: no source in code or JSON"),
    ("D2", r"\b87\.2\s*%", f"{100 * UNCAL[4]:.1f}%", "gen 5 uncalibrated"),
    ("D2", r"\b76\.0\s*%", f"{100 * UNCAL[9]:.1f}%", "gen 10 uncalibrated"),
    ("D2", r"\b65\.5\s*%", f"{100 * UNCAL[14]:.1f}%", "gen 15 uncalibrated"),
    ("D6", r"\+210\b|\b210\.0\b", f"{R1_VALUE_GAIN:.0f}", "340 - 150"),
    ("D6", r"\+140\s*%", f"{R1_VALUE_GAIN_PCT:.1f}", "(340 - 150) / 150"),
    ("D6", r"\b1\.9\s*[x×]", f"{R1_EFF_RATIO:.2f}", "(340/290) / (150/270)"),
    ("D6", r"\b2\.3\s*[x×]", f"{R1_TASK_RATIO:.2f}", "10 tasks vs 3"),
]


def check_claims(texts):
    errors = []
    for name, rx, expect in CLAIMS:
        hits = [(f, m) for f, t in texts.items() for m in re.finditer(rx, t)]
        if not hits:
            errors.append(f"claim '{name}' matches nothing: the copy moved; update the regex in figure_check.py, do not delete the claim")
        for f, m in hits:
            if name in LISTS:
                printed, values = [s.strip() for s in m.group(1).split(",")], LISTS[name]
                if len(printed) != len(values):
                    errors.append(f"{f}: {name}: {len(printed)} values, the record has {len(values)}")
                    continue
            else:
                printed, values = list(m.groups()), expect(m)
                if name == "benchmark 1 halted flags (part3)":
                    printed = ["1" if printed[1] == "true" else "0"]
                elif name in ("benchmark 1 table (part2)", "benchmark 1 chart data (part3)"):
                    printed = printed[1:]
            for i, (p, v) in enumerate(zip(printed, values)):
                if not agrees(p, v):
                    line = f.split(":")[0]
                    errors.append(f"{line}:{texts[f][:m.start()].count(chr(10)) + 1}: {name}: prints {p}, the record says {v:g}")
    return errors


def check_seeded(texts, require_correction=True):
    found, errors = [], []
    for f, t in texts.items():
        for n, line in enumerate(t.splitlines(), 1):
            for d, rx, correction, what in SEEDED:
                if re.search(rx, line):
                    found.append((d, f, n))
                    if require_correction and correction not in line:
                        errors.append(f"{f}:{n}: {d} {what}: prints {re.search(rx, line).group(0).strip()!r} without its correction {correction!r}")
    return found, errors


def check_runway_arithmetic():
    """The derived runway figures, recomputed; facts.md D6 states them and this keeps the two in step."""
    want = {"value gain": (R1_VALUE_GAIN, 190.0), "value gain %": (round(R1_VALUE_GAIN_PCT, 1), 126.7),
            "efficiency ratio": (round(R1_EFF_RATIO, 2), 2.11), "task ratio": (round(R1_TASK_RATIO, 2), 3.33)}
    return [f"runway 1 {k}: computed {a}, facts.md says {b}" for k, (a, b) in want.items() if a != b]


def run(texts):
    errors = check_claims(texts) + check_seeded(texts)[1] + check_runway_arithmetic()
    return errors


def self_test():
    ok = True
    # 1. The seeded figures are really in the documents facts.md says carry them.
    sources = {p: (ROOT / p).read_text() for p in ["AGENTIC_ECONOMY_FOUNDATIONS.md", "ENERGETIC_RUNWAY_EXPERIMENTS.md"]}
    found, errors = check_seeded(sources)
    seeds_hit = {(d, rx) for d, rx, *_ in SEEDED for dd, f, n in found if dd == d and re.search(rx, sources[f].splitlines()[n - 1])}
    missed = [(d, rx) for d, rx, *_ in SEEDED if (d, rx) not in seeds_hit]
    print(f"self-test: {len(seeds_hit)}/{len(SEEDED)} seeded figures found in the source documents, {len(errors)} flagged")
    if missed or not errors:
        ok = False
        print(f"  FAIL: seeds not found in the sources: {missed}")
    # 2. The clean templates pass; each mutation of a printed figure fails.
    texts = {f: (HERE / f).read_text() for f in TEMPLATES}
    if run(texts):
        ok = False
        print("  FAIL: the templates do not pass as they stand")
    mutations = [("part2.template.html", "confidence fell to 56.4%", "confidence fell to 57.4%"),
                 ("part2.template.html", "<td>788.2 cr</td>", "<td>788.4 cr</td>"),
                 ("part3.template.html", "0.8866, 0.8342", "0.8872, 0.8342"),
                 ("part2.template.html", "440.0 cr were still", "467.0 cr were still"),
                 ("part2.template.html", "the raw JSON says 60.0 and 430.0", "the raw JSON says 33.0 and 430.0"),
                 ("part3.template.html", "else boot();", "else boot(); // Visible is 1.9x more efficient")]
    for f, a, b in mutations:
        if a not in texts[f]:
            ok = False
            print(f"  FAIL: mutation anchor {a!r} not in {f}")
            continue
        errs = run({**texts, f: texts[f].replace(a, b, 1)})
        print(f"  mutation {b!r}: {'caught' if errs else 'MISSED'}")
        ok &= bool(errs)
    print("self-test:", "ok" if ok else "FAILED")
    return ok


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    errors = run({f: (HERE / f).read_text() for f in TEMPLATES})
    for e in errors:
        print("figure check:", e, file=sys.stderr)
    if errors:
        sys.exit(1)
    print(f"figure check: {len(CLAIMS)} claims agree with output/ael_experiment_results.json; no seeded figure without its correction")
