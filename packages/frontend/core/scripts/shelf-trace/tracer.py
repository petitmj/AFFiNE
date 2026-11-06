"""Trace the reference picture into palette-role vector layers (library).

Output of `trace`: JSON {regions:[{id, base, box, layers:[[colour, path]]}]}; path coordinates
are integers in 1/S px units (S=3), relative line segments.
"""
import json, sys
import numpy as np, cv2
from sklearn.cluster import KMeans

import os

# the approved home-page picture (1376x768); not stored in the repository
REF = os.environ['SHELF_REFERENCE']
S = 3
img = cv2.imread(REF)[:, :, ::-1].copy()  # RGB

H = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
# role -> reference colours (all map to the role)
ROLES = {
    'ink': ['#060506', '#202122', '#363330'],
    'back': ['#1e100a', '#3f200b', '#1e130c'],
    'blue': ['#283b62', '#2b4274'],
    'cream': ['#efe4cd', '#f6f0e0', '#f2e7cf', '#eddabb'],
    'green': ['#355c3e', '#2f5a3a'],
    'shade': ['#c9a77b', '#d9b990'],
    'gold': ['#d09b24', '#ca9f49', '#dba52a'],
    'terra': ['#9f533b', '#a65a3e'],
    'floor': ['#5e3b23', '#5f3e29', '#80543a'],
    'wall': ['#e7cca6', '#e6cca7', '#eedbba', '#dfc299'],
}


def lab(rgb):
    a = np.array(rgb, np.uint8).reshape(-1, 1, 3)
    return cv2.cvtColor(a, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)


def classify(crop, palette):
    """palette: list of (key, rgb). returns index map into palette keys."""
    keys = []
    refs = []
    for k, rgbs in palette:
        for c in rgbs:
            keys.append(k)
            refs.append(c)
    uniq = list(dict.fromkeys(k for k, _ in palette))
    L = lab(refs)
    f = cv2.bilateralFilter(crop, 5, 28, 4)
    px = cv2.cvtColor(f, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    d = ((px[:, None, :] - L[None, :, :]) ** 2).sum(-1)
    nearest = d.argmin(1)
    idx = np.array([uniq.index(keys[i]) for i in nearest], np.int32)
    return idx.reshape(crop.shape[:2]), uniq


def smooth_up(idx, n, sigma=0.55):
    h, w = idx.shape
    best = None
    out = np.zeros((h * S, w * S), np.int32)
    score = np.full((h * S, w * S), -1, np.float32)
    for r in range(n):
        ch = (idx == r).astype(np.float32)
        if not ch.any():
            continue
        up = cv2.resize(ch, (w * S, h * S), interpolation=cv2.INTER_LINEAR)
        up = cv2.GaussianBlur(up, (0, 0), S * sigma)
        m = up > score
        out[m] = r
        score[m] = up[m]
    return out


def contours_path(mask, ox, oy, min_area, eps):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    parts = []
    for c in cs:
        if abs(cv2.contourArea(c)) < min_area * S * S:
            continue
        a = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(a) < 3:
            continue
        pts = [(int(x) + ox, int(y) + oy) for x, y in a]
        s = 'M%d %dl' % pts[0]
        px, py = pts[0]
        seg = []
        for x, y in pts[1:]:
            seg.append('%d %d' % (x - px, y - py))
            px, py = x, y
        parts.append(s + ' '.join(seg) + 'z')
    return ''.join(parts)


def trace(spec):
    x0, y0, x1, y1 = spec['box']
    crop = img[y0:y1, x0:x1].copy()
    for (a, b, c, d, rgb) in spec.get('fills', []):
        crop[max(b - y0, 0):max(d - y0, 0), max(a - x0, 0):max(c - x0, 0)] = rgb
    if 'palette' in spec:
        pal = spec['palette']
    else:
        pal = [(k, [H(c) for c in v]) for k, v in ROLES.items() if k in spec['roles']]
    idx, keys = classify(crop, pal)
    if 'merge' in spec:
        for src, dst in spec['merge'].items():
            if src in keys and dst in keys:
                idx[idx == keys.index(src)] = keys.index(dst)
    up = smooth_up(idx, len(keys), spec.get('sigma', 0.55))
    counts = np.bincount(up.ravel(), minlength=len(keys))
    transparent = spec.get('transparent')
    base = None
    if spec.get('base', True):
        order = [i for i in np.argsort(-counts) if keys[i] != transparent]
        base = keys[order[0]] if order else None
    layers = []
    if spec.get('underlay') and transparent in keys:
        solid = (up != keys.index(transparent)).astype(np.uint8) * 255
        solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        p = contours_path(solid, x0 * S, y0 * S, 6, spec.get('eps', 0.9))
        if p:
            layers.append([spec['underlay'], p])
    for r in np.argsort(-counts):
        k = keys[r]
        if k == transparent or k == base or counts[r] == 0:
            continue
        mask = (up == r).astype(np.uint8) * 255
        p = contours_path(mask, x0 * S, y0 * S, spec.get('role_min', {}).get(k, spec.get('min_area', 1.5)), spec.get('eps', 0.9))
        if p:
            layers.append([k, p])
    return {'id': spec['id'], 'base': base, 'box': [x0, y0, x1 - x0, y1 - y0], 'layers': layers}


def kmeans_palette(spec, k):
    x0, y0, x1, y1 = spec['box']
    crop = img[y0:y1, x0:x1].copy()
    flat = cv2.cvtColor(crop, cv2.COLOR_RGB2LAB).reshape(-1, 3)
    km = KMeans(k, n_init=3, random_state=1).fit(flat[::3])
    c = km.cluster_centers_.astype(np.uint8).reshape(-1, 1, 3)
    rgb = cv2.cvtColor(c, cv2.COLOR_LAB2RGB).reshape(-1, 3)
    return [('#%02x%02x%02x' % tuple(v), [tuple(int(t) for t in v)]) for v in rgb]
