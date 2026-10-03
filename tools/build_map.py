#!/usr/bin/env python3
"""
Build the world map for the supply chapter: docs/data/map.js.

  python tools/build_map.py

Reads tools/geo/countries-110m.json (Natural Earth 1:110m country boundaries, version 4.1.0, public domain, redistributed as TopoJSON by the
world-atlas package 2.0.2, ISC licence; see tools/geo/README.md). Projects it to Equal Earth in plain Python and writes plain SVG path text, so the browser
needs no map library. Writes the land (all countries as one path) and, for each country that copper_database/collected/usgs_country_iso.csv marks as
placeable, the point where its circle sits (the centre of its largest piece of land). Antarctica is left out.

Stops if a placeable country in the mapping table is not in the TopoJSON (matched by the three-digit UN M49 / ISO numeric code).
"""
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "geo" / "countries-110m.json"
ISO = ROOT / "copper_database" / "collected" / "usgs_country_iso.csv"
OUT = ROOT / "docs" / "data" / "map.js"

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
WIDTH = 1000.0


def equal_earth(lon, lat):
    """Equal Earth projection (Savric, Patterson, Jenny 2018), unit sphere; x to the right, y up."""
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(math.sqrt(3) / 2 * math.sin(phi))
    t2, t6 = th ** 2, th ** 6
    x = 2 * math.sqrt(3) * lam * math.cos(th) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = th * (A1 + A2 * t2 + A3 * t6 + A4 * t6 * t2)
    return x, y


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def ring_points(arcs, ring):
    pts = []
    for a in ring:
        seg = arcs[a] if a >= 0 else arcs[~a][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts


def polygons(arcs, geom):
    polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
    return [[ring_points(arcs, ring) for ring in poly] for poly in polys]


def main():
    topo = json.loads(SRC.read_text(encoding="utf-8"))
    arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]
    # projected extent over all land except Antarctica (id 010), to scale the drawing to a fixed width
    shapes = {}
    for g in geoms:
        gid = g.get("id")
        if gid == "010" or "arcs" not in g:
            continue
        shapes[gid or g["properties"]["name"]] = polygons(arcs, g)
    xs, ys = [], []
    for polys in shapes.values():
        for poly in polys:
            for ring in poly:
                for lon, lat in ring:
                    x, y = equal_earth(lon, lat)
                    xs.append(x)
                    ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = WIDTH / (x1 - x0)
    height = (y1 - y0) * k

    def proj(lon, lat):
        x, y = equal_earth(lon, lat)
        return round((x - x0) * k, 1), round((y1 - y) * k, 1)

    parts = []
    jumps = set()
    for key, polys in shapes.items():
        for poly in polys:
            for ring in poly:
                # a ring that crosses the antimeridian jumps from about +180 to -180: start a new piece there instead of drawing a line across the map
                pieces, cur = [], [ring[0]]
                for prev, pt in zip(ring, ring[1:]):
                    if abs(pt[0] - prev[0]) > 180:
                        pieces.append(cur)
                        cur = []
                        jumps.add(key)
                    cur.append(pt)
                pieces.append(cur)
                for piece in pieces:
                    pts = [proj(*p) for p in piece]
                    dedup = [pts[0]] + [p for i, p in enumerate(pts[1:], 1) if p != pts[i - 1]]
                    if len(dedup) < 3:
                        continue
                    parts.append("M" + "L".join(f"{x:g} {y:g}" for x, y in dedup) + "Z")
    print("rings split at the antimeridian:", sorted(jumps))
    land = "".join(parts)

    rows = list(csv.DictReader(ISO.open(encoding="utf-8")))
    points = {}
    for r in rows:
        if r["placeable"] != "1":
            continue
        code = r["m49"]
        if code not in shapes:
            raise SystemExit(f"{r['usgs_name']} ({code}) is in the mapping table but not in the TopoJSON")
        def unwrapped(ring):
            # a ring that crosses the antimeridian (Russia, Fiji) is shifted by 360 degrees for the centroid, so it stays in one piece
            if any(abs(q[0] - p0[0]) > 180 for p0, q in zip(ring, ring[1:])):
                return [(lon + 360 if lon < 0 else lon, lat) for lon, lat in ring]
            return ring

        def signed_area(ring):
            pts = [proj(*q) for q in unwrapped(ring)]
            return sum(xa * yb - xb * ya for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1])) / 2

        best = max(shapes[code], key=lambda poly: abs(signed_area(poly[0])))
        ring = [proj(*q) for q in unwrapped(best[0])]
        # centre of the largest piece of land: area-weighted centroid of its outer ring, in the projected plane
        a = cx = cy = 0.0
        for (xa, ya), (xb, yb) in zip(ring, ring[1:] + ring[:1]):
            c = xa * yb - xb * ya
            a += c
            cx += (xa + xb) * c
            cy += (ya + yb) * c
        points[r["iso_a3"]] = [round(cx / (3 * a), 1), round(cy / (3 * a), 1)]

    payload = {"_meta": {"page": "map", "projection": "Equal Earth", "source": "Natural Earth 1:110m admin 0 countries (public domain) via world-atlas 2.0.2 (ISC)"},
               "viewBox": [0, 0, int(WIDTH), int(math.ceil(height))], "land": land, "points": points}
    OUT.write_text("// Generated by tools/build_map.py from tools/geo/countries-110m.json. Do not edit by hand.\n"
                   "window.CMA_DATA = window.CMA_DATA || {};\n"
                   "window.CMA_DATA.map = " + json.dumps(payload, separators=(",", ":")) + ";\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}: {len(land) / 1024:.0f} KB of path text, {len(points)} country points, viewBox {payload['viewBox']}")


if __name__ == "__main__":
    main()
