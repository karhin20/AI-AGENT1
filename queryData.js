const fetch = require('node-fetch');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_KEY;

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

async function query(data, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large",
        {
          headers: {
            Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify(data),
          timeout: 30000,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (!Array.isArray(result)) {
        throw new Error("Unexpected API response format. Response is not an array.");
      }

      const vectorString = result.join(",");

      return vectorString;
    } catch (error) {
      if (attempt === retries) {
        console.error("Error in query function:", error);
        throw error;
      }
      console.warn(`Request failed. Retrying (attempt ${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay before retrying
    }
  }
}

async function fetchEmbeddingsWithRetry(text, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const vectorString = await query({ inputs: text });
      return vectorString.split(",").map(parseFloat);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

async function queryData(queryText) {
  try {
    const index = pinecone.index('kofi'); // Adjust index name as necessary

    const queryEmbedding = await fetchEmbeddingsWithRetry(queryText);
    const results = await index.namespace("business_info1").query({
      vector: queryEmbedding,
      topK: 3,
      includeValues: false,
      includeMetadata: true,
    });

    return results;
  } catch (error) {
    console.error("Error querying Pinecone:", error);
    throw error;
  }
}

module.exports = {
  queryData,
};
