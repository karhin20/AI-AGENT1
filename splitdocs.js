const fs = require('fs');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config(); 

async function query(data) {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large",
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
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
    console.log("API Response:", result);

    if (!Array.isArray(result)) {
      throw new Error("Unexpected API response format. Response is not an array.");
    }

    const vectorString = result.join(",");
    console.log("Vector:", vectorString);
    return vectorString;
  } catch (error) {
    console.error("Error in query function:", error);
    throw error;
  }
}

async function splitdocs() {
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

  const businessInfo = fs.readFileSync('./business_info.txt', 'utf-8');
  const sentences = businessInfo.split('.');
  const data = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const vectorString = await query({ inputs: sentence });
    data.push({ id: `vec${i + 1}`, text: sentence, vector: vectorString });
  }


  const vectors = data.map((d, i) => ({
    id: d.id,
    values: d.vector.split(",").map(parseFloat),
    metadata: { text: d.text }
  }));

  await index.namespace('business_info1').upsert(vectors);

  console.log('Business info embedded and uploaded to Pinecone.');
}

module.exports = splitdocs;
