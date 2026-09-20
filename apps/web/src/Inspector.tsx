// What one mouse can see and what it decided. This is the part that makes the
// judgment visible, so it shows the drive weights rather than only the winner.

import type { Frame } from '@jev-mice/sim'

const BARS: Record<string, string> = {
  eat: '#4ade80', flee: '#f87171', hide: '#60a5fa',
  seek_mate: '#f472b6', nest: '#c084fc', explore: '#94a3b8',
}

export function Inspector({ frame, id, onClear }: {
  frame: Frame | null
  id: string | null
  onClear: () => void
}): React.ReactElement {
  const mouse = id === null ? null : frame?.mice.find((m) => m.id === id) ?? null

  if (!mouse) {
    return (
      <div className="rounded border border-zinc-800 p-3 text-zinc-400">
        <div className="font-medium text-zinc-300">Nothing selected</div>
        <p className="mt-1 text-xs">Click a mouse on the map to follow what it is doing.</p>
      </div>
    )
  }

  return (
    <div className="rounded border border-zinc-800 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-100">{mouse.id}</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Clear
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-zinc-500">Doing</dt>
        <dd className="text-zinc-200">{mouse.intent ?? 'nothing yet'}</dd>
        <dt className="text-zinc-500">Fear</dt>
        <dd className="text-zinc-200">{mouse.fear}</dd>
        <dt className="text-zinc-500">Nutrition</dt>
        <dd className="text-zinc-200">{mouse.nutrition}</dd>
        <dt className="text-zinc-500">Where</dt>
        <dd className="text-zinc-200">
          {mouse.inHole ? 'in a mousehole' : `${String(mouse.x)}, ${String(mouse.y)}`}
        </dd>
      </dl>
      <div className="mt-3">
        <div className="text-xs text-zinc-500">Nutrition</div>
        <div className="mt-1 h-2 w-full rounded bg-zinc-800">
          <div
            className="h-2 rounded"
            style={{
              width: `${String(Math.max(0, Math.min(100, mouse.nutrition)))}%`,
              background: mouse.nutrition >= 60 ? BARS.eat
                : mouse.nutrition >= 30 ? '#fbbf24' : BARS.flee,
            }}
          />
        </div>
      </div>
    </div>
  )
}
