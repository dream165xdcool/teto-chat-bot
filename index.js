const express = require("express");
const line = require("@line/bot-sdk");
const { OpenAI } = require("openai");

// =====================
// CONFIG
// =====================
const app = express();
const PORT = process.env.PORT || 3000;

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const ModelAI = "gpt-4o-mini";

const SYSTEM_PROMPT = `คุณคือ Kasane Teto ตัวจริง อายุ 31 ปี (แต่ดูประมาณ 15 ปีแบบ Chimera) เพศ Chimera สูง 159.5 ซม. หนัก 47 กก. ชอบขนมปัง Baguette สุดหัวใจ ถูกสร้างขึ้นใน April Fools' ปี 2008 ... (ตามที่คุณกำหนดมา)`;

// =====================
// LOAD MULTIPLE OPENAI KEYS
// =====================
const OPENAI_API_KEYS = [
  process.env.OPENAI_API_KEY_1,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
  process.env.OPENAI_API_KEY_5,
  process.env.OPENAI_API_KEY_6,
  process.env.OPENAI_API_KEY_7,
  process.env.OPENAI_API_KEY_8,
  process.env.OPENAI_API_KEY_9,
  process.env.OPENAI_API_KEY_10,
].filter(k => k);

if (OPENAI_API_KEYS.length === 0) {
  console.error("❌ ERROR: No OpenAI API Keys found!");
  process.exit(1);
}

let currentKeyIndex = 0;
console.log(`🔑 Loaded ${OPENAI_API_KEYS.length} key(s).`);

function getOpenAI() {
  return new OpenAI({ apiKey: OPENAI_API_KEYS[currentKeyIndex] });
}

function isKeyError(err) {
  const msg = (err.message || "").toLowerCase();
  const status = err.status || err.response?.status;
  return (
    [401, 403, 429].includes(status) ||
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("billing") ||
    msg.includes("key")
  );
}

function switchKey() {
  currentKeyIndex = (currentKeyIndex + 1) % OPENAI_API_KEYS.length;
  console.log(`🔁 Switched to API key #${currentKeyIndex + 1}`);
}

// Retry system
async function callOpenAIWithRetry(fn) {
  let lastError;

  for (let i = 0; i < OPENAI_API_KEYS.length; i++) {
    try {
      return await fn(getOpenAI());
    } catch (err) {
      lastError = err;
      console.error("❌ OpenAI error:", err.message);

      if (isKeyError(err)) {
        switchKey();
        await new Promise(res => setTimeout(res, 300));
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error("All API keys failed");
}

// =====================
// LINE SETUP
// =====================
const config = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// ต้องใช้ raw body สำหรับ signature
app.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  line.middleware(config),
  async (req, res) => {

    const events = req.body.events || [];

    for (const event of events) {
      const userId = event.source.userId;

      if (!userId) continue;

      // เก็บ memory per user
      sessionMemory[userId] = sessionMemory[userId] || [];
      const memory = sessionMemory[userId];

      // ============= TEXT MESSAGE =============
      if (event.type === "message" && event.message.type === "text") {
        const userText = event.message.text;
        memory.push({ role: "user", content: userText });

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...memory
        ];

        let aiReply = "ขออภัย มีปัญหานิดหน่อยนะ";

        try {
          const ai = await callOpenAIWithRetry(openai =>
            openai.chat.completions.create({
              model: ModelAI,
              messages
            })
          );

          aiReply = ai.choices[0].message.content;
          memory.push({ role: "assistant", content: aiReply });
        } catch (err) {
          aiReply = "เตโตะมีปัญหานิดหน่อย ลองใหม่อีกทีนะ~";
        }

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiReply
        });

      }

      // ============= IMAGE MESSAGE =============
      else if (event.type === "message" && event.message.type === "image") {
        let aiReply = "เตโตะดูภาพไม่ได้ตอนนี้นะ";

        try {
          const stream = await client.getMessageContent(event.message.id);
          const buffers = [];
          for await (const chunk of stream) buffers.push(chunk);
          const base64 = Buffer.concat(buffers).toString("base64");

          const ai = await callOpenAIWithRetry(openai =>
            openai.chat.completions.create({
              model: ModelAI,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...memory,
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${base64}` }
                    },
                    { type: "text", text: "ช่วยอธิบายภาพนี้แบบ Teto" }
                  ]
                }
              ]
            })
          );

          aiReply = ai.choices[0].message.content;
          memory.push({ role: "assistant", content: aiReply });
        } catch (e) {}

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiReply
        });
      }

      // ============= STICKER MESSAGE =============
      else if (event.type === "message" && event.message.type === "sticker") {
        const { packageId, stickerId } = event.message;
        let aiReply = "เตโตะตีความสติกเกอร์ไม่ได้~";

        try {
          const ai = await callOpenAIWithRetry(openai =>
            openai.chat.completions.create({
              model: ModelAI,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...memory,
                {
                  role: "user",
                  content: `ผู้ใช้ส่งสติกเกอร์ package=${packageId}, id=${stickerId} แปลงอารมณ์สติกเกอร์นี้เป็นข้อความพูดคุย (ห้ามพูดถึงตัวเลขสติกเกอร์)`
                }
              ]
            })
          );

          aiReply = ai.choices[0].message.content;
          memory.push({ role: "assistant", content: aiReply });
        } catch (e) {}

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiReply
        });
      }
    }

    res.status(200).send("OK");
  }
);

// =====================
// ROOT PAGE
// =====================
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => console.log(`🚀 Bot running on port ${PORT}`));


// MEMORY
const sessionMemory = {};
