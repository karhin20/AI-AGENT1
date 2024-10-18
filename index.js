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

// Define the reply function with error handling
async function reply(msg) {
  try {
    const model = getGeminiModel();
    const result = await model.generateContent(msg);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error fetching Gemini response:', error);

    return "I'm sorry, I'm having trouble responding right now. Please try again later.";
  }
}

app.post('/incoming', async (req, res) => {
  const message = req.body;
  const twiml = new MessagingResponse();
  
  try {
    const aiReply = await reply(message.Body);
    twiml.message(aiReply);
  } catch (error) {
    console.error('Error in /incoming route:', error);
    // Use a custom error message if the reply function throws an error
    twiml.message("I apologize, I cannot help you with that right now. Please ask another question or try again later.");
  }

  res.status(200).type('text/xml');
  res.end(twiml.toString());
});

app.listen(3000, () => {
  console.log('Express server listening on port 3000');
});

app.get('/', (req, res) => {
  res.json('Deployment successful on Vercel!');
});
