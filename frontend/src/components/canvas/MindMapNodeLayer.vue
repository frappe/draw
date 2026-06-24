<script setup>
// Renders a laid-out mind map: parent→child links (placeholder straight lines;
// styled curved branch connectors arrive in M3) and node pills (root distinct).
// Each node is a <g transform> with a CSS transition so re-layout animates
// (spec M1 AC; Part G11 — keyed, no full re-render). A hover "+" adds a child —
// the minimal M1 affordance; the full keyboard model lands in M2.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const props = defineProps({
  mindmap: { type: Object, required: true },
  positions: { type: Object, required: true },
})

const store = useDiagramStore()

function center(id) {
  const box = props.positions[id]
  return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: 0, y: 0 }
}

// One placeholder link per non-root node, parent-centre to child-centre.
const links = computed(() =>
  props.mindmap.nodes
    .filter((node) => node.parentId)
    .map((node) => ({ id: node.id, from: center(node.parentId), to: center(node.id) })),
)

const nodes = computed(() =>
  props.mindmap.nodes
    .map((node) => ({ node, box: props.positions[node.id] }))
    .filter((entry) => entry.box),
)

function isRoot(id) {
  return props.mindmap.rootId === id
}

function addChild(id) {
  store.addChildNode(id)
}
</script>

<template>
  <g>
    <line
      v-for="link in links"
      :key="link.id"
      :x1="link.from.x"
      :y1="link.from.y"
      :x2="link.to.x"
      :y2="link.to.y"
      stroke="#C7C7C7"
      stroke-width="2"
    />

    <g
      v-for="{ node, box } in nodes"
      :key="node.id"
      class="fd-mm-node"
      :style="{ transition: 'transform 200ms ease' }"
      :transform="`translate(${box.x} ${box.y})`"
    >
      <rect
        :width="box.w"
        :height="box.h"
        :rx="box.h / 2"
        :fill="isRoot(node.id) ? '#E9ECFF' : '#F4F6F8'"
        :stroke="isRoot(node.id) ? '#6846E3' : '#C7C7C7'"
        :stroke-width="isRoot(node.id) ? 2 : 1.5"
      />
      <text
        :x="box.w / 2"
        :y="box.h / 2"
        text-anchor="middle"
        dominant-baseline="central"
        :font-size="isRoot(node.id) ? 17 : 14"
        :font-weight="isRoot(node.id) ? 700 : 500"
        :fill="node.text ? '#1F2933' : '#9AA5B1'"
        style="font-family: Inter, sans-serif"
      >
        {{ node.text || 'New idea' }}
      </text>

      <!-- Hover "+" to add a child (minimal M1 affordance). -->
      <g
        class="fd-mm-add"
        :transform="`translate(${box.w + 14} ${box.h / 2})`"
        style="cursor: pointer; opacity: 0; transition: opacity 120ms ease"
        @click.stop="addChild(node.id)"
        @pointerdown.stop
      >
        <circle r="10" fill="#FFFFFF" stroke="#006EDB" stroke-width="1.5" />
        <path d="M-4 0 H4 M0 -4 V4" stroke="#006EDB" stroke-width="1.6" stroke-linecap="round" />
      </g>
    </g>
  </g>
</template>

<style scoped>
.fd-mm-node:hover .fd-mm-add {
  opacity: 1;
}
</style>
