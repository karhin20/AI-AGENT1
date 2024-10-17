const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('./utils');

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  })
);

const MessagingResponse = require('twilio').twiml.MessagingResponse;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.post('/incoming', async (req, res) => {
  const message = req.body;

  const twiml = new MessagingResponse();
  
  const chatMessages = [
    {
      role: 'user',
      parts: ['reply to the messages you get in 100 characters'],
    },
  ];
  
  async function reply(msg) {
    chatMessages.push({
      role: 'user',
      parts: [msg],
    });
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const chat = model.startChat({
        history: chatMessages,
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.5,
        },
      });
      const result = await chat.sendMessage(msg);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error fetching Gemini response:', error);
      throw new Error('Failed to get a response from Gemini.'); 
    }
  }
 
  const aiReply = await reply(message.Body);

  twiml.message(aiReply);
  res.status(200).type('text/xml');
  res.end(twiml.toString());
});

app.listen(3000, () => {
  console.log('Express server listening on port 3000');
});

app.get('/', (req, res) => {
  res.json('Deployment successful on Vercel!');
});