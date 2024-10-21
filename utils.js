require('dotenv').config(); // loads .env variables

const { GoogleGenerativeAI } = require('@google/generative-ai');


// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Function to get the Gemini model
const getGeminiModel = () => {
  return genAI.getGenerativeModel({ model: "gemini-pro" });
};

// Export only the necessary utilities that are not initialized in index.js
module.exports = { getGeminiModel };
