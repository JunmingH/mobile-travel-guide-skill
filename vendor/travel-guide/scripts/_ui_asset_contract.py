"""Validate generated PWA icons separately from destination-photo provenance.

This does not exempt directories from the raster inventory. Only individually
declared, hash-verified app icons referenced by the PWA can enter that inventory.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image


def verify_ui_assets(root, manifest):
    valid_files, failures = set(), []
    for asset in manifest.get('ui_assets', []):
        name = str(asset.get('file', ''))
        try:
            path = (root / name).resolve()
            path.relative_to((root / 'pwa/icons').resolve())
            assert asset.get('role') == 'app_icon', 'unsupported UI role'
            assert asset.get('source_kind') == 'generated_locally', 'missing creation provenance'
            assert name not in valid_files, 'duplicate UI declaration'
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert digest == asset.get('sha256'), 'file hash changed'
            with Image.open(path) as image:
                image.load()
                assert image.format == 'PNG', 'app icon must be PNG'
                assert image.size == (asset.get('width'), asset.get('height')), 'dimensions changed'
                assert image.width == image.height and image.width >= 180, 'invalid icon size'
            evidence = (root / asset['verification_evidence']).resolve()
            evidence.relative_to(root.resolve())
            records = json.loads(evidence.read_text())['icons']
            record = next(row for row in records if row['file'] == name)
            assert record['sha256'] == digest, 'visual review does not match image'
            assert record.get('visually_reviewed') is True, 'visual review pending'
            assert len(record.get('observation', '')) >= 24, 'missing visual observation'
            pwa_manifest = json.loads((root / 'pwa/manifest.json').read_text())
            declared = {str((root / 'pwa' / row['src']).resolve()) for row in pwa_manifest['icons']}
            apple_ref = 'href="icons/apple-touch-icon.png"'
            if apple_ref in (root / 'pwa/index.html').read_text():
                declared.add(str((root / 'pwa/icons/apple-touch-icon.png').resolve()))
            assert str(path) in declared, 'icon not referenced by PWA'
            valid_files.add(name)
            # Published icons are exact copies of already-reviewed source icons.
            # Bind each explicit alias to its bytes, build receipt and app usage;
            # never exempt the publication directory from the raster inventory.
            for alias in asset.get('publication_copies', []):
                expected = 'github-pages/' + path.name
                assert alias == expected, 'unexpected publication icon path'
                copy_path = root / alias
                assert copy_path.resolve().parent == (root / 'github-pages').resolve(), 'icon leaves publication root'
                assert alias not in valid_files, 'duplicate publication icon declaration'
                assert hashlib.sha256(copy_path.read_bytes()).hexdigest() == digest, 'publication icon differs from reviewed source'
                build = json.loads((root / 'qa/github-pages-build.json').read_text())
                assert build['files'][path.name] == digest, 'publication receipt does not match icon'
                pub_manifest = json.loads((root / 'github-pages/manifest.json').read_text())
                pub_declared = {row['src'] for row in pub_manifest['icons']}
                if 'href="apple-touch-icon.png"' in (root / 'github-pages/index.html').read_text():
                    pub_declared.add('apple-touch-icon.png')
                assert path.name in pub_declared, 'publication icon is not referenced'
                valid_files.add(alias)
        except Exception as exc:
            failures.append(f'invalid UI asset {name}: {exc}')
    return valid_files, failures
