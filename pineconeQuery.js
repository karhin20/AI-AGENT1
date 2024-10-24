const { queryData } = require('./queryData');

// Example query
const query = "What are your opening hours?";

queryData(query)
  .then((results) => {
    console.log("Query:", query);
    console.log("Results:", results);
  })
  .catch((error) => {
    console.error("Error:", error);
  });