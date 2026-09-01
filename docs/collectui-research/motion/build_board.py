import json
from pathlib import Path

root = Path(__file__).parent
sources = {x['id']: x for x in json.loads((root / 'sources.json').read_text())}
items = [
    dict(id='01-tabs', label='Tabs', name='Tactile tabs', author='Marcel', height=820, background='#0b0b0b',
         priority='Use first',
         lead='Softly raised buttons with a precise moving selection marker.',
         craft=[['Look', 'A fine rim and slight inset shading give each tab a physical edge. The selected label becomes clearer without changing size.'],
                ['Motion', 'The short active marker travels along a shared baseline. The button and marker read as one selection.'],
                ['Use in Strategy Court', 'Apply this to the Court, Evidence, Trades, and Audit navigation. Keep content stable while the indicator moves.']],
         application='Keep a compact button profile and a solid active marker. Prototype a 160 to 200 ms transition, with no bounce. These are proposed timings, not measured source values.',
         avoid='The source includes a light halo. Omit that halo in the current app direction. Use semantic tabs, keyboard navigation, and a separate visible focus ring.'),
    dict(id='02-expanding-list', label='List', name='An expanding list with an inset switch', author='Jeet', height=800, background='#fff',
         priority='Use first',
         lead='A small pale panel, a recessed mode switch, and a reveal of additional rows.',
         craft=[['Look', 'The hierarchy comes from spacing, a soft outer edge, and aligned labels. There is no separate card around each item.'],
                ['Motion', 'The panel changes height as rows are revealed. A white thumb moves inside the footer switch as the list mode changes.'],
                ['Use in Strategy Court', 'Use this for extra test results, strategy parameters, or an expanded list of warnings within a run inspector.']],
         application='Preserve the first visible row and the user’s focus. Start with a 200 to 260 ms height transition and a shorter row fade. The main page should stay flat.',
         avoid='Do not hide severe findings behind this disclosure. Extra content needs an explicit button, an item count, and correct expanded state.'),
    dict(id='03-toast-stack', label='Notifications', name='Notifications with depth', author='Benji Taylor', height=780, background='#000',
         priority='Use first',
         lead='One crisp front notification, with older notifications receding into a shallow stack.',
         craft=[['Look', 'Scale, overlap, and restrained shading establish depth. The front message has the strongest contrast and the cleanest outline.'],
                ['Motion', 'New messages move into the front position while the stack rearranges behind them.'],
                ['Use in Strategy Court', 'Use for report exports, copied evidence links, saved parameters, and completed background runs.']],
         application='Keep the newest message readable and offer an action such as Open report. Use one stable screen corner and cap the visible stack at three. Keep a persistent activity history.',
         avoid='Do not bury failures in a fading stack. Announce updates accessibly, pause dismissal while focused or hovered, and never use toasts as the only error record.'),
    dict(id='04-morphing-create', label='Create menu', name='A button becomes its menu', author='Lorenzo Cabra', height=1040, background='#fafaf8',
         priority='Prototype',
         lead='The original black pill expands into a menu, making the origin of the new controls unmistakable.',
         craft=[['Look', 'The trigger and menu share the same fill and visual identity. Icons and labels sit inside one shape.'],
                ['Motion', 'The boundary expands as menu content appears. The source uses an expressive spring and a pronounced rounded intermediate shape.'],
                ['Use in Strategy Court', 'Try this on a secondary Create action with choices such as a new case, an import, or a duplicated setup.']],
         application='Prototype with a smaller overshoot and 220 to 280 ms of motion. Reserve the effect for one distinct action, not every dropdown in the app.',
         avoid='Do not delay activation until animation ends. Preserve menu keyboard behavior, Escape dismissal, outside-click dismissal, and focus return. Leave sound off.'),
    dict(id='05-tick-dial', label='Dial', name='A dial made from fine ticks', author='Lorenzo Cabra', height=1010, background='#fafaf8',
         priority='Prototype',
         lead='Evenly spaced radial marks create a precise instrument around one readable value.',
         craft=[['Look', 'The value sits at the visual center. Active ticks form a clear arc, while inactive ticks fade into the background.'],
                ['Motion', 'The active arc responds to value changes. Its many small marks make each change visible without adding another chart.'],
                ['Use in Strategy Court', 'Explore it for one bounded setting such as test coverage or a resampling budget in advanced run setup.']],
         application='Pair the dial with a numeric input, clear units, and explicit limits. The dial can be a distinctive accent in setup while tables retain ordinary controls.',
         avoid='Do not turn the strategy verdict into a decorative gauge or imply extra precision. Provide keyboard steps and a linear control alternative.'),
    dict(id='06-pixel-ripple', label='Ripple button', name='A ripple through tiny cells', author='Raul', height=920, background='#fff',
         priority='Optional accent',
         lead='A field of small squares gives a simple button a more distinctive hover response.',
         craft=[['Look', 'The label remains a single clean layer above the cell texture. The grid has the same appeal as the approved dense matrix reference.'],
                ['Motion', 'A localized change travels through the small cells around the pointer. The effect stays inside the button.'],
                ['Use in Strategy Court', 'Try a restrained version on the first-run onboarding action or a replay control. Keep repeated table actions quiet.']],
         application='Use low-contrast monochrome cells or one existing accent. Keep the label sharp and activate immediately. Run the effect only while the control is engaged.',
         avoid='The source’s blue glow is not part of the recommendation. Avoid continuous waves, color cycling, extra GPU work across many buttons, and motion under small text.'),
]
for i in items:
    s = sources[i['id']]
    i.update(url=s['url'], source=s['source'], video=s['media'][0]['src'], fallback=f"screenshots/{i['id']}-source.jpg")
