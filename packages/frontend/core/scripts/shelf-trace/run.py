"""usage: SHELF_REFERENCE=picture.jpg python3 -I run.py trace.json [region ...]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tracer as T
from tracer import H, ROLES

BACK = H('#1e100a')
CREAM = H('#efe4cd')
FLOOR = H('#5e3b23')


def pal(names, drop=(), wall_t=False, extra=None):
    out = []
    for k in names:
        cols = [c for c in ROLES[k] if c not in drop]
        out.append((k, [H(c) for c in cols]))
    return out


OBJ = ['ink', 'back', 'blue', 'cream', 'green', 'gold', 'terra', 'floor', 'wall']
# for object regions wall-like tans are transparent; cream keeps only bright refs
OBJ_DROP = ('#eddabb',)


def obj_pal(extra_shade=False):
    p = pal(OBJ, drop=OBJ_DROP)
    # tans (shadows, tape) fall to the wall unless asked for
    for i, (k, v) in enumerate(p):
        if k == 'wall' and not extra_shade:
            p[i] = (k, v + [H('#c9a77b'), H('#d9b990'), H('#e0c59a')])
    if extra_shade:
        p.append(('shade', [H('#c9a77b'), H('#d9b990')]))
    return p


SPECS = {}
SPECS['top'] = dict(id='top', box=(0, 0, 1376, 58), roles=['ink', 'blue', 'cream', 'green', 'gold', 'terra', 'wall'],
                    merge={'wall': 'cream'}, min_area=1.0)
SPECS['strip_l'] = dict(id='strip_l', box=(0, 57, 52, 660), roles=['wall', 'shade', 'cream', 'ink'], min_area=1.0)
SPECS['strip_r'] = dict(id='strip_r', box=(1324, 57, 1376, 660), fills=[(1324, 76, 1346, 134, H('#dfc299'))], roles=['wall', 'shade', 'cream', 'ink'], min_area=1.0)
SPECS['floor'] = dict(id='floor', box=(0, 659, 1376, 768),
                      fills=[(52, 725, 343, 768, FLOOR)],
                      roles=['ink', 'blue', 'cream', 'green', 'gold', 'terra', 'floor', 'wall'],
                      merge={'wall': 'cream'}, min_area=1.0)
SPECS['props'] = dict(id='props', box=(55, 70, 480, 310), palette=obj_pal(), transparent='wall', base=False, min_area=1.2)
SPECS['rug'] = dict(id='rug', box=(64, 303, 159, 432), palette=obj_pal(), transparent='wall', base=False, min_area=1.0)
BOARD_PAL = [p for p in obj_pal() if p[0] not in ('floor', 'back', 'ink')] + [
    ('ink', [H('#060506'), H('#141012')]), ('cloth', [H('#413739'), H('#3a2f33'), H('#2f2b38'), H('#4d4045')])]
SPECS['board'] = dict(id='board', box=(168, 262, 476, 479), palette=BOARD_PAL, transparent='wall', base=False,
                      fills=[(222, 267, 425, 286, CREAM)] + [(x, y, x + w, y + h, BACK) for x, y, w, h in
                              [(192, 311, 74, 58), (285, 314, 74, 58), (378, 311, 74, 58),
                               (194, 388, 72, 57), (285, 391, 74, 57), (378, 388, 74, 57)]],
                      min_area=6.0, eps=1.2, role_min={'terra': 16, 'green': 16, 'gold': 16, 'cream': 10, 'blue': 12})
SPECS['card'] = dict(id='card', box=(480, 336, 576, 420), palette=obj_pal(True), transparent='wall', base=False, min_area=1.0)

BAYS = [(886, 89, 377, [486, 604, 712]), (990, 72, 521, [604, 712]),
        (1076, 107, 222, [355, 486, 604, 712]), (1199, 99, 366, [486, 604, 712])]
bfills = []
for x, w, ceil, rows in BAYS:
    top = ceil
    for r in rows:
        bfills.append((x, top, x + w, r, BACK))
        top = r + 10
SPECS['cases'] = dict(id='cases', box=(868, 140, 1316, 722), palette=obj_pal(), transparent='wall', base=False,
                      fills=bfills, min_area=1.5)

if __name__ == '__main__':
    names = sys.argv[2:] or [k for k in SPECS if k != 'board'] + ['board', 'eagle']
    out = []
    for n in names:
        if n == 'board':
            spec = dict(SPECS['board'])
            spec.pop('palette'); spec['min_area'] = 1.6; spec['eps'] = 1.0; spec['sigma'] = 0.5
            # the wall highlight around the label is wall, not cream: only the label itself is cream
            wallfill = H('#e7cca6')
            spec['fills'] = [(168, 248, 425, 264, wallfill), (425, 248, 477, 292, wallfill), (222, 267, 425, 286, CREAM)] + [(x, y, x + w, y + h, H('#413739')) for x, y, w, h in
                [(192, 311, 74, 58), (285, 314, 74, 58), (378, 311, 74, 58), (194, 388, 72, 57), (285, 391, 74, 57), (378, 388, 74, 57)]]
            spec.pop('role_min', None)
            p = T.kmeans_palette(spec, 9)
            wall = T.lab([H('#e7cca6')])[0]
            best = min(range(len(p)), key=lambda i: ((T.lab([p[i][1][0]])[0] - wall) ** 2).sum())
            p[best] = ('wall', p[best][1])
            spec['palette'] = p; spec['transparent'] = 'wall'; spec['base'] = False
            out.append(T.trace(spec))
        elif n == 'cloth':
            spec = dict(id='cloth', box=(185, 303, 459, 462), base=True, min_area=1.2, eps=0.9, sigma=0.5,
                        fills=[(x, y, x + w, y + h, H('#413739')) for x, y, w, h in
                               [(192, 311, 74, 58), (285, 314, 74, 58), (378, 311, 74, 58),
                                (194, 388, 72, 57), (285, 391, 74, 57), (378, 388, 74, 57)]])
            spec['palette'] = T.kmeans_palette(spec, 9)
            out.append(T.trace(spec))
        elif n == 'eagle':
            # the picture has an "Ask the eagle" button beside the bird; the app draws a real
            # one, so its left edge must not be traced into the art as a stray half disc
            spec = dict(id='eagle', box=(590, 436, 725, 660), base=False, min_area=1.0, eps=0.8,
                        fills=[(688, 444, 726, 512, H('#e7cca6'))])
            p = T.kmeans_palette(spec, 14)
            # wall cluster -> transparent
            wall = T.lab([H('#e7cca6')])[0]
            best = min(range(len(p)), key=lambda i: ((T.lab([p[i][1][0]])[0] - wall) ** 2).sum())
            p[best] = ('wall', p[best][1])
            spec['palette'] = p
            spec['transparent'] = 'wall'
            spec['underlay'] = '#2b2725'
            out.append(T.trace(spec))
        else:
            out.append(T.trace(SPECS[n]))
        sz = sum(len(l[1]) for l in out[-1]['layers'])
        print(n, len(out[-1]['layers']), 'layers', sz, 'bytes', flush=True)
    json.dump({'regions': out}, open(sys.argv[1], 'w'))
