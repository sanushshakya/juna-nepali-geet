"""Draws the app icons (Gaurishankar twin peaks at golden hour, the mountain is the whole icon). Needs Pillow: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
S=1024
def lerp(a,b,t):return tuple(round(a[i]+(b[i]-a[i])*t) for i in range(3))
def scene(k=1.0):
    im=Image.new('RGB',(S,S));d=ImageDraw.Draw(im)
    stops=[(0,(45,74,134)),(.35,(180,143,168)),(.6,(242,167,116)),(.8,(255,212,154))]
    for y in range(S):
        t=y/S
        for i in range(len(stops)-1):
            if stops[i][0]<=t<=stops[i+1][0]:
                u=(t-stops[i][0])/(stops[i+1][0]-stops[i][0]);c=lerp(stops[i][1],stops[i+1][1],u);break
        else:c=stops[-1][1]
        d.line([(0,y),(S,y)],fill=c)
    glow=Image.new('RGBA',(S,S),(0,0,0,0));g=ImageDraw.Draw(glow);g.ellipse([640,200,960,520],fill=(255,240,190,110));g.ellipse([740,300,860,420],fill=(255,247,220,255))
    im.paste(glow.filter(ImageFilter.GaussianBlur(28)),(0,0),glow.filter(ImageFilter.GaussianBlur(28)))
    P=lambda pts:[(512+(x-512)*k,640+(y-640)*k) for x,y in pts]   # scale about the base centre
    def poly(pts,col):d.polygon(P(pts),fill=col)
    # Shankar (left, taller) and Gauri (right, sharper) with the saddle between
    poly([(50,900),(260,600),(380,340),(430,400),(490,470),(560,420),(620,350),(680,430),(770,500),(900,640),(980,900)],(138,141,181))
    poly([(50,900),(260,600),(380,340),(410,560),(330,900)],(163,159,200))
    poly([(380,340),(430,400),(490,470),(470,640),(330,900),(410,560)],(122,126,174))
    poly([(490,470),(560,420),(620,350),(600,640),(560,900),(470,640)],(154,151,194))
    poly([(620,350),(680,430),(770,500),(900,640),(980,900),(560,900),(600,640)],(85,90,143))
    poly([(330,420),(380,340),(430,400),(410,430),(385,470),(360,430)],(255,250,240))
    poly([(380,340),(430,400),(410,430),(385,470)],(200,208,238))
    poly([(560,420),(620,350),(680,430),(650,470),(620,440),(595,480)],(255,250,240))
    poly([(620,350),(680,430),(650,470),(620,440)],(200,208,238))
    d.line(P([(260,600),(380,340),(430,400)]),fill=(255,226,170),width=max(3,round(10*k)))
    d.line(P([(490,470),(560,420),(620,350),(680,430)]),fill=(255,226,170),width=max(3,round(10*k)))
    # foreground hill + tiny stupa
    hill=Image.new('RGBA',(S,S),(0,0,0,0));h=ImageDraw.Draw(hill)
    h.ellipse([-260,800,1290,1500],fill=(58,89,69,255));h.ellipse([-100,880,1130,1500],fill=(43,71,53,255))
    im.paste(hill,(0,0),hill)
    return im
def save(im,name,size):im.resize((size,size),Image.LANCZOS).save('src/icons/'+name,optimize=True)
full=scene(1.3);safe=scene(.92)
save(full,'icon-192.png',192);save(full,'icon-512.png',512);save(safe,'icon-maskable-512.png',512);save(full,'apple-touch-icon.png',180)

full.resize((256,256),Image.LANCZOS).save('src/icons/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