(root / 'shortlist.json').write_text(json.dumps(items, indent=2))

previous = (root.parent / 'round-2' / 'index.html').read_text()
template = previous[:previous.index('const references=')] + 'const references=__DATA__;\n' + previous[previous.index('const nav='):]
template = template.replace('Strategy Court · Revised visual references', 'Strategy Court · Motion and UI details')
template = template.replace('Strategy Court · Visual direction, revised', 'Strategy Court · Motion and UI details')
template = template.replace('Original videos by Jeet, discovered on CollectUI.', 'Original videos credited to their creators on CollectUI.')
template = template.replace('Jeet · Visual reference ${i+1} of 3', '${r.author} · ${r.priority} · ${i+1} of ${references.length}')
template = template.replace("r.name+' original video by Jeet'", "r.name+' original video by '+r.author")
template = template.replace("stage.style.setProperty('--media-height',r.height+'px');", "stage.style.setProperty('--media-height',r.height+'px');stage.style.background=r.background;")
template = template.replace('Where it belongs in Strategy Court', 'How I would implement it')
template = template.replace('Read the visual brief', 'Read the motion brief')
template = template.replace('Math.min(2,Math.max(0,Number(params.get(\'ref\'))||0))', 'Math.min(references.length-1,Math.max(0,Number(params.get(\'ref\'))||0))')
template = template.replace('Enlarged for inspection; no design changes.', 'Enlarged for inspection. Research references, not app mockups.')
template = template.replace('header strong{font-size:14px', 'header strong{white-space:nowrap;font-size:14px')
template = template.replace('nav button{border:0', 'nav button{white-space:nowrap;border:0')
template = template.replace('Jeet · Visual reference', 'Visual reference')
template = template.replace("scrub.oninput=()=>{v.currentTime=Number(scrub.value);v.pause()}", "scrub.oninput=()=>{v.currentTime=Math.max(0,Math.min(v.duration||0,Number(scrub.value)||0));v.pause()}")
template = template.replace('<button id="restart">Restart</button>', '<button id="restart">Restart</button><button id="frame">Full frame</button>')
template = template.replace("const scrub=document.querySelector('#scrub');", "document.querySelector('#frame').onclick=()=>{const fit=v.style.objectFit==='contain';v.style.height=fit?'':'100%';v.style.width=fit?'':'100%';v.style.objectFit=fit?'':'contain';document.querySelector('#frame').textContent=fit?'Full frame':'Detail view'};const scrub=document.querySelector('#scrub');")
(root / 'index.html').write_text(template.replace('__DATA__',json.dumps(items)))
print(f'Built motion board with {len(items)} original videos.')
