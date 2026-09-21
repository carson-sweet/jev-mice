// What the tracked thing is doing.
//
// Anything on the map can be tracked, not only mice, so this has a panel per
// kind. A mouse and a cat have a condition and an intention; a trap, a food pile
// and a mousehole have a state and nothing else, and saying so briefly is better
// than padding them out to look as interesting as an animal.

import type { Frame } from '@jev-mice/sim'
import { kindOf, KIND_LABEL } from './kinds'

const BARS: Record<string, string> = {
  eat: '#4ade80', flee: '#f87171', hide: '#60a5fa',
  seek_mate: '#f472b6', nest: '#c084fc', explore: '#94a3b8',
}

export function Inspector({ frame, id, onClear }: {
  frame: Frame | null
  id: string | null
  onClear: () => void
}): React.ReactElement {
  const kind = id === null ? null : kindOf(id)
  const mouse = id === null ? null : frame?.mice.find((m) => m.id === id) ?? null
  const cat = id === null ? null : frame?.cats.find((c) => c.id === id) ?? null
  const trap = id === null ? null : frame?.traps.find((t) => t.id === id) ?? null
  const food = id === null ? null : frame?.food.find((f) => f.id === id) ?? null
  const hole = id === null ? null : frame?.holes.find((h) => h.id === id) ?? null
  const found = mouse ?? cat ?? trap ?? food ?? hole

  if (id === null || !found) {
    return (
      <div className="rounded border border-zinc-800 p-3 text-zinc-400">
        <div className="font-medium text-zinc-300">Nothing selected</div>
        <p className="mt-1 text-xs">
          {id !== null
            // A tracked thing can leave: a mouse is eaten, a pile is eaten, a
            // trap resets somewhere else.
            ? `${id} is no longer on the map.`
            : 'Click anything on the map to follow it. The log and the decisions '
              + 'narrow to whatever you pick.'}
        </p>
      </div>
    )
  }

  const header = (
    <div className="flex items-center justify-between">
      <span className="font-medium text-zinc-100">
        {id}
        {kind !== null && (
          <span className="ml-1.5 text-[11px] font-normal text-zinc-500">
            {KIND_LABEL[kind]}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      >
        Clear
      </button>
    </div>
  )

  const rows = (pairs: [string, React.ReactNode][]): React.ReactElement => (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {pairs.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="text-zinc-200">{v}</dd>
        </div>
      ))}
    </dl>
  )

  if (cat) {
    return (
      <div className="rounded border border-zinc-800 p-3">
        {header}
        {rows([
          ['Doing', cat.mode],
          ['Nutrition', `${String(Math.round(cat.nutrition))}%`],
          ['Hunger', cat.hungry ? 'hungry, hunting harder' : 'fed'],
          ['Toxoplasmosis', cat.shedding ? 'shedding' : 'none'],
          ['Where', `${String(cat.x)}, ${String(cat.y)}`],
        ])}
      </div>
    )
  }

  if (trap) {
    return (
      <div className="rounded border border-zinc-800 p-3">
        {header}
        {rows([
          ['State', trap.occupied ? 'holding a dead mouse' : 'set and waiting'],
          ['Where', `${String(trap.x)}, ${String(trap.y)}`],
        ])}
        <p className="mt-2 text-[11px] text-zinc-600">
          A trap makes no decisions. The log beside it shows what it has caught.
        </p>
      </div>
    )
  }

  if (food) {
    return (
      <div className="rounded border border-zinc-800 p-3">
        {header}
        {rows([
          ['Toxoplasmosis', food.contaminated ? 'contaminated' : 'clean'],
          ['Where', `${String(food.x)}, ${String(food.y)}`],
        ])}
        <p className="mt-2 text-[11px] text-zinc-600">
          A food pile makes no decisions. The log beside it shows who has eaten here.
        </p>
      </div>
    )
  }

  if (hole) {
    return (
      <div className="rounded border border-zinc-800 p-3">
        {header}
        {rows([
          ['State', hole.occupancy === 'empty' ? 'free'
            : hole.occupancy === 'adult' ? 'an adult sheltering' : 'a litter inside'],
          ['Where', `${String(hole.x)}, ${String(hole.y)}`],
        ])}
        <p className="mt-2 text-[11px] text-zinc-600">
          A mousehole makes no decisions. The log beside it shows who has sheltered
          and bred here.
        </p>
      </div>
    )
  }

  if (!mouse) return <div />

  return (
    <div className="rounded border border-zinc-800 p-3">
      {/* The same header as every other kind, so the panel reads consistently
          whatever is being tracked. */}
      {header}
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
