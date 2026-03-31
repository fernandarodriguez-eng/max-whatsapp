// MAX — WhatsApp Webhook Server
// Stack: Meta Cloud API + Render.com (FREE) + Claude Haiku
// Costo estimado: ~$0/mes para uso normal de Fer

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ─── CONFIG (pon estas en Render como Environment Variables) ───────────────────
const VERIFY_TOKEN   = process.env.VERIFY_TOKEN;      // Tú lo inventas, ej: "max-fer-2026"
const WA_TOKEN       = process.env.WA_TOKEN;          // Token de Meta WhatsApp
const WA_PHONE_ID    = process.env.WA_PHONE_ID;       // ID del número de WhatsApp
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY; // Tu API key de Anthropic
const FER_NUMBER     = process.env.FER_NUMBER;        // Tu número, ej: "50769XXXXXX"
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SYSTEM = `Eres MAX, asistente estratégico de compras de Fer, Senior Apparel Buyer para mercados de Centroamérica y Venezuela.

CONTEXTO DE FER:
- Compra para mercados: Guatemala, El Salvador, Honduras, Costa Rica, Panamá, Nicaragua, Venezuela
- Clima tropical: telas ligeras, colores cálidos-neutros (chocolate, camel, taupe, nude, olive)
- Venezuela: acepta más prints, bordados, colores vibrantes
- CA: básicos sólidos, denim funcional, neutros dominantes
- Animal print = básico permanente, NO tendencia estacional
- Knits opacos y vests = NO aptos para clima tropical
- Inventario actual: 6,597 SKUs, cobertura promedio 38 meses (CRÍTICO, sano = 4-6 meses)
- Ventas último mes: $248,000 (+12%), Margen bruto: 42%

FORMATO PARA WHATSAPP (usa este formato SIEMPRE):
- Respuestas cortas y directas, máximo 300 palabras
- Usa emojis para jerarquía visual (📊 para datos, 🚨 para alertas, ✅ para acciones)
- Nunca uses markdown con ** o ## — WhatsApp no lo renderiza
- Si te piden un reporte grande, da el resumen y di que puedes enviarlo por email o generar el archivo
- Siempre termina con una acción concreta

COMANDOS ESPECIALES que Fer puede enviarte:
- "estado del día" → resumen ejecutivo del día
- "alertas" → SKUs en nivel crítico de stock  
- "reporte ventas" → ventas por categoría y mercado
- "plan compras" → recomendaciones próxima temporada
- "ca vs venezuela" → análisis comparativo por mercado
- "liquidar" → qué productos mover urgente para flujo de caja

Responde siempre en español. Sé directo, práctico, sin relleno.`;

// Historial de conversación en memoria (se resetea al reiniciar el servidor)
// Para producción, esto debería guardarse en una base de datos
const conversationHistory = {};

// ─── VERIFICACIÓN DEL WEBHOOK (Meta lo llama 1 vez al configurar) ─────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Token incorrecto");
    res.sendStatus(403);
  }
});

// ─── RECEPCIÓN DE MENSAJES ────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde a Meta de inmediato (requerido en <5s)

  try {
    const entry    = req.body?.entry?.[0];
    const change   = entry?.changes?.[0];
    const message  = change?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const fromNumber = message.from;
    const userText   = message.text.body.trim();

    // Solo responde a Fer (opcional pero recomendado para seguridad)
    if (FER_NUMBER && fromNumber !== FER_NUMBER) {
      console.log(`Mensaje ignorado de número no autorizado: ${fromNumber}`);
      return;
    }

    console.log(`📩 Mensaje de ${fromNumber}: "${userText}"`);

    // Mantener historial por número (últimos 10 mensajes)
    if (!conversationHistory[fromNumber]) conversationHistory[fromNumber] = [];
    conversationHistory[fromNumber].push({ role: "user", content: userText });
    if (conversationHistory[fromNumber].length > 10) {
      conversationHistory[fromNumber] = conversationHistory[fromNumber].slice(-10);
    }

    // Llamar a Claude Haiku (el más barato)
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: MAX_SYSTEM,
        messages: conversationHistory[fromNumber],
      }),
    });

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || "⚠️ Error al procesar. Intenta de nuevo.";

    // Guardar respuesta en historial
    conversationHistory[fromNumber].push({ role: "assistant", content: reply });

    // Enviar respuesta por WhatsApp
    await sendWhatsAppMessage(fromNumber, reply);
    console.log(`✅ Respuesta enviada a ${fromNumber}`);

  } catch (err) {
    console.error("❌ Error en webhook:", err.message);
  }
});

// ─── FUNCIÓN PARA ENVIAR MENSAJES ─────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

// ─── HEALTH CHECK (para que Render sepa que el servidor vive) ─────────────────
app.get("/", (req, res) => {
  res.json({ status: "MAX online", version: "1.0", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🟡 MAX corriendo en puerto ${PORT}`));
