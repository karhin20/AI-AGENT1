require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pinecone } = require('@pinecone-database/pinecone');
const { TextLoader } = require('langchain/document_loaders/fs/text');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const sanitize = require('mongo-sanitize');
const winston = require('winston');

const app = express();

// Rate limiting setup
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});

// Apply rate limiting to all routes
app.use(limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MessagingResponse = require('twilio').twiml.MessagingResponse;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// Create or target an index
async function setupPinecone() {
  try {
    const existingIndexes = await pinecone.listIndexes();
    console.log("Existing indexes:", existingIndexes);

    const indexExists = existingIndexes.indexes.some(index => index.name === 'quick-start');

    if (!indexExists) {
      await pinecone.createIndex({
        name: 'quick-start',
        dimension: 1536,
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
      });
      console.log("Pinecone index created successfully.");
    } else {
      console.log("Pinecone index 'quick-start' already exists. Continuing with existing index.");
    }
  } catch (error) {
    console.error('Error setting up Pinecone index:', error);
    return null;
  }
  return pinecone.index('quick-start');
}

let vectorStore;

console.log('Starting server...');

// Initialize vector store
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
    
    // Here you can add any other async initialization if needed
    // For example:
    // await initializeOtherComponents();
    
    console.log('All components initialized, starting Express server...');
    
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
    console.log('Server start command issued.');
  } catch (error) {
    console.error('Error during server startup:', error);
  }
})();

async function handleCustomerQuery(query) {
  if (!vectorStore) {
    console.error('Vector store is not available. Unable to process query.');
    return "I'm sorry, but I'm currently unable to process your query. Please try again later.";
  }
  
  try {
    // Get embeddings for the query
    const queryEmbedding = await getEmbeddings(query);
    
    // Search the vector store for relevant information
    const searchResults = await vectorStore.query({
      vector: queryEmbedding[0], // Assuming getEmbeddings returns an array
      topK: 3,
      includeMetadata: true
    });

    // Extract relevant context from search results
    const context = searchResults.matches
      .map(match => match.metadata.text)
      .join('\n\n');

    // Prepare the prompt for Gemini
    const prompt = `You are an AI assistant for a restaurant. Use the following context to answer the customer's question. If the context doesn't contain relevant information, use your general knowledge about restaurants to provide a helpful response.

Context:
${context}

Customer Question: ${query}

Your response should be friendly, concise, and directly address the customer's question. If you're unsure or the information isn't available, politely say so and offer to help with something else.

Response:`;

    // Generate response using Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error handling customer query:', error);
    return "I apologize, but I'm having trouble processing your request right now. Is there something else I can help you with, like showing you our menu or making a reservation?";
  }
}

const API_KEY = process.env.HUGGINGFACE_API_KEY;
const API_URL = 'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2';

