"""Replay the official bundle with five frozen byte-for-byte region replacements."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys

ROOT = Path(__file__).resolve().parent.parent
ASAR_ENV = "DSH_ASAR"
ASAR_CANDIDATES = (
    Path("resources/app.asar"),
    Path("DeepSeek Harness.app/Contents/Resources/app.asar"),
    Path("/opt/DeepSeek Harness/resources/app.asar"),
    Path("/usr/lib/deepseek-harness/resources/app.asar"),
    Path(r"D:\dsh\resources\app.asar"),
    Path(r"C:\Program Files\DeepSeek Harness\resources\app.asar"),
)
ASAR = None  # resolved by resolve_asar(); --asar overrides it
ENTRY = "/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js"
OFFICIAL_NAME = b"@deepseek-ai/dsh-client-ui-model-selection"
LOCAL_NAME = b"dsh-model-picker-groups"
REGION = re.compile(rb"^\t+//#region ([^\r\n]+)\r?$", re.MULTILINE)
# Order is part of the upstream bundle contract. None means retain upstream bytes.
SPECS = (
    (b"partial-json.ts", None),
    (b"values/src/index.ts", None),
    (b"catalog.js", None),
    (b"directory.js", None),
    (b"service.js", None),
    (b"clsx", None),
    (b"dsh-css:", "css.js"),
    (b"provider-order.js", "provider-order.js"),
    (b"ModelSelect.js", "ModelSelect.js"),
    (b"locales.js", "locales.js"),
    (b"lib/types/client/index.js", "index-region.js"),
)
INDEX_TEMPLATE = b'''/**
 * Model picker groups, node half. Pure UI plugin: the empty apply exists so the
 * plugin appears in the host cordis.yml / Loader; the browser half ships via
 * exports["./client"], discovered through the package.json dsh.client declaration.
 */

/** Host plugin body - no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
'''
PACKAGE_TEMPLATE = b'''{
  "name": "dsh-model-picker-groups",
  "version": "0.1.0",
  "description": "Collapsible provider groups, always-on search and favourites for the DSH composer model picker.",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": {
      "default": "./lib/index.js"
    },
    "./client": {
      "default": "./lib/client.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "lib",
    "src",
    "scripts",
    "docs",
    "cordis.patch.yml",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md"
  ],
  "keywords": [
    "dsh",
    "dsh-plugin",
    "deepseek-harness",
    "model-picker"
  ],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "python scripts/build.py",
    "check": "python scripts/build.py --check"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/luoqiusang/dsh-model-picker-groups.git"
  },
  "homepage": "https://github.com/luoqiusang/dsh-model-picker-groups#readme",
  "bugs": {
    "url": "https://github.com/luoqiusang/dsh-model-picker-groups/issues"
  },
  "author": "luoqiusang",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-api-session-controller",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-commands",
        "@deepseek-ai/dsh-api-remotes"
      ],
      "platform": "web"
    }
  }
}
'''

PATCH_TEMPLATE = b'''- id: ui-model-selection
  disabled: true
- insert:
    - id: model-picker-groups
      name: dsh-model-picker-groups
'''


def resolve_asar(explicit=None):
    """Locate the DSH app.asar: --asar, then $DSH_ASAR, then well-known installs."""
    global ASAR
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    env = os.environ.get(ASAR_ENV)
    if env:
        candidates.append(Path(env))
    install = os.environ.get("DSH_INSTALL")
    if install:
        candidates.append(Path(install) / "resources" / "app.asar")
    candidates.extend(ASAR_CANDIDATES)
    for candidate in candidates:
        if candidate.is_file():
            ASAR = candidate
            return candidate
    tried = "\n  ".join(str(item) for item in candidates)
    sys.exit("ASAR not found. Pass --asar <path> or set %s. Tried:\n  %s" % (ASAR_ENV, tried))


def load_header(stream):
    head = stream.read(16)
    if len(head) != 16:
        sys.exit("ASAR: truncated 16-byte header")
    marker, pickle_size, str_size, json_size = struct.unpack("<IIII", head)
    base = 8 + pickle_size
    if (marker != 4 or str_size < json_size + 4
            or pickle_size < str_size + 4 or base < 16 + json_size):
        sys.exit("ASAR: invalid pickle/header sizes")
    raw = stream.read(json_size)
    if len(raw) != json_size:
        sys.exit("ASAR: truncated header JSON")
    header = json.loads(raw.decode("utf-8"))
    if not isinstance(header, dict) or not isinstance(header.get("files"), dict):
        sys.exit("ASAR: missing files index")
    return header, base


def index(header):
    entries = {}

    def walk(node, path):
        for name, child in node.get("files", {}).items():
            key = path + "/" + name
            if isinstance(child.get("files"), dict):
                walk(child, key)
            else:
                entries[key] = child

    walk(header, "")
    return entries


def read_official():
    resolve_asar()
    with open(ASAR, "rb") as stream:
        header, base = load_header(stream)
        entry = index(header).get(ENTRY)
        if entry is None or entry.get("unpacked") or "link" in entry:
            sys.exit("ASAR: packed bundle entry missing or unsupported: " + ENTRY)
        size = entry.get("size")
        try:
            offset = int(entry["offset"])
        except (KeyError, TypeError, ValueError):
            sys.exit("ASAR: invalid bundle entry offset")
        if type(size) is not int or size < 0 or offset < 0:
            sys.exit("ASAR: invalid bundle entry size/offset")
        stream.seek(base + offset)
        data = stream.read(size)
        if len(data) != size:
            sys.exit(f"ASAR: bundle size mismatch: entry={size}, read={len(data)}")
    print(f"OFFICIAL BUNDLE bytes={len(data)} sha256={hashlib.sha256(data).hexdigest()}")
    return data


def split_regions(data, origin):
    matches = list(REGION.finditer(data))
    if len(matches) != 11:
        sys.exit(f"{origin}: expected 11 regions, found {len(matches)}")
    labels = [match.group(1) for match in matches]
    for expected_position, (needle, _) in enumerate(SPECS):
        hits = [i for i, label in enumerate(labels) if needle in label]
        if len(hits) != 1:
            sys.exit(f"{origin}: label {needle!r} must match exactly once; found {len(hits)}")
        if hits[0] != expected_position:
            sys.exit(f"{origin}: unexpected region order for {needle!r}")
    chunks = [data[match.start():matches[i + 1].start() if i + 1 < len(matches) else len(data)]
              for i, match in enumerate(matches)]
    return data[:matches[0].start()], chunks


def emit():
    with open(ROOT / "lib/client.js", "rb") as stream:
        _, chunks = split_regions(stream.read(), "lib/client.js")
    (ROOT / "src").mkdir(parents=True, exist_ok=True)
    for (_, filename), chunk in zip(SPECS, chunks):
        if filename:
            with open(ROOT / "src" / filename, "wb") as stream:
                stream.write(chunk)
            print(f"EMIT src/{filename} bytes={len(chunk)}")


def build_client():
    prefix, chunks = split_regions(read_official(), "official bundle")
    for i, (needle, filename) in enumerate(SPECS):
        if filename:
            path = ROOT / "src" / filename
            with open(path, "rb") as stream:
                replacement = stream.read()
            matches = list(REGION.finditer(replacement))
            if len(matches) != 1 or matches[0].start() != 0 or needle not in matches[0].group(1):
                sys.exit(f"src/{filename}: expected exactly one matching region at byte 0")
            chunks[i] = replacement
    result = (prefix + b"".join(chunks)).replace(OFFICIAL_NAME, LOCAL_NAME)
    split_regions(result, "rebuilt bundle")
    return result


def check(rebuilt):
    with open(ROOT / "lib/client.js", "rb") as stream:
        current = stream.read()
    if rebuilt == current:
        print("CHECK PASS")
        return 0
    offset = next((i for i, (a, b) in enumerate(zip(rebuilt, current)) if a != b),
                  min(len(rebuilt), len(current)))
    start = max(0, offset - 80)
    end = offset + 81
    print(f"CHECK FAIL first difference offset={offset} (zero-based)")
    print(f"rebuilt bytes={len(rebuilt)} context[{start}:{min(end, len(rebuilt))}]={rebuilt[start:end]!r}")
    print(f"current bytes={len(current)} context[{start}:{min(end, len(current))}]={current[start:end]!r}")
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--emit", action="store_true", help="freeze five current regions into src")
    modes.add_argument("--check", action="store_true", help="compare replay with current client without writing")
    parser.add_argument("--asar", metavar="PATH", help="path to the DSH resources/app.asar (default: auto-detect)")
    args = parser.parse_args()
    resolve_asar(args.asar)
    if args.emit:
        emit()
        return 0
    rebuilt = build_client()
    if args.check:
        return check(rebuilt)
    (ROOT / "lib").mkdir(parents=True, exist_ok=True)
    for path, data in ((ROOT / "lib/client.js", rebuilt),
                       (ROOT / "lib/index.js", INDEX_TEMPLATE),
                       (ROOT / "package.json", PACKAGE_TEMPLATE),
                       (ROOT / "cordis.patch.yml", PATCH_TEMPLATE)):
        with open(path, "wb") as stream:
            stream.write(data)
        print(f"BUILD {path.relative_to(ROOT).as_posix()} bytes={len(data)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        sys.exit(f"ERROR: {exc}")
