"""Render source-backed language, supplied flights and daily transport fragments.

Uses registered fragment bindings and the official installer/renderer. No exported
HTML or installed skill source is patched. Re-run after changing source packs.
"""
from __future__ import annotations
import argparse
import html
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
from _mobile import runtime, config


def e(value):
    return html.escape(str(value), quote=True)


def validate_mobile_content(profile):
    model = profile['module_groups']['language']
    for key, field in [('keyword_groups', 'term'), ('phrase_groups', 'sentence')]:
        if not model.get(key) or not model.get('english_' + key):
            raise ValueError('Mobile handbooks require Chinese, English and local-language cards')
        list(aligned_groups(model, key, field))
    for day in profile['itinerary']:
        options = day.get('transport_options', {})
        if not options.get('recommendation'):
            raise ValueError('Every day needs a transport recommendation, including rest days')
        for mode in ('road', 'public'):
            value = options.get(mode, {})
            if not all(value.get(key) for key in ('route', 'steps', 'duration_note', 'assessment')):
                raise ValueError('Every day needs road/public steps and assessment; explain when not applicable')
        for url in options.get('source_urls', []):
            parsed = urlsplit(url)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('Transport source must be an HTTP(S) page without credentials')


def aligned_groups(model, key, field):
    local, english = model[key], model['english_' + key]
    if len(local) != len(english):
        raise ValueError('Language group counts differ')
    for group, en_group in zip(local, english):
        if group['title'] != en_group['title'] or len(group['items']) != len(en_group['items']):
            raise ValueError('Language groups are not aligned')
        rows = []
        for item, en_item in zip(group['items'], en_group['items']):
            if item['meaning'] != en_item['meaning']:
                raise ValueError('Chinese meanings differ across translations')
            values = (item['meaning'], en_item.get(field), item.get(field))
            if not all(isinstance(v, str) and v.strip() for v in values):
                raise ValueError('Every language card requires three nonempty translations')
            rows.append(values)
        yield group['title'], rows


def words(profile, heading):
    model = profile['module_groups']['language']
    local_label = model['local_label']
    local_code = model['language_code'].split('-')[0]
    groups = []
    for title, rows in aligned_groups(model, 'keyword_groups', 'term'):
        items = ''.join(
            '<div data-language-card="word"><strong lang="zh-CN">' + e(zh) + '</strong>'
            '<span>英语 · <strong lang="en">' + e(en) + '</strong><br>'
            + e(local_label) + ' · <b lang="' + e(local_code) + '">' + e(local) + '</b></span></div>'
            for zh, en, local in rows)
        groups.append('<details class="vocab"><summary><h3>' + e(title) + '</h3><span>'
                      + str(len(rows)) + ' 词</span><i>＋</i></summary><div class="vocab-items">'
                      + items + '</div></details>')
    phrases = []
    for i, (title, rows) in enumerate(aligned_groups(model, 'phrase_groups', 'sentence'), 1):
        items = ''.join(
            f'<div data-language-card="phrase"><span>{j:02d}</span><p>'
            '<strong lang="zh-CN">' + e(zh) + '</strong><br>英语<br><strong lang="en">'
            + e(en) + '</strong><br>' + e(local_label) + '<br><b lang="' + e(local_code) + '">'
            + e(local) + '</b></p></div>'
            for j, (zh, en, local) in enumerate(rows, 1))
        phrases.append(f'<details class="phrase-group"><summary><span>{i:02d}</span><b>'
                       + e(title) + '</b><em>' + str(len(rows)) + ' 句</em><i>＋</i></summary>'
                       '<div class="phrase-grid">' + items + '</div></details>')
    # Only the local-language text uses <b> inside a card. The existing speech
    # hook selects that node and reads it using profile.language_code.
    return ('<div class="shell">' + heading('07', 'LANGUAGE COMPANION', '语言随行锦囊',
            profile.get('language_summary', '')) + '<div class="language-edition"><h3>中文｜英语｜'
            + e(local_label) + '</h3><p>' + e(model.get('usage_note_zh', ''))
            + '</p><div class="vocab-grid">' + ''.join(groups) + '</div>'
            '<div class="phrase-title"><p class="eyebrow">HIGH-FREQUENCY PHRASES</p>'
            '<h3>现场高频句</h3></div><div class="phrase-groups">' + ''.join(phrases)
            + '</div><p class="fineprint">' + e(model.get('note_zh', ''))
            + '</p></div><a class="back-to-contents" href="#contents">↑ 回到目录</a></div>')


