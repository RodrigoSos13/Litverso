import { normalizeBookGenre } from "../services/bookGenres.js";
import mongoose from "mongoose";
import { catalogFields } from "../services/catalogFields.js";

const bookSchema = new mongoose.Schema(
  {
    searchTokens: { type: [String], default: [] },
    titleTokens: { type: [String], default: [] },
    authorTokens: { type: [String], default: [] },
    isbnSearch: { type: String, default: "" },
    catalogLanguageRank: { type: Number, default: 0 },
    catalogHasCover: { type: Boolean, default: false },
    catalogVersion: Number,
    catalogSyncedAt: Date,
    googleBooksId: { type: String, trim: true },
    googleBooksUrl: { type: String, default: "" },
    titulo: {
      type: String,
      required: true,
      trim: true,
    },
    autor: {
      type: String,
      required: true,
      trim: true,
    },
    generos: {
      type: [String],
      default: [],
      validate: value => value.length <= 20 && value.every(item => item.trim().length > 0 && item.length <= 200),
    },
    genero: {
      type: String,
      set: normalizeBookGenre,
      required: true,
      trim: true,
    },
    totalPaginas: {
      type: Number,
      min: 1,
    },
    editora: {
      type: String,
      trim: true,
      default: "",
    },
    anoPublicacao: {
      type: Number,
      min: 0,
    },
    idioma: {
      type: String,
      trim: true,
      default: "pt",
    },
    isbn: {
      type: String,
      trim: true,
      default: "",
    },
    descricaoFormatada: {
      type: String,
      default: "",
      maxlength: 20000,
    },
    descricao: {
      type: String,
      required: true,
    },
    urlCapa: {
      type: String,
      default: "",
    },
    mediaAvaliacoes: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalAvaliacoes: {
      type: Number,
      default: 0,
      min: 0,
    },
    destaque: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

bookSchema.pre("validate", function () {
  Object.assign(this, catalogFields(this));
});
bookSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const metadata = update?.$set?.titulo ? update.$set : update?.$setOnInsert;
  if (metadata?.titulo && metadata?.autor) Object.assign(metadata, catalogFields(metadata));
});
bookSchema.index({ generos: 1 });
bookSchema.index({ searchTokens: 1 });
bookSchema.index({ titleTokens: 1 });
bookSchema.index({ authorTokens: 1 });
bookSchema.index({ isbnSearch: 1 });
bookSchema.index({ isbnSearch: 1 }, { name: "unique_book_isbn", unique: true, partialFilterExpression: { isbnSearch: { $gt: "" } } });
bookSchema.index({ catalogLanguageRank: 1, catalogHasCover: -1, _id: 1 });
bookSchema.index(
  { titulo: "text", autor: "text" },
  { default_language: "portuguese", language_override: "idiomaTexto" }
);
bookSchema.index({ destaque: 1, createdAt: -1 });
bookSchema.index({ googleBooksId: 1 }, { unique: true, partialFilterExpression: { googleBooksId: { $type: "string" } } });

export const Book = mongoose.model("Livro", bookSchema, "livros");
