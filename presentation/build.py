#!/usr/bin/env python3
"""Assemble presentation/index.html from the template, the wasm engine and the recorded trace."""
import base64, json, pathlib, sys
here = pathlib.Path(__file__).parent
dist = here.parent / "engine/dist/context_engine.wasm"
target = here.parent / "engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm"
wasm = dist if dist.exists() else target
if wasm == dist:  # the tracked artefact; say so if the crate has moved since it was built (an mtime check, so a fresh checkout may warn spuriously)
    crate = list((here.parent / "engine/src").rglob("*.rs")) + [here.parent / "engine/Cargo.toml"]
    newer = [p for p in crate + ([target] if target.exists() else []) if p.stat().st_mtime > dist.stat().st_mtime]
    if newer:
        print(f"warning: engine/dist/context_engine.wasm is older than {len(newer)} file(s) it should be built from (e.g. {newer[0].relative_to(here.parent)}); run `sh engine/build-wasm.sh` first or the page embeds a stale engine", file=sys.stderr)
template = "".join((here / f).read_text() for f in ["index.template.html", "part2.template.html", "part3.template.html"])
b64 = base64.b64encode(wasm.read_bytes()).decode()
trace = (here / "trace.json").read_text() if (here / "trace.json").exists() else "null"
import subprocess
eng = here.parent / "engine"
loc = sum(int(l.split()[0]) for l in subprocess.run(["wc", "-l", *[str(p) for p in list((eng/"src").rglob("*.rs")) + list((eng/"tests").glob("*.rs"))]], capture_output=True, text=True).stdout.splitlines() if not l.strip().endswith("total"))
import re
rs = list((eng/"src").rglob("*.rs")) + list((eng/"tests").glob("*.rs"))
attrs = sum(p.read_text().count("#[test]") + p.read_text().count("#[tokio::test") for p in rs)
ignored = sum(len(re.findall(r"^\s*#\[ignore", p.read_text(), re.M)) for p in rs)  # attribute lines only, not the doc comment that mentions them
tests = attrs - ignored  # what `cargo test` runs; the ignored ones are skipped on purpose
out = (template.replace("/*__WASM_B64__*/", b64).replace("/*__TRACE_JSON__*/", trace)
       .replace("__LOC__", f"{loc:,}").replace("__TESTS__", str(tests)).replace("__IGNORED__", str(ignored)).replace("__WASM_KB__", str(round(wasm.stat().st_size/1024))))
(here / "index.html").write_text(out)
print(f"index.html: {len(out)/1024:.0f} KB (wasm {wasm.stat().st_size/1024:.0f} KB, trace {len(trace)/1024:.0f} KB); tests {tests} run + {ignored} ignored")