def supplied_flights(profile):
    records = profile.get('source_transport_plan', [])
    if not records:
        return ''
    cards = []
    for leg in records:
        cards.append('<article class="hotel-card stay-pending" style="display:block" data-supplied-flight="' + e(leg['service'])
                     + '"><div class="hotel-copy"><p class="eyebrow">' + e(leg['date']) + ' · ' + e(leg.get('status_label', '用户提供的计划 · 待票据复核')) + '</p>'
                     '<h3>' + e(leg['service']) + '</h3><p><b>'
                     + e(leg['travelers']) + '</b> · ' + e(leg['route']) + '</p>'
                     '<dl><div><dt>起飞</dt><dd>' + e(leg['departure']) + '（原方案）</dd></div>'
                     '<div><dt>抵达</dt><dd>' + e(leg.get('arrival', '原方案未提供')) + '</dd></div>'
                     '<div><dt>航站楼</dt><dd>' + e(leg.get('terminal', '待票据复核')) + '</dd></div></dl>'
                     '<p>' + e(leg['notes']) + '</p></div></article>')
    return ('<div data-supplied-flights><h3>本次航班</h3><p>以下按你提供的原方案展示；'
            '未标明已核票的内容属于计划信息，以实际客票及航司通知为准。</p>'
            + ''.join(cards) + '</div>')


def transport_panel(day):
    options = day.get('transport_options')
    if not options:
        return ''
    def mode(label, key):
        value = options[key]
        steps = '<br>'.join(f'{i}. {e(step)}' for i, step in enumerate(value['steps'], 1))
        conditions = '<br>'.join(e(c) for c in value.get('conditions', []))
        return ('<strong>' + label + '</strong><p style="font-size:14px!important;line-height:1.85!important"><b>' + e(value['route']) + '</b><br><span>'
                + steps + '</span><br><br><span><b>预计耗时：</b>' + e(value['duration_note'])
                + '</span><br><br><span><b>路线评价：</b>' + e(value['assessment']) + '</span>'
                + ('<br><br><span><b>使用条件：</b><br>' + conditions + '</span>' if conditions else '') + '</p>')
    links = ' · '.join('<a href="' + e(url) + '" target="_blank" rel="noreferrer">'
                        + '交通来源 ' + str(i) + ' ↗</a>' for i, url in enumerate(options.get('source_urls', []), 1))
    return ('<details class="atlas-fold transport-comparison" data-transport-options="' + e(day['date']) + '">'
            '<summary class="atlas-fold-summary"><span class="day-index">车</span><span>'
            '<b>交通方案与路线评价</b><em>租车／包车 · 公共交通 · 推荐选择</em></span><i>＋</i></summary>'
            '<div class="day-detail transport-options">'
            '<strong>交通</strong><p>耗时为规划估计，含常规接驳范围；以当天班次、路况和最终酒店位置调整。</p>'
            + '<strong>建议</strong><p style="font-size:14px!important;line-height:1.85!important"><b>' + e(options['recommendation']) + '</b></p>'
            + mode('租车', 'road') + mode('公交', 'public')
            + '<strong>来源</strong><p>' + links + '</p></div></details>')


def update_bindings(profile, bindings, heading):
    validate_mobile_content(profile)
    for binding in bindings['html']:
        if binding['selector'] == '#words' and profile['module_groups']['language'].get('english_keyword_groups'):
            binding['inner_html'] = words(profile, heading)
        elif binding['selector'] == '#stay':
            source = binding['inner_html']
            marker = '<article class="hotel-card'
            if marker not in source:
                raise ValueError('Expected canonical hotel-card anchor')
            binding['inner_html'] = source.replace(marker, supplied_flights(profile) + marker, 1)
        elif binding['selector'] == '#route' and any(d.get('transport_options') for d in profile['itinerary']):
            marker = '<details class="day-route-map">'
            parts = binding['inner_html'].split(marker)
            if len(parts) != len(profile['itinerary']) + 1:
                raise ValueError('Each day must have one canonical Mini Route anchor')
            output = parts[0]
            for day, part in zip(profile['itinerary'], parts[1:]):
                output += transport_panel(day) + marker + part
            binding['inner_html'] = output
    return bindings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workbench', type=Path)
    args = parser.parse_args()
    root = args.workbench.resolve()
    scripts = runtime(root) / 'scripts'
    settings = config(root)
    framing_path = root / 'research/framing.json'
    framing = json.loads(framing_path.read_text())
    if settings.get('handbook_id'):
        if framing.get('handbook_id') and framing['handbook_id'] != settings['handbook_id']:
            raise ValueError('Do not change an existing handbook storage identity')
        framing['handbook_id'] = settings['handbook_id']
    for key in ('currency', 'currencies'):
        if key in settings: framing[key] = settings[key]
    framing_path.write_text(json.dumps(framing, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(scripts))
    from build_render_bindings import heading
    def run(name, *items):
        subprocess.run([sys.executable, str(scripts / name), *(str(i) for i in items)], check=True)
    run('compile_destination_profile.py', root)
    profile_path = root / 'destination-profile.json'
    profile = json.loads(profile_path.read_text())
    binding_path = root / profile.get('render_bindings_file', 'render-bindings.json')
    run('build_render_bindings.py', profile_path, binding_path)
    bindings = update_bindings(profile, json.loads(binding_path.read_text()), heading)
    binding_path.write_text(json.dumps(bindings, ensure_ascii=False, indent=2) + '\n')
    run('install_ui_system.py', root, '--system', profile.get('ui_system', 'current-system'), '--force-template')
    run('render_destination.py', profile_path, root)
    print('PASS source-backed fragment updates applied through official renderer')


if __name__ == '__main__':
    main()
