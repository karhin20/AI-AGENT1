const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase, getGeminiModel } = require('./utils');

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  })
);

const MessagingResponse = require('twilio').twiml.MessagingResponse;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Define the reply function
async function reply(msg) {
  try {
    const model = getGeminiModel();
    const result = await model.generateContent(msg);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error fetching Gemini response:', error);
    throw new Error(`Failed to get a response from Gemini: ${error.message}`);
  }
}

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
