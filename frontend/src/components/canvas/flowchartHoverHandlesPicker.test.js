import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #410: the "+" handle used to hardcode `store.addFlowchartChildShape(handle.nodeId,
// 'process')` — clicking it could only ever grow the chart with a Process step, no
// matter which of the eleven standard flowchart shapes (spec B3) the user actually
// wanted next, and #2 in that issue made converting it afterwards impossible.
// FlowchartHoverHandles can't mount in the node env, so pin the fix by source
// inspection (house pattern, cf. structuralConnector.test.js).
const dir = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(dir, './FlowchartHoverHandles.vue'), 'utf8')
const menu = readFileSync(path.join(dir, './FlowchartNodeTypeMenu.vue'), 'utf8')
const canvas = readFileSync(path.join(dir, './DiagramCanvas.vue'), 'utf8')

describe('the "+" handle opens the node-type picker instead of a hardcoded Process (#410)', () => {
  it('no longer creates a node directly off a "+" click', () => {
    expect(src).not.toContain("addFlowchartChildShape(handle.nodeId, 'process')")
  })

  it('a click opens FlowchartNodeTypePicker, which offers every standard type', () => {
    expect(src).toContain('@click.stop="openPicker(handle)"')
    expect(menu).toContain('<FlowchartNodeTypePicker @choose="chooseType" @close="closeFlowchartPicker" />')
  })

  it('choosing a type creates it and drops straight into naming it', () => {
    expect(menu).toContain('store.addFlowchartChildShape(parentId, nodeType, port, side)')
    expect(menu).toContain('editing.beginTextEdit(id, { selectAll: true })')
  })

  it('positions the picker through the shared placePicker, not by hand', () => {
    expect(menu).toContain("import { placePicker } from '@/diagram/flowchartLayout.js'")
    // The menu size is MEASURED off the rendered panel now, with the constants kept
    // only as a first-frame fallback — a hardcoded height drifts the moment the
    // picker gains a row.
    expect(menu).toContain('placePicker({ box, menu, bounds, direction:')
    expect(menu).toContain('const menu = measured.value || { w: MENU_W_FALLBACK, h: MENU_H_FALLBACK }')
    expect(menu).toContain('panel.value?.getBoundingClientRect()')
  })

  // #441 item 10, and the sharper reason behind it. Inside the SVG the menu obeyed
  // paint order, and on a unified document the shapes paint later (WhiteboardLayer)
  // than this overlay — so it opened BEHIND the nodes, and SVG has no z-index to
  // fix that with. A <Teleport> is NOT enough either: Vue creates elements in the
  // namespace of the surrounding template, so a <div> declared in here is built as
  // an SVG-namespaced div with no CSS box — `position: fixed` never applies and the
  // menu collapses to zero width. It has to be DECLARED outside the <svg>.
  it('renders no menu markup itself, only the "+" that opens one', () => {
    // Closing/complete tags, so the prose explaining the move does not match.
    expect(src).not.toContain('<Teleport to="body">')
    expect(src).not.toContain('</foreignObject>')
    expect(src).not.toContain('<FlowchartNodeTypePicker')
  })

  it('records the open menu in the shared store instead', () => {
    expect(src).toContain('openFlowchartPicker(handle.nodeId, screenBoxOf(handle.nodeId), handle.port, handle.side)')
    expect(menu).toContain('v-if="flowchartUi.picker"')
    expect(menu).toContain('class="fixed z-50"')
  })

  // Its position is a screen point captured at open time, so anything that moves
  // the canvas without a pointerdown has to close it.
  it('closes on the wheel and on resize, which no pointerdown would catch', () => {
    expect(menu).toContain("window.addEventListener('wheel', closeFlowchartPicker, true)")
    expect(menu).toContain("window.addEventListener('resize', closeFlowchartPicker)")
    expect(menu).toContain("window.removeEventListener('wheel', closeFlowchartPicker, true)")
    expect(menu).toContain("window.removeEventListener('resize', closeFlowchartPicker)")
  })

  // The menu is mounted in the canvas's HTML layer, after the <svg> closes.
  it('is mounted outside the canvas svg', () => {
    const svgEnd = canvas.indexOf('</svg>')
    const mount = canvas.indexOf('<FlowchartNodeTypeMenu />')
    expect(mount).toBeGreaterThan(svgEnd)
  })

  // The "+" itself has a paint-order problem of the same family (#441). On the
  // unified canvas the shapes and connectors are drawn by WhiteboardLayer, so
  // mounting the handles before it put the "+" UNDERNEATH every connector — behind
  // them visually, and unclickable wherever a route or a branch label crossed it.
  it('paints the "+" handles after the layer that draws shapes and connectors', () => {
    const whiteboard = canvas.indexOf('<WhiteboardLayer')
    const handles = canvas.indexOf('<FlowchartHoverHandles />')
    expect(whiteboard).toBeGreaterThan(-1)
    expect(handles).toBeGreaterThan(whiteboard)
  })

  // #441 round 2: the label pill is double-click-to-rename, so it takes pointer
  // events. That is safe only because the handles paint after the connectors — SVG
  // hit-testing follows paint order, so a "+" over a label still wins the click.
  it('makes the connector label double-click-to-rename', () => {
    const connector = readFileSync(path.join(dir, './ConnectorView.vue'), 'utf8')
    expect(connector).toContain('@dblclick.stop="onConnectorDblClick"')
  })

  // The subtle one. The outside-close listener is on the CAPTURE phase, so it has
  // already run by the time the picker's own pointerdown.stop could stop it —
  // without excluding the picker's DOM, choosing a type would null pickerNodeId
  // before the click handler that reads it ever fired.
  it('excludes the picker itself from the capture-phase outside-close', () => {
    expect(menu).toContain("event.target?.closest?.('[data-fc-picker]')")
    expect(menu).toContain("document.addEventListener('pointerdown', onDocumentPointerDown, true)")
    expect(menu).toContain("document.removeEventListener('pointerdown', onDocumentPointerDown, true)")
  })
})

