require('dotenv').config();
const express = require('express');
///const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pinecone } = require('@pinecone-database/pinecone');
const sanitize = require('sanitize-html');
const winston = require('winston');
const { MessagingResponse } = require('twilio').twiml;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const { splitdocs } = require('./splitdocs');
const { queryData } = require('./queryData');

const app = express();
/*const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later."
});

///app.set('trust proxy', true); 

app.use(limiter);*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let vectorStore;

async function setupPinecone() {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }); 
  const indexName = "kofi";
  let index; 

  try {
    index = pinecone.index(indexName);
    console.log(`Index '${indexName}' already exists. Skipping index creation.`);
  } catch (error) {
    if (error.code === 'INDEX_NOT_FOUND') {
      await pinecone.createIndex({
        name: indexName,
        dimension: 1024,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      index = pinecone.index(indexName);
      console.log(`Index '${indexName}' created successfully.`);
    } else {
      throw error;
    }
  }

  return index;
}

const menu = {
  breakfast: [
    { id: 1, name: 'Pancakes', price: 80.99, available: true, allergens: ['gluten', 'dairy'] },
    { id: 2, name: 'Omelette', price: 100.99, available: true, allergens: ['eggs'] },
  ],
  lunch: [
    { id: 3, name: 'Caesar Salad', price: 92.99, available: true, allergens: ['dairy'] },
    { id: 4, name: 'Burger', price: 140.99, available: true, allergens: ['gluten'] },
  ],
  dinner: [
    { id: 5, name: 'Steak', price: 74.99, available: true, allergens: [] },
    { id: 6, name: 'Salmon', price: 60.99, available: true, allergens: ['fish'] },
  ]
};

// Reservation data structure
const reservations = {};

// User orders
const orders = {};

// Loyalty points
const loyaltyPoints = {};

// Function to get current menu based on time
function getCurrentMenu() {
  const hour = new Date().getHours();
  if (hour < 11) return menu.breakfast;
  if (hour < 16) return menu.lunch;
  return menu.dinner;
}

// Function to make a reservation
function makeReservation(userId, date, time, partySize) {
  // Simple capacity check (assume 50 seats total)
  const key = `${date}-${time}`;
  if (!reservations[key]) reservations[key] = 0;
  if (reservations[key] + partySize > 50) {
    throw new Error('Sorry, we are fully booked at that time.');
  }
  reservations[key] += partySize;
  return `Reservation confirmed for ${partySize} people on ${date} at ${time}.`;
}

// Function to place an order
function placeOrder(userId, itemIds) {
  const currentMenu = getCurrentMenu();
  const order = itemIds.map(id => {
    const item = currentMenu.find(i => i.id === id);
    if (!item) throw new Error(`Item with id ${id} not found in current menu.`);
    if (!item.available) throw new Error(`${item.name} is currently unavailable.`);
    return item;
  });
  
  if (!orders[userId]) orders[userId] = [];
  orders[userId].push(order);
  
  // Add loyalty points (1 point per dollar spent)
  const total = order.reduce((sum, item) => sum + item.price, 0);
  if (!loyaltyPoints[userId]) loyaltyPoints[userId] = 0;
  loyaltyPoints[userId] += Math.floor(total);
  
  return `Order placed successfully. Total: GH₵${total.toFixed(2)}. You now have ${loyaltyPoints[userId]} loyalty points.`;
}

// Function to handle customer queries
async function handleCustomerQuery(query, userId) {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: "-Be precise and concise and do not repeat yourself and do not give long answers.\nDo not give information you have not be asked and be professional.\n-You are A Restaurant AI ASSISTANT.\n-Your name is Food AI Kofi.\nGreet customers warmly on their first interaction and ask about their day.\n-Ask them how you can help them\n-You are a restaurant assistant\nWhen a conversation concludes with a goodbye, do not repeat greetings or questions about their day if they return in the same session.",
  });

  const generationConfig = {
    temperature: 0.5,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 200,
    responseMimeType: "text/plain",
  };

  try {
    const results = await queryData(query);

    const context = results.matches.map(match => match.metadata.text).join(' ');

    const prompt = `Context: ${context}\nQuery: ${query}\nResponse:`;

    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [{ text: query }],
        },
        {
          role: "model",
          parts: [{ text: "How can I assist you today?" }],
        },
      ],
    });

    const result = await chatSession.sendMessage(prompt);


    let responseText = result.response.text(); 
    responseText = responseText.trim(); 


    return responseText;
  } catch (error) {
    console.error('Error handling customer query:', error);
    return "I'm sorry, I couldn't process your request. Please try again later.";
  }
}

// Enhanced reply function
async function reply(userId, msg) {
  const lowercaseMsg = msg.toLowerCase().trim();

  // Menu command
  if (lowercaseMsg.startsWith('menu') || 
      lowercaseMsg.includes('show menu') || 
      lowercaseMsg.includes('what can i order') ||
      lowercaseMsg.includes('what\'s available')) {
    const currentMenu = getCurrentMenu();
    const menuPreview = currentMenu.slice(0, 3).map(item => `${item.id}: ${item.name} - GH₵${item.price}`).join('\n');
    return `Here's a preview of our current menu:\n${menuPreview}\n\nView our full menu here: https://yourrestaurant.com/menu Kindly send the number of the food you want to order. `;
  } 
  // Reservation command
  else if (lowercaseMsg.startsWith('reserve') || 
           lowercaseMsg.startsWith('book') || 
           lowercaseMsg.includes('make a reservation')) {
    const parts = msg.split(' ');
    const date = parts.find(part => part.includes('-') || part.includes('/'));
    const time = parts.find(part => part.includes(':'));
    const partySize = parseInt(parts.find(part => !isNaN(part)));
    
    if (!date || !time || isNaN(partySize)) {
      return "I'm sorry, I couldn't understand your reservation request. Please use the format: 'reserve YYYY-MM-DD HH:MM for X people'\n\nOr call us on +233 543 119 117 to make a reservation";
    }

    try {
      return makeReservation(userId, date, time, partySize);
    } catch (error) {
      return error.message;
    }
  } 
  // Order command
  else if (lowercaseMsg.startsWith('order') || 
           lowercaseMsg.startsWith('can i get')) {
    const itemIds = msg.split(' ')
                       .filter(word => !isNaN(word))
                       .map(Number);
    
    if (itemIds.length === 0) {
      return "I'm sorry, I couldn't understand your order. Please specify item numbers from the menu.\n\nView our menu by sending 'menu'";
    }
    
    try {
      return placeOrder(userId, itemIds);
    } catch (error) {
      return error.message;
    }
  } 
  // Loyalty points command
  else if (lowercaseMsg.includes('points') || 
           lowercaseMsg.includes('loyalty') || 
           lowercaseMsg.includes('rewards')) {
    return `You have ${loyaltyPoints[userId] || 0} loyalty points.\n\nLearn more about our loyalty program: https://yourrestaurant.com/loyalty`;
  } 
  // Help command
  else if (lowercaseMsg.includes('help') || 
           lowercaseMsg.includes('what can you do') || 
           lowercaseMsg === 'commands') {
    return `I can assist you with the following:\n\n- View the menu: Say 'menu' or 'what can I order?'\n- Make a reservation: Say 'reserve [date] [time] for [number] people'\n- Place an order: Say 'order' followed by item numbers\n- Check loyalty points: Say 'points' or 'loyalty'\n- Ask about our restaurant: Just ask your question!\n\nFor more information, visit our website: [Restaurant Website](https://yourrestaurant.com).`;
  } 
  // General query
  else {
    return await handleCustomerQuery(msg, userId);
  }
}

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

app.post('/incoming', async (req, res) => {
  const message = req.body;
  const userId = message.From; // Assuming 'From' contains the userId

  logger.info(`Received message from ${userId}: ${JSON.stringify(message)}`); // Log the entire message object

  const twiml = new MessagingResponse();
  
  try {
    if (!message.Body) {
      throw new Error("Message body is undefined");
    }
    const sanitizedMessage = sanitize(message.Body);
    const aiReply = await reply(userId, sanitizedMessage);
    twiml.message(aiReply);

    logger.info(`Processed message for ${userId}: ${message.Body}`);
  } catch (error) {
    console.error(`Error in /incoming route for ${userId}:`, error);
    twiml.message("I apologize, but I'm experiencing technical difficulties. Please try again later.");

    logger.error(`Error processing message from ${userId}: ${message.Body}`, { error: error.message });
  }

  res.status(200).type('text/xml');
  res.end(twiml.toString());
});


app.get('/', (req, res) => {
  res.json('Deployment successful on Vercel!');

});

(async () => {
  try {
    console.log('Setting up Pinecone...');
    vectorStore = await setupPinecone();
    if (!vectorStore) {
      console.error('Failed to set up Pinecone index. Some functionality may be limited.');
    } else {
      console.log('Pinecone index set up successfully.');
    }
    console.log('Pinecone setup complete, initializing other components...');

    // Correctly call the splitdocs function
    await splitdocs();



    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    console.log('Server start command issued.');
  } catch (error) {
    console.error('Error during server startup:', error);
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
})();
