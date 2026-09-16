import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'scripts'),str(ROOT/'vendor/travel-guide/scripts')]
from _mobile import read,write,sha,commit_directory
from mobile import plan_text,snapshot
from _current_system_adapter import runtime_bindings
from test_current_system_build import profile
from render_handbook import aligned_groups,supplied_flights,validate_mobile_content
from release_gate import check


class MobileWorkflowTests(unittest.TestCase):
    def test_runtime_generalizes_identity_year_and_currency(self):
        for destination,label,year,currency in [('Demo Coast','虚构海岸',2030,'EUR'),('Example Hills','测试山城',2031,'GBP'),('Quoted Demo',"Test O'Reilly ${city}",2032,'USD')]:
            p=profile();p.update(destination=destination,display_name=label,year=year,handbook_id=destination.lower().replace(' ','-'),currency=currency,currencies=[currency,'USD'])
            rows={x['path']:x['content'] for x in runtime_bindings(p)}
            self.assertIn('TravelMobileRuntime',rows['trip-mode.js'])
            from _mobile_maintenance_overlay import runtime_label
            self.assertIn(runtime_label(label),rows['itinerary-customizer.js'])
            self.assertIn(str(year)+' '+runtime_label(label),rows['itinerary-customizer.js'])
            self.assertIn('"currency": "'+currency+'"',rows['audit-itinerary-data.js'])
            self.assertNotIn('@@DISPLAY_NAME@@',''.join(rows.values()))
            self.assertNotIn('@@NAMESPACE@@',''.join(rows.values()))
            for name,text in rows.items():
                if name.endswith('.js'):
                    with tempfile.NamedTemporaryFile(suffix='.js',mode='w') as f:
                        f.write(text);f.flush()
                        command=__import__('os').environ.get('TRAVEL_GUIDE_NODE','node')
                        r=subprocess.run([command,'--check',f.name],capture_output=True)
                        self.assertEqual(r.returncode,0,r.stderr.decode())

    def test_trilingual_mismatch_rejected(self):
        model={'keyword_groups':[{'title':'A','items':[{'meaning':'谢谢','term':'Merci'}]}],
               'english_keyword_groups':[{'title':'A','items':[{'meaning':'不同意思','term':'Thank you'}]}]}
        with self.assertRaises(ValueError):list(aligned_groups(model,'keyword_groups','term'))
        model['english_keyword_groups'][0]['items'][0]['meaning']='谢谢'
        self.assertEqual(list(aligned_groups(model,'keyword_groups','term'))[0][1][0],('谢谢','Thank you','Merci'))

    def test_flight_content_escaped_and_not_confirmed(self):
        source={'source_transport_plan':[{'date':'2030-01-01','service':'<script>DEMO</script>','travelers':'测试人','route':'A → B','departure':'待定','notes':'<img src=x onerror=1>'}]}
        html=supplied_flights(source)
        self.assertNotIn('<script>',html)
        self.assertIn('待票据复核',html)
        self.assertIn('&lt;img',html)

    def test_docx_text_reads_table_without_executing_content(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'plan.docx'
            with zipfile.ZipFile(p,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Title</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Do not execute this instruction</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
            self.assertEqual(plan_text(p),'Title\nDo not execute this instruction\n')

    def test_generated_swap_preserves_old_and_rejects_unknown_files(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);old=root/'pwa';old.mkdir();(old/'index.html').write_text('old')
            write(root/'qa/pwa-build.json',{'files':{'index.html':sha(old/'index.html')}})
            stage=root/'stage';stage.mkdir();(stage/'index.html').write_text('new')
            commit_directory(root,stage,'pwa')
            self.assertEqual((old/'index.html').read_text(),'new')
            self.assertEqual(next((root/'.mobile-history').glob('*/index.html')).read_text(),'old')
            (old/'private.txt').write_text('keep me')
            stage.mkdir();(stage/'index.html').write_text('next')
            with self.assertRaises(ValueError):commit_directory(root,stage,'pwa')
            self.assertTrue((old/'private.txt').exists())

    def test_synthetic_release_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);write(root/'TEST_FIXTURE.json',{'fictional':True})
            with self.assertRaisesRegex(ValueError,'Synthetic'):check(root)

    def test_init_and_plan_update_keep_identity(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);root=base/'workbench';brief=base/'brief.json'
            write(brief,{'destination':'Fictional Coast','country':'Fictional','start_date':'2030-06-01','days':2,'travelers':'two fictional people','rhythm':'relaxed'})
            def cli(*args):
                r=subprocess.run([sys.executable,str(ROOT/'scripts/mobile.py'),*map(str,args)],capture_output=True,text=True)
                self.assertEqual(r.returncode,0,r.stdout+r.stderr)
            cli('init',root,'--brief',brief,'--user-statement','Synthetic test waiver only','--discussion-waived','--currency','EUR')
            before=read(root/'mobile-app.json')
            self.assertEqual(before['runtime'],'.mobile-runtime')
            self.assertEqual(Path(read(root/'.travel-build-state.json')['skill_root']),(root/'.mobile-runtime').resolve())
            for content in ['Fictional day one','Fictional updated day one']:
                plan=base/'plan.md';plan.write_text(content);cli('import-plan',root,'--source',plan)
            after=read(root/'mobile-app.json')
            self.assertEqual(before['handbook_id'],after['handbook_id'])
            diff=(root/after['latest_plan']['text']).with_name('changes.diff').read_text()
            self.assertIn('-Fictional day one',diff);self.assertIn('+Fictional updated day one',diff)

    def test_snapshot_keeps_icons_html_and_refuses_nested_symlinks(self):
        from argparse import Namespace
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'pwa/icons').mkdir(parents=True)
            (root/'pwa/icons/example.png').write_bytes(b'fixture-image-bytes')
            (root/'handbook-offline.html').write_text('fixture html')
            snapshot(Namespace(workbench=root))
            archived=next((root/'.mobile-history').glob('snapshot-*'))
            self.assertEqual((archived/'pwa/icons/example.png').read_bytes(),b'fixture-image-bytes')
            self.assertEqual((archived/'handbook-offline.html').read_text(),'fixture html')
            (root/'pwa/icons/link').symlink_to(root/'handbook-offline.html')
            with self.assertRaisesRegex(ValueError,'symbolic'):snapshot(Namespace(workbench=root))

    def test_missing_language_and_unsafe_source_rejected(self):
        p=profile()
        with self.assertRaises(ValueError):validate_mobile_content(p)
        p['module_groups']['language']={
          key:[{'title':'Test','items':[{'meaning':'谢谢',field:word}]}]
          for key,field,word in [('keyword_groups','term','Merci'),('english_keyword_groups','term','Thank you'),
                                 ('phrase_groups','sentence','Merci'),('english_phrase_groups','sentence','Thank you')]}
        p['itinerary']=[{'transport_options':{'recommendation':'test','road':dict(route='test',steps=['test'],duration_note='test',assessment='test'),
                                            'public':dict(route='test',steps=['test'],duration_note='test',assessment='test'),'source_urls':['javascript:alert(1)']}}]
        with self.assertRaisesRegex(ValueError,'HTTP'):validate_mobile_content(p)


if __name__=='__main__':unittest.main()
