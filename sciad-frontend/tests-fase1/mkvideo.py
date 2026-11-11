import numpy as np
from PIL import Image, ImageFilter
W,H,FPS = 320,240,10
rng = np.random.default_rng(1)
def frame(qr=None, jitter=0):
    bg = np.full((H,W,3), (150,155,160), np.uint8)               # fondo gris (escena)
    img = Image.fromarray(bg)
    if qr is not None:
        q = Image.open(qr).convert('RGB').resize((200,200), Image.NEAREST)
        q = q.rotate(jitter, expand=False, fillcolor=(150,155,160), resample=Image.BILINEAR)
        img.paste(q, ((W-200)//2 + int(jitter), (H-200)//2))
    img = img.filter(ImageFilter.GaussianBlur(0.6))               # ligero desenfoque de lente
    a = np.asarray(img).astype(np.int16) + rng.normal(0, 4, (H,W,3)).astype(np.int16)  # ruido de sensor
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))
def to_yuv420(im):
    y,cb,cr = [np.asarray(c) for c in im.convert('YCbCr').split()]
    cb = cb.reshape(H//2,2,W//2,2).mean((1,3)).astype(np.uint8); cr = cr.reshape(H//2,2,W//2,2).mean((1,3)).astype(np.uint8)
    return y.tobytes()+cb.tobytes()+cr.tobytes()
timeline = [(None,3),('qr_A.png',6),(None,3),('qr_REV.png',6),(None,3),('qr_ALIEN.png',6),(None,3),('qr_A.png',6)]
with open('fake_cam.y4m','wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
    n=0
    for qr,sec in timeline:
        for i in range(sec*FPS):
            j = (np.sin(i/6.0)*2.0) if qr else 0   # ligero movimiento de mano
            f.write(b'FRAME\n'); f.write(to_yuv420(frame(qr, j))); n+=1
print('frames', n, 'segundos', n/FPS)
