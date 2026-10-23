import unittest
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from pydantic import ValidationError
from api.recommendations import FitRequest, recommend
from api.report import costs, same_bed_neighbors, comps, verification


def home(zpid=1, **kw):
    return dict(zpid=zpid, price=100000, living_area=1200, beds=2, baths=1, zipcode='77407', home_type='CONDO',
                lat=29.7, lon=-95.4, school_mean=5, rate_30yr=6, property_tax_rate=2, monthly_hoa=100, **{}) | kw


class BudgetTests(unittest.TestCase):
    def test_budget_boundary_and_default_no_stretch(self):
        r = recommend([home(), home(2, price=100001)], FitRequest(max_price=100000), 6)
        self.assertEqual([h['zpid'] for h in r['within_budget']], [1]); self.assertEqual(r['stretch'], [])

    def test_stretch_is_separate_exact_and_capped(self):
        r = recommend([home(), home(2, price=105000), home(3, price=105001)], FitRequest(max_price=100000, stretch_percent=5), 6)
        self.assertEqual(r['stretch_count'], 1)
        self.assertEqual(r['stretch'][0]['over_budget'], 5000)
        self.assertEqual(r['stretch'][0]['over_budget_percent'], 5)

    def test_hard_filters_never_relaxed(self):
        p = FitRequest(max_price=200000, min_beds=3, zipcodes=['77005'], home_type='SINGLE_FAMILY')
        self.assertEqual(recommend([home()], p, 6)['eligible_count'], 0)

    def test_full_pool_not_search_first_twenty(self):
        rows = [home(i, school_mean=1 if i < 30 else 10) for i in range(31)]
        self.assertEqual(recommend(rows, FitRequest(max_price=100000, priorities=['schools']), 6)['within_budget'][0]['zpid'], 30)

    def test_priority_changes_order(self):
        rows = [home(1, school_mean=10, living_area=900), home(2, school_mean=2, living_area=2000)]
        self.assertEqual(recommend(rows, FitRequest(max_price=100000, priorities=['schools']), 6)['within_budget'][0]['zpid'], 1)
        self.assertEqual(recommend(rows, FitRequest(max_price=100000, priorities=['space']), 6)['within_budget'][0]['zpid'], 2)

    def test_unknown_cost_is_not_zero_credit_or_complete(self):
        rows = [home(1, monthly_hoa=None), home(2, monthly_hoa=300)]
        r = recommend(rows, FitRequest(max_price=100000, priorities=['monthly_cost']), 6)
        self.assertEqual(r['within_budget'][0]['zpid'], 2)
        self.assertTrue(all(h['monthly_status'] == 'incomplete' for h in r['within_budget']))
        self.assertEqual(r['within_budget'][1]['costs']['monthly']['hoa'], 'unknown')

    def test_monthly_limit_known_subtotal(self):
        d = home(); subtotal = costs(d, d['price'], 6)['monthly']['total_known']
        self.assertEqual(recommend([d], FitRequest(max_price=100000, monthly_budget=subtotal), 6)['eligible_count'], 1)
        self.assertEqual(recommend([d], FitRequest(max_price=100000, monthly_budget=subtotal-.01), 6)['eligible_count'], 0)

    def test_deterministic_ties_and_invalid_inputs(self):
        rows = [home(7), home(2)]
        self.assertEqual([h['zpid'] for h in recommend(rows, FitRequest(max_price=100000), 6)['within_budget']], [2, 7])
        for kwargs in [dict(max_price=float('nan')), dict(max_price=-1), dict(max_price=100, stretch_percent=21), dict(max_price=100, priorities=[])]:
            with self.assertRaises(ValidationError): FitRequest(**kwargs)
        with self.assertRaises(ValueError): recommend([], FitRequest(max_price=100, zipcodes=['7740']), 6)

    def test_zero_rate_and_missing_costs(self):
        self.assertAlmostEqual(costs(home(rate_30yr=0), 100000, 6)['monthly']['mortgage'], 80000/360, places=2)


class ListingChecksTests(unittest.TestCase):
    def test_condo_neighbors_exclude_other_types_and_self(self):
        ref = pd.DataFrame(dict(zpid=[1, 2, 3], bedrooms=[3, 3, 3], homeType=['CONDO','SINGLE_FAMILY','CONDO']))
        tree = cKDTree(np.array([[0,0],[.1,0],[.2,0]]))
        nb = same_bed_neighbors(ref, tree, lambda la,lo: np.array([[0,0]]), 0, 0, 3, 'CONDO', 1)
        self.assertEqual(nb.zpid.tolist(), [3])

    def test_price_alone_does_not_change_independent_checks(self):
        d = {'zpid': 1, 'lat': None}
        low = verification(d, None, 1, 100000, None, None, None)
        high = verification(d, None, 10000000, 100000, None, None, None)
        self.assertEqual(low, high)
        self.assertNotIn('asking_far_below_range', [s['name'] for s in low])

    def test_sparse_comparables_do_not_mix_property_types(self):
        ref = pd.DataFrame(dict(zpid=[1,2,3], bedrooms=[3,3,3], bathrooms=[2,2,2],
            homeType=['CONDO','SINGLE_FAMILY','CONDO'], livingArea=[1300,1300,1300],
            price=[100000,300000,110000], latitude=[29.7,29.7,29.7], longitude=[-95.4,-95.4,-95.4]))
        tree = cKDTree(np.array([[0,0],[.1,0],[.2,0]]))
        items, rule = comps(ref, tree, lambda la,lo: np.array([[0,0]]), 29.7, -95.4, 'CONDO', 3, 1300, 1)
        self.assertEqual([c['zpid'] for c in items], [3])
        self.assertIn('same type', rule)


if __name__ == '__main__': unittest.main()
