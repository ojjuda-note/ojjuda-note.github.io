"""Reviewed direct start routes for the three rebuilt Android TWA variants.

Original AAB metadata in baselines/ stays immutable. A signed app update is
required before an already installed native app can use these new URLs.
"""
from copy import deepcopy
from urllib.parse import urlparse

WEB_ORIGIN = "https://ojjuda.kr"
LAUNCH_ROUTES = {
    "agit": {
        "start": "/world.html?tab=hub&play_store=1",
        "manifest": "/manifest.webmanifest",
        "id": "/world.html",
        "scope": "/",
        "icons": "/",
    },
    "park": {
        "start": "/world.html?place=park",
        "manifest": "/park/manifest.webmanifest",
        "id": "/world.html?place=park",
        "scope": "/",
        "icons": "/park/assets/",
    },
    "pajang": {
        "start": "/features/pajang/",
        "manifest": "/features/pajang/manifest.webmanifest",
        "id": "/features/pajang/",
        "scope": "/features/pajang/",
        "icons": "/features/pajang/assets/",
    },
}


def direct_entry(app, original):
    """Return safe native strings and bundled web manifest without rewriting a baseline."""
    if app not in LAUNCH_ROUTES:
        raise ValueError("Unknown app: " + str(app))
    if original.get("package") != "kr.ojjuda." + app:
        raise ValueError("Verified application ID does not match " + app)
    route = LAUNCH_ROUTES[app]
    start = urlparse(WEB_ORIGIN + route["start"])
    if (start.scheme != "https" or start.netloc != "ojjuda.kr"
            or start.fragment or not start.path.startswith(route["scope"])):
        raise ValueError("Untrusted start route for " + app)
    strings = dict(original["strings"])
    strings.update({
        "launchUrl": WEB_ORIGIN + route["start"],
        "hostName": "ojjuda.kr",
        "webManifestUrl": WEB_ORIGIN + route["manifest"],
    })
    web_manifest = deepcopy(original["webManifest"])
    web_manifest.update({
        "id": route["id"],
        "start_url": route["start"],
        "scope": route["scope"],
        "icons": [
            {"src": route["icons"] + "icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": route["icons"] + "icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": route["icons"] + "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    })
    return strings, web_manifest
