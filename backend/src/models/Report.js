import mongoose from "mongoose";
const schema = new mongoose.Schema({
  denunciante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  tipo: { type: String, enum: ["publicacao", "comentario"], required: true },
  alvo: { type: mongoose.Schema.Types.ObjectId, required: true },
  motivo: { type: String, enum: ["assedio", "odio", "spam", "conteudo_inadequado", "direitos_autorais", "outro"], required: true },
  detalhes: { type: String, maxlength: 1000, default: "" },
  conteudo: { type: String, maxlength: 1000, required: true },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  publicacao: { type: mongoose.Schema.Types.ObjectId, ref: "Publicacao" },
  status: { type: String, enum: ["pendente", "descartada", "removida"], default: "pendente" },
  moderador: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  decisao: { type: String, maxlength: 1000, default: "" },
  resolvidaEm: Date,
}, { timestamps: true });
schema.index({ denunciante: 1, tipo: 1, alvo: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
export const Report = mongoose.model("Denuncia", schema, "denuncias");
