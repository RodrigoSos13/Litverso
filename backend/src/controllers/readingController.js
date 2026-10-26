import mongoose from "mongoose";
import { Book } from "../models/Book.js";
import { Reading } from "../models/Reading.js";

function validReadingId(req, res) {
  if (mongoose.isObjectIdOrHexString(req.params.id)) return true;
  res.status(400).json({ message: "ID de leitura inválido." });
  return false;
}

function readingError(res, error) {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: "Dados de leitura inválidos." });
  }
  return res.status(503).json({ message: "Não foi possível acessar as leituras. Tente novamente." });
}

export async function getReadingById(req, res) {
  if (!validReadingId(req, res)) return;
  try {
    const reading = await Reading.findById(req.params.id)
      .populate("usuario", "nome usuario")
      .populate("livro", "titulo autor urlCapa");
    if (!reading) return res.status(404).json({ message: "Leitura não encontrada." });
    res.json(reading);
  } catch (error) { readingError(res, error); }
}

export async function updateReading(req, res) {
  if (!validReadingId(req, res)) return;
  const { status, nota } = req.body;
  if ((status === undefined && nota === undefined)
    || (status !== undefined && !["quero_ler", "lendo", "lido", null].includes(status))
    || (nota !== undefined && nota !== null && (typeof nota !== "number" || !Number.isFinite(nota) || nota < 0 || nota > 5))) {
    return res.status(400).json({ message: "Informe status válido ou nota numérica de 0 a 5 (null remove a nota)." });
  }
  try {
    // Scope the mutation to the session owner; body.usuario is never trusted.
    const reading = await Reading.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!reading) return res.status(404).json({ message: "Leitura não encontrada para esta conta." });
    if (status !== undefined) reading.status = status;
    if (nota !== undefined) reading.nota = nota;
    await reading.save();
    if (nota !== undefined) await refreshBookRating(reading.livro);
    await reading.populate("livro", "titulo autor urlCapa");
    res.json(reading);
  } catch (error) { readingError(res, error); }
}

export async function deleteReading(req, res) {
  if (!validReadingId(req, res)) return;
  try {
    const reading = await Reading.findOneAndDelete({ _id: req.params.id, usuario: req.user._id });
    if (!reading) return res.status(404).json({ message: "Leitura não encontrada para esta conta." });
    await refreshBookRating(reading.livro);
    res.status(204).end();
  } catch (error) { readingError(res, error); }
}

async function refreshBookRating(bookId) {
  const result = await Reading.aggregate([
    {
      $match: {
        livro: new mongoose.Types.ObjectId(bookId),
        nota: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$livro",
        mediaAvaliacoes: { $avg: "$nota" },
        totalAvaliacoes: { $sum: 1 },
      },
    },
  ]);

  const payload = result[0] || { mediaAvaliacoes: 0, totalAvaliacoes: 0 };

  await Book.findByIdAndUpdate(bookId, {
    mediaAvaliacoes: Number(payload.mediaAvaliacoes.toFixed(1)),
    totalAvaliacoes: payload.totalAvaliacoes,
  });
}

export async function upsertReading(req, res) {
  const { livro, status, nota } = req.body;
  if (!mongoose.isObjectIdOrHexString(livro)
    || (status !== undefined && !["quero_ler", "lendo", "lido", null].includes(status))
    || (nota !== undefined && nota !== null && (typeof nota !== "number" || !Number.isFinite(nota) || nota < 0 || nota > 5))) {
    return res.status(400).json({ message: "Informe livro válido, status válido e nota numérica entre 0 e 5." });
  }
  try {
    if (!await Book.exists({ _id: livro })) return res.status(404).json({ message: "Livro não encontrado." });
    const reading = await Reading.findOneAndUpdate(
      { usuario: req.user._id, livro },
      { $set: { usuario: req.user._id, livro, ...(status !== undefined ? { status } : {}), ...(nota !== undefined ? { nota } : {}) } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).populate("livro").populate("usuario", "nome usuario urlAvatar");

    if (req.body.nota !== undefined) {
      await refreshBookRating(req.body.livro);
    }

    res.status(201).json(reading);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

export async function getReadings(req, res) {
  try {
    const filter = {};

    if (req.query.user) {
      filter.usuario = req.query.user;
    }

    if (req.query.book) {
      filter.livro = req.query.book;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const readings = await Reading.find(filter)
      .populate("usuario", "nome usuario")
      .populate("livro", "titulo autor urlCapa")
      .sort({ updatedAt: -1 });

    res.json(readings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
