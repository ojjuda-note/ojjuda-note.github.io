"""Native app launch tests; run after prepare_resources.py in Android CI."""
import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from launch_routes import LAUNCH_ROUTES, WEB_ORIGIN, direct_entry
from prepare_resources import OUTPUT, PROJECT


class TestNativeLaunchRoutes(unittest.TestCase):
    def test_every_app_opens_its_service_instead_of_a_second_splash(self):
        self.assertEqual(set(LAUNCH_ROUTES), {"agit", "park", "pajang"})
        self.assertEqual(LAUNCH_ROUTES["agit"]["start"], "/world.html?tab=hub&play_store=1")
        self.assertEqual(LAUNCH_ROUTES["park"]["start"], "/park/")
        self.assertEqual(LAUNCH_ROUTES["pajang"]["start"], "/features/pajang/")
        for app, route in LAUNCH_ROUTES.items():
            with self.subTest(app=app):
                baseline_path = PROJECT / "baselines" / (app + ".json")
                baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
                original = baseline_path.read_bytes()
                strings, manifest = direct_entry(app, baseline)
                self.assertEqual(strings["launchUrl"], WEB_ORIGIN + route["start"])
                self.assertEqual(strings["hostName"], "ojjuda.kr")
                self.assertEqual(strings["webManifestUrl"], WEB_ORIGIN + route["manifest"])
                self.assertEqual(manifest["start_url"], route["start"])
                self.assertEqual(manifest["id"], route["id"])
                self.assertEqual(manifest["scope"], route["scope"])
                self.assertTrue(all(icon["src"].startswith(route["icons"]) for icon in manifest["icons"]))
                self.assertEqual(baseline_path.read_bytes(), original, "original AAB evidence is immutable")
                self.assertTrue(baseline["strings"]["launchUrl"].startswith("https://ojjuda.com/"),
                                "historic entry route remains recorded as originally shipped")

    def test_wrong_package_and_unlisted_apps_are_rejected(self):
        original = json.loads((PROJECT / "baselines/agit.json").read_text(encoding="utf-8"))
        with self.assertRaises(ValueError):
            direct_entry("park", original)
        with self.assertRaises(ValueError):
            direct_entry("other", original)

    def test_generated_native_resources_use_approved_start(self):
        # Android CI runs this test immediately after prepare_resources.py.
        for app, route in LAUNCH_ROUTES.items():
            with self.subTest(app=app):
                base = OUTPUT / app / "res"
                xml = ET.parse(base / "values/twa.xml")
                strings = {
                    tag.attrib["name"]: (tag.text or "").strip('"')
                    for tag in xml.getroot().findall("string")
                }
                self.assertEqual(strings["launchUrl"], WEB_ORIGIN + route["start"])
                self.assertEqual(strings["hostName"], "ojjuda.kr")
                self.assertEqual(strings["webManifestUrl"], WEB_ORIGIN + route["manifest"])
                bundled = json.loads((base / "raw/web_app_manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(bundled["start_url"], route["start"])
                self.assertEqual(bundled["scope"], route["scope"])
                self.assertEqual(bundled["id"], route["id"])


if __name__ == "__main__":
    unittest.main()
