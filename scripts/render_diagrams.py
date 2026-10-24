"""Render semua diagram Mermaid di docs/diagrams ke PDF.

Urutan strategi:
1. Pakai `mmdc` (@mermaid-js/mermaid-cli) bila tersedia — hasil paling andal dan offline-ready.
   `npm i -g @mermaid-js/mermaid-cli`
2. Fallback ke layanan mermaid.ink (butuh internet).

Jalankan: uv run python scripts/render_diagrams.py
"""

import base64
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "diagrams"
OUT = ROOT / "docs" / "export"
ENDPOINT = "https://mermaid.ink/pdf/"


def render_with_mmdc(source_file: Path, output_file: Path) -> bool:
    executable = shutil.which("mmdc")
    if executable is None:
        return False
    subprocess.run(
        [
            executable,
            "-i",
            str(source_file),
            "-o",
            str(output_file),
            "-b",
            "white",
            "-t",
            "default",
        ],
        check=True,
    )
    return True


def render_with_mermaid_ink(source_file: Path, output_file: Path) -> None:
    code = source_file.read_text(encoding="utf-8")
    payload = json.dumps(
        {
            "code": code,
            "mermaid": {"theme": "default", "themeVariables": {"fontFamily": "helvetica"}},
        }
    )
    encoded = base64.urlsafe_b64encode(payload.encode()).decode()
    req = urllib.request.Request(ENDPOINT + encoded, headers={"User-Agent": "procurement-docs/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
        data = resp.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError(f"Respons bukan PDF untuk {source_file.name}")
    output_file.write_bytes(data)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failures = 0
    for src in sorted(SRC.glob("*.mmd")):
        output = OUT / f"{src.stem}.pdf"
        try:
            if render_with_mmdc(src, output):
                print(f"OK  {src.name} -> {output.relative_to(ROOT)} (mmdc)")
            else:
                render_with_mermaid_ink(src, output)
                size = output.stat().st_size
                print(f"OK  {src.name} -> {output.relative_to(ROOT)} ({size} bytes, mermaid.ink)")
        except (
            urllib.error.URLError,
            RuntimeError,
            TimeoutError,
            subprocess.SubprocessError,
        ) as exc:
            failures += 1
            print(f"ERR {src.name}: {exc}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
