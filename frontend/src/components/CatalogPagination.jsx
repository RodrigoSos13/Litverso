export default function CatalogPagination({ page, totalPages, loading, onPageChange }) {
  if (totalPages <= 1) return null;
  const start = Math.max(2, Math.min(page - 1, totalPages - 2));
  const end = Math.min(totalPages, start + 2);
  const items = [1];
  if (start > 2) items.push("back");
  for (let value = start; value <= end; value++) items.push(value);
  const base = "inline-flex min-h-10 items-center justify-center rounded-xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-midnight disabled:pointer-events-none disabled:opacity-40";
  const idle = "border-line bg-panel text-mist hover:border-copper/50 hover:bg-panelSoft hover:text-white";

  return <nav aria-label="Páginas do catálogo" className="space-y-3 border-t border-line pt-6">
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} className={`${base} ${idle} order-2 gap-2 px-3 sm:order-none sm:px-4`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m14 6-6 6 6 6" /></svg>Anterior
      </button>
      <div className="order-1 flex w-full justify-center gap-1 sm:order-none sm:w-auto sm:gap-2">
        {items.map(item => {
          if (typeof item !== "number") return <span key={item} aria-hidden="true" className="inline-flex min-h-10 min-w-9 items-center justify-center px-2 text-sm text-mist sm:min-w-10">…</span>;
          const current = item === page;
          const label = `Ir para a página ${item}${item === 1 ? " (primeira página)" : item === totalPages ? " (última página)" : ""}`;
          return <button key={item} type="button" aria-label={label} title={label} aria-current={current ? "page" : undefined} disabled={loading || current} onClick={() => onPageChange(item)} className={`${base} min-w-9 px-2 tabular-nums sm:min-w-10 ${current ? "border-copper/50 bg-copper/15 text-copper disabled:opacity-100" : idle}`}>
            {item}
          </button>;
        })}
      </div>
      <button type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)} className={`${base} ${idle} order-3 gap-2 px-3 sm:order-none sm:px-4`}>
        Próxima<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m10 6 6 6-6 6" /></svg>
      </button>
    </div>
    <p className="text-center text-xs tabular-nums text-mist" aria-live="polite">Página {page} de {totalPages}</p>
  </nav>;
}
