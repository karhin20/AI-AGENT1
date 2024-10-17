require('dotenv').config(); // loads .env variables

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Function to get the Gemini model
const getGeminiModel = () => {
  return genAI.getGenerativeModel({ model: "gemini-pro" });
};

module.exports = { genAI, getGeminiModel };
