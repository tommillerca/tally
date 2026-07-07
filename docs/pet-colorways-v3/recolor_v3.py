#!/usr/bin/env python3
"""Pet recolor v3 — incorporates Tom's marked-up feedback (IMG_4377).
Region-aware: the old build did a GLOBAL hue rotation that recolored eyes/tongue/
shirt too. Here we protect/target those features and drop rejected colorways."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np, os
from scipy.ndimage import label as cclabel, binary_dilation as bd

BASE="/Users/tommiller/Documents/Hyperframes Editor/tally/assets/bh/C"
SP="/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad"
OUT=os.path.join(SP,"colorways-pets-v2"); os.makedirs(OUT,exist_ok=True)

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
SAT_T=0.22; BLEND=0.40
def rotate_full(img,deg,sat_mult=1.0):
    h,s,v,al,_,_,_=hsv(img);mask=(al>0.05)&(s>SAT_T)&(v>0.18)
    if mask.sum()==0: return img.copy()
    d=dom(h,s,v,mask);delta=(deg/360.0-d)
    h2=h.copy();s2=s.copy();h2[mask]=(h[mask]+delta)%1.0;s2[mask]=np.clip(s[mask]*sat_mult,0,1)
    return to_img(h2,s2,v,al)
def variant(img,deg,blend=BLEND):
    return Image.blend(img.convert("RGBA"),rotate_full(img,deg),blend)
def cloud_variant(img,deg,blend=BLEND):
    h,s,v,al,_,_,_=hsv(img);th=deg/360.0;h2,s2,v2=h.copy(),s.copy(),v.copy()
    body=(al>0.05)&(v>0.55)&(s<0.45);h2[body]=th;s2[body]=np.clip(0.06+s[body]*0.9,0,0.20)
    acc=(al>0.05)&(s>=0.45)
    if acc.sum(): dm=dom(h,s,v,acc);h2[acc]=(h[acc]+(th-dm))%1.0
    return Image.blend(img.convert("RGBA"),to_img(h2,s2,v2,al),min(1.0,blend+0.25))

def load(f):
    im=Image.open(os.path.join(BASE,f)).convert("RGBA");return im.crop(im.getbbox())

# ---------- feature masks ----------
def eye_mask(im):
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    up=(yy>0.27*H)&(yy<0.62*H)&(xx>0.28*W)&(xx<0.80*W)   # below the dome, above the belly
    cream=up&(al>0.5)&(v>0.66)&((r-b)>0.05)&(s>0.08)&(s<0.62)
    ys,xs=np.where(cream); box=(xs.min()-4,ys.min()-4,xs.max()+4,ys.max()+4)
    inb=(xx>=box[0])&(xx<=box[2])&(yy>=box[1])&(yy<=box[3])
    dark=inb&(al>0.6)&(v<0.30); white=inb&(al>0.6)&(v>0.90)&(s<0.12)
    return (cream&inb)|dark|white
def tongue_mask(im):
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    hd=h*360
    pink=(al>0.5)&((hd>320)|(hd<18))&(s>0.22)&(v>0.5)&(xx>0.42*W)&(xx<0.72*W)&(yy>0.25*H)&(yy<0.68*H)
    lab,n=cclabel(pink)
    if n:
        big=np.argmax([(lab==i).sum() for i in range(1,n+1)])+1
        m=(lab==big); m=bd(m,iterations=1)&(al>0.4)  # include the thin dark lip around it
        return m
    return pink
def shirt_mask(im):
    # Color-driven, no hand polygon: the shirt cream hits V up to 1.0 while the tan
    # body never exceeds ~0.85. Seed on bright cream, morphologically CLOSE to bridge
    # the stripe gaps into the true garment shape, drop small bits (teeth/claws/eye).
    from scipy.ndimage import binary_closing
    H,W=im.size[1],im.size[0]; h,s,v,al,r,g,b=hsv(im); yy,xx=np.mgrid[0:H,0:W]
    cream=(al>0.6)&(v>0.86)&(s<0.35)
    closed=binary_closing(cream,iterations=5,border_value=0)
    lab,n=cclabel(closed); shirt=np.zeros_like(cream)
    for i in range(1,n+1):
        c=(lab==i)
        if c.sum()<330: continue              # teeth/claws/eye-white are <=114px
        if np.where(c)[0].mean()<0.28*H: continue   # nothing up in the face/brow
        shirt|=c
    return shirt&(al>0.6)&(v>0.60)&(s<0.62)

# ---------- feature ops ----------
def paste_original(varimg, src, mask):
    o=np.array(varimg).copy(); s=np.array(src.convert("RGBA")); o[mask]=s[mask]
    return Image.fromarray(o,"RGBA")
def set_region_hue(varimg, mask, deg, sat=0.6):
    h,s,v,al,_,_,_=hsv(varimg); h2=h.copy();s2=s.copy()
    h2[mask]=deg/360.0; s2[mask]=np.clip(np.maximum(s[mask],sat),0,1)
    return to_img(h2,s2,v,al)
def deorange(varimg, to_deg=95):
    h,s,v,al,_,_,_=hsv(varimg); hd=h*360
    m=(al>0.4)&(s>0.28)&(hd>=15)&(hd<=52)   # stray orange -> lime, keep shading
    h2=h.copy();h2[m]=to_deg/360.0
    return to_img(h2,s,v,al)

# ---------- kept colorways per Tom's feedback ----------
KEEP={
 "C1":[("Mauve",317,"cloud")],
 "C2":[("Sky",225,"rot"),("Cyan",184,"rot")],
 "C3":[("Olive",75,"rot"),("Rose",355,"rot")],
 "C4":[("Cyan",184,"rot"),("Peri",241,"rot")],
 "C5":[("Cyan",184,"rot")],
}
PETS=[("C1","Cloud"),("C2","Duck"),("C3","Catfish"),("C4","Beardie"),("C5","Bulldog")]
# shiny target per pet (farthest palette hue, matching the approved shinies)
PAL=[237,184,41,75,241,8,355,317,160,225]
def shiny_deg(src):
    h,s,v,al,_,_,_=hsv(src);m=(al>0.05)&(s>SAT_T)&(v>0.18);d=dom(h,s,v,m)*360
    return sorted(PAL,key=lambda p:-min(abs(p-d),360-abs(p-d)))[0]

def build(iid):
    src=load(f"{iid}.png"); outs=[("ORIGINAL",src)]
    em=eye_mask(src) if iid=="C1" else None
    tm=tongue_mask(src) if iid=="C4" else None
    sm=shirt_mask(src) if iid=="C5" else None
    for name,deg,kind in KEEP[iid]:
        v = cloud_variant(src,deg) if kind=="cloud" else variant(src,deg)
        if iid=="C1": v=paste_original(v,src,em)                       # crisp eyes/blush/mouth
        if iid=="C4" and name=="Cyan": v=paste_original(v,src,tm)      # tongue original pink
        if iid=="C4" and name=="Peri": v=set_region_hue(v,tm,120,0.62) # green tongue
        if iid=="C5" and name=="Cyan": v=set_region_hue(v,sm,28,0.60)  # orange shirt
        v.save(os.path.join(OUT,f"{iid}__{name}.png")); outs.append((name,v))
    # shiny
    if iid=="C1":
        sh=cloud_variant(src,241,blend=0.9); sh=paste_original(sh,src,em)
    else:
        sh=rotate_full(src,shiny_deg(src),sat_mult=1.45)
        if iid=="C3": sh=deorange(sh)                                  # kill stray orange
    sh.save(os.path.join(OUT,f"{iid}__SHINY.png")); outs.append(("SHINY",sh))
    return outs

# ---------- sheet ----------
cell=225;pad_l=118;pad_t=64;cols=4   # ORIGINAL + up to 2 middles + SHINY (SHINY always last)
sheet=Image.new("RGBA",(pad_l+cell*cols,pad_t+cell*len(PETS)),(13,12,18,255))
d=ImageDraw.Draw(sheet)
font=ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc",17)
fsm=ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc",12)
d.text((pad_l+cell//2,32),"ORIGINAL",fill=(232,226,214,255),font=font,anchor="mm")
d.text((pad_l+3*cell+cell//2,32),"SHINY",fill=(255,201,97,255),font=font,anchor="mm")
for r,(iid,label) in enumerate(PETS):
    outs=build(iid)
    d.text((pad_l//2,pad_t+r*cell+cell//2-10),iid,fill=(232,226,214,255),font=font,anchor="mm")
    d.text((pad_l//2,pad_t+r*cell+cell//2+12),label,fill=(154,148,166,255),font=fsm,anchor="mm")
    # place: original col0, shiny col3, middles cols 1..2
    slots={}; slots[0]=outs[0]; slots[3]=outs[-1]
    mids=outs[1:-1]
    for i,mo in enumerate(mids): slots[1+i]=mo
    for c in range(cols):
        if c not in slots: continue
        name,var_=slots[c]; t=var_.copy(); t.thumbnail((cell-20,cell-34))
        x,y=pad_l+c*cell,pad_t+r*cell
        sheet.paste(t,(x+(cell-t.width)//2,y+(cell-34-t.height)//2+4),t)
        if name not in ("ORIGINAL","SHINY"):
            d.text((x+cell//2,y+cell-20),name,fill=(190,184,200,255),font=fsm,anchor="mm")
out=os.path.join(SP,"pet-sheet-v3.png"); sheet.convert("RGB").save(out); print("wrote",out)
