"""Shrinks a VRM (GLB) for mobile: downsizes embedded textures and re-encodes them as WebP.
Usage: python3 optimize_vrm.py in.vrm out.vrm [max_size]"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
data = open(src, 'rb').read()
jlen = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + jlen])
bstart = 20 + jlen + 8
blen = struct.unpack_from('<I', data, 20 + jlen)[0]
bin_ = data[bstart:bstart + blen]

img_views = {im['bufferView']: im for im in gltf.get('images', []) if 'bufferView' in im}
out = bytearray()
for i, bv in enumerate(gltf['bufferViews']):
    chunk = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    if i in img_views:
        im = Image.open(io.BytesIO(chunk))
        im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
        if max(im.size) > MAX:
            k = MAX / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=88, method=6)
        chunk = buf.getvalue(); img_views[i]['mimeType'] = 'image/webp'
    while len(out) % 4: out.append(0)
    bv['byteOffset'] = len(out); bv['byteLength'] = len(chunk); out += chunk
while len(out) % 4: out.append(0)
gltf['buffers'][0]['byteLength'] = len(out)
j = json.dumps(gltf, separators=(',', ':')).encode()
j += b' ' * (-len(j) % 4)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(out)))
    f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print(dst, f'{len(data)/1e6:.1f}MB -> {(28+len(j)+len(out))/1e6:.1f}MB')
