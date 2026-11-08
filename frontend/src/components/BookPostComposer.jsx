import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CreatePostPage from "../pages/CreatePostPage";
import { useAuth } from "../contexts/AuthContext";

export default function BookPostComposer({ book, onPublished }) {
  const { user, requireLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open || !user) return;
    const modal = dialog.current;
    modal.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open, user?._id]);

  return <>
    <button ref={trigger} type="button" onClick={() => {
      if (requireLogin("publicar sobre este livro")) setOpen(true);
    }} aria-haspopup="dialog" aria-expanded={open} aria-controls="book-post-dialog" className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-berry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">
      <span aria-hidden="true" className="text-xl">+</span>Adicionar post
    </button>
    {open && user && createPortal(<dialog ref={dialog} id="book-post-dialog" aria-label={`Publicar sobre ${book.titulo}`} onCancel={event => { event.preventDefault(); setOpen(false); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <CreatePostPage embedded fixedBook={book} onCancel={() => setOpen(false)} onPublished={post => {
        onPublished(post);
        setOpen(false);
      }} />
    </dialog>, document.body)}
  </>;
}
