"""Build an explicitly fictional full-runtime fixture. Never production evidence."""
from pathlib import Path
import copy
import json
import shutil
import subprocess
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'scripts'),str(ROOT/'vendor/travel-guide/scripts')]
from _mobile import write,sha,call
from render_handbook import update_bindings
from build_render_bindings import heading
from export_mobile import export
from build_pwa import build


def create(root):
    root=Path(root).resolve()
    if root.exists() and any(root.iterdir()):raise ValueError('Fixture directory must be empty')
    root.mkdir(parents=True,exist_ok=True)
    (root/'assets').mkdir()
    from PIL import Image,ImageDraw
    image=Image.new('RGB',(900,600),'#c5d8c9');draw=ImageDraw.Draw(image)
    draw.line((100,500,450,180,800,360),fill='#193c30',width=12)
    for x,y in [(100,500),(450,180),(800,360)]:draw.ellipse((x-22,y-22,x+22,y+22),fill='#f9f5df')
    image.save(root/'assets/fixture.png')
    language={'language_code':'fr-FR','local_label':'法语',
      'keyword_groups':[{'title':'礼貌','items':[{'term':'Merci','meaning':'谢谢'}]}],
      'english_keyword_groups':[{'title':'礼貌','items':[{'term':'Thank you','meaning':'谢谢'}]}],
      'phrase_groups':[{'title':'点餐','items':[{'sentence':'L’addition, s’il vous plaît.','meaning':'请结账。'}]}],
      'english_phrase_groups':[{'title':'点餐','items':[{'sentence':'The bill, please.','meaning':'请结账。'}]}]}
    profile={'destination':'Example Coast','display_name':'虚构海岸测试','country':'Fictional','year':2030,'handbook_id':'fixture-coast',
      'currency':'EUR','currencies':['EUR','GBP','USD'],'map_delivery':'screenshots',
      'trip':{'start_date':'2030-06-01','end_date':'2030-06-02','days':2,'nights':1,'travelers':'两位虚构测试人物'},
      'cover':{'image':'assets/fixture.png','title':'功能测试示例','kicker':'FICTIONAL DEMO','summary':'虚构示例，不作为旅行建议。'},
      'transport':{'status':'pending','legs':[]},'stays':[{'status':'pending'}],'journey_phases':[],
      'source_transport_plan':[{'date':'2030-06-01','service':'DEMO-ONLY','travelers':'虚构人物','route':'虚构起点 → 虚构终点','departure':'待定','arrival':'待定','notes':'不是实际航班。'}],
      'module_groups':{'shopping':[],'experiences':[],'food':{'menu_primer':[],'menu_guide':{'cards':[]},'dedicated_trip':[],'reliable_chains':[],'local_snacks':[]},
        'preparation':{'essentials':[{'item':'测试清单','detail':'仅用于测试','priority':'建议'}],'confirm_ahead':[]},'language':language,'travel_notes':[]},
      'places':[],'itinerary':[],'render_bindings_file':'render-bindings.json'}
    for i in range(3):
        profile['places'].append({'id':f'p{i}','type':'station','display_name':f'虚构地点{i+1}','map_query':f'Fictional point {i+1}',
          'latitude':20+i*.01,'longitude':10+i*.01,'source_url':'https://example.org','description':'合成测试地点，不是真实地点','images':[{'file':'assets/fixture.png'}]})
    mode={'route':'虚构起点 → 虚构终点','steps':['合成路线步骤，仅用于UI测试'],'duration_note':'测试用20分钟','assessment':'不作为出行建议','conditions':['测试条件']}
    for day in range(2):
        profile['itinerary'].append({'date':f'2030-06-0{day+1}','theme':f'虚构第{day+1}天','summary':'合成行程说明',
          'periods':{'morning':'测试上午','afternoon':'测试下午','evening':'测试晚间'},
          'transport_options':{'recommendation':'测试两种交通展示','road':copy.deepcopy(mode),'public':copy.deepcopy(mode),'source_urls':['https://example.org']},
          'route_screenshots':[{'file':'assets/fixture.png','caption':'合成路线图片 · 不代表真实地图','kind':'offline_overview'}],
          'stops':[{'place_id':f'p{i}','arrival_time':f'{9+i}:00','duration_minutes':30,'transport_mode':'walk','transfer_minutes':10,'distance_km':.5,'note':'测试'} for i in range(3)]})
    runtime=ROOT/'vendor/travel-guide'
    write(root/'TEST_FIXTURE.json',{'fictional':True,'not_production_evidence':True})
    write(root/'destination-profile.json',profile)
    write(root/'mobile-app.json',{'schema':1,'skill_version':'1.0.0','runtime':str(runtime),
      'app':{'name':'虚构海岸功能测试','short_name':'测试手册','lang':'zh-CN','theme_color':'#f5f3ed','background_color':'#f5f3ed'},'publication':{'mode':'encrypted'}})
    call(runtime/'scripts/install_ui_system.py',root,'--force-template')
    call(runtime/'scripts/build_render_bindings.py',root/'destination-profile.json',root/'render-bindings.json')
    bindings=json.loads((root/'render-bindings.json').read_text())
    write(root/'render-bindings.json',update_bindings(profile,bindings,heading))
    call(runtime/'scripts/render_destination.py',root/'destination-profile.json',root)
    # A generated test picture is not licensed real map evidence. Bypass only the
    # upstream map-provenance gate inside this explicit unit fixture; the real
    # export command and release_gate retain that gate and reject this fixture.
    import package_handbook
    with patch.object(package_handbook,'verify_captures',return_value=[]):export(root)
    build(root)
    return root


if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: make_fixture.py EMPTY_DIRECTORY')
    create(sys.argv[1])
