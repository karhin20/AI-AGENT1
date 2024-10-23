const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

// Initialize Pinecone client
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

async function queryData(query) {
    const model = 'intfloat/multilingual-e5-large'; // Example model, adjust as necessary

    // Fetch embedding for the query
    const embedding = await pc.inference.embed(
        model,
        [query],
        { inputType: 'query' }
    );

    // Initialize the index
    const index = pc.index('kofi'); // Adjust index name as necessary

    // Perform the query using the embedding
    const queryResponse = await index.namespace("business_info1").query({
        topK: 3,
        vector: embedding[0].values,
        includeValues: false,
        includeMetadata: true
    });

    return queryResponse;
}

module.exports = {
    queryData
};
