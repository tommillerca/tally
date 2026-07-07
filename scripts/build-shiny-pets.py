#!/usr/bin/env python3
"""Build the ultra-rare SHINY pet variants as full-canvas (640x640) game assets.
Recolor runs on the cropped art (so the feature masks work), then pastes back at
the original bbox so framing matches the base C{n}.png exactly.
Shiny recipe matches the approved colorway sheet (docs/pet-colorways-v3)."""
from PIL import Image, ImageDraw
import numpy as np, os
from scipy.ndimage import label as cclabel, binary_closing

BASE = os.path.join(os.path.dirname(__file__), "..", "assets", "bh", "C")
OUT = os.path.join(BASE, "shiny"); os.makedirs(OUT, exist_ok=True)

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
def rotate_full(img,deg,sat_mult=1.0):
    h,s,v,al,_,_,_=hsv(img);mask=(al>0.05)&(s>SAT_T)&(v>0.18)
    if mask.sum()==0: return img.copy()
    d=dom(h,s,v,mask);delta=(deg/360.0-d)
    h2=h.copy();s2=s.copy();h2[mask]=(h[mask]+delta)%1.0;s2[mask]=np.clip(s[mask]*sat_mult,0,1)
    return to_img(h2,s2,v,al)
def cloud_variant(img,deg,blend):
    h,s,v,al,_,_,_=hsv(img);th=deg/360.0;h2,s2,v2=h.copy(),s.copy(),v.copy()
    body=(al>0.05)&(v>0.55)&(s<0.45);h2[body]=th;s2[body]=np.clip(0.06+s[body]*0.9,0,0.20)
    acc=(al>0.05)&(s>=0.45)
    if acc.sum(): dm=dom(h,s,v,acc);h2[acc]=(h[acc]+(th-dm))%1.0
    return Image.blend(img.convert("RGBA"),to_img(h2,s2,v2,al),min(1.0,blend))
def deorange(img,to_deg=95):
    h,s,v,al,_,_,_=hsv(img); hd=h*360
    m=(al>0.4)&(s>0.28)&(hd>=15)&(hd<=52); h2=h.copy();h2[m]=to_deg/360.0
    return to_img(h2,s,v,al)
def eye_mask(im):
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    up=(yy>0.27*H)&(yy<0.62*H)&(xx>0.28*W)&(xx<0.80*W)
    cream=up&(al>0.5)&(v>0.66)&((r-b)>0.05)&(s>0.08)&(s<0.62)
    ys,xs=np.where(cream); box=(xs.min()-4,ys.min()-4,xs.max()+4,ys.max()+4)
    inb=(xx>=box[0])&(xx<=box[2])&(yy>=box[1])&(yy<=box[3])
    dark=inb&(al>0.6)&(v<0.30); white=inb&(al>0.6)&(v>0.90)&(s<0.12)
    return (cream&inb)|dark|white
def paste_original(varimg,src,mask):
    o=np.array(varimg).copy(); s=np.array(src.convert("RGBA")); o[mask]=s[mask]
    return Image.fromarray(o,"RGBA")
PAL=[237,184,41,75,241,8,355,317,160,225]
def shiny_deg(src):
    h,s,v,al,_,_,_=hsv(src);m=(al>0.05)&(s>SAT_T)&(v>0.18);d=dom(h,s,v,m)*360
    return sorted(PAL,key=lambda p:-min(abs(p-d),360-abs(p-d)))[0]

for iid in ["C1","C2","C3","C4","C5"]:
    full=Image.open(os.path.join(BASE,f"{iid}.png")).convert("RGBA")
    bb=full.getbbox(); crop=full.crop(bb)
    if iid=="C1":
        sh=cloud_variant(crop,241,blend=0.9); sh=paste_original(sh,crop,eye_mask(crop))
    else:
        sh=rotate_full(crop,shiny_deg(crop),sat_mult=1.45)
        if iid=="C3": sh=deorange(sh)
    canvas=Image.new("RGBA",full.size,(0,0,0,0)); canvas.paste(sh,(bb[0],bb[1]),sh)
    canvas.save(os.path.join(OUT,f"{iid}.png"))
    print("wrote shiny",iid,"canvas",full.size,"art@",bb[:2])