// Function to get embeddings using Hugging Face with fetch
async function getEmbeddings(text) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: text })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Error fetching embeddings: ${error.message}`);
  }
}

// Initialize VectorStore with business information
async function initializeVectorStore() {
  const loader = new TextLoader("./business_info.txt");
  const docs = await loader.load();
  
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const splitDocs = await textSplitter.splitDocuments(docs);

  const index = pinecone.Index('quick-start');
  
  // Batch embedding generation and storage
  const embeddings = await Promise.all(splitDocs.map(doc => getEmbeddings(doc.pageContent)));
  const operations = embeddings.map((embedding, index) => ({
    id: splitDocs[index].metadata.source || Math.random().toString(36).substring(7),
    values: embedding,
    metadata: { text: splitDocs[index].pageContent }
  }));
  await index.upsert(operations);

  return index;
}

// Sample menu data structure
const menu = {
  breakfast: [
    { id: 1, name: 'Pancakes', price: 8.99, available: true, allergens: ['gluten', 'dairy'] },
    { id: 2, name: 'Omelette', price: 10.99, available: true, allergens: ['eggs'] },
  ],
  lunch: [
    { id: 3, name: 'Caesar Salad', price: 12.99, available: true, allergens: ['dairy'] },
    { id: 4, name: 'Burger', price: 14.99, available: true, allergens: ['gluten'] },
  ],
  dinner: [
    { id: 5, name: 'Steak', price: 24.99, available: true, allergens: [] },
    { id: 6, name: 'Salmon', price: 22.99, available: true, allergens: ['fish'] },
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
  
  return `Order placed successfully. Total: $${total.toFixed(2)}. You now have ${loyaltyPoints[userId]} loyalty points.`;
}

// Function to handle customer queries
async function handleCustomerQuery(query) {
  if (!vectorStore) {
    vectorStore = await initializeVectorStore();
  }
  
  const queryEmbedding = await getEmbeddings(query);
  const searchResults = await vectorStore.query({
    vector: queryEmbedding,
    topK: 2,
    includeMetadata: true
  });

  const context = searchResults.matches.map(match => match.metadata.text).join('\n');
  
  const prompt = `Context: ${context}\n\nQuestion: ${query}\n\nAnswer:`;
  
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating content:', error);
    return "I'm sorry, I couldn't process your request. Please try again later.";
  }
}

// Enhanced reply function
async function reply(userId, msg) {
  try {
    const lowercaseMsg = msg.toLowerCase().trim();

    // Menu command
    if (lowercaseMsg.startsWith('menu') || 
        lowercaseMsg.includes('show menu') || 
        lowercaseMsg.includes('what can i order') ||
        lowercaseMsg.includes('what\'s available')) {
      const currentMenu = getCurrentMenu();
      const menuPreview = currentMenu.slice(0, 3).map(item => `${item.id}: ${item.name} - $${item.price}`).join('\n');
      return `Here's a preview of our current menu:\n${menuPreview}\n\nView our full menu here: https://yourrestaurant.com/menu`;
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
        return "I'm sorry, I couldn't understand your reservation request. Please use the format: 'reserve YYYY-MM-DD HH:MM for X people'\n\nOr make a reservation online: https://yourrestaurant.com/reservations";
      }
      
      return makeReservation(userId, date, time, partySize);
    } 
    
    // Order command
    else if (lowercaseMsg.startsWith('order') || 
             lowercaseMsg.startsWith('i want') || 
             lowercaseMsg.startsWith('can i get')) {
      const itemIds = msg.split(' ')
                         .filter(word => !isNaN(word))
                         .map(Number);
      
      if (itemIds.length === 0) {
        return "I'm sorry, I couldn't understand your order. Please specify item numbers from the menu.\n\nView our menu and order online: https://yourrestaurant.com/order";
      }
      
      return placeOrder(userId, itemIds);
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
      return `I can help you with the following:
      - View the menu: Say 'menu' or 'what can I order?'
      - Make a reservation: Say 'reserve [date] [time] for [number] people'
      - Place an order: Say 'order' followed by item numbers
      - Check loyalty points: Say 'points' or 'loyalty'
      - Ask about our restaurant: Just ask your question!

      For more information, visit our website: https://yourrestaurant.com`;
    }
    
    
    // If no specific command is recognized, treat it as a general query
    else {
      return await handleCustomerQuery(msg);
    }
  } catch (error) {
    console.error('Error in reply function:', error);
    return "I'm sorry, an error occurred while processing your request. Please try again or visit our support page: https://yourrestaurant.com/support";
  }
}

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

app.post('/incoming', async (req, res) => {
  const message = sanitize(req.body);
  const userId = message.From; // Using phone number as userId
  const twiml = new MessagingResponse();
  
  logger.info(`Received message from ${userId}: ${message.Body}`);
  
  try {
    const aiReply = await reply(userId, message.Body);
    twiml.message(aiReply);
    logger.info(`Sent reply to ${userId}: ${aiReply}`);
  } catch (error) {
    logger.error(`Error in /incoming route for ${userId}:`, error);
    twiml.message("I apologize, but I'm experiencing technical difficulties. Please try again later.");
  }

  res.status(200).type('text/xml');
  res.end(twiml.toString());
});

// Move these to the end of the file
app.get('/', (req, res) => {
  res.json('Deployment successful on Vercel!');
});
