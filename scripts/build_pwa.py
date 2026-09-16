#!/usr/bin/env python3
"""Build a PWA from an intact full offline HTML; keep private source separate."""
import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import re
import shutil
import tempfile

from _mobile import SKILL, config, read, write, sha, commit_directory, now


def generate_icons(stage):
    from PIL import Image, ImageDraw
    folder = stage / 'icons'
    folder.mkdir()
    for size, filename in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
        image = Image.new('RGB', (size, size), '#193c30')
        draw = ImageDraw.Draw(image)
        scale = size / 512
        points = lambda rows: [(round(x*scale), round(y*scale)) for x,y in rows]
        draw.ellipse((round(136*scale),round(136*scale),round(376*scale),round(376*scale)), outline='#f5f3ed', width=max(2,round(12*scale)))
        draw.polygon(points([(256,155),(307,302),(256,274),(205,302)]), fill='#f5f3ed')
        image.save(folder / filename)


def build(root):
    root = Path(root).resolve()
    settings = config(root)
    app = settings['app']
    receipt = read(root / 'offline-export.json')
    source = Path(receipt['file'])
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != receipt['sha256']:
        raise ValueError('Offline HTML changed since export; re-export and review it')
    doc = raw.decode('utf-8')
    if '.atlas-topbar' not in doc or 'id="top"' not in doc:
        raise ValueError('Expected the full travel-guide interface, not a shortened reader')
    doc, count = re.subn(r'<meta\b(?=[^>]*name=["\x27]viewport["\x27])[^>]*>', '', doc, flags=re.I)
    if count != 1:
        raise ValueError('Expected exactly one viewport declaration')
    doc = re.sub(r'<meta\b[^>]*name=["\x27](?:theme-color|apple-mobile-web-app-[^"\x27]+)["\x27][^>]*>', '', doc, flags=re.I)
    doc = re.sub(r'<link\b(?=[^>]*rel=["\x27](?:manifest|apple-touch-icon|icon)["\x27])[^>]*>', '', doc, flags=re.I)
    meta = ('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=auto">'
            '<meta name="theme-color" content="'+escape(app['theme_color'], quote=True)+'">'
            '<meta name="apple-mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
            '<meta name="apple-mobile-web-app-title" content="'+escape(app['short_name'], quote=True)+'">'
            '<link rel="manifest" href="manifest.json">'
            '<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png">'
            '<link rel="icon" sizes="192x192" href="icons/icon-192.png">')
    doc = doc.replace('</head>', meta+'<link rel="stylesheet" href="style.css"></head>', 1)
    doc = doc.replace('</body>', '<script src="app.js" defer></script></body>', 1)
    doc = doc.replace('本地文件仅保存到这台设备。多人同步请打开云端手册。', '账目保存在这台设备。可为同行人记录分摊与还款。')
    stage = Path(tempfile.mkdtemp(prefix='.pwa-stage-', dir=root))
    try:
        (stage / 'index.html').write_text(doc, encoding='utf-8')
        for name in ['app.js', 'style.css']:
            shutil.copyfile(SKILL / 'assets/pwa' / name, stage / name)
        generate_icons(stage)
        manifest = {'id':'./','name':app['name'],'short_name':app['short_name'],'description':'离线旅行手册与本机旅行记录',
                    'lang':app['lang'],'dir':'ltr','start_url':'./index.html','scope':'./','display':'standalone',
                    'theme_color':app['theme_color'],'background_color':app['background_color'],
                    'icons':[{'src':'icons/icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},
                             {'src':'icons/icon-512.png','sizes':'512x512','type':'image/png','purpose':'any maskable'}]}
        write(stage / 'manifest.json', manifest)
        paths = ['index.html','app.js','style.css','manifest.json','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png']
        hashes = {name:sha(stage/name) for name in paths}
        version = 'travel-' + hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16]
        sw = (SKILL/'assets/pwa/service-worker.js').read_text().replace('__BUILD_VERSION__',version)
        (stage/'service-worker.js').write_text(sw)
        hashes['service-worker.js'] = sha(stage/'service-worker.js')
        commit_directory(root,stage,'pwa')
        write(root/'qa/pwa-build.json',{'status':'built_needs_browser_review','version':version,'core_html_sha256':receipt['sha256'],
                                      'files':hashes,'built_at':now(),'bytes':sum((root/'pwa'/n).stat().st_size for n in hashes)})
        # Declare icons for the upstream media audit, with genuinely pending review.
        asset_path = root/'asset-manifest.json'
        if asset_path.exists():
            assets=read(asset_path)
            assets['ui_assets']=[x for x in assets.get('ui_assets',[]) if x.get('role')!='app_icon']
            icons=[]
            for size,name in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
                name='pwa/icons/'+name
                assets['ui_assets'].append({'file':name,'role':'app_icon','source_kind':'generated_locally','sha256':sha(root/name),
                                           'width':size,'height':size,'verification_evidence':'qa/pwa-icon-review.json'})
                icons.append({'file':name,'sha256':sha(root/name),'visually_reviewed':False,'observation':''})
            review=root/'qa/pwa-icon-review.json'
            prior=read(review).get('icons',[]) if review.exists() else []
            for item in icons:
                matched=next((x for x in prior if x.get('file')==item['file'] and x.get('sha256')==item['sha256']),None)
                if matched: item.update(matched)
            write(review,{'icons':icons});write(asset_path,assets)
        print(json.dumps({'version':version,'status':'built_needs_browser_review','directory':str(root/'pwa')}))
    finally:
        if stage.exists(): shutil.rmtree(stage)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('workbench',type=Path)
    build(parser.parse_args().workbench)
