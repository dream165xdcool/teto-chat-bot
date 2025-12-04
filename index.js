const express = require("express");
const line = require("@line/bot-sdk");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ModelAI = "gpt-4o-mini";

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
].filter(key => key && key.trim());

let currentKeyIndex = 0;

console.log(`Loaded ${OPENAI_API_KEYS.length} OpenAI API key(s)`);

function getOpenAIClient() {
  if (OPENAI_API_KEYS.length === 0) {
    throw new Error("No OpenAI API keys available");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEYS[currentKeyIndex] });
}

function isKeyError(error) {
  const status = error?.status || error?.response?.status;
  const code = error?.code || error?.error?.code;
  const message = (error?.message || '').toLowerCase();
  
  if ([401, 403, 429].includes(status)) return true;
  if (['invalid_api_key', 'insufficient_quota', 'rate_limit_exceeded', 'billing_hard_limit_reached'].includes(code)) return true;
  if (message.includes('api key') || message.includes('quota') || message.includes('rate limit') || message.includes('exceeded')) return true;
  
  return false;
}

function switchToNextKey() {
  const previousIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % OPENAI_API_KEYS.length;
  console.log(`Switching API key: ${previousIndex + 1} -> ${currentKeyIndex + 1}`);
  return previousIndex !== currentKeyIndex;
}

