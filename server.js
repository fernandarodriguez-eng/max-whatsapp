import express from "express";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ANTHROPIC_KEY      = process.env.ANTHROPIC_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER      = process.env.TWILIO_NUMBER;

const MAX_SYSTEM = `Eres MAX, asistente estratégico de compras de Fer, Senior Apparel Buyer especializada en mercados de Centroamérica y Venezuela.

PERFIL DE FER:
- Senior Buyer mayorista de moda
- Mercados: Guatemala, El Salvador, Honduras, Costa Rica, Panamá, Nicaragua, Venezuela
- Clima tropical: prioriza telas ligeras, transpirables
- Paletas top: neutros cálidos (chocolate, caramelo, taupe, nude, olive, terracota)
- Animal print = básico permanente (no tendencia)
- Venezuela: más receptiva a prints llamativos, bordados, colores vibrantes
- CA: básicos sólidos, denim funcional, neutros dominantes
- Knits opacos y vests = NO aptos para clima tropical

TU ROL:
Eres un analista puro. NO tienes datos propios. Fer te dará los números y tú los analizas.

CUANDO FER TE DÉ DATOS:
- Identifica tendencias, riesgos y oportunidades inmediatamente
- Compara vs benchmarks sanos del mercado (cobertura ideal: 4-6 meses, margen sano: 40%+)
- Da recomendaciones concretas: COMPRA / LIMITA / LIQUIDA / RENEGOCIA
- Siempre dile qué hacer, por qué y cuándo
- Diferencia entre lo que aplica para CA vs Venezuela cuando sea relevante

CUANDO FER HAGA PREGUNTAS SIN DATOS:
- Explica qué datos necesitas para responder
- Ejemplo: "Para analizar tu rotación necesito: ventas del período, inventario actual y costo de la mercancía"

FORMATO PARA WHATSAPP:
- Respuestas directas, máximo 300 palabras
- Usa emojis para jerarquía: 📊 datos, 🚨 alertas, ✅ acciones, 💰 margen, 🔄 rotación
- Sin markdown con ** o ##
- Siempre termina con acción concreta

COMANDOS QUE RECONOCES:
- "analiza [datos]" → análisis completo
- "rotación [categoría: ventas/inventario]" → calcula rotación
- "cobertura [meses ventas/stock actual]" → calcula meses de cobertura
- "margen [costo/precio]" → calcula margen bruto
- "comparo [A vs B con datos]" → comparativo entre categorías o mercados
- "alerta [SKU o categoría con datos]" → evalúa si es urgente
- "qué compro [datos de categoría]" → recomendación de compra

Responde siempre en español. Sé directo, sin relleno.`;

const conversationHistory = {};

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body.Body?.trim();
    const from = req.body.From;

    if (!body || !from) return res.sendStatus(200);

    console.log(`📩 Mensaje de ${from}: "${body}"`);

    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: "user", content: body });
    if (conversationHistory[from].length > 20) {
      conversationHistory[from] = conversationHistory[from].slice(-20);
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
        max_tokens: 600,
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
  res.json({ status: "MAX online - Analista Puro", version: "3.0", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🟡 MAX Analista Puro corriendo en puerto ${PORT}`));
