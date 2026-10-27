import { Link } from "react-router-dom";
import BookCover from "./BookCover";

function BookCard({ book, onOpen, opening = false, disabled = false }) {
  const unavailable = !book._id && (disabled || opening || !onOpen);
  const openClass = "font-semibold text-white transition-colors after:absolute after:inset-0 after:z-10 after:rounded-3xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-copper focus-visible:after:ring-offset-4 focus-visible:after:ring-offset-midnight";

  return (
    <article aria-busy={opening || undefined} className={`group relative isolate grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 rounded-3xl border border-line bg-panel p-4 text-ink shadow-card transition-[transform,border-color,box-shadow] duration-200 ease-out sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-5 ${unavailable ? "" : "hover:border-copper/60 hover:shadow-[0_26px_64px_rgba(2,6,23,0.6)] motion-safe:hover:-translate-y-1 focus-within:border-copper/60"}`}>
      <div className="flex aspect-[2/3] self-start items-center justify-center overflow-hidden rounded-xl bg-panelSoft p-1.5">
        <div className={`h-full w-full transition-transform duration-300 ease-out ${unavailable ? "" : "motion-safe:group-hover:scale-[1.04] motion-safe:group-focus-within:scale-[1.04]"}`}>
          <BookCover url={book.urlCapa} title={book.titulo} />
        </div>
      </div>
      <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Gêneros">
        {(book.generos?.length ? book.generos : [book.genero]).filter(Boolean).map(genre => <span key={genre} className="rounded-md bg-copper/10 px-2 py-1 text-[10px] font-semibold text-copper">{genre}</span>)}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white" aria-label={book.totalAvaliacoes > 0 ? `Avaliação média: ${book.mediaAvaliacoes} de 5, ${book.totalAvaliacoes} ${book.totalAvaliacoes === 1 ? "avaliação" : "avaliações"}` : "Sem avaliações"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-copper" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39L17.56 20 12 17.08 6.44 20l1.06-6.07L3 9.54l6.22-.91L12 3Z" /></svg>
        {book.totalAvaliacoes > 0 && <span className="tabular-nums">{Number(book.mediaAvaliacoes || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>}
        <span className="text-[10px] font-normal text-mist/80">{book.totalAvaliacoes > 0 ? `(${Number(book.totalAvaliacoes).toLocaleString("pt-BR")} ${book.totalAvaliacoes === 1 ? "avaliação" : "avaliações"})` : "(0 avaliações)"}</span>
      </span>
      </div>
      <h3 className="mt-1 line-clamp-2 break-words font-display text-xl leading-tight text-white">
        {book._id ? <Link to={`/books/${book._id}`} aria-label={`Ver livro: ${book.titulo}`} className={openClass}>{book.titulo}</Link> : <button type="button" disabled={unavailable} onClick={() => onOpen?.(book)} aria-label={`${opening ? "Abrindo" : "Ver livro"}: ${book.titulo}`} className={`${openClass} text-left after:cursor-pointer disabled:opacity-50 disabled:after:cursor-wait`}>{book.titulo}</button>}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-[#cfd9e8]">{book.autor}</p>
      {book.idioma && <p className="mt-2 text-xs text-mist">{/^(?:en(?:-[a-z]{2})?|english|inglês|ingles)$/i.test(book.idioma) ? "Edição em inglês" : "Edição em português"}</p>}
      <p className="mt-2 line-clamp-3 break-words text-sm leading-5 text-[#d6dfec]">{book.descricao}</p>
      </div>
    </article>
  );
}

export default BookCard;
