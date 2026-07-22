#!/usr/bin/env python3
"""Build the EXCLUSIVE 'Founder's Lizard' (species CX) — the survey reward.
Amethyst colourway (hue 285) of the C4 lizard, generated with the SAME masked
hue-rotate + eye-preservation as build-shiny-pets.py so it matches the shinies.
Approved by Tom (picked amethyst from 4 candidates).

Outputs:
  assets/bh/C/CX.png                    full-canvas static portrait (640)
  assets/bh/anim/lizard-amethyst/base.png   recolored body (eyes preserved)
  assets/bh/anim/lizard-amethyst/lid.png    recolored eyelid (same hue delta as body)

The animated render (petanim.js case 'CX') reuses the shared lizard layers
(tongue/mouthline/drool/fly) unchanged and only swaps base + lid.
"""
from PIL import Image
import numpy as np, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
C_DIR = os.path.join(ROOT, "assets", "bh", "C")
ANIM = os.path.join(ROOT, "assets", "bh", "anim", "lizard")
OUT_ANIM = os.path.join(ROOT, "assets", "bh", "anim", "lizard-amethyst")
os.makedirs(OUT_ANIM, exist_ok=True)
DEG = 285  # amethyst

def hsv(im):
    a=np.asarray(im).astype(np.float32)/255.0; rgb,al=a[...,:3],a[...,3]
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]; mx=rgb.max(-1);mn=rgb.min(-1);d=mx-mn;v=mx
    s=np.where(mx>0,d/np.maximum(mx,1e-6),0); h=np.zeros_like(v)
    m=(mx==r)&(d>0);h[m]=((g-b)[m]/d[m])%6
    m=(mx==g)&(d>0);h[m]=((b-r)[m]/d[m])+2
    m=(mx==b)&(d>0);h[m]=((r-g)[m]/d[m])+4
    return h/6.0,s,v,al,r,g,b
def to_img(h,s,v,al):
    i=np.floor(h*6).astype(int)%6;f=h*6-np.floor(h*6)
    p=v*(1-s);q=v*(1-f*s);t=v*(1-(1-f)*s);out=np.zeros((*h.shape,3),np.float32)
    for idx,(rr,gg,bb) in enumerate([(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)]):
        m2=(i==idx);out[...,0][m2]=rr[m2];out[...,1][m2]=gg[m2];out[...,2][m2]=bb[m2]
    return Image.fromarray((np.dstack([out,al])*255).astype(np.uint8),"RGBA")
def dom(h,s,v,mask):
    w=(s*v*mask);ang=h*2*np.pi
    return (np.arctan2((np.sin(ang)*w).sum(),(np.cos(ang)*w).sum())/(2*np.pi))%1.0
SAT_T=0.22
def body_delta(img):
    """The hue delta that lands this image's dominant hue on DEG. Shared across
    base + lid so the eyelid colour matches the body exactly."""
    h,s,v,al,_,_,_=hsv(img); mask=(al>0.05)&(s>SAT_T)&(v>0.18)
    return (DEG/360.0 - dom(h,s,v,mask))
def rotate_by(img,delta,sat_mult=1.0):
    h,s,v,al,_,_,_=hsv(img); mask=(al>0.05)&(s>SAT_T)&(v>0.18)
    if mask.sum()==0: return img.copy()
    h2=h.copy();s2=s.copy()
    h2[mask]=(h[mask]+delta)%1.0; s2[mask]=np.clip(s[mask]*sat_mult,0,1)
    return to_img(h2,s2,v,al)
def eye_mask_static(im):
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    up=(yy>0.27*H)&(yy<0.62*H)&(xx>0.28*W)&(xx<0.80*W)
    cream=up&(al>0.5)&(v>0.66)&((r-b)>0.05)&(s>0.08)&(s<0.62)
    ys,xs=np.where(cream); box=(xs.min()-4,ys.min()-4,xs.max()+4,ys.max()+4)
    inb=(xx>=box[0])&(xx<=box[2])&(yy>=box[1])&(yy<=box[3])
    dark=inb&(al>0.6)&(v<0.30); white=inb&(al>0.6)&(v>0.90)&(s<0.12)
    return (cream&inb)|dark|white
def eye_mask_anim(im):
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    up=(yy>0.20*H)&(yy<0.68*H)&(xx>0.22*W)&(xx<0.85*W)
    hd=(h*360)%360
    # pale cream only, and NEVER the saturated orange contour stroke (hue 8-52,
    # s>0.18) — that must recolor with the body instead of being pasted back orange
    orange_stroke=(hd>=8)&(hd<=52)&(s>0.18)
    cream=up&(al>0.5)&(v>0.62)&((r-b)>0.03)&(s>0.06)&(s<0.34)&(~orange_stroke)
    if cream.sum()==0: return np.zeros((H,W),bool)
    ys,xs=np.where(cream); box=(xs.min()-4,ys.min()-4,xs.max()+4,ys.max()+4)
    inb=(xx>=box[0])&(xx<=box[2])&(yy>=box[1])&(yy<=box[3])
    dark=inb&(al>0.6)&(v<0.30); white=inb&(al>0.6)&(v>0.90)&(s<0.12)
    return (cream&inb)|dark|white
def paste_original(varimg,src,mask):
    o=np.array(varimg).copy(); s=np.array(src.convert("RGBA")); o[mask]=s[mask]
    return Image.fromarray(o,"RGBA")

# 1) STATIC full-canvas portrait (recolor cropped C4, eyes preserved, paste back).
full = Image.open(os.path.join(C_DIR,"C4.png")).convert("RGBA")
bb = full.getbbox(); crop = full.crop(bb)
dstat = body_delta(crop)
sh = rotate_by(crop, dstat, sat_mult=1.4)
sh = paste_original(sh, crop, eye_mask_static(crop))
canvas = Image.new("RGBA", full.size, (0,0,0,0)); canvas.paste(sh, (bb[0],bb[1]), sh)
canvas.save(os.path.join(C_DIR,"CX.png"))
print("wrote static CX.png", full.size, "art@", bb[:2])

# 2) ANIMATED layers. Compute the body delta from the anim base, reuse it for lid.
base = Image.open(os.path.join(ANIM,"base.png")).convert("RGBA")
dbase = body_delta(base)
b2 = rotate_by(base, dbase, sat_mult=1.4)
em = eye_mask_anim(base)
b2 = paste_original(b2, base, em)
b2.save(os.path.join(OUT_ANIM,"base.png"))
print("wrote anim base.png  eye px preserved:", int(em.sum()))

lid = Image.open(os.path.join(ANIM,"lid.png")).convert("RGBA")
l2 = rotate_by(lid, dbase, sat_mult=1.4)   # SAME delta as body -> matching amethyst
l2.save(os.path.join(OUT_ANIM,"lid.png"))
print("wrote anim lid.png (shared body delta)")
