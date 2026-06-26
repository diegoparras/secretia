// Evita el flash de tema: aplica el guardado antes de pintar. (Externo por CSP.)
try { if (localStorage.getItem("secretia-modelos.theme") === "dark") document.documentElement.dataset.theme = "dark"; } catch (e) {}
