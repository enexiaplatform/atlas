/** Optional server-only ports. The pilot uses deterministic retrieval with no outbound providers. */
export function knowledgeProviders({
  languageModel = null,
  embeddingModel = null,
} = {}) {
  if (languageModel && typeof languageModel.synthesize !== "function")
    throw TypeError("Expected synthesize({question, passages})");
  if (embeddingModel && typeof embeddingModel.embed !== "function")
    throw TypeError("Expected embed(texts)");
  return Object.freeze({ languageModel, embeddingModel });
}
