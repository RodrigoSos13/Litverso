import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SearchBar from "../components/SearchBar";

const initialForm = { titulo: "", autor: "", genero: "", totalPaginas: "", editora: "", anoPublicacao: "", idioma: "pt", isbn: "", descricao: "" };
const inputClass = "w-full rounded-xl border border-line bg-midnight/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-mist/50 focus:border-copper focus:ring-2 focus:ring-copper/15 disabled:opacity-50";

function Field({ label, name, required, children, ...props }) {
  return <div>
    <label htmlFor={name} className="mb-2 block text-sm font-semibold text-ink">{label}{required && <span className="ml-1 text-copper" aria-hidden="true">*</span>}</label>
    {children || <input id={name} name={name} required={required} className={inputClass} {...props} />}
  </div>;
}

function LanguageSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = [{ value: "pt", label: "Português" }, { value: "en", label: "Inglês" }];
  function choose(index) {
    onChange({ target: { name: "idioma", value: options[index].value } });
    setOpen(false);
  }
  return <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button id="idioma" type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls="idioma-options" aria-activedescendant={open ? `idioma-${active}` : undefined} onClick={() => { setActive(options.findIndex(option => option.value === value)); setOpen(current => !current); }} onKeyDown={event => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
        setActive(index => event.key === "Home" ? 0 : event.key === "End" ? 1 : !open ? options.findIndex(option => option.value === value) : (index + 1) % 2);
      } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      else if (open && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); choose(active); }
      else if (event.key === "Tab") setOpen(false);
    }} className={`${inputClass} flex items-center justify-between text-left`}>
      {options.find(option => option.value === value).label}
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 text-mist transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <ul id="idioma-options" role="listbox" aria-label="Idioma da edição" className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-line bg-panel p-1.5 shadow-card">
      {options.map((option, index) => <li key={option.value} id={`idioma-${index}`} role="option" aria-selected={value === option.value} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)} className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm ${active === index ? "bg-panelSoft text-white" : "text-mist"}`}>
        {option.label}{value === option.value && <span aria-hidden="true" className="text-copper">✓</span>}
      </li>)}
    </ul>}
  </div>;
}

export default function CreateBookPage() {
  const [form, setForm] = useState(initialForm);
  const [cover, setCover] = useState(null);
  const [coverError, setCoverError] = useState("");
  const [readingCover, setReadingCover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInput = useRef(null);
  const coverTrigger = useRef(null);
  const selection = useRef(0);
  const navigate = useNavigate();

  function handleChange({ target: { name, value, type, checked } }) {
    setForm(current => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function selectCover(file) {
    if (!file || loading) return;
    const version = ++selection.current;
    setCoverError("");
    setReadingCover(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setCoverError("Selecione uma imagem JPG, PNG ou WebP de até 5 MB.");
      return;
    }
    setReadingCover(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = reject;
        image.src = data;
      });
      if (version === selection.current) setCover({ data, name: file.name });
    } catch {
      if (version === selection.current) setCoverError("Não foi possível abrir essa imagem. Selecione outro arquivo.");
    } finally {
      if (version === selection.current) setReadingCover(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading || readingCover) return;
    setErrorMessage("");
    if (!cover) {
      setCoverError("Selecione uma capa para cadastrar o livro.");
      coverTrigger.current?.focus();
      return;
    }
    if (![form.titulo, form.autor, form.genero, form.descricao].every(value => value.trim())) {
      setErrorMessage("Preencha os campos obrigatórios com título, autor, gênero e sinopse.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        titulo: form.titulo.trim(), autor: form.autor.trim(), generos: form.genero.split(/[,;]/).map(value => value.trim()).filter(Boolean), descricao: form.descricao.trim(),
        editora: form.editora.trim(), isbn: form.isbn.trim(), urlCapa: cover.data,
        totalPaginas: form.totalPaginas ? Number(form.totalPaginas) : undefined,
        anoPublicacao: form.anoPublicacao ? Number(form.anoPublicacao) : undefined,
      };
      const { data } = await api.post("/books", payload, { timeout: 30000 });
      navigate(`/books/${data._id}`);
    } catch (error) {
      setErrorMessage(error.response?.data?.message || (error.code === "ECONNABORTED" ? "O envio demorou demais. Verifique sua conexão e tente novamente." : "Não foi possível cadastrar o livro. Seus dados foram mantidos para tentar novamente."));
    } finally { setLoading(false); }
  }

  const fieldProps = name => ({ name, value: form[name], onChange: handleChange });

  return (
    <section className="mx-auto max-w-4xl rounded-[2rem] border border-line bg-panel p-5 shadow-card sm:p-8">
      <p className="text-sm uppercase tracking-[0.22em] text-copper">Expanda o catálogo</p>
      <h1 className="mt-3 font-display text-3xl">Confira se o livro já existe</h1>
      <div className="mt-6"><SearchBar className="relative w-full" /></div>
      <details className="mt-10 border-t border-line pt-6">
        <summary className="cursor-pointer rounded text-lg font-semibold text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">Cadastrar um livro</summary>
        <form className="mt-6 space-y-8" onSubmit={handleSubmit} aria-busy={loading}>
          {errorMessage && <p role="alert" className="rounded-xl border border-forest/40 bg-forest/10 px-4 py-3 text-sm text-glow">{errorMessage}</p>}
          <fieldset disabled={loading} className="min-w-0">
            <legend className="mb-4 text-base font-semibold text-white">Capa do livro <span className="text-copper">*</span></legend>
            <input ref={fileInput} id="capa" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} className="hidden" onChange={event => { selectCover(event.target.files?.[0]); event.target.value = ""; }} />
            <button ref={coverTrigger} type="button" onClick={() => fileInput.current?.click()} disabled={readingCover} aria-label={cover ? "Trocar capa do livro" : "Selecionar capa do livro"} aria-describedby={coverError ? "cover-error" : undefined} aria-invalid={Boolean(coverError)} title="Selecionar capa · JPG, PNG ou WebP até 5 MB" className="group relative flex h-60 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-panelSoft transition hover:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:opacity-60">
              {cover ? <img src={cover.data} alt="Prévia da capa selecionada" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-3 px-4 text-center text-mist"><svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg><span className="text-xs">Adicionar capa</span></span>}
              {readingCover && <span role="status" className="absolute inset-0 flex items-center justify-center bg-midnight/80 px-3 text-center text-xs text-white">Preparando imagem…</span>}
            </button>
            {coverError && <p id="cover-error" role="alert" className="mt-3 text-sm text-glow">{coverError}</p>}
          </fieldset>
          <fieldset disabled={loading} className="min-w-0">
            <legend className="mb-4 text-base font-semibold text-white">Dados do livro</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Título" {...fieldProps("titulo")} required maxLength={500} placeholder="Ex.: O Hobbit" />
              <Field label="Autor ou autores" {...fieldProps("autor")} required maxLength={500} placeholder="Ex.: J. R. R. Tolkien" />
              <Field label="Gêneros (separe por vírgula)" {...fieldProps("genero")} required maxLength={1000} placeholder="Ex.: Fantasia, Fantasia épica, Ficção" />
              <Field label="Idioma da edição" name="idioma" required><LanguageSelect value={form.idioma} onChange={handleChange} /></Field>
            </div>
            <div className="mt-5">
              <label htmlFor="descricao" className="mb-2 block text-sm font-semibold text-ink">Sinopse <span className="text-copper" aria-hidden="true">*</span></label>
              <textarea id="descricao" {...fieldProps("descricao")} required rows={5} maxLength={20000} placeholder="Apresente a história e os temas do livro…" className={`${inputClass} resize-y`} />
            </div>
          </fieldset>
          <fieldset disabled={loading} className="min-w-0 border-t border-line pt-5">
            <legend className="pr-3 text-base font-semibold text-white">Detalhes da edição</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Editora" {...fieldProps("editora")} maxLength={300} placeholder="Nome da editora" />
              <Field label="ISBN" {...fieldProps("isbn")} required maxLength={30} placeholder="ISBN de 10 ou 13 dígitos" pattern="(?:[0-9Xx](?:\s|\-)*){10}|(?:[0-9](?:\s|\-)*){13}" title="Informe um ISBN de 10 ou 13 dígitos, com ou sem hífens." />
              <Field label="Número de páginas" {...fieldProps("totalPaginas")} type="number" min={1} step={1} placeholder="Ex.: 310" />
              <Field label="Ano de publicação" {...fieldProps("anoPublicacao")} type="number" min={1} max={9999} step={1} placeholder="Ex.: 1937" />
            </div>
          </fieldset>
          <div className="flex justify-end border-t border-line pt-6">
            <button type="submit" disabled={loading || readingCover} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-berry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-wait disabled:opacity-50">
              {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {loading ? "Cadastrando livro…" : "Cadastrar livro"}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
