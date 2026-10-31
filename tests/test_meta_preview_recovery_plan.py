import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("recovery_plan", Path(__file__).parents[1] / "scripts/plan-meta-preview-recovery.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RecoveryPlanTests(unittest.TestCase):
    def row(self, ad="1", **values):
        return dict(account_id="4", ad_id=ad, creative_id="2", video_id="3", creative_type="video", width=64, height=64, **values)

    def test_new_and_old_ads_are_eligible_without_manifest(self):
        result = module.plan([self.row(), self.row("999")])
        self.assertEqual(result["summary"], {"eligible": 2, "below_hd": 2})
        self.assertFalse(result["automatic_dispatch"])
        self.assertTrue(all(v["approval"] == "not_granted" for v in result["videos"]))

    def test_prioritizes_small_keeps_adequate_and_excludes_images(self):
        big = self.row("5"); big.update(width="1080", height="1920")
        image = self.row("6"); image["creative_type"] = "image"
        result = module.plan([big, image, self.row()])
        self.assertEqual([v["ad_id"] for v in result["videos"]], ["1", "5"])
        self.assertEqual(result["summary"]["below_hd"], 1)

    def test_requires_exact_numeric_identity_and_no_duplicates(self):
        for rows in ([self.row(), self.row()], [{**self.row(), "video_id": "../wrong"}], [{**self.row(), "creative_id": None}]):
            with self.assertRaises(ValueError): module.plan(rows)

    def test_batches_without_bypassing_existing_limit(self):
        result = module.plan([self.row(str(i)) for i in range(101)])
        self.assertEqual([len(b) for b in result["discovery_batches"]], [50, 50, 1])
        self.assertNotIn("token", str(result).lower())
