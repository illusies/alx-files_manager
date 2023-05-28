// A script that creates the Express server that listens
// on port 5000 and routes from file routes/index.js

import express from 'express';

const routes = require('./routes/index');

const app = express();
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.use(express.json());
app.use('/', routes);
export default app;
