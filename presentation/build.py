#!/usr/bin/env python3
"""Assemble presentation/index.html from the template, the wasm engine and the recorded trace."""
import base64, json, pathlib, sys
here = pathlib.Path(__file__).parent
wasm = here.parent / "engine/target/wasm32-unknown-unknown/wasm/context_engine.wasm"
template = "".join((here / f).read_text() for f in ["index.template.html", "part2.template.html", "part3.template.html"])
b64 = base64.b64encode(wasm.read_bytes()).decode()
trace = (here / "trace.json").read_text() if (here / "trace.json").exists() else "null"
import subprocess
eng = here.parent / "engine"
loc = sum(int(l.split()[0]) for l in subprocess.run(["wc", "-l", *[str(p) for p in list((eng/"src").rglob("*.rs")) + list((eng/"tests").glob("*.rs"))]], capture_output=True, text=True).stdout.splitlines() if not l.strip().endswith("total"))
tests = sum(p.read_text().count("#[test]") + p.read_text().count("#[tokio::test") for p in list((eng/"src").rglob("*.rs")) + list((eng/"tests").glob("*.rs")))
out = (template.replace("/*__WASM_B64__*/", b64).replace("/*__TRACE_JSON__*/", trace)
       .replace("__LOC__", f"{loc:,}").replace("__TESTS__", str(tests)).replace("__WASM_KB__", str(round(wasm.stat().st_size/1024))))
(here / "index.html").write_text(out)
print(f"index.html: {len(out)/1024:.0f} KB (wasm {wasm.stat().st_size/1024:.0f} KB, trace {len(trace)/1024:.0f} KB)")
