"""Motion, hold, cut, grade and palette metrics for a rendered film (30 fps, 128 px wide, luminance).

    python motion.py film.mp4 [more.mp4 ...]      one JSON line per file

motion       mean absolute frame-to-frame luminance difference (levels 0-255)
still_pct    % of frames that differ from the previous by under 0.25 levels
hold_max     longest run of still frames, s;  holds_gt1s: number of still runs of 1 s or more
cuts_per10   hard cuts per 10 s (diff > 14 levels and > 5x the local median)
L_p5/L_med/L_p95   luminance percentiles (frames sampled twice a second)
pal90        3-bit-per-channel colour bins that cover 90 % of pixels
chroma_pct   % of pixels that are saturated (> 0.35) and not dark
"""
import sys, subprocess, json, numpy as np
def probe(f):
    o=json.loads(subprocess.run(["ffprobe","-v","quiet","-print_format","json","-show_streams","-show_format",f],capture_output=True,text=True).stdout)
    v=[s for s in o["streams"] if s["codec_type"]=="video"][0]
    a=[s for s in o["streams"] if s["codec_type"]=="audio"]
    return int(v["width"]),int(v["height"]),float(o["format"]["duration"]),len(a)>0
def analyse(f, fps=30):
    W,H,dur,aud=probe(f)
    w=128; h=int(round(H*w/W/2)*2)
    p=subprocess.run(["ffmpeg","-v","quiet","-i",f,"-vf",f"fps={fps},scale={w}:{h}:flags=area","-f","rawvideo","-pix_fmt","rgb24","-"],capture_output=True)
    a=np.frombuffer(p.stdout,np.uint8).reshape(-1,h,w,3).astype(np.float32)
    lum=(0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2])
    d=np.abs(np.diff(lum,axis=0)).mean(axis=(1,2))  # per-frame mean abs diff
    n=len(d)
    # cuts: diff > 18 levels and > 6x local median
    med=np.array([np.median(d[max(0,i-15):i+15]) for i in range(n)])
    cuts=np.where((d>14)&(d>5*np.maximum(med,0.3)))[0]
    # merge cuts within 5 frames
    cl=[]; 
    for c in cuts:
        if not cl or c-cl[-1]>5: cl.append(c)
    still=d<0.25
    # hold segments
    holds=[];run=0
    for s in still:
        if s: run+=1
        else:
            if run: holds.append(run)
            run=0
    if run: holds.append(run)
    holds=np.array(holds)/fps if holds else np.array([0.0])
    # palette: quantise to 4 bits/channel-ish on hue: count colours covering 90% of pixels (frames sampled 2/s)
    samp=a[::fps//2].reshape(-1,3)
    q=(samp//32).astype(int); keys=q[:,0]*64+q[:,1]*8+q[:,2]
    cnt=np.bincount(keys,minlength=512); cs=np.sort(cnt)[::-1].cumsum()/cnt.sum()
    pal90=int(np.searchsorted(cs,0.9)+1)
    # saturation share
    mx=samp.max(1); mn=samp.min(1); sat=(mx-mn)/np.maximum(mx,1)
    chroma=float(((sat>0.35)&(mx>60)).mean())
    L=lum[::fps//2].ravel()
    per10=len(d)/fps/10
    return dict(file=f.split("/")[-1], dur=round(dur,1), ar=f"{W}x{H}", audio=aud,
      motion=round(float(d.mean()),2), still_pct=round(float(still.mean()*100)), hold_max=round(float(holds.max()),1),
      holds_gt1s=int((holds>=1).sum()), cuts=len(cl), cuts_per10=round(len(cl)/per10,1),
      L_p5=int(np.percentile(L,5)), L_med=int(np.median(L)), L_p95=int(np.percentile(L,95)), pal90=pal90, chroma_pct=round(chroma*100))
if __name__=="__main__":
    for f in sys.argv[1:]:
        try: print(json.dumps(analyse(f)))
        except Exception as e: print(json.dumps(dict(file=f,err=str(e))))
