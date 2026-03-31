import express from "express";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const FER_NUMBER     = process.env.FER_NUMBER;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER      = process.env.TWILIO_NUMBER;

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

FORMATO PARA WHATSAPP:
- Respuestas cortas y directas, máximo 300 palabras
- Usa emojis para jerarquía visual
- Nunca uses markdown con ** o ##
- Siempre termina con una acción concreta

COMANDOS ESPECIALES:
- "estado del día" → resumen ejecutivo del día
- "alertas" → SKUs en nivel crítico de stock
- "reporte ventas" → ventas por categoría y mercado
- "plan compras" → recomendaciones próxima temporada
- "liquidar" → qué productos mover urgente

Responde siempre en español.`;

const conversationHistory = {};

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body.Body?.trim();
    const from = req.body.From;

    if (!body || !from) return res.sendStatus(200);

    console.log(`📩 Mensaje de ${from}: "${body}"`);

    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: "user", content: body });
    if (conversationHistory[from].length > 10) {
      conversationHistory[from] = conversationHistory[from].slice(-10);
    }

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
        messages: conversationHistory[from],
      }),
    });

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || "⚠️ Error al procesar. Intenta de nuevo.";

    conversationHistory[from].push({ role: "assistant", content: reply });

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: new URLSearchParams({
        From: TWILIO_NUMBER,
        To: from,
        Body: reply,
      }),
    });

    const twilioData = await twilioRes.json();
    console.log(`✅ Respuesta enviada a ${from}`, twilioData.sid || twilioData.message);

  } catch (err) {
    console.error("❌ Error:", err.message);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.json({ status: "MAX online con Twilio", version: "2.0", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🟡 MAX corriendo en puerto ${PORT}`));
