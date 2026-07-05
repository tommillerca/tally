import math, os

# Burrito: fat tortilla roll on a diagonal. Open end (top-right) has 3 DISTINCT
# filling lumps of varying size poking out (notches between them = separate
# pieces). Two diagonal fold creases across the body (negative-space, evenodd)
# read as the wrapped tortilla. Closed rounded end bottom-left.

def make(cx=252, cy=270, L=232, r=74, ang_deg=-31,
         lump_rx=(58, 74, 60), creases=2, fill="#9c6b3a"):
    ang = math.radians(ang_deg); c, s = math.cos(ang), math.sin(ang)
    def T(x, y): return (cx + x*c - y*s, cy + x*s + y*c)
    def P(p): return f"{p[0]:.1f},{p[1]:.1f}"
    xL, xR = -L/2, L/2
    seg = (2*r)/3

    d = f"M{P(T(xL, -r))} L{P(T(xR, -r))} "         # closed-end top, top edge
    # open end: 3 lumps, each an outward arc; cusps at x=xR between them
    for i in range(3):
        y1 = -r + (i+1)*seg
        rx = lump_rx[i]
        end = T(xR, y1)
        d += f"A{rx},{seg/2:.1f} 0 0 1 {P(end)} "    # bulge +x
    d += f"L{P(T(xL, r))} "                           # bottom edge
    d += f"Q{P(T(xL - r*1.15, 0))} {P(T(xL, -r))} Z"  # rounded closed end

    # diagonal fold creases across the tube (local-y direction), evenodd holes
    holes = ""
    xs = [-L*0.18, L*0.16][:creases]
    for fx in xs:
        t = 8; h = r*0.78
        a=T(fx-t, -h); b=T(fx+t, -h); cc=T(fx+t, h); dd=T(fx-t, h)
        holes += f"M{P(a)} L{P(b)} L{P(cc)} L{P(dd)} Z "
    return (f'<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">'
            f'<path fill="{fill}" fill-rule="evenodd" d="{d} {holes}"/></svg>')

variants = {
    'a': make(),
    'b': make(lump_rx=(64,82,66), creases=2, ang_deg=-34),
    'c': make(lump_rx=(52,68,54), creases=1, r=70, L=246),
    'd': make(lump_rx=(70,88,72), creases=2, r=78, L=224, ang_deg=-28),
}
os.makedirs('icons-demo', exist_ok=True)
for k, v in variants.items():
    open(f'icons-demo/fajita3-{k}.svg', 'w').write(v)
print("wrote", list(variants))
