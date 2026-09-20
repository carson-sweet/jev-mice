// What a run looks like when nothing survived it. Laid over the map rather
// than replacing it, so the last state of the world is still readable
// underneath and the run can still be scrubbed back through.

export function Extinction({ tick }: { tick: number }): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-20 flex flex-col
                 items-center justify-center bg-zinc-950/70"
    >
      <p className="px-4 text-center text-4xl font-bold tracking-[0.2em] text-red-400
                    drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-6xl">
        TOTAL EXTINCTION
      </p>
      <p className="mt-3 text-sm text-zinc-300">
        Nothing was left alive at turn {tick}.
      </p>
    </div>
  )
}