// #441 round 2, the hover bug the user kept hitting: "I see a + icon, as soon as I
// go to click it, it disappears." Widening the hover region did NOT fix it, because
// the region was never consulted — the listeners were on the canvas <svg>, which is
// pointer-events:none with only its painted children interactive. The empty gap
// between a node and its "+" is not a painted child, so crossing into it fired
// `pointerleave` on the SVG and cleared the hover outright. The handle vanished at
// the exact moment the user set off toward it. The surface spans the whole canvas,
// so the gap is just more surface and events over the shapes still bubble to it.
describe('the "+" survives the trip from the node to the handle (#441 round 2)', () => {
  it('listens on the canvas surface, not on the pointer-events:none <svg>', () => {
    expect(src).toContain(`surface = svg?.closest('[role="application"]') || svg`)
    expect(src).toContain("surface.addEventListener('pointermove', onPointerMove)")
    expect(src).toContain("surface.addEventListener('pointerleave', onPointerLeave)")
    expect(src).not.toMatch(/svg\.addEventListener\('pointer(move|leave)'/)
  })

  it('drops the hover on leave only after a grace period, so it cannot flicker', () => {
    expect(src).toContain('const LEAVE_GRACE_MS =')
    expect(src).toContain('leaveTimer = setTimeout(')
    // Any subsequent move cancels the pending drop — a real departure has none.
    expect(src).toMatch(/function onPointerMove\(event\) \{\s*\n\s*clearPendingLeave\(\)/)
  })

  it('routes hover through the pure state machine that defends the current node', () => {
    expect(src).toContain('hoveredId.value = nextHoverTarget({')
    expect(src).toContain('currentId: hoveredId.value,')
    expect(src).not.toContain('hoveredId.value = nodeAtPoint(')
  })

  it('unmounting clears a pending leave timer instead of leaking it', () => {
    expect(src).toMatch(/onBeforeUnmount\(\(\) => \{\s*\n\s*clearPendingLeave\(\)/)
  })

  it('stops pointerdown and mousedown on both flowchart and mindmap handles so clicking unselected node handle fires on first click (#576)', () => {
    const mmSrc = readFileSync(path.join(dir, './MindmapHoverHandles.vue'), 'utf8')
    expect(src).toContain('@pointerdown.stop')
    expect(src).toContain('@mousedown.stop')
    expect(src).toContain('@click.stop="openPicker(handle)"')
    expect(mmSrc).toContain('@pointerdown.stop')
    expect(mmSrc).toContain('@mousedown.stop')
    expect(mmSrc).toContain('@click.stop="add(handle)"')
  })
})
