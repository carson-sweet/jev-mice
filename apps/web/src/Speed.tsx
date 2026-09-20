// The pace control. It changes how fast the run is drawn, not how fast the
// simulation is allowed to be: the server is the one pacing itself, so the
// slider sends a rate rather than dropping frames on the way in.

import { sliderFromSpeed, speedFromSlider } from './api'

export function Speed({ speed, fastest, disabled, onChange }: {
  speed: number
  fastest: number
  disabled: boolean
  onChange: (ticksPerSecond: number) => void
}): React.ReactElement {
  const position = sliderFromSpeed(speed, fastest)
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-zinc-500">Speed</span>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        disabled={disabled}
        aria-label="Simulation speed in ticks a second"
        aria-valuetext={`${String(speed)} ticks a second`}
        onChange={(e) => { onChange(speedFromSlider(Number(e.target.value), fastest)) }}
        className="w-32 accent-sky-500 disabled:opacity-40"
      />
      <span className="w-24 text-xs tabular-nums text-zinc-400">
        {speed >= fastest ? 'as fast as it can' : `${String(speed)} a second`}
      </span>
    </label>
  )
}
