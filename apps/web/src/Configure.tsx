// The starting conditions. Every knob is bounded by the preset it belongs to,
// so the form cannot ask for a world the engine will refuse.

import { useEffect, useId, useState } from 'react'
import { capsFor, defaultConfig, validateConfig, PRESETS,
         type Personality, type Preset, type RunConfig } from '@jev-mice/engine'

import { OddsPanel } from './OddsPanel.js'

const PERSONALITIES: Personality[] = ['bold', 'cautious', 'vigilant', 'social']

/**
 * A hint that opens on hover and on keyboard focus, and closes on Escape.
 * Hover alone would put the explanation out of reach of anyone not using a
 * mouse, so the icon is a real button rather than a decorated span.
 */
function InfoTip({ label, children }: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="inline-flex items-center align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        {...(open ? { 'aria-describedby': id } : {})}
        onMouseEnter={() => { setOpen(true) }}
        onMouseLeave={() => { setOpen(false) }}
        onFocus={() => { setOpen(true) }}
        onBlur={() => { setOpen(false) }}
        onClick={() => { setOpen((o) => !o) }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-500
                   hover:text-zinc-200 focus:text-zinc-200 focus:outline-none
                   focus-visible:ring-1 focus-visible:ring-sky-500"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.6" r="0.95" fill="currentColor" />
          <path d="M8 7.1v4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-0 z-20 mb-1 w-full rounded border
                     border-zinc-700 bg-zinc-900 p-2 text-[11px] leading-snug
                     text-zinc-300 shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  )
}

function Number_({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number
  onChange: (n: number) => void; hint?: string
}): React.ReactElement {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => { onChange(Number(e.target.value)) }}
        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1
                   text-zinc-100 focus:border-sky-500 focus:outline-none"
      />
      <span className="text-[11px] text-zinc-600">{hint ?? `${String(min)} to ${String(max)}`}</span>
    </label>
  )
}

export function Configure({ onStart, busy, jevAvailable }: {
  onStart: (o: { config: RunConfig; seed?: number; decider: 'jev' | 'rules' }) => void
  busy: boolean
  jevAvailable: boolean
}): React.ReactElement {
  const [config, setConfig] = useState<RunConfig>(() => defaultConfig('medium'))
  const [seed, setSeed] = useState<string>('')
  const [decider, setDecider] = useState<'jev' | 'rules'>('rules')

  // Jev is the interesting case, so it is the default the moment it is possible.
  useEffect(() => { setDecider(jevAvailable ? 'jev' : 'rules') }, [jevAvailable])
  const caps = capsFor(config.preset)
  const errors = validateConfig(config)
  const mix = PERSONALITIES.reduce((t, p) => t + config.personality[p], 0)

  useEffect(() => { setConfig((c) => ({ ...defaultConfig(c.preset), ticks: c.ticks })) },
    [])

  const set = (patch: Partial<RunConfig>): void => { setConfig((c) => ({ ...c, ...patch })) }

  const world = PRESETS[config.preset]

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (errors.length > 0) return
        onStart({
          config,
          decider,
          ...(seed.trim() === '' ? {} : { seed: Number(seed) }),
        })
      }}
    >
      <div>
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Decided by</span>
          <InfoTip label="About who decides">
            Jev judges each animal's next move from what it can see. The rules
            compute the same decisions from a fixed table. Running the same seed
            both ways is how you see what the judgment is worth.
          </InfoTip>
        </span>
        <div role="radiogroup" aria-label="Decided by" className="mt-1 flex gap-1">
          {([['jev', 'Use Jev'], ['rules', 'Use rules']] as const).map(([value, label]) => {
            const unavailable = value === 'jev' && !jevAvailable
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={decider === value}
                disabled={unavailable}
                title={unavailable
                  ? 'No decision key is configured. Set TYPESAFE_API_KEY in .env to offer Jev.'
                  : undefined}
                onClick={() => { setDecider(value) }}
                className={`flex-1 rounded border px-2 py-1 text-sm ${
                  decider === value
                    ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                    : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                } disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {!jevAvailable && (
          <span className="text-[11px] text-zinc-600">
            No key is set, so only the rules are available. Put TYPESAFE_API_KEY in
            {' '}.env to offer Jev.
          </span>
        )}
      </div>

      <div>
        <span className="text-xs text-zinc-400">World</span>
        <div className="mt-1 flex gap-1">
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setConfig(defaultConfig(p)) }}
              aria-pressed={config.preset === p}
              className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                config.preset === p
                  ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-zinc-600">
          {world.width} by {world.height} cells
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Number_ label="Male mice" value={config.maleMice} min={0} max={caps.mice}
                 onChange={(n) => { set({ maleMice: n }) }} />
        <Number_ label="Female mice" value={config.femaleMice} min={0} max={caps.mice}
                 onChange={(n) => { set({ femaleMice: n }) }} />
        <Number_ label="Cats" value={config.cats} min={0} max={caps.cats}
                 onChange={(n) => { set({ cats: n }) }} />
        <Number_ label="Traps" value={config.traps} min={0} max={caps.traps}
                 onChange={(n) => { set({ traps: n }) }} />
        <Number_ label="Food piles" value={config.foodPiles} min={0} max={caps.food}
                 onChange={(n) => { set({ foodPiles: n }) }} />
        <Number_ label="Mouseholes" value={config.mouseholes} min={0} max={caps.mouseholes}
                 onChange={(n) => { set({ mouseholes: n }) }} />
        <Number_ label="Ticks" value={config.ticks} min={100} max={20000}
                 onChange={(n) => { set({ ticks: n }) }} />
        <Number_ label="Food respawn" value={config.foodRespawnTicks} min={0} max={1000}
                 onChange={(n) => { set({ foodRespawnTicks: n }) }} hint="ticks" />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-400">Personality mix</span>
          <span className={`text-[11px] ${mix === 100 ? 'text-zinc-600' : 'text-amber-400'}`}>
            {mix} percent
          </span>
        </div>
        <div className="mt-1 space-y-1">
          {PERSONALITIES.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <span className="w-20 text-xs capitalize text-zinc-400">{p}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={config.personality[p]}
                onChange={(e) => {
                  set({ personality: { ...config.personality, [p]: Number(e.target.value) } })
                }}
                className="flex-1 accent-sky-500"
              />
              <span className="w-8 text-right text-xs tabular-nums text-zinc-300">
                {config.personality[p]}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="block">
        <span className="relative flex items-center gap-1.5">
          <label htmlFor="seed" className="text-xs text-zinc-400">Use Existing Seed</label>
          <InfoTip label="About using an existing seed">
            Enter the seed from a run you have already done to repeat that run. The same
            seed with the same settings replays the same world, mouse for mouse.
          </InfoTip>
        </span>
        <input
          id="seed"
          value={seed}
          onChange={(e) => { setSeed(e.target.value) }}
          placeholder="leave blank for a new one"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1
                     text-zinc-100 focus:border-sky-500 focus:outline-none"
        />
        <span className="block text-[11px] text-zinc-600">
          Leave it blank and a new seed is chosen for you.
        </span>
      </div>

      <OddsPanel config={config} decider={decider} />

      {errors.length > 0 && (
        <ul className="rounded border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-200">
          {errors.map((e) => <li key={e.field + e.code}>{e.message}</li>)}
        </ul>
      )}

      <button
        type="submit"
        disabled={busy || errors.length > 0}
        className="w-full rounded bg-sky-600 px-3 py-2 font-medium text-white
                   hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
      >
        {busy ? 'Starting' : 'Start a run'}
      </button>
    </form>
  )
}
