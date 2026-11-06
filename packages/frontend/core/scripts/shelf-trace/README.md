# shelf-trace

Regenerates `src/desktop/pages/workspace/shelf/scene-trace.ts`, the vector
trace of the approved Shelf home picture (1376 x 768).

```sh
pip install numpy opencv-python-headless scikit-learn
export SHELF_REFERENCE=/path/to/home-picture.jpg
python3 -I run.py trace.json          # every region, or name some
python3 gen.py trace.json ../../src/desktop/pages/workspace/shelf/scene-trace.ts
```

How it works: each region of the picture (top band, side strips, floor, shelf
props, rug, pin board, sticky card, eagle, bookcases) is classified pixel by
pixel to the nearest palette *role* (ink, blue, terra, green, gold, cream, ...),
smoothed at 3x, and turned into even-odd SVG paths. Wall-coloured pixels in
object regions stay transparent so the light and wall shadows show through.
Where books and notes go, the picture is pre-filled with the case back or cloth
colour first, because those are live buttons drawn over the art. Role names are
resolved against the active palette at render time, so palettes B and C recolour
the same trace. The eagle and the pin board cloth keep literal colours.