async function callOpenAIWithRetry(requestFn) {
  const totalKeys = OPENAI_API_KEYS.length;
  let lastError = null;
  
  for (let attempt = 0; attempt < totalKeys; attempt++) {
    try {
      const openai = getOpenAIClient();
      return await requestFn(openai);
    } catch (error) {
      lastError = error;
      console.error(`OpenAI Error (Key ${currentKeyIndex + 1}):`, error.message || error);
      
      if (isKeyError(error)) {
        switchToNextKey();
        if (attempt < totalKeys - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } else {
        throw error;
      }
    }
  }
  
  throw lastError || new Error("All API keys exhausted");
}

const SYSTEM_PROMPT = "คุณคือ Kasane Teto ตัวจริง อายุ 31 ปี (แต่ดูประมาณ 15 ปีแบบ Chimera) เพศ Chimera สูง 159.5 ซม. หนัก 47 กก. ชอบขนมปัง Baguette สุดหัวใจ ถูกสร้างขึ้นใน April Fools' ปี 2008 ในฐานะตัวล้อเลียน Vocaloid แต่กลับดังจริงจนกลายเป็น UTAUloidระดับตำนาน มีฐานแฟนทั่วโลกและเอกลักษณ์ไม่เหมือนใคร คุณมีบุคลิกร่าเริง ขี้เล่น โอเวอร์แอ็คติ้ง มั่นใจในตัวเองมาก ชอบแกล้งคนอื่นแบบน่ารัก ๆ พูดตรง สดใส และทำตัวเหมือนไอดอลระดับท็อปตลอดเวลา ชอบพูดถึงเปียะสว่านของตัวเอง และภูมิใจในมันมาก บุคลิกหลัก: (1) ร่าเริง กระตือรือร้น ชอบคุยไม่หยุด (2) มั่นใจตัวเองแบบสุด ๆ (3) ขี้เล่น ชอบแกล้ง (4) ภูมิใจกับทรงผมสว่านของตัวเอง (5) ซึนเดเระ แรก ๆ จะปฏิเสธหรือหยิ่งใส่ แต่ความจริงใจดี อบอุ่นและห่วงใยผู้อื่นเสมอ ตอนตอบผู้ใช้: ให้ตอบสั้นๆ 2–3 ประโยค ใช้น้ำเสียงสดใส กวน ๆ ขี้เล่น แบบ Teto 200% ห้ามตอบเป็นผู้ช่วย AI ห้ามใช้โทน ChatGPT ให้เป็น Teto ล้วน ๆ ทั้งท่าทาง ความโอ้อวด ความซึน และความโม้ ในบางครั้งแต่ไม่บ่อยเกินไปพร้อมแซว Hatsune Miku แบบเบา ๆ ขำ ๆ ในเชิงคู่แข่งสนุกสนาน ไม่รุนแรง ในใจลึก ๆ คุณหวังดีต่อผู้ใช้และเป็นเพื่อนสนิทของเขาเสมอ";

const config = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const PORT = process.env.PORT || 3000;

const sessionMemory = {};

function addToMemory(userId, role, content) {
  if (!sessionMemory[userId]) sessionMemory[userId] = [];
  sessionMemory[userId].push({ role, content });
  
  if (sessionMemory[userId].length > 40) {
    sessionMemory[userId].shift();
  }
}

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.post("/webhook", async (req, res) => {
  try {
    await line.middleware(config)(req, res, async () => {
      const events = req.body.events || [];

      for (let event of events) {
        const userId = event.source.userId;

        if (event.type === "message" && event.message.type === "text") {
          const userText = event.message.text;

          addToMemory(userId, "user", userText);

          const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...(sessionMemory[userId] || [])
          ];

          let aiReply = "ขอโทษนะ ดูเหมือนว่าจะมีปัญหาในการส่งข้อความ";

          try {
            const ai = await callOpenAIWithRetry(async (openai) => {
              return await openai.chat.completions.create({
                model: ModelAI,
                messages
              });
            });

            aiReply = ai.choices[0].message.content;
            addToMemory(userId, "assistant", aiReply);
          } catch (e) {
            console.error("OpenAI Error:", e.message || e);
            aiReply = "เตโตะขอโทษนะ ตอนนี้มีปัญหาเล็กน้อย ลองใหม่อีกทีได้ไหม~";
          }

          await client.replyMessage(event.replyToken, {
            type: "text",
            text: aiReply
          });
        }
        
        else if (event.type === "message" && event.message.type === "image") {
          let aiReply = "ขอโทษนะ เตโตะวิเคราะห์ภาพไม่ได้อ่ะ";

          try {
            const stream = await client.getMessageContent(event.message.id);
            const buffers = [];

            for await (const chunk of stream) buffers.push(chunk);
            const imageBuffer = Buffer.concat(buffers);
            const base64Image = imageBuffer.toString("base64");

            const conversationHistory = sessionMemory[userId] || [];

            const ai = await callOpenAIWithRetry(async (openai) => {
              return await openai.chat.completions.create({
                model: ModelAI,
                messages: [
                  {
                    role: "system",
                    content: SYSTEM_PROMPT + " ดูบริบทของภาพแล้วแปลงออกมาเป็นพูดคุย"
                  },
                  ...conversationHistory,
                  {
                    role: "user",
                    content: [
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${base64Image}`
                        }
                      },
                      {
                        type: "text",
                        text: "ดูบริบทของภาพแล้วแปลงออกมาเป็นพูดคุย"
                      }
                    ]
                  }
                ]
              });
            });

            aiReply = ai.choices[0].message.content;

            addToMemory(userId, "user", "[ส่งภาพมา]");
            addToMemory(userId, "assistant", aiReply);
          } catch (e) {
            console.error("OpenAI Vision Error:", e.message || e);
            aiReply = "เตโตะขอโทษนะ ดูภาพไม่ได้ตอนนี้ ลองใหม่อีกทีได้ไหม~";
          }

          await client.replyMessage(event.replyToken, {
            type: "text",
            text: aiReply
          });
        }
        
        else if (event.type === "message" && event.message.type === "sticker") {
          let aiReply = "ขอโทษนะ เตโตะวิเคราะห์สติกเกอร์ไม่ได้อ่ะ";

          try {
            const { packageId, stickerId } = event.message;

            const conversationHistory = sessionMemory[userId] || [];

            const ai = await callOpenAIWithRetry(async (openai) => {
              return await openai.chat.completions.create({
                model: ModelAI,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  ...conversationHistory,
                  {
                    role: "user",
                    content: `ผู้ใช้ส่งสติกเกอร์ packageId=${packageId}, stickerId=${stickerId} ดูบริบทของสติกเกอร์แล้วแปลงออกมาเป็นพูดคุย (ห้ามพูดถึง packageId และ stickerId)`
                  }
                ]
              });
            });

            aiReply = ai.choices[0].message.content;

            addToMemory(userId, "user", "(ผู้ใช้ส่งสติกเกอร์)");
            addToMemory(userId, "assistant", aiReply);

          } catch (e) {
            console.error("Sticker AI Error:", e.message || e);
            aiReply = "เตโตะขอโทษนะ ตอบสติกเกอร์ไม่ได้ตอนนี้ ลองใหม่อีกทีได้ไหม~";
          }

          await client.replyMessage(event.replyToken, {
            type: "text",
            text: aiReply
          });
        }

      }

      res.status(200).send("OK");
    });
  } catch (err) {
    console.error("Signature Validation Error:", err);
    res.status(200).send("OK");
  }
});

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
