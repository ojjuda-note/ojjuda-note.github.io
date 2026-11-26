"""Build the offline Korean city polygons with Python and shapely 2.1.2."""
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

from shapely import make_valid, union_all
from shapely.geometry import shape

SOURCE = "https://raw.githubusercontent.com/vuski/admdongkor/078ef4ac13b8bfeb215d2eabace49f4fdea71d5e/ver20261001/HangJeongDong_ver20261001.geojson"
BLOB = "877acdc676ee332414cd0d6dd0a2b143dbfbd7d7"
CREDITS = "/*! 경계: 통계청 SGIS (https://sgis.kostat.go.kr), 공공누리 제1유형. 가공: vuski/admdongkor (https://github.com/vuski/admdongkor), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). 2026-10-01 자료를 시·군 단위로 병합·단순화. */"

def city_name(full_name):
    province, *parts = full_name.split()
    if province == "전남광주통합특별시":
        if not parts or parts[0].endswith("구") or parts[0].startswith("광주"):
            return "광주"
    elif province.endswith(("광역시", "특별자치시", "특별시")):
        return re.sub(r"(광역시|특별자치시|특별시)$", "", province)
    if not parts:
        raise ValueError(full_name)
    match = re.fullmatch(r"(.+?[시군])(?:[가-힣]+구)?", parts[0])
    if not match:
        raise ValueError(full_name)
    return match.group(1)

def polygons(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygons(part)

def ring_coords(ring):
    points = [(round(x*10000), round(y*10000)) for x, y in list(ring.coords)[:-1]]
    return [coordinate for point in points for coordinate in point]

with urlopen(SOURCE, timeout=60) as response:
    body = response.read()
if hashlib.sha1(b"blob %d\0" % len(body) + body).hexdigest() != BLOB:
    raise ValueError("Boundary asset digest mismatch")
cities = defaultdict(list)
for feature in json.loads(body)["features"]:
    city = city_name(feature["properties"]["adm_nm"])
    cities[city].extend(polygons(make_valid(shape(feature["geometry"]))))
records = []
for city, areas in sorted(cities.items()):
    for polygon in polygons(union_all(areas).simplify(.0007, preserve_topology=True)):
        rings = [ring_coords(r) for r in (polygon.exterior, *polygon.interiors)]
        bbox = [round(n*10000) for n in polygon.bounds]
        records.append([city, bbox, rings])
if len(cities) < 150:
    raise ValueError("Incomplete city boundaries")
Path("note/glasses-city-data.mjs").write_text(CREDITS+"\nexport default "+json.dumps(records, ensure_ascii=False, separators=(",", ":"))+";\n", encoding="utf-8")
