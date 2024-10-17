const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase, genAI, getGeminiModel } = require('./utils');

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
  
  try {
    const aiReply = await reply(message.Body);
    twiml.message(aiReply);
    res.status(200).type('text/xml');
    res.end(twiml.toString());
  } catch (error) {
    console.error('Error in /incoming route:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(3000, () => {
  console.log('Express server listening on port 3000');
});

app.get('/', (req, res) => {
  res.json('Deployment successful on Vercel!');
});
