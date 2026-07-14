#!/usr/bin/env python3
"""Editorial Dashboard (Phase 7) — the ONLY UI layer of Editorial OS.

Entrypoint: starts a small read-only HTTP server (Python stdlib only, no
new dependency, no framework) that serves the dashboard templates/static
assets, rendered from whatever JSON/YAML state Phase 1-6 already
produced on disk (see router.py's module docstring for exactly what is
and isn't read). This file — and everything it imports — never calls
CollectorPipeline, EditorialDesk, Workspace, or WorkerRunner.

Usage:
    python editorial-dashboard/app.py [--host 127.0.0.1] [--port 8877]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from router import make_server  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(prog="editorial-dashboard", description="Editorial OS Dashboard (Phase 7, read-only)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8877)
    args = parser.parse_args(argv)

    server = make_server(args.host, args.port)
    print(f"Editorial Dashboard: http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
