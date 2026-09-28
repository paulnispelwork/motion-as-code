"""Contact sheet from a rendered film: N evenly spaced frames, 5 per row, 320 px wide, time-stamped.

    python sheet.py film.mp4 out.jpg [N=20]

A sheet shows layout and grade only. It cannot show timing, easing or rhythm; watch the film playing.
"""
import sys, subprocess, json
from PIL import Image, ImageDraw
from motion import probe
f,out,n=sys.argv[1],sys.argv[2],int(sys.argv[3]) if len(sys.argv)>3 else 20
W,H,dur,_=probe(f); cols=5; rows=(n+cols-1)//cols
tw=320; th=int(tw*H/W)
sheet=Image.new("RGB",(cols*tw,rows*(th+14)),(40,40,40)); d=ImageDraw.Draw(sheet)
for i in range(n):
    t=dur*(i+0.5)/n
    p=subprocess.run(["ffmpeg","-v","quiet","-ss",f"{t:.2f}","-i",f,"-frames:v","1","-vf",f"scale={tw}:{th}","-f","rawvideo","-pix_fmt","rgb24","-"],capture_output=True)
    im=Image.frombytes("RGB",(tw,th),p.stdout)
    x=(i%cols)*tw; y=(i//cols)*(th+14)
    sheet.paste(im,(x,y+14)); d.text((x+3,y+1),f"{t:.1f}s",fill=(255,255,0))
sheet.save(out,quality=85)
