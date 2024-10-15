const express = require('express');
const { openai, supabase } = require('./utils');

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  })
);

const MessagingResponse = require('twilio').twiml.MessagingResponse;

app.post('/incoming', async (req, res) => {
  const message = req.body;

  const twiml = new MessagingResponse();
  
  const chatMessages = [
    {
      role: 'system',
      content: 'reply to the messages you get in 100 character',
    },
  ];
  
  async function reply(msg) {
    chatMessages.push({
        role: 'user',
        content: msg,
    });
    try {
        const response = await openai.chat.completions.create({
            messages: chatMessages,
            model: 'gpt-3.5-turbo',
            max_tokens: 300,
            temperature: 0.5,
            frequency_penalty: 0.5,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching AI response:', error);
        throw new Error('Failed to get a response from the AI.'); 
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