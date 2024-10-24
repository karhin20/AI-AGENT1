const fetch = require('node-fetch');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

const MODEL = "intfloat/multilingual-e5-large";
const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_KEY;

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

async function fetchEmbeddingsWithRetry(text, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: text }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 503) {
          console.warn(`Model is loading, retrying (${attempt}/${retries})...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          console.error("Error response body:", errorBody);
          throw new Error(`Failed to fetch embeddings: ${response.statusText}`);
        }
      } else {
        return await response.json();
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
    }
  }
}

async function queryData(query) {
  try {
    const index = pinecone.index('kofi'); // Adjust index name as necessary

    const [queryEmbedding] = await fetchEmbeddingsWithRetry(query);
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
