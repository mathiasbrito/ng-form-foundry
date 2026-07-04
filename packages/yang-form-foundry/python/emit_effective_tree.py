#!/usr/bin/env python3
"""Resolve a YANG module with pyang and emit the effective model as JSON.

This is the integration counterpart of the TypeScript ``SubprocessEngine``. It
uses pyang to parse and validate a module (resolving uses/augment/typedef/
groupings), then walks pyang's resolved child tree (``i_children``) and prints an
``EffectiveModel`` matching ``src/model.ts`` to stdout.

Requires pyang on the host: ``pip install pyang``. The JS unit tests do not run
this — they use ``FakeEngine`` — so treat the type coverage here as the v0.1
subset (container/list/leaf/leaf-list + common built-in types, keys, config,
default, mandatory, enumeration). Richer types (union/leafref/identityref/bits/…)
are emitted with their YANG base and refined in later phases.

Usage:
    emit_effective_tree.py --entry <module> --source <dir> [--path <dir> ...] \\
        [--datastore config|operational]
"""
import argparse
import json
import sys

from pyang import repository, context, statements


def resolved_base(type_stmt):
    """Follow typedefs to a built-in base type name."""
    spec = getattr(type_stmt, "i_type_spec", None)
    if spec is not None and getattr(spec, "name", None):
        return spec.name
    # Fall back to walking i_typedef chains, else the literal type argument.
    td = getattr(type_stmt, "i_typedef", None)
    while td is not None:
        inner = td.search_one("type")
        if inner is None:
            break
        nxt = getattr(inner, "i_typedef", None)
        if nxt is None:
            return inner.arg
        td = nxt
    return type_stmt.arg


def build_type(stmt):
    type_stmt = stmt.search_one("type")
    if type_stmt is None:
        return {"base": "string"}
    base = resolved_base(type_stmt)
    out = {"base": base}
    if base == "enumeration":
        out["enums"] = [e.arg for e in type_stmt.search("enum")]
    if base == "decimal64":
        fd = type_stmt.search_one("fraction-digits")
        if fd is not None:
            out["fractionDigits"] = int(fd.arg)
    return out


def module_name(stmt):
    mod = getattr(stmt, "i_module", None)
    return mod.i_modulename if mod is not None else stmt.main_module().arg


def is_config(stmt):
    # pyang sets i_config on data nodes after validation.
    val = getattr(stmt, "i_config", None)
    return True if val is None else bool(val)


def walk(stmt):
    kw = stmt.keyword
    common = {"name": stmt.arg, "module": module_name(stmt), "config": is_config(stmt)}

    if kw == "leaf":
        node = {"kind": "leaf", **common, "type": build_type(stmt)}
        if stmt.search_one("mandatory", "true") is not None:
            node["mandatory"] = True
        default = stmt.search_one("default")
        if default is not None:
            node["default"] = default.arg
        return node

    if kw == "leaf-list":
        node = {"kind": "leaf-list", **common, "type": build_type(stmt)}
        return node

    if kw == "container":
        node = {"kind": "container", **common, "children": walk_children(stmt)}
        if stmt.search_one("presence") is not None:
            node["presence"] = True
        return node

    if kw == "list":
        key = stmt.search_one("key")
        node = {
            "kind": "list",
            **common,
            "keys": key.arg.split() if key is not None else [],
            "children": walk_children(stmt),
        }
        return node

    return None  # choice/case/anydata/anyxml handled in later phases


def walk_children(stmt):
    out = []
    for child in getattr(stmt, "i_children", []):
        node = walk(child)
        if node is not None:
            out.append(node)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entry", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--path", action="append", default=[])
    ap.add_argument("--datastore", default="config", choices=["config", "operational"])
    args = ap.parse_args()

    repo = repository.FileRepository(":".join([args.source, *args.path]))
    ctx = context.Context(repo)
    module = ctx.search_module(0, args.entry)
    if module is None:
        with open_module(ctx, args.entry, args.source) as text:
            module = ctx.add_module(args.entry, text)
    statements.validate_module(ctx, module)
    if ctx.errors:
        for _pos, tag, arg in ctx.errors:
            print(f"pyang: {tag} {arg}", file=sys.stderr)
        sys.exit(1)

    roots = walk_children(module)
    if args.datastore == "config":
        roots = strip_state(roots)

    model = {
        "modules": [{"name": module.i_modulename, "namespace": namespace(module)}],
        "roots": roots,
    }
    json.dump(model, sys.stdout)


def strip_state(nodes):
    kept = []
    for n in nodes:
        if n.get("config") is False:
            continue
        if "children" in n:
            n["children"] = strip_state(n["children"])
        kept.append(n)
    return kept


def namespace(module):
    ns = module.search_one("namespace")
    return ns.arg if ns is not None else ""


def open_module(ctx, name, source):
    import glob
    import os
    from contextlib import contextmanager

    @contextmanager
    def _open():
        matches = glob.glob(os.path.join(source, f"{name}*.yang"))
        if not matches:
            print(f"module '{name}' not found in {source}", file=sys.stderr)
            sys.exit(1)
        with open(matches[0], "r", encoding="utf-8") as fh:
            yield fh.read()

    return _open()


if __name__ == "__main__":
    main()
