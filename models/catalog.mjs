// Catálogo curado de modelos de Ollama para Secretia.
// Tamaños aproximados de la cuantización por defecto (Q4) que baja Ollama.
// `cat`: chat | code | reasoning | vision | embed.
export const CATALOG = [
  // --- Chat livianos (andan hasta en CPU) ---
  { tag: "llama3.2:1b",        nombre: "Llama 3.2 1B",        params: "1B",   sizeGB: 1.3, cat: "chat",
    blurb: "El más liviano de Meta. Arranca en casi cualquier máquina." },
  { tag: "llama3.2:3b",        nombre: "Llama 3.2 3B",        params: "3B",   sizeGB: 2.0, cat: "chat",
    blurb: "Liviano y capaz. Buen punto de partida para CPU." },
  { tag: "phi3.5:3.8b",        nombre: "Phi 3.5",             params: "3.8B", sizeGB: 2.2, cat: "chat",
    blurb: "Chico de Microsoft, fuerte para su tamaño." },
  // --- Chat de uso general ---
  { tag: "llama3.1:8b",        nombre: "Llama 3.1 8B",        params: "8B",   sizeGB: 4.9, cat: "chat",
    blurb: "El caballito de batalla de Meta. Default recomendado." },
  { tag: "qwen2.5:7b",         nombre: "Qwen 2.5 7B",         params: "7B",   sizeGB: 4.7, cat: "chat",
    blurb: "Muy capaz y multilingüe. Excelente relación tamaño/calidad." },
  { tag: "mistral:7b",         nombre: "Mistral 7B",          params: "7B",   sizeGB: 4.1, cat: "chat",
    blurb: "Clásico: rápido, sólido y eficiente." },
  { tag: "gemma2:9b",          nombre: "Gemma 2 9B",          params: "9B",   sizeGB: 5.4, cat: "chat",
    blurb: "El modelo abierto de Google." },
  { tag: "qwen2.5:14b",        nombre: "Qwen 2.5 14B",        params: "14B",  sizeGB: 9.0, cat: "chat",
    blurb: "Más grande y más preciso. Pedile RAM/VRAM." },
  // --- Razonamiento ---
  { tag: "deepseek-r1:7b",     nombre: "DeepSeek-R1 7B",      params: "7B",   sizeGB: 4.7, cat: "reasoning",
    blurb: "Razonamiento paso a paso (estilo o1)." },
  // --- Código ---
  { tag: "qwen2.5-coder:7b",   nombre: "Qwen 2.5 Coder 7B",   params: "7B",   sizeGB: 4.7, cat: "code",
    blurb: "Especialista en programación." },
  // --- Visión (multimodal) ---
  { tag: "llava:7b",           nombre: "LLaVA 7B",            params: "7B",   sizeGB: 4.7, cat: "vision",
    blurb: "Multimodal: entiende imágenes además de texto." },
  { tag: "llama3.2-vision:11b", nombre: "Llama 3.2 Vision 11B", params: "11B", sizeGB: 7.9, cat: "vision",
    blurb: "Visión de Meta, más grande." },
  // --- Embeddings (para RAG / búsqueda, no son chat) ---
  { tag: "nomic-embed-text",   nombre: "Nomic Embed Text",    params: "—",    sizeGB: 0.27, cat: "embed",
    blurb: "Embeddings para RAG y búsqueda. No es un modelo de chat." },
  { tag: "mxbai-embed-large",  nombre: "mxbai Embed Large",   params: "—",    sizeGB: 0.67, cat: "embed",
    blurb: "Embeddings de alta calidad." },
];

export const CATS = [
  { id: "chat",      label: "Chat" },
  { id: "reasoning", label: "Razonamiento" },
  { id: "code",      label: "Código" },
  { id: "vision",    label: "Visión" },
  { id: "embed",     label: "Embeddings" },
];
