"""Preference ranking of historical listings, independent of model price estimates.

Hard filters precede equally weighted normalized ranks of distinct known values of user-selected priorities.
Missing priority evidence scores zero; no demographic features or model-price discount.
"""
import math
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from api.report import costs


class FitRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    max_price: float = Field(gt=0, le=100_000_000)
    monthly_budget: float | None = Field(default=None, gt=0, le=1_000_000)
    min_beds: float = Field(default=0, ge=0, le=30)
    zipcodes: list[str] = Field(default_factory=list, max_length=20)
    home_type: Literal['SINGLE_FAMILY', 'TOWNHOUSE', 'CONDO'] | None = None
    priorities: list[Literal['monthly_cost', 'schools', 'space']] = Field(default_factory=lambda: ['monthly_cost'], min_length=1, max_length=3)
    stretch_percent: float = Field(default=0, ge=0, le=20)
    limit: int = Field(default=12, ge=1, le=30)

    @classmethod
    def validate_zips(cls, p):
        # Kept in engine too, so direct calls cannot bypass it.
        return all(len(z) == 5 and z.isascii() and z.isdigit() for z in p.zipcodes)


def number(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def recommend(rows, p: FitRequest, median_rate):
    if not FitRequest.validate_zips(p):
        raise ValueError('ZIP codes must be five-digit strings')
    candidates = []
    for d in rows:
        price, area, beds = (number(d.get(k)) for k in ('price', 'living_area', 'beds'))
        if price is None or price <= 0 or area is None or area <= 0 or beds is None or beds < p.min_beds:
            continue
        if p.zipcodes and str(d.get('zipcode')) not in p.zipcodes:
            continue
        if p.home_type and d.get('home_type') != p.home_type:
            continue
        if price > p.max_price * (1 + p.stretch_percent / 100):
            continue
        c = costs(d, price, median_rate)
        subtotal = c['monthly']['total_known']
        if p.monthly_budget is not None and subtotal > p.monthly_budget:
            continue
        school = number(d.get('school_mean'))
        over = max(0, price - p.max_price)
        candidates.append({
            'zpid': int(d['zpid']), 'address': d.get('street_address') or f"Listing {d['zpid']}",
            'zipcode': str(d.get('zipcode') or ''), 'home_type': d.get('home_type'),
            'price': price, 'living_area': area, 'beds': beds, 'baths': number(d.get('baths')),
            'lat': number(d.get('lat')), 'lon': number(d.get('lon')), 'school_mean': school,
            'costs': c, 'monthly_status': 'incomplete', 'over_budget': round(over, 2),
            'over_budget_percent': round(100 * over / p.max_price, 2), 'score': 0.0, 'reasons': [],
        })
    priorities = list(dict.fromkeys(p.priorities))
    # Rank each budget group separately, so optional stretch does not change within-budget order.
    groups = [[c for c in candidates if (c['over_budget'] > 0) == stretch] for stretch in (False, True)]
    for group in groups:
        for priority in priorities:
            def value(c):
                if priority == 'schools':
                    return c['school_mean']
                if priority == 'space':
                    return c['living_area']
                # Incomplete HOA/tax must not make a listing appear artificially cheap.
                m = c['costs']['monthly']
                return -m['total_known'] if m['hoa'] != 'unknown' and m['tax'] != 'unknown' else None
            values = [value(c) for c in group]
            known = sorted(set(v for v in values if v is not None))
            ranks = {v: (i + 1) / len(known) for i, v in enumerate(known)}
            for c, v in zip(group, values):
                rank = ranks.get(v, 0)
                c['score'] += rank / len(priorities)
        for c in group:
            c['score'] = round(c['score'], 6)
            c['reasons'].append('Within your recorded purchase-price limit.' if not c['over_budget'] else
                                f"${c['over_budget']:,.0f} ({c['over_budget_percent']:.2f}%) above your purchase budget.")
            if 'schools' in priorities:
                c['reasons'].append(f"Recorded school rating {c['school_mean']:.2f}/10." if c['school_mean'] is not None else 'School rating unavailable; no school-priority credit.')
            if 'space' in priorities:
                c['reasons'].append(f"{c['living_area']:,.0f} sqft and {c['beds']:g} bedrooms.")
            m = c['costs']['monthly']
            c['reasons'].append(f"Known monthly subtotal ${m['total_known']:,.0f}; full affordability is incomplete.")
            if m['hoa'] != 'unknown' and m['hoa'] > 0:
                c['reasons'].append(f"Disclosed HOA adds ${m['hoa']:,.0f}/month.")
            elif m['hoa'] == 'unknown':
                c['reasons'].append('HOA not disclosed; missing cost is not treated as $0 for ranking.')
        group.sort(key=lambda c: (-c['score'], c['price'], c['zpid']))
    return {
        'within_budget': groups[0][:p.limit], 'stretch': groups[1][:p.limit],
        'eligible_count': len(candidates), 'within_count': len(groups[0]), 'stretch_count': len(groups[1]),
        'dataset': 'June 2024 asking-price snapshot; availability and prices are historical.',
        'method': 'Hard constraints first. Equal-weight normalized ranks of distinct known values for selected priorities, separately within each budget group. Missing evidence earns no credit; ties use asking price then listing ID. Scores measure preference fit, not probability, value or safety.',
        'school_context': 'Mean listing-provided school rating in the June 2024 snapshot, not school assignment or a guarantee of educational quality.',
        'crime_context': 'Crime data unavailable: no verified, dated crime dataset is included. Missing reports are not zero crime.',
        'assumptions': ['20% down, 30-year fixed mortgage using the recorded listing rate or snapshot median.', 'Known monthly subtotal includes mortgage, disclosed tax and HOA. Insurance, flood insurance, maintenance and utilities remain unknown or excluded.', 'Monthly limit excludes homes whose known subtotal already exceeds it; remaining homes still have incomplete full costs.'],
    }
